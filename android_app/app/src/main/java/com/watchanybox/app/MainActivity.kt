package com.watchanybox.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge

/**
 * The whole app is one Compose activity: a Material 3 adaptive shell around the
 * bundled catalogue, the in-process local server (46900) and the embedded Node
 * extraction engine (46901-46903). No splash gate, no PIN, no biometric prompt.
 */
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            WatchAnyBoxTheme {
                WatchAnyBoxApp()
            }
        }
    }
}
