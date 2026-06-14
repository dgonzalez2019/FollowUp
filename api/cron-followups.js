// BDI University — daily automation runner (Vercel Cron)
// Runs once a day. Reads the automation queue the site saved to Firestore,
// and for every follow-up whose next-contact date is today (or past) and that
// the admin flagged for automation, it:
//   1. sends the follow-up email from the admin's Outlook (Mail.Send), and/or
//   2. creates an Outlook calendar event for the next contact (Calendars.ReadWrite)
// Then it records what it did so the same item isn't actioned twice.
//
// Env vars: MS_CLIENT_ID, MS_CLIENT_SECRET, plus the Firebase service-account vars
// used by _firestore.js. Protected by CRON_SECRET.

const { getDoc, setDoc } = require("./_firestore.js");

async function graphToken() {
  const auth = await getDoc("shared", "msAuth");
  if (!auth || !auth.refresh_token) throw new Error("Outlook not connected (no refresh token).");
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: auth.refresh_token,
    grant_type: "refresh_token",
    scope: "offline_access User.Read Mail.Send Calendars.ReadWrite",
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error("Token refresh failed: " + JSON.stringify(tok));
  // Microsoft may rotate the refresh token; persist the new one if present
  if (tok.refresh_token && tok.refresh_token !== auth.refresh_token) {
    await setDoc("shared", "msAuth", { refresh_token: tok.refresh_token, email: auth.email || "", connectedAt: auth.connectedAt || "" });
  }
  return tok.access_token;
}

async function sendMail(token, item) {
  const toList = [{ emailAddress: { address: item.email } }];
  const ccList = (item.cc || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
  const msg = {
    message: {
      subject: item.subject || "Following up",
      body: { contentType: "Text", content: item.body || "" },
      toRecipients: toList,
      ccRecipients: ccList,
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

async function makeEvent(token, item) {
  const start = item.eventDate; // YYYY-MM-DD
  const ev = {
    subject: "Follow up: " + (item.name || item.email) + (item.company ? " (" + item.company + ")" : ""),
    body: { contentType: "Text", content: (item.subject ? "Re: " + item.subject + "\n\n" : "") + "Auto-created by BDI University follow-up automation." },
    start: { dateTime: start + "T09:00:00", timeZone: "America/New_York" },
    end: { dateTime: start + "T09:30:00", timeZone: "America/New_York" },
    isReminderOn: true,
    reminderMinutesBeforeStart: 60,
  };
  const r = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(ev),
  });
  if (!r.ok) throw new Error("event create failed: " + (await r.text()));
}

module.exports = async (req, res) => {
  // Allow Vercel Cron (sends the secret) or a manual admin trigger with the same secret
  const secret = (req.headers.authorization || "").replace("Bearer ", "") ||
    new URL(req.url, "https://x").searchParams.get("key");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const log = { ran: new Date().toISOString(), sent: 0, events: 0, skipped: 0, errors: [] };
  try {
    const queueDoc = await getDoc("shared", "automation");
    const queue = queueDoc && queueDoc.data ? JSON.parse(queueDoc.data) : { items: [], done: {} };
    const items = queue.items || [];
    const done = queue.done || {};
    const today = new Date().toISOString().slice(0, 10);

    let token = null;
    if (items.some((it) => it.due <= today && !done[it.id + "|" + it.due])) {
      token = await graphToken();
    }

    for (const it of items) {
      if (it.due > today) { continue; }
      const stamp = it.id + "|" + it.due;
      if (done[stamp]) { log.skipped++; continue; }
      try {
        if (it.autoEmail && it.email) { await sendMail(token, it); log.sent++; }
        if (it.autoEvent && it.eventDate) { await makeEvent(token, it); log.events++; }
        done[stamp] = new Date().toISOString();
      } catch (e) {
        log.errors.push(stamp + ": " + e.message);
      }
    }

    await setDoc("shared", "automation", { data: JSON.stringify({ items, done }) });
    await setDoc("shared", "automationLog", { data: JSON.stringify(log) });
    res.status(200).json(log);
  } catch (e) {
    log.errors.push(e.message);
    try { await setDoc("shared", "automationLog", { data: JSON.stringify(log) }); } catch (e2) {}
    res.status(500).json(log);
  }
};
