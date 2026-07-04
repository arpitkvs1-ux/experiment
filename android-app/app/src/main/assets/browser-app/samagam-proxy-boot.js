/**
 * Runs on SAMAGAM pages loaded via /samagam-proxy/ (localhost dev server).
 */
(function () {
  "use strict";

  var PENDING_KEY = "kv_samagam_pending_v1";

  function readPendingLocal() {
    try {
      var raw = localStorage.getItem(PENDING_KEY) || sessionStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (p && (p.username || (p.entries && p.entries.length))) {
        p.active = true;
        return p;
      }
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

  function samagamPath() {
    return String(location.pathname || "").replace(/^\/samagam-proxy/, "") || "/";
  }

  function toProxyUrl(abs) {
    var u = String(abs || "").trim();
    if (!u) return "";
    return u.replace(/^https?:\/\/samagam\.kvs\.gov\.in/i, "/samagam-proxy");
  }

  function loadInject() {
    return new Promise(function (resolve, reject) {
      if (window.KVSamagamInject) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = "/samagam-inject.js";
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Could not load samagam-inject.js"));
      };
      document.head.appendChild(s);
    });
  }

  function readPendingFromStorage() {
    return readPendingLocal();
  }

  function fetchPending() {
    return fetch("/samagam-pending.json", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.active && (data.username || (data.entries && data.entries.length))) {
          savePendingLocal(data);
          return data;
        }
        return readPendingLocal();
      })
      .catch(function () {
        return readPendingLocal();
      });
  }

  function isLoginPath(p) {
    return p.indexOf("/user/login") >= 0;
  }

  function isCapturePath(p) {
    return p.indexOf("/mis/attendance/capture") >= 0;
  }

  var _loginFillTimer = null;

  function stopLoginFillLoop() {
    if (_loginFillTimer) {
      clearInterval(_loginFillTimer);
      _loginFillTimer = null;
    }
  }

  function loginCredentialsReady(pending) {
    var u = document.querySelector('input[name="username"]');
    var p = document.querySelector('input[name="password"]');
    return (
      u &&
      p &&
      String(u.value || "") === String(pending.username || "") &&
      String(p.value || "") === String(pending.password || "")
    );
  }

  function userIsEnteringCaptcha() {
    var cap = document.querySelector('input[name="captcha"]');
    if (!cap) return false;
    if (document.activeElement === cap) return true;
    if (String(cap.value || "").trim().length > 0) return true;
    return false;
  }

  function runLoginFill(pending) {
    if (!window.KVSamagamInject || !pending) return false;
    if (userIsEnteringCaptcha()) {
      stopLoginFillLoop();
      return true;
    }
    if (loginCredentialsReady(pending)) {
      stopLoginFillLoop();
      return true;
    }
    var result = KVSamagamInject.loginPage({
      username: pending.username || "",
      password: pending.password || "",
    });
    if (result && (result.skipped || result.already)) {
      stopLoginFillLoop();
      return true;
    }
    if (loginCredentialsReady(pending)) {
      stopLoginFillLoop();
      return true;
    }
    return !!(result && result.ok);
  }

  function startLoginFillLoop(pending) {
    stopLoginFillLoop();
    runLoginFill(pending);
    if (loginCredentialsReady(pending) || userIsEnteringCaptcha()) return;

    var ticks = 0;
    _loginFillTimer = setInterval(function () {
      ticks++;
      if (runLoginFill(pending) || ticks >= 12) {
        stopLoginFillLoop();
      }
    }, 500);

    var cap = document.querySelector('input[name="captcha"]');
    if (cap && !cap.__kvSamagamStopFill) {
      cap.__kvSamagamStopFill = true;
      cap.addEventListener(
        "focus",
        function () {
          stopLoginFillLoop();
        },
        true
      );
    }

    var form = document.getElementById("loginForm");
    if (form && !form.__kvSamagamWatch) {
      form.__kvSamagamWatch = true;
      form.addEventListener(
        "input",
        function (ev) {
          var t = ev.target;
          if (t && t.name === "captcha") {
            stopLoginFillLoop();
            return;
          }
          if (userIsEnteringCaptcha()) return;
          if (loginCredentialsReady(pending)) return;
          runLoginFill(pending);
        },
        true
      );
    }
  }

  function runAttendanceFill(pending, attempt) {
    if (!window.KVSamagamInject || window.__kvSamagamAttendanceDone) return;
    var rows = document.querySelectorAll("table tbody tr");
    var hasNameCol = false;
    var tables = document.querySelectorAll("table");
    for (var ti = 0; ti < tables.length; ti++) {
      var ths = tables[ti].querySelectorAll("thead th, thead td, tr th");
      for (var hi = 0; hi < ths.length; hi++) {
        var ht = String(ths[hi].textContent || "").toLowerCase();
        if (ht.indexOf("name") >= 0) hasNameCol = true;
      }
    }
    if ((rows.length < 2 || !hasNameCol) && attempt < 25) {
      setTimeout(function () {
        runAttendanceFill(pending, attempt + 1);
      }, 800);
      return;
    }
    window.__kvSamagamAttendanceDone = true;
    var result = KVSamagamInject.attendancePage(pending.entries || []);
    if (KVSamagamInject.showSamagamSummaryDialog) {
      KVSamagamInject.showSamagamSummaryDialog(result);
    }
  }

  function maybeRedirectToCapture(pending) {
    var cap = toProxyUrl(pending.captureUrl);
    if (!cap) return;
    if (window.__kvSamagamRedirected) return;
    window.__kvSamagamRedirected = true;
    setTimeout(function () {
      location.href = cap;
    }, 400);
  }

  function runFlow(pending) {
    if (!pending || (!pending.username && !(pending.entries && pending.entries.length))) return;
    pending.active = true;
    savePendingLocal(pending);

    var p = samagamPath();

    if (isLoginPath(p)) {
      window.__kvSamagamLoginSubmitted = false;
      window.__kvSamagamRedirected = false;
      startLoginFillLoop(pending);
      return;
    }

    if (isCapturePath(p)) {
      if (window.KVSamagamInject && KVSamagamInject.startAbsentRedObserver) {
        KVSamagamInject.startAbsentRedObserver();
      }
      setTimeout(function () {
        runAttendanceFill(pending, 0);
      }, 600);
      return;
    }

    maybeRedirectToCapture(pending);
  }

  function boot() {
    fetchPending()
      .then(function (pending) {
        if (!pending) return null;
        if (window.KVSamagamInject) return pending;
        return loadInject().then(function () {
          return pending;
        });
      })
      .then(function (pending) {
        if (
          isCapturePath(samagamPath()) &&
          window.KVSamagamInject &&
          KVSamagamInject.startAbsentRedObserver
        ) {
          KVSamagamInject.startAbsentRedObserver();
        }
        if (pending) runFlow(pending);
      })
      .catch(function (err) {
        console.warn("SAMAGAM boot:", err && err.message ? err.message : err);
      });
  }

  function scheduleBoot() {
    var delay = isLoginPath(samagamPath()) ? 800 : 200;
    setTimeout(boot, delay);
  }

  window.addEventListener("pageshow", scheduleBoot);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBoot);
  } else {
    scheduleBoot();
  }
  window.addEventListener("load", scheduleBoot);
})();
