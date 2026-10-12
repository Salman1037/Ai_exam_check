'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CheckCheck, Eye, EyeOff } from 'lucide-react';
import { Brand, ThemeButton } from '@/components/shell';
import { supabase } from '@/lib/supabase';
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signup, setSignup] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void Promise.resolve()
      .then(async () => {
        if (!active) return;
        const client = supabase();
        const callback = new URLSearchParams(window.location.hash.slice(1));
        const query = new URLSearchParams(window.location.search);
        if (callback.has('error') || query.has('error')) {
          setError(
            'Google sign-in was cancelled or could not finish. Please try again.',
          );
          window.history.replaceState(null, '', '/login');
        }
        const { data } = client.auth.onAuthStateChange((_, session) => {
          if (session) router.replace('/');
        });
        unsubscribe = () => data.subscription.unsubscribe();
        const { data: auth, error } = await client.auth.getSession();
        if (!active) return;
        if (error) throw error;
        if (auth.session) router.replace('/');
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [router]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const auth = supabase().auth;
      const { data, error } = signup
        ? await auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: window.location.origin + '/login' },
          })
        : await auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (data.session) router.replace('/');
      else
        setMessage('Check your email to confirm your account, then sign in.');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function google() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      // Check provider availability before navigating away from the app.
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`,
        {
          headers: {
            apikey:
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
              '',
          },
        },
      );
      if (!response.ok)
        throw new Error('Could not connect to sign-in. Please try again.');
      const settings = await response.json();
      if (!settings.external?.google) {
        throw new Error(
          'Google sign-in is not enabled yet. Please use email while the administrator completes Google setup.',
        );
      }
      const { error } = await supabase().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login',
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) throw error;
    } catch (error) {
      setError((error as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-6xl px-6 py-7">
      <header className="flex items-center justify-between">
        <Brand />
        <ThemeButton />
      </header>
      <main className="grid min-h-[80vh] items-center gap-14 py-12 md:grid-cols-2">
        <div>
          <span className="pill purple">Made for the everyday teacher</span>
          <h1 className="mt-6 text-5xl font-bold leading-[1.13] tracking-tight">
            Give your time
            <br />
            back to teaching<span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
          <p className="muted mt-6 max-w-sm text-lg">
            Turn a stack of solved papers into clear marks and helpful feedback.
            Just upload, and let AutoCheck do the checking.
          </p>
          <div className="mt-8 space-y-3 text-sm">
            {[
              'Photos, handwriting and PDFs welcome',
              'No answer keys. No manual grading.',
              'Clear feedback for every question',
            ].map((text) => (
              <p key={text} className="flex items-center gap-3">
                <CheckCheck size={18} style={{ color: 'var(--accent)' }} />
                {text}
              </p>
            ))}
          </div>
        </div>
        <section className="surface mx-auto w-full max-w-md p-7 sm:p-10">
          <h2 className="text-2xl font-bold">
            {signup ? 'Your classroom starts here' : 'Welcome back'}
          </h2>
          <p className="muted mt-1 text-sm">
            {signup
              ? 'Create your free AutoCheck account.'
              : 'Sign in to your marking workspace.'}
          </p>
          <button
            className="btn mt-7 w-full"
            disabled={busy}
            onClick={() => void google()}
          >
            Continue with Google
          </button>
          <div className="muted my-5 flex items-center gap-3 text-xs">
            <span
              className="h-px flex-1"
              style={{ background: 'var(--line)' }}
            />
            or use email
            <span
              className="h-px flex-1"
              style={{ background: 'var(--line)' }}
            />
          </div>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <label className="block text-sm font-semibold">
              Email address
              <input
                className="field"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <div className="text-sm font-semibold">
              <label htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  className="field pr-12"
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls="password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {signup && (
                <p className="muted mt-2 text-xs font-normal">
                  Use at least 8 characters. Your paper history is saved to your
                  account.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="alert text-sm">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm good rounded-lg p-3">
                {message}
              </p>
            )}
            <button className="btn primary w-full" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="muted mt-6 text-center text-sm">
            {signup ? 'Already have an account?' : 'New to AutoCheck?'}{' '}
            <button
              className="font-bold"
              disabled={busy}
              style={{ color: 'var(--accent)' }}
              onClick={() => {
                setSignup(!signup);
                setError('');
                setMessage('');
                setShowPassword(false);
              }}
            >
              {signup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </section>
      </main>
    </div>
  );
}
