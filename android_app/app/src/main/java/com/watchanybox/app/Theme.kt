package com.watchanybox.app

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/* Material 3 colour scheme mirroring the WatchAnyBox catalogue surface:
   near-black background, pink/red accents, quiet outlines. */
private val WatchAnyBoxColors = darkColorScheme(
    primary = Color(0xFFE50914),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFF3A0A10),
    onPrimaryContainer = Color(0xFFFFDAD8),
    secondary = Color(0xFFEC4899),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFF3A0F2A),
    onSecondaryContainer = Color(0xFFFFD6EA),
    background = Color(0xFF07070A),
    onBackground = Color(0xFFE9EEF5),
    surface = Color(0xFF0D0D12),
    onSurface = Color(0xFFE9EEF5),
    surfaceVariant = Color(0xFF15151C),
    onSurfaceVariant = Color(0xFF98A2B3),
    outline = Color(0xFF22222C),
    outlineVariant = Color(0xFF1A1A22),
    error = Color(0xFFFF6B6B)
)

@Composable
fun WatchAnyBoxTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = WatchAnyBoxColors, content = content)
}
