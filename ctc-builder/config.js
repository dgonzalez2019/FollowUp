// CTC Proposal Builder settings for the BDI portal.
// firebaseConfig matches the portal's FIREBASE_CONFIG (index.html), so the builder
// shares the portal's sign-in when it runs in the same-origin iframe.
window.CTC_BUILDER_CONFIG = {
  apiUrl: "/api/claude",          // the portal's Claude route (forwards tools, returns raw Anthropic JSON)
  models: { quick: "claude-haiku-4-5-20251001", default: "claude-sonnet-5", complex: "claude-opus-5-5" },
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
