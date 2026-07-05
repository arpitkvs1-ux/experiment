package com.kvnitagartala.studentapp

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * In-app WebView for UBI KV fee portal: login (prefill + manual captcha) → extract receipt/defaulter tables.
 */
class UbiFeeFlowController(
    private val activity: AppCompatActivity,
    private val root: FrameLayout
) {
    private var overlay: FrameLayout? = null
    private var webView: WebView? = null
    private var statusView: TextView? = null
    private var payload: JSONObject? = null
    private var phase = Phase.IDLE
    private var injectLib: String? = null
    private var extractDone = false
    private var navigatingToTarget = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private enum class Phase {
        IDLE, LOGIN, POST_LOGIN, TARGET, DONE
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun start(json: String) {
        payload = try {
            JSONObject(json)
        } catch (_e: Exception) {
            Toast.makeText(activity, "Invalid UBI flow data.", Toast.LENGTH_LONG).show()
            return
        }
        val username = payload?.optString("username", "")?.trim().orEmpty()
        val password = payload?.optString("password", "").orEmpty()
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(activity, "Save UBI Login ID and password in Settings first.", Toast.LENGTH_LONG).show()
            return
        }
        extractDone = false
        navigatingToTarget = false
        phase = Phase.LOGIN
        ensureOverlay()
        setStatus("Opening UBI login… Enter captcha to sign in.")
        overlay?.visibility = View.VISIBLE
        val loginUrl = payload?.optString("loginUrl", DEFAULT_LOGIN_URL) ?: DEFAULT_LOGIN_URL
        webView?.loadUrl(loginUrl)
        mainHandler.postDelayed({ resetReceiptInjectState() }, 400)
    }

    fun close() {
        overlay?.visibility = View.GONE
        webView?.loadUrl("about:blank")
        phase = Phase.IDLE
        payload = null
        extractDone = false
        navigatingToTarget = false
    }

    private fun ensureOverlay() {
        if (overlay != null) return

        val container = FrameLayout(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.WHITE)
            visibility = View.GONE
        }

        val topBar = LinearLayout(activity).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#f5f2ef"))
            setPadding(24, 24, 24, 16)
        }

        val title = TextView(activity).apply {
            text = "UBI Fee Portal"
            textSize = 16f
            setTextColor(Color.parseColor("#6b1c23"))
        }
        statusView = TextView(activity).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#5c534c"))
        }
        val closeBtn = TextView(activity).apply {
            text = "Close"
            textSize = 14f
            setTextColor(Color.parseColor("#6b1c23"))
            setPadding(0, 16, 0, 0)
            setOnClickListener { close() }
        }
        topBar.addView(title)
        topBar.addView(statusView)
        topBar.addView(closeBtn)

        val wv = WebView(activity).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.javaScriptCanOpenWindowsAutomatically = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView, url: String?) {
                    handlePageFinished(url.orEmpty())
                }
            }
        }

        val topParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP }
        val wvParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ).apply { topMargin = 180 }

        container.addView(topBar, topParams)
        container.addView(wv, wvParams)
        root.addView(container)
        overlay = container
        webView = wv
    }

    private fun setStatus(msg: String) {
        statusView?.text = msg
    }

    private fun loadInjectLib(): String {
        injectLib?.let { return it }
        val text = activity.assets.open("browser-app/ubi-fee-inject.js").bufferedReader().use { it.readText() }
        injectLib = text
        return text
    }

    private fun isLoginUrl(url: String): Boolean =
        url.contains("kvlogin", ignoreCase = true) || url.contains("login.aspx", ignoreCase = true)

    private fun isUbiHost(url: String): Boolean =
        url.contains("unionbankofindia", ignoreCase = true) || url.contains("epay.", ignoreCase = true)

    private fun isTargetUrl(url: String, p: JSONObject): Boolean {
        val target = p.optString("targetUrl", "").trim()
        if (target.isEmpty()) return false
        return try {
            val path = android.net.Uri.parse(target).path.orEmpty()
            path.isNotEmpty() && url.contains(path, ignoreCase = true)
        } catch (_e: Exception) {
            url.contains(target, ignoreCase = true)
        }
    }

    private fun handlePageFinished(url: String) {
        val p = payload ?: return
        if (!isUbiHost(url)) return

        when {
            isLoginUrl(url) -> {
                phase = Phase.LOGIN
                navigatingToTarget = false
                setStatus("Login prefilled. Enter captcha and sign in.")
                injectLogin(p)
            }
            isTargetUrl(url, p) -> {
                phase = Phase.TARGET
                if (!extractDone) {
                    setStatus(
                        if (p.optString("mode") == "defaulter") "Extracting defaulter data…"
                        else "Selecting year/quarter and generating report…"
                    )
                    mainHandler.postDelayed({ injectExtract(p, 0) }, 900)
                }
            }
            phase == Phase.LOGIN || phase == Phase.POST_LOGIN -> {
                if (!navigatingToTarget) {
                    phase = Phase.POST_LOGIN
                    navigatingToTarget = true
                    val target = p.optString("targetUrl", "").trim()
                    if (target.isNotEmpty()) {
                        setStatus("Signed in. Opening fee page…")
                        webView?.loadUrl(target)
                    } else {
                        setStatus("Save receipt/defaulter page URL in Settings.")
                    }
                }
            }
        }
    }

    private fun injectLogin(p: JSONObject) {
        val user = JSONObject.quote(p.optString("username", ""))
        val pass = JSONObject.quote(p.optString("password", ""))
        val script = loadInjectLib() +
            "\n;(function(){try{if(KVUbiFeeInject.resetReportFlowState)KVUbiFeeInject.resetReportFlowState();return KVUbiFeeInject.loginPage({username:$user,password:$pass});}catch(e){return {ok:false,error:String(e)};}})();"
        webView?.evaluateJavascript(script, null)
    }

    private fun resetReceiptInjectState() {
        val script = loadInjectLib() +
            "\n;(function(){try{if(KVUbiFeeInject.resetReportFlowState)KVUbiFeeInject.resetReportFlowState();}catch(_e){}})();"
        webView?.evaluateJavascript(script, null)
    }

    private fun injectExtract(p: JSONObject, attempt: Int) {
        val mode = p.optString("mode", "receipt")
        val year = JSONObject.quote(p.optString("academicYear", ""))
        val quarter = JSONObject.quote(p.optString("quarter", ""))
        val script = if (mode == "defaulter") {
            loadInjectLib() +
                "\n;(function(){try{return KVUbiFeeInject.defaulterReportFlow({academicYear:$year,quarter:$quarter});}catch(e){return {ok:false,error:String(e)};}})();"
        } else {
            loadInjectLib() +
                "\n;(function(){try{return KVUbiFeeInject.receiptReportFlow({academicYear:$year,quarter:$quarter});}catch(e){return {ok:false,error:String(e)};}})();"
        }
        webView?.evaluateJavascript(script) { raw ->
            val parsed = parseInjectResult(raw, mode)
            val waiting = parsed.step == "receipt_wait" || parsed.step == "defaulter_wait" ||
                parsed.step == "receipt_page_wait" || parsed.step == "defaulter_page_wait" ||
                parsed.step == "report_export_wait" ||
                (parsed.rows.length() == 0 && attempt < 25)
            if (waiting) {
                setStatus(
                    when (parsed.step) {
                        "receipt_wait", "defaulter_wait" -> "Waiting for UBI report…"
                        "report_export_wait" -> "Exporting report (floppy menu)…"
                        "receipt_page_wait", "defaulter_page_wait" -> "Reading next report page…"
                        else -> if (mode == "defaulter") "Waiting for defaulter table…"
                        else "Waiting for fee receipt table…"
                    }
                )
                mainHandler.postDelayed(
                    { injectExtract(p, attempt + 1) },
                    if (parsed.step == "receipt_wait" || parsed.step == "defaulter_wait" ||
                        parsed.step == "report_export_wait" ||
                        parsed.step == "receipt_page_wait" || parsed.step == "defaulter_page_wait") 2000 else 1000
                )
                return@evaluateJavascript
            }
            extractDone = true
            phase = Phase.DONE
            setStatus(parsed.statusLine)
            notifyJsResult(parsed, p)
        }
    }

    private data class InjectResult(
        val message: String,
        val mode: String,
        val rows: JSONArray,
        val statusLine: String,
        val step: String = "",
        val academicYear: String = "",
        val quarter: String = ""
    )

    private fun parseInjectResult(raw: String?, mode: String): InjectResult {
        if (raw.isNullOrBlank() || raw == "null") {
            return InjectResult(
                message = "No data extracted. Check the UBI page URL in Settings.",
                mode = mode,
                rows = JSONArray(),
                statusLine = "Extraction failed."
            )
        }
        val cleaned = raw.trim().removeSurrounding("\"").replace("\\\"", "\"").replace("\\\\", "\\")
        return try {
            val obj = JSONObject(cleaned)
            val rows = obj.optJSONArray("rows") ?: JSONArray()
            val message = obj.optString("message", "Extraction complete.")
            InjectResult(
                message = message,
                mode = obj.optString("mode", mode),
                rows = rows,
                statusLine = if (rows.length() > 0) "Loaded ${rows.length()} row(s)." else "No rows found on page.",
                step = obj.optString("step", ""),
                academicYear = obj.optString("academicYear", ""),
                quarter = obj.optString("quarter", "")
            )
        } catch (_e: Exception) {
            InjectResult(
                message = "Could not parse UBI extraction result.",
                mode = mode,
                rows = JSONArray(),
                statusLine = "Extraction error."
            )
        }
    }

    private fun notifyJsResult(parsed: InjectResult, p: JSONObject) {
        val payload = JSONObject()
            .put("ubiFeeResult", true)
            .put("mode", parsed.mode)
            .put("rows", parsed.rows)
            .put("message", parsed.message)
        val year = parsed.academicYear.ifBlank { p.optString("academicYear", "") }
        val quarter = parsed.quarter.ifBlank { p.optString("quarter", "") }
        if (year.isNotEmpty()) payload.put("academicYear", year)
        if (quarter.isNotEmpty()) payload.put("quarter", quarter)
        (activity as? MainActivity)?.notifyUbiFeeFlowMessage(payload.toString())
    }

    companion object {
        private const val DEFAULT_LOGIN_URL = "https://epay.unionbankofindia.bank.in/kvsfcs/KVLogin.aspx"
    }
}
