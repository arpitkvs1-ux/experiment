package com.kvnitagartala.studentapp

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * Opens WhatsApp with a prefilled absentee message.
 * If [groupJid] ends with @g.us, targets that group chat (user taps Send only).
 */
class ShareBridge(private val activity: Activity) {

    @JavascriptInterface
    fun shareWhatsApp(text: String, groupJid: String?) {
        Handler(Looper.getMainLooper()).post {
            val msg = text.trim()
            if (msg.isEmpty()) {
                Toast.makeText(activity, "Nothing to share.", Toast.LENGTH_SHORT).show()
                return@post
            }
            val jid = groupJid?.trim()?.takeIf { it.contains("@g.us", ignoreCase = true) }
            val packages = listOf("com.whatsapp", "com.whatsapp.w4b")
            for (pkg in packages) {
                if (launchWhatsApp(msg, jid, pkg)) return@post
            }
            try {
                val uri = Uri.parse("https://api.whatsapp.com/send?text=" + Uri.encode(msg))
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_e: Exception) {
                Toast.makeText(activity, "WhatsApp is not installed.", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun launchWhatsApp(message: String, groupJid: String?, packageName: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, message)
                if (groupJid != null) {
                    putExtra("jid", groupJid)
                }
                setPackage(packageName)
            }
            activity.packageManager.getPackageInfo(packageName, 0)
            activity.startActivity(intent)
            true
        } catch (_e: Exception) {
            false
        }
    }
}
