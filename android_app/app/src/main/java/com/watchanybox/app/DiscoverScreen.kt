package com.watchanybox.app

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.Locale

/**
 * Native Material 3 "Discover" surface: a LazyVerticalGrid with
 * GridCells.Adaptive that renders real posters from the in-app TMDB proxy
 * (/tmdb/3/trending/all/week). Tapping a card feeds the shared renderer
 * through window.__WAB.openItem, so playback still goes through the exact
 * same extraction pipeline the web catalogue uses.
 */
data class DiscoverItem(
    val id: Int,
    val mediaType: String,
    val title: String,
    val year: String,
    val rating: String,
    val poster: String?
)

object DiscoverRepo {

    fun trending(): List<DiscoverItem> {
        val port = Backend.livePort()
        if (port == 0) throw IOException("Extraction engine is not ready yet")
        val request = Request.Builder()
            .url(Backend.url(port, "/tmdb/3/trending/all/week?language=en-US"))
            .header("Accept", "application/json")
            .build()
        Backend.client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IOException("TMDB proxy returned HTTP ${response.code}")
            val body = response.body?.string() ?: "{}"
            val results: JSONArray = JSONObject(body).optJSONArray("results") ?: JSONArray()
            val out = ArrayList<DiscoverItem>(results.length())
            for (i in 0 until results.length()) {
                val item = results.optJSONObject(i) ?: continue
                val mediaType = when (item.optString("media_type")) {
                    "tv" -> "tv"
                    "movie" -> "movie"
                    else -> continue
                }
                val title = if (mediaType == "tv") item.optString("name") else item.optString("title")
                if (title.isBlank()) continue
                val date = if (mediaType == "tv") item.optString("first_air_date") else item.optString("release_date")
                val posterPath = item.optString("poster_path")
                val rating = item.optDouble("vote_average", 0.0)
                out.add(
                    DiscoverItem(
                        id = item.optInt("id"),
                        mediaType = mediaType,
                        title = title,
                        year = date.take(4),
                        rating = if (rating > 0.0) String.format(Locale.US, "%.1f", rating) else "",
                        poster = if (posterPath.isBlank()) null else "https://image.tmdb.org/t/p/w342$posterPath"
                    )
                )
            }
            return out
        }
    }
}

@Composable
fun DiscoverScreen(
    onPick: (DiscoverItem) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    var items by remember { mutableStateOf<List<DiscoverItem>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshTick by remember { mutableIntStateOf(0) }

    LaunchedEffect(refreshTick) {
        loading = true
        error = null
        try {
            items = withContext(Dispatchers.IO) { DiscoverRepo.trending() }
        } catch (t: Throwable) {
            error = t.message ?: "Could not load Discover"
        }
        loading = false
    }

    Column(modifier.background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                "Discover",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Spacer(Modifier.width(12.dp))
            Text(
                "Trending this week",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.weight(1f))
            if (loading) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
            } else {
                TextButton(onClick = { refreshTick++ }) { Text("Refresh") }
            }
            TextButton(onClick = onBack) { Text("Close") }
        }

        when {
            error != null && items.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        error ?: "",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Spacer(Modifier.height(12.dp))
                    TextButton(onClick = { refreshTick++ }) { Text("Try again") }
                }
            }

            items.isEmpty() && !loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Nothing to show yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 128.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 28.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(items, key = { it.mediaType + "-" + it.id }) { item ->
                    PosterCard(item = item, onPick = onPick)
                }
            }
        }
    }
}

@Composable
private fun PosterCard(item: DiscoverItem, onPick: (DiscoverItem) -> Unit) {
    Card(
        modifier = Modifier.clickable { onPick(item) },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
            ) {
                if (item.poster != null) {
                    AsyncImage(
                        model = item.poster,
                        contentDescription = item.title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(2f / 3f)
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(2f / 3f),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            item.title.take(1).uppercase(),
                            fontSize = 44.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                if (item.rating.isNotEmpty()) {
                    Box(
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .padding(8.dp)
                            .background(Color(0xCC000000), RoundedCornerShape(6.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(item.rating, fontSize = 11.sp, color = Color.White, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                Text(
                    item.title,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    buildString {
                        append(if (item.mediaType == "tv") "Series" else "Movie")
                        if (item.year.isNotBlank()) append(" \u2022 ").append(item.year)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}
