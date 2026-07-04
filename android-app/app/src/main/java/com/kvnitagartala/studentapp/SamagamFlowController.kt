package com.kvnitagartala.studentapp

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
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
 * In-app WebView flow for KVS SAMAGAM: login (prefill + captcha) → attendance capture autofill.
 */
class SamagamFlowController(
    private val activity: AppCompatActivity,
    private val root: FrameLayout
) {
    private var overlay: FrameLayout? = null
    private var webView: WebView? = null
    private var statusView: TextView? = null
    private var payload: JSONObject? = null
    private var phase = Phase.IDLE
    private var injectLib: String? = null
    private var attendanceInjected = false
    private var navigatingToCapture = false
    private val mainHandler = Handler(Looper.getMainLooper())

    private enum class Phase {
        IDLE, LOGIN, POST_LOGIN, CAPTURE, DONE
    }

    @SuppressLint("SetJavaScriptEnabled")
    fun start(json: String) {
        payload = try {
            JSONObject(json)
        } catch (_e: Exception) {
            Toast.makeText(activity, "Invalid SAMAGAM flow data.", Toast.LENGTH_LONG).show()
            return
        }
        val username = payload?.optString("username", "")?.trim().orEmpty()
        val password = payload?.optString("password", "").orEmpty()
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(activity, "Save SAMAGAM Login ID and password in Settings first.", Toast.LENGTH_LONG).show()
            return
        }
        attendanceInjected = false
        navigatingToCapture = false
        phase = Phase.LOGIN
        ensureOverlay()
        setStatus("Opening SAMAGAM login…")
        overlay?.visibility = View.VISIBLE
        val loginUrl = payload?.optString("loginUrl", DEFAULT_LOGIN_URL) ?: DEFAULT_LOGIN_URL
        webView?.loadUrl(loginUrl)
    }

    fun close() {
        overlay?.visibility = View.GONE
        webView?.loadUrl("about:blank")
        phase = Phase.IDLE
        payload = null
        attendanceInjected = false
        navigatingToCapture = false
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
            text = "Mark to SAMAGAM"
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
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return false
                }

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
        ).apply {
            topMargin = 180
        }

        container.addView(topBar, topParams)
        container.addView(wv, wvParams)
        root.addView(container)
        overlay = container
        webView = wv
    }

    private fun setStatus(msg: String) {
        statusView?.text = msg
        notifyJsStatus(msg)
    }

    private fun notifyJsStatus(msg: String) {
        val escaped = JSONObject.quote(msg)
        (activity as? MainActivity)?.notifySamagamFlowMessage("""{"status":$escaped}""")
    }

    private fun notifyJsDone(message: String) {
        val escaped = JSONObject.quote(message)
        (activity as? MainActivity)?.notifySamagamFlowMessage("""{"message":$escaped}""")
    }

    private fun loadInjectLib(): String {
        injectLib?.let { return it }
        val text = activity.assets.open("browser-app/samagam-inject.js").bufferedReader().use { it.readText() }
        injectLib = text
        return text
    }

    private fun isLoginUrl(url: String): Boolean = url.contains("/user/login")

    private fun isCaptureUrl(url: String): Boolean = url.contains("/mis/attendance/capture")

    private fun isSamagamHost(url: String): Boolean = url.contains("samagam.kvs.gov.in")

    private fun handlePageFinished(url: String) {
        val p = payload ?: return
        if (!isSamagamHost(url)) return

        when {
            isLoginUrl(url) -> {
                phase = Phase.LOGIN
                navigatingToCapture = false
                setStatus("Login ID and password filled. Enter captcha to sign in.")
                injectLogin(p)
            }
            isCaptureUrl(url) -> {
                phase = Phase.CAPTURE
                if (!attendanceInjected) {
                    setStatus("Filling attendance by student name…")
                    mainHandler.postDelayed({ injectAttendance(p) }, 900)
                }
            }
            phase == Phase.LOGIN || phase == Phase.POST_LOGIN -> {
                if (!navigatingToCapture) {
                    phase = Phase.POST_LOGIN
                    navigatingToCapture = true
                    val capture = p.optString("captureUrl", DEFAULT_CAPTURE_URL)
                    setStatus("Signed in. Opening attendance capture…")
                    webView?.loadUrl(capture)
                }
            }
        }
    }

    private fun injectLogin(p: JSONObject) {
        val user = JSONObject.quote(p.optString("username", ""))
        val pass = JSONObject.quote(p.optString("password", ""))
        val script = loadInjectLib() +
            "\n;(function(){try{return KVSamagamInject.loginPage({username:$user,password:$pass});}catch(e){return {ok:false,error:String(e)};}})();"
        webView?.evaluateJavascript(script, null)
    }

    private fun injectAttendance(p: JSONObject) {
        val entries = p.optJSONArray("entries") ?: JSONArray()
        val script = loadInjectLib() +
            "\n;(function(){try{return KVSamagamInject.attendancePage(" + entries.toString() + ");}catch(e){return {ok:false,error:String(e)};}})();"
        webView?.evaluateJavascript(script) { raw ->
            attendanceInjected = true
            phase = Phase.DONE
            val message = parseInjectMessage(raw)
            setStatus(message)
            Toast.makeText(activity, message, Toast.LENGTH_LONG).show()
            notifyJsDone(message)
        }
    }

    private fun parseInjectMessage(raw: String?): String {
        if (raw.isNullOrBlank() || raw == "null") {
            return "Attendance page loaded. Verify entries and press Submit on SAMAGAM manually."
        }
        val cleaned = raw.trim().removeSurrounding("\"").replace("\\\"", "\"").replace("\\\\", "\\")
        return try {
            val obj = JSONObject(cleaned)
            obj.optString("message", "Verify attendance on SAMAGAM and press Submit manually.")
        } catch (_e: Exception) {
            "Filled attendance where possible. Verify and press Submit on SAMAGAM manually."
        }
    }

    companion object {
        private const val DEFAULT_LOGIN_URL = "https://samagam.kvs.gov.in/user/login"
        private const val DEFAULT_CAPTURE_URL =
            "https://samagam.kvs.gov.in/mis/attendance/capture/1/69d476d9e4d94"
    }
}
