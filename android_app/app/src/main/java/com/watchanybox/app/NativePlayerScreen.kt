package com.watchanybox.app

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
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit

/** A stream handed over from the web player to the native surface. */
data class NativePlay(val url: String, val title: String)

/**
 * Native Media3/ExoPlayer surface. The URL is always the local proxy route
 * (/raw?... or /hls?...) so the embedded engine keeps injecting the right
 * headers upstream. HLS playlists are routed through HlsMediaSource, direct
 * files through ProgressiveMediaSource. Layout is pure aspectRatio + weight.
 */
@Composable
fun NativePlayerScreen(
    play: NativePlay,
    compact: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    val player = remember(play.url) {
        val http = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
        ExoPlayer.Builder(context)
            .setMediaSourceFactory(
                androidx.media3.exoplayer.source.DefaultMediaSourceFactory(
                    DefaultDataSource.Factory(context, OkHttpDataSource.Factory(http))
                )
            )
            .build()
    }

    DisposableEffect(player, play.url) {
        val dataSourceFactory = DefaultDataSource.Factory(
            context,
            OkHttpDataSource.Factory(
                OkHttpClient.Builder()
                    .connectTimeout(15, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .build()
            )
        )
        val item = MediaItem.fromUri(play.url)
        val source = if (play.url.contains("/hls?") || play.url.contains(".m3u8")) {
            HlsMediaSource.Factory(dataSourceFactory).createMediaSource(item)
        } else {
            ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(item)
        }
        player.setMediaSource(source)
        player.playWhenReady = true
        player.prepare()
        onDispose { player.stop() }
    }
    DisposableEffect(player) {
        onDispose { player.release() }
    }

    val surface: @Composable (Modifier) -> Unit = { m ->
        AndroidView(
            factory = { ctx ->
                PlayerView(ctx).apply {
                    this.player = player
                    useController = true
                    setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
                    setBackgroundColor(android.graphics.Color.BLACK)
                }
            },
            modifier = m
        )
    }

    Box(modifier.background(Color.Black)) {
        if (compact) {
            Column(Modifier.fillMaxSize()) {
                Box(
                    Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .background(Color.Black)
                ) { surface(Modifier.fillMaxSize()) }
                PlayerInfo(play = play, onBack = onBack, modifier = Modifier.weight(1f))
            }
        } else {
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
                PlayerInfo(play = play, onBack = onBack, modifier = Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun PlayerInfo(play: NativePlay, onBack: () -> Unit, modifier: Modifier = Modifier) {
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
        Button(onClick = onBack) { Text("Back to catalogue") }
    }
}
