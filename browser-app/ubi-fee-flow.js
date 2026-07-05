/**
 * UBI KV fee portal — credentials, flow launcher (browser proxy + Android WebView).
 */
(function (global) {
  "use strict";

  var UBI_SETTINGS_KEY = "kv_ubi_fee_settings_v1";
  var UBI_TAB_NAME = "kv_ubi_fee_flow";
  var FEE_RECEIPT_CACHE_KEY = "kv_ubi_fee_receipt_cache_v1";
  var FEE_DEFAULTER_CACHE_KEY = "kv_ubi_fee_defaulter_cache_v1";

  var DEFAULT_LOGIN_URL = "https://epay.unionbankofindia.bank.in/kvsfcs/KVLogin.aspx";
  var DEFAULT_RECEIPT_URL = "https://epay.unionbankofindia.bank.in/kvsfcs/RptClass_FeeReceipt.aspx";
  var DEFAULT_DEFAULTER_URL = "https://epay.unionbankofindia.bank.in/kvsfcs/RptClass_FeeDefaulter.aspx";

  function loadUbiSettings() {
    try {
      var raw = localStorage.getItem(UBI_SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function saveUbiSettings(obj) {
    localStorage.setItem(UBI_SETTINGS_KEY, JSON.stringify(obj || {}));
  }

  function getCredentials() {
    var s = loadUbiSettings();
    return {
      username: String(s.username || "").trim(),
      password: String(s.password || ""),
      loginUrl: String(s.loginUrl || DEFAULT_LOGIN_URL).trim() || DEFAULT_LOGIN_URL,
      receiptUrl: String(s.receiptUrl || DEFAULT_RECEIPT_URL).trim() || DEFAULT_RECEIPT_URL,
      defaulterUrl: String(s.defaulterUrl || DEFAULT_DEFAULTER_URL).trim() || DEFAULT_DEFAULTER_URL,
      academicYear: String(s.academicYear || "").trim(),
      quarter: String(s.quarter || "").trim(),
    };
  }

  function loginUrl() {
    return getCredentials().loginUrl;
  }

  function receiptUrl() {
    return getCredentials().receiptUrl;
  }

  function defaulterUrl() {
    return getCredentials().defaulterUrl;
  }

  function currentAcademicYearLabel() {
    var d = new Date();
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var start = m >= 4 ? y : y - 1;
    return start + "-" + (start + 1);
  }

  function currentQuarterLabel() {
    var m = new Date().getMonth() + 1;
    if (m >= 7 && m <= 9) return "Jul - Sep";
    if (m >= 10 && m <= 12) return "Oct - Dec";
    if (m >= 1 && m <= 3) return "Jan - Mar";
    return "Apr - Jun";
  }

  function receiptPeriod() {
    var creds = getCredentials();
    return {
      academicYear: creds.academicYear || currentAcademicYearLabel(),
      quarter: creds.quarter || currentQuarterLabel(),
    };
  }

  function targetUrlForMode(mode) {
    var creds = getCredentials();
    if (mode === "receipt") return creds.receiptUrl;
    if (mode === "defaulter") return creds.defaulterUrl;
    return "";
  }

  function buildFlowPayload(mode) {
    var creds = getCredentials();
    var period = receiptPeriod();
    return {
      mode: mode === "defaulter" ? "defaulter" : "receipt",
      loginUrl: creds.loginUrl,
      targetUrl: targetUrlForMode(mode),
      username: creds.username,
      password: creds.password,
      academicYear: period.academicYear,
      quarter: period.quarter,
    };
  }

  function validateBeforeStart(mode) {
    var creds = getCredentials();
    if (!creds.username || !creds.password) {
      return "Save UBI Login ID and password in Settings first.";
    }
    var target = targetUrlForMode(mode);
    if (!target) {
      return mode === "receipt"
        ? "Save the Fee Receipt page URL in Settings → UBI Fee Portal."
        : "Save the Fee Defaulter page URL in Settings → UBI Fee Portal.";
    }
    return "";
  }

  function devServerBase() {
    return "http://localhost:3000";
  }

  function ubiOrigin() {
    return "https://epay.unionbankofindia.bank.in";
  }

  function toProxyUrl(absUrl) {
    var u = String(absUrl || "").trim();
    if (!u) return devServerBase() + "/ubi-proxy/kvsfcs/kvlogin.aspx";
    return u
      .replace(/^https?:\/\/epay\.unionbankofindia\.bank\.in/i, devServerBase() + "/ubi-proxy")
      .replace(/^https?:\/\/epay\.unionbankofindia\.co\.in/i, devServerBase() + "/ubi-proxy");
  }

  function formatLastUpdated(iso) {
    if (!iso) return "Never";
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "Never";
      return d.toLocaleString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_e) {
      return "Never";
    }
  }

  function loadReceiptCache() {
    try {
      var raw = localStorage.getItem(FEE_RECEIPT_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function saveReceiptCache(rows, meta) {
    meta = meta || {};
    var cache = {
      rows: Array.isArray(rows) ? rows : [],
      updatedAt: new Date().toISOString(),
      academicYear: meta.academicYear || receiptPeriod().academicYear,
      quarter: meta.quarter || receiptPeriod().quarter,
    };
    try {
      localStorage.setItem(FEE_RECEIPT_CACHE_KEY, JSON.stringify(cache));
    } catch (_e) {}
    return cache;
  }

  function applyReceiptCacheToUi() {
    var cache = loadReceiptCache();
    if (typeof global.__kvApplyUbiReceiptCache === "function") {
      global.__kvApplyUbiReceiptCache(cache);
    }
    return cache;
  }

  function loadDefaulterCache() {
    try {
      var raw = localStorage.getItem(FEE_DEFAULTER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_e) {
      return null;
    }
  }

  function saveDefaulterCache(rows, meta) {
    meta = meta || {};
    var cache = {
      rows: Array.isArray(rows) ? rows : [],
      updatedAt: new Date().toISOString(),
      academicYear: meta.academicYear || receiptPeriod().academicYear,
      quarter: meta.quarter || receiptPeriod().quarter,
    };
    try {
      localStorage.setItem(FEE_DEFAULTER_CACHE_KEY, JSON.stringify(cache));
    } catch (_e) {}
    return cache;
  }

  function applyDefaulterCacheToUi() {
    var cache = loadDefaulterCache();
    if (typeof global.__kvApplyUbiDefaulterCache === "function") {
      global.__kvApplyUbiDefaulterCache(cache);
    }
    return cache;
  }

  function apiBase() {
    try {
      if (global.location && (global.location.protocol === "http:" || global.location.protocol === "https:")) {
        return global.location.origin;
      }
    } catch (_e) {}
    return devServerBase();
  }

  function stashPendingPayload(payload) {
    try {
      var copy = payload || {};
      copy.active = true;
      copy.stashedAt = new Date().toISOString();
      var s = JSON.stringify(copy);
      localStorage.setItem("kv_ubi_fee_pending_v1", s);
      sessionStorage.setItem("kv_ubi_fee_pending_v1", s);
    } catch (_e) {}
  }

  function checkDevServer() {
    return fetch(apiBase() + "/api/health", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("Dev server not running.");
        return r.json();
      })
      .then(function (data) {
        if (!(data && data.ok && data.server === "vaayu-dev")) {
          throw new Error(
            "Wrong server on port 3000. Close any old terminal running npm serve, then double-click start-web.bat in browser-app."
          );
        }
        if (data.ubiPending !== true) {
          throw new Error(
            "Outdated Vaayu dev server on port 3000 (UBI proxy missing).\n\nClose the old terminal, double-click start-web.bat in browser-app, then hard-refresh this page."
          );
        }
        return data;
      });
  }

  function syncPendingToServer(payload) {
    return fetch(apiBase() + "/api/ubi-pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    })
      .then(function (r) {
        return r.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function publishPending(payload) {
    return checkDevServer().then(function () {
      return syncPendingToServer(payload);
    });
  }

  function openUbiTab(url) {
    var target = String(url || "").trim();
    if (!target) return false;
    var w = null;
    try {
      w = global.open(target, UBI_TAB_NAME);
    } catch (_e) {}
    if (!w) {
      alert(
        "Your browser blocked the UBI tab.\n\nAllow popups for this page, then try again.\n\nOr open manually:\n" +
          target
      );
      return false;
    }
    try {
      w.focus();
    } catch (_e2) {}
    return true;
  }

  function startBrowserFlow(payload) {
    stashPendingPayload(payload);
    var proxyLogin = toProxyUrl(payload.loginUrl);
    checkDevServer()
      .then(function () {
        return syncPendingToServer(payload);
      })
      .then(function (synced) {
        if (!synced) {
          console.warn("UBI: credentials saved in browser; server sync skipped. Restart start-web.bat if the UBI tab does not open correctly.");
        }
        openUbiTab(proxyLogin);
      })
      .catch(function (err) {
        alert(
          (err && err.message ? err.message : "Dev server not running.") +
            "\n\n1. Close any terminal that says \"serve\" on port 3000\n2. Double-click start-web.bat in browser-app\n3. Hard-refresh http://localhost:3000\n4. Try again"
        );
      });
  }

  function startFlow(mode) {
    var err = validateBeforeStart(mode);
    if (err) {
      alert(err);
      return false;
    }
    var payload = buildFlowPayload(mode);
    if (global.AndroidUbiFee && typeof global.AndroidUbiFee.startFlow === "function") {
      global.AndroidUbiFee.startFlow(JSON.stringify(payload));
      return true;
    }
    try {
      if (localStorage.getItem("kv_ubi_browser_proxy_ack") !== "1") {
        var ok = confirm(
          "Browser dev mode uses a local proxy to the official UBI portal.\n\n" +
            "Recommended: Vaayu Android app (direct HTTPS to UBI, no proxy).\n\n" +
            "You always enter the captcha yourself.\n\nContinue with browser dev mode?"
        );
        if (!ok) return false;
        localStorage.setItem("kv_ubi_browser_proxy_ack", "1");
      }
    } catch (_e) {}
    startBrowserFlow(payload);
    return true;
  }

  function renderFeeRows(mode, rows) {
    if (typeof global.__kvRenderUbiFeeResults === "function") {
      global.__kvRenderUbiFeeResults(mode, rows || []);
    }
  }

  function onAndroidFlowMessage(jsonString) {
    var data = {};
    try {
      data = jsonString ? JSON.parse(String(jsonString)) : {};
    } catch (_e) {}
    if (data.ubiFeeResult) {
      var mode = data.mode || "receipt";
      var rows = Array.isArray(data.rows) ? data.rows : [];
      if (mode === "receipt" && rows.length) {
        saveReceiptCache(rows, {
          academicYear: data.academicYear,
          quarter: data.quarter,
        });
        applyReceiptCacheToUi();
      } else if (mode === "defaulter" && rows.length) {
        saveDefaulterCache(rows, {
          academicYear: data.academicYear,
          quarter: data.quarter,
        });
        applyDefaulterCacheToUi();
      }
      if (data.message && typeof global.KV_showOkDialog === "function") {
        global.KV_showOkDialog(String(data.message));
      } else if (data.message) {
        alert(String(data.message));
      }
      return;
    }
    if (data.message && typeof global.KV_showOkDialog === "function") {
      global.KV_showOkDialog(String(data.message));
    } else if (data.message) {
      alert(String(data.message));
    }
  }

  global.__kvOnUbiFeeFlowMessage = onAndroidFlowMessage;

  global.KVUbiFee = {
    loadUbiSettings: loadUbiSettings,
    saveUbiSettings: saveUbiSettings,
    getCredentials: getCredentials,
    loginUrl: loginUrl,
    receiptUrl: receiptUrl,
    defaulterUrl: defaulterUrl,
    startFlow: startFlow,
    validateBeforeStart: validateBeforeStart,
    toProxyUrl: toProxyUrl,
    ubiOrigin: ubiOrigin,
    receiptPeriod: receiptPeriod,
    currentAcademicYearLabel: currentAcademicYearLabel,
    currentQuarterLabel: currentQuarterLabel,
    loadReceiptCache: loadReceiptCache,
    saveReceiptCache: saveReceiptCache,
    applyReceiptCacheToUi: applyReceiptCacheToUi,
    loadDefaulterCache: loadDefaulterCache,
    saveDefaulterCache: saveDefaulterCache,
    applyDefaulterCacheToUi: applyDefaulterCacheToUi,
    formatLastUpdated: formatLastUpdated,
    FEE_RECEIPT_CACHE_KEY: FEE_RECEIPT_CACHE_KEY,
    FEE_DEFAULTER_CACHE_KEY: FEE_DEFAULTER_CACHE_KEY,
  };
})(window);
