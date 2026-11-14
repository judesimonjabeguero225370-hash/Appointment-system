# Daymark Appointment Scheduling System

A complete appointment scheduling starter with a responsive React/Vite frontend, Google Apps Script API, and Google Sheets database. Vercel hosts the frontend and a small serverless proxy; Google Sheets remains the only application database.

## Project structure

```text
appointments/
├── api/apps-script.js       # Vercel serverless proxy to Apps Script
├── appsscript/Code.gs       # Paste into the bound Google Apps Script project
├── public/manus-routes.json # Route manifest used by the managed preview
├── src/App.jsx              # Dashboard and management flows
├── src/api.js               # API client and local demo data
├── src/styles.css           # Responsive Soft Clinic design system
├── index.html
├── package.json
└── README.md
```

## Features included

- Responsive overview dashboard with upcoming, confirmed, pending, and completed metrics.
- Appointment creation, editing, status changes, cancellation, searching, and filtering.
- Conflict protection so an active staff appointment cannot be double-booked at the same time.
- Service management with duration, price, description, and active/inactive state.
- Staff management with contact details, role, and active/inactive state.
- Google Sheets schema creation and Apps Script CRUD API.
- Optional API key protection between the Vercel proxy and Apps Script.
- Local demo data so the frontend can be previewed before Google setup is complete.

## 1. Create the Google Sheet database

1. Create a new Google Sheet.
2. Open **Extensions → Apps Script**.
3. Delete the starter code and paste the complete contents of [`appsscript/Code.gs`](./appsscript/Code.gs).
4. If the script is bound to the Sheet, run the `setup` function once from the Apps Script editor and approve the permissions.
5. The script creates these tabs and headers:

   - `Appointments`: `id`, `customerName`, `customerEmail`, `customerPhone`, `serviceId`, `staffId`, `date`, `time`, `status`, `notes`, `createdAt`, `updatedAt`
   - `Services`: `id`, `name`, `duration`, `price`, `active`, `description`, `createdAt`, `updatedAt`
   - `Staff`: `id`, `name`, `email`, `role`, `active`, `createdAt`, `updatedAt`

6. Add at least one active service and one active staff member, or use the frontend management screens after deployment.

### Optional: use an unbound Apps Script project

If the Apps Script project is not bound to the Sheet, open **Project Settings → Script properties** and add:

```text
SPREADSHEET_ID = your_google_sheet_id
```

The Sheet ID is the long value between `/d/` and `/edit` in the Sheet URL.

## 2. Deploy Apps Script as the backend API

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone**.
5. Deploy and copy the Web app URL. It normally ends in `/exec`.
6. If you use an API key, add a Script property named `API_KEY` with a long random value. The Vercel proxy will send it server-side.

The API accepts JSON POST requests such as:

```json
{
  "action": "getDashboard",
  "data": {}
}
```

The response shape is:

```json
{
  "success": true,
  "data": {
    "appointments": [],
    "services": [],
    "staff": []
  }
}
```

Available actions include `getDashboard`, `listAppointments`, `createAppointment`, `updateAppointment`, `cancelAppointment`, `listServices`, `createService`, `updateService`, `listStaff`, `createStaff`, and `updateStaff`.

## 3. Run the frontend locally

Install dependencies and start Vite:

```bash
pnpm install
pnpm dev
```

Without configuration, the app displays safe demo data. To call Apps Script directly during local development, create `.env.local`:

```text
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

For production, prefer the Vercel proxy described below so the Apps Script URL and optional API key are not exposed in the browser.

## 4. Push to GitHub and deploy on Vercel

1. Create a GitHub repository.
2. Commit and push this project.
3. In Vercel, select **Add New → Project**, import the GitHub repository, and keep the Vite defaults.
4. Add these Vercel Environment Variables:

```text
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
APPS_SCRIPT_API_KEY=the_same_value_as_your_optional_API_KEY
```

5. Deploy. The browser calls `/api/apps-script`, and the Vercel function forwards the request to Apps Script. Apps Script reads and writes the Google Sheet.

The data flow is:

```text
Browser → Vercel frontend → /api/apps-script → Apps Script Web App → Google Sheets
```

Vercel is not used as the database in this setup. It only hosts the UI and proxy function.

## Security and production notes

- Do not put `APPS_SCRIPT_API_KEY` in a `VITE_` variable. Variables prefixed with `VITE_` are included in browser code.
- Set an `API_KEY` Script property before sharing the app publicly. Redeploy the Apps Script Web App after changing deployment access settings.
- Google Sheets is a good fit for a small or moderate internal system. For high traffic, complex reporting, or strict transactional requirements, migrate the same records to PostgreSQL later.
- The app preserves an appointment record when rescheduling or canceling by updating its fields and status rather than deleting it.
