/**
 * Google Sheets Web App URL — paste your deployment URL here (must end with /exec).
 * Teachers use the same URL with ?teacher=1 (see TeacherMarks.html in Apps Script).
 *
 * School branding: shown in the dashboard, exports, and should match CONFIG in Code.gs
 * (SCHOOL_NAME / SCHOOL_CLASS) for the teacher marks page + PDFs.
 */
window.KV_SHEETS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwMR8uE-B1uJoEFaWlyn9nIIbO0Jv-5ffiQ789KxvM8ruoq0Ozu6OXp5eSMS-HhOdsR/exec";

/**
 * While the dashboard tab is visible (any screen except Setup guide), pull Master + marks slip list
 * this often (milliseconds) so changes from other editors show up without pressing Sync.
 * Min 15000, max 600000. Use false, -1, or "off" to disable (manual Sync / app open / reconnect still pull).
 */
window.KV_SHEETS_FOREGROUND_POLL_MS = 45000;

/** Shown in sidebar, header, modals, and mark-slip PDFs from this app. */
window.KV_SCHOOL_NAME = "Kendriya Vidyalaya NIT Agartala";

/**
 * Class / section line (e.g. "Class VII"). Use "" or "—" to hide the class line in the UI.
 */
window.KV_SCHOOL_CLASS = "Class VII";

/**
 * Web OAuth 2.0 client ID (type: Web application) from Google Cloud Console.
 * Required for Settings → Sign in with Google in the browser dashboard.
 *
 * Setup:
 * 1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client → Web application
 * 2. Authorized JavaScript origins: add every URL you use to open the app, e.g.
 *    http://localhost:3000   http://127.0.0.1:3000   https://your-domain.example
 * 3. Paste the client ID here (ends with .apps.googleusercontent.com)
 *
 * Serve the app over http://localhost (not file://) — run: npm run dev  in browser-app/
 */
window.KV_GOOGLE_WEB_CLIENT_ID = "";

/** KVS SAMAGAM URLs (override capture URL in Settings if your class link differs). */
window.KV_SAMAGAM_LOGIN_URL = "https://samagam.kvs.gov.in/user/login";
window.KV_SAMAGAM_CAPTURE_URL =
  "https://samagam.kvs.gov.in/mis/attendance/capture/1/69d476d9e4d94";
