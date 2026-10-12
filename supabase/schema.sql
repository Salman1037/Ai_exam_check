-- Run once in the Supabase SQL editor. Private files are backend-managed.
create extension if not exists pgcrypto;

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_hash text not null check (file_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending','checking','done','error')),
  subject text,
  total numeric,
  out_of numeric,
  results jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  unique (user_id, file_hash)
);
create index papers_user_created on public.papers(user_id, created_at desc);
-- The UNIQUE constraint above creates the required (user_id,file_hash) index.
create index papers_queue on public.papers(status, created_at) where status in ('pending','checking');
alter table public.papers enable row level security;
create policy "Read own papers" on public.papers for select to authenticated using (auth.uid() = user_id);
-- Clients cannot manipulate grading, queue state or file paths directly.
revoke all on public.papers from anon, authenticated;
grant select on public.papers to authenticated;
grant all on public.papers to service_role;

create table public.upload_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.upload_limits enable row level security;
revoke all on public.upload_limits from anon, authenticated;

create function public.consume_upload(owner_id uuid, hourly_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  insert into public.upload_limits(user_id, window_start, attempts)
  values(owner_id, now(), 1)
  on conflict(user_id) do update set
    attempts = case when public.upload_limits.window_start <= now() - interval '1 hour'
      then 1 else public.upload_limits.attempts + 1 end,
    window_start = case when public.upload_limits.window_start <= now() - interval '1 hour'
      then now() else public.upload_limits.window_start end
  returning attempts <= hourly_limit into allowed;
  return allowed;
end $$;

create function public.claim_paper(lease_seconds integer default 600)
returns setof public.papers language plpgsql security definer set search_path = '' as $$
declare chosen uuid;
begin
  -- Serialize claims globally so multiple web instances still use one AI worker.
  perform pg_advisory_xact_lock(810241);
  if exists(select 1 from public.papers where status = 'checking' and lease_until > now()) then
    return;
  end if;
  select id into chosen from public.papers
    where status = 'pending' or (status = 'checking' and (lease_until is null or lease_until <= now()))
    order by created_at for update skip locked limit 1;
  if chosen is null then return; end if;
  return query update public.papers set status = 'checking',
    lease_until = now() + make_interval(secs => lease_seconds), lease_token = gen_random_uuid()
    where id = chosen returning *;
end $$;

create function public.finish_paper(paper_id uuid, claim_token uuid, grade jsonb, failure text)
returns void language sql security definer set search_path = '' as $$
  update public.papers set
    status = case when failure is null then 'done' else 'error' end,
    subject = grade->>'subject', total = (grade->>'total')::numeric,
    out_of = (grade->>'out_of')::numeric, results = grade->'results',
    error_message = failure, checked_at = now(), lease_until = null, lease_token = null
  where id = paper_id and lease_token = claim_token and status = 'checking';
$$;

revoke all on function public.consume_upload(uuid, integer) from public, anon, authenticated;
revoke all on function public.claim_paper(integer) from public, anon, authenticated;
revoke all on function public.finish_paper(uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.consume_upload(uuid, integer) to service_role;
grant execute on function public.claim_paper(integer) to service_role;
grant execute on function public.finish_paper(uuid, uuid, jsonb, text) to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('papers', 'papers', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No browser storage policies: the authenticated backend authorizes every operation
-- and issues short-lived preview URLs. Never put the service role in the frontend.
