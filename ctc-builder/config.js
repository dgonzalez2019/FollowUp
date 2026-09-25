// CTC Proposal Builder settings for the BDI portal.
// firebaseConfig matches the portal's FIREBASE_CONFIG (index.html), so the builder
// shares the portal's sign-in when it runs in the same-origin iframe.
window.CTC_BUILDER_CONFIG = {
  apiUrl: "/api/claude",          // the portal's Claude route (forwards tools, returns raw Anthropic JSON)
  // Faster tiers so a single call finishes inside Vercel Hobby's 60s function cap.
  // Main line-item extraction runs on Haiku 4.5 (fast); the coverage review, whose
  // output is small, runs on Sonnet 5. Bump these back up (e.g. default: sonnet-5,
  // complex: opus-5-5) if the route ever gets a longer timeout (Vercel Pro / Firebase).
  models: { quick: "claude-haiku-4-5-20251001", default: "claude-haiku-4-5-20251001", complex: "claude-sonnet-5" },
  maxTokens: 6000,                // cap output per call so generation stays under ~60s (was 8000)
  firebaseConfig: {
    apiKey: "AIzaSyAYy7HfGD_hJg9WImrv9MFRwOy761Al1uI",
    authDomain: "followup-test-87163.firebaseapp.com",
    projectId: "followup-test-87163",
    storageBucket: "followup-test-87163.firebasestorage.app",
    messagingSenderId: "947409367445",
    appId: "1:947409367445:web:badc19ab30f784467f469c",
  },
  jobsCollection: "ctcJobs",      // Firestore collection for past jobs (seeded from ctc-jobs.json the first time)
  adminEmails: ["dgonzalez@bdico.com"] // who can delete past jobs (matches the portal admin / Firestore isAdmin())
};
