'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCheck,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

function subscribeTheme(callback: () => void) {
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', callback);
  window.addEventListener('storage', callback);
  window.addEventListener('autocheck-theme', callback);
  return () => {
    media.removeEventListener('change', callback);
    window.removeEventListener('storage', callback);
    window.removeEventListener('autocheck-theme', callback);
  };
}
function currentTheme() {
  const value = localStorage.getItem('theme');
  return value
    ? value === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
}
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-icon">
        <CheckCheck size={23} />
      </span>
      <span className="nav-label">
        AutoCheck<span style={{ color: 'var(--accent)' }}>.</span>
      </span>
    </Link>
  );
}
export function ThemeButton() {
  // Theme is external browser state; subscribe instead of duplicating it.
  const dark = useSyncExternalStore(subscribeTheme, currentTheme, () => false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return (
    <button
      className="btn"
      aria-label={dark ? 'Use light mode' : 'Use dark mode'}
      onClick={() => {
        localStorage.setItem('theme', dark ? 'light' : 'dark');
        window.dispatchEvent(new Event('autocheck-theme'));
      }}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void Promise.resolve()
      .then(async () => {
        if (!active) return;
        const client = supabase();
        const { data: subscription } = client.auth.onAuthStateChange(
          (event, session) => {
            if (
              event === 'SIGNED_OUT' ||
              (event === 'TOKEN_REFRESHED' && !session)
            )
              router.replace('/login');
          },
        );
        unsubscribe = () => subscription.subscription.unsubscribe();
        const { data, error } = await client.auth.getSession();
        if (!active) return;
        if (error) throw error;
        if (!data.session) {
          router.replace('/login');
          return;
        }
        setEmail(data.session.user.email || 'Teacher');
        setReady(true);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router]);
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <nav className="mt-12">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold"
            style={{ background: 'var(--tint)', color: 'var(--accent)' }}
          >
            <LayoutDashboard size={18} />
            <span className="nav-label">My papers</span>
          </Link>
        </nav>
        <div
          className="side-info mt-auto rounded-xl p-4"
          style={{ background: 'var(--bg)' }}
        >
          <ShieldCheck size={20} style={{ color: 'var(--accent)' }} />
          <p className="mt-2 text-xs font-bold">Your classroom, private.</p>
          <p className="muted mt-1 text-xs">
            Your papers are only visible to you.
          </p>
        </div>
        <div className="account mt-6">
          <p className="nav-label mb-3 truncate text-xs muted" title={email}>
            {email}
          </p>
          <div className="flex gap-2">
            <ThemeButton />
            <button
              className="btn"
              aria-label="Sign out"
              onClick={async () => {
                const { error } = await supabase().auth.signOut();
                if (error) setError(error.message);
                else router.replace('/login');
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : ready ? (
          children
        ) : (
          <p role="status" className="muted">
            Opening your workspace…
          </p>
        )}
      </main>
    </>
  );
}
