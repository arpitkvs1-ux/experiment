package com.kvnitagartala.studentapp

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * Lets the embedded WebView save Excel/PDF (blob downloads do not work in WebView).
 * Files go to public Downloads (KV Student Dashboard) when the OS allows it.
 */
class ExportBridge(
    private val activity: Activity,
    private val onSave: (mimeType: String, fileName: String, bytes: ByteArray) -> Unit
) {

    @JavascriptInterface
    fun saveFile(mimeType: String, fileName: String, base64Data: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val safe = fileName.replace(Regex("""[\\/:*?"<>|]+"""), "_").take(180)
                val name = safe.ifEmpty { "KV_Report.bin" }
                onSave(mimeType, name, bytes)
            } catch (e: Exception) {
                Toast.makeText(
                    activity,
                    activity.getString(R.string.save_failed, e.message ?: "?"),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
}
