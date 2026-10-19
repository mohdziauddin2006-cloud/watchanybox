package com.watchanybox.app

import android.content.Context
import android.util.Log
import com.caoccao.javet.enums.V8AwaitMode
import com.caoccao.javet.interop.NodeRuntime
import com.caoccao.javet.interop.V8Host

/**
 * Runs the UNMODIFIED srv2.js extractor/proxy inside the Android process using
 * an embedded Node.js 22 runtime (javet). This is the same file the desktop
 * build runs: /probe, /extract, /eps, /hls, /seg, /ep, /kd, /jav, /r34, /htv,
 * /ai, /page, /raw, /tmdb and friends all come from that single script.
 *
 * The script is wrapped in a CommonJS shim so its trailing `module.exports`
 * works, and the runtime's event loop is pumped on the backend thread. srv2.js
 * binds 127.0.0.1:46901-46903 exactly like on desktop; LocalStreamServer on
 * 46900 reverse-proxies to it so the whole app answers on one origin too.
 */
object NodeBackend {

    private const val TAG = "WatchAnyBoxNode"

    @Volatile
    private var runtime: NodeRuntime? = null

    @Volatile
    var started = false
        private set

    @Volatile
    var lastError: String? = null
        private set

    private var thread: Thread? = null

    fun start(context: Context) {
        if (thread?.isAlive == true) return
        val appContext = context.applicationContext
        thread = Thread({
            var rt: NodeRuntime? = null
            try {
                rt = V8Host.getNodeInstance().createV8Runtime()
                runtime = rt
                val source = appContext.assets.open("srv2.js")
                    .bufferedReader(Charsets.UTF_8).use { it.readText() }
                val wrapped = "(function(module, exports, require){\n" + source + "\n})({exports:{}}, {}, require);"
                rt.getExecutor(wrapped).executeVoid()
                started = true
                lastError = null
                val version = try { rt.getExecutor("process.version").executeString() } catch (_: Throwable) { "?" }
                Log.i(TAG, "Node backend up ($version); srv2.js listening on 46901-46903")

                while (!Thread.currentThread().isInterrupted) {
                    if (rt.isStopping) break
                    try {
                        rt.await(V8AwaitMode.RunOnce)
                    } catch (t: Throwable) {
                        Log.e(TAG, "event loop stopped", t)
                        break
                    }
                    Thread.sleep(5)
                }
            } catch (t: Throwable) {
                lastError = (t.message ?: t.javaClass.simpleName)
                Log.e(TAG, "Node backend failed", t)
            } finally {
                try { rt?.close() } catch (_: Throwable) {}
            }
        }, "wab-node-backend").apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        try { runtime?.setStopping(true) } catch (_: Throwable) {}
        thread?.interrupt()
        thread = null
    }
}
