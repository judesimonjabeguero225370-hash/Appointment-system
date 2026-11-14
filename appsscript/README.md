# FacultyFlow Google Apps Script backend

Paste `Code.gs` into a Google Apps Script project connected to the Google Sheet database. Run `setup()` once. It creates `Appointments`, `Services`, `Staff`, `Users`, and `Sessions` sheets.

Create the first administrator from the Apps Script editor by defining and running a temporary helper:

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

Remove the helper after running it. The password is salted and hashed by the backend. Administrators can then create teacher and student accounts from the Users & roles screen. Link teacher accounts to their Staff profile so the API can scope teacher appointments correctly.

If the project is standalone rather than bound to the Sheet, add `SPREADSHEET_ID` under Apps Script Project Settings → Script properties. You may also add an `API_KEY` script property; set the same value as `APPS_SCRIPT_API_KEY` in Vercel.

Deploy as a Web app with **Execute as: Me** and **Who has access: Anyone**. After editing this file, deploy a new version.
