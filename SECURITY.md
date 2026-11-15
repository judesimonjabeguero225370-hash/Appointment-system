# Qorvena security guide

## What protects the system

**Sign-in and passwords**
- Passwords are salted and hashed 1,000 times (`v2$` format). Older passwords are upgraded automatically the next time that person signs in.
- Wrong passwords are throttled per email *and* per network address, for customers and admins. Password reset codes are random, expire after 15 minutes and allow 5 tries.
- Passwords are limited to 8-128 characters; very common passwords are rejected. Admin passwords need 10+ characters.
- Session tokens are stored only as a hash in the `Sessions` sheet, so a leaked sheet cannot be used to sign in. Resetting a password or deactivating a user signs them out everywhere.

**Admin portal**
- The starting `admin` / `admin` login only opens a "choose a new password" screen (15-minute session). Nothing else in the admin portal works until the password is changed. (Switch off with `FORCE_ADMIN_PASSWORD_CHANGE = false` in `Code.gs` for private testing only.)
- Admin sessions last 8 hours, live in the browser tab only, and end after 15 minutes without activity.

**The website and API**
- `api/apps-script.js` only forwards a fixed list of actions, limits request size, rate-limits by visitor address, refuses requests from other websites, hides internal error details and never caches replies.
- `vercel.json` adds security headers: HTTPS-only (HSTS), a Content-Security-Policy, no framing (clickjacking), no MIME sniffing, a strict referrer policy and a locked-down permissions policy.
- Unexpected backend errors are written to the Apps Script log and shown to people as a generic message.

**Your data**
- Anything saved to the sheet that starts with `=`, `+`, `-` or `@` is stored as plain text, so nobody can plant a spreadsheet formula through a title, note or name.
- Names, titles and notes have length limits, hidden control characters are removed, and each person can hold at most 300 appointments.
- Emails escape every piece of user text.

## Steps only you can do (about 5 minutes)

1. **Backend:** paste the new `appsscript/Code.gs` into Apps Script, then *Deploy > Manage deployments > Edit > New version*. Everyone will need to sign in once more.
2. **Lock the backend to your website:** in Apps Script run `generateApiKey()` and read the key in *Execution log*. Save it twice:
   - Apps Script > Project Settings > Script Properties > `API_KEY`
   - Vercel > Settings > Environment Variables > `APPS_SCRIPT_API_KEY` (then redeploy)

   Until both are set, anyone who finds your Apps Script link can call the backend directly and skip the website's protections.
3. **Do not set `VITE_APPS_SCRIPT_URL` in Vercel.** That makes the browser talk to Apps Script directly: it exposes the link and skips the API key. Keep `APPS_SCRIPT_URL` (server-side only).
4. **First admin sign-in:** sign in at `/#admin` with `admin` / `admin` and choose your own password when asked.
5. **Keep the Google Sheet private.** Share it with nobody except people who truly need it; it holds every account.
6. If something on the site stops loading after the security headers go live (for example a Tag Manager tag), rename `Content-Security-Policy` to `Content-Security-Policy-Report-Only` in `vercel.json` to find the blocked address in the browser console, then add it to the policy.

## Honest limits
- Apps Script has no bcrypt/argon2, so the hashing is as strong as that platform allows; a long, unique password still matters most. You can raise `PASSWORD_ROUNDS` in `Code.gs` if sign-in stays fast.
- Throttling uses Apps Script's cache, which is best-effort rather than a firewall.
- The customer session is kept in the browser (as is common for single-page apps); signing out or a password reset ends it everywhere.
- Account creation says when an email already has an account. That helps real users but lets someone check whether an email is registered.
