// ==UserScript==
// @name         Vaayu → SAMAGAM bridge
// @namespace    vaayu.local
// @version      1.1
// @description  Auto login redirect + attendance fill from Vaayu (localhost)
// @match        https://samagam.kvs.gov.in/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var API = "http://localhost:3000";

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.KVSamagamInject) {
        resolve();
        return;
      }
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("Could not load " + src));
      };
      document.head.appendChild(s);
    });
  }

  function fetchPending() {
    return fetch(API + "/samagam-pending.json", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return null;
      });
  }

  function run() {
    var path = String(location.pathname || "");
    if (path.indexOf("/mis/attendance/capture") >= 0) {
      loadScript(API + "/samagam-inject.js")
        .then(function () {
          if (window.KVSamagamInject && KVSamagamInject.startAbsentRedObserver) {
            KVSamagamInject.startAbsentRedObserver();
          }
        })
        .catch(function () {});
    }

    fetchPending().then(function (pending) {
      if (!pending || !pending.active) return;

      loadScript(API + "/samagam-inject.js")
        .then(function () {
          var path = String(location.pathname || "");
          if (path.indexOf("/user/login") >= 0) {
            window.KVSamagamInject.loginPage({
              username: pending.username || "",
              password: pending.password || ""
            });
            return;
          }
          if (path.indexOf("/mis/attendance/capture") >= 0) {
            if (window.__kvSamagamAttendanceDone) return;
            window.__kvSamagamAttendanceDone = true;
            var result = window.KVSamagamInject.attendancePage(pending.entries || []);
            if (window.KVSamagamInject.showSamagamSummaryDialog) {
              window.KVSamagamInject.showSamagamSummaryDialog(result);
            }
            return;
          }
          if (
            pending.captureUrl &&
            path.indexOf("/user/login") < 0 &&
            path.indexOf("/mis/attendance/capture") < 0
          ) {
            if (!window.__kvSamagamRedirected) {
              window.__kvSamagamRedirected = true;
              location.href = pending.captureUrl;
            }
          }
        })
        .catch(function () {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
