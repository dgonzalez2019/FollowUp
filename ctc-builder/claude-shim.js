/*
 * claude-shim.js
 * Lets the CTC Proposal Builder (built as a claude.ai artifact) run on the BDI portal.
 * It recreates the four things the builder asks for through window.claude.use(...):
 *   sample    -> the portal's Claude API route (Anthropic Messages API), including the tool loop
 *   db        -> Firestore (past jobs)
 *   user      -> Firebase Auth (who may delete past jobs)
 *   downloads -> a normal browser download
 * Load it BEFORE the builder's own script. Configure with window.CTC_BUILDER_CONFIG.
 */
(function () {
  "use strict";

  const CFG = Object.assign({
    apiUrl: "/api/claude",                 // the portal's Claude route; must accept an Anthropic Messages body and return the raw response
    models: {                              // modelTier -> Anthropic model
      quick: "claude-haiku-4-5-20251001",
      default: "claude-sonnet-5",
      complex: "claude-opus-5-5"
    },
    maxTokens: 8000,
    maxToolRounds: 10,
    firebaseConfig: null,                  // the portal's Firebase config object
    jobsCollection: "ctcJobs",             // Firestore collection for past jobs
    seedUrl: "ctc-jobs.json",              // loaded once when the collection is empty
    adminEmails: []                        // who can delete past jobs; empty = anyone signed in
  }, window.CTC_BUILDER_CONFIG || {});

  const err = (code, message, text) => { const e = new Error(message || code); e.code = code; if (text) e.text = text; return e; };

  /* ---------- Firebase ---------- */
  let fbReady = null;
  function firebaseReady() {
    if (fbReady) return fbReady;
    fbReady = new Promise(resolve => {
      if (!window.firebase || !CFG.firebaseConfig) return resolve(null);
      try { if (!firebase.apps.length) firebase.initializeApp(CFG.firebaseConfig); } catch (e) { return resolve(null); }
      const off = firebase.auth().onAuthStateChanged(u => { off(); resolve(u || null); });
    });
    return fbReady;
  }
  async function idToken() {
    const u = await firebaseReady();
    try { return u ? await u.getIdToken() : ""; } catch (e) { return ""; }
  }

  /* ---------- sample (Claude) ---------- */
  const blobToB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });

  async function toMessages(input, images) {
    const msgs = typeof input === "string" ? [{ role: "user", content: input }] : input.map(m => ({ role: m.role, content: m.content }));
    if (images && images.length) {
      const blocks = await Promise.all(images.map(async im => ({ type: "image", source: { type: "base64", media_type: im.type || "image/jpeg", data: await blobToB64(im) } })));
      const last = msgs[msgs.length - 1];
      last.content = [...blocks, { type: "text", text: String(last.content) }];
    }
    return msgs;
  }

  async function callApi(body, signal) {
    const headers = { "Content-Type": "application/json" };
    const tok = await idToken(); if (tok) headers.Authorization = "Bearer " + tok;
    let r;
    try { r = await fetch(CFG.apiUrl, { method: "POST", headers, body: JSON.stringify(body), signal }); }
    catch (e) { if (e && e.name === "AbortError") throw err("cancelled"); throw err("network", e && e.message); }
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      if (r.status === 429 || r.status === 529) throw err("rate_limited", t);
      if (r.status === 413) throw err("prompt_too_large", t);
      if (r.status === 401 || r.status === 403) throw err("session_expired", t);
      throw err("server_error", `HTTP ${r.status}: ${t.slice(0, 300)}`);
    }
    return r.json();
  }

  async function sample(input, opts) {
    opts = opts || {};
    const model = CFG.models[opts.modelTier || "default"] || CFG.models.default;
    const messages = await toMessages(input, opts.images);
    const tools = opts.tools || [];
    const toolDefs = tools.map(t => ({ name: t.name, description: t.description || "", input_schema: t.inputSchema || { type: "object", properties: {} } }));
    let text = "";
    for (let round = 0; round < CFG.maxToolRounds; round++) {
      if (opts.signal && opts.signal.aborted) throw err("cancelled", null, text);
      const body = { model, max_tokens: CFG.maxTokens, messages };
      if (toolDefs.length) body.tools = toolDefs;
      let data;
      try { data = await callApi(body, opts.signal); } catch (e) { if (text) e.text = text; throw e; }
      const content = data.content || [];
      const t = content.filter(b => b.type === "text").map(b => b.text).join("");
      if (t) { text += (text ? "\n" : "") + t; if (opts.onText) opts.onText({ text, delta: t }); }
      const uses = content.filter(b => b.type === "tool_use");
      if (data.stop_reason !== "tool_use" || !uses.length) {
        if (!text.trim()) throw err("empty_completion");
        return { text, truncated: data.stop_reason === "max_tokens" };
      }
      messages.push({ role: "assistant", content });
      const results = [];
      for (const u of uses) {
        const tool = tools.find(x => x.name === u.name);
        let out, isErr = false;
        try { if (!tool) { out = `Unknown tool ${u.name}`; isErr = true; } else out = await tool.execute(u.input || {}); }
        catch (e) { out = (e && e.message) || String(e); isErr = true; }
        results.push({ type: "tool_result", tool_use_id: u.id, content: typeof out === "string" ? out : JSON.stringify(out), is_error: isErr });
      }
      messages.push({ role: "user", content: results });
    }
    throw err("server_error", "Too many tool rounds", text);
  }
  sample.json = async (input, opts) => {
    const { text } = await sample(input, opts);
    const s = text.replace(/```(?:json)?/g, "");
    const a = s.search(/[\[{]/), b = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
    try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { throw err("invalid_json", "Claude's reply wasn't valid JSON", text); }
  };
  sample.limits = async () => ({ tools: true, images: { maxCount: 5 } });

  /* ---------- db (Firestore) ---------- */
  async function seedIfEmpty(col) {
    const snap = await col.limit(1).get();
    if (!snap.empty) return;
    const r = await fetch(CFG.seedUrl); if (!r.ok) return;
    const jobs = await r.json(); const fs = firebase.firestore();
    for (let i = 0; i < jobs.length; i += 400) {
      const batch = fs.batch();
      jobs.slice(i, i + 400).forEach(j => { const { _id, ...data } = j; batch.set(_id ? col.doc(_id) : col.doc(), data); });
      await batch.commit();
    }
  }
  async function makeDb() {
    const u = await firebaseReady(); if (!u) return null;
    const fs = firebase.firestore();
    const colFor = name => fs.collection(name === "jobs" ? CFG.jobsCollection : name);
    try { await seedIfEmpty(colFor("jobs")); } catch (e) { console.warn("CTC builder: seeding past jobs failed", e); }
    return {
      collection(name) {
        const c = colFor(name);
        return {
          onSnapshot(cb, onErr) { return c.onSnapshot(s => cb({ docs: s.docs.map(d => ({ id: d.id, data: () => d.data() })) }), onErr); },
          add(data) { return c.add(data); },
          doc(id) { return { delete: () => c.doc(id).delete() }; }
        };
      }
    };
  }

  /* ---------- user ---------- */
  async function makeUser() {
    const u = await firebaseReady(); if (!u) return null;
    const email = (u.email || "").toLowerCase();
    return { canEdit: () => !CFG.adminEmails.length || CFG.adminEmails.map(e => e.toLowerCase()).includes(email), email };
  }

  /* ---------- downloads ---------- */
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv" : "text/plain" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename || "download";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }
  };

  window.claude = {
    use: async name => {
      if (name === "sample") return sample;
      if (name === "db") return makeDb();
      if (name === "user") return makeUser();
      if (name === "downloads") return downloads;
      return null;
    }
  };
})();
