package com.watchanybox.app

import android.content.Context
import android.util.Log
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

/**
 * One client connection on 127.0.0.1:46900.
 *
 * GET/HEAD for a bundled asset is served straight from the APK. Everything else
 * (POST /ck, /extract, /probe, /eps, /hls, /seg, /ep, /kd, /jav, /r34, /htv,
 * /ai, /page, /raw, /tmdb, ...) is streamed byte-for-byte to the embedded Node
 * engine, so the Node script stays the single source of extraction truth.
 */
class LocalStreamClientHandler(
    private val socket: Socket,
    private val context: Context
) : Runnable {

    private companion object {
        const val TAG = "WatchAnyBoxServer"
        const val MAX_HEAD = 64 * 1024
        const val MAX_BODY = 4 * 1024 * 1024
        const val COPY_BUFFER = 64 * 1024
    }

    override fun run() {
        try {
            socket.soTimeout = 25000
            val input = BufferedInputStream(socket.getInputStream())
            val output = BufferedOutputStream(socket.getOutputStream())

            val head = readHead(input) ?: return
            val lines = head.split("\r\n")
            val request = lines.firstOrNull()?.split(' ') ?: return
            if (request.size < 2) return
            val method = request[0].uppercase()
            val target = request[1]

            val headers = ArrayList<Pair<String, String>>(16)
            for (i in 1 until lines.size) {
                val line = lines[i]
                if (line.isEmpty()) break
                val colon = line.indexOf(':')
                if (colon > 0) headers.add(line.substring(0, colon).trim() to line.substring(colon + 1).trim())
            }
            val body = readBody(input, headers)
            val headOnly = method == "HEAD"

            val rawPath = normalizeTarget(target)
            val path = rawPath.substringBefore('?')

            if (path == "/__wab/health") {
                val node = Backend.livePort()
                val json = "{\"ok\":true,\"node\":$node}"
                write(output, 200, "application/json; charset=utf-8", json.toByteArray(StandardCharsets.UTF_8), headOnly)
                return
            }

            if (method == "GET" || method == "HEAD") {
                val asset = assetName(path)
                if (asset != null) {
                    val bytes = readAsset(asset)
                    if (bytes != null) {
                        /* Bundled JS/CSS/HTML is immutable for this build:
                           let the WebView HTTP cache keep it across visits. */
                        write(output, 200, mimeOf(asset), bytes, headOnly, "public, max-age=86400")
                        return
                    }
                }
            }

            proxy(method, rawPath, headers, body, output)
        } catch (t: Throwable) {
            Log.w(TAG, "client failed: ${t.message}")
        } finally {
            try { socket.close() } catch (_: Throwable) {}
        }
    }

    /* ---------------- request parsing ---------------- */

    private fun readHead(input: InputStream): String? {
        val buf = ByteArrayOutputStream(4096)
        var p1 = -1; var p2 = -1; var p3 = -1
        while (buf.size() < MAX_HEAD) {
            val v = input.read()
            if (v < 0) return if (buf.size() == 0) null else buf.toString("ISO-8859-1")
            buf.write(v)
            if (p3 == 13 && p2 == 10 && p1 == 13 && v == 10) return buf.toString("ISO-8859-1")
            p3 = p2; p2 = p1; p1 = v
        }
        return buf.toString("ISO-8859-1")
    }

    private fun readBody(input: InputStream, headers: List<Pair<String, String>>): ByteArray? {
        var length = -1
        var chunked = false
        for ((k, v) in headers) {
            when (k.lowercase()) {
                "content-length" -> length = v.trim().toIntOrNull() ?: -1
                "transfer-encoding" -> if (v.contains("chunked", ignoreCase = true)) chunked = true
            }
        }
        if (chunked) {
            val buf = ByteArrayOutputStream()
            val line = StringBuilder()
            var chunkRemaining = -1
            while (buf.size() < MAX_BODY) {
                val v = input.read()
                if (v < 0) break
                if (chunkRemaining < 0) {
                    // reading the size line
                    if (v == 10) {
                        val sizeText = line.toString().trim().substringBefore(';')
                        chunkRemaining = sizeText.toIntOrNull(16) ?: 0
                        line.setLength(0)
                        if (chunkRemaining == 0) break
                    } else if (v != 13) line.append(v.toInt().toChar())
                } else {
                    buf.write(v)
                    chunkRemaining--
                    if (chunkRemaining == 0) chunkRemaining = -1
                }
            }
            return buf.toByteArray()
        }
        if (length in 1..MAX_BODY) {
            val body = ByteArray(length)
            var read = 0
            while (read < length) {
                val n = input.read(body, read, length - read)
                if (n < 0) break
                read += n
            }
            return if (read == length) body else body.copyOf(read)
        }
        return null
    }

    private fun normalizeTarget(target: String): String {
        if (!target.startsWith("http://") && !target.startsWith("https://")) return target
        return try {
            val uri = java.net.URI(target)
            (uri.rawPath.ifBlank { "/" }) + (uri.rawQuery?.let { "?$it" } ?: "")
        } catch (_: Throwable) {
            "/"
        }
    }

    /* ---------------- bundled assets ---------------- */

    private fun assetName(path: String): String? {
        val decoded = try { URLDecoder.decode(path, "UTF-8") } catch (_: Throwable) { path }
        if (decoded.contains("..")) return null
        var name = decoded.trimStart('/')
        if (name.isEmpty()) name = "index.html"
        if (name.startsWith("assets/")) name = name.removePrefix("assets/")
        return name
    }

    private fun readAsset(name: String): ByteArray? = try {
        context.assets.open(name).use { it.readBytes() }
    } catch (_: Throwable) {
        null
    }

    private fun mimeOf(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
        "html", "htm" -> "text/html; charset=utf-8"
        "js" -> "text/javascript; charset=utf-8"
        "css" -> "text/css; charset=utf-8"
        "json" -> "application/json; charset=utf-8"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "gif" -> "image/gif"
        "ico" -> "image/x-icon"
        "txt" -> "text/plain; charset=utf-8"
        "woff" -> "font/woff"
        "woff2" -> "font/woff2"
        "m3u8" -> "application/vnd.apple.mpegurl"
        "ts" -> "video/mp2t"
        "mp4" -> "video/mp4"
        "webm" -> "video/webm"
        "mp3" -> "audio/mpeg"
        else -> "application/octet-stream"
    }

    private fun write(
        output: BufferedOutputStream,
        status: Int,
        cType: String,
        body: ByteArray,
        headOnly: Boolean,
        cacheControl: String = "no-store"
    ) {
        val header = buildString {
            append("HTTP/1.1 ").append(status).append(statusText(status)).append("\r\n")
            append("Content-Type: ").append(cType).append("\r\n")
            append("Content-Length: ").append(body.size).append("\r\n")
            append("Cache-Control: ").append(cacheControl).append("\r\n")
            append("Access-Control-Allow-Origin: *\r\n")
            append("Connection: close\r\n\r\n")
        }
        output.write(header.toByteArray(StandardCharsets.ISO_8859_1))
        if (!headOnly) output.write(body)
        output.flush()
    }

    private fun statusText(status: Int) = when (status) {
        200 -> " OK"
        503 -> " Service Unavailable"
        else -> ""
    }

    /* ---------------- reverse proxy to the Node engine ---------------- */

    private fun proxy(
        method: String,
        rawPath: String,
        headers: List<Pair<String, String>>,
        body: ByteArray?,
        output: BufferedOutputStream
    ) {
        val port = Backend.livePort()
        if (port == 0) {
            write(
                output, 503, "application/json; charset=utf-8",
                "{\"error\":\"extraction engine not ready\"}".toByteArray(StandardCharsets.UTF_8), false
            )
            return
        }
        val upstream = Socket()
        try {
            upstream.connect(InetSocketAddress("127.0.0.1", port), 4000)
            upstream.soTimeout = 120000
            val uin = BufferedInputStream(upstream.getInputStream())
            val uout = BufferedOutputStream(upstream.getOutputStream())

            val sb = StringBuilder(512)
            sb.append(method).append(' ').append(rawPath).append(" HTTP/1.1\r\n")
            var hostWritten = false
            for ((k, v) in headers) {
                when (k.lowercase()) {
                    "host" -> {
                        sb.append("Host: 127.0.0.1:").append(port).append("\r\n")
                        hostWritten = true
                    }
                    "connection", "proxy-connection", "expect", "upgrade", "keep-alive" -> Unit
                    else -> sb.append(k).append(": ").append(v).append("\r\n")
                }
            }
            if (!hostWritten) sb.append("Host: 127.0.0.1:").append(port).append("\r\n")
            sb.append("Connection: close\r\n\r\n")
            uout.write(sb.toString().toByteArray(StandardCharsets.ISO_8859_1))
            if (body != null && body.isNotEmpty()) uout.write(body)
            uout.flush()

            val buf = ByteArray(COPY_BUFFER)
            while (true) {
                val n = try { uin.read(buf) } catch (_: Throwable) { -1 }
                if (n < 0) break
                output.write(buf, 0, n)
                output.flush()
            }
        } catch (t: Throwable) {
            Log.w(TAG, "proxy to $port failed for $rawPath: ${t.message}")
            try {
                write(
                    output, 503, "application/json; charset=utf-8",
                    "{\"error\":\"proxy failed\"}".toByteArray(StandardCharsets.UTF_8), false
                )
            } catch (_: Throwable) {}
        } finally {
            try { upstream.close() } catch (_: Throwable) {}
        }
    }
}
