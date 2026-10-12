import { LoaderCircle } from 'lucide-react';
import type { Paper } from '@/lib/types';
export function Status({ paper }: { paper: Paper }) {
  return paper.status === 'done' ? (
    <span className="pill good">✓ Checked</span>
  ) : paper.status === 'error' ? (
    <span className="pill bad">Needs attention</span>
  ) : (
    <span className="pill purple">
      <LoaderCircle size={12} className="spin" />
      Checking…
    </span>
  );
}
export function Score({
  paper,
  large = false,
}: {
  paper: Paper;
  large?: boolean;
}) {
  const percent = paper.out_of
    ? Math.round(((paper.total || 0) / paper.out_of) * 100)
    : 0;
  const color =
    percent >= 80 ? '#19845b' : percent >= 50 ? '#bb841c' : '#cf5353';
  return (
    <div>
      <p
        style={{ fontSize: large ? 48 : 16, fontWeight: 750, lineHeight: 1.3 }}
      >
        {paper.total ?? '—'}
        <span
          className="muted"
          style={{ fontSize: large ? 22 : 12, fontWeight: 400 }}
        >
          {' '}
          / {paper.out_of ?? '—'}
        </span>
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full"
        style={{ background: 'var(--line)' }}
        role="meter"
        aria-label="Paper score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          style={{ width: `${percent}%`, height: '100%', background: color }}
        />
      </div>
    </div>
  );
}
