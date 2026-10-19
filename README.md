# WatchAnyBox

<p align="center">
  <img src="https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge" alt="Build status" />
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Android-blue?style=for-the-badge" alt="Platform support" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License" />
  <img src="https://img.shields.io/badge/Electron-44-blueviolet?style=for-the-badge" alt="Electron" />
  <img src="https://img.shields.io/badge/Kotlin-1.9-purple?style=for-the-badge" alt="Kotlin" />
  <img src="https://img.shields.io/badge/ExoPlayer-media3-blue?style=for-the-badge" alt="ExoPlayer" />
</p>

**WatchAnyBox** is a high-performance, cross-platform streaming media center built for **Windows** (Electron) and **Android** (Jetpack Compose + ExoPlayer). It plays video directly in the app window — no external browser, no ad popups, no tracking.

---

## 🎬 Hero

WatchAnyBox is a clean, native streaming surface. One player, one library, zero clutter. Whether you're on a Windows desktop or an Android phone, you get the same ad-free, privacy-first experience with instant fallback between sources — the Android build runs the entire engine on-device behind a localhost server.

### What it is

- **Windows `.exe`** — standalone Electron desktop app (no installer required).
- **Android `.apk`** — Jetpack Compose app with ExoPlayer playback.
- **Privacy by design** — permanent Zero-History mode; nothing you watch or search is ever saved locally.

---

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| 🎬 **Multi-Platform Native Experience** | Standalone Windows `.exe` and a high-performance Android `.apk`, both playing streams in-app. |
| ⚡ **Lightning-Fast SFW Engine** | Optimized 30-second server timeouts with instant fallback and zero-delay streaming. |
| 🔒 **Absolute Privacy** | Permanent Zero-History mode — no local database, no search logging, no watch tracking. |
| 🇮🇳🇬🇧 **Smart Language Priority** | Automatic prioritization for **Hindi (primary)** and **English (secondary)** audio/captions. |
| 🛡️ **18+ Vault** | Adult content isolation behind a single entry — JAV, Eporner, Rule34, MMS, Hentai, AI Video and more; excluded from Home search. |
| 📺 **Dedicated Tube Tab** | Isolated, ad-free YouTube integration inside the app (no full YouTube chrome). |

### Platform highlights

**Windows (Electron)** — `main.js`, `preload.js`, `renderer.js`, `srv2.js`, `libraries.js`, `sources.js`. Aggressive ad/tracker/popup shield, Cloudflare challenge sniffing, per-source referer rewriting, and a single clean player surface.

**Android (Jetpack Compose, Material 3 Adaptive)** — `./android_app/` embeds the full engine (Javet Node 22 + `srv2.js`) in-process behind a localhost server; the Compose shell adapts between a bottom bar, navigation rail and split layouts, with ExoPlayer (media3) playback and zero-history mode.

---

## 🚀 Quick Start

### Windows Desktop

```bash
# Clone the repository
git clone https://github.com/mohdziauddin2006-cloud/watchanybox.git
cd watchanybox

# Install dependencies and run
npm install
npm start
```

The desktop app launches on `http://127.0.0.1:46900` inside an Electron window. A compiled `WatchAnyBox.exe` is provided in the **Releases** section.

### Android

```bash
cd android_app

# Build the release APK (universal, all ABIs)
./gradlew assembleRelease
```

The APK is produced at:
```
android_app/app/build/outputs/apk/release/app-universal-release.apk
```

Install it on your device:

```bash
adb install app-universal-release.apk
```

### Downloads

Pre-built binaries are attached to the **v1.0.0** GitHub Release:

| Artifact | Platform | Direct Download |
|----------|----------|-----------------|
| `WatchAnyBox.apk` | Android (universal) | [WatchAnyBox.apk](https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox.apk) |
| `WatchAnyBox-Windows-x64.zip` | Windows (standalone `WatchAnyBox.exe` bundle) | [WatchAnyBox-Windows-x64.zip](https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox-Windows-x64.zip) |

Or visit: https://github.com/mohdziauddin2006-cloud/watchanybox/releases/tag/v1.0.0

---

## 🏗️ Project Architecture

```
watchanybox/
├── README.md
├── package.json          # Electron desktop manifest
├── main.js               # Electron main process + ad/popup shield
├── preload.js            # Isolated preload bridge (contextIsolation)
├── renderer.js           # UI core + player + SFW engine
├── srv2.js               # Local proxy + extractor (ports 46901–46903)
├── libraries.js          # Custom-library scrapers (data in, items out)
├── sources.js            # Data catalog — providers, rows, 18+ vault, Tube, Live TV
├── index.html            # Desktop UI shell
├── styles.css            # Dark, quiet, ad-free surface
├── hls.min.js            # hls.js for HLS playback
├── WatchAnyBox.apk       # Android build artifact (release, universal)
└── android_app/          # Jetpack Compose + Material 3 Adaptive + ExoPlayer
    ├── build.gradle.kts
    ├── settings.gradle.kts
    ├── release.keystore  # release signing key (watchanybox/watchanybox)
    ├── gradle/
    │   └── wrapper/
    └── app/
        ├── build.gradle.kts
        └── src/main/
            ├── AndroidManifest.xml
            ├── assets/                     # embedded web UI + srv2.js engine
            ├── java/com/watchanybox/app/
            │   ├── App.kt                  # process entry + crash guard
            │   ├── MainActivity.kt         # ComponentActivity + edge-to-edge
            │   ├── Backend.kt              # node-port probe + TLS warm-up
            │   ├── NodeBackend.kt          # Javet Node 22 bootstrap
            │   ├── LocalStreamServer.kt    # :46900 assets + reverse proxy
            │   ├── LocalStreamClientHandler.kt  # raw-socket request handler
            │   ├── Shell.kt                # adaptive shell + WebView host
            │   ├── DiscoverScreen.kt       # native TMDB grid
            │   ├── NativePlayerScreen.kt   # ExoPlayer surface
            │   └── Theme.kt
            └── res/values/
```

---

## 🔒 Privacy & Safety

- **Zero-History mode:** No watch history, search log, or resume state is written to disk. `localStorage` holds only an optional TMDB key and your language choice.
- **18+ Vault:** Adult content lives behind a single sidebar entry and opens without any lock gate. It is excluded from Super Search on Home.
- **Ad shield:** Ad/tracker/popup network requests are blocked at the Electron session level; legitimate media hosts are explicitly allow-listed.
- **No external browser handoff:** Standard sections never launch an external browser for playback — sources mount inside the app window.

---

## 📄 License

MIT License. See `LICENSE` for details.

---

<p align="center">
  Built with ❤️ by <strong>mohdziauddin2006-cloud</strong>
</p>
