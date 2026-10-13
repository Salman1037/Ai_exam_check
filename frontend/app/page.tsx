'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  FileText,
  ChevronRight,
  Sparkles,
  CheckCheck,
  Clock3,
} from 'lucide-react';
import { Shell } from '@/components/shell';
import { Uploader } from '@/components/uploader';
import { Score, Status } from '@/components/score';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import type { PaperList } from '@/lib/types';

function Dashboard() {
  const [data, setData] = useState<PaperList>({
    papers: [],
    has_more: false,
    has_pending: false,
  });
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => {
    setLoading(true);
    setRefresh((value) => value + 1);
  }, []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await api<PaperList>(`/papers?page=${page}`);
        if (!alive) return;
        setData(result);
        setError('');
        if (result.has_pending) timer = setTimeout(load, config.pollMs);
      } catch (error) {
        if (alive) {
          setError((error as Error).message);
          // Recover pending checks after a temporary connection failure.
          if (data.has_pending) timer = setTimeout(load, config.pollMs * 3);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [page, refresh, data.has_pending]);
  const checked = data.papers.filter((p) => p.status === 'done').length;
  return (
    <>
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="muted mb-1 text-xs font-semibold uppercase tracking-[.18em]">
            Your teaching workspace
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Less marking. More teaching.
          </h1>
          <p className="muted mt-2 text-sm">
            A fresh perspective on every answer, in just a few moments.
          </p>
        </div>
        <span className="desktop-label pill purple mt-2">
          <Sparkles size={13} />
          Meet your marking assistant
        </span>
      </header>
      <div className="mb-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: 'Papers on this page',
            value: data.papers.length,
            icon: FileText,
          },
          { label: 'Checked on this page', value: checked, icon: CheckCheck },
          {
            label: 'In progress on this page',
            value: data.papers.filter(
              (p) => p.status === 'checking' || p.status === 'pending',
            ).length,
            icon: Clock3,
          },
        ].map((item) => (
          <div className="surface flex items-center gap-4 p-5" key={item.label}>
            <div
              className="rounded-xl p-3"
              style={{ color: 'var(--accent)', background: 'var(--tint)' }}
            >
              <item.icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold leading-tight">{item.value}</p>
              <p className="muted text-xs">{item.label}</p>
            </div>
          </div>
        ))}
      </div>
      <Uploader
        onUploaded={() => {
          setPage(1);
          reload();
        }}
      />
      <section
        className="surface mt-7 overflow-hidden"
        aria-labelledby="papers-title"
      >
        <div className="divider flex items-center justify-between p-5 sm:px-6">
          <div>
            <h2 id="papers-title" className="font-bold">
              Your paper history
            </h2>
            <p className="muted mt-1 text-xs">
              Saved to your account. Return anytime to see your papers and
              results.
            </p>
          </div>
          <button className="btn" onClick={reload} disabled={loading}>
            Refresh <ArrowUpRight size={14} />
          </button>
        </div>
        {error && (
          <div className="m-5 alert" role="alert">
            {error}
          </div>
        )}
        {loading && (
          <p className="muted px-6 py-3 text-xs" role="status">
            Loading papers…
          </p>
        )}
        {!loading && !data.papers.length && !error ? (
          <div className="px-5 py-14 text-center">
            <FileText className="muted mx-auto mb-3" size={32} />
            <p className="font-semibold">Your first paper is a drop away</p>
            <p className="muted mt-1 text-sm">
              Upload a solved paper above. Your results will appear here.
            </p>
          </div>
        ) : (
          data.papers.map((paper) => (
            <Link
              key={paper.id}
              href={`/papers/${paper.id}`}
              className="paper-row divider"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="rounded-xl p-3"
                  style={{ background: 'var(--bg)', color: 'var(--accent)' }}
                >
                  <FileText size={19} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {paper.file_name}
                  </p>
                  <p className="muted truncate text-xs">
                    {paper.subject ||
                      (paper.status === 'error'
                        ? 'Needs attention — open for details'
                        : 'Reading your paper')}
                  </p>
                </div>
              </div>
              <span className="paper-status">
                <Status paper={paper} />
              </span>
              <span className="paper-score">
                {paper.status === 'done' ? (
                  <Score paper={paper} />
                ) : (
                  <span className="muted text-sm">—</span>
                )}
              </span>
              <span className="paper-date muted text-xs">
                {new Date(paper.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <ChevronRight className="row-chevron muted" size={16} />
            </Link>
          ))
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <p className="muted text-xs">
            Page {page} · Up to {config.pageSize} papers per page
          </p>
          <div className="flex gap-2">
            <button
              className="btn"
              disabled={page === 1 || loading}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </button>
            <button
              className="btn"
              disabled={!data.has_more || loading}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <p className="muted mt-6 text-center text-xs">
        A thoughtful second pair of eyes. Always review uncertain answers.
      </p>
    </>
  );
}
export default function Page() {
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}
