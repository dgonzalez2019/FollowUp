// BDI University — AI Assistant backend (Vercel serverless function)
// Verifies the caller is a signed-in BDI employee (Firebase), then relays the
// conversation to the Claude API. The Anthropic key lives ONLY in Vercel env vars.

const FIREBASE_WEB_API_KEY = "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI"; // public web key, used to verify ID tokens

const SYSTEM_PROMPT =
  "You are the AI assistant inside BDI University, the internal portal for BDI Construction, " +
  "a construction company. You help employees draft emails and documents, do quick math and " +
  "takeoff calculations, summarize text they paste in, and answer general questions including " +
  "construction topics. Be concise, friendly, and practical. Format with short paragraphs; use " +
  "plain text (no markdown tables). If asked about confidential or HR-sensitive matters, suggest " +
  "speaking to a manager or HR rather than guessing.";

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "Assistant not configured yet (missing API key on the server)." });
      return;
    }
    const body = req.body || {};

    // ---- 1) Verify the Firebase ID token: signed-in employees only ----
    if (!body.idToken) {
      res.status(401).json({ error: "Please sign in to use the assistant." });
      return;
    }
    const lookup = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: body.idToken }),
      }
    );
    const who = lookup.ok ? await lookup.json() : null;
    const account = who && who.users && who.users[0];
    if (!account || !account.email) {
      res.status(401).json({ error: "Please sign in to use the assistant." });
      return;
    }

    // ---- 2) Sanitize and cap the conversation ----
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .slice(-16)
      .map((m) => ({
        role: m && m.role === "assistant" ? "assistant" : "user",
        content: String((m && m.content) || "").slice(0, 6000),
      }))
      .filter((m) => m.content.trim().length > 0);
    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      res.status(400).json({ error: "Nothing to answer." });
      return;
    }

    // ---- 3) Ask Claude ----
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messages,
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      const msg = (j && j.error && j.error.message) || "AI request failed.";
      res.status(502).json({ error: msg });
      return;
    }
    const text = (j.content || [])
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    res.status(200).json({ text: text || "(no response)" });
  } catch (e) {
    res.status(500).json({ error: "Assistant error. Try again in a moment." });
  }
};
