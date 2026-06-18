// Shared subcontractor-insurance reminder routine.
//
// Reads shared/insurance (subcontractors + notify recipients + default lead days)
// and emails the recipient group when a subcontractor's COI is within its notice
// window (or already expired). Each expiration date is emailed once — tracked in
// shared/insuranceLog so it re-arms automatically when a policy is renewed.
//
// Runs inside the daily cron (folded into cron-followups so it uses only one
// Vercel cron slot). Sends from the admin's connected Outlook (ADMIN_EMAIL).

const { getDoc, setDoc, listDocs } = require("./_firestore.js");

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

async function sendMail(token, toArr, subject, bodyText) {
  const msg = {
    message: {
      subject: subject,
      body: { contentType: "Text", content: bodyText },
      toRecipients: toArr.map((a) => ({ emailAddress: { address: a } })),
    },
    saveToSentItems: true,
  };
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!r.ok) throw new Error("sendMail failed: " + (await r.text()));
}

async function runInsuranceReminders() {
  const log = { ran: new Date().toISOString(), checked: 0, due: 0, emailed: 0, errors: [] };
  const save = async (notified) => { try { await setDoc("shared", "insuranceLog", { data: JSON.stringify({ notified: notified || {}, last: log }) }); } catch (e) {} };
  try {
    const insRaw = await getDoc("shared", "insurance");
    const model = insRaw && insRaw.data ? JSON.parse(insRaw.data) : null;
    const subs = (model && model.subs) || [];
    const recipients = (model && model.recipients) || [];
    const defDays = Number(model && model.notifyDays) || 30;
    log.checked = subs.length;

    const logRaw = await getDoc("shared", "insuranceLog");
    let notified = {};
    try { notified = (logRaw && logRaw.data) ? (JSON.parse(logRaw.data).notified || {}) : {}; } catch (e) {}

    if (!subs.length || !recipients.length) { log.note = "nothing to do (no subcontractors or no recipients)"; await save(notified); return log; }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = [];
    subs.forEach((s) => {
      const exp = (s.expires || "").trim();
      if (!exp) return;
      const daysLeft = Math.round((new Date(exp + "T00:00:00") - today) / 86400000);
      const threshold = Number(s.days) || defDays;
      if (daysLeft > threshold) return;                 // not yet inside the notice window
      const key = (s.id || s.name) + "|" + exp;         // re-arms when the expiration date changes (renewal)
      if (notified[key]) return;                        // already emailed for this expiry
      due.push({ s: s, daysLeft: daysLeft, key: key });
    });
    log.due = due.length;
    if (!due.length) { await save(notified); return log; }

    const ADMIN = (process.env.ADMIN_EMAIL || "").toLowerCase();
    const tokens = await listDocs("outlookTokens");
    const adminTok = tokens.find((t) => ((t.data && t.data.email) || "").toLowerCase() === ADMIN && t.data.refresh_token);
    if (!adminTok) { log.errors.push("admin Outlook not connected (set ADMIN_EMAIL and connect Outlook for that account)"); await save(notified); return log; }
    const token = await graphToken(adminTok.data);

    const dateStr = today.toISOString().slice(0, 10);
    const lines = [];
    lines.push("Subcontractor insurance reminder — " + dateStr);
    lines.push("");
    lines.push("These subcontractors need an updated Certificate of Insurance before they can be on site:");
    lines.push("");
    due.sort((a, b) => a.daysLeft - b.daysLeft).forEach(function (d) {
      const s = d.s;
      const status = d.daysLeft < 0 ? ("EXPIRED " + Math.abs(d.daysLeft) + " day(s) ago") : ("expires in " + d.daysLeft + " day(s)");
      const proj = [s.projNum, s.projName].filter(Boolean).join(" ");
      lines.push("  - " + (s.name || "(unnamed)") + (s.coverage ? " [" + s.coverage + "]" : "") + (proj ? " — project " + proj : "") + " — " + status + " (expires " + s.expires + ")" + (s.carrier ? " — " + s.carrier : ""));
    });
    lines.push("");
    lines.push("Collect a renewed COI before the expiration date so the subcontractor can remain on site.");
    lines.push("");
    lines.push("Sent automatically by BDI University.");

    try {
      await sendMail(token, recipients, "Subcontractor insurance expiring — " + dateStr, lines.join("\n"));
      log.emailed = due.length;
      const stamp = new Date().toISOString();
      due.forEach(function (d) { notified[d.key] = stamp; });
    } catch (e) { log.errors.push(e.message); }

    await save(notified);
    return log;
  } catch (e) {
    log.errors.push(e.message);
    await save({});
    return log;
  }
}

module.exports = { runInsuranceReminders };
