// BDI University — Microsoft 365 connection for Outlook automation
// Handles the OAuth consent handshake so the site can send mail and create
// calendar events on the admin's behalf, even when no browser is open.
//
// Flow:
//   GET  /api/ms-auth?action=login   -> redirects admin to Microsoft sign-in
//   GET  /api/ms-auth (with ?code=)  -> Microsoft redirects back here; we save tokens
//
// Required Vercel env vars:
//   MS_CLIENT_ID         (Azure app registration "Application (client) ID")
//   MS_CLIENT_SECRET     (Azure app registration client secret VALUE)
//   MS_REDIRECT_URI      (e.g. https://bdiuniversity.com/api/ms-auth)
//   FIREBASE_PROJECT_ID  (followup-test-87163)
//   FB_SA_CLIENT_EMAIL   (Firebase service-account email)
//   FB_SA_PRIVATE_KEY    (Firebase service-account private key)
//   ADMIN_EMAIL          (dgonzalez@bdico.com)

const { getDoc, setDoc } = require("./_firestore.js");

// Graph scopes: send mail, manage calendar, read user, and offline_access for refresh tokens
const SCOPES = "offline_access User.Read Mail.Send Calendars.ReadWrite";

// Build the Microsoft sign-in (authorize) redirect. `state` carries the uid so we
// know whose mailbox this is when Microsoft redirects back. `prompt` lets the
// caller force a fresh consent ("consent") or skip it once already granted
// ("select_account").
function buildAuthRedirect({ clientId, redirectUri, state, prompt }) {
  const auth = new URL("https://login.microsoftonline.com/" + (process.env.MS_TENANT_ID || "common") + "/oauth2/v2.0/authorize");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_mode", "query");
  auth.searchParams.set("scope", SCOPES);
  auth.searchParams.set("prompt", prompt || "consent");
  if (state) auth.searchParams.set("state", state);
  return auth.toString();
}

// `state` is the user's uid, optionally suffixed with "~r" to mark that we've
// already bounced once through the admin-consent retry (so we never loop).
function parseState(raw) {
  const s = raw || "";
  const retried = s.endsWith("~r");
  return { uid: retried ? s.slice(0, -2) : s, retried };
}

module.exports = async (req, res) => {
  try {
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    const redirectUri = process.env.MS_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      res.status(500).send("Microsoft automation not configured (missing MS_* env vars).");
      return;
    }

    const url = new URL(req.url, "https://" + req.headers.host);
    const action = url.searchParams.get("action");
    const code = url.searchParams.get("code");
    const adminConsent = url.searchParams.get("admin_consent");
    const oauthErr = url.searchParams.get("error");
    const oauthErrDesc = url.searchParams.get("error_description");

    // Microsoft redirected back with an error instead of a code — show it plainly
    if (oauthErr) {
      res.status(400).send("Microsoft sign-in error: " + oauthErr + "\n\n" + (oauthErrDesc || "") + "\n\nTell your developer this exact message.");
      return;
    }

    // Step 1: send the user to Microsoft to grant consent (carry their uid in state)
    if (action === "login") {
      const uid = url.searchParams.get("uid") || "";
      res.writeHead(302, { Location: buildAuthRedirect({ clientId, redirectUri, state: uid, prompt: "consent" }) });
      res.end();
      return;
    }

    // Admin-consent callback: when the tenant requires admin approval, Microsoft
    // grants org-wide consent and redirects back with `admin_consent=True` but
    // NO authorization code. Re-launch sign-in now that consent exists so we can
    // actually obtain a code. The "~r" suffix on state guards against looping.
    if (adminConsent && !code) {
      const { uid, retried } = parseState(url.searchParams.get("state"));
      if (!retried) {
        res.writeHead(302, { Location: buildAuthRedirect({ clientId, redirectUri, state: uid + "~r", prompt: "select_account" }) });
        res.end();
        return;
      }
      res.status(502).send("Admin consent was granted, but Microsoft didn't return a sign-in code. Please click \"Connect Outlook\" once more to finish connecting.");
      return;
    }

    // Step 2: Microsoft redirected back with a code — exchange it for tokens
    if (code) {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: SCOPES,
      });
      const r = await fetch("https://login.microsoftonline.com/" + (process.env.MS_TENANT_ID || "common") + "/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      const tok = await r.json();
      if (!r.ok || !tok.refresh_token) {
        res.status(502).send("Microsoft sign-in failed: " + (tok.error_description || "no refresh token returned."));
        return;
      }
      // Identify which mailbox this is
      const me = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: "Bearer " + tok.access_token },
      }).then((x) => x.json()).catch(() => ({}));

      const uid = parseState(url.searchParams.get("state")).uid;
      const record = {
        refresh_token: tok.refresh_token,
        email: me.mail || me.userPrincipalName || "",
        connectedAt: new Date().toISOString(),
      };
      if (uid) {
        // per-user connection: store under this person's own doc
        await setDoc("outlookTokens", uid, record);
      } else {
        // fallback (no uid supplied) keeps older single-admin behaviour
        await setDoc("shared", "msAuth", record);
      }

      res.writeHead(302, { Location: "/?msconnected=1" });
      res.end();
      return;
    }

    res.status(400).send("Nothing to do. Use ?action=login to connect Outlook.");
  } catch (e) {
    res.status(500).send("Auth error: " + e.message);
  }
};
