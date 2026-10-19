package com.watchanybox.app

import android.content.Context
import android.util.Log
import java.io.IOException
import java.net.InetSocketAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

/**
 * In-app local server on 127.0.0.1:46900, bound synchronously on app boot.
 *
 * Responsibilities:
 *   - Serve the bundled web catalogue straight from the APK assets.
 *   - Reverse-proxy every extraction/proxy route (/extract, /probe, /eps,
 *     /hls, /seg, /ep, /kd, /jav, /r34, /htv, /ai, /page, /raw, /tmdb, ...)
 *     to the embedded Node engine on 46901-46903. One origin, no CORS holes,
 *     and everything keeps working even if the UI calls 46900 directly.
 *
 * There is NO lock, PIN or biometric gate anywhere in this server.
 */
object LocalStreamServer {

    private const val TAG = "WatchAnyBoxServer"
    const val PORT = 46900
    private const val HOST = "127.0.0.1"

    private var serverThread: Thread? = null
    private var serverSocket: ServerSocket? = null

    @Volatile
    var context: Context? = null

    /** Binds the socket before returning, then accepts on a daemon thread. */
    fun start(applicationContext: Context) {
        context = applicationContext.applicationContext
        if (serverThread?.isAlive == true) return
        stop()
        var socket: ServerSocket? = null
        var attempt = 0
        while (socket == null && attempt < 5) {
            attempt++
            socket = try {
                ServerSocket().apply {
                    reuseAddress = true
                    bind(InetSocketAddress(HOST, PORT), 64)
                }
            } catch (e: IOException) {
                Log.w(TAG, "bind attempt $attempt failed: ${e.message}")
                Thread.sleep(200)
                null
            }
        }
        val bound = socket ?: run {
            Log.e(TAG, "could not bind $HOST:$PORT")
            return
        }
        serverSocket = bound
        serverThread = thread(isDaemon = true, name = "wab-asset-server") {
            while (!Thread.currentThread().isInterrupted) {
                try {
                    val client = bound.accept()
                    thread(isDaemon = true) {
                        LocalStreamClientHandler(client, applicationContext).run()
                    }
                } catch (t: Throwable) {
                    if (Thread.currentThread().isInterrupted) return@thread
                    Log.w(TAG, "accept failed: ${t.message}")
                    return@thread
                }
            }
        }
    }

    fun stop() {
        try { serverSocket?.close() } catch (_: Throwable) {}
        serverSocket = null
        serverThread = null
    }
}
