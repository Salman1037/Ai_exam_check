# Enable Google sign-in

AutoCheck already uses Supabase's Google OAuth flow. Supabase's publishable and secret keys do not enable Google by themselves. A project administrator must configure a Google OAuth client once.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), select or create a project, and configure the app name, support email, and audience. If the app is in testing mode, add the Google accounts that will test it.
2. Under Clients, create an OAuth client with application type **Web application**.
3. Add this exact **Authorized redirect URI**:

   `https://lzzyjkksxwzdxjhytsqb.supabase.co/auth/v1/callback`

4. In [Supabase Authentication providers](https://supabase.com/dashboard/project/lzzyjkksxwzdxjhytsqb/auth/providers), open Google, enable it, enter the Google client ID and client secret, and save. Store these credentials in Supabase, not in frontend code.
5. In Supabase Authentication → URL Configuration, allow `http://localhost:3000/login` and your deployed frontend's `/login` URL. Set Site URL to the deployed frontend origin when deploying. If testing with `127.0.0.1`, allow `http://127.0.0.1:3000/login` too.
6. Return to AutoCheck, click Continue with Google, select your account, and confirm that the dashboard opens. Sign out and sign in again to confirm your saved papers appear.

Check provider availability without spending Gemini quota:

```powershell
cd backend
python scripts/check_connections.py --auth-only
```

The app checks provider availability before leaving the login screen and displays an actionable message if Google is disabled. Complete the actual browser login after enabling the provider; a settings check alone does not verify the complete OAuth flow.

Paper history is stored in Supabase Postgres under the authenticated user's ID. It survives sign-out, browser restarts, and deployment. Signing into a different account can show a different history; deleting a paper removes it. History contains the saved current result, not previous versions of a re-check.

Official instructions: https://supabase.com/docs/guides/auth/social-login/auth-google
