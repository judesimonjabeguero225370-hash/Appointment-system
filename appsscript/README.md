# Google Apps Script backend

Paste `Code.gs` into a Google Apps Script project. If the project is bound to the target Sheet, run `setup()` once. Deploy it as a Web app with **Execute as: Me** and **Who has access: Anyone**.

Set the optional `API_KEY` Script property for a protected deployment. If the Apps Script project is not bound to the Sheet, set `SPREADSHEET_ID` as a Script property too.

The frontend does not connect to Google Sheets directly. It sends action payloads to the Vercel function, which forwards them to this Web App.
