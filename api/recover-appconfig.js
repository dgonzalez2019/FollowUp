// BDI University — one-click recovery of the shared app config (shared/appConfig)
// from Firestore Point-in-Time Recovery (PITR). Reads the document as it existed at
// a past timestamp (within the last 7 days, only if PITR was enabled on the database)
// and — on apply — writes it back, restoring every access list, override, custom tab,
// approved/blocked list, etc. ADMIN ONLY.
//
// POST { idToken, readTime, apply }
//   readTime : ISO 8601, e.g. "2026-11-06T14:00:00Z" (whole minutes)
//   apply    : omit/false = dry run (report what's there); true = restore
//
// Env: the Firebase service-account vars used by _firestore.js.

const { getAccessToken, base } = require("./_firestore.js");

const FIREBASE_WEB_API_KEY = "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI"; // public web key, verifies ID tokens
const ADMIN_EMAIL = "dgonzalez@bdico.com";

function summarize(cfg) {
  const len = (a) => (Array.isArray(a) ? a.length : 0);
  return {
    uspsAccess: len(cfg.usps && cfg.usps.access),
    uspsManagers: len(cfg.usps && cfg.usps.managers),
    acctAccess: len(cfg.acct && cfg.acct.access),
    acctManagers: len(cfg.acct && cfg.acct.managers),
    acctInsManagers: len(cfg.acct && cfg.acct.insManagers),
    newsletterAccess: len(cfg.newsletter && cfg.newsletter.access),
    subreqsAccess: len(cfg.subreqs && cfg.subreqs.access),
    perPersonOverrides: cfg.overrides ? Object.keys(cfg.overrides).length : 0,
    customTabs: len(cfg.customTabs),
    approved: len(cfg.approved),
    blocked: len(cfg.blocked),
  };
}

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
      res.status(403).json({ error: "Only the admin can recover the shared settings." });
      return;
    }

    const readTime = String(body.readTime || "").trim();
    if (!readTime) { res.status(400).json({ error: "Provide readTime as ISO 8601, e.g. 2026-11-06T14:00:00Z (whole minutes, within the last 7 days)." }); return; }

    const token = await getAccessToken();
    const url = base() + "/shared/appConfig?readTime=" + encodeURIComponent(readTime);
    const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 400);
      res.status(502).json({ error: "Point-in-time read failed (HTTP " + r.status + "). Either PITR isn't enabled on this database, or the time is outside the 7-day window / not a whole minute.", detail: detail });
      return;
    }
    const doc = await r.json();
    const dataStr = doc && doc.fields && doc.fields.data ? doc.fields.data.stringValue : null;
    if (!dataStr) { res.status(404).json({ error: "No saved config found at that timestamp." }); return; }
    let parsed = {}; try { parsed = JSON.parse(dataStr); } catch (e) {}
    const summary = summarize(parsed);
    const anything = Object.values(summary).some((n) => n > 0);

    if (body.apply === true) {
      if (!anything) { res.status(409).json({ error: "That snapshot was also empty — pick an earlier readTime.", at: readTime, ...summary }); return; }
      // Rebuild the denormalized lists the Firestore rules read (as real arrays), then
      // write the whole document back via the REST API. _firestore.js's setDoc can't
      // encode arrays, so we build the Firestore field values ourselves.
      const lc = (a) => (Array.isArray(a) ? a.map((e) => String(e).toLowerCase()) : []);
      const arr = (a) => ({ arrayValue: { values: lc(a).map((s) => ({ stringValue: s })) } });
      const fields = {
        data: { stringValue: dataStr },
        uspsAccessList: arr(parsed.usps && parsed.usps.access),
        uspsManagers: arr(parsed.usps && parsed.usps.managers),
        acctAccessList: arr(parsed.acct && parsed.acct.access),
        acctManagers: arr(parsed.acct && parsed.acct.managers),
        acctInsManagers: arr(parsed.acct && parsed.acct.insManagers),
        newsletterAccessList: arr(parsed.newsletter && parsed.newsletter.access),
        updatedAt: { doubleValue: Date.now() },
      };
      const w = await fetch(base() + "/shared/appConfig", {
        method: "PATCH",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fields }),
      });
      if (!w.ok) { res.status(502).json({ error: "Write-back failed: " + (await w.text()).slice(0, 300) }); return; }
      res.status(200).json({ restored: true, at: readTime, ...summary });
    } else {
      res.status(200).json({ dryRun: true, at: readTime, ...summary });
    }
  } catch (e) {
    res.status(500).json({ error: (e && e.message) || "Recovery failed." });
  }
};
