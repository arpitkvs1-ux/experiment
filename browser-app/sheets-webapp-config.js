/**
 * Google Sheets Web App URL — paste your deployment URL here (must end with /exec).
 * Teachers use the same URL with ?teacher=1 (see TeacherMarks.html in Apps Script).
 *
 * School branding: shown in the dashboard, exports, and should match CONFIG in Code.gs
 * (SCHOOL_NAME / SCHOOL_CLASS) for the teacher marks page + PDFs.
 */
window.KV_SHEETS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzailLBARF73Fet7ppuHKWXGzr3yMYTCY130kTq0ErC5X4SVECjCYz4OwMMDfjQlTBN/exec";

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
