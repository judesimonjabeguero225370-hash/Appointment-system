# Qorvena – appointment management

Sign up, add an appointment, and get an **email confirmation** right away plus a **reminder email** before it starts.
No roles: everyone has their own private list. React + Vite front end, Google Apps Script + Google Sheets back end.

```
api/apps-script.js    Vercel proxy to Apps Script (keeps your API key private)
appsscript/Code.gs    Backend: accounts, appointments, email reminders
src/App.jsx           Sign-in + appointments interface
src/About.jsx         "About the name" + creators section
src/Brand.jsx         Logo
src/fx.js             Button ripples + card spotlight effects
public/logo.svg|png   Brand logo (site favicon + PNG used inside emails)
public/team/          Creator photos (uniform 720×720 crops; untouched originals in team-originals/)
src/api.js            API client
src/styles.css        Styles + animations
```

## Set up (10 minutes)

1. **Sheet + script** – create a Google Sheet → *Extensions → Apps Script* → paste `appsscript/Code.gs`.
2. **Run `setup()`** once and approve the permissions (Sheets, send email, triggers). This creates the tabs and starts a timer that checks for due reminders every 5 minutes.
3. **Test email** – run `sendTestEmail()`; you should get an email.
4. **Deploy** – *Deploy → New deployment → Web app* → Execute as **Me**, access **Anyone** → copy the Web app URL.
5. **Vercel** – add env var `APPS_SCRIPT_URL` (the URL above). Optional: set an `API_KEY` Script Property in Apps Script and the same value as `APPS_SCRIPT_API_KEY` in Vercel.

6. **(Optional) Links in emails** – add Script Property `APP_URL` = your website address (e.g. `https://qorvena.vercel.app`). Emails then get an "Open Qorvena" button and a "Meet the team" link.
7. **Preview the emails** – run `sendPreviewEmails()` in Apps Script to receive the booked, updated, reminder and reset-code emails in your inbox.

After changing `Code.gs`, redeploy: *Deploy → Manage deployments → Edit → New version*.

### Good to know
- **Email limits:** a free Gmail account can send ~100 emails/day via Apps Script (Google Workspace ~1,500). Emails come from the Google account that owns the script.
- **Time zones:** each appointment remembers the time zone of the browser that booked it, so reminders fire at the right moment.
- **Reminder accuracy:** reminders go out within ~5 minutes of the chosen time.
- **Turn off public sign-up:** add Script Property `ALLOW_SIGNUP` = `false`.
- **Coming from the old FacultyFlow sheet?** Use a new Google Sheet (the columns changed). Old `Services`, `Staff` and `PasswordResetRequests` tabs aren't used any more.

## Local development
```
pnpm install && pnpm dev      # runs in demo mode (no emails) unless VITE_APPS_SCRIPT_URL is set
```

## Name & creators
"About the Name QORVENA" and the creators section live in `src/About.jsx` (open from the **About** link, or `/#about`). `/#team` opens the page already scrolled to the creators, which is what **Meet the creators** uses. Team Facebook links are in the `TEAM` list at the top of that file.
To change a name, role or photo, edit the `TEAM` list at the top of that file; photos are in `public/team/`.
