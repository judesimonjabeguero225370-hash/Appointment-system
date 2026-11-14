/**
 * Daymark Appointment Scheduling API
 *
 * Bind this script to the Google Sheet used as the database. Run setup() once,
 * then deploy the script as a Web app and point the Vercel project at its URL.
 */

const SHEETS = {
  appointments: "Appointments",
  services: "Services",
  staff: "Staff"
};

const HEADERS = {
  Appointments: [
    "id", "customerName", "customerEmail", "customerPhone", "serviceId", "staffId",
    "date", "time", "status", "notes", "createdAt", "updatedAt"
  ],
  Services: [
    "id", "name", "duration", "price", "active", "description", "createdAt", "updatedAt"
  ],
  Staff: [
    "id", "name", "email", "role", "active", "createdAt", "updatedAt"
  ]
};

const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed"];
const ALL_APPOINTMENT_STATUSES = ["pending", "confirmed", "completed", "canceled", "no-show"];

function setup() {
  setupSheets_();
  return "Sheets are ready. You can now deploy this script as a Web app.";
}

function setupSheets_() {
  const spreadsheet = getDatabase_();
  Object.keys(HEADERS).forEach(function(sheetName) {
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);
    const headers = HEADERS[sheetName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground("#315c57")
      .setFontColor("#ffffff")
      .setFontWeight("bold");
    sheet.autoResizeColumns(1, headers.length);
  });
}

function doGet(event) {
  try {
    const action = event && event.parameter && event.parameter.action
      ? event.parameter.action
      : "health";
    authorize_(event && event.parameter ? event.parameter.apiKey : "");
    const data = event && event.parameter ? event.parameter : {};
    return json_({ success: true, data: handleAction_(action, data) });
  } catch (error) {
    return json_({ success: false, error: error.message || String(error) });
  }
}

function doPost(event) {
  try {
    const body = event && event.postData && event.postData.contents
      ? JSON.parse(event.postData.contents)
      : {};
    authorize_(body.apiKey || "");
    return json_({ success: true, data: handleAction_(body.action, body.data || {}) });
  } catch (error) {
    return json_({ success: false, error: error.message || String(error) });
  }
}

function handleAction_(action, data) {
  switch (action) {
    case "health":
      return { status: "ok", service: "Daymark Apps Script API", timestamp: new Date().toISOString() };
    case "setup":
      setupSheets_();
      return { status: "ok" };
    case "getDashboard":
      return {
        appointments: readRecords_(SHEETS.appointments),
        services: readRecords_(SHEETS.services),
        staff: readRecords_(SHEETS.staff)
      };
    case "listAppointments":
      return { appointments: listAppointments_(data) };
    case "createAppointment":
      return { appointment: createAppointment_(data) };
    case "updateAppointment":
      return { appointment: updateAppointment_(data) };
    case "cancelAppointment":
      return { appointment: updateAppointment_(Object.assign({}, data, { status: "canceled" })) };
    case "listServices":
      return { services: readRecords_(SHEETS.services) };
    case "createService":
      return { service: createService_(data) };
    case "updateService":
      return { service: updateService_(data) };
    case "listStaff":
      return { staff: readRecords_(SHEETS.staff) };
    case "createStaff":
      return { staff: createStaff_(data) };
    case "updateStaff":
      return { staff: updateStaff_(data) };
    default:
      throw new Error("Unknown action: " + action);
  }
}

function createAppointment_(input) {
  const data = normalizeAppointment_(input);
  validateAppointment_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const appointments = readRecords_(SHEETS.appointments);
    ensureNoConflict_(appointments, data);
    const now = new Date().toISOString();
    const record = Object.assign({
      id: makeId_("APT"),
      createdAt: now,
      updatedAt: now
    }, data);
    appendRecord_(SHEETS.appointments, record);
    return record;
  } finally {
    lock.releaseLock();
  }
}

function updateAppointment_(input) {
  if (!input.id) throw new Error("Appointment id is required.");
  const current = findRecord_(SHEETS.appointments, input.id);
  if (!current) throw new Error("Appointment not found.");
  const data = normalizeAppointment_(Object.assign({}, current, input));
  validateAppointment_(data);
  const appointments = readRecords_(SHEETS.appointments);
  ensureNoConflict_(appointments, data);
  const record = Object.assign({}, current, data, { id: current.id, updatedAt: new Date().toISOString() });
  updateRecord_(SHEETS.appointments, record);
  return record;
}

function listAppointments_(filter) {
  let records = readRecords_(SHEETS.appointments);
  if (filter.status) records = records.filter(function(item) { return item.status === filter.status; });
  if (filter.date) records = records.filter(function(item) { return item.date === filter.date; });
  return records;
}

function createService_(input) {
  const data = normalizeService_(input);
  validateService_(data);
  const now = new Date().toISOString();
  const record = Object.assign({ id: makeId_("SRV"), createdAt: now, updatedAt: now }, data);
  appendRecord_(SHEETS.services, record);
  return record;
}

function updateService_(input) {
  if (!input.id) throw new Error("Service id is required.");
  const current = findRecord_(SHEETS.services, input.id);
  if (!current) throw new Error("Service not found.");
  const data = normalizeService_(Object.assign({}, current, input));
  validateService_(data);
  const record = Object.assign({}, current, data, { id: current.id, updatedAt: new Date().toISOString() });
  updateRecord_(SHEETS.services, record);
  return record;
}

function createStaff_(input) {
  const data = normalizeStaff_(input);
  validateStaff_(data);
  const now = new Date().toISOString();
  const record = Object.assign({ id: makeId_("STF"), createdAt: now, updatedAt: now }, data);
  appendRecord_(SHEETS.staff, record);
  return record;
}

function updateStaff_(input) {
  if (!input.id) throw new Error("Staff id is required.");
  const current = findRecord_(SHEETS.staff, input.id);
  if (!current) throw new Error("Staff member not found.");
  const data = normalizeStaff_(Object.assign({}, current, input));
  validateStaff_(data);
  const record = Object.assign({}, current, data, { id: current.id, updatedAt: new Date().toISOString() });
  updateRecord_(SHEETS.staff, record);
  return record;
}

function normalizeAppointment_(input) {
  return {
    customerName: clean_(input.customerName),
    customerEmail: clean_(input.customerEmail),
    customerPhone: clean_(input.customerPhone),
    serviceId: clean_(input.serviceId),
    staffId: clean_(input.staffId),
    date: clean_(input.date),
    time: clean_(input.time),
    status: clean_(input.status || "pending").toLowerCase(),
    notes: clean_(input.notes)
  };
}

function normalizeService_(input) {
  return {
    name: clean_(input.name),
    duration: Number(input.duration || 0),
    price: Number(input.price || 0),
    active: toBoolean_(input.active),
    description: clean_(input.description)
  };
}

function normalizeStaff_(input) {
  return {
    name: clean_(input.name),
    email: clean_(input.email),
    role: clean_(input.role),
    active: toBoolean_(input.active)
  };
}

function validateAppointment_(data) {
  if (!data.customerName) throw new Error("Customer name is required.");
  if (!data.serviceId) throw new Error("A service is required.");
  if (!data.staffId) throw new Error("A staff member is required.");
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(data.date)) throw new Error("Use a valid date in YYYY-MM-DD format.");
  if (!/^\\d{2}:\\d{2}$/.test(data.time)) throw new Error("Use a valid time in HH:MM format.");
  if (ALL_APPOINTMENT_STATUSES.indexOf(data.status) === -1) throw new Error("Invalid appointment status.");
}

function validateService_(data) {
  if (!data.name) throw new Error("Service name is required.");
  if (!data.duration || data.duration < 5) throw new Error("Service duration must be at least 5 minutes.");
  if (data.price < 0) throw new Error("Service price cannot be negative.");
}

function validateStaff_(data) {
  if (!data.name) throw new Error("Staff name is required.");
}

function ensureNoConflict_(appointments, candidate) {
  if (ACTIVE_APPOINTMENT_STATUSES.indexOf(candidate.status) === -1) return;
  const conflict = appointments.some(function(item) {
    return item.id !== candidate.id && item.staffId === candidate.staffId && item.date === candidate.date && item.time === candidate.time && ACTIVE_APPOINTMENT_STATUSES.indexOf(item.status) !== -1;
  });
  if (conflict) throw new Error("That staff member already has an active appointment at this date and time.");
}

function readRecords_(sheetName) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing sheet: " + sheetName + ". Run setup() first.");
  const headers = HEADERS[sheetName];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.filter(function(row) { return row.some(function(value) { return value !== ""; }); }).map(function(row) {
    const record = {};
    headers.forEach(function(header, index) { record[header] = serializeCell_(row[index], header); });
    return record;
  });
}

function findRecord_(sheetName, id) {
  return readRecords_(sheetName).find(function(item) { return item.id === id; }) || null;
}

function appendRecord_(sheetName, record) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  if (!sheet) throw new Error("Missing sheet: " + sheetName + ". Run setup() first.");
  sheet.appendRow(recordToRow_(sheetName, record));
}

function updateRecord_(sheetName, record) {
  const sheet = getDatabase_().getSheetByName(sheetName);
  const range = sheet.getDataRange();
  const values = range.getValues();
  const headers = HEADERS[sheetName];
  const idColumn = headers.indexOf("id");
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][idColumn]) === String(record.id)) {
      sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([recordToRow_(sheetName, record)]);
      return;
    }
  }
  throw new Error("Record not found.");
}

function recordToRow_(sheetName, record) {
  return HEADERS[sheetName].map(function(header) { return record[header] === undefined ? "" : record[header]; });
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
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function authorize_(providedKey) {
  const expectedKey = PropertiesService.getScriptProperties().getProperty("API_KEY") || "";
  if (expectedKey && expectedKey !== String(providedKey || "")) throw new Error("Unauthorized request.");
}

function makeId_(prefix) {
  return prefix + "-" + Utilities.getUuid().split("-")[0].toUpperCase();
}

function clean_(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function toBoolean_(value) {
  return value === true || String(value).toLowerCase() === "true" || String(value) === "1";
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
