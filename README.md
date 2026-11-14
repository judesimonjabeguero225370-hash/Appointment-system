# FacultyFlow Appointment Scheduler

FacultyFlow is a teacher-focused appointment scheduling system for a university Computer Science department. It is designed as a stronger fourth-year Computer Science project: the frontend is a responsive React/Vite application, the backend is a Google Apps Script Web App, and Google Sheets is the database.

The system has three roles:

- **Administrator:** manages users, teachers, advising types, and all appointments.
- **Teacher:** sees and manages appointments assigned to their linked teacher profile.
- **Student:** signs in, books appointments with teachers, and sees their own appointments.

Passwords are never stored in plain text. Apps Script stores salted SHA-256 password hashes, and the API issues expiring session tokens stored in the `Sessions` sheet.

## Project structure

```text
appointments/
├── api/apps-script.js       # Vercel serverless proxy to Apps Script
├── appsscript/Code.gs       # Google Apps Script API, auth, roles, and Sheets CRUD
├── public/manus-routes.json # Route manifest used by preview tooling
├── src/App.jsx              # Role-based FacultyFlow interface
├── src/api.js               # Session-aware API client and local demo data
├── src/styles.css           # Responsive visual system and auth screens
├── index.html
├── package.json
└── README.md
```

## Google Sheets schema

Run `setup()` once. The script creates these tabs:

- `Appointments`: appointment records. The existing database names `customerName` and `staffId` are used internally; the interface presents them as **student** and **teacher**.
- `Services`: advising types such as thesis advising, capstone consultation, and code review clinic.
- `Staff`: teacher profiles.
- `Users`: login accounts, roles, password hashes, departments, and teacher-profile links.
- `Sessions`: expiring login tokens.

## 1. Connect Apps Script to Google Sheets

1. Create or open the Google Sheet that will be your database.
2. Open **Extensions → Apps Script** from that Sheet. This creates a bound Apps Script project, which is the easiest setup.
3. Replace the starter code with the complete contents of [`appsscript/Code.gs`](./appsscript/Code.gs).
4. Save and run the `setup()` function once. Approve the requested permissions.

If you created a standalone Apps Script project at `script.google.com`, open **Project Settings → Script properties** and add:

```text
SPREADSHEET_ID = your_google_sheet_id
```

The Sheet ID is the long value between `/d/` and `/edit` in the Sheet URL. Save the property before running `setup()`.

## 2. Create the first administrator

After `setup()` finishes, create an administrator from the Apps Script editor. Run the function with your own values:

```javascript
function createMyFirstAdmin() {
  return createAdminUser(
    "admin@university.edu",
    "ChangeThisPassword123!",
    "System Administrator",
    "Computer Science"
  );
}
```

Save that helper, select `createMyFirstAdmin`, run it once, and then remove the helper function from the script. The password must have at least eight characters. Use the generated administrator account to create teacher and student accounts in the **Users & roles** screen.

For teacher accounts, select the matching teacher profile in **Teacher account link**. That link is how the API limits a teacher to their own appointments.

## 3. Deploy the Apps Script API

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Deploy and copy the Web App URL ending in `/exec`.
6. Optional but recommended: add a Script property named `API_KEY` with a long random value. The Vercel proxy will send it server-side, so it is not exposed in browser code.

The API supports `login`, `me`, `getDashboard`, appointment CRUD, service CRUD, teacher CRUD, `listUsers`, `createUser`, and `updateUser`. Protected actions require a valid session token, and administrator actions also require the administrator role.

After changing `Code.gs`, create a new Apps Script deployment version:

**Deploy → Manage deployments → Edit → New version → Deploy**

## 4. Run locally

```bash
pnpm install
pnpm dev
```

Without production configuration, the app runs with faculty-focused demo data and a local demo administrator session. To call Apps Script directly during local development, create `.env.local`:

```text
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

For a real deployment, use the Vercel proxy instead of exposing the Apps Script URL in the browser.

## 5. Deploy to GitHub and Vercel

Push the project to GitHub and import the repository into Vercel. Add these Vercel Environment Variables:

```text
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=the_same_value_as_your_optional_API_KEY
```

The production flow is:

```text
Student / Teacher / Admin browser
        ↓
Vercel React frontend
        ↓
/api/apps-script serverless proxy
        ↓
Google Apps Script Web App
        ↓
Google Sheets
```

Vercel does not store the application records. It hosts the interface and forwards authenticated requests to Apps Script.

## Why this is suitable for a fourth-year project

The project separates the presentation layer, API transport, business rules, authentication, authorization, and persistence layer. It demonstrates salted password hashing, expiring sessions, role-based authorization, teacher-profile linking, conflict detection for double booking, input validation, optimistic UI updates, and deployment configuration. Google Sheets remains appropriate for a small department or prototype; a later production version could migrate the same logical schema to PostgreSQL.
