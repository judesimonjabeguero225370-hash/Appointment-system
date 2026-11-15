export const config = { maxDuration: 30 };   // Apps Script + sending an email can take longer than Vercel's 10s default

// Only these actions may be forwarded. Anything else is rejected here, before it ever reaches the backend.
const ACTIONS = new Set([
  "health", "register", "login", "logout", "me", "requestPasswordReset", "resetPassword",
  "adminLogin", "adminLogout", "adminChangePassword", "adminOverview", "adminSetUserActive", "adminDeleteUser", "adminSendReset",
  "adminDeleteAppointment", "adminSetAppointmentStatus",
  "listAppointments", "createAppointment", "updateAppointment", "deleteAppointment"
]);
const SENSITIVE = new Set(["register", "login", "requestPasswordReset", "resetPassword", "adminLogin", "adminChangePassword"]);
const MAX_BODY_BYTES = 40 * 1024;

// Best-effort rate limit per visitor address (memory is per serverless instance, so this slows abuse down; the backend enforces the strict limits).
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.start > windowMs) { hits.set(key, { start: now, count: 1 }); return false; }
  entry.count += 1;
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  return entry.count > max;
}

function clientIp(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || request.socket?.remoteAddress || "unknown").slice(0, 64);
}

function fail(response, status, message) {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json({ success: false, error: message });
}

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") return fail(response, 405, "Only POST requests are supported.");

  // Browsers say where a request came from; refuse requests started by other websites.
  const site = request.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") return fail(response, 403, "This request is not allowed.");
  const origin = request.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== request.headers.host) return fail(response, 403, "This request is not allowed."); }
    catch { return fail(response, 403, "This request is not allowed."); }
  }

  const targetUrl = process.env.APPS_SCRIPT_URL;
  if (!targetUrl) return fail(response, 500, "APPS_SCRIPT_URL is not configured in Vercel. The interface is running in demo mode locally.");

  const ip = clientIp(request);

  try {
    const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body || {});
    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return fail(response, 413, "That request is too large.");
    const input = typeof request.body === "string" ? JSON.parse(request.body) : (request.body || {});

    const action = typeof input.action === "string" ? input.action : "";
    if (!ACTIONS.has(action)) return fail(response, 400, "Unknown action.");
    const data = input.data && typeof input.data === "object" && !Array.isArray(input.data) ? input.data : {};

    if (limited(`all:${ip}`, 180, 60_000) || (SENSITIVE.has(action) && limited(`auth:${ip}`, 25, 60_000))) {
      response.setHeader("Retry-After", "60");
      return fail(response, 429, "Too many requests. Please wait a minute and try again.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 27_000);
    let upstream;
    try {
      upstream = await fetch(targetUrl, {
        method: "POST",
        redirect: "follow",
        signal: controller.signal,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, data, ip, apiKey: process.env.APPS_SCRIPT_API_KEY || "" })
      });
    } finally { clearTimeout(timer); }

    const text = await upstream.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return fail(response, 502, "The server sent an unreadable reply. Please try again."); }

    // Never pass raw backend internals to the browser.
    if (parsed && typeof parsed === "object" && parsed.success === false) parsed = { success: false, error: String(parsed.error || "Request failed.").slice(0, 300) };
    response.status(upstream.ok ? 200 : 502).json(parsed);
  } catch (error) {
    console.error("apps-script proxy error:", error?.name, error?.message);   // visible in Vercel logs only
    return fail(response, error?.name === "AbortError" ? 504 : 500, error?.name === "AbortError" ? "The server is taking too long to answer. Please try again." : "Unable to reach the server. Please try again in a moment.");
  }
}
