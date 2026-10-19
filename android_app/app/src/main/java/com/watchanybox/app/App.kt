package com.watchanybox.app

import android.app.Application
import android.util.Log

/**
 * WatchAnyBox application entry point.
 *
 * Boots the whole standalone stack in-process, synchronously for the HTTP
 * surface and immediately for the embedded Node extractor:
 *   1. LocalStreamServer  -> 127.0.0.1:46900 (UI assets + reverse proxy)
 *   2. NodeBackend        -> 127.0.0.1:46901-46903 (unmodified srv2.js)
 *
 * Nothing is ever persisted. There is no lock, PIN or biometric gate.
 */
class App : Application() {

    override fun onCreate() {
        super.onCreate()

        val originalHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            try {
                Log.e("WatchAnyBox", "UNCAUGHT EXCEPTION", throwable)
            } catch (_: Throwable) {}
            try { originalHandler?.uncaughtException(thread, throwable) } catch (_: Throwable) {}
        }

        /* The asset/UI server binds its socket before this call returns, so the
           app is reachable the moment the first frame renders. */
        try {
            LocalStreamServer.start(this)
        } catch (t: Throwable) {
            Log.e("WatchAnyBox", "LocalStreamServer failed to start", t)
        }

        /* The Node extraction engine starts on its own thread; the UI waits for
           its /ping before loading the catalogue. */
        try {
            NodeBackend.start(this)
        } catch (t: Throwable) {
            Log.e("WatchAnyBox", "NodeBackend failed to start", t)
        }
    }
}
