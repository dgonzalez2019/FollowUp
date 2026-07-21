// BDI University — one-click recovery of a user's own data from Firestore
// Point-in-Time Recovery (PITR). Reads users/{uid} as it existed at a past
// timestamp (within the last 7 days, only if PITR was enabled on the database)
// and — on apply — writes it back. A person can only recover THEIR OWN document.
//
// POST { idToken, readTime, apply }
//   readTime : ISO 8601, e.g. "2026-07-20T13:00:00Z" (use whole minutes)
//   apply    : omit/false = dry run (just report what's there); true = restore
//
// Env: the Firebase service-account vars used by _firestore.js.

const { getAccessToken, base, setDoc } = require("./_firestore.js");

const FIREBASE_WEB_API_KEY = "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI"; // public web key, verifies ID tokens

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
    if (!account || !account.email || !/@bdico\.com$/i.test(String(account.email)) || account.emailVerified !== true) {
      res.status(403).json({ error: "Access is limited to verified BDI (@bdico.com) accounts." });
      return;
    }
    const uid = account.localId;
    const readTime = String(body.readTime || "").trim();
    if (!readTime) { res.status(400).json({ error: "Provide readTime as ISO 8601, e.g. 2026-07-20T13:00:00Z (whole minutes, within the last 7 days)." }); return; }

    // PITR read: GET the document as it existed at readTime.
    const token = await getAccessToken();
    const url = base() + "/users/" + uid + "?readTime=" + encodeURIComponent(readTime);
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 400);
      res.status(502).json({ error: "Point-in-time read failed (HTTP " + r.status + "). Either PITR isn't enabled on this database, or the time is outside the 7-day window / not a whole minute.", detail: detail });
      return;
    }
    const doc = await r.json();
    const dataStr = doc && doc.fields && doc.fields.data ? doc.fields.data.stringValue : null;
    if (!dataStr) { res.status(404).json({ error: "No saved data found at that timestamp." }); return; }
    let parsed = {}; try { parsed = JSON.parse(dataStr); } catch (e) {}
    const fups = Array.isArray(parsed.followups) ? parsed.followups : [];
    const summary = { at: readTime, followups: fups.length, sample: fups.slice(0, 25).map((f) => f.name || f.company || f.email || "(unnamed)") };

    if (body.apply === true) {
      if (!fups.length) { res.status(409).json({ error: "That snapshot also had no follow-ups — pick an earlier readTime.", ...summary }); return; }
      await setDoc("users", uid, { data: dataStr, updatedAt: Date.now() });
      res.status(200).json({ restored: true, ...summary });
    } else {
      res.status(200).json({ dryRun: true, ...summary });
    }
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Recovery failed." });
  }
};
