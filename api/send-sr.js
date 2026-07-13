// BDI University — send a Sub-Requisition email NOW via the caller's own Outlook.
//
// A mailto: link can only carry plain text, so rich formatting (bold, colours,
// highlight, underline) never survives it. This endpoint sends the email as HTML
// through Microsoft Graph using the signed-in employee's connected Outlook, so the
// formatting arrives intact. It sends from THAT user's mailbox only.
//
// Auth: the caller proves who they are with a Firebase ID token (verified BDI
// account); the Outlook refresh token is looked up for that same uid — a user can
// only ever send as themselves.
//
// Env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, plus the Firebase SA vars.

const { getDoc } = require("./_firestore.js");

const FIREBASE_WEB_API_KEY = "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI"; // public web key, verifies ID tokens

async function graphToken(auth) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: auth.refresh_token,
    grant_type: "refresh_token",
    scope: "offline_access User.Read Mail.Send",
  });
  const r = await fetch("https://login.microsoftonline.com/" + (process.env.MS_TENANT_ID || "common") + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error("token refresh failed: " + (tok.error_description || JSON.stringify(tok)));
  return tok.access_token;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = req.body || {};

    // 1) Verify the caller is a signed-in, verified BDI employee.
    if (!body.idToken) { res.status(401).json({ error: "Please sign in." }); return; }
    const lookup = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: body.idToken }) }
    );
    const who = lookup.ok ? await lookup.json() : null;
    const account = who && who.users && who.users[0];
    if (!account || !account.email || !/@bdico\.com$/i.test(String(account.email)) || account.emailVerified !== true) {
      res.status(403).json({ error: "Access is limited to verified BDI (@bdico.com) accounts." });
      return;
    }

    const to = String(body.to || "").trim();
    if (!to) { res.status(400).json({ error: "No recipient address." }); return; }

    // 2) Load THIS user's Outlook token (they can only send as themselves).
    const auth = await getDoc("outlookTokens", account.localId);
    if (!auth || !auth.refresh_token) { res.status(409).json({ error: "Outlook isn't connected. Connect it in the Follow-ups tab, then try again." }); return; }
    const access = await graphToken(auth);

    // 3) Send as HTML so all formatting is preserved.
    const ccArr = String(body.cc || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const msg = {
      message: {
        subject: String(body.subject || ""),
        body: { contentType: "HTML", content: String(body.html || "") },
        toRecipients: [{ emailAddress: { address: to } }],
        ccRecipients: ccArr.map((a) => ({ emailAddress: { address: a } })),
      },
      saveToSentItems: true,
    };
    const g = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers: { Authorization: "Bearer " + access, "Content-Type": "application/json" },
      body: JSON.stringify(msg),
    });
    if (!g.ok) { res.status(502).json({ error: "Outlook rejected the send: " + (await g.text()).slice(0, 200) }); return; }

    res.status(200).json({ ok: true, from: account.email });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Send failed." });
  }
};
