// BDI University — live odds proxy (The Odds API), with Firestore caching.
//
// Keeps the API key server-side and shields the free-tier quota: results are
// cached in shared/oddsCache for ~30 min, so many client opens cost one upstream
// call. Returns moneyline (h2h) odds for all World Cup matches; the client picks
// the match and prefers Hard Rock Bet when that book is offered.
//
// Env: THE_ODDS_API_KEY (free at the-odds-api.com), plus the Firebase SA vars.

const { getDoc, setDoc } = require("./_firestore.js");

const SPORT = "soccer_fifa_world_cup";
const TTL_MS = 30 * 60 * 1000;

module.exports = async (req, res) => {
  try {
    const key = process.env.THE_ODDS_API_KEY;
    if (!key) { res.status(200).json({ configured: false, events: [] }); return; }

    let cached = null;
    try { const c = await getDoc("shared", "oddsCache"); cached = c && c.data ? JSON.parse(c.data) : null; } catch (e) {}
    if (cached && cached.at && (Date.now() - cached.at) < TTL_MS) {
      res.status(200).json({ configured: true, cached: true, at: cached.at, events: cached.events || [] });
      return;
    }

    const url = "https://api.the-odds-api.com/v4/sports/" + SPORT +
      "/odds/?regions=us&markets=h2h&oddsFormat=american&apiKey=" + encodeURIComponent(key);
    const r = await fetch(url);
    if (!r.ok) {
      if (cached) { res.status(200).json({ configured: true, cached: true, stale: true, at: cached.at, events: cached.events || [] }); return; }
      res.status(200).json({ configured: true, error: "upstream " + r.status, events: [] });
      return;
    }
    const data = await r.json();
    const events = (Array.isArray(data) ? data : []).map((e) => ({
      id: e.id,
      home: e.home_team,
      away: e.away_team,
      commence: e.commence_time,
      books: (e.bookmakers || []).map((b) => ({
        key: b.key,
        title: b.title,
        h2h: ((b.markets || []).find((m) => m.key === "h2h") || {}).outcomes || [],
      })),
    }));
    try { await setDoc("shared", "oddsCache", { data: JSON.stringify({ at: Date.now(), events: events }) }); } catch (e) {}
    res.status(200).json({ configured: true, cached: false, at: Date.now(), events: events });
  } catch (e) {
    res.status(200).json({ configured: false, error: e.message, events: [] });
  }
};
