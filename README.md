<div align="center">

<img src="docs/banner.svg" alt="WatchAnyBox — one player, every screen, zero ads" width="100%" />

<h1>WatchAnyBox</h1>

<p><strong>One player. Every screen. Zero ads.</strong><br />
A cross-platform, privacy-first streaming media center for Windows and Android — built on Electron, Jetpack Compose, and a shared embedded Node.js engine.</p>

[![Latest release](https://img.shields.io/github/v/release/mohdziauddin2006-cloud/watchanybox?style=for-the-badge&label=release&color=EC4899&logo=github)](https://github.com/mohdziauddin2006-cloud/watchanybox/releases/latest)
[![Total downloads](https://img.shields.io/github/downloads/mohdziauddin2006-cloud/watchanybox/total?style=for-the-badge&color=A855F7&logo=github)](https://github.com/mohdziauddin2006-cloud/watchanybox/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Android-3B82F6?style=for-the-badge&logo=windows11&logoColor=white)](#downloads)
[![License](https://img.shields.io/badge/license-MIT-22C55E?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Stars](https://img.shields.io/github/stars/mohdziauddin2006-cloud/watchanybox?style=for-the-badge&color=F59E0B&logo=github)](https://github.com/mohdziauddin2006-cloud/watchanybox)
[![Last commit](https://img.shields.io/github/last-commit/mohdziauddin2006-cloud/watchanybox?style=for-the-badge&color=64748B&logo=git)](https://github.com/mohdziauddin2006-cloud/watchanybox/commits/main)

[**Download**](#downloads) · [**Features**](#core-features) · [**Architecture**](#architecture) · [**Quick start**](#developer-quick-start) · [**Privacy**](#privacy-by-design)

</div>

---

WatchAnyBox turns the messy business of streaming into one quiet, native surface. A local extraction engine resolves sources, the player mounts them inside the app, and a network-level shield removes ads, popups, and trackers before they load. Nothing you watch is ever written to disk.

The same engine powers a **portable Windows desktop app** and a **native Android app** that adapts from phone to tablet to desktop-class windows. One catalogue, one player, one consistent experience — no browser handoff, no accounts, no telemetry.

> **No ads. No history. No external browser.** Just the thing you came to watch.

---

## Downloads

<p align="center">
  <a href="https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox.exe">
    <img src="https://img.shields.io/badge/Download_for_Windows-EXE_%C2%B7_x64-EC4899?style=for-the-badge&amp;logo=windows11&amp;logoColor=white" alt="Download WatchAnyBox for Windows" />
  </a>
  &nbsp;&nbsp;
  <a href="https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox.apk">
    <img src="https://img.shields.io/badge/Download_for_Android-APK_%C2%B7_Universal-A855F7?style=for-the-badge&amp;logo=android&amp;logoColor=white" alt="Download WatchAnyBox for Android" />
  </a>
</p>

<p align="center">
  <sub>Latest stable release: <a href="https://github.com/mohdziauddin2006-cloud/watchanybox/releases/tag/v1.0.0"><strong>v1.0.0</strong></a> &nbsp;·&nbsp; Windows 10/11 x64 &nbsp;·&nbsp; Android 7.0+ &nbsp;·&nbsp; <a href="https://github.com/mohdziauddin2006-cloud/watchanybox/releases">all releases</a></sub>
</p>

| Platform | Artifact | Size | Direct download |
|:--|:--|--:|:--|
| 🪟 **Windows** | `WatchAnyBox.exe` — portable, no installer | 246.3 MB | [**Download EXE →**](https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox.exe) |
| 🤖 **Android** | `WatchAnyBox.apk` — universal (arm64-v8a, armeabi-v7a, x86, x86_64) | 133.4 MB | [**Download APK →**](https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox.apk) |
| 🪟 **Windows** | `WatchAnyBox-Windows-x64.zip` — zipped portable bundle | 158.5 MB | [**Download ZIP →**](https://github.com/mohdziauddin2006-cloud/watchanybox/releases/download/v1.0.0/WatchAnyBox-Windows-x64.zip) |

<details>
<summary><strong>Windows — first launch</strong></summary>

1. Download `WatchAnyBox.exe` (or the ZIP bundle).
2. Run it — the app is portable and needs no installer.
3. If SmartScreen appears, choose **More info → Run anyway** (the build is unsigned).
4. The UI is served locally from `http://127.0.0.1:46900`; the extraction engine binds `46901–46903`.

</details>

<details>
<summary><strong>Android — first install</strong></summary>

1. Download `WatchAnyBox.apk` on your device.
2. Allow installs from your browser or file manager when prompted.
3. Open the APK and install. Requires **Android 7.0 (API 24)** or newer.
4. On first launch the embedded engine starts in-process — no account, no setup.

</details>

<details>
<summary><strong>SHA-256 checksums</strong></summary>

| Artifact | SHA-256 |
|:--|:--|
| `WatchAnyBox.exe` | `d56cc1b6a5b5d471f4fc0e32297a7e120849d7d508de50931c9306b25d7759eb` |
| `WatchAnyBox.apk` | `b83ef2a7ba38986b3a2a3efa528ccd11c3b466e8294e4ef89774684d63a0bfea` |
| `WatchAnyBox-Windows-x64.zip` | `096c0827c237000f648c35ce754e871b413bab970456aac54ecbe407f3fa9dc2` |

</details>

---

## Core Features

| | Feature | What it does |
|:--:|:--|:--|
| 🪟🤖 | **Multi-Platform** | A portable Windows EXE and a universal Android APK share the same catalogue, engine, and player behaviour. |
| 🕵️ | **Zero-History Privacy** | No watch history, search log, resume state, or telemetry. Only an optional TMDB key and your metadata language are stored locally. |
| 🗣️ | **Smart Language Priority** | Audio and subtitle tracks are ranked **Hindi → English → original**, automatically, wherever a stream exposes multiple tracks. |
| 🔐 | **Secure Vault** | The 18+ catalogue is compartmentalized behind one dedicated destination, excluded from Home's Super Search and every SFW row — a hard content boundary, intentionally frictionless rather than a PIN gate. |
| 📐 | **Adaptive UI** | Material 3 window size classes switch the Android shell between bottom navigation and a navigation rail; the desktop layout keeps a persistent sidebar. |
| 🛡️ | **Network-Level Ad Shield** | Ad, tracker, popunder, and analytics requests are blocked before they load, in Electron's session layer and inside proxied player pages. Media hosts are allow-listed first. |
| 🔁 | **Silent Source Fallback** | Dead mirrors, Cloudflare challenges, and slow upstreams roll over to the next live provider automatically — one clean "Stream unavailable" overlay only if everything fails. |
| 📡 | **Live TV & Tube** | Dedicated Live TV and ad-free YouTube surfaces live inside the app, with no external-browser handoff and no YouTube chrome. |

---

## Architecture

<p align="center"><sub>One shared extraction engine. Two native shells.</sub></p>

```text
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│  WINDOWS · Electron 44          │     │  ANDROID · Jetpack Compose      │
│  main.js · preload.js           │     │  Material 3 Adaptive shell      │
│  renderer · hls.js              │     │  Media3 ExoPlayer · OkHttp      │
└────────────────┬────────────────┘     └────────────────┬────────────────┘
                 │ 127.0.0.1:46900                        │ 127.0.0.1:46900
                 └───────────────────┬────────────────────┘
                                     ▼
                   ┌───────────────────────────────────────┐
                   │  SHARED ENGINE · srv2.js (Node.js)    │
                   │  extractor · proxy · HLS relay        │
                   │  ad shield · source fallback          │
                   │  127.0.0.1:46901–46903                │
                   └───────────────────────────────────────┘
```

On Windows, `srv2.js` runs directly inside Electron. On Android, the same unmodified engine runs on an **embedded Node.js 22 runtime via Javet**, inside the app process, behind a loopback reverse proxy. No remote backend, no cloud dependency.

### Tech stack

| Layer | Windows | Android | Shared |
|:--|:--|:--|:--|
| **Shell** | Electron 44 | Jetpack Compose + Material 3 | — |
| **UI** | HTML / CSS / JavaScript + hls.js | Adaptive Compose shell + bundled WebView catalogue | Catalogue assets |
| **Player** | HTML5 `<video>` + isolated embeds | Media3 ExoPlayer (HLS + progressive) | — |
| **Engine** | Node.js inside Electron | Node.js 22 via Javet | `srv2.js` |
| **Networking** | Electron session + local HTTP | OkHttp + local reverse proxy | `127.0.0.1:46900–46903` |
| **Privacy** | Zero-history renderer | Zero-history app, `allowBackup=false` | No telemetry |

### Repository map

```text
watchanybox/
├── main.js                  # Electron main process, local server, ad/popup shield
├── preload.js               # Isolated context bridge + in-frame player guards
├── renderer.js              # Catalogue UI, player, Super Search, language engine
├── srv2.js                  # Shared extractor / proxy / HLS relay (ports 46901–46903)
├── sources.js               # Catalogue definitions, vault, Live TV, Tube
├── libraries.js             # Custom-library scrapers
├── index.html · styles.css  # Desktop UI shell
├── hls.min.js               # HLS playback for desktop
├── docs/banner.svg          # Project banner
└── android_app/             # Kotlin · Compose · Material 3 · Media3
    ├── app/src/main/assets/ # Bundled web catalogue + shared engine
    └── app/src/main/java/com/watchanybox/app/
        ├── App.kt · MainActivity.kt
        ├── LocalStreamServer.kt   # Asset server + reverse proxy (:46900)
        ├── NodeBackend.kt         # Embedded Node 22 (Javet)
        ├── Shell.kt               # Adaptive navigation + WebView host
        ├── DiscoverScreen.kt      # Native TMDB grid
        └── NativePlayerScreen.kt  # ExoPlayer surface
```

---

## Privacy by Design

- **Zero history, permanently.** Watch history, searches, resume points, and "continue watching" rows are never written. Legacy keys are purged on boot; only `wab.key` (optional TMDB key) and `wab.lang` (metadata language) persist.
- **Local-first networking.** The UI and engine bind to loopback only — `127.0.0.1` on ports `46900–46903`. Nothing is exposed to your network.
- **No accounts, no telemetry, no analytics.** There is no sign-in, no device fingerprinting, and no usage reporting.
- **Android backup disabled.** `allowBackup="false"` keeps app data out of cloud backups.
- **A real content boundary.** The 18+ vault is a separate destination, absent from Home's Super Search and all safe-for-work rows. Access is intentionally frictionless; it is a segregation boundary, not a PIN lock.
- **Ads blocked before render.** Tracker, popunder, and ad-network requests are denied at the session layer, with media hosts allow-listed so legitimate streams are never caught by the rule set.

---

## Developer Quick-Start

### Prerequisites

| Tool | Version |
|:--|:--|
| **Node.js** | 18+ (Node 22 recommended) |
| **JDK** | 17 (Android build) |
| **Android SDK** | Platform 34 + Build Tools 34.x |
| **Git** | Any recent version |

### 🪟 Windows (Electron)

```bash
git clone https://github.com/mohdziauddin2006-cloud/watchanybox.git
cd watchanybox

npm install
npm start
```

The Electron window loads `http://127.0.0.1:46900`; the extractor starts alongside it on `46901–46903`. There is no separate backend to launch.

### 🤖 Android (Jetpack Compose)

```bash
cd android_app

# Windows PowerShell / CMD
.\gradlew.bat assembleRelease

# macOS / Linux
./gradlew assembleRelease
```

The universal APK is written to:

```text
android_app/app/build/outputs/apk/release/app-universal-release.apk
```

Install it on a connected device:

```bash
adb install -r app/build/outputs/apk/release/app-universal-release.apk
```

For a faster debug loop, use `.\gradlew.bat installDebug` (Windows) or `./gradlew installDebug` (macOS/Linux).

---

## 🤝 Contributing

Focused bug reports and pull requests are welcome. Please keep the project's core guarantees intact:

- **Zero history** — no new persistence of viewing or search activity.
- **Loopback only** — no new externally reachable services.
- **No ad or tracker calls** — media allow-listing stays explicit.
- **One player surface** — no external-browser handoff for standard playback.

Open an issue with reproduction steps, platform, and app version. For larger changes, open an issue first to agree on the approach before writing the patch.

---

## ⚖️ Legal & Content Notice

WatchAnyBox **does not host, store, or distribute media**. It is a local player and proxy interface that resolves streams from third-party sources. All content is provided by those third parties, and users are responsible for accessing only material they are legally permitted to view in their jurisdiction.

The 18+ vault is intended strictly for adults of legal age. Nothing in this repository is legal advice.

---

## 📄 License

Released under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<div align="center">

<sub>Built with ❤️ by <a href="https://github.com/mohdziauddin2006-cloud"><strong>mohdziauddin2006-cloud</strong></a></sub>

<sub>If WatchAnyBox is useful to you, consider giving it a ⭐ — it helps others find the project.</sub>

</div>
