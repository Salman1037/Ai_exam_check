# Responsive UI verification

Reviewed the login, dashboard, uploader, navigation, paper preview and grading cards. Fixed narrow-screen heading sizes, tablet account-button overflow, long answer wrapping, question badge wrapping, delete confirmation wrapping and pagination wrapping. Buttons and password/upload controls have at least 44px touch targets; form fields use 16px text to avoid mobile browser input zoom.

The browser regression check covers 320, 375, 600, 768, 900, 1024, 1280 and 1440px viewports, light and dark themes, long filenames and unbroken answers, low-confidence badges, delete confirmation, password visibility and a sample PDF preview. It asserts the page has no horizontal overflow and saves screenshots for inspection. Auth and paper responses are isolated browser fixtures; no real user records are accessed or changed.

Run from the repository root, after installing frontend dependencies and downloading the samples:

```powershell
npm install --prefix deployment/ui-tools --no-save --package-lock=false playwright
python scripts/download_sample_papers.py
# In another terminal, start frontend with npm run dev.
$env:UI_TEST_URL='http://127.0.0.1:3000'
node scripts/check_responsive.cjs
```

The script uses installed Microsoft Edge with a fresh temporary browser profile. Screenshots are under `deployment/ui-checks`, excluded from Git. Set UI_TEST_URL to the port actually serving this workspace. Fixtures use this project's Supabase storage key; adapt it when testing a different Supabase project.

Browser resizing is not a physical-device test: camera behavior, Safari's PDF viewer and mobile virtual keyboards still need checks on actual phones. This verification does not test live OAuth or Gemini grading. After pushing these changes, redeploy Vercel to update the public site.
