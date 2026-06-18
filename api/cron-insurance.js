// BDI University — subcontractor insurance reminder, standalone endpoint.
//
// The actual logic lives in _insurance.js and is run daily as part of
// cron-followups (Hobby plan allows only one cron job). This endpoint stays
// available for manual runs/testing: GET /api/cron-insurance?key=CRON_SECRET

const { runInsuranceReminders } = require("./_insurance.js");

module.exports = async (req, res) => {
  const secret = (req.headers.authorization || "").replace("Bearer ", "") ||
    new URL(req.url, "https://x").searchParams.get("key");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    const log = await runInsuranceReminders();
    res.status(200).json(log);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
