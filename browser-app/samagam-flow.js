/**
 * KVS SAMAGAM attendance push — credentials, flow launcher, browser step panel.
 * Browser: opens SAMAGAM in a real tab (iframe breaks login/cookies).
 * Android: AndroidSamagam WebView with autofill injection.
 */
(function (global) {
  "use strict";

  var SAMAGAM_SETTINGS_KEY = "kv_samagam_settings_v1";
  var SAMAGAM_TAB_NAME = "kv_samagam_flow";

  var DEFAULT_LOGIN_URL = "https://samagam.kvs.gov.in/user/login";
  var DEFAULT_CAPTURE_URL =
    "https://samagam.kvs.gov.in/mis/attendance/capture/1/69d476d9e4d94";

  function loginUrl() {
    return String(global.KV_SAMAGAM_LOGIN_URL || DEFAULT_LOGIN_URL).trim() || DEFAULT_LOGIN_URL;
  }

  function captureUrl() {
    var fromSettings = "";
    try {
      fromSettings = String((loadSamagamSettings() || {}).captureUrl || "").trim();
    } catch (_e) {}
    if (fromSettings) return fromSettings;
    return String(global.KV_SAMAGAM_CAPTURE_URL || DEFAULT_CAPTURE_URL).trim() || DEFAULT_CAPTURE_URL;
  }

  function loadSamagamSettings() {
    try {
      var raw = localStorage.getItem(SAMAGAM_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function saveSamagamSettings(obj) {
    localStorage.setItem(SAMAGAM_SETTINGS_KEY, JSON.stringify(obj || {}));
  }

  function getCredentials() {
    var s = loadSamagamSettings();
    return {
      username: String(s.username || "").trim(),
      password: String(s.password || ""),
      captureUrl: String(s.captureUrl || "").trim()
    };
  }

  function buildFlowPayload(entries) {
    var creds = getCredentials();
    return {
      loginUrl: loginUrl(),
      captureUrl: captureUrl(),
      username: creds.username,
      password: creds.password,
      entries: Array.isArray(entries) ? entries : [],
      date: new Date().toISOString().slice(0, 10)
    };
  }

  function validateBeforeStart() {
    var creds = getCredentials();
    if (!creds.username || !creds.password) {
      return "Save SAMAGAM Login ID and password in Settings first.";
    }
    return "";
  }


  function devServerBase() {
    return "http://localhost:3000";
  }

  function toProxyUrl(absUrl) {
    var u = String(absUrl || "").trim();
    if (!u) return devServerBase() + "/samagam-proxy/user/login";
    return u.replace(/^https:\/\/samagam\.kvs\.gov\.in/i, devServerBase() + "/samagam-proxy");
  }

  function apiBase() {
    try {
      if (global.location && (global.location.protocol === "http:" || global.location.protocol === "https:")) {
        return global.location.origin;
      }
    } catch (_e) {}
    return devServerBase();
  }

  var _devServerOk = null;

  function checkDevServer() {
    if (_devServerOk != null) {
      return Promise.resolve(_devServerOk);
    }
    return fetch(apiBase() + "/api/health", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("bad");
        return r.json();
      })
      .then(function (data) {
        _devServerOk = !!(data && data.ok && data.server === "vaayu-dev");
        return _devServerOk;
      })
      .catch(function () {
        _devServerOk = false;
        return false;
      });
  }

  function stashPendingPayload(payload) {
    try {
      var copy = payload || {};
      copy.active = true;
      copy.stashedAt = new Date().toISOString();
      var s = JSON.stringify(copy);
      localStorage.setItem("kv_samagam_pending_v1", s);
      sessionStorage.setItem("kv_samagam_pending_v1", s);
    } catch (_e) {}
  }

  function publishPending(payload) {
    return checkDevServer().then(function (ok) {
      if (!ok) {
        throw new Error(
          "Wrong server on port 3000. Close any old terminal running npm serve, then double-click start-web.bat in browser-app."
        );
      }
      return fetch(apiBase() + "/api/samagam-pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload || {}),
      }).then(function (r) {
        if (!r.ok) throw new Error("Could not save SAMAGAM pending data on dev server.");
        return r.json();
      });
    });
  }

  function buildInjectLoginScript(creds) {
    var u = JSON.stringify(String(creds.username || ""));
    var p = JSON.stringify(String(creds.password || ""));
    return (
      "(function(){try{if(window.KVSamagamInject&&KVSamagamInject.loginPage){" +
      "return KVSamagamInject.loginPage({username:" +
      u +
      ",password:" +
      p +
      "});}" +
      "var u=document.querySelector('input[name=\"username\"]');" +
      "var pw=document.querySelector('input[name=\"password\"]');" +
      "if(u)u.value=" +
      u +
      ";if(pw)pw.value=" +
      p +
      ";return {ok:true,step:'login'};}catch(e){return {ok:false,error:String(e)};}})();"
    );
  }

  function buildInjectAttendanceScript(entries) {
    return (
      "(function(){try{var entries=" +
      JSON.stringify(entries || []) +
      ";if(window.KVSamagamInject&&KVSamagamInject.attendancePage){" +
      "return KVSamagamInject.attendancePage(entries);}return {ok:false,step:'attendance'};" +
      "}catch(e){return {ok:false,error:String(e)};}})();"
    );
  }

  function openSamagamTab(url) {
    var target = String(url || "").trim();
    if (!target) return false;
    var w = null;
    try {
      w = global.open(target, SAMAGAM_TAB_NAME);
    } catch (_e) {}
    if (!w) {
      alert(
        "Your browser blocked the SAMAGAM tab.\n\n" +
          "Allow popups for this page, then click Mark to SAMAGAM again.\n\n" +
          "Or open manually:\n" +
          target
      );
      return false;
    }
    try {
      w.focus();
    } catch (_e2) {}
    return true;
  }

  function showResultDialog(message) {
    if (typeof global.KV_showOkDialog === "function") {
      global.KV_showOkDialog(message);
    } else {
      alert(message);
    }
  }

  function startBrowserOverlayFlow(payload) {
    stashPendingPayload(payload);
    var proxyLogin = toProxyUrl(payload.loginUrl);
    publishPending(payload)
      .then(function () {
        openSamagamTab(proxyLogin);
      })
      .catch(function (err) {
        alert(
          (err && err.message ? err.message : "Dev server not running.") +
            "\n\n1. Close any terminal that says \"serve\" on port 3000\n2. Double-click start-web.bat in browser-app\n3. Hard-refresh http://localhost:3000\n4. Try Mark to SAMAGAM again"
        );
      });
  }

  function startFlow(entries) {
    var err = validateBeforeStart();
    if (err) {
      alert(err);
      return false;
    }
    if (!entries || !entries.length) {
      alert("No attendance entries for today. Mark attendance first.");
      return false;
    }
    var payload = buildFlowPayload(entries);
    if (global.AndroidSamagam && typeof global.AndroidSamagam.startFlow === "function") {
      global.AndroidSamagam.startFlow(JSON.stringify(payload));
      return true;
    }
    startBrowserOverlayFlow(payload);
    return true;
  }

  function onAndroidFlowMessage(jsonString) {
    var data = {};
    try {
      data = jsonString ? JSON.parse(String(jsonString)) : {};
    } catch (_e) {}
    if (data.message) showResultDialog(String(data.message));
  }

  global.__kvOnSamagamFlowMessage = onAndroidFlowMessage;

  global.KVSamagam = {
    loadSamagamSettings: loadSamagamSettings,
    saveSamagamSettings: saveSamagamSettings,
    getCredentials: getCredentials,
    loginUrl: loginUrl,
    captureUrl: captureUrl,
    startFlow: startFlow,
    openSamagamTab: openSamagamTab,
    buildInjectLoginScript: buildInjectLoginScript,
    buildInjectAttendanceScript: buildInjectAttendanceScript,
    validateBeforeStart: validateBeforeStart,
    checkDevServer: checkDevServer
  };
})(window);
