/**
 * FacultyFlow Appointment Scheduler API
 *
 * Roles: admin, teacher, student.
 * Passwords are stored as salted SHA-256 hashes. Sessions are stored in Sheets.
 * Bind this script to a Google Sheet or configure SPREADSHEET_ID in Script Properties.
 */

const SHEETS = {
  appointments: "Appointments",
  services: "Services",
  staff: "Staff",
  users: "Users",
  sessions: "Sessions",
  passwordResetRequests: "PasswordResetRequests"
};

const HEADERS = {
  Appointments: ["id", "customerName", "customerEmail", "customerPhone", "serviceId", "staffId", "date", "time", "status", "notes", "createdAt", "updatedAt"],
  Services: ["id", "name", "duration", "price", "active", "description", "createdAt", "updatedAt"],
  Staff: ["id", "name", "email", "role", "active", "createdAt", "updatedAt"],
  Users: ["id", "fullName", "email", "passwordHash", "role", "department", "teacherId", "active", "createdAt", "updatedAt"],
  Sessions: ["token", "userId", "expiresAt", "createdAt"],
  PasswordResetRequests: ["id", "email", "requestedAt", "status", "processedBy", "processedAt"]
};

const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed"];
const ALL_APPOINTMENT_STATUSES = ["pending", "confirmed", "completed", "canceled", "no-show"];
const USER_ROLES = ["admin", "teacher", "student"];
const SESSION_HOURS = 8;

function setup() {
  setupSheets_();
  return "FacultyFlow sheets are ready. Create an admin with createAdminUser(email, password, fullName, department), then deploy the Web app.";
}

/** Run once from the Apps Script editor, for example:
 * createAdminUser("admin@university.edu", "ChangeThisPassword123!", "System Administrator", "Computer Science");
 */
function createAdminUser(email, password, fullName, department) {
  setupSheets_();
  return createUser_({ email: email, password: password, fullName: fullName, role: "admin", department: department || "Computer Science", active: true });
}

function setupSheets_() {
  const spreadsheet = getDatabase_();
  Object.keys(HEADERS).forEach(function(sheetName) {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    const headers = HEADERS[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setBackground("#315c57").setFontColor("#ffffff").setFontWeight("bold");
    sheet.autoResizeColumns(1, headers.length);
  });
}

function doGet(event) {
  try {
    const action = event && event.parameter && event.parameter.action ? event.parameter.action : "health";
    authorize_(event && event.parameter ? event.parameter.apiKey : "");
    const data = event && event.parameter ? event.parameter : {};
    return json_({ success: true, data: handleAction_(action, data) });
  } catch (error) {
    return json_({ success: false, error: error.message || String(error) });
  }
}

function doPost(event) {
  try {
    const body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {};
    authorize_(body.apiKey || "");
    return json_({ success: true, data: handleAction_(body.action, body.data || {}) });
  } catch (error) {
    return json_({ success: false, error: error.message || String(error) });
  }
}

function handleAction_(action, data) {
  switch (action) {
    case "health":
      return { status: "ok", service: "FacultyFlow Apps Script API", timestamp: new Date().toISOString() };
    case "setup":
      setupSheets_();
      return { status: "ok" };
    case "login":
      return login_(data);
    case "register":
      return register_(data);
    case "logout":
      return logout_(data);
    case "requestPasswordReset":
      return requestPasswordReset_(data);
    case "me":
      return { user: requireUser_(data) };
    case "getDashboard": {
      const user = requireUser_(data);
      return { appointments: scopedAppointments_(user), services: readRecords_(SHEETS.services), staff: readRecords_(SHEETS.staff), currentUser: user };
    }
    case "listAppointments": {
      const user = requireUser_(data);
      return { appointments: filterAppointments_(scopedAppointments_(user), data) };
    }
    case "createAppointment": {
      const user = requireUser_(data);
      return { appointment: createAppointment_(data, user) };
    }
    case "updateAppointment": {
      const user = requireUser_(data);
      return { appointment: updateAppointment_(data, user) };
    }
    case "cancelAppointment": {
      const user = requireUser_(data);
      return { appointment: updateAppointment_(Object.assign({}, data, { status: "canceled" }), user) };
    }
    case "listServices":
      requireUser_(data);
      return { services: readRecords_(SHEETS.services) };
    case "createService":
      requireRole_(data, "admin");
      return { service: createService_(data) };
    case "updateService":
      requireRole_(data, "admin");
      return { service: updateService_(data) };
    case "listStaff":
      requireUser_(data);
      return { staff: readRecords_(SHEETS.staff) };
    case "createStaff":
      requireRole_(data, "admin");
      return { staff: createStaff_(data) };
    case "updateStaff":
      requireRole_(data, "admin");
      return { staff: updateStaff_(data) };
    case "listUsers":
      requireRole_(data, "admin");
      return { users: readRecords_(SHEETS.users).map(safeUser_) };
    case "createUser":
      requireRole_(data, "admin");
      return { user: createUser_(data) };
    case "updateUser":
      requireRole_(data, "admin");
      return { user: updateUser_(data) };
    case "listPasswordResetRequests":
      requireRole_(data, "admin");
      return { requests: readRecords_(SHEETS.passwordResetRequests) };
    default:
      throw new Error("Unknown action: " + action);
  }
}

function login_(input) {
  const email = clean_(input.email).toLowerCase();
  const password = clean_(input.password);
  if (!email || !password) throw new Error("Email and password are required.");
  const users = readRecords_(SHEETS.users);
  if (!users.length) throw new Error("No user accounts exist yet. Run setup(), then createAdminUser(...) in Apps Script before signing in.");
  const user = users.find(function(item) { return String(item.email).toLowerCase() === email && item.active; });
  if (!user || !verifyPassword_(password, user.passwordHash)) throw new Error("Invalid email or password.");
  purgeExpiredSessions_();
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  appendRecord_(SHEETS.sessions, { token: token, userId: user.id, expiresAt: expiresAt, createdAt: new Date().toISOString() });
  return { token: token, expiresAt: expiresAt, user: safeUser_(user) };
}

/**
 * Public self-service sign-up. Always creates a STUDENT account, so nobody can
 * grant themselves teacher/admin rights. Signs the new user in straight away.
 * Optional Script Properties:
 *   ALLOW_SIGNUP = "false"            -> turns public sign-up off
 *   ALLOWED_EMAIL_DOMAIN = "uni.edu"  -> only that email domain may sign up
 */
function register_(input) {
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty("ALLOW_SIGNUP") || "true").toLowerCase() === "false") throw new Error("Sign-up is turned off. Please ask your department administrator for an account.");
  const email = clean_(input.email).toLowerCase();
  const domain = clean_(props.getProperty("ALLOWED_EMAIL_DOMAIN")).toLowerCase().replace(/^@/, "");
  if (domain && email.split("@")[1] !== domain) throw new Error("Please sign up with your university email (@" + domain + ").");
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    createUser_({ fullName: input.fullName, email: email, password: input.password, role: "student", department: input.department || "Computer Science", teacherId: "", active: true });
  } finally { lock.releaseLock(); }
  return login_({ email: email, password: input.password });
}

function logout_(input) {
  const token = clean_(input.token);
  if (!token) return { status: "ok" };
  const sheet = getDatabase_().getSheetByName(SHEETS.sessions);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (String(values[i][0]) === token) { sheet.deleteRow(i + 1); break; }
  }
  return { status: "ok" };
}

function requestPasswordReset_(input) {
  const email = clean_(input.email).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid university email address.");
  const exists = readRecords_(SHEETS.users).some(function(item) { return String(item.email).toLowerCase() === email; });
  if (exists) appendRecord_(SHEETS.passwordResetRequests, { id: makeId_("RST"), email: email, requestedAt: new Date().toISOString(), status: "open", processedBy: "", processedAt: "" });
  return { message: "If an account exists for that email, your department administrator will review the request." };
}

function purgeExpiredSessions_() {
  const sheet = getDatabase_().getSheetByName(SHEETS.sessions);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i -= 1) {
    if (new Date(values[i][2]).getTime() <= Date.now()) sheet.deleteRow(i + 1);
  }
}

function requireUser_(data) {
  const token = clean_(data.token);
  if (!token) throw new Error("Authentication required. Please sign in.");
  const session = readRecords_(SHEETS.sessions).find(function(item) { return item.token === token; });
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) throw new Error("Your session has expired. Please sign in again.");
  const user = readRecords_(SHEETS.users).find(function(item) { return item.id === session.userId && item.active; });
  if (!user) throw new Error("This account is inactive or no longer exists.");
  return safeUser_(user);
}

function requireRole_(data, role) {
  const user = requireUser_(data);
  if (user.role !== role) throw new Error("Administrator access is required for this action.");
  return user;
}

function safeUser_(user) {
  return { id: user.id, fullName: user.fullName, email: user.email, role: user.role, department: user.department, teacherId: user.teacherId || "", active: Boolean(user.active) };
}

function createUser_(input) {
  const data = normalizeUser_(input);
  validateUser_(data, false);
  if (readRecords_(SHEETS.users).some(function(item) { return String(item.email).toLowerCase() === data.email; })) throw new Error("An account with this email already exists. Try signing in instead.");
  const now = new Date().toISOString();
  const record = { id: makeId_("USR"), fullName: data.fullName, email: data.email, passwordHash: hashPassword_(data.password), role: data.role, department: data.department, teacherId: data.teacherId, active: data.active, createdAt: now, updatedAt: now };
  appendRecord_(SHEETS.users, record);
  return safeUser_(record);
}

function updateUser_(input) {
  if (!input.id) throw new Error("User id is required.");
  const current = findRecord_(SHEETS.users, input.id);
  if (!current) throw new Error("User not found.");
  const data = normalizeUser_(Object.assign({}, current, input));
  validateUser_(data, true);
  const record = Object.assign({}, current, { fullName: data.fullName, email: data.email, role: data.role, department: data.department, teacherId: data.teacherId, active: data.active, updatedAt: new Date().toISOString() });
  if (data.password) record.passwordHash = hashPassword_(data.password);
  updateRecord_(SHEETS.users, record);
  return safeUser_(record);
}

function normalizeUser_(input) {
  return { fullName: clean_(input.fullName), email: clean_(input.email).toLowerCase(), password: clean_(input.password), role: clean_(input.role || "student").toLowerCase(), department: clean_(input.department || "Computer Science"), teacherId: clean_(input.teacherId), active: input.active === undefined ? true : toBoolean_(input.active) };
}

function validateUser_(data, updating) {
  if (!data.fullName) throw new Error("Full name is required.");
  if (!/^\S+@\S+\.\S+$/.test(data.email)) throw new Error("A valid email is required.");
  if (USER_ROLES.indexOf(data.role) === -1) throw new Error("Invalid user role.");
  if (!updating && data.password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (updating && data.password && data.password.length < 8) throw new Error("Password must be at least 8 characters.");
}

function hashPassword_(password, salt) {
  const actualSalt = salt || Utilities.getUuid();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, actualSalt + password, Utilities.Charset.UTF_8);
  return actualSalt + "$" + bytesToHex_(digest);
}

function verifyPassword_(password, storedHash) {
  const parts = clean_(storedHash).split("$");
  if (parts.length !== 2) return false;
  return hashPassword_(password, parts[0]) === storedHash;
}

function bytesToHex_(bytes) {
  return bytes.map(function(byte) { const value = byte < 0 ? byte + 256 : byte; return (value < 16 ? "0" : "") + value.toString(16); }).join("");
}

function createAppointment_(input, user) {
  if (user.role === "teacher" && !user.teacherId) throw new Error("This teacher account is not linked to a teacher profile. Ask an administrator to link it first.");
  const candidate = Object.assign({}, input);
  if (user.role === "student") { candidate.customerEmail = user.email; candidate.status = "pending"; }
  if (user.role === "teacher" && user.teacherId) candidate.staffId = user.teacherId;
  const data = normalizeAppointment_(candidate);
  validateAppointment_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const appointments = readRecords_(SHEETS.appointments);
    ensureNoConflict_(appointments, data);
    const now = new Date().toISOString();
    const record = Object.assign({ id: makeId_("APT"), createdAt: now, updatedAt: now }, data);
    appendRecord_(SHEETS.appointments, record);
    return record;
  } finally { lock.releaseLock(); }
}

function updateAppointment_(input, user) {
  if (!input.id) throw new Error("Appointment id is required.");
  const current = findRecord_(SHEETS.appointments, input.id);
  if (!current) throw new Error("Appointment not found.");
  assertAppointmentAccess_(user, current);
  if (user.role === "teacher" && !user.teacherId) throw new Error("This teacher account is not linked to a teacher profile.");
  if (user.role === "student" && input.status && input.status !== current.status && input.status !== "canceled") throw new Error("Students can only cancel their own appointment; a teacher or administrator changes other statuses.");
  const candidate = Object.assign({}, current, input);
  if (user.role === "teacher" && user.teacherId) candidate.staffId = user.teacherId;
  if (user.role === "student") candidate.customerEmail = user.email;
  const data = normalizeAppointment_(candidate);
  validateAppointment_(data);
  ensureNoConflict_(readRecords_(SHEETS.appointments), data);
  const record = Object.assign({}, current, data, { id: current.id, updatedAt: new Date().toISOString() });
  updateRecord_(SHEETS.appointments, record);
  return record;
}

function assertAppointmentAccess_(user, appointment) {
  if (user.role === "admin") return;
  if (user.role === "teacher" && appointment.staffId === user.teacherId) return;
  if (user.role === "student" && String(appointment.customerEmail).toLowerCase() === String(user.email).toLowerCase()) return;
  throw new Error("You do not have permission to change this appointment.");
}

function scopedAppointments_(user) {
  const all = readRecords_(SHEETS.appointments);
  if (user.role === "admin") return all;
  if (user.role === "teacher") return all.filter(function(item) { return item.staffId === user.teacherId; });
  return all.filter(function(item) { return String(item.customerEmail).toLowerCase() === String(user.email).toLowerCase(); });
}

function filterAppointments_(records, filter) {
  let result = records;
  if (filter.status) result = result.filter(function(item) { return item.status === filter.status; });
  if (filter.date) result = result.filter(function(item) { return item.date === filter.date; });
  return result;
}

function createService_(input) {
  const data = normalizeService_(input); validateService_(data); const now = new Date().toISOString();
  const record = Object.assign({ id: makeId_("SRV"), createdAt: now, updatedAt: now }, data); appendRecord_(SHEETS.services, record); return record;
}
function updateService_(input) {
  if (!input.id) throw new Error("Service id is required."); const current = findRecord_(SHEETS.services, input.id); if (!current) throw new Error("Service not found.");
  const data = normalizeService_(Object.assign({}, current, input)); validateService_(data); const record = Object.assign({}, current, data, { id: current.id, updatedAt: new Date().toISOString() }); updateRecord_(SHEETS.services, record); return record;
}
function createStaff_(input) {
  const data = normalizeStaff_(input); validateStaff_(data); const now = new Date().toISOString();
  const record = Object.assign({ id: makeId_("STF"), createdAt: now, updatedAt: now }, data); appendRecord_(SHEETS.staff, record); return record;
}
function updateStaff_(input) {
  if (!input.id) throw new Error("Staff id is required."); const current = findRecord_(SHEETS.staff, input.id); if (!current) throw new Error("Staff member not found.");
  const data = normalizeStaff_(Object.assign({}, current, input)); validateStaff_(data); const record = Object.assign({}, current, data, { id: current.id, updatedAt: new Date().toISOString() }); updateRecord_(SHEETS.staff, record); return record;
}

function normalizeAppointment_(input) { return { customerName: clean_(input.customerName), customerEmail: clean_(input.customerEmail), customerPhone: clean_(input.customerPhone), serviceId: clean_(input.serviceId), staffId: clean_(input.staffId), date: clean_(input.date), time: clean_(input.time), status: clean_(input.status || "pending").toLowerCase(), notes: clean_(input.notes) }; }
function normalizeService_(input) { return { name: clean_(input.name), duration: Number(input.duration || 0), price: Number(input.price || 0), active: toBoolean_(input.active), description: clean_(input.description) }; }
function normalizeStaff_(input) { return { name: clean_(input.name), email: clean_(input.email), role: clean_(input.role), active: toBoolean_(input.active) }; }
function validateAppointment_(data) { if (!data.customerName) throw new Error("Student name is required."); if (!data.serviceId) throw new Error("An advising type is required."); if (!data.staffId) throw new Error("A teacher is required."); if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Use a valid date in YYYY-MM-DD format."); if (!/^\d{2}:\d{2}$/.test(data.time)) throw new Error("Use a valid time in HH:MM format."); if (ALL_APPOINTMENT_STATUSES.indexOf(data.status) === -1) throw new Error("Invalid appointment status."); }
function validateService_(data) { if (!data.name) throw new Error("Advising type name is required."); if (!data.duration || data.duration < 5) throw new Error("Duration must be at least 5 minutes."); if (data.price < 0) throw new Error("Price cannot be negative."); }
function validateStaff_(data) { if (!data.name) throw new Error("Teacher name is required."); }
function ensureNoConflict_(appointments, candidate) { if (ACTIVE_APPOINTMENT_STATUSES.indexOf(candidate.status) === -1) return; const conflict = appointments.some(function(item) { return item.id !== candidate.id && item.staffId === candidate.staffId && item.date === candidate.date && item.time === candidate.time && ACTIVE_APPOINTMENT_STATUSES.indexOf(item.status) !== -1; }); if (conflict) throw new Error("That teacher already has an active appointment at this date and time."); }

function readRecords_(sheetName) {
  const sheet = getDatabase_().getSheetByName(sheetName); if (!sheet) throw new Error("Missing sheet: " + sheetName + ". Run setup() first.");
  const headers = HEADERS[sheetName]; const lastRow = sheet.getLastRow(); if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.filter(function(row) { return row.some(function(value) { return value !== ""; }); }).map(function(row) { const record = {}; headers.forEach(function(header, index) { record[header] = serializeCell_(row[index], header); }); return record; });
}
function findRecord_(sheetName, id) { return readRecords_(sheetName).find(function(item) { return item.id === id; }) || null; }
function appendRecord_(sheetName, record) { const sheet = getDatabase_().getSheetByName(sheetName); if (!sheet) throw new Error("Missing sheet: " + sheetName + ". Run setup() first."); sheet.appendRow(recordToRow_(sheetName, record)); }
function updateRecord_(sheetName, record) { const sheet = getDatabase_().getSheetByName(sheetName); const values = sheet.getDataRange().getValues(); const headers = HEADERS[sheetName]; const idColumn = headers.indexOf(sheetName === "Sessions" ? "token" : "id"); const recordId = sheetName === "Sessions" ? record.token : record.id; for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) { if (String(values[rowIndex][idColumn]) === String(recordId)) { sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([recordToRow_(sheetName, record)]); return; } } throw new Error("Record not found."); }
function recordToRow_(sheetName, record) { return HEADERS[sheetName].map(function(header) { return record[header] === undefined ? "" : record[header]; }); }
function serializeCell_(value, header) { if (value instanceof Date) { if (header === "date") return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd"); if (header === "time") return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm"); return value.toISOString(); } if (header === "active") return value === true || String(value).toLowerCase() === "true"; return value === null || value === undefined ? "" : String(value); }
function getDatabase_() { const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID"); if (id) { try { return SpreadsheetApp.openById(id); } catch (error) { throw new Error("SPREADSHEET_ID is not valid or this account cannot access the Sheet."); } } const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet(); if (activeSpreadsheet) return activeSpreadsheet; throw new Error("No Google Sheet is connected. Bind this script from Google Sheets via Extensions > Apps Script, or add the Sheet ID as a Script property named SPREADSHEET_ID."); }
function authorize_(providedKey) { const expectedKey = PropertiesService.getScriptProperties().getProperty("API_KEY") || ""; if (expectedKey && expectedKey !== String(providedKey || "")) throw new Error("Unauthorized request."); }
function makeId_(prefix) { return prefix + "-" + Utilities.getUuid().split("-")[0].toUpperCase(); }
function clean_(value) { return value === undefined || value === null ? "" : String(value).trim(); }
function toBoolean_(value) { return value === true || String(value).toLowerCase() === "true" || String(value) === "1"; }
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
