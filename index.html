import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, Mail, Copy, Check, Clock, AlertCircle, CalendarClock,
  Trash2, Pencil, Settings as SettingsIcon, X, RotateCcw, Inbox, Send
} from "lucide-react";

// ---------- date helpers ----------
const MS_DAY = 86400000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const parseDate = (s) => new Date(s + "T00:00:00");
const addDays = (s, n) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / MS_DAY);
const prettyDate = (s) =>
  parseDate(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// ---------- defaults ----------
const DEFAULT_SETTINGS = {
  defaultInterval: 4,
  template:
    "Hi {name},\n\nI hope you're well. I'm following up on my earlier email regarding {subject}. When you have a moment, could you please send over the outstanding items: {notes}?\n\nHappy to answer any questions on my end.\n\n{signature}",
  signature: "Best regards,\n[Your name]",
};

const STORE_KEY = "followup-desk-v1";

const STATUS_META = {
  overdue: { label: "Overdue", color: "#9c3d28", Icon: AlertCircle },
  today: { label: "Due today", color: "#b5791f", Icon: CalendarClock },
  waiting: { label: "Waiting", color: "#5f6f54", Icon: Clock },
  done: { label: "Done", color: "#8a8073", Icon: Check },
};

function getStatus(f) {
  if (f.status === "done") return { key: "done" };
  const due = addDays(f.lastContact, Number(f.intervalDays) || 0);
  const diff = daysBetween(todayStr(), due);
  if (diff > 0) return { key: "waiting", days: diff, due };
  if (diff === 0) return { key: "today", due };
  return { key: "overdue", days: -diff, due };
}

const sortWeight = { overdue: 0, today: 1, waiting: 2, done: 3 };

export default function FollowUpDesk() {
  const [followups, setFollowups] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("attention");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState(null);

  const blankForm = () => ({
    name: "", email: "", subject: "", notes: "",
    lastContact: todayStr(), intervalDays: settings.defaultInterval,
  });
  const [form, setForm] = useState(blankForm());

  const hasStorage = typeof window !== "undefined" && window.storage;

  // load
  useEffect(() => {
    (async () => {
      if (hasStorage) {
        try {
          const res = await window.storage.get(STORE_KEY);
          if (res && res.value) {
            const parsed = JSON.parse(res.value);
            setFollowups(parsed.followups || []);
            setSettings({ ...DEFAULT_SETTINGS, ...(parsed.settings || {}) });
          }
        } catch (e) {
          /* first run / no key yet */
        }
      }
      setLoaded(true);
    })();
  }, []); // eslint-disable-line

  // save
  useEffect(() => {
    if (!loaded || !hasStorage) return;
    (async () => {
      try {
        await window.storage.set(STORE_KEY, JSON.stringify({ followups, settings }));
      } catch (e) {
        console.error("save failed", e);
      }
    })();
  }, [followups, settings, loaded]); // eslint-disable-line

  const flash = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const buildBody = (f) =>
    settings.template
      .replaceAll("{name}", f.name || "there")
      .replaceAll("{subject}", f.subject || "our previous correspondence")
      .replaceAll("{notes}", f.notes || "the requested documents")
      .replaceAll("{signature}", settings.signature || "");

  const openInEmail = (f) => {
    const link =
      "mailto:" + encodeURIComponent(f.email) +
      "?subject=" + encodeURIComponent("Re: " + (f.subject || "Following up")) +
      "&body=" + encodeURIComponent(buildBody(f));
    try {
      window.open(link, "_blank");
    } catch (e) {
      window.location.href = link;
    }
  };

  const copyText = async (f) => {
    const text = "To: " + f.email + "\nSubject: Re: " + (f.subject || "Following up") + "\n\n" + buildBody(f);
    try {
      await navigator.clipboard.writeText(text);
      flash("Email text copied to clipboard");
    } catch (e) {
      flash("Couldn't copy — select the preview manually");
    }
  };

  const logFollowUp = (f) => {
    openInEmail(f);
    setFollowups((arr) =>
      arr.map((x) =>
        x.id === f.id
          ? { ...x, lastContact: todayStr(), followUpsSent: (x.followUpsSent || 0) + 1 }
          : x
      )
    );
    flash("Logged — clock reset for the next reminder");
  };

  const markDone = (id) =>
    setFollowups((arr) => arr.map((x) => (x.id === id ? { ...x, status: "done" } : x)));
  const reactivate = (id) =>
    setFollowups((arr) =>
      arr.map((x) => (x.id === id ? { ...x, status: "active", lastContact: todayStr() } : x))
    );
  const remove = (id) => setFollowups((arr) => arr.filter((x) => x.id !== id));

  const startEdit = (f) => {
    setForm({
      name: f.name, email: f.email, subject: f.subject, notes: f.notes,
      lastContact: f.lastContact, intervalDays: f.intervalDays,
    });
    setEditingId(f.id);
    setShowForm(true);
  };

  const submit = () => {
    if (!form.email.trim()) return flash("An email address is required");
    if (editingId) {
      setFollowups((arr) => arr.map((x) => (x.id === editingId ? { ...x, ...form } : x)));
      flash("Updated");
    } else {
      setFollowups((arr) => [
        ...arr,
        { ...form, id: Date.now().toString(36), status: "active", followUpsSent: 0, createdAt: todayStr() },
      ]);
      flash("Added to your follow-up list");
    }
    setForm(blankForm());
    setEditingId(null);
    setShowForm(false);
  };

  const resetAll = () => {
    if (!window.confirm("Delete every tracked follow-up? This can't be undone.")) return;
    setFollowups([]);
    flash("Cleared");
  };

  const enriched = useMemo(
    () =>
      followups
        .map((f) => ({ ...f, _s: getStatus(f) }))
        .sort((a, b) => {
          const w = sortWeight[a._s.key] - sortWeight[b._s.key];
          if (w !== 0) return w;
          if (a._s.due && b._s.due) return parseDate(a._s.due) - parseDate(b._s.due);
          return 0;
        }),
    [followups]
  );

  const counts = useMemo(() => {
    let attention = 0, waiting = 0, done = 0;
    enriched.forEach((f) => {
      if (f._s.key === "overdue" || f._s.key === "today") attention++;
      else if (f._s.key === "waiting") waiting++;
      else if (f._s.key === "done") done++;
    });
    return { attention, waiting, done };
  }, [enriched]);

  const filtered = enriched.filter((f) => {
    if (view === "all") return true;
    if (view === "attention") return f._s.key === "overdue" || f._s.key === "today";
    if (view === "waiting") return f._s.key === "waiting";
    if (view === "done") return f._s.key === "done";
    return true;
  });

  const tabs = [
    { id: "attention", label: "Needs attention", n: counts.attention },
    { id: "waiting", label: "Waiting", n: counts.waiting },
    { id: "done", label: "Done", n: counts.done },
    { id: "all", label: "All", n: enriched.length },
  ];

  return (
    <div className="fd-root">
      <style>{CSS}</style>

      <div className="fd-wrap">
        <header className="fd-head">
          <div>
            <div className="fd-kicker">CORRESPONDENCE LEDGER</div>
            <h1 className="fd-title">The Follow-Up Desk</h1>
            <p className="fd-sub">
              Track who still owes you documents. The desk tells you exactly who's due, writes the
              note, and opens it in your mail app in one click.
            </p>
          </div>
          <div className="fd-head-actions">
            <button className="fd-icon-btn" title="Settings" onClick={() => setShowSettings((s) => !s)}>
              <SettingsIcon size={18} />
            </button>
          </div>
        </header>

        <div className="fd-stats">
          <Stat n={counts.attention} label="need a nudge" tone="#9c3d28" />
          <Stat n={counts.waiting} label="waiting out the clock" tone="#5f6f54" />
          <Stat n={counts.done} label="documents received" tone="#8a8073" />
        </div>

        {showSettings && (
          <section className="fd-panel">
            <div className="fd-panel-head">
              <span>Default message & cadence</span>
              <button className="fd-icon-btn sm" onClick={() => setShowSettings(false)}><X size={16} /></button>
            </div>
            <label className="fd-label">Default days between follow-ups</label>
            <input
              className="fd-input short" type="number" min="1"
              value={settings.defaultInterval}
              onChange={(e) => setSettings((s) => ({ ...s, defaultInterval: Number(e.target.value) }))}
            />
            <label className="fd-label">Message template <span className="fd-hint">— use {"{name}"}, {"{subject}"}, {"{notes}"}, {"{signature}"}</span></label>
            <textarea
              className="fd-input area" rows={6}
              value={settings.template}
              onChange={(e) => setSettings((s) => ({ ...s, template: e.target.value }))}
            />
            <label className="fd-label">Signature</label>
            <textarea
              className="fd-input area" rows={2}
              value={settings.signature}
              onChange={(e) => setSettings((s) => ({ ...s, signature: e.target.value }))}
            />
            <div className="fd-panel-foot">
              <button className="fd-link-danger" onClick={resetAll}>
                <RotateCcw size={14} /> Clear all data
              </button>
            </div>
          </section>
        )}

        <div className="fd-toolbar">
          <div className="fd-tabs">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={"fd-tab" + (view === t.id ? " active" : "")}
                onClick={() => setView(t.id)}
              >
                {t.label}
                <span className="fd-tab-n">{t.n}</span>
              </button>
            ))}
          </div>
          <button
            className="fd-btn primary"
            onClick={() => {
              setForm(blankForm());
              setEditingId(null);
              setShowForm((s) => !s);
              setShowSettings(false);
            }}
          >
            <Plus size={16} /> New follow-up
          </button>
        </div>

        {showForm && (
          <section className="fd-panel form">
            <div className="fd-panel-head">
              <span>{editingId ? "Edit follow-up" : "Add a follow-up"}</span>
              <button className="fd-icon-btn sm" onClick={() => { setShowForm(false); setEditingId(null); }}>
                <X size={16} />
              </button>
            </div>
            <div className="fd-grid">
              <div>
                <label className="fd-label">Recipient name</label>
                <input className="fd-input" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jordan Smith" />
              </div>
              <div>
                <label className="fd-label">Email address *</label>
                <input className="fd-input" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jordan@company.com" />
              </div>
              <div>
                <label className="fd-label">Subject / context</label>
                <input className="fd-input" value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Q2 onboarding paperwork" />
              </div>
              <div>
                <label className="fd-label">What you're waiting on</label>
                <input className="fd-input" value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="signed contract + ID copy" />
              </div>
              <div>
                <label className="fd-label">Date you last contacted them</label>
                <input className="fd-input" type="date" value={form.lastContact}
                  onChange={(e) => setForm({ ...form, lastContact: e.target.value })} />
              </div>
              <div>
                <label className="fd-label">Remind me every (days)</label>
                <input className="fd-input" type="number" min="1" value={form.intervalDays}
                  onChange={(e) => setForm({ ...form, intervalDays: Number(e.target.value) })} />
              </div>
            </div>
            <div className="fd-form-foot">
              <button className="fd-btn ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</button>
              <button className="fd-btn primary" onClick={submit}>{editingId ? "Save changes" : "Add"}</button>
            </div>
          </section>
        )}

        <div className="fd-list">
          {!loaded && <div className="fd-empty">Loading your desk…</div>}

          {loaded && filtered.length === 0 && (
            <div className="fd-empty">
              <Inbox size={28} strokeWidth={1.5} />
              <p>{view === "done" ? "Nothing finished yet." : "Nothing here. Add someone you're chasing for documents."}</p>
            </div>
          )}

          {loaded &&
            filtered.map((f) => {
              const meta = STATUS_META[f._s.key];
              const Ic = meta.Icon;
              return (
                <article className="fd-card" key={f.id}>
                  <div className="fd-card-bar" style={{ background: meta.color }} />
                  <div className="fd-card-body">
                    <div className="fd-card-top">
                      <div className="fd-who">
                        <span className="fd-name">{f.name || f.email}</span>
                        {f.name && <span className="fd-email">{f.email}</span>}
                      </div>
                      <span className="fd-badge" style={{ color: meta.color, borderColor: meta.color }}>
                        <Ic size={13} />
                        {meta.label}
                        {f._s.key === "overdue" && ` · ${f._s.days}d`}
                        {f._s.key === "waiting" && ` · ${f._s.days}d left`}
                      </span>
                    </div>

                    {f.subject && <div className="fd-subject">{f.subject}</div>}
                    {f.notes && <div className="fd-notes">Awaiting: {f.notes}</div>}

                    <div className="fd-meta">
                      <span>Last contact {prettyDate(f.lastContact)}</span>
                      <span className="fd-dot">·</span>
                      <span>Every {f.intervalDays}d</span>
                      {f.followUpsSent > 0 && (
                        <>
                          <span className="fd-dot">·</span>
                          <span>{f.followUpsSent} follow-up{f.followUpsSent > 1 ? "s" : ""} sent</span>
                        </>
                      )}
                    </div>

                    <div className="fd-actions">
                      {f.status !== "done" ? (
                        <>
                          <button className="fd-btn primary sm" onClick={() => logFollowUp(f)}>
                            <Send size={14} /> Send follow-up
                          </button>
                          <button className="fd-btn ghost sm" onClick={() => copyText(f)}>
                            <Copy size={14} /> Copy text
                          </button>
                          <button className="fd-btn ghost sm" onClick={() => markDone(f.id)}>
                            <Check size={14} /> Got documents
                          </button>
                        </>
                      ) : (
                        <button className="fd-btn ghost sm" onClick={() => reactivate(f.id)}>
                          <RotateCcw size={14} /> Reopen
                        </button>
                      )}
                      <div className="fd-spacer" />
                      <button className="fd-icon-btn sm" title="Edit" onClick={() => startEdit(f)}><Pencil size={15} /></button>
                      <button className="fd-icon-btn sm danger" title="Delete" onClick={() => remove(f.id)}><Trash2 size={15} /></button>
                    </div>
                  </div>
                </article>
              );
            })}
        </div>

        <footer className="fd-foot">
          <Mail size={13} /> “Send follow-up” opens your default mail app (set Outlook as your default
          to compose there), pre-filled and ready to review before you hit send.
        </footer>
      </div>

      {toast && <div className="fd-toast">{toast}</div>}
    </div>
  );
}

function Stat({ n, label, tone }) {
  return (
    <div className="fd-stat">
      <span className="fd-stat-n" style={{ color: tone }}>{n}</span>
      <span className="fd-stat-l">{label}</span>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');

.fd-root{
  --paper:#efe7d8; --surface:#fbf8f1; --ink:#23201a; --muted:#6f6557;
  --line:#ddd2bd; --accent:#a8442a; --accent-d:#8a3620;
  font-family:'IBM Plex Sans',sans-serif; color:var(--ink);
  background:var(--paper);
  background-image:radial-gradient(circle at 18% 12%, #f6f0e3 0%, transparent 55%),
                   radial-gradient(circle at 88% 0%, #f1e9da 0%, transparent 45%);
  min-height:100vh; width:100%; box-sizing:border-box;
}
.fd-root *{box-sizing:border-box;}
.fd-wrap{max-width:760px; margin:0 auto; padding:40px 22px 60px;}

.fd-head{display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:26px;}
.fd-kicker{font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:.22em; color:var(--accent); margin-bottom:8px;}
.fd-title{font-family:'Fraunces',serif; font-weight:600; font-size:42px; line-height:1; margin:0 0 12px; letter-spacing:-.01em;}
.fd-sub{margin:0; font-size:14.5px; line-height:1.55; color:var(--muted); max-width:54ch;}
.fd-head-actions{flex-shrink:0;}

.fd-stats{display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:24px;}
.fd-stat{background:var(--surface); border:1px solid var(--line); border-radius:14px; padding:16px 18px; display:flex; flex-direction:column; gap:4px;}
.fd-stat-n{font-family:'Fraunces',serif; font-size:34px; font-weight:600; line-height:1;}
.fd-stat-l{font-size:12px; color:var(--muted); line-height:1.3;}

.fd-toolbar{display:flex; justify-content:space-between; align-items:center; gap:14px; margin-bottom:18px; flex-wrap:wrap;}
.fd-tabs{display:flex; gap:4px; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:4px;}
.fd-tab{border:none; background:none; font-family:inherit; font-size:13px; color:var(--muted); padding:7px 12px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:7px; transition:all .15s;}
.fd-tab:hover{color:var(--ink);}
.fd-tab.active{background:var(--ink); color:var(--paper);}
.fd-tab-n{font-family:'IBM Plex Mono',monospace; font-size:11px; opacity:.7;}

.fd-btn{font-family:inherit; font-size:13.5px; font-weight:500; border-radius:10px; padding:9px 15px; cursor:pointer; display:inline-flex; align-items:center; gap:7px; border:1px solid transparent; transition:all .15s;}
.fd-btn.sm{font-size:12.5px; padding:7px 11px; border-radius:9px;}
.fd-btn.primary{background:var(--accent); color:#fdfbf6; box-shadow:0 1px 0 var(--accent-d);}
.fd-btn.primary:hover{background:var(--accent-d);}
.fd-btn.ghost{background:transparent; color:var(--ink); border-color:var(--line);}
.fd-btn.ghost:hover{background:#f3ecdd; border-color:#cdbfa4;}

.fd-icon-btn{background:var(--surface); border:1px solid var(--line); border-radius:10px; width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:var(--ink); transition:all .15s;}
.fd-icon-btn.sm{width:32px; height:32px; border-radius:8px;}
.fd-icon-btn:hover{background:#f3ecdd; border-color:#cdbfa4;}
.fd-icon-btn.danger:hover{color:var(--accent); border-color:var(--accent);}

.fd-panel{background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:20px; animation:fdIn .2s ease;}
.fd-panel-head{display:flex; justify-content:space-between; align-items:center; font-family:'Fraunces',serif; font-size:18px; font-weight:600; margin-bottom:16px;}
.fd-panel-foot{margin-top:16px; padding-top:14px; border-top:1px solid var(--line);}
.fd-label{display:block; font-size:12px; color:var(--muted); margin:0 0 6px; font-weight:500;}
.fd-hint{color:#a59a82; font-weight:400;}
.fd-input{width:100%; font-family:inherit; font-size:14px; color:var(--ink); background:#fdfcf8; border:1px solid var(--line); border-radius:10px; padding:10px 12px; transition:border .15s;}
.fd-input:focus{outline:none; border-color:var(--accent);}
.fd-input.short{max-width:120px;}
.fd-input.area{font-family:inherit; line-height:1.5; resize:vertical; margin-bottom:14px;}
.fd-grid{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
.fd-form-foot{display:flex; justify-content:flex-end; gap:10px; margin-top:18px;}

.fd-list{display:flex; flex-direction:column; gap:12px;}
.fd-card{display:flex; background:var(--surface); border:1px solid var(--line); border-radius:14px; overflow:hidden; animation:fdIn .25s ease;}
.fd-card-bar{width:5px; flex-shrink:0;}
.fd-card-body{padding:16px 18px; flex:1; min-width:0;}
.fd-card-top{display:flex; justify-content:space-between; align-items:flex-start; gap:12px;}
.fd-who{display:flex; flex-direction:column; min-width:0;}
.fd-name{font-family:'Fraunces',serif; font-size:18px; font-weight:600; line-height:1.2;}
.fd-email{font-size:12.5px; color:var(--muted); font-family:'IBM Plex Mono',monospace; margin-top:2px;}
.fd-badge{flex-shrink:0; display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:500; border:1px solid; border-radius:999px; padding:4px 10px; background:#fdfcf8; white-space:nowrap;}
.fd-subject{margin-top:10px; font-size:14px; font-weight:500;}
.fd-notes{margin-top:3px; font-size:13px; color:var(--muted);}
.fd-meta{margin-top:10px; font-size:12px; color:var(--muted); font-family:'IBM Plex Mono',monospace; display:flex; flex-wrap:wrap; gap:6px; align-items:center;}
.fd-dot{opacity:.5;}
.fd-actions{margin-top:14px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;}
.fd-spacer{flex:1;}

.fd-empty{text-align:center; color:var(--muted); padding:48px 20px; display:flex; flex-direction:column; align-items:center; gap:12px; font-size:14px;}

.fd-foot{margin-top:30px; padding-top:18px; border-top:1px solid var(--line); font-size:12px; color:var(--muted); display:flex; align-items:flex-start; gap:8px; line-height:1.5;}

.fd-link-danger{background:none; border:none; color:var(--accent); font-family:inherit; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; padding:0;}
.fd-link-danger:hover{text-decoration:underline;}

.fd-toast{position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--ink); color:var(--paper); font-size:13px; padding:11px 18px; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.18); animation:fdIn .2s ease; z-index:50;}

@keyframes fdIn{from{opacity:0; transform:translateY(6px);} to{opacity:1; transform:none;}}

@media(max-width:560px){
  .fd-stats{grid-template-columns:1fr;}
  .fd-grid{grid-template-columns:1fr;}
  .fd-title{font-size:34px;}
  .fd-toolbar{flex-direction:column; align-items:stretch;}
  .fd-tabs{overflow-x:auto;}
}
`;
