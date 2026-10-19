package com.watchanybox.app

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/** A stream handed over from the web player to the native surface. */
data class NativePlay(val url: String, val title: String)

/**
 * Native Media3/ExoPlayer surface. The ExoPlayer instance is owned by the app
 * root (so rotation/layout changes never restart playback); this composable
 * only attaches a PlayerView to it.
 *
 * Inline playback is 16:9 and always uses RESIZE_MODE_FIT, so the frame is
 * letterboxed rather than cropped or stretched. Fullscreen fills the entire
 * window; the fullscreen flag is hoisted to the app root as well.
 */
@Composable
fun NativePlayerScreen(
    player: ExoPlayer,
    play: NativePlay,
    compact: Boolean,
    fullscreen: Boolean,
    onFullscreenChange: (Boolean) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val view = LocalView.current

    DisposableEffect(view) {
        val previous = view.keepScreenOn
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = previous }
    }
    BackHandler(enabled = fullscreen) { onFullscreenChange(false) }

    val surface: @Composable (Modifier) -> Unit = { m ->
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = true
                    /* FIT: never crop, never stretch. Letterbox the frame. */
                    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    setKeepContentOnPlayerReset(true)
                    setShutterBackgroundColor(android.graphics.Color.BLACK)
                    setBackgroundColor(android.graphics.Color.BLACK)
                    setFullscreenButtonClickListener { wantsFullscreen ->
                        onFullscreenChange(wantsFullscreen)
                    }
                }
            },
            modifier = m,
            onRelease = { pv -> pv.player = null }
        )
    }

    Box(modifier.background(Color.Black)) {
        when {
            fullscreen -> {
                Box(Modifier.fillMaxSize()) {
                    surface(Modifier.fillMaxSize())
                    TextButton(
                        onClick = { onFullscreenChange(false) },
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(12.dp)
                            .background(Color(0xB0000000), RoundedCornerShape(8.dp))
                    ) { Text("Exit fullscreen", color = Color.White) }
                }
            }
            compact -> {
                Column(Modifier.fillMaxSize()) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 9f)
                            .background(Color.Black)
                    ) { surface(Modifier.fillMaxSize()) }
                    PlayerInfo(
                        play = play,
                        onBack = onBack,
                        onFullscreen = { onFullscreenChange(true) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            else -> {
                /* Split view on tablets/foldables: player + information pane. */
                Row(Modifier.fillMaxSize()) {
                    Box(
                        Modifier
                            .weight(2f)
                            .fillMaxHeight()
                            .padding(16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .aspectRatio(16f / 9f)
                                .background(Color.Black)
                        ) { surface(Modifier.fillMaxSize()) }
                    }
                    Box(
                        Modifier
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.outline)
                    )
                    PlayerInfo(
                        play = play,
                        onBack = onBack,
                        onFullscreen = { onFullscreenChange(true) },
                        modifier = Modifier.weight(1f)
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayerInfo(
    play: NativePlay,
    onBack: () -> Unit,
    onFullscreen: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier.fillMaxHeight().padding(20.dp)) {
        Text(
            "Now playing",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.secondary
        )
        Spacer(Modifier.height(6.dp))
        Text(
            play.title,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onBackground
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "Streamed through the in-app extraction proxy on 127.0.0.1 - the same " +
                "engine that powers the catalogue, with no external player and no popups.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(20.dp))
        Row {
            Button(onClick = onBack) { Text("Back to catalogue") }
            Spacer(Modifier.width(12.dp))
            TextButton(onClick = onFullscreen) { Text("Fullscreen") }
        }
    }
}

/** Unwraps the activity from a Compose/local wrapper context. */
internal tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
