/**
 * Qorvena – appointment management API (Google Apps Script + Google Sheets)
 *
 * Everyone signs up with an email + password and gets their own private list of appointments.
 * Emails: a friendly confirmation when an appointment is booked, and a reminder before it starts (with the Qorvena logo + a calendar file).
 * Optional Script Property APP_URL (your website address) adds "Open Qorvena" and "Meet the team" links to every email.
 *
 * ONE-TIME SETUP
 *  1. Paste this file into Extensions > Apps Script (bound to your Google Sheet).
 *  2. Run  setup()  once and approve the permissions (Sheets, Gmail send, triggers).
 *  3. Deploy > New deployment > Web app > Execute as: Me, Access: Anyone.
 */

const APP_NAME = "Qorvena";

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
  return "Qorvena is ready: sheets created and the reminder timer is running. Now deploy the Web app.";
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
  if (!fullName) throw new Error("Please enter your name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
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
const RESET_COOLDOWN_SECONDS = 45;   // minimum gap between two codes for the same email (the app's "Resend" button waits the same time)

function requestPasswordReset_(input) {
  const email = clean_(input.email).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  const reply = { message: "If that email has an account, we've sent a 6-digit code to it. It usually arrives within a minute. Check your Spam or Promotions folder too." };
  const user = readRecords_(SHEETS.users).find(function (u) { return String(u.email).toLowerCase() === email && u.active; });
  if (!user) return reply;

  // Someone tapping the button repeatedly would burn through the daily email quota, so ignore requests that come too fast.
  const lastRequest = readRecords_(SHEETS.resets).filter(function (r) { return String(r.email).toLowerCase() === email; })[0];
  if (lastRequest && Date.now() - new Date(lastRequest.createdAt).getTime() < RESET_COOLDOWN_SECONDS * 1000) return reply;

  const code = String(Math.floor(100000 + Math.random() * 900000));
  deleteRows_(SHEETS.resets, 0, email);
  appendRecord_(SHEETS.resets, { email: email, codeHash: hashPassword_(code), expiresAt: new Date(Date.now() + 15 * 60000).toISOString(), attempts: 0, createdAt: new Date().toISOString() });
  const sent = sendEmail_(email, APP_NAME + " password reset code: " + code, resetEmail_(user, code), null, "Your " + APP_NAME + " password reset code is " + code + ". It works for 15 minutes. If you didn't ask for this, ignore this email.");
  if (!sent) deleteRows_(SHEETS.resets, 0, email);   // nothing was delivered, so let the person try again straight away
  return reply;
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
    deleteRows_(SHEETS.sessions, 1, user.id);   // sign out every device
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
  const emailSent = sendEmail_(user.email, "✅ Booked: " + data.title, appointmentEmail_(user, record, "confirmation"), [icsBlob_(record)]);
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
  if (timingChanged && data.status === "upcoming") emailSent = sendEmail_(user.email, "📝 Updated: " + data.title + " (new details inside)", appointmentEmail_(user, record, "update"), [icsBlob_(record)]);
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
      mark(sendEmail_(user.email, reminderSubject_(a), appointmentEmail_(user, a, "reminder")) ? new Date().toISOString() : "");
    });
  } finally { lock.releaseLock(); }
}

/* ───────────── emails (conversational + premium layout) ───────────── */

const EMAIL_FONT = "Segoe UI,-apple-system,Helvetica,Arial,sans-serif";

/** Whole calendar days between today and the appointment, in the appointment's time zone. */
function dayDiff_(start, tz) {
  const parts = function (d) { return Utilities.formatDate(d, tz, "yyyy-MM-dd").split("-").map(Number); };
  const a = parts(new Date()), b = parts(start);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
}

/** "right now" | "in 15 minutes" | "in about 2 hours" | "tomorrow" | "in 3 days" */
function whenPhrase_(start, tz) {
  const mins = Math.round((start.getTime() - Date.now()) / 60000);
  if (mins <= 1) return "right now";
  if (mins < 60) return "in " + mins + " minutes";
  const days = dayDiff_(start, tz);
  if (days <= 0) { const h = Math.max(1, Math.round(mins / 60)); return "in about " + h + (h === 1 ? " hour" : " hours"); }
  return days === 1 ? "tomorrow" : "in " + days + " days";
}

function remindLabel_(m) { return m === 0 ? "at the time" : m < 60 ? m + " minutes before" : m < 1440 ? (m / 60) + (m === 60 ? " hour before" : " hours before") : (m / 1440) + (m === 1440 ? " day before" : " days before"); }

function reminderSubject_(a) {
  const start = startOf_(a), tz = a.timezone || Session.getScriptTimeZone();
  const phrase = whenPhrase_(start, tz);
  return "⏰ " + a.title + (phrase === "right now" ? " is starting now" : " is " + phrase + " (" + Utilities.formatDate(start, tz, "h:mm a") + ")");
}

function emailButton_(href, label, primary) {
  const bg = primary ? "#2f6f63" : "#e3f1ec", fg = primary ? "#ffffff" : "#245a50";
  return "<table role='presentation' cellpadding='0' cellspacing='0' border='0' style='display:inline-table;margin:0 10px 10px 0'><tr><td bgcolor='" + bg + "' style='background:" + bg + ";border-radius:12px'>" +
    "<a href='" + esc_(href) + "' style='display:inline-block;padding:14px 24px;font-family:" + EMAIL_FONT + ";font-size:15px;font-weight:800;color:" + fg + ";text-decoration:none;border-radius:12px'>" + esc_(label) + "</a></td></tr></table>";
}

function appointmentEmail_(user, a, kind) {
  const start = startOf_(a);
  const tz = a.timezone || Session.getScriptTimeZone();
  const first = esc_(user.fullName.split(" ")[0]);
  const phrase = whenPhrase_(start, tz);
  const day = Utilities.formatDate(start, tz, "EEEE, d MMMM yyyy");
  const time = Utilities.formatDate(start, tz, "h:mm a");
  const stamp = function (d) { return Utilities.formatDate(d, "UTC", "yyyyMMdd'T'HHmmss'Z'"); };
  const calendar = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(a.title) + "&dates=" + stamp(start) + "/" + stamp(new Date(start.getTime() + 3600000)) + "&details=" + encodeURIComponent(a.notes || "");
  const appUrl = clean_(PropertiesService.getScriptProperties().getProperty("APP_URL"));
  const p = "margin:0 0 14px;font-size:16px;line-height:1.65;color:#2b3d39";

  const copy = {
    confirmation: { eyebrow: "Booked", heading: "You're all set, " + first + " ✓", preheader: a.title + " · " + day + " at " + time,
      intro: "Hey " + first + "! Thanks for booking with " + APP_NAME + ". Your appointment is saved, and everything you need is right here, so you won't have to go digging for it later." },
    update: { eyebrow: "Updated", heading: "Got it, your plan has changed", preheader: "New details for " + a.title + ": " + day + " at " + time,
      intro: "Hey " + first + ", we've updated your appointment. Here's how it looks now, so please give it a quick glance." },
    reminder: { eyebrow: "Friendly reminder", heading: phrase === "right now" ? esc_(a.title) + " is starting now" : esc_(a.title) + " is " + phrase, preheader: "Starts " + phrase + " · " + time,
      intro: phrase === "right now" ? "Hey " + first + ", it's time! Your appointment is starting now." : "Hey " + first + " 👋 just a friendly nudge from us. Your appointment is coming up " + phrase + ", and we'd hate for it to sneak past you." }
  }[kind];

  const pill = kind === "reminder" ? "<div style='margin:2px 0 18px'><span style='display:inline-block;background:#fff3e3;color:#9a5b12;border-radius:99px;padding:8px 16px;font-size:13px;font-weight:800;letter-spacing:.2px'>⏰ " + (phrase === "right now" ? "Starting now" : "Starts " + phrase) + "</span></div>" : "";

  const card = "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='background:#f6faf8;border:1px solid #dbe7e1;border-radius:18px;margin:6px 0 20px'><tr>" +
    "<td width='84' valign='top' style='padding:18px 0 18px 18px'><table role='presentation' cellpadding='0' cellspacing='0' border='0'><tr><td align='center' bgcolor='#2f6f63' style='background:#2f6f63;border-radius:14px;width:62px;padding:9px 0'>" +
    "<div style='font-size:11px;font-weight:800;letter-spacing:1.6px;color:#bfe3d8'>" + Utilities.formatDate(start, tz, "MMM").toUpperCase() + "</div><div style='font-size:28px;font-weight:800;line-height:1.1;color:#ffffff'>" + Utilities.formatDate(start, tz, "d") + "</div></td></tr></table></td>" +
    "<td valign='top' style='padding:18px 20px 18px 14px'><div style='font-size:20px;font-weight:800;line-height:1.3;color:#1f2f2c'>" + esc_(a.title) + "</div>" +
    "<div style='margin-top:8px;font-size:15px;color:#3f554e'>🗓&nbsp; " + esc_(day) + "</div><div style='margin-top:4px;font-size:15px;color:#3f554e'>🕘&nbsp; <strong>" + esc_(time) + "</strong></div></td></tr></table>";

  const notes = a.notes ? "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='background:#fff8ec;border-radius:14px;margin:0 0 20px'><tr><td style='padding:14px 18px;font-size:14.5px;line-height:1.6;color:#6b4a1a'><strong>📝 Your notes</strong><br>" + esc_(a.notes).replace(/\n/g, "<br>") + "</td></tr></table>" : "";

  let after = "";
  if (kind === "reminder") after = "<p style='" + p + "'>A little tip: leave 10 to 15 minutes early so you arrive calm instead of rushed. If anything changes, you can update the time in " + APP_NAME + " and we'll remind you again at the new time.</p>";
  else if (Number(a.remindBefore) >= 0) after = "<p style='" + p + "'>No need to keep this in your head. We'll send you a reminder <strong>" + remindLabel_(Number(a.remindBefore)) + "</strong> so it doesn't slip by.</p>";

  const buttons = emailButton_(calendar, "Add to Google Calendar", true) + (appUrl ? emailButton_(appUrl, "Open " + APP_NAME, false) : "");
  const body = "<p style='" + p + "'>" + copy.intro + "</p>" + pill + card + notes + after + "<div style='margin-top:6px'>" + buttons + "</div>" +
    "<p style='margin:18px 0 0;font-size:16px;line-height:1.6;color:#2b3d39'>" + (kind === "reminder" ? "See you there!" : "Talk soon!") + "<br><strong style='color:#2f6f63'>Team " + APP_NAME + "</strong></p>";
  return emailLayout_(copy.eyebrow, copy.heading, body, copy.preheader);
}

function resetEmail_(user, code) {
  const p = "margin:0 0 14px;font-size:16px;line-height:1.65;color:#2b3d39";
  const body = "<p style='" + p + "'>Hey " + esc_(user.fullName.split(" ")[0]) + ", no worries, it happens to all of us. Type this code into " + APP_NAME + " and you can choose a new password.</p>" +
    "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' style='margin:8px 0 18px'><tr><td align='center' bgcolor='#f6faf8' style='background:#f6faf8;border:1px dashed #9fc7ba;border-radius:16px;padding:22px 10px'>" +
    "<div style='font-size:12px;font-weight:800;letter-spacing:2px;color:#6f7f7a;text-transform:uppercase'>Your code</div><div style='font-size:38px;font-weight:800;letter-spacing:10px;color:#2f6f63;margin-top:6px'>" + code + "</div></td></tr></table>" +
    "<p style='margin:0 0 6px;font-size:14px;line-height:1.6;color:#6f7f7a'>It works for the next 15 minutes. If you didn't ask for this, you can safely ignore this email. Your password hasn't changed.</p>";
  return emailLayout_("Security", "Let's get you back in", body, "Your " + APP_NAME + " code is " + code);
}

/** The branded shell: logo header, gradient banner, card body, footer. Inline styles only (email clients strip the rest). */
function emailLayout_(eyebrow, heading, bodyHtml, preheader) {
  const appUrl = clean_(PropertiesService.getScriptProperties().getProperty("APP_URL"));
  const logo = "<img src='cid:qorvenalogo' width='40' height='40' alt='" + APP_NAME + "' style='display:block;border:0;border-radius:12px'>";
  const foot = appUrl ? " &nbsp;·&nbsp; <a href='" + esc_(appUrl.replace(/\/$/, "")) + "/#team' style='color:#2f6f63;text-decoration:none;font-weight:700'>Meet the team</a>" : "";
  return "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><meta name='color-scheme' content='light'></head>" +
    "<body style='margin:0;padding:0;background:#eef4f1'>" +
    "<div style='display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#eef4f1'>" + esc_(preheader || "") + "&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>" +
    "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0' bgcolor='#eef4f1' style='background:#eef4f1'><tr><td align='center' style='padding:28px 12px;font-family:" + EMAIL_FONT + "'>" +
    "<table role='presentation' width='560' cellpadding='0' cellspacing='0' border='0' style='width:100%;max-width:560px'>" +
    "<tr><td style='padding:0 4px 16px'><table role='presentation' cellpadding='0' cellspacing='0' border='0'><tr><td valign='middle'>" + logo + "</td><td valign='middle' style='padding-left:12px;font-size:20px;font-weight:800;letter-spacing:.3px;color:#2f6f63'>" + APP_NAME + "</td></tr></table></td></tr>" +
    "<tr><td style='background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(35,70,60,.10)'>" +
    "<table role='presentation' width='100%' cellpadding='0' cellspacing='0' border='0'><tr><td bgcolor='#2f6f63' style='background:#2f6f63;background-image:linear-gradient(135deg,#1f4f47,#2f6f63 55%,#3b8a7a);padding:30px 30px 28px'>" +
    "<div style='font-size:11px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;color:#f6c283'>" + esc_(eyebrow) + "</div>" +
    "<div style='font-size:27px;line-height:1.25;font-weight:800;letter-spacing:-.4px;color:#ffffff;margin-top:8px'>" + heading + "</div></td></tr>" +
    "<tr><td style='padding:28px 30px 30px;font-family:" + EMAIL_FONT + ";color:#20302e'>" + bodyHtml + "</td></tr></table></td></tr>" +
    "<tr><td align='center' style='padding:20px 12px 4px;font-size:12.5px;line-height:1.7;color:#7d8c87'>" + APP_NAME + " · Appointments, organized." + foot + "<br>You're getting this because you have an account with " + APP_NAME + ".</td></tr>" +
    "</table></td></tr></table></body></html>";
}

/**
 * Returns true when the email went out. Never throws, so a mail problem can't break a booking.
 * Tries (1) MailApp with the logo, (2) MailApp without it, (3) GmailApp. The last error is kept in the
 * script property LAST_EMAIL_ERROR so you can see why mail failed (run checkEmail() from the editor).
 */
function sendEmail_(to, subject, html, attachments, plainText) {
  const text = plainText || String(html).replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&zwnj;/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, 1500);
  const base = { to: to, subject: subject, name: APP_NAME, body: text };
  if (attachments && attachments.length) base.attachments = attachments;
  const attempts = [
    function () { MailApp.sendEmail(Object.assign({ htmlBody: html, inlineImages: { qorvenalogo: logoBlob_() } }, base)); },
    function () { MailApp.sendEmail(Object.assign({ htmlBody: html.replace(/<img[^>]*cid:qorvenalogo[^>]*>/, "") }, base)); },
    function () { GmailApp.sendEmail(to, subject, text, { htmlBody: html.replace(/<img[^>]*cid:qorvenalogo[^>]*>/, ""), name: APP_NAME, attachments: base.attachments || [] }); }
  ];
  let lastError = "";
  for (let i = 0; i < attempts.length; i++) {
    try { attempts[i](); rememberEmailError_(""); return true; }
    catch (error) { lastError = String(error && error.message || error); console.error("Email to " + to + " failed (attempt " + (i + 1) + "): " + lastError); }
  }
  rememberEmailError_(lastError + " | remaining daily quota: " + safeQuota_());
  return false;
}

function safeQuota_() { try { return MailApp.getRemainingDailyQuota(); } catch (e) { return "unknown"; } }
function rememberEmailError_(message) { try { PropertiesService.getScriptProperties().setProperty("LAST_EMAIL_ERROR", message ? new Date().toISOString() + " " + message : ""); } catch (e) {} }

/**
 * RUN THIS FIRST if emails don't arrive: it sends a real reset-code email to YOU and reports exactly what went wrong
 * (missing permission, daily limit reached, ...). Look at the "Execution log" at the bottom of the editor.
 */
function checkEmail() {
  const me = Session.getEffectiveUser().getEmail();
  const quota = safeQuota_();
  const ok = sendEmail_(me, APP_NAME + " password reset code: 123456", resetEmail_({ fullName: "Test" }, "123456"), null, "Test reset code 123456");
  const report = ok ? "OK: a test code email was sent to " + me + ". Remaining emails today: " + safeQuota_() + "." : "FAILED. Remaining daily quota: " + quota + ". Reason: " + (PropertiesService.getScriptProperties().getProperty("LAST_EMAIL_ERROR") || "unknown") +
    ". If it mentions permission/authorization, run setup() again and approve everything, then redeploy (Deploy > Manage deployments > Edit > New version).";
  console.log(report);
  return report;
}

/** A calendar file (.ics) so the appointment can go into Apple, Outlook or Google Calendar in one tap. */
function icsBlob_(a) {
  const start = startOf_(a), end = new Date(start.getTime() + 3600000);
  const z = function (d) { return Utilities.formatDate(d, "UTC", "yyyyMMdd'T'HHmmss'Z'"); };
  const t = function (s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;"); };
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + APP_NAME + "//Appointments//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    "UID:" + a.id + "@" + APP_NAME.toLowerCase(), "DTSTAMP:" + z(new Date()), "DTSTART:" + z(start), "DTEND:" + z(end), "SUMMARY:" + t(a.title), "DESCRIPTION:" + t(a.notes || "Booked with " + APP_NAME)];
  if (Number(a.remindBefore) >= 0) lines.push("BEGIN:VALARM", "TRIGGER:-PT" + Number(a.remindBefore) + "M", "ACTION:DISPLAY", "DESCRIPTION:" + t(a.title), "END:VALARM");
  lines.push("END:VEVENT", "END:VCALENDAR");
  return Utilities.newBlob(lines.join("\r\n"), "text/calendar", "appointment.ics");
}

/** The Qorvena logo as a PNG, attached inside each email so it shows in Gmail, Outlook and Apple Mail. */
function logoBlob_() {
  return Utilities.newBlob(Utilities.base64Decode("iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAAABmJLR0QA/wD/AP+gvaeTAAAgAElEQVR4nO2dd3wc5ZnHv+/srrpsVRc1W7LlIje5Y9wxtoM5IJc7mwCBQAiGkDuaDYYUoiSEBELJJYR8Qi7hUiDFBI5w2OBCcAEXcO9ykS1ZtmUVq7fV7nt/rFaa3Z2RNNJK2l3P7w9r5p33fZ6fRl9Pfed9BQGqqWtWDnQI6yhFytFIOQYhRiFJR4hoIFpAPIhokGEAiLZ/POVVLvQXNFZFB6GFZnNXmdAsRmiWeiTQSN+pRwFVQLMQ8rIUyiXgpJByv1MoBxrCnYcOPv5CnXbi/pfOHul7TV2zcqB0iHkIsQghFgIT8PYnNP5IbQVXLXw6Xto8OoF8EBuE4B/NSZVb99z/ml3bTN+rXwHMfeSROCWsaQVSfgW4FoRF15EJX3fg8ykXUInCeuBvaSML3lu7Yq1D21zfqO8BzMtTcmtLblAUeReSm4GINismfL0Nn3f5WeBV7Pbf7sh7uULbaO+qzwBckJdnray5dKtQ5FMCMc7HhglfX8PX3kZQj5R/cFr50a41z5/XNt076nUAXeCV3C2EfBLBCN+EJnxGPPYCfGrVCyleFlbnc5+seb5Gq4W/1asA5j7+wGwheRWYqM2ZCZ8Rj70Mn2qTKFEg75OmiNfIy3Pq1PKLegXAcY/emxBmsX0P+A9AMeHzTBDg8Kk37XBYHF/d9cRPT+rU7rH8DmDuqpVfFEL8FkSCO4MJn1cugx77CT63aoFVnz75k98gkDotuy2/ATgub3lYeF3C81LykJoiEz6vXAY99jN87f4F66Qt/M4dj+X59W7ZLwBOXP31TAvWv4Kcrt4xJnxeuQx6DBj42nXKKRw371zz/DGdSIbVYwAnP3H/NJxiHchkEz5tjyECn7u8RpHKHduf/NF7OhENydKTxpMeX7lESLEO13tZV6EJXyjDBxCOYEX6krlXijZu260TucvqNoBTVt3/JYF4C4gy4dP2GILwubMpAm4YtmSOo3Dj9q06GbqkbgE4edX9tyH4C2Az4dP2GMLwqeNcl7F4jr1o4/ZtOpk6lWEAJz2+colA/A2wmvBpe7w64HMvKIsyFs+TRRu3bdHJ2KEMAZi76r7pCso6INKET9vj1QVf28LCjCXzyrtzTahn1UeuRy2W3UCSCZ+2x6sUPveiAylu/uSJZ9bpONCU0pVKU1eutFmwvIEJn67Hqxw+AAtC/vXa57+Vq+NCU10CUA4UPwVmmfBpezTha2sTowjlvZk/+9ZgHTc+6hTAKY8/8C+tr9fakprweeUy6DFE4XMvpNlaxO+Ruq481OFNyOSn7knGYdkMIsqd1ITPK5dBjyEOn7tkZMbOudWFG7bt0HHXpg6PgNIe9hxmrxZNjyZ8Xm28w0rxk7kvfXuGjkO9cO1q7Uy6zZ3DhM8rl0GPVxV87R6Px9oqc9c/9IsmHbfaR8AFeXlWIfmlO4cJn1cugx6vUvgAxtTYB67WcQvoAFhZe+keYJIJn2cCEz6vNl3yKL614OW84Vo1QQPA5cuXWwQ8bsLnmcCEz6tN1z1GOZyOn2nVBg0AT2YkfhlBtgmfVy6DHk341DbELfNeylui1cobQKEoPGnC55XLoEcTPrUN9wbn97VaegCYu/oby4DxXQmOKrgJX/uKCZ/aRvsGCdfMf+Hpxd71rOoVRcivdiU4quChBF9KfAJZg4YyLHEQGYnJZCQmMzAqighbGAMiXT8BGu3NVDfU09DcTHVjPYXlpRSWl1FYfpkzpZe4WHWlix6vDvjccirkARs1LeQ+8kicYmu8yFU0VsugAXFMz8pmWmY2UzNHMnhAnFYLwyqpqmTPuVN8fvYUnxecprSm6qqHr62JUOZvfSSvrRd12xFQsTbeylUAX7jNxpxROSybNJ1rR45BUbrUH8OQBg+MY9nEaSybOA2nlBwuPsf6g3vYePQAdU2NXK3wgUA65X3AVo9igCmPP7AVmBuq8A1PHsydcxZx/bhJbafSvlaj3c6mowf4046PKawo1agR2vC1rjRYIOXjR/Mq20qnrlk5UDqVckJwfL6Rg1P4yuyFLJ0wpVeOdt2RU0p2nD7O77Zt4thF92BUVwN8Lkkpvrn9sbxXofUU7JSW+QJCCr6k2AE8tOQWlkyYjNDbOf0kRQhmjxzLtSPHsOHwfl7ZvI7yep3BqEIMPgBFkfcAr0Jrd6yU2dMfQHCNdpDggk8RglumzeKnt32dnNT0gINPLYFg5KCh3Dx5Bk0tdo5dLEaqh18JQfhcocTQtBsX/KZo/cc17nPSddpBggu+tIQkfrfyUZ66aQUxEREalQNTMeERPHL9Tbx21zdIiXP1fgtd+FxLVqdYCqBMXbNyIK4Bwb0qBxd888dM4H9WPsrYlHSNisGhnJR0fv+1h7k+Z1IIw+f6V0p5A4CY9sQDM5yIXZ6Vgwc+i6Lw6Be+yPKZczUqBackkr999imvfLQOp2wdHzKE4GvVlcEpOcmKA0Z7Vg4e+MKsVp5ZfldIwQcuMG6dPptnv3QH4VZbJ/s+KOEDQfzFy0dHKEINYBDBFxsRyS/u+gbX5UzSqBQampudw4u33kNMeKTvxuCGz/WjRUywChgtVcGDBb5X7/kmo4akalTqmRqamzhQVMDxi8UUlpdyruwyVY31VDfU02hvBiDCFs6AyEjiomPISEhmWGIyo4ekMikjk0g/P+SenJ7JL277Ov/55/+mtqnRVRgC8IFACCaIKU88+CmCWZphAhC+cJuNn9/5ALnDsjQqdU9ltdVsOLyPj48f4mhxES1Op+6vou9RYFMsjEtLZ/7o8Swel0tidKzfPO4rKuCxv71Os6OlNVtwwweAFG+LqWsePCxhXDDAZ1EUnvvyPcwdPV6jknHtOXuKN3ZsYefpE+0X++o/rQH4vH8ni6IwM2sUt8+czxQ//WfZcvII3/nfPyOl11DNwQifS7ssQ+dOf0JAnG/lwIIPYNUN/8oNk6ZrVDKmz86cJO+dN3l922aKrpSpHv76rz+flJKiinLWHd7D7rMnSYlLaH/G100NTxxETHgEuwpUg9YHL3wIQZ0lZfaM7wKRnpUDD77rcibx0NJbNCp1XWW11byw7h1+vvE9Lld7d5Hqvc6kl6urWH9oLydKipmYlklMePcfko9LSed0aQnnykuDGr7WVYclZc6MH+IeISFA4UtLSOKlO1YSZrVqVOyaNh3Zz8Nv/IajFwo1PfYWfGoVVpTx/qE9pMYnkpnU5eFTfDQzM5vNJw613pQELXwIsFlS5kz/YWfB+xM+i6LwX3feT2p8okbFztXc0sIL69/h1c3rsLdewPcHfK5NArujhX8eP0RlfR3Th4/E0o0eOmFWK+NT0nn/0L72y4fggw8QVqWz4P0JH8DymXO7/XqtobmJ1X/5He/sUQ1R0o/wqTe9vXcnj/719fZHKwaVMzSdL+ZO1/QYJPABrdNoBSp8SbEDWLnwCxoVO9eVulru/59X2X0mX9djf8Hn1r6iM/znn/+bK/W1Og071sq5i0mIjtFyGBTwASiBCh/Aw0tvIbobF+x1TY088uZvyL9UrOuxv+FzB8svucDDf/ldt46EMeERPDh/qbfDoIEPoTU0R4DAN3poKovHT9ao3LGaW1p4/K+vc+Ji4MPn1unSSzz19p/ar1ENaOm4XEYkDwlK+MAbwACBD+DueYu71Zn05Q/fZe/Z07oeAw0+t/YWneHnHxkaXrnN3V0z56tid81jIMAHagADCL7hyYNZMHaixpaOtfnogYC84fBMo0cDvLNvFxuPHtAJqq+Fo8eRkZjUZY+BAh+4AQwg+BCCO+csQjF49CutqeLZ99bqegx0+NytXtz4D8prjU1WrgiF26d7d0kLfPhA+N4F9zd80eERXD/OeBern334j9Zvbn09Bgt8ALVNjbzy8XqdBPpaNHo8UWHhHXoMNPjA6y64v+ED1ys3o9/tfnbmJJvdp64ghs9dvvHYAfYVFegk0laELYz52Tm6HgMRPoTqGjAQ4ANYNmmaVo0O9ZstH2p6DEb43Au/3roRo1qakxtU8EErgIEC36ABcUw22HVpz9lTHCw6G1LwARy+UMh+g0fByemZPn0QAxk+cE272aXgPin8DB/AjKxsw49e3tixJeTgcy+++fl2ncTaUoRgakb7f+BAh0/gcRfcUVKvFL0AH8DUzGytmrqqqKth15kTHj5CBT6AXQUnqTD4mm5KeqbKRmDDB23vgjtK6pWil+ADmDJ8hGa5ntYf3IPD6d+ezB5t+hE+AIfTyebjh3RMaGvasBFBAx8I901I/8OXEp/AkIHxmtv0tOXE4TYfoQafu83Wk0d1jGhrcOxA/f0YYPAhtDoj9AN8CMgaNFR7m44amps4WlxEKMMHcORiUdvXeF3V8IRkQx77Cz7QfBfsudIX8IEgI1Fjp3WgA0UF3f56LVjgQ4Dd4eBgcaGOKW1lJHi9lgtQ+MDnXbDnSl/BBzA8aZB2HR0dv1gc8vC5lX/5go4xbaWre48HMHzgcxfslaKP4BNAutZpowMVlpfqeAkt+MD1LYkRZcQndeoxEOADj7tgrxR9CB/AwKgo7bo6KvT4Kqwzj8ELH0DRlQodg9oaEBkVFPCBxzVg/8EHGO75XF7n3WMkNOEDQYXe6Kk6igoL0/UYSPAhvB7D9Bd8CFQ9Obqm+mb1DKChCx8C6pp1ZzvVVJRNY18GIHygegzTn/ABRBoEsKHtjxLa8AHUNxt7DOM6AmqFCiz4QN0ZoR/h03famUIfvh4rgOEDd2eEAICvweBpJjKsfU4d74ShBp/PEa0TtR0xAxw+8LkL1g6uDtBbR756o9c5YeFXBXwA0QYvT+qam4ICPoHPZ5n9d9qtM/hdbGKs99h7oQmfABIMjjPYYG8OCvgQQj1bZv/Bh4DK+jrtWDrKSEjmSNsrKv/BZ7NYuWXyDJbm5JKVPASLIiiprqK0porzleUcLi7kyIUizpWXaYzL4n/4EML31Vonqmyo0zKgZ0z1o2/hg7bJCvsXPoCiijKmDh+pHVND7Z8h+g++pJgBvLjibkZ6dYxIi08kLT6RyRlZ3DTRNR5LSXUlHx0/xMbjB8kvuUBHf7yefjSeYXBgpvPeD64DFD4AayDAB7jGuzOgsUPT8feRTws+PQ0eEMdtM+Zy24y5HDx/jjd2b+PT0yeQwnP0Un+MWDB6UEqXPLlVVFnuFUzDQADAB+4jYD/DB4IigwBOSs8kzGLB7nRomzEAH8Atk2d0GT5vTUwbxsS0YRy7VMzLm9/jaOsEhP6Az2axMD41w5CfwitlXnkDEz7QvAumz+ETQEFpiXZsHUXYbOSkag3bZhw+ROsXZT3U2CGp/PqO+3liyRfb30b0AD6A8UPTibDaDPk4qzd6qmo1EOBDaA5O1PfwAVyoquCSz1T3HWveKO/ByrsHHwgyk7s/YqlnOMHNE6fx+le/SU5KmnbCLsIHMC87x1D+kpoqSmqr1FG9kgQOfODTIbV/4HMv7Dt3RjuPjpaOn6waYbT78PWGUuMSeOXWe1nsMcaNMfgsisLCUeMM5f280L0PAx8+EOoOqf0LH8DnZ09p59JRQnQMM7NG4Q/4jF4CdEU2i5XvLvv31nFbjMEHcE1mNglRMZrb9LTvfAF6+z7Q4IO2Dqn9Dx/AZwWncHrPgdGJbp853y9Hvg+P7jeUt6sSCL4xbwmrF9/kMx50R/Ah4MtTZxvK5ZSSPUVnfeK0/wgs+ACUQIEPBKU1VewvNHYanjIsi4lpwzR8GjvtvnvgM05dvmgotxHdMnE63/7Cl9pG/eoMvvFDM5iUqvF7daC9RQWe3xEHOHygHhmhk8Cq6L5h/ACf+8e6g3u0c3eg++Yt8Qpn/PWa3dHC6rf+0KsQLh4zkdXX3+x69NDBPhYIVs5eZDj+hhMHPeK0/whM+BBgSZ1/TV5ngVXRfcP4ET6A81fKWDF9DjaLRduHhlLiEjhXUcqZ0pJuwed2WN/cxPuH9lJZX8eAyEhiI6KwGvDRFY0enEJ0eAS7z2lc77Z6XDJmIiumzDIUt9Fu57lN79HidAQNfALwnPmln+EDaGhuZvOxg/yLwVGyHlp0IzvP5Gt3augCfG7ZHS28tW8Hb+3bAQgSomNIjUtgXEoGc0aOYWLqMMODZ3prxZRZVDc28IddW3w8xoRH8ODcJXpNdbU5/zAN9uaggg/UR8AAgM9dUFheypemzsLIQEVRYeGkxSfxkfdQFgbg8/TjWmiwN3O5torDFwpZd3gvG48dJMIWxshBQwz589bk9OEUV1ZwpqzEw+PTN/wbYwxOQ+uUkh9+8DbVTQ0q54EPH4hWAAMIPgFUNdaTlTzY8MPhzKRBVNbXcaz1VVhP4dPyWNPYyCenj7P99HFyhqSRGNO9KVkFgmuzRrG/+BwlNdUA/FvuTG41eOoF+OjkEd47sldlNzjgg9a7YO2E7ZX6Ej53+e8//adqFsuu66FFNzJ12IhegU/9bvdU6SUe+PNrvLN/t2GPbtksVp696cukxSUyLSOrW6deCfyxdRi3YIMPwJK6YFaeTnTfMH0EH7iGXkuPTzLcQcCiKMwfPY7dBSd9P930E3xuOaVkR0E+tU1NTB8+slun5HCrjXkjx/KFsZOIsBl75wvwwbED/N+RvUEJH6KTiWr6Cz63Xtm8rlszCEWFhfPiirsZNVjVjcnP8Km3rt23g++/v9Z1B9oNJccMMPxZKkBNUyO//mRT0MIH3kfAAIIPBA0tzTTa7cwaMVqrQoeKtIWxNCeX4yXFFFdVeDv08tN9+NzlBeWXOX+lgnnZY3t0c2JEv9y+gQPF5+jIfyDDB2oAAww+d/nxi8VckzWK5NiBWhU7lM1iYdGYCVQ3NnBcPW+cR96ew+dWQfllSqormTNyjC/sftbRS+f52cfrkEEMH7gBDFD4ACSSz8+dZtmEKYQZ7BcHrmvCa0eMJjNpMJ+dPUWzo6VX4HNXPVVWQlOLnenDjI32akQ1TY2sfvdP1DSpviQMQvhAYEldOCsvUOFzq6axgYLyUq7PmdjtI0tm0iCWTZjClYY6TpeW0NGO6WlP5sMXikiIjmHMYGPP87oiCTyz4W2O6s4EqioIcPgALKkLrs3z2R5A8Lk2CYoqyoiNiGRcirHu6WpFhoUzLzuHyRmZFFdWUFJd5Xf43Np97hRjh6SRFpfQbb9aWrtvJ38/oHr0E8TwIVpPwYEOn3vTZwWnGDFoCMMTjQ1m6a2hA+O5ccJUpmRkUtlYz4WqK0gp/QYfuKZMsDsdXDM822/vk7eePsYLH73f/nQ0yOEDEDPzHpO+lQMPPrfCrFZeuvVrTG6djsAfulJfx6bjB9l68ihHLp7XmLe3a/DZLFbGDU1j3sixLBo9gfioaL95LK+r4el1b3Hkkvotj4+b4IIPNYBBAJ+7SUx4JL+47euez/n8pEa7nYPF58i/fIHCijIKK8q50lBLbVOj62U/ruHPYsLDiY+OZVhCEunxiYwelML41AzDHxAZVVFlOR+fPMqOcyc5XnKhtQNvcMIHbgCDCD53o8iwMH78r19huoGP2UNNNU2N7CkqYOfZk+wsPEVlQz0QPPABiJnff8x7fAmN1cCCzy2bxcrTNy3nutETdIJdPXJKydGSYradPs4Hxw9Q3dgY8PCBwJKmegyjHSQw4QNw4mRL/lFiIyLISUmjtx/+BrKEEAyKGcD0jCz+fdJMspIGUV5fw+Xaau+Kvm11ynsbPgRY0ha6HsNoBwlc+NRFuwpOcuryRWZmZhPey9dgwSCLojA8IZllY3OZlpbF2StllNXVBBx84A1gkMGnblVYUcZHJw4xPiWD5NgBOomuPg2KHcCynFxSBsSz/0Kh601Qq/obPlADGMTwuctrmxp5/9BeiiuvMClteLe6N4WiBDAiaTCLRuaQX3qJktrqgIAP3ACGAHzuBYmrs+gHR/aREB3DiOTBAXttKHGNZBBlCyPSZmwY3u4oJjyCJaMmcKWhjvwyjQ/x+xg+ADHzB6ukulIww+dbBllJg7ljxlyuHzPR58Pw/pJTSnaePcnru7aQX3qRxKgYVi28kdlZxruddUeOqmJ271xLdUk+8YqdZqlQJm3sb4nh85ZY6qXqzU0vwgdCDWDowaduk56QxB0z5rJo9Hgi+uBoo6VGu53N+Yd5c88nnG/ro9j+7/SMLL4xZzFZPXzVqCdn9UWa9r9JS/Fe3Tr10sLbTUm805xMi8ffyf/wIdqOgKENn7o83Grj2qzRfGFcLjOHZ/f6UdEpJUcunefDYwfYnH/YNYK9hy1P/wK4Zng2y3Nnkps6vMefgLrVcmE/jZ++grQ3dKn+YUc0zzUMo0ZafDx6qvvwAYgZP1jdqEB4V4Kry4MRPm+PidGxTBuWxZT0LKakZzJkQJyOcWO6WF3JvvMF7C0qYE/R2W4Pl5EUHcvC7Byuyx7H2B68dnSU5lP/0bPgtBtqd8IRxXcasrBL7XnNewof0CSu+cHqEmDQ1QafVrohA+MZnpBMRuv73Yz4JGIjIokKCycmPKLtRqHB3kxtUyP19iZqGhsoulJB0ZUyzl0p42x5aa+Mzzc4diAz0rOYMWwEU9Iyuzx1g7Q3UPd/q5GNlV2q7613m5N4vSmlN+ADKBPX/GD1CQSjOgquLg9V+Lryeap2qC54VK12Bz6hXhKuB80Th6ZzzbBsZmeOInVgvLZ3oOnQ32k+/Lbu9s5klwrfbBjFZaf6utkv8CGgwJJ23bV3Aakexb5RMeHTCtX38AFIKblUU8XnRWd459BnHLh4nkibjfS4RK8PoiSNO38FXbzu05JFSGqklSMOd9cyv8EHUKQgOe9TbMIXsPB5SwrBvuKzfO/Dt7lv7W85UtLeVd9ZWYSsNzbXsJamWNzfV/sVPkCpUYTgcAdRMeHTChUY8Hn7P1N+mUf+94+sPejqsu+svazT0JgGi2Yfjz2GTwgQ8rxVSg63/SImfEELn7udQ0p+9elmahobuDPZP4+YYoRDz2oHHjuBD5BwQkEohzSiYsKnFSqw4VOX/2nvp2y/cEEngDFVSYvf4XMtyhNKhCPqpBRUelc34fMOFTzwufXakRM6QYzpvIxoz6PO2gP4ABQhTigf5+W1KEJuUlc34fMOFXzwIaBE2jjnMD7mjLd2Owb4HT7AWedw5CsAEvGhu7oJn3eo4ITPvfB+s7GZNr1VKy1sa1G/IfILfAAHPrl3TY0LQLv4AIQ04fMOFdzwAWxqieeMM0IncOd6o3kotdI9krPf4ANFbobW4dl25T1/XsA+Ez51qOCHD8AhBT9uGEaVtPrW70Qft8TzQYt7qlg/wucq/hg8xwd8vSvB2zeZ8AU6fO7VUmcYa+qzKHJ2/XpwQ0siv2xyTwbpZ/iEaLFZw7eBCkCLRXkDaPSoacIX9PC5Sy45I1hdl82bzUOoQ3+okFOOSL7XOIJfNaXR4qLFz0c+AU62rf/KQ9U+jmf96PE3QNxuwteBR9VqsMDnbcCKZJyllhFKIwnCThMK5djY54jlksdRshfgc+neTfes+h34zBPCa0hxuwmfjkfVarDCB9CC4IAjlgOOAXpWO/DYY/gabDbbW+4Vj3c1O7710y0IsU07iAlfKMCn57GP4EMg33WffkFjkHIheMY3iAmfCV/P4QMQCn9Qr/sA+OlTP9kA8pP2FiZ8Jnx+gg+OXltQ+6G6TLu7hBQ/dAc34VP/MOHztGEIPgTih3l5eU51uSaAO7793IcI8Z4Jn/qHCZ+nDWPwITg1MDptrXd13Q5jthbrw4BnX24TPhM+PY9tFTThA8mP1q5Y4TOTjy6AW7/7TIGEH3cUXO3KhM970YTPXSRhb1x0+h+1mnXYZTYuuu554IQJn1ZoEz7PCjpHPnAi+abW0Q86AXD9Q79oclqU20E0ayc14fOtYsKnLhJC/HbTPat2ajfuBECAnU88uxcpvqXlyoTPe9GEz7NIlDkIe0q7sUtdmsCiaNO2nemfzJkGYpQJn14VEz4v+KQU3LH5qw/v0w7gUtc+mxJIh0O5F+H6htiEz3vRhM8LPoCXNn31sXe1A7Sry9/t7fr2syUo4gYFUeWxwYTPhM+zIcDuuKhqz8s2HentOl3Nfv6pZUjxD8BiwmfCpwHfZalYpm+66+FC7SCeMjyJWdHG7SfTr59zUSjiJlVSn0XXqgmfR7sQh09CjcUpFm+8+5Hj2kF81a1Z9Io2bd+bsXiOBGWhpxu1ORM+j3YhDh/QLJA3b7jnsU+1g2ir29M4Fm3cviVj8Tw7sMiEz73pqoXPKYT8ysa7V72nHURfPZpHtGjjtm3Dls6tBbGk3Y4Jn0e70IevWUju3HD3qr9qB+lYPZ7ItnDDth3pi+dXCMESgVDafXnLhK8zj8EGn4QahLhl492P/UM7SOfS26WGNfeFp5dK6fwLAo2Blk34OvMYbPABJQLnjRvuXr1HO0jX5Lch4ret/sGHimQGCK87IBO+zjwGH3zyM6E4ZvUUPvAjgABbn3jmpEOxzAbxvqvEhK8zj0EGnwRerGiKmb3hrscLtIMYk97u7bHm/vTp+6QiXwRifRKa8AUjfGVC8rUN9zxm+E63I/UagAALXs4b3iIdryNZ0JbMhC/Y4JMI8Serw7pq/dceKtUO0H31KoAA5OUps2Nb7hOI7wshBuu7MOHryGM/wbdPSh7sqD9fT9X7ALZqwS/zYlqa5BqBfAyI8nRgwteRx36ALx/Jj+Oi0/+o15PZX+ozAN2a9dK3U61YvwPyLgRRJnwde+xj+A4JxLMDo9PW9jZ4Hjb6Q3NefTJeaYq4V0oeRMhMtSMTPq3NvQZfg0C+KxT+sOGuVR8ghNRu1DvqNwDdWv635ZaSC+NulJIVCJYJZLwJXy/DJ0QLUmwH+Uea7X/fdP+TVdqVe1/9DqBaC/LyrDJezJVS3gwsBUYh3K8LTfg6CO5lw6eBEzgghPynFHzU4HBu/eTeNTXelfpDAQWgt6b+Oi8qqonxilRyJc5JILKBoSBOLCIAAAArSURBVAiSgTAB8SZ8NAO1AlkJolYIUSuhSAiZL+G4IsSJOocjP1CA89b/AxP23jJKLGtLAAAAAElFTkSuQmCC"), "image/png", "qorvena-logo.png");
}

/** The appointment's start as a real moment in time, in the zone it was booked in. */
function startOf_(a) { return Utilities.parseDate(a.date + " " + a.time, a.timezone || Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"); }
function validTimezone_(tz) { try { Utilities.formatDate(new Date(), clean_(tz), "yyyy"); return clean_(tz); } catch (e) { return Session.getScriptTimeZone(); } }

/** Run from the editor to test that email works: sendTestEmail() */
function sendTestEmail() { return sendEmail_(Session.getEffectiveUser().getEmail(), "✅ " + APP_NAME + " email test", emailLayout_("Test", "It works!", "<p style='margin:0;font-size:16px;line-height:1.65;color:#2b3d39'>Reminder emails are set up and looking good. 🎉</p>", "Reminder emails are set up.")); }

/** Run from the editor to see all three emails (booked, updated, reminder) in your own inbox: sendPreviewEmails() */
function sendPreviewEmails() {
  const me = Session.getEffectiveUser().getEmail();
  const tz = Session.getScriptTimeZone();
  const when = new Date(Date.now() + 26 * 3600000);
  const a = { id: "APT-PREVIEW", title: "Dentist check-up", date: Utilities.formatDate(when, tz, "yyyy-MM-dd"), time: "09:30", timezone: tz, remindBefore: 1440, notes: "Bring your insurance card.\nArrive 10 minutes early." };
  const user = { fullName: "Alex Rivera", email: me };
  sendEmail_(me, "Booked: " + a.title, appointmentEmail_(user, a, "confirmation"), [icsBlob_(a)]);
  sendEmail_(me, "Updated: " + a.title, appointmentEmail_(user, a, "update"), [icsBlob_(a)]);
  sendEmail_(me, reminderSubject_(a), appointmentEmail_(user, a, "reminder"));
  sendEmail_(me, APP_NAME + " code: 123456", resetEmail_(user, "123456"));
  return "Sent 4 preview emails to " + me;
}

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
