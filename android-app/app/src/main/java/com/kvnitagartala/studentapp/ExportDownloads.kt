package com.kvnitagartala.studentapp

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File

/**
 * Writes export files to the user-visible Downloads area (not app-private Android/data/...).
 */
object ExportDownloads {

    private const val SUBFOLDER = "KV Student Dashboard"

    enum class ResultKind {
        PUBLIC_DOWNLOADS,
        APP_PRIVATE_FALLBACK
    }

    data class SaveOutcome(
        val kind: ResultKind,
        val displayName: String,
        val hint: String? = null
    )

    fun save(context: Context, mimeType: String, fileName: String, bytes: ByteArray): SaveOutcome {
        val mime = mimeType.ifEmpty { "application/octet-stream" }
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (saveWithMediaStore(context, mime, fileName, bytes)) {
                SaveOutcome(ResultKind.PUBLIC_DOWNLOADS, fileName)
            } else {
                saveAppPrivate(context, fileName, bytes)
            }
        } else {
            saveAppPrivate(context, fileName, bytes)
        }
    }

    fun saveLegacyPublic(context: Context, mimeType: String, fileName: String, bytes: ByteArray): SaveOutcome {
        return try {
            val base = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val dir = File(base, SUBFOLDER).apply { mkdirs() }
            File(dir, fileName).writeBytes(bytes)
            SaveOutcome(ResultKind.PUBLIC_DOWNLOADS, fileName)
        } catch (_: Exception) {
            saveAppPrivate(context, fileName, bytes)
        }
    }

    private fun saveWithMediaStore(context: Context, mimeType: String, fileName: String, bytes: ByteArray): Boolean {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$SUBFOLDER")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
        return try {
            resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: return false
            values.clear()
            values.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            true
        } catch (_: Exception) {
            resolver.delete(uri, null, null)
            false
        }
    }

    private fun saveAppPrivate(context: Context, fileName: String, bytes: ByteArray): SaveOutcome {
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
        if (!dir.exists()) dir.mkdirs()
        val out = File(dir, fileName)
        out.writeBytes(bytes)
        return SaveOutcome(
            kind = ResultKind.APP_PRIVATE_FALLBACK,
            displayName = fileName,
            hint = context.getString(R.string.saved_file_app_storage_hint)
        )
    }
}
