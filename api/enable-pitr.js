// BDI University — enable Firestore Point-in-Time Recovery (PITR) on the default
// database, so shared data (and any document) can be restored from up to 7 days ago.
// ADMIN ONLY. One-time action; safe to call again (idempotent).
//
// POST { idToken }
//
// Uses the service account (datastore scope) to call the Firestore Admin API
// projects.databases.patch with pointInTimeRecoveryEnablement. The service account
// must have permission to update the database (e.g. Editor / Datastore Owner); if it
// doesn't, this returns the API error and you enable it in the Firebase console.

const { getAccessToken } = require("./_firestore.js");

const FIREBASE_WEB_API_KEY = "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI"; // public web key, verifies ID tokens
const ADMIN_EMAIL = "dgonzalez@bdico.com";

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  try {
    const body = req.body || {};
    if (!body.idToken) { res.status(401).json({ error: "Please sign in." }); return; }
    const lookup = await fetch(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_WEB_API_KEY,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: body.idToken }) }
    );
    const who = lookup.ok ? await lookup.json() : null;
    const account = who && who.users && who.users[0];
    if (!account || !account.email || String(account.email).toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ error: "Only the admin can change this setting." });
      return;
    }

    const pid = process.env.FIREBASE_PROJECT_ID;
    if (!pid) { res.status(500).json({ error: "Server missing FIREBASE_PROJECT_ID." }); return; }
    const token = await getAccessToken();
    const url = "https://firestore.googleapis.com/v1/projects/" + pid +
      "/databases/(default)?updateMask=pointInTimeRecoveryEnablement";
    const r = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ pointInTimeRecoveryEnablement: "POINT_IN_TIME_RECOVERY_ENABLED" }),
    });
    const text = await r.text();
    if (!r.ok) {
      res.status(r.status === 403 ? 403 : 502).json({
        error: r.status === 403
          ? "The server's service account isn't allowed to change this. Enable PITR in the Firebase console instead (Firestore → Backups / Point-in-time recovery)."
          : "Couldn't enable PITR (HTTP " + r.status + ").",
        detail: text.slice(0, 400),
      });
      return;
    }
    res.status(200).json({ enabled: true });
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Failed to enable PITR." });
  }
};
