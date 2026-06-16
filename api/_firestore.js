// Minimal Firestore access for Vercel serverless functions, via the REST API
// and a Google service-account JWT. No heavy SDK needed.
//
// Env vars required:
//   FIREBASE_PROJECT_ID   followup-test-87163
//   FB_SA_CLIENT_EMAIL    xxx@followup-test-87163.iam.gserviceaccount.com
//   FB_SA_PRIVATE_KEY     -----BEGIN PRIVATE KEY----- ... (with \n escapes)

const crypto = require("crypto");

let cachedToken = null;
let cachedExp = 0;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedExp - 60) return cachedToken;

  const email = process.env.FB_SA_CLIENT_EMAIL;
  let key = process.env.FB_SA_PRIVATE_KEY || "";
  key = key.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Missing Firebase service-account env vars");

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(header + "." + claim);
  const sig = b64url(signer.sign(key));
  const jwt = header + "." + claim + "." + sig;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=" + jwt,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("Firestore token error: " + JSON.stringify(j));
  cachedToken = j.access_token;
  cachedExp = now + (j.expires_in || 3600);
  return cachedToken;
}

function base() {
  const pid = process.env.FIREBASE_PROJECT_ID;
  return "https://firestore.googleapis.com/v1/projects/" + pid + "/databases/(default)/documents";
}

// ---- tiny value (de)serializers for the fields we use (strings, bools, nested JSON-as-string) ----
function toFields(obj) {
  const f = {};
  Object.keys(obj).forEach((k) => {
    const v = obj[k];
    if (typeof v === "boolean") f[k] = { booleanValue: v };
    else if (typeof v === "number") f[k] = { doubleValue: v };
    else f[k] = { stringValue: String(v == null ? "" : v) };
  });
  return f;
}
function fromFields(fields) {
  const o = {};
  Object.keys(fields || {}).forEach((k) => {
    const v = fields[k];
    if ("booleanValue" in v) o[k] = v.booleanValue;
    else if ("doubleValue" in v) o[k] = v.doubleValue;
    else if ("integerValue" in v) o[k] = Number(v.integerValue);
    else o[k] = v.stringValue;
  });
  return o;
}

async function getDoc(coll, id) {
  const token = await getAccessToken();
  const r = await fetch(base() + "/" + coll + "/" + id, {
    headers: { Authorization: "Bearer " + token },
  });
  if (r.status === 404) return null;
  const j = await r.json();
  if (!j.fields) return null;
  return fromFields(j.fields);
}

async function setDoc(coll, id, obj) {
  const token = await getAccessToken();
  const r = await fetch(base() + "/" + coll + "/" + id, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error("Firestore write failed: " + (await r.text()));
  return true;
}

async function listDocs(coll) {
  const token = await getAccessToken();
  const out = [];
  let pageToken = "";
  do {
    const u = base() + "/" + coll + "?pageSize=300" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const r = await fetch(u, { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) break;
    const j = await r.json();
    (j.documents || []).forEach((d) => {
      const id = d.name.split("/").pop();
      out.push({ id, data: d.fields ? fromFields(d.fields) : {} });
    });
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

// subcollection doc helpers: users/{uid}/auto/queue
async function getSubDoc(path) {
  const token = await getAccessToken();
  const r = await fetch(base() + "/" + path, { headers: { Authorization: "Bearer " + token } });
  if (r.status === 404) return null;
  const j = await r.json();
  if (!j.fields) return null;
  return fromFields(j.fields);
}
async function setSubDoc(path, obj) {
  const token = await getAccessToken();
  const r = await fetch(base() + "/" + path, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: toFields(obj) }),
  });
  if (!r.ok) throw new Error("Firestore write failed: " + (await r.text()));
  return true;
}

module.exports = { getDoc, setDoc, listDocs, getSubDoc, setSubDoc, getAccessToken, base };
