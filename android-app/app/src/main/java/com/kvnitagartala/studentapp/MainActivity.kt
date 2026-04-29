package com.kvnitagartala.studentapp

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import org.json.JSONObject

/**
 * Local KV student dashboard: same UI/logic as browser-app (HTML/CSS/JS in assets).
 * Data stays on device (localStorage). CSV import uses the system file picker.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var googleSignInClient: GoogleSignInClient
    private var currentGoogleAccount: GoogleSignInAccount? = null
    private val RC_GOOGLE_SIGN_IN = 8801

    private val filePicker = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        val cb = filePathCallback
        filePathCallback = null
        if (uri != null) {
            cb?.onReceiveValue(arrayOf(uri))
        } else {
            cb?.onReceiveValue(null)
        }
    }

    private var pendingExport: Triple<String, String, ByteArray>? = null

    private val storagePermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val pending = pendingExport
        pendingExport = null
        if (pending == null) return@registerForActivityResult
        val (mime, name, bytes) = pending
        if (granted) {
            showSaveToast(ExportDownloads.saveLegacyPublic(this, mime, name, bytes))
        } else {
            Toast.makeText(this, R.string.storage_permission_denied, Toast.LENGTH_LONG).show()
            showSaveToast(ExportDownloads.save(this, mime, name, bytes))
        }
    }

    private fun showSaveToast(outcome: ExportDownloads.SaveOutcome) {
        val text = when (outcome.kind) {
            ExportDownloads.ResultKind.PUBLIC_DOWNLOADS ->
                getString(R.string.saved_file_downloads, outcome.displayName)
            ExportDownloads.ResultKind.APP_PRIVATE_FALLBACK ->
                getString(R.string.saved_file_fallback, outcome.displayName, outcome.hint ?: "")
        }
        Toast.makeText(this, text, Toast.LENGTH_LONG).show()
    }

    private fun handleExportSave(mimeType: String, fileName: String, bytes: ByteArray) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            showSaveToast(ExportDownloads.save(this, mimeType, fileName, bytes))
            return
        }
        val canWrite = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.WRITE_EXTERNAL_STORAGE
        ) == PackageManager.PERMISSION_GRANTED
        if (canWrite) {
            showSaveToast(ExportDownloads.saveLegacyPublic(this, mimeType, fileName, bytes))
        } else {
            pendingExport = Triple(mimeType, fileName, bytes)
            storagePermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)
        currentGoogleAccount = GoogleSignIn.getLastSignedInAccount(this)
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.setSupportZoom(true)
            settings.builtInZoomControls = true
            settings.displayZoomControls = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            addJavascriptInterface(
                ExportBridge(this@MainActivity) { mime, name, bytes ->
                    handleExportSave(mime, name, bytes)
                },
                "AndroidExport"
            )
            addJavascriptInterface(AndroidAccountBridge(), "AndroidAccount")

            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return false
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    view: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams
                ): Boolean {
                    this@MainActivity.filePathCallback?.onReceiveValue(null)
                    this@MainActivity.filePathCallback = filePathCallback
                    filePicker.launch("*/*")
                    return true
                }
            }
            loadUrl("https://appassets.androidplatform.net/assets/browser-app/index.html")
        }
        setContentView(webView)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        )
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != RC_GOOGLE_SIGN_IN) return
        val task = GoogleSignIn.getSignedInAccountFromIntent(data)
        try {
            val account = task.getResult(ApiException::class.java)
            currentGoogleAccount = account
            notifyAccountChanged()
        } catch (_e: Exception) {
            notifyAccountChanged()
        }
    }

    private fun accountJsonString(): String {
        val account = currentGoogleAccount
        val obj = JSONObject()
        if (account != null) {
            obj.put("signedIn", true)
            obj.put("email", account.email ?: "")
            obj.put("displayName", account.displayName ?: "")
            obj.put("id", account.id ?: "")
        } else {
            obj.put("signedIn", false)
            obj.put("email", "")
            obj.put("displayName", "")
            obj.put("id", "")
        }
        return obj.toString()
    }

    private fun notifyAccountChanged() {
        val escaped = JSONObject.quote(accountJsonString())
        webView.post {
            webView.evaluateJavascript(
                "window.__kvOnAndroidAccountChanged && window.__kvOnAndroidAccountChanged($escaped);",
                null
            )
        }
    }

    inner class AndroidAccountBridge {
        @JavascriptInterface
        fun getCurrentAccountJson(): String = accountJsonString()

        @JavascriptInterface
        fun signIn() {
            runOnUiThread {
                startActivityForResult(googleSignInClient.signInIntent, RC_GOOGLE_SIGN_IN)
            }
        }

        @JavascriptInterface
        fun signOut() {
            runOnUiThread {
                googleSignInClient.signOut().addOnCompleteListener {
                    currentGoogleAccount = null
                    notifyAccountChanged()
                }
            }
        }
    }
}
