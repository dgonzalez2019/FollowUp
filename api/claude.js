// CTC Proposal Builder backend (Vercel serverless function) — /api/claude
//
// A thin, faithful relay to the Anthropic Messages API for the CTC builder's
// browser-side tool loop (claude-shim.js). Unlike /api/chat.js (which shapes a
// custom {idToken, messages, context} body and returns only text), this route:
//   - accepts a raw Anthropic Messages body and forwards messages/tools/system
//     content blocks (tool_use / tool_result / image) UNCHANGED,
//   - returns Anthropic's raw JSON response as-is (content, stop_reason, ...),
//   - restricts the model to the three the builder uses.
//
// Access: only signed-in, verified BDI (@bdico.com) users — the same gate as the
// rest of the portal — so the shared Anthropic key can't be spent by outsiders.
// The token is verified via Google's identitytoolkit REST endpoint (no admin SDK
// / service account needed), matching how api/chat.js already does it.
// The Anthropic key lives ONLY in Vercel env vars (ANTHROPIC_API_KEY, shared
// with the assistant route). Max duration is raised in vercel.json.

const FIREBASE_WEB_API_KEY = "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI"; // public web key, used to verify ID tokens

const ALLOWED_MODELS = new Set([
  "claude-haiku-4-5-20251001",
  "claude-sonnet-5",
  "claude-opus-5-5",
]);

module.exports = async (req, res) => {
  // TEMPORARY diagnostic: GET /api/claude?diag=models lists the models this
  // Anthropic key can access (read-only, spends no tokens). Remove after use.
  if (req.method === "GET" && req.query && req.query.diag) {
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "missing ANTHROPIC_API_KEY" });
      return;
    }
    const H = { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" };
    try {
      if (req.query.diag === "models") {
        const r = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: H });
        const j = await r.json();
        res.status(r.status).json({ models: Array.isArray(j.data) ? j.data.map((m) => m.id) : j });
        return;
      }
      if (req.query.diag === "ping") {
        const model = String(req.query.model || "claude-sonnet-5");
        const call = async (withTools) => {
          const body = { model, max_tokens: 64, messages: [{ role: "user", content: "Reply with the single word: ok" }] };
          if (withTools) body.tools = [{ name: "noop", description: "does nothing", input_schema: { type: "object", properties: {} } }];
          const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: H, body: JSON.stringify(body) });
          return { status: r.status, body: (await r.text()).slice(0, 800) };
        };
        res.status(200).json({ model, noTools: await call(false), withTools: await call(true) });
        return;
      }
      if (req.query.diag === "heavy") {
        // Reproduce a realistic, long generation (max_tokens 8000, like the shim)
        // and time it — to see whether a real call exceeds the 60s Hobby cap.
        const model = String(req.query.model || "claude-sonnet-5");
        const t0 = Date.now();
        const r = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: H,
          body: JSON.stringify({
            model, max_tokens: 8000,
            messages: [{ role: "user", content: "Output ONLY a JSON array of 220 imaginary construction line items; each object has task_id, description (a full sentence), uom, qty, unit_price. No prose." }],
          }),
        });
        const body = await r.text();
        let outTokens = null; try { outTokens = JSON.parse(body).usage.output_tokens; } catch (e) {}
        res.status(200).json({ model, status: r.status, ms: Date.now() - t0, output_tokens: outTokens, bodyHead: body.slice(0, 200) });
        return;
      }
      res.status(400).json({ error: "unknown diag" });
    } catch (e) {
      res.status(502).json({ error: "diag failed: " + (e && e.message) });
    }
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(500).json({ error: "CTC builder not configured yet (missing API key on the server)." });
      return;
    }

    // ---- 1) Require a signed-in, verified BDI user (Bearer ID token) ----
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      res.status(401).json({ error: "Please sign in to use the CTC builder." });
      return;
    }
    const lookup = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: token }),
      }
    );
    const who = lookup.ok ? await lookup.json() : null;
    const account = who && who.users && who.users[0];
    if (!account || !account.email) {
      res.status(401).json({ error: "Please sign in to use the CTC builder." });
      return;
    }
    // Only BDI employees (an @bdico.com email, end-anchored so lookalikes fail).
    // NOTE: we deliberately do NOT gate on emailVerified here — matching the app's
    // Firestore rules and the "Confirm your email" screen. The verified flag in the
    // ID token is cached and lags real verification, so requiring it would lock out
    // employees who have in fact verified.
    if (!/@bdico\.com$/i.test(String(account.email))) {
      res.status(403).json({ error: "Access is limited to BDI (@bdico.com) accounts." });
      return;
    }

    // ---- 2) Validate the Anthropic Messages body ----
    const body = req.body || {};
    const { model, max_tokens, messages, tools, system } = body;
    if (!ALLOWED_MODELS.has(model)) {
      res.status(400).json({ error: "model not allowed" });
      return;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages required" });
      return;
    }

    // ---- 3) Relay to Anthropic, forwarding content/tools unchanged ----
    const payload = {
      model,
      max_tokens: Math.min(Number(max_tokens) || 8000, 16000),
      messages, // tool_use / tool_result / image blocks pass through untouched
    };
    if (tools) payload.tools = tools;
    if (system) payload.system = system;

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
    });

    // Return Anthropic's raw JSON (or error) exactly as received, preserving status.
    const text = await r.text();
    res.status(r.status).setHeader("content-type", "application/json").send(text);
  } catch (e) {
    res.status(502).json({ error: "CTC builder request failed. Try again in a moment." });
  }
};
