/**
 * Google Sign-In for the browser dashboard (Google Identity Services).
 * Android uses MainActivity AndroidAccount bridge instead.
 */
(function (global) {
  "use strict";

  var WEB_SESSION_KEY = "__kv_google_web_session_v1";

  var gisReady = null;

  function getClientId() {
    return String(global.KV_GOOGLE_WEB_CLIENT_ID || "").trim();
  }

  function loadGisScript() {
    if (global.google && global.google.accounts) return Promise.resolve();
    if (gisReady) return gisReady;
    gisReady = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve();
        });
        existing.addEventListener("error", function () {
          reject(new Error("Failed to load Google Sign-In."));
        });
        if (global.google && global.google.accounts) resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Failed to load Google Sign-In."));
      };
      document.head.appendChild(s);
    });
    return gisReady;
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(WEB_SESSION_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return o && o.signedIn ? o : null;
    } catch (_e) {
      return null;
    }
  }

  function saveSession(info, accessToken) {
    localStorage.setItem(
      WEB_SESSION_KEY,
      JSON.stringify({
        signedIn: true,
        email: info.email || "",
        displayName: info.displayName || "",
        id: info.id || "",
        accessToken: accessToken || ""
      })
    );
  }

  function clearSession() {
    try {
      localStorage.removeItem(WEB_SESSION_KEY);
    } catch (_e) {}
  }

  function getAccountInfo() {
    var s = loadSession();
    if (s) {
      return {
        signedIn: true,
        email: s.email || "",
        displayName: s.displayName || "",
        id: s.id || ""
      };
    }
    return { signedIn: false, email: "", displayName: "", id: "" };
  }

  function signIn() {
    var clientId = getClientId();
    if (!clientId) {
      return Promise.reject(
        new Error(
          "Set KV_GOOGLE_WEB_CLIENT_ID in sheets-webapp-config.js to your Web OAuth client ID " +
            "(Google Cloud Console → Credentials → OAuth 2.0 → Web application)."
        )
      );
    }
    return loadGisScript().then(function () {
      return new Promise(function (resolve, reject) {
        var tokenClient = global.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: function (tokenResponse) {
            if (tokenResponse.error) {
              if (
                tokenResponse.error === "popup_closed_by_user" ||
                tokenResponse.error === "access_denied"
              ) {
                resolve(null);
                return;
              }
              reject(new Error(tokenResponse.error_description || tokenResponse.error));
              return;
            }
            fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
              headers: { Authorization: "Bearer " + tokenResponse.access_token }
            })
              .then(function (r) {
                if (!r.ok) throw new Error("Could not load your Google profile.");
                return r.json();
              })
              .then(function (user) {
                var info = {
                  signedIn: true,
                  email: user.email || "",
                  displayName: user.name || "",
                  id: user.sub || ""
                };
                saveSession(info, tokenResponse.access_token);
                resolve(info);
              })
              .catch(reject);
          }
        });
        tokenClient.requestAccessToken({ prompt: "select_account" });
      });
    });
  }

  function signOut() {
    var session = loadSession();
    clearSession();
    return loadGisScript()
      .then(function () {
        try {
          if (
            session &&
            session.accessToken &&
            global.google &&
            global.google.accounts &&
            global.google.accounts.oauth2
          ) {
            global.google.accounts.oauth2.revoke(session.accessToken, function () {});
          }
        } catch (_e) {}
      })
      .catch(function () {})
      .then(function () {
        return undefined;
      });
  }

  global.KVGoogleSignIn = {
    getAccountInfo: getAccountInfo,
    signIn: signIn,
    signOut: signOut
  };
})(window);
