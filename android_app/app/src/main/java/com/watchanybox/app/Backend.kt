package com.watchanybox.app

import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Locates the live embedded Node backend port (46901-46903) and exposes shared
 * HTTP clients. The Node engine picks the first free port exactly like the
 * desktop srv2.js, so every caller probes /ping and caches the answer.
 */
object Backend {

    private const val HOST = "127.0.0.1"
    private val PORTS = intArrayOf(46901, 46902, 46903)

    @Volatile
    private var live = 0

    /** Short-timeout client used only for /ping readiness probes. */
    val prober: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(400, TimeUnit.MILLISECONDS)
            .readTimeout(700, TimeUnit.MILLISECONDS)
            .callTimeout(1200, TimeUnit.MILLISECONDS)
            .build()
    }

    /** General purpose client (discover rows, metadata, native player). */
    val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    /** Returns the live backend port or 0 when the Node engine is not up yet. */
    fun livePort(): Int {
        val cached = live
        if (cached != 0 && ping(cached)) return cached
        for (p in PORTS) {
            if (ping(p)) {
                live = p
                return p
            }
        }
        live = 0
        return 0
    }

    /** Blocks (on the calling background thread) until the engine answers. */
    fun waitReady(timeoutMs: Long): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (livePort() != 0) { warmUp(live); return true }
            try { Thread.sleep(250) } catch (_: InterruptedException) { return false }
        }
        return false
    }

    /**
     * Fire-and-forget: on a cold device the very first TMDB call can lose the
     * DNS/TLS race and come back 502 - and the renderer shows "Nothing
     * available right now" without retrying. One warm request right after the
     * engine answers makes the Node TLS pool hot before the WebView asks for
     * the catalog rows.
     */
    private fun warmUp(port: Int) {
        Thread {
            try { client.newCall(Request.Builder().url(url(port, "/tmdb/3/configuration")).build()).execute().use { } }
            catch (_: Throwable) { }
        }.start()
    }

    fun url(port: Int, pathAndQuery: String): String = "http://$HOST:$port$pathAndQuery"

    private fun ping(port: Int): Boolean = try {
        prober.newCall(Request.Builder().url("http://$HOST:$port/ping").build()).execute().use { it.isSuccessful }
    } catch (_: Throwable) {
        false
    }
}
