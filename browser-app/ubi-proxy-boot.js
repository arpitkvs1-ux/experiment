/**
 * Runs on UBI pages loaded via /ubi-proxy/ (localhost dev server only).
 * Uses your saved credentials + manual captcha on the official UBI portal UI.
 */
(function () {
  "use strict";

  var PENDING_KEY = "kv_ubi_fee_pending_v1";
  var MAX_EXTRACT_ATTEMPTS = 40;

  function readPendingLocal() {
    try {
      var raw = localStorage.getItem(PENDING_KEY) || sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (p && p.active && (p.username || p.mode)) return p;
    } catch (_e) {}
    return null;
  }

  function savePendingLocal(pending) {
    try {
      var s = JSON.stringify(pending || {});
      localStorage.setItem(PENDING_KEY, s);
      sessionStorage.setItem(PENDING_KEY, s);
    } catch (_e) {}
  }

  function clearPendingLocal() {
    try {
      localStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(PENDING_KEY);
    } catch (_e) {}
  }

  function ubiPath() {
    return String(location.pathname || "").replace(/^\/ubi-proxy/, "") || "/";
  }

  function toProxyUrl(abs) {
    var u = String(abs || "").trim();
    if (!u) return "";
    return u
      .replace(/^https?:\/\/epay\.unionbankofindia\.bank\.in/i, "/ubi-proxy")
      .replace(/^https?:\/\/epay\.unionbankofindia\.co\.in/i, "/ubi-proxy");
  }

  function pathFromUrl(url) {
    try {
      return new URL(String(url || ""), location.origin).pathname || "";
    } catch (_e) {
      return String(url || "");
    }
  }

  function isProxyErrorPage() {
    var t = String(document.body ? document.body.innerText : "");
    return /Could not reach UBI portal|proxy error|ETIMEDOUT|Connection timed out/i.test(t);
  }

  function loadInject() {
    return new Promise(function (resolve, reject) {
      if (window.KVUbiFeeInject) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = "/ubi-fee-inject.js";
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("Could not load ubi-fee-inject.js")); };
      document.head.appendChild(s);
    });
  }

  function fetchPending() {
    return fetch("/ubi-pending.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.active && data.username) {
          savePendingLocal(data);
          return data;
        }
        return readPendingLocal();
      })
      .catch(function () { return readPendingLocal(); });
  }

  function isLoginPath(p) {
    return /kvlogin|login\.aspx|signin/i.test(p);
  }

  function isTargetPath(p, pending) {
    if (!pending || !pending.targetUrl) return false;
    var targetPath = pathFromUrl(pending.targetUrl).toLowerCase();
    if (!targetPath || targetPath === "/") return false;
    return p.toLowerCase().indexOf(targetPath.replace(/\/+$/, "")) >= 0;
  }

  var _loginFillTimer = null;
  function stopLoginFillLoop() {
    if (_loginFillTimer) {
      clearInterval(_loginFillTimer);
      _loginFillTimer = null;
    }
  }

  function userIsEnteringCaptcha() {
    return window.KVUbiFeeInject && KVUbiFeeInject.isCaptchaActive && KVUbiFeeInject.isCaptchaActive();
  }

  function runLoginFill(pending) {
    if (!window.KVUbiFeeInject || !pending) return false;
    if (userIsEnteringCaptcha()) {
      stopLoginFillLoop();
      return true;
    }
    var result = KVUbiFeeInject.loginPage({
      username: pending.username || "",
      password: pending.password || "",
    });
    if (result && result.skipped) {
      stopLoginFillLoop();
      return true;
    }
    return !!(result && result.ok);
  }

  function startLoginFillLoop(pending) {
    stopLoginFillLoop();
    runLoginFill(pending);
    if (userIsEnteringCaptcha()) return;
    var ticks = 0;
    _loginFillTimer = setInterval(function () {
      ticks++;
      if (runLoginFill(pending) || ticks >= 12) stopLoginFillLoop();
    }, 500);
  }

  function notifyOpener(payload) {
    if (window.opener && typeof window.opener.__kvOnUbiFeeFlowMessage === "function") {
      window.opener.__kvOnUbiFeeFlowMessage(JSON.stringify(payload));
    }
  }

  function finishFlow(pending, result) {
    window.__kvUbiExtractDone = true;
    window.__kvUbiExtractStarted = false;
    window.__kvUbiExtractAttempt = null;
    stopLoginFillLoop();
    if (pending) {
      pending.active = false;
      savePendingLocal(pending);
    }
    clearPendingLocal();
    var payload = {
      ubiFeeResult: true,
      mode: (pending && pending.mode) || (result && result.mode) || "receipt",
      rows: (result && result.rows) || [],
      message: (result && result.message) || "Done.",
      academicYear: (result && result.academicYear) || (pending && pending.academicYear) || "",
      quarter: (result && result.quarter) || (pending && pending.quarter) || "",
    };
    notifyOpener(payload);
    if (payload.rows.length) {
      alert(payload.message);
    } else {
      alert(
        payload.message +
          "\n\nTip: Use the Vaayu Android app for a direct connection to the official UBI portal (no local proxy)."
      );
    }
  }

  function runReceiptExtract(pending, attempt) {
    if (!window.KVUbiFeeInject || window.__kvUbiExtractDone) return;
    var opts = {
      academicYear: pending.academicYear || "",
      quarter: pending.quarter || "",
    };
    var result = KVUbiFeeInject.receiptReportFlow(opts);
    var waiting =
      result &&
      (result.step === "receipt_wait" ||
        result.step === "receipt_page_wait" ||
        result.step === "report_export_wait" ||
        result.step === "report_export_user_wait" ||
        (result.message === "Report not ready yet." && attempt < MAX_EXTRACT_ATTEMPTS));
    if (waiting && attempt < MAX_EXTRACT_ATTEMPTS) {
      window.__kvUbiExtractAttempt = attempt + 1;
      var waitMs = result.step === "report_export_user_wait" ? 3000 : 2000;
      setTimeout(function () { runReceiptExtract(pending, attempt + 1); }, waitMs);
      return;
    }
    if (result && result.rows && result.rows.length) {
      finishFlow(pending, result);
      return;
    }
    if (attempt < MAX_EXTRACT_ATTEMPTS) {
      window.__kvUbiExtractAttempt = attempt + 1;
      setTimeout(function () { runReceiptExtract(pending, attempt + 1); }, 1200);
      return;
    }
    finishFlow(pending, result || { rows: [], message: "No receipt data found after waiting." });
  }

  function runDefaulterExtract(pending, attempt) {
    if (!window.KVUbiFeeInject || window.__kvUbiExtractDone) return;
    var opts = {
      academicYear: pending.academicYear || "",
      quarter: pending.quarter || "",
    };
    var result = KVUbiFeeInject.defaulterReportFlow(opts);
    var waiting =
      result &&
      (result.step === "defaulter_wait" ||
        result.step === "defaulter_page_wait" ||
        result.step === "report_export_wait" ||
        (result.message === "Report not ready yet." && attempt < MAX_EXTRACT_ATTEMPTS));
    if (waiting && attempt < MAX_EXTRACT_ATTEMPTS) {
      window.__kvUbiExtractAttempt = attempt + 1;
      setTimeout(function () { runDefaulterExtract(pending, attempt + 1); }, 2000);
      return;
    }
    if (result && result.rows && result.rows.length) {
      finishFlow(pending, result);
      return;
    }
    if (attempt < MAX_EXTRACT_ATTEMPTS) {
      window.__kvUbiExtractAttempt = attempt + 1;
      setTimeout(function () { runDefaulterExtract(pending, attempt + 1); }, 1200);
      return;
    }
    finishFlow(pending, result || { rows: [], message: "No defaulter data found after waiting." });
  }

  function runExtract(pending, attempt) {
    if (!window.KVUbiFeeInject || window.__kvUbiExtractDone) return;
    var mode = pending.mode === "defaulter" ? "defaulter" : "receipt";
    if (mode === "receipt") {
      runReceiptExtract(pending, attempt || 0);
      return;
    }
    runDefaulterExtract(pending, attempt || 0);
  }

  function maybeRedirectToTarget(pending) {
    var cap = toProxyUrl(pending.targetUrl);
    if (!cap || window.__kvUbiRedirected) return;
    window.__kvUbiRedirected = true;
    setTimeout(function () { location.href = cap; }, 400);
  }

  function showProxyErrorOnce() {
    if (window.__kvUbiProxyErrorShown) return;
    window.__kvUbiProxyErrorShown = true;
    stopLoginFillLoop();
    clearPendingLocal();
    notifyOpener({
      ubiFeeResult: true,
      mode: "receipt",
      rows: [],
      message:
        "Could not reach the official UBI portal (network timeout).\n\nUse the Vaayu Android app — it connects directly to UBI without a local proxy.",
    });
    alert(
      "UBI portal unreachable from this network (timeout).\n\n" +
        "• Use the Vaayu Android app (recommended — direct official UBI connection)\n" +
        "• Or open https://epay.unionbankofindia.bank.in in your browser manually\n" +
        "• You always enter the captcha yourself — Vaayu never bypasses bank security"
    );
  }

  function runFlow(pending) {
    if (!pending || !pending.username) return;
    if (window.__kvUbiExtractDone) return;
    if (isProxyErrorPage()) {
      showProxyErrorOnce();
      return;
    }
    pending.active = true;
    savePendingLocal(pending);
    var p = ubiPath();
    if (isLoginPath(p)) {
      window.__kvUbiRedirected = false;
      window.__kvUbiExtractDone = false;
      window.__kvUbiExtractStarted = false;
      window.__kvUbiExtractAttempt = null;
      if (window.KVUbiFeeInject && KVUbiFeeInject.resetReportFlowState) {
        KVUbiFeeInject.resetReportFlowState();
      }
      startLoginFillLoop(pending);
      return;
    }
    if (isTargetPath(p, pending)) {
      if (window.__kvUbiExtractDone) return;
      clearTimeout(window.__kvUbiExtractTimer);
      window.__kvUbiExtractTimer = setTimeout(function () {
        if (window.__kvUbiExtractDone) return;
        if (typeof window.__kvUbiExtractAttempt !== "number") {
          window.__kvUbiExtractAttempt = 0;
          var resumed = false;
          try {
            resumed =
              sessionStorage.getItem("kv_ubi_receipt_generated") === "1" ||
              sessionStorage.getItem("kv_ubi_defaulter_generated") === "1";
          } catch (_e) {}
          if (window.KVUbiFeeInject) {
            if (resumed && KVUbiFeeInject.restoreReportTimingFromStorage) {
              KVUbiFeeInject.restoreReportTimingFromStorage();
            } else if (KVUbiFeeInject.resetReportFlowState) {
              KVUbiFeeInject.resetReportFlowState();
            }
          }
        }
        window.__kvUbiExtractStarted = true;
        runExtract(pending, window.__kvUbiExtractAttempt);
      }, 800);
      return;
    }
    if (pending.targetUrl && !isLoginPath(p)) maybeRedirectToTarget(pending);
  }

  function boot() {
    if (window.__kvUbiExtractDone) return;
    if (isProxyErrorPage()) {
      showProxyErrorOnce();
      return;
    }
    fetchPending()
      .then(function (pending) {
        if (!pending || !pending.active) return null;
        return window.KVUbiFeeInject ? pending : loadInject().then(function () { return pending; });
      })
      .then(function (pending) {
        if (pending) runFlow(pending);
      })
      .catch(function (err) {
        console.warn("UBI boot:", err && err.message ? err.message : err);
      });
  }

  function scheduleBoot() {
    if (window.__kvUbiExtractDone) return;
    clearTimeout(window.__kvUbiBootTimer);
    window.__kvUbiBootTimer = setTimeout(boot, isLoginPath(ubiPath()) ? 800 : 500);
  }

  window.addEventListener("pageshow", scheduleBoot);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBoot);
  } else {
    scheduleBoot();
  }
})();
