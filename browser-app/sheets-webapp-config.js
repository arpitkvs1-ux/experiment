/**
 * Google Sheets Web App URL — paste your deployment URL here (must end with /exec).
 * Teachers use the same URL with ?teacher=1 (see TeacherMarks.html in Apps Script).
 *
 * School branding: shown in the dashboard, exports, and should match CONFIG in Code.gs
 * (SCHOOL_NAME / SCHOOL_CLASS) for the teacher marks page + PDFs.
 */
window.KV_SHEETS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwaxzuqy7wn2vkTY4RKzXBtTW4cz7R7QOx6ZXpzPEogWKT3j-vzQc4r7Uzwa4hK4rQn/exec";

/** Shown in sidebar, header, modals, and mark-slip PDFs from this app. */
window.KV_SCHOOL_NAME = "KV NIT Agartala";

/**
 * Class / section line (e.g. "Class VII"). Use "" or "—" to hide the class line in the UI.
 */
window.KV_SCHOOL_CLASS = "Class VII";
