const directAppsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL || "";
const apiEndpoint = directAppsScriptUrl || "/api/apps-script";

export const isConfigured = Boolean(directAppsScriptUrl || import.meta.env.PROD);

const demoServices = [
  { id: "SRV-001", name: "Initial consultation", duration: 45, price: 65, active: true, description: "A focused first visit to understand needs and outline next steps." },
  { id: "SRV-002", name: "Follow-up session", duration: 30, price: 40, active: true, description: "A shorter session for progress checks and ongoing support." },
  { id: "SRV-003", name: "Extended planning", duration: 60, price: 90, active: true, description: "A longer working session for complex plans and decisions." }
];

const demoStaff = [
  { id: "STF-001", name: "Maya Chen", email: "maya@example.com", role: "Lead consultant", active: true },
  { id: "STF-002", name: "Jordan Ellis", email: "jordan@example.com", role: "Senior consultant", active: true },
  { id: "STF-003", name: "Avery Morgan", email: "avery@example.com", role: "Coordinator", active: true }
];

function isoDay(offset) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const demoAppointments = [
  { id: "APT-1001", customerName: "Elena Rodriguez", customerEmail: "elena@example.com", customerPhone: "+1 555 014 2040", serviceId: "SRV-001", staffId: "STF-001", date: isoDay(0), time: "09:30", status: "confirmed", notes: "Bring the intake form." },
  { id: "APT-1002", customerName: "Marcus Lee", customerEmail: "marcus@example.com", customerPhone: "+1 555 014 9012", serviceId: "SRV-003", staffId: "STF-002", date: isoDay(1), time: "11:00", status: "pending", notes: "Prefers a quieter room." },
  { id: "APT-1003", customerName: "Priya Shah", customerEmail: "priya@example.com", customerPhone: "+1 555 014 8891", serviceId: "SRV-002", staffId: "STF-001", date: isoDay(1), time: "14:30", status: "confirmed", notes: "Follow-up from October visit." },
  { id: "APT-1004", customerName: "Theo Williams", customerEmail: "theo@example.com", customerPhone: "+1 555 014 7764", serviceId: "SRV-001", staffId: "STF-003", date: isoDay(3), time: "10:00", status: "pending", notes: "New customer." },
  { id: "APT-1005", customerName: "Samira Patel", customerEmail: "samira@example.com", customerPhone: "+1 555 014 1178", serviceId: "SRV-002", staffId: "STF-002", date: isoDay(-3), time: "13:00", status: "completed", notes: "" }
];

export const demoData = {
  appointments: demoAppointments,
  services: demoServices,
  staff: demoStaff
};

function parseResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The backend returned an unreadable response. Check your Apps Script deployment.");
  }
}

export async function apiCall(action, data = {}) {
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data })
  });

  const body = parseResponse(await response.text());
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Request failed with status ${response.status}.`);
  }
  return body.data ?? body;
}

export function lookupService(services, id) {
  return services.find((service) => service.id === id)?.name || "Unassigned service";
}

export function lookupStaff(staff, id) {
  return staff.find((person) => person.id === id)?.name || "Unassigned staff";
}
