'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  RotateCw,
  Trash2,
  TriangleAlert,
  ExternalLink,
} from 'lucide-react';
import { Shell } from '@/components/shell';
import { Score, Status } from '@/components/score';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { downloadCsv } from '@/lib/files';
import type { Paper } from '@/lib/types';
function Detail({ id }: { id: string }) {
  const router = useRouter();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const data = await api<Paper>(`/papers/${id}`);
        if (!active) return;
        setPaper(data);
        setError('');
        if (data.status === 'pending' || data.status === 'checking')
          timer = setTimeout(load, config.pollMs);
      } catch (error) {
        if (active) setError((error as Error).message);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, refresh]);
  async function action(kind: 'recheck' | 'delete') {
    setBusy(true);
    try {
      await api(`/papers/${id}${kind === 'recheck' ? '/recheck' : ''}`, {
        method: kind === 'delete' ? 'DELETE' : 'POST',
      });
      if (kind === 'delete') router.push('/');
      else setRefresh((value) => value + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        href="/"
        className="muted mb-6 inline-flex items-center gap-2 text-sm"
      >
        <ArrowLeft size={16} />
        All papers
      </Link>
      {error && (
        <div className="alert mb-4" role="alert">
          {error}
          <button
            className="ml-3 underline"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {paper ? (
        <>
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="muted text-xs uppercase tracking-widest">
                {paper.subject || 'Test paper'}
              </p>
              <h1 className="mt-1 break-all text-2xl font-bold">
                {paper.file_name}
              </h1>
              <div className="mt-3">
                <Status paper={paper} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn"
                disabled={paper.status !== 'done'}
                onClick={() => downloadCsv(paper)}
              >
                <Download size={15} />
                CSV
              </button>
              <button
                className="btn"
                disabled={
                  busy ||
                  paper.status === 'pending' ||
                  paper.status === 'checking'
                }
                onClick={() => void action('recheck')}
              >
                <RotateCw size={15} />
                Re-check
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={15} />
                Delete
              </button>
            </div>
          </header>
          {confirm && (
            <div className="surface mb-5 p-5" role="alert">
              <p className="font-semibold">
                Delete this paper and its results?
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => setConfirm(false)}
                >
                  Keep paper
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void action('delete')}
                >
                  Delete permanently
                </button>
              </div>
            </div>
          )}
          {paper.status === 'error' && (
            <p className="alert mb-5" role="alert">
              {paper.error_message}
            </p>
          )}
          <div className="grid items-start gap-6 xl:grid-cols-[.85fr_1.15fr]">
            <section className="surface overflow-hidden xl:sticky xl:top-6">
              <div className="divider flex items-center justify-between p-4">
                <h2 className="text-sm font-bold">Original paper</h2>
                {paper.preview_url && (
                  <a
                    className="btn"
                    href={paper.preview_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={14} />
                    Open
                  </a>
                )}
              </div>
              {paper.preview_url &&
                (paper.file_path?.endsWith('.pdf') ? (
                  <iframe
                    title={`Original PDF: ${paper.file_name}`}
                    src={paper.preview_url}
                    className="h-[65vh] w-full"
                  />
                ) : (
                  <img
                    src={paper.preview_url}
                    alt={`Uploaded solved test paper: ${paper.file_name}`}
                    className="max-h-[75vh] w-full object-contain"
                  />
                ))}
              <p className="muted p-3 text-xs">
                Private preview link expires after one hour. Refresh to renew.
              </p>
            </section>
            <div>
              {paper.status === 'done' ? (
                <>
                  <section className="surface mb-5 flex flex-wrap items-center justify-between gap-5 p-6">
                    <div>
                      <p className="muted text-xs uppercase tracking-widest">
                        Total marks
                      </p>
                      <Score paper={paper} large />
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        {paper.results?.length || 0} questions checked
                      </p>
                      <p className="muted mt-1 text-xs">
                        {paper.results?.filter((q) => q.confidence === 'low')
                          .length || 0}{' '}
                        with low confidence
                      </p>
                    </div>
                  </section>
                  <h2 className="mb-3 font-bold">Question by question</h2>
                  {paper.results?.map((q) => {
                    const correct = q.marks === q.out_of;
                    const partial = q.marks > 0 && !correct;
                    return (
                      <article className="surface mb-4 p-5" key={q.q}>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span
                            className={`pill ${correct ? 'good' : partial ? 'warn' : 'bad'}`}
                          >
                            {correct ? '✓' : partial ? '◐' : '✗'} Question {q.q}
                          </span>
                          <div className="flex items-center gap-2">
                            {q.confidence === 'low' && (
                              <span
                                className="pill warn"
                                title="AI is uncertain about this question"
                              >
                                <TriangleAlert size={12} />
                                Low confidence
                              </span>
                            )}
                            <span className="text-sm font-bold">
                              {q.marks} / {q.out_of}
                            </span>
                          </div>
                        </div>
                        <h3 className="whitespace-pre-wrap break-words text-sm font-semibold">
                          {q.question}
                        </h3>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div
                            className="rounded-lg p-3"
                            style={{ background: 'var(--bg)' }}
                          >
                            <p className="muted mb-1 text-[10px] font-bold uppercase tracking-wider">
                              Student’s answer
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {q.student_answer || 'No answer given'}
                            </p>
                          </div>
                          <div
                            className="rounded-lg p-3"
                            style={{ background: 'var(--tint)' }}
                          >
                            <p className="muted mb-1 text-[10px] font-bold uppercase tracking-wider">
                              Correct answer
                            </p>
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {q.correct_answer}
                            </p>
                          </div>
                        </div>
                        <p className="muted mt-3 whitespace-pre-wrap break-words text-xs">
                          {q.reason}
                        </p>
                      </article>
                    );
                  })}
                  <p className="muted mt-4 text-xs">
                    AI can make mistakes. Review low-confidence answers before
                    using marks for final assessments.
                  </p>
                </>
              ) : (
                <section className="surface p-10 text-center">
                  <h2 className="font-bold">
                    {paper.status === 'error'
                      ? 'Let’s give it another look'
                      : 'A little thinking is underway…'}
                  </h2>
                  <p className="muted mt-2 text-sm">
                    {paper.status === 'error'
                      ? 'Try a clearer scan, or re-check if the service was busy.'
                      : 'We’re reading the questions, solving them and checking each answer. This page updates automatically.'}
                  </p>
                </section>
              )}
            </div>
          </div>
        </>
      ) : (
        !error && <p role="status">Loading your paper…</p>
      )}
    </>
  );
}
export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Shell>
      <Detail id={id} />
    </Shell>
  );
}
