/**
 * Short OK-only popup (WebView-friendly). Used for downloads and marks submit success.
 */
(function (g) {
  var _samagamSummaryTimer = null;

  function hideOkDialog() {
    var root = document.getElementById("kvOkDialog");
    if (!root) return;
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
  }

  function hideSamagamSummaryDialog() {
    var root = document.getElementById("kvSamagamSummaryDialog");
    if (!root) return;
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    if (_samagamSummaryTimer) {
      clearTimeout(_samagamSummaryTimer);
      _samagamSummaryTimer = null;
    }
  }

  function clipMessage(text, maxLen) {
    maxLen = maxLen || 220;
    var s = String(text == null ? "" : text)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    s = s.replace(/\s+/g, " ").trim();
    if (/DOCTYPE|<html/i.test(s) && s.length > 40) {
      return "Something went wrong. Check connection and web app URL.";
    }
    if (s.length > maxLen) return s.slice(0, maxLen - 1) + "\u2026";
    return s || "Done.";
  }

  function showOkDialog(message) {
    var root = document.getElementById("kvOkDialog");
    var msg = document.getElementById("kvOkDialogMsg");
    var btn = document.getElementById("kvOkDialogBtn");
    var safe = clipMessage(message);
    if (!root || !msg || !btn) {
      alert(safe);
      return;
    }
    msg.textContent = safe;
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      btn.focus();
    }, 0);
  }

  function showSamagamSummaryDialog(message, hasMismatch) {
    hideSamagamSummaryDialog();
    var root = document.getElementById("kvSamagamSummaryDialog");
    var msg = document.getElementById("kvSamagamSummaryMsg");
    var hint = document.getElementById("kvSamagamSummaryHint");
    var btn = document.getElementById("kvSamagamSummaryBtn");
    var text = String(message == null ? "" : message);
    if (!root || !msg || !hint) {
      alert(text);
      return;
    }
    msg.textContent = text;
    hint.textContent = hasMismatch
      ? "Fix mismatches if needed, then press Submit on SAMAGAM."
      : "Press Submit on SAMAGAM when ready.";
    if (btn) {
      btn.hidden = !hasMismatch;
    }
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    if (!hasMismatch) {
      _samagamSummaryTimer = setTimeout(hideSamagamSummaryDialog, 2000);
    } else if (btn) {
      setTimeout(function () {
        btn.focus();
      }, 0);
    }
  }

  function wireOnce() {
    var root = document.getElementById("kvOkDialog");
    var btn = document.getElementById("kvOkDialogBtn");
    var bd = document.querySelector("#kvOkDialog .kv-ok-dialog-backdrop");
    if (!root || !btn) return;
    btn.addEventListener("click", hideOkDialog);
    if (bd) {
      bd.addEventListener("click", hideOkDialog);
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && !root.hidden) hideOkDialog();
    });

    var sumRoot = document.getElementById("kvSamagamSummaryDialog");
    var sumBtn = document.getElementById("kvSamagamSummaryBtn");
    var sumBd = document.getElementById("kvSamagamSummaryBackdrop");
    if (sumBtn) sumBtn.addEventListener("click", hideSamagamSummaryDialog);
    if (sumBd) sumBd.addEventListener("click", hideSamagamSummaryDialog);
    if (sumRoot) {
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !sumRoot.hidden) hideSamagamSummaryDialog();
      });
    }
  }

  g.KV_showOkDialog = showOkDialog;
  g.KV_showSamagamSummaryDialog = showSamagamSummaryDialog;
  g.KV_hideSamagamSummaryDialog = hideSamagamSummaryDialog;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireOnce);
  } else {
    wireOnce();
  }
})(typeof window !== "undefined" ? window : this);
