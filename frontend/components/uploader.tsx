'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Camera, UploadCloud, FileCheck2, LoaderCircle, X } from 'lucide-react';
import { config } from '@/lib/config';
import { prepareFile } from '@/lib/files';
import { upload } from '@/lib/api';
type Entry = {
  id: number;
  name: string;
  progress: number;
  status: string;
  error?: string;
  paperId?: string;
};
export function Uploader({ onUploaded }: { onUploaded: () => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const [drag, setDrag] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  function update(id: number, patch: Partial<Entry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  async function add(files: FileList | null) {
    if (!files) return;
    const pending = Array.from(files).map((file) => ({
      file,
      id: counter.current++,
    }));
    setEntries((current) => [
      ...current,
      ...pending.map(({ file, id }) => ({
        id,
        name: file.name,
        progress: 0,
        status: 'Preparing…',
      })),
    ]);
    // Sequential uploads avoid memory spikes when several phone photos are selected.
    for (const { file, id } of pending) {
      try {
        const prepared = await prepareFile(file);
        update(id, { status: 'Uploading…' });
        const result = await upload(prepared, (progress) =>
          update(id, { progress }),
        );
        update(id, {
          progress: 100,
          paperId: result.paper.id,
          status: result.duplicate
            ? result.paper.status === 'done'
              ? 'Saved result ready'
              : 'Already uploaded'
            : 'Uploaded',
        });
        onUploaded();
      } catch (error) {
        update(id, {
          status: 'Upload failed',
          error: (error as Error).message,
        });
      }
    }
  }
  return (
    <section className="surface p-5 sm:p-7" aria-labelledby="upload-title">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="upload-title" className="text-base font-bold">
          Let’s check a paper
        </h2>
        <span className="pill purple">AI powered</span>
      </div>
      <div
        className={`dropzone ${drag ? 'active' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          void add(event.dataTransfer.files);
        }}
      >
        <div
          className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl"
          style={{ background: 'var(--tint)', color: 'var(--accent)' }}
        >
          <UploadCloud size={27} />
        </div>
        <p className="text-lg font-bold">Drop your solved papers here</p>
        <p className="muted mt-1 text-sm">
          Questions + student answers. We’ll take it from here.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            className="btn primary"
            onClick={() => picker.current?.click()}
          >
            <UploadCloud size={16} />
            Choose files
          </button>
          <button className="btn" onClick={() => camera.current?.click()}>
            <Camera size={16} />
            Take a photo
          </button>
        </div>
        <p className="muted mt-4 text-xs">
          PDF, JPG, PNG, WEBP · Up to 10 MB each · Multiple files welcome
        </p>
        <input
          ref={picker}
          className="hidden"
          type="file"
          accept={config.accept}
          multiple
          aria-label="Choose test papers"
          onChange={(event) => {
            void add(event.target.files);
            event.target.value = '';
          }}
        />
        <input
          ref={camera}
          className="hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          aria-label="Photograph test paper"
          onChange={(event) => {
            void add(event.target.files);
            event.target.value = '';
          }}
        />
      </div>
      <div aria-live="polite">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="mt-3 rounded-lg p-3"
            style={{ background: 'var(--bg)' }}
          >
            <div className="flex items-center gap-2 text-xs">
              {entry.error ? (
                <X size={15} />
              ) : entry.progress === 100 ? (
                <FileCheck2 size={15} />
              ) : (
                <LoaderCircle size={15} className="spin" />
              )}
              {entry.paperId ? (
                <Link
                  className="min-w-0 flex-1 truncate underline"
                  href={`/papers/${entry.paperId}`}
                >
                  {entry.name}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              )}
              <span>{entry.status}</span>
              <button
                aria-label={`Dismiss ${entry.name}`}
                disabled={!entry.error && entry.progress !== 100}
                onClick={() =>
                  setEntries((current) =>
                    current.filter((item) => item.id !== entry.id),
                  )
                }
              >
                <X size={14} />
              </button>
            </div>
            {entry.error ? (
              <p className="mt-1 text-xs text-red-500" role="alert">
                {entry.error}
              </p>
            ) : (
              <progress
                className="mt-2 h-1 w-full"
                max={100}
                value={entry.progress}
                aria-label={`Uploading ${entry.name}`}
              />
            )}
          </div>
        ))}
      </div>
      <p className="muted mt-4 flex items-start gap-2 text-xs">
        <FileCheck2 size={15} className="shrink-0" />
        No answer key needed. AutoCheck reads the questions, solves them, and
        checks each answer.
      </p>
    </section>
  );
}
