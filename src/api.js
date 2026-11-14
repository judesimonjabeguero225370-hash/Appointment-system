export const APP_NAME = "Remindly";

const directAppsScriptUrl = import.meta.env.VITE_APPS_SCRIPT_URL || "";
const apiEndpoint = directAppsScriptUrl || "/api/apps-script";

/** In production (or with VITE_APPS_SCRIPT_URL set) the app talks to Apps Script; otherwise it runs as a demo. */
export const isConfigured = Boolean(directAppsScriptUrl || import.meta.env.PROD);

export async function apiCall(action, data = {}, token = "") {
  const payload = { ...data };
  if (token) payload.token = token;
  let response;
  try {
    response = await fetch(apiEndpoint, {
      method: "POST",
      // text/plain avoids a CORS preflight, which Apps Script can't answer
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, data: payload })
    });
  } catch {
    throw new Error("Can't reach the server. Check your internet connection and try again.");
  }
  let body;
  try { body = JSON.parse(await response.text()); }
  catch { throw new Error("The server sent an unreadable reply. Check the Apps Script deployment."); }
  if (!response.ok || body.success === false) throw new Error(body.error || `Request failed (${response.status}).`);
  return body.data ?? body;
}
