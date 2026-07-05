/**
 * Parent WhatsApp absentee sharing (Android: native intent; browser: wa.me fallback).
 */
(function (global) {
  "use strict";

  var SETTINGS_KEY = "kv_whatsapp_parents_settings_v1";

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) {
      return {};
    }
  }

  function saveSettings(obj) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj || {}));
  }

  function classLine() {
    var klass = String(global.KV_SCHOOL_CLASS || "").trim();
    if (klass && klass !== "—") return klass;
    return "Class";
  }

  function ymdToDmy(ymd) {
    var s = String(ymd || "").trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function buildAbsenteesMessage(absentees, dateYmd) {
    var list = Array.isArray(absentees) ? absentees : [];
    var lines = [];
    lines.push(classLine());
    lines.push("Date: " + ymdToDmy(dateYmd));
    lines.push("");
    lines.push("Today's Absentees:");
    if (!list.length) {
      lines.push("None");
    } else {
      for (var i = 0; i < list.length; i++) {
        var a = list[i] || {};
        var name = String(a.studentName || a.name || "").trim() || "—";
        lines.push((i + 1) + ". " + name);
      }
    }
    lines.push("");
    lines.push("— Class Teacher");
    return lines.join("\n");
  }

  function shareOnWhatsApp(message) {
    var settings = loadSettings();
    var groupJid = String(settings.groupJid || "").trim();
    var groupName = String(settings.groupName || "").trim();

    if (typeof global.AndroidShare !== "undefined" && global.AndroidShare.shareWhatsApp) {
      global.AndroidShare.shareWhatsApp(String(message || ""), groupJid);
      return { ok: true, mode: groupJid ? "direct_group" : "whatsapp" };
    }

    var url =
      "https://api.whatsapp.com/send?text=" + encodeURIComponent(String(message || ""));
    try {
      global.open(url, "_blank");
    } catch (_e) {
      global.location.href = url;
    }
    return { ok: true, mode: "browser", groupName: groupName };
  }

  function validateBeforeShare() {
    var s = loadSettings();
    if (!String(s.groupName || "").trim()) {
      return "Save your parent WhatsApp group name in Settings first.";
    }
    return "";
  }

  global.KVWhatsAppParents = {
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    buildAbsenteesMessage: buildAbsenteesMessage,
    shareOnWhatsApp: shareOnWhatsApp,
    validateBeforeShare: validateBeforeShare,
  };
})(typeof window !== "undefined" ? window : this);
