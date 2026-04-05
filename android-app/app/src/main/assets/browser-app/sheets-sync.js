/**
 * Google Sheets Web App client (deploy Code.gs from ../google-apps-script/).
 * URL: set window.KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js (loaded before this file).
 */
(function (global) {
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
      return Promise.reject(
        new Error("Set KV_SHEETS_WEB_APP_URL in sheets-webapp-config.js to your deployed web app URL.")
      );
    }
    return fetch(url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: action, payload: payload || {} }),
    })
      .then(function (res) {
        return res.text();
      })
      .then(function (text) {
        var data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          throw new Error("Invalid response from Sheets (not JSON). Check KV_SHEETS_WEB_APP_URL.");
        }
        if (!data.ok) {
          throw new Error(data.error || "Sheets request failed");
        }
        return data;
      });
  }

  global.KVSheets = {
    getSheetsUrl: getSheetsUrl,
    sheetsCall: sheetsCall,
  };
})(typeof window !== "undefined" ? window : this);
