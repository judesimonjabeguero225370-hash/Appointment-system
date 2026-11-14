export const config = { maxDuration: 30 };   // Apps Script + sending an email can take longer than Vercel's 10s default

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.status(405).json({ success: false, error: "Only POST requests are supported." });
    return;
  }

  const targetUrl = process.env.APPS_SCRIPT_URL;
  if (!targetUrl) {
    response.status(500).json({
      success: false,
      error: "APPS_SCRIPT_URL is not configured in Vercel. The interface is running in demo mode locally."
    });
    return;
  }

  try {
    const input = typeof request.body === "string" ? JSON.parse(request.body) : (request.body || {});
    const payload = {
      action: input.action,
      data: input.data || {},
      apiKey: process.env.APPS_SCRIPT_API_KEY || ""
    };

    const upstream = await fetch(targetUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const text = await upstream.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { success: false, error: "Apps Script did not return JSON.", details: text.slice(0, 300) };
    }

    response.status(upstream.ok ? 200 : 502).json(parsed);
  } catch (error) {
    response.status(500).json({ success: false, error: error.message || "Unable to reach Apps Script." });
  }
}
