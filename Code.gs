/**
 * Remindly – appointment reminder API (Google Apps Script + Google Sheets)
 *
 * Everyone signs up with an email + password and gets their own private list of appointments.
 * Emails: a confirmation when an appointment is booked, and a reminder before it starts.
 *
 * ONE-TIME SETUP
 *  1. Paste this file into Extensions > Apps Script (bound to your Google Sheet).
 *  2. Run  setup()  once and approve the permissions (Sheets, Gmail send, triggers).
 *  3. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone.
 */

const APP_NAME = "Remindly";

const SHEETS = { appointments: "Appointments", users: "Users", sessions: "Sessions", resets: "PasswordResets" };

const HEADERS = {
  Appointments: ["id", "userId", "title", "date", "time", "timezone", "remindBefore", "status", "notes", "reminderSentAt", "createdAt", "updatedAt"],
  Users: ["id", "fullName", "email", "passwordHash", "active", "createdAt", "updatedAt"],
  Sessions: ["token", "userId", "expiresAt", "createdAt"],
  PasswordResets: ["email", "codeHash", "expiresAt", "attempts", "createdAt"]
};

const SESSION_HOURS = 24 * 14;          // stay signed in for 14 days
const STATUSES = ["upcoming", "done"];
const REMINDER_CHECK_MINUTES = 5;       // how often reminders are checked (1, 5, 10, 15 or 30)

/* ───────────── setup ───────────── */

function setup() {
  const spreadsheet = getDatabase_();
  Object.keys(HEADERS).forEach(function (name) {
    let sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    const headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setBackground("#2f6f63").setFontColor("#ffffff").setFontWeight("bold");
    sheet.setFrozenRows(1);
    if (name === "Appointments") sheet.getRange(2, 4, sheet.getMaxRows() - 1, 2).setNumberFormat("@"); // keep date/time as plain text
  });
  setupReminders();
  return "Remindly is ready: sheets created and the reminder timer is running. Now deploy the Web app.";
}

/** Installs (or re-installs) the timer that sends reminder emails. */
function setupReminders() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sendDueReminders") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sendDueReminders").timeBased().everyMinutes(REMINDER_CHECK_MINUTES).create();
}

/* ───────────── web endpoints ───────────── */

function doGet() { return json_({ success: true, data: { status: "ok", service: APP_NAME } }); }

function doPost(event) {
  try {
    const body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {};
    authorize_(body.apiKey);
    return json_({ success: true, data: handleAction_(body.action, body.data || {}) });
  } catch (error) {
    return json_({ success: false, error: error.message || String(error) });
  }
}

function handleAction_(action, data) {
  switch (action) {
    case "health": return { status: "ok" };
    case "register": return register_(data);
    case "login": return login_(data);
    case "logout": return logout_(data);
    case "me": return { user: requireUser_(data) };
    case "requestPasswordReset": return requestPasswordReset_(data);
    case "resetPassword": return resetPassword_(data);
    case "listAppointments": return { appointments: listAppointments_(requireUser_(data)) };
    case "createAppointment": return createAppointment_(data, requireUser_(data));
    case "updateAppointment": return updateAppointment_(data, requireUser_(data));
    case "deleteAppointment": return deleteAppointment_(data, requireUser_(data));
    default: throw new Error("Unknown action: " + action);
  }
}

/* ───────────── accounts ───────────── */

function register_(input) {
  if (String(PropertiesService.getScriptProperties().getProperty("ALLOW_SIGNUP") || "true").toLowerCase() === "false") throw new Error("Sign-up is turned off.");
  const fullName = clean_(input.fullName);
  const email = clean_(input.email).toLowerCase();
  const password = clean_(input.password);
  if (!fullName) throw new Error("Test");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("judesimonjabeguero225370@gmail.com");
  if (password.length < 8) throw new Error("Your password needs at least 8 characters.");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (readRecords_(SHEETS.users).some(function (u) { return String(u.email).toLowerCase() === email; })) throw new Error("An account with this email already exists. Try signing in instead.");
    const now = new Date().toISOString();
    appendRecord_(SHEETS.users, { id: makeId_("USR"), fullName: fullName, email: email, passwordHash: hashPassword_(password), active: true, createdAt: now, updatedAt: now });
  } finally { lock.releaseLock(); }
  return login_({ email: email, password: password });
}

function login_(input) {
  const email = clean_(input.email).toLowerCase();
  const password = clean_(input.password);
  if (!email || !password) throw new Error("Please enter your email and password.");
  const user = readRecords_(SHEETS.users).find(function (u) { return String(u.email).toLowerCase() === email && u.active; });
  if (!user || !verifyPassword_(password, user.passwordHash)) throw new Error("That email and password don't match. Check them or create an account.");
  purgeExpired_(SHEETS.sessions, 2);
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  appendRecord_(SHEETS.sessions, { token: token, userId: user.id, expiresAt: expiresAt, createdAt: new Date().toISOString() });
  return { token: token, expiresAt: expiresAt, user: safeUser_(user) };
}

function logout_(input) {
  deleteRows_(SHEETS.sessions, 0, clean_(input.token));
  return { status: "ok" };
}

function requireUser_(data) {
  const token = clean_(data.token);
  if (!token) throw new Error("Please sign in to continue.");
  const session = readRecords_(SHEETS.sessions).find(function (s) { return s.token === token; });
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) throw new Error("Your session has expired. Please sign in again.");
  const user = readRecords_(SHEETS.users).find(function (u) { return u.id === session.userId && u.active; });
  if (!user) throw new Error("This account no longer exists.");
  return safeUser_(user);
}

function safeUser_(u) { return { id: u.id, fullName: u.fullName, email: u.email }; }

/** Emails a 6-digit code (valid 15 minutes). Always answers the same, so emails can't be probed. */
function requestPasswordReset_(input) {
  const email = clean_(input.email).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  const user = readRecords_(SHEETS.users).find(function (u) { return String(u.email).toLowerCase() === email && u.active; });
  if (user) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    deleteRows_(SHEETS.resets, 0, email);
    appendRecord_(SHEETS.resets, { email: email, codeHash: hashPassword_(code), expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), attempts: 0, createdAt: new Date().toISOString() });
    sendEmail_(email, APP_NAME + " password reset code: " + code,
      emailLayout_("Reset your password", "<p>Hi " + esc_(user.fullName.split(" ")[0]) + ",</p><p>Use this code to choose a new password. It works for 15 minutes.</p><p style='font-size:34px;font-weight:800;letter-spacing:6px;margin:18px 0'>" + code + "</p><p style='color:#6b7a75'>If you didn't ask for this, you can ignore this email.</p>"));
  }
  return { message: "If that email has an account, we've sent a 6-digit code to it." };
}

function resetPassword_(input) {
  const email = clean_(input.email).toLowerCase();
  const code = clean_(input.code);
  const password = clean_(input.password);
  if (password.length < 8) throw new Error("Your new password needs at least 8 characters.");
  const sheet = getDatabase_().getSheetByName(SHEETS.resets);
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() !== email) continue;
    const expired = new Date(rows[i][2]).getTime() <= Date.now();
    const attempts = Number(rows[i][3] || 0);
    if (expired || attempts >= 5) { sheet.deleteRow(i + 1); throw new Error("That code has expired. Please request a new one."); }
    if (hashPassword_(code, String(rows[i][1]).split("$")[0]) !== rows[i][1]) { sheet.getRange(i + 1, 4).setValue(attempts + 1); throw new Error("That code isn't right. Please check it and try again."); }
    const user = readRecords_(SHEETS.users).find(function (u) { return String(u.email).toLowerCase() === email; });
    if (!user) break;
    user.passwordHash = hashPassword_(password);
    user.updatedAt = new Date().toISOString();
    updateRecord_(SHEETS.users, user);
    sheet.deleteRow(i + 1);
    readRecords_(SHEETS.sessions).filter(function (s) { return s.userId === user.id; }).forEach(function (s) { deleteRows_(SHEETS.sessions, 0, s.token); });
    return { message: "Password updated. You can sign in now." };
  }
  throw new Error("That code isn't valid. Please request a new one.");
}

function hashPassword_(password, salt) {
  const actualSalt = salt || Utilities.getUuid();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, actualSalt + password, Utilities.Charset.UTF_8);
  return actualSalt + "$" + digest.map(function (b) { const v = b < 0 ? b + 256 : b; return (v < 16 ? "0" : "") + v.toString(16); }).join("");
}

function verifyPassword_(password, stored) {
  const parts = clean_(stored).split("$");
  return parts.length === 2 && hashPassword_(password, parts[0]) === stored;
}

/* ───────────── appointments ───────────── */

function listAppointments_(user) {
  return readRecords_(SHEETS.appointments).filter(function (a) { return a.userId === user.id; });
}

function createAppointment_(input, user) {
  const data = normalizeAppointment_(input);
  validateAppointment_(data, true);
  const now = new Date().toISOString();
  const record = Object.assign({ id: makeId_("APT"), userId: user.id, createdAt: now, updatedAt: now, reminderSentAt: reminderStartState_(data) }, data);
  appendRecord_(SHEETS.appointments, record);
  const emailSent = sendEmail_(user.email, "Booked: " + data.title, appointmentEmail_(user, record, "confirmation"));
  return { appointment: record, emailSent: emailSent };
}

function updateAppointment_(input, user) {
  const current = ownAppointment_(input.id, user);
  const data = normalizeAppointment_(Object.assign({}, current, input));
  validateAppointment_(data, data.date !== current.date || data.time !== current.time);
  const timingChanged = data.date !== current.date || data.time !== current.time || data.remindBefore !== Number(current.remindBefore);
  const record = Object.assign({}, current, data, { updatedAt: new Date().toISOString() });
  if (timingChanged) record.reminderSentAt = reminderStartState_(data);   // new time = new reminder
  updateRecord_(SHEETS.appointments, record);
  let emailSent = false;
  if (timingChanged && data.status === "upcoming") emailSent = sendEmail_(user.email, "Updated: " + data.title, appointmentEmail_(user, record, "update"));
  return { appointment: record, emailSent: emailSent };
}

function deleteAppointment_(input, user) {
  const current = ownAppointment_(input.id, user);
  deleteRows_(SHEETS.appointments, 0, current.id);
  return { status: "deleted", id: current.id };
}

function ownAppointment_(id, user) {
  if (!id) throw new Error("Appointment id is required.");
  const found = readRecords_(SHEETS.appointments).find(function (a) { return a.id === id; });
  if (!found || found.userId !== user.id) throw new Error("Appointment not found.");
  return found;
}

function normalizeAppointment_(i) {
  const remind = i.remindBefore === "" || i.remindBefore === undefined || i.remindBefore === null ? 1440 : Number(i.remindBefore);
  return { title: clean_(i.title), date: clean_(i.date), time: clean_(i.time), timezone: validTimezone_(i.timezone), remindBefore: isNaN(remind) ? 1440 : remind, status: clean_(i.status || "upcoming").toLowerCase(), notes: clean_(i.notes) };
}

function validateAppointment_(d, checkFuture) {
  if (!d.title) throw new Error("Give your appointment a title.");
  if (d.title.length > 120) throw new Error("The title is too long (120 characters max).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error("Please pick a valid date.");
  if (!/^\d{2}:\d{2}$/.test(d.time)) throw new Error("Please pick a valid time.");
  if (STATUSES.indexOf(d.status) === -1) throw new Error("Invalid status.");
  if (checkFuture && d.status === "upcoming" && startOf_(d).getTime() < Date.now() - 60000) throw new Error("That time has already passed. Pick a time in the future.");
}

/* ───────────── reminder emails ───────────── */

/** "" = reminder still to send, "skipped" = nothing to send (none chosen, or the reminder time had already passed). */
function reminderStartState_(d) {
  if (d.status !== "upcoming" || d.remindBefore < 0) return "skipped";
  return startOf_(d).getTime() - d.remindBefore * 60000 <= Date.now() ? "skipped" : "";
}

/** Runs on a timer (see setupReminders). Sends every reminder that has come due. */
function sendDueReminders() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    const sheet = getDatabase_().getSheetByName(SHEETS.appointments);
    if (!sheet || sheet.getLastRow() < 2) return;
    const h = HEADERS.Appointments;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, h.length).getValues();
    const users = {};
    readRecords_(SHEETS.users).forEach(function (u) { users[u.id] = u; });
    const now = Date.now();
    rows.forEach(function (row, index) {
      const a = {};
      h.forEach(function (name, c) { a[name] = serializeCell_(row[c], name); });
      if (!a.id || a.status !== "upcoming" || a.reminderSentAt !== "" || Number(a.remindBefore) < 0) return;
      let start;
      try { start = startOf_(a); } catch (e) { return; }
      if (now < start.getTime() - Number(a.remindBefore) * 60000) return;        // not due yet
      const mark = function (value) { sheet.getRange(index + 2, h.indexOf("reminderSentAt") + 1).setNumberFormat("@").setValue(value); };
      const user = users[a.userId];
      if (!user || now > start.getTime() + 3600000) { mark("skipped"); return; }  // user gone or >1h late
      mark(sendEmail_(user.email, "Reminder: " + a.title, appointmentEmail_(user, a, "reminder")) ? new Date().toISOString() : "");
    });
  } finally { lock.releaseLock(); }
}

function appointmentEmail_(user, a, kind) {
  const start = startOf_(a);
  const tz = a.timezone || Session.getScriptTimeZone();
  const when = Utilities.formatDate(start, tz, "EEEE, d MMMM yyyy") + " at " + Utilities.formatDate(start, tz, "h:mm a");
  const heading = { confirmation: "You're all set", update: "Appointment updated", reminder: "Coming up: " + a.title }[kind];
  const intro = { confirmation: "Your appointment is saved.", update: "Your appointment now looks like this.", reminder: remindText_(start) }[kind];
  const stamp = function (d) { return Utilities.formatDate(d, "UTC", "yyyyMMdd'T'HHmmss'Z'"); };
  const calendar = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(a.title) + "&dates=" + stamp(start) + "/" + stamp(new Date(start.getTime() + 3600000)) + "&details=" + encodeURIComponent(a.notes || "");
  const remindLine = kind !== "reminder" && Number(a.remindBefore) >= 0 ? "<p style='color:#6b7a75;font-size:13px'>We'll email you a reminder " + remindLabel_(Number(a.remindBefore)).toLowerCase() + ".</p>" : "";
  const body = "<p>Hi " + esc_(user.fullName.split(" ")[0]) + ",</p><p>" + intro + "</p>" +
    "<div style='border:1px solid #dbe7e1;border-radius:14px;padding:16px 18px;margin:16px 0;background:#f6faf8'><div style='font-size:19px;font-weight:800'>" + esc_(a.title) + "</div><div style='margin-top:6px'>" + esc_(when) + "</div>" +
    (a.notes ? "<div style='margin-top:10px;color:#4b5b56'>" + esc_(a.notes) + "</div>" : "") + "</div>" + remindLine +
    "<p><a href='" + calendar + "' style='display:inline-block;background:#2f6f63;color:#fff;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:10px'>Add to Google Calendar</a></p>";
  return emailLayout_(heading, body);
}

function remindText_(start) {
  const mins = Math.round((start.getTime() - Date.now()) / 60000);
  if (mins <= 1) return "It's starting now.";
  if (mins < 60) return "It starts in " + mins + " minutes.";
  if (mins < 1440) return "It starts in about " + Math.round(mins / 60) + (Math.round(mins / 60) === 1 ? " hour." : " hours.");
  return "It starts in about " + Math.round(mins / 1440) + (Math.round(mins / 1440) === 1 ? " day." : " days.");
}

function remindLabel_(m) { return m === 0 ? "At the time" : m < 60 ? m + " minutes before" : m < 1440 ? (m / 60) + (m === 60 ? " hour before" : " hours before") : (m / 1440) + (m === 1440 ? " day before" : " days before"); }

function emailLayout_(heading, bodyHtml) {
  return "<div style='font-family:Segoe UI,Arial,sans-serif;background:#eef4f1;padding:28px 12px'><div style='max-width:480px;margin:auto;background:#fff;border-radius:18px;padding:28px;color:#20302e;line-height:1.55'>" +
    "<div style='font-weight:800;color:#2f6f63;font-size:15px;margin-bottom:14px'>🔔 " + APP_NAME + "</div><h2 style='margin:0 0 12px;font-size:22px'>" + esc_(heading) + "</h2>" + bodyHtml + "</div></div>";
}

/** Returns true when the email went out. Never throws, so a mail problem can't break a booking. */
function sendEmail_(to, subject, html) {
  try { MailApp.sendEmail({ to: to, subject: subject, htmlBody: html, name: APP_NAME, noReply: true }); return true; }
  catch (error) { console.error("Email to " + to + " failed: " + error); return false; }
}

/** The appointment's start as a real moment in time, in the zone it was booked in. */
function startOf_(a) { return Utilities.parseDate(a.date + " " + a.time, a.timezone || Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"); }
function validTimezone_(tz) { try { Utilities.formatDate(new Date(), clean_(tz), "yyyy"); return clean_(tz); } catch (e) { return Session.getScriptTimeZone(); } }

/** Run from the editor to test that email works: sendTestEmail() */
function sendTestEmail() { return sendEmail_(Session.getEffectiveUser().getEmail(), APP_NAME + " test", emailLayout_("It works", "<p>Reminder emails are set up.</p>")); }

/* ───────────── sheet helpers ───────────── */

function readRecords_(sheetName) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing sheet: " + sheetName + ". Run setup() first.");
  const headers = HEADERS[sheetName];
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    .filter(function (row) { return row.some(function (v) { return v !== ""; }); })
    .map(function (row) { const r = {}; headers.forEach(function (h, i) { r[h] = serializeCell_(row[i], h); }); return r; });
}

function appendRecord_(sheetName, record) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing sheet: " + sheetName + ". Run setup() first.");
  sheet.appendRow(HEADERS[sheetName].map(function (h) { return record[h] === undefined ? "" : record[h]; }));
}

function updateRecord_(sheetName, record) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  const headers = HEADERS[sheetName];
  const idCol = headers.indexOf("id");
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(record.id)) {
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([headers.map(function (h) { return record[h] === undefined ? "" : record[h]; })]);
      return;
    }
  }
  throw new Error("Record not found.");
}

/** Deletes every row whose column `col` equals `value`. */
function deleteRows_(sheetName, col, value) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) if (String(values[i][col]).toLowerCase() === String(value).toLowerCase()) sheet.deleteRow(i + 1);
}

function purgeExpired_(sheetName, col) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) if (new Date(values[i][col]).getTime() <= Date.now()) sheet.deleteRow(i + 1);
}

function serializeCell_(value, header) {
  if (value instanceof Date) {
    if (header === "date") return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
    if (header === "time") return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
    return value.toISOString();
  }
  if (header === "active") return value === true || String(value).toLowerCase() === "true";
  return value === null || value === undefined ? "" : String(value);
}

function getDatabase_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { throw new Error("SPREADSHEET_ID is not valid or this account cannot open the Sheet."); } }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error("No Google Sheet connected. Open the script from a Sheet (Extensions > Apps Script) or add a SPREADSHEET_ID script property.");
}

function authorize_(provided) {
  const expected = PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
  if (expected && expected !== String(provided || "")) throw new Error("Unauthorized request.");
}

function makeId_(prefix) { return prefix + "-" + Utilities.getUuid().split("-")[0].toUpperCase(); }
function clean_(v) { return v === undefined || v === null ? "" : String(v).trim(); }
function esc_(v) { return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
