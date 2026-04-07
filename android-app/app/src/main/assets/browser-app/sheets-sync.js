/**
 * Google Sheets Web App client (deploy Code.gs from ../google-apps-script/).
 * URL: set window.KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js (loaded before this file).
 */
(function (global) {
  function shortSheetsError(raw, maxLen) {
    maxLen = maxLen || 140;
    var s = String(raw == null ? "" : raw)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (!s) return "Request failed.";
    if (/DOCTYPE|<html|\.google\.com\/macros/i.test(s) && s.length > 50) {
      return "Bad response from server. Check web app URL and redeploy.";
    }
    if (s.length > maxLen) return s.slice(0, maxLen - 1) + "\u2026";
    return s;
  }

  function getSheetsUrl() {
    try {
      var u = String(global.KV_SHEETS_WEB_APP_URL || "").trim();
      if (!u || u.indexOf("PASTE_") === 0) return "";
      return u;
    } catch (e) {
      return "";
    }
  }

  function sheetsCall(action, payload) {
    var url = getSheetsUrl();
    if (!url) {
      return Promise.reject(new Error("Configure KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js."));
    }
    return fetch(url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload || {} }),
    })
      .then(function (res) {
        return res.text().then(function (text) {
          return { okHttp: res.ok, status: res.status, text: text };
        });
      })
      .then(function (pack) {
        if (!pack.okHttp) {
          throw new Error(
            pack.status === 401 || pack.status === 403
              ? "Access denied. Redeploy web app as Anyone."
              : "Server error (" + pack.status + "). Try again."
          );
        }
        var text = pack.text;
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error(shortSheetsError(text, 120));
        }
        if (!data.ok) {
          throw new Error(shortSheetsError(data.error, 160));
        }
        return data;
      });
  }

  global.KVSheets = {
    getSheetsUrl: getSheetsUrl,
    sheetsCall: sheetsCall,
  };
})(typeof window !== "undefined" ? window : this);
