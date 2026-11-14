export const APP_NAME = "Qorvena";

const directAppsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL || "";
const apiEndpoint = directAppsScriptUrl || "/api/apps-script";

/** In production (or with VITE_APPS_SCRIPT_URL set) the app talks to Apps Script; otherwise it runs as a demo. */
export const isConfigured = Boolean(directAppsScriptUrl || import.meta.env.PROD);

export async function apiCall(action, data = {}, token = "") {
  const payload = { ...data };
  if (token) payload.token = token;
  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);   // Apps Script can take a few seconds to wake up
  try {
    response = await fetch(apiEndpoint, {
      signal: controller.signal,
      method: "POST",
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, data: payload })
    });
  } catch (e) {
    throw new Error(e && e.name === "AbortError" ? "The server is taking too long to answer. Please try again in a moment." : "Can't reach the server. Check your internet connection and try again.");
  } finally { clearTimeout(timer); }
  let body;
  try { body = JSON.parse(await response.text()); }
  catch { throw new Error("The server sent an unreadable reply. Check the Apps Script deployment."); }
  if (!response.ok || body.success === false) throw new Error(body.error || `Request failed (${response.status}).`);
  return body.data ?? body;
}
