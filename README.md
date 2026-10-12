# AutoCheck

A teacher uploads a solved paper; Gemini reads the original PDF or photo, solves
the questions independently, and checks the answers. No answer keys, question
generation, or manual grading. Next.js 16 + TypeScript + Tailwind frontend;
FastAPI backend; Supabase Auth, Postgres and private Storage.

## 1. Create free service accounts

1. Create a project at [Supabase](https://supabase.com/dashboard). In its SQL editor,
   run `supabase/schema.sql` once. It creates the papers table, indexes, private
   bucket, read-only owner RLS, upload limiter and durable queue functions.
2. In Project Settings → API Keys, copy the project URL and **publishable** key
   into the frontend's `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Copy a **secret** key into the backend's
   `SUPABASE_SECRET_KEY`. Legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SERVICE_ROLE_KEY` values are also supported. The publishable key
   cannot replace the backend secret key. Never commit real `.env` files.
3. Enable email auth in Authentication → Providers. Email confirmation is
   supported. Production email delivery may require your own SMTP provider;
   Supabase's built-in email service has restrictive limits.
4. For Google login, create an OAuth web client in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   add Supabase's displayed callback URL as an authorized redirect URI, then put
   the client ID and secret in Supabase's Google provider settings.
5. Under Authentication → URL Configuration, set Site URL to your frontend URL;
   allow `http://localhost:3000/login` for development and
   `https://YOUR-VERCEL-DOMAIN/login` for production.
6. Get a Gemini key at [Google AI Studio](https://aistudio.google.com/apikey).
   The default model is `gemini-2.5-flash`; availability and free quotas depend on
   your region and account. Keep billing disabled if you require zero charges.
   Review [Gemini pricing and data terms](https://ai.google.dev/gemini-api/docs/pricing)
   before submitting student information to a free-tier model.

## 2. Run locally

Install Node.js 22+ and Python 3.12+. From the project root:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Fill .env with your actual service credentials.
uvicorn app.main:app --reload --port 8000
```

On macOS/Linux use `source .venv/bin/activate` and `cp` instead of `Copy-Item`.
Open a second terminal:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
# Fill the Supabase URL and publishable key. API URL defaults to localhost:8000.
npm run dev
```

Visit [localhost:3000](http://localhost:3000), create an account, confirm your
email, and upload a real solved paper. `http://localhost:8000/docs` documents the
API. All data endpoints require the Supabase access token as a bearer JWT.
`/health` is deliberately public for hosting health checks.

## 3. Deploy on free tiers

1. Push this repository to your Git provider.
2. In Render, create a Blueprint from `render.yaml`, or a **free web service**
   with root `backend`, Python 3.12, build `pip install -r requirements.txt`,
   and start `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1`.
   Add the backend environment variables from `.env.example`.
3. In Vercel, import the repo, set Root Directory to `frontend`, select Next.js,
   and set its public URL, publishable key and API URL variables. `NEXT_PUBLIC_API_URL` is
   your Render HTTPS URL. Deploy.
4. Set Render's `FRONTEND_ORIGIN` to the exact Vercel origin (no path or trailing
   slash), restart the service, and update the Supabase auth redirect allowlist
   and Site URL. Rebuild Vercel after changing any `NEXT_PUBLIC_*` variable.
5. Verify sign-in, a real upload, a checked result, a preview, CSV, re-check and
   deletion. Sign in as another user and verify the first user's paper ID
   returns 404. These live checks require your configured accounts.

Render free services sleep after 15 idle minutes and have cold starts. The worker
runs inside the web service because continuously running dedicated background
workers are not free. Jobs persist in Postgres and resume when the web service
wakes; keeping a dashboard open with pending jobs polls the API. An interrupted
job is reclaimed after its 10-minute lease expires. Free hosting cannot promise
continuous unattended processing or a production availability SLA. See
[Render's free-service limits](https://render.com/docs/free).

## Checks

```powershell
cd backend
pytest -q
ruff check app tests
black --check app tests
cd ../frontend
npm run typecheck
npm run lint
npm run format:check
npm run build
```

API tests use a mocked storage/database boundary, real FastAPI routing and actual
JPEG decoding. Grading tests cover validation, blank/non-paper detection,
clamping, partial marks, totals, duplicate question numbers and unexpected keys.
Tests do not spend Gemini quota. Production credentials are never required for them.

Verified in this workspace: **31 backend tests pass**, Ruff and Black pass,
frontend ESLint and Prettier pass, TypeScript checks pass, and the Next.js 16.4
production build passes. The installed frontend dependency audit reports zero
vulnerabilities. The tests also verify early rejection of oversized request
bodies, including streamed uploads without Content-Length. Live Supabase email
auth settings, server credentials, the queue and Gemini 3.8 Flash generation
have been verified. A real uploaded paper was read from private storage, graded
and saved successfully. Google OAuth is currently disabled in the configured
project's settings and remains unverified. Interactive
browser/visual QA has not been run here.

For new Gemini accounts that reject `gemini-2.5-flash` with a 404, set
`GEMINI_MODEL=gemini-3.8-flash` in the backend environment. The local configuration
uses that replacement based on the provider's response; the default remains
configurable. See [Gemini's current model guide](https://ai.google.dev/gemini-api/docs/latest-model).

To check your saved local service configuration without printing keys, run
`python scripts/check_connections.py` from `backend/`. This checks Supabase Auth,
the papers table, server credentials, and a minimal Gemini generation request.
The script also needs `SUPABASE_PUBLISHABLE_KEY` in `backend/.env` for its public
auth diagnostic; the backend itself uses only the server key.

## Implementation notes

- Uploads return HTTP 202 after private storage and the queue row are saved,
  without waiting for Gemini. File content is checked with Pillow/pypdf, size is
  capped at 10 MB, and locked/empty PDFs or PDFs over 100 pages are rejected.
  Multipart bodies are bounded before parsing, including streamed requests.
- The server computes SHA-256 from the submitted bytes. The unique per-user
  index handles concurrent duplicate uploads. Images are EXIF-rotated, resized
  to 1600px and JPEG encoded at 85% in the browser before hashing on the server.
- One globally claimed job runs at a time. A claim token prevents a stale job
  overwriting a newer check. Leases recover crashed processes. A minimum 12-second
  interval and exponential backoff with jitter help respect free quotas.
- JSON mode uses a Pydantic schema; invalid results retry twice. Empty results
  give an actionable non-paper error. All question marks are clamped, and totals
  are calculated locally. NaN/Infinity and duplicate question numbers fail.
  Gemini receives its own compatible transport schema; the stricter Pydantic
  models validate returned JSON locally. A regression test runs through the
  actual SDK serializer to catch unsupported schema constraints.
- Each API request verifies the JWT with Supabase Auth. Owner filters protect
  every paper operation, RLS protects direct reads, storage is private, and all
  mutations require the server role. An atomic database limit permits 30 upload
  or re-check attempts per user per hour, including failed/duplicate attempts.
  Opaque `sb_secret_` keys are sent only in the `apikey` header; legacy service-role
  JWTs also use the Authorization header. Browser keys never authorize queue writes.
- The frontend polls every two seconds only while any of the user's papers
  are pending. Lists paginate at 20 rows. A signed preview URL expires in one hour.
- AI text is rendered as React text, never HTML. CSV cells neutralize formulas.
- Limits live in `backend/app/config.py` and `frontend/lib/config.ts`. Storage's
  corresponding hard limit is in SQL. `/config` exposes server upload/list limits
  for clients. Keep the browser and storage values aligned if customizing limits.

## Known limits

- AI may misread handwriting, diagrams, ambiguous marks and complex layouts.
  Review feedback, especially low-confidence questions, before final assessments.
  A confidence flag is a model judgment, not a calibrated probability.
- Gemini free quotas and model availability can change. High-volume use needs
  an appropriate paid deployment; quota exhaustion surfaces a re-check error.
- Large papers can exceed model output limits despite the 100-page upload cap.
  Split long tests into smaller documents. Each upload is checked independently;
  pages in separate images are not combined into one paper.
- Resize/compression can lose tiny writing. Use a readable scan or PDF if needed.
  Different encodings of the same photo have different hashes. Duplicates with
  an error return that error; use the explicit re-check button to try again.
- The worker assumes service credentials and schema are correctly configured.
  Live Gemini, Supabase RLS/SQL and OAuth must be validated in your own project.
- Student papers go to Supabase and Google. Get appropriate school consent and
  follow applicable privacy requirements. Free-tier availability, storage,
  email delivery and processing are limited by the providers.
- No accounts or hosting are provisioned by this source package. A free-tier
  configuration is supported; unlimited usage or uninterrupted uptime is not.

## Source layout

```text
frontend/app/             Login, dashboard, detail and global styling
frontend/components/      Shell, theme, uploader, score and status
frontend/lib/             Auth client, API transport, image preparation, CSV
backend/app/              Config, API, storage adapter, validation and worker
backend/tests/            Grading and API tests
supabase/schema.sql       Database, RLS, storage and durable queue
render.yaml               Free Render web-service deployment
```
#   A i _ e x a m _ c h e c k  
 