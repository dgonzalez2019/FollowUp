// BDI University — daily automation runner (Vercel Cron), PER-USER edition.
// Each employee connects their own Outlook (token stored in outlookTokens/{uid}).
// Each employee's flagged follow-ups are saved to users/{uid}/auto/queue.
// This job loops over every connected user and, for their items due today,
//   1. sends the follow-up email from THAT user's Outlook, and/or
//   2. creates a calendar event on THAT user's Outlook,
// then records what it did so nothing fires twice.
//
// Env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, Firebase SA vars, CRON_SECRET.

const { listDocs, getSubDoc, setSubDoc, setDoc } = require("./_firestore.js");

async function graphTokenFor(uid, auth) {
  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    refresh_token: auth.refresh_token,
    grant_type: "refresh_token",
    scope: "offline_access User.Read Mail.Send Calendars.ReadWrite",
  });
  const r = await fetch("https://login.microsoftonline.com/" + (process.env.MS_TENANT_ID || "common") + "/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const tok = await r.json();
  if (!tok.access_token) throw new Error("token refresh failed: " + (tok.error_description || JSON.stringify(tok)));
  // persist a rotated refresh token if Microsoft issued a new one
  if (tok.refresh_token && tok.refresh_token !== auth.refresh_token) {
    await setDoc("outlookTokens", uid, { refresh_token: tok.refresh_token, email: auth.email || "", connectedAt: auth.connectedAt || "" });
  }
  return tok.access_token;
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
async function sendMail(token, item) {
  const toList = [{ emailAddress: { address: item.email } }];
  const ccList = (item.cc || "").split(/[;,]/).map((s) => s.trim()).filter(Boolean).map((a) => ({ emailAddress: { address: a } }));
  let bodyObj;
  if (item.htmlSig) {
    // convert the plain-text body to simple HTML and append the user's signature
    const htmlBody = escapeHtml(item.body || "").replace(/\n/g, "<br>");
    bodyObj = { contentType: "HTML", content: "<div>" + htmlBody + "</div><br>" + item.htmlSig };
  } else {
    bodyObj = { contentType: "Text", content: item.body || "" };
  }
  const msg = {
    message: {
      subject: item.subject || "Following up",
      body: bodyObj,
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
  const start = item.eventDate;
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
  const secret = (req.headers.authorization || "").replace("Bearer ", "") ||
    new URL(req.url, "https://x").searchParams.get("key");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const log = { ran: new Date().toISOString(), users: 0, sent: 0, events: 0, skipped: 0, errors: [] };
  const today = new Date().toISOString().slice(0, 10);
  const perUser = [];
  let adminToken = null;
  const ADMIN = (process.env.ADMIN_EMAIL || "").toLowerCase();
  try {
    const tokens = await listDocs("outlookTokens"); // [{id: uid, data: {refresh_token,email}}]
    for (const t of tokens) {
      const uid = t.id;
      const auth = t.data || {};
      if (!auth.refresh_token) continue;
      // load this user's automation queue
      const queuePath = "users/" + uid + "/auto/queue";
      let queue;
      try { queue = await getSubDoc(queuePath); } catch (e) { queue = null; }
      const parsed = queue && queue.data ? JSON.parse(queue.data) : null;
      const items = (parsed && parsed.items) || [];
      const done = (parsed && parsed.done) || {};
      const dueNow = items.filter((it) => it.due <= today && !done[it.id + "|" + it.due]);
      if (dueNow.length === 0) continue;

      let token;
      try { token = await graphTokenFor(uid, auth); }
      catch (e) { log.errors.push((auth.email || uid) + ": " + e.message); continue; }
      log.users++;
      if (!adminToken || (auth.email || "").toLowerCase() === ADMIN) adminToken = token;
      let uSent = 0, uEvents = 0;

      for (const it of items) {
        if (it.due > today) continue;
        const stamp = it.id + "|" + it.due;
        if (done[stamp]) { log.skipped++; continue; }
        try {
          if (it.autoEmail && it.email) { await sendMail(token, it); log.sent++; uSent++; }
          if (it.autoEvent && it.eventDate) { await makeEvent(token, it); log.events++; uEvents++; }
          done[stamp] = new Date().toISOString();
        } catch (e) {
          log.errors.push((auth.email || uid) + " / " + stamp + ": " + e.message);
        }
      }
      try { await setSubDoc(queuePath, { data: JSON.stringify({ items, done }), email: auth.email || "" }); } catch (e) {}
      if (uSent || uEvents) perUser.push({ email: auth.email || uid, sent: uSent, events: uEvents });
    }

    if (ADMIN && adminToken && (log.sent || log.events || log.errors.length)) {
      try {
        const L = [];
        L.push("BDI University follow-up automation — daily summary");
        L.push(today);
        L.push("");
        L.push("Totals: " + log.sent + " email(s) sent, " + log.events + " calendar event(s) created, across " + log.users + " user(s).");
        if (perUser.length) {
          L.push("");
          L.push("By person:");
          perUser.forEach((u) => L.push("  - " + u.email + ": " + u.sent + " email(s), " + u.events + " event(s)"));
        }
        if (log.errors.length) {
          L.push("");
          L.push("Issues (" + log.errors.length + "):");
          log.errors.forEach((e) => L.push("  - " + e));
        }
        L.push("");
        L.push("Sent automatically by BDI University.");
        await sendMail(adminToken, { email: process.env.ADMIN_EMAIL, subject: "Follow-up automation summary — " + today, body: L.join("\n") });
        log.summarySent = true;
      } catch (e) { log.errors.push("summary email: " + e.message); }
    }
    await setDoc("shared", "automationLog", { data: JSON.stringify(log) });
    res.status(200).json(log);
  } catch (e) {
    log.errors.push(e.message);
    try { await setDoc("shared", "automationLog", { data: JSON.stringify(log) }); } catch (e2) {}
    res.status(500).json(log);
  }
};
