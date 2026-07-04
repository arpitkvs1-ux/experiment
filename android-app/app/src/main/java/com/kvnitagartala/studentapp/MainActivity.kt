package com.kvnitagartala.studentapp

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
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
import android.widget.FrameLayout
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
import com.google.android.gms.auth.api.signin.GoogleSignInStatusCodes
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import org.json.JSONObject

/**
 * Local KV student dashboard: same UI/logic as browser-app (HTML/CSS/JS in assets).
 * Data stays on device (localStorage). CSV import uses the system file picker.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var rootLayout: FrameLayout
    private lateinit var assetLoader: WebViewAssetLoader
    private var samagamFlow: SamagamFlowController? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var googleSignInClient: GoogleSignInClient
    private var currentGoogleAccount: GoogleSignInAccount? = null

    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_CANCELED) return@registerForActivityResult
        val data = result.data
        if (data == null) {
            notifySignInError("Google sign-in returned no data. Please try again.")
            return@registerForActivityResult
        }
        handleGoogleSignInResult(data)
    }

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
        rootLayout = FrameLayout(this)
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
            addJavascriptInterface(SamagamBridge(), "AndroidSamagam")
            addJavascriptInterface(ShareBridge(this@MainActivity), "AndroidShare")

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
        rootLayout.addView(
            webView,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        )
        samagamFlow = SamagamFlowController(this, rootLayout)
        setContentView(rootLayout)

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

    private fun handleGoogleSignInResult(data: Intent) {
        val task = GoogleSignIn.getSignedInAccountFromIntent(data)
        try {
            val account = task.getResult(ApiException::class.java)
            currentGoogleAccount = account
            notifyAccountChanged()
            Toast.makeText(
                this,
                "Signed in: ${account.email ?: account.displayName ?: "account"}",
                Toast.LENGTH_SHORT
            ).show()
        } catch (e: ApiException) {
            if (e.statusCode == GoogleSignInStatusCodes.SIGN_IN_CANCELLED) return
            val code = e.statusCode
            val statusName = CommonStatusCodes.getStatusCodeString(code)
            val hint = if (code == CommonStatusCodes.DEVELOPER_ERROR) {
                " In Google Cloud Console, create an Android OAuth client with package " +
                    "com.kvnitagartala.studentapp and the SHA-1 of the key used to sign this APK " +
                    "(debug: run keytool on ~/.android/debug.keystore)."
            } else ""
            val msg = "Google sign-in failed ($code $statusName).$hint"
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            notifySignInError(msg)
        } catch (_e: Exception) {
            val msg = "Google sign-in failed. Please try again."
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
            notifySignInError(msg)
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

    fun notifySamagamFlowMessage(json: String) {
        val escaped = JSONObject.quote(json)
        webView.post {
            webView.evaluateJavascript(
                "window.__kvOnSamagamFlowMessage && window.__kvOnSamagamFlowMessage($escaped);",
                null
            )
        }
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

    private fun notifySignInError(message: String) {
        val escaped = JSONObject.quote(message)
        webView.post {
            webView.evaluateJavascript(
                "window.__kvOnAndroidSignInError && window.__kvOnAndroidSignInError($escaped);",
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
                googleSignInLauncher.launch(googleSignInClient.signInIntent)
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

    inner class SamagamBridge {
        @JavascriptInterface
        fun startFlow(json: String) {
            runOnUiThread {
                samagamFlow?.start(json)
            }
        }

        @JavascriptInterface
        fun closeFlow() {
            runOnUiThread {
                samagamFlow?.close()
            }
        }
    }
}
