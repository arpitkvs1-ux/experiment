package com.kvnitagartala.studentapp

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File

/**
 * Lets the embedded WebView save Excel/PDF (blob downloads do not work in WebView).
 */
class ExportBridge(private val activity: Activity) {

    @JavascriptInterface
    fun saveFile(mimeType: String, fileName: String, base64Data: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                val bytes = Base64.decode(base64Data, Base64.DEFAULT)
                val safe = fileName.replace(Regex("""[\\/:*?"<>|]+"""), "_").take(180)
                val dir = activity.getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS)
                    ?: activity.filesDir
                if (!dir.exists()) dir.mkdirs()
                val out = File(dir, safe.ifEmpty { "KV_Report.bin" })
                out.writeBytes(bytes)
                Toast.makeText(
                    activity,
                    activity.getString(R.string.saved_file, out.name),
                    Toast.LENGTH_LONG
                ).show()
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
