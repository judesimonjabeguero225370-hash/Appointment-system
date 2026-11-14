const directAppsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL || "";
const apiEndpoint = directAppsScriptUrl || "/api/apps-script";

export const isConfigured = Boolean(directAppsScriptUrl || import.meta.env.PROD);
export const demoUser = { id: "demo-admin", fullName: "Demo administrator", email: "admin@demo.local", role: "admin", department: "Computer Science", active: true };

const demoServices = [
  { id: "SRV-001", name: "Thesis advising", duration: 45, price: 0, active: true, description: "Research direction, methodology, and thesis milestones." },
  { id: "SRV-002", name: "Capstone consultation", duration: 30, price: 0, active: true, description: "Project architecture, implementation, and presentation guidance." },
  { id: "SRV-003", name: "Code review clinic", duration: 60, price: 0, active: true, description: "Focused feedback on software design, code quality, and testing." }
];

const demoStaff = [
  { id: "STF-001", name: "Dr. Maya Chen", email: "maya.chen@university.edu", role: "Software Engineering", active: true },
  { id: "STF-002", name: "Dr. Jordan Ellis", email: "jordan.ellis@university.edu", role: "Data Science", active: true },
  { id: "STF-003", name: "Prof. Avery Morgan", email: "avery.morgan@university.edu", role: "Networks and Security", active: true }
];

function isoDay(offset) {
  const date = new Date();
  date.setHours(10, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const demoAppointments = [
  { id: "APT-1001", customerName: "Elena Rodriguez", customerEmail: "elena@students.university.edu", customerPhone: "+1 555 014 2040", serviceId: "SRV-001", staffId: "STF-001", date: isoDay(0), time: "09:30", status: "confirmed", notes: "Bring the literature review draft." },
  { id: "APT-1002", customerName: "Marcus Lee", customerEmail: "marcus@students.university.edu", customerPhone: "+1 555 014 9012", serviceId: "SRV-003", staffId: "STF-002", date: isoDay(1), time: "11:00", status: "pending", notes: "Review model evaluation results." },
  { id: "APT-1003", customerName: "Priya Shah", customerEmail: "priya@students.university.edu", customerPhone: "+1 555 014 8891", serviceId: "SRV-002", staffId: "STF-001", date: isoDay(1), time: "14:30", status: "confirmed", notes: "Follow-up on the capstone API." },
  { id: "APT-1004", customerName: "Theo Williams", customerEmail: "theo@students.university.edu", customerPhone: "+1 555 014 7764", serviceId: "SRV-001", staffId: "STF-003", date: isoDay(3), time: "10:00", status: "pending", notes: "Final-year project planning." },
  { id: "APT-1005", customerName: "Samira Patel", customerEmail: "samira@students.university.edu", customerPhone: "+1 555 014 1178", serviceId: "SRV-002", staffId: "STF-002", date: isoDay(-3), time: "13:00", status: "completed", notes: "" }
];

export const demoData = { appointments: demoAppointments, services: demoServices, staff: demoStaff, users: [demoUser] };

function parseResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The backend returned an unreadable response. Check your Apps Script deployment.");
  }
}

export async function apiCall(action, data = {}, token = "") {
  const payload = { ...data };
  if (token) payload.token = token;
  const response = await fetch(apiEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data: payload })
  });

  const body = parseResponse(await response.text());
  if (!response.ok || body.success === false) {
    throw new Error(body.error || `Request failed with status ${response.status}.`);
  }
  return body.data ?? body;
}

export function lookupService(services, id) {
  return services.find((service) => service.id === id)?.name || "Unassigned advising type";
}

export function lookupStaff(staff, id) {
  return staff.find((person) => person.id === id)?.name || "Unassigned teacher";
}
