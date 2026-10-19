package com.watchanybox.app

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfo
import androidx.window.core.layout.WindowWidthSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.json.JSONTokener

/** Every destination the shell can drive inside the bundled catalogue. */
enum class ShellSection(val id: String, val label: String, val glyph: String, val inBar: Boolean = false) {
    Home("home", "Home", "\uD83C\uDFE0", true),
    Movies("movie", "Movies", "\uD83C\uDFAC"),
    Series("tv", "Series", "\uD83D\uDCFA", true),
    WebSeries("webseries", "Web Series", "\uD83C\uDF10", true),
    Discover("discover", "Discover", "\u2728", true),
    KDrama("kdrama", "K-Drama", "\uD83C\uDFAD"),
    Anime("anime", "Anime", "\uD83C\uDF38"),
    Kids("kids", "Kids", "\uD83E\uDDF8"),
    Cartoons("cartoons", "Cartoons", "\uD83C\uDFA8"),
    Live("livetv", "Live TV", "\uD83D\uDCE1"),
    Tube("tube", "Tube", "\u25B6\uFE0F"),
    Vault("adult", "18+", "\uD83D\uDD1E"),
    Settings("settings", "Settings", "\u2699\uFE0F")
}

/* ---------------- JS bridge ---------------- */

class ShellBridge(private val holder: WebViewHolder) {
    private val main = Handler(Looper.getMainLooper())
    var onReady: (() -> Unit)? = null
    var onSection: ((String) -> Unit)? = null

    @JavascriptInterface
    fun ready() {
        main.post { onReady?.invoke() }
    }

    @JavascriptInterface
    fun section(sec: String) {
        main.post { onSection?.invoke(sec) }
    }
}

/* ---------------- WebView holder (survives destination switches) ---------------- */

class WebViewHolder(context: Context) {
    private val appContext = context.applicationContext
    private var frame: FrameLayout? = null
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    var web: WebView? = null
        private set

    val bridge = ShellBridge(this)

    fun frame(ctx: Context): FrameLayout {
        frame?.let { return it }
        val f = FrameLayout(ctx)
        val wv = createWebView(ctx)
        wv.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        f.addView(wv)
        frame = f
        web = wv
        return f
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(ctx: Context): WebView {
        val wv = WebView(ctx)
        wv.setBackgroundColor(android.graphics.Color.parseColor("#07070A"))
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_NO_CACHE
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            allowContentAccess = false
        }
        wv.webChromeClient = object : WebChromeClient() {
            override fun onShowCustomView(view: View, callback: CustomViewCallback) = enterFullscreen(view, callback)
            override fun onHideCustomView() = exitFullscreen()
        }
        wv.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                injectShell(view)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url.toString()
                if (u.startsWith("http://127.0.0.1:") || u.startsWith("https://127.0.0.1:")) return false
                return try {
                    appContext.startActivity(
                        Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                    true
                } catch (_: Throwable) {
                    true
                }
            }
        }
        wv.addJavascriptInterface(bridge, "AndroidShell")
        wv.loadUrl("http://127.0.0.1:46900/index.html")
        return wv
    }

    /** The web catalogue keeps its own sidebar; the Compose shell replaces it. */
    private fun injectShell(view: WebView) {
        view.evaluateJavascript(
            "(function(){try{" +
                "var sb=document.getElementById('sidebar');if(sb)sb.style.display='none';" +
                "if(!window.__ANDROID_SHELL__){window.__ANDROID_SHELL__=1;" +
                "try{new MutationObserver(function(){try{AndroidShell.section(document.body.getAttribute('data-sec')||'home');}catch(e){}}).observe(document.body,{attributes:true,attributeFilter:['data-sec']});}catch(e){}" +
                "try{AndroidShell.ready();}catch(e){}" +
                "}}catch(e){}})();",
            null
        )
    }

    fun eval(js: String) {
        try { web?.evaluateJavascript(js, null) } catch (_: Throwable) {}
    }

    fun select(section: ShellSection) {
        if (section == ShellSection.Discover) return
        val body = when (section) {
            ShellSection.Settings -> "var b=document.getElementById('settingsBtn');if(b)b.click();"
            else -> "var b=document.querySelector('#nav button[data-sec=\"" + section.id + "\"]');if(b)b.click();"
        }
        eval("(function(){try{$body}catch(e){}})();")
    }

    fun reload() {
        try { web?.reload() } catch (_: Throwable) {}
    }

    fun pauseMedia() {
        eval("(function(){try{var vs=document.querySelectorAll('video');for(var i=0;i<vs.length;i++){try{vs[i].pause()}catch(e){}}}catch(e){}})();")
    }

    fun currentVideo(onResult: (url: String?, title: String?) -> Unit) {
        val wv = web ?: return onResult(null, null)
        val js = "(function(){try{var u='';" +
            "var v=document.querySelector('#playerView video')||document.querySelector('video');" +
            "if(v){u=v.currentSrc||v.src||'';}" +
            "if(!u||u.indexOf('blob:')===0){u=(window.__WAB_LAST_STREAM__||'');}" +
            "var t='';try{var e=document.getElementById('pTitle');if(e){t=(e.textContent||'').trim();}}catch(x){}" +
            "if(!t){t=document.title||'';}" +
            "return JSON.stringify({u:u,t:t});}catch(e){return '';}})()"
        wv.evaluateJavascript(js) { result ->
            val decoded = try {
                val v = JSONTokener(result ?: "").nextValue()
                if (v is String) v else null
            } catch (_: Throwable) { null }
            if (decoded.isNullOrBlank()) return@evaluateJavascript onResult(null, null)
            try {
                val obj = JSONObject(decoded)
                onResult(
                    obj.optString("u").ifBlank { null },
                    obj.optString("t").ifBlank { null }
                )
            } catch (_: Throwable) {
                onResult(null, null)
            }
        }
    }

    private fun enterFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (customView != null) {
            callback.onCustomViewHidden()
            return
        }
        customView = view
        customCallback = callback
        frame?.addView(
            view,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        )
    }

    private fun exitFullscreen() {
        val v = customView ?: return
        try { frame?.removeView(v) } catch (_: Throwable) {}
        customView = null
        try { customCallback?.onCustomViewHidden() } catch (_: Throwable) {}
        customCallback = null
    }
}

@Composable
fun WebViewHost(holder: WebViewHolder, modifier: Modifier = Modifier) {
    AndroidView(factory = { ctx -> holder.frame(ctx) }, modifier = modifier, update = { })
}

/* ---------------- application shell ---------------- */

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WatchAnyBoxApp() {
    val context = LocalContext.current
    val holder = remember { WebViewHolder(context) }
    val adaptive = currentWindowAdaptiveInfo()
    val compact = adaptive.windowSizeClass.windowWidthSizeClass == WindowWidthSizeClass.COMPACT

    var engineReady by remember { mutableStateOf(false) }
    var engineFailed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }

    var section by remember { mutableStateOf(ShellSection.Home) }
    var showDiscover by remember { mutableStateOf(false) }
    var showSheet by remember { mutableStateOf(false) }
    var nativePlay by remember { mutableStateOf<NativePlay?>(null) }

    LaunchedEffect(attempt) {
        engineReady = false
        engineFailed = false
        val ok = withContext(Dispatchers.IO) { Backend.waitReady(45_000) }
        engineReady = ok
        engineFailed = !ok
    }

    holder.bridge.onSection = { sec ->
        ShellSection.entries.firstOrNull { it.id == sec }?.let { matched ->
            if (matched != ShellSection.Discover) {
                section = matched
                showDiscover = false
            }
        }
    }
    holder.bridge.onReady = {
        if (!showDiscover) holder.select(section)
    }

    val choose: (ShellSection) -> Unit = { target ->
        if (target == ShellSection.Discover) {
            showDiscover = true
        } else {
            showDiscover = false
            section = target
            holder.select(target)
        }
    }

    val openNative: () -> Unit = {
        holder.currentVideo { url, title ->
            if (!url.isNullOrBlank()) {
                holder.pauseMedia()
                nativePlay = NativePlay(url, title ?: "Now playing")
            }
        }
    }

    if (!engineReady) {
        EngineSplash(failed = engineFailed, onRetry = { attempt++ })
        return
    }

    if (compact) {
        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    ShellSection.entries.filter { it.inBar }.forEach { s ->
                        NavigationBarItem(
                            selected = if (s == ShellSection.Discover) showDiscover
                            else (!showDiscover && section == s),
                            onClick = { choose(s) },
                            icon = { Text(s.glyph, fontSize = 16.sp) },
                            label = {
                                Text(s.label, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        )
                    }
                    NavigationBarItem(
                        selected = showSheet,
                        onClick = { showSheet = true },
                        icon = { Text("\u22EF", fontSize = 20.sp) },
                        label = { Text("More", fontSize = 10.sp) }
                    )
                }
            }
        ) { inner ->
            ShellSurface(
                modifier = Modifier.fillMaxSize().padding(inner),
                holder = holder,
                compact = true,
                showDiscover = showDiscover,
                nativePlay = nativePlay,
                onPickDiscover = { item ->
                    showDiscover = false
                    holder.eval(openItemJs(item))
                },
                onCloseDiscover = { showDiscover = false },
                onClosePlayer = { nativePlay = null }
            )
        }
    } else {
        Scaffold(containerColor = MaterialTheme.colorScheme.background, bottomBar = {}) { inner ->
            Row(Modifier.fillMaxSize().padding(inner)) {
                NavigationRail(
                    containerColor = MaterialTheme.colorScheme.surface,
                    header = {
                        Text(
                            "WAB",
                            fontWeight = FontWeight.ExtraBold,
                            color = MaterialTheme.colorScheme.secondary,
                            fontSize = 15.sp
                        )
                    }
                ) {
                    Column(Modifier.verticalScroll(rememberScrollState())) {
                        ShellSection.entries.forEach { s ->
                            NavigationRailItem(
                                selected = if (s == ShellSection.Discover) showDiscover
                                else (!showDiscover && section == s),
                                onClick = { choose(s) },
                                icon = { Text(s.glyph, fontSize = 16.sp) },
                                label = {
                                    Text(s.label, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            )
                        }
                        NavigationRailItem(
                            selected = false,
                            onClick = { openNative() },
                            icon = { Text("\uD83C\uDF9E\uFE0F", fontSize = 16.sp) },
                            label = { Text("Native", fontSize = 9.sp) }
                        )
                    }
                }
                Box(
                    Modifier
                        .width(1.dp)
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.outline)
                )
                ShellSurface(
                    modifier = Modifier.weight(1f),
                    holder = holder,
                    compact = false,
                    showDiscover = showDiscover,
                    nativePlay = nativePlay,
                    onPickDiscover = { item ->
                        showDiscover = false
                        holder.eval(openItemJs(item))
                    },
                    onCloseDiscover = { showDiscover = false },
                    onClosePlayer = { nativePlay = null }
                )
            }
        }
    }

    if (showSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            LazyColumn(Modifier.fillMaxWidth().padding(bottom = 28.dp)) {
                item {
                    Text(
                        "Browse",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 8.dp)
                    )
                }
                items(ShellSection.entries) { s ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                showSheet = false
                                choose(s)
                            }
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(s.glyph, fontSize = 18.sp)
                        Spacer(Modifier.width(16.dp))
                        Text(s.label, style = MaterialTheme.typography.bodyLarge)
                    }
                }
                item {
                    HorizontalDivider(
                        Modifier.padding(vertical = 10.dp),
                        color = MaterialTheme.colorScheme.outline
                    )
                }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                showSheet = false
                                openNative()
                            }
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("\uD83C\uDF9E\uFE0F", fontSize = 18.sp)
                        Spacer(Modifier.width(16.dp))
                        Text("Play natively (ExoPlayer)", style = MaterialTheme.typography.bodyLarge)
                    }
                }
                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                showSheet = false
                                holder.reload()
                            }
                            .padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("\uD83D\uDD04", fontSize = 18.sp)
                        Spacer(Modifier.width(16.dp))
                        Text("Reload catalogue", style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun ShellSurface(
    modifier: Modifier,
    holder: WebViewHolder,
    compact: Boolean,
    showDiscover: Boolean,
    nativePlay: NativePlay?,
    onPickDiscover: (DiscoverItem) -> Unit,
    onCloseDiscover: () -> Unit,
    onClosePlayer: () -> Unit
) {
    Box(modifier) {
        WebViewHost(holder, Modifier.fillMaxSize())
        if (showDiscover) {
            BackHandler(enabled = true) { onCloseDiscover() }
            DiscoverScreen(
                onPick = onPickDiscover,
                onBack = onCloseDiscover,
                modifier = Modifier.fillMaxSize()
            )
        }
        nativePlay?.let { play ->
            BackHandler(enabled = true) { onClosePlayer() }
            NativePlayerScreen(
                play = play,
                compact = compact,
                onBack = onClosePlayer,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

/* Drives the shared renderer with a real TMDB item, exactly like a poster tap
   inside the web catalogue does. */
private fun openItemJs(item: DiscoverItem): String {
    val title = JSONObject.quote(item.title)
    return "(function(){try{window.__WAB.openItem({kind:'tmdb',tmdb:${item.id},mt:'${item.mediaType}',t:$title});}catch(e){}})();"
}

@Composable
private fun EngineSplash(failed: Boolean, onRetry: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(
                    "Watch",
                    fontSize = 30.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Color.White
                )
                Text(
                    "AnyBox",
                    fontSize = 30.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = MaterialTheme.colorScheme.secondary
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "Standalone build \u2022 in-app extraction engine",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(26.dp))
            if (!failed) {
                CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(14.dp))
                Text(
                    "Starting the local engine on 127.0.0.1\u2026",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            } else {
                Text(
                    "The extraction engine did not answer yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = onRetry) { Text("Try again") }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = onRetry) { Text("Restart engine") }
            }
        }
    }
}
