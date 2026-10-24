# ▓ CONTRIBUTING // WATCHANYBOX ▓

> <samp><kbd>CORE: ONLINE</kbd> // <kbd>THREAT:</kbd> <span style="color: #FF0000;">CARELESS PATCHES</span></samp>

Patches that respect the machine get merged. Patches that don't get studied as examples.

## 01 // THE FOUR COMMANDMENTS

These are the project's constitution. Every pull request is tested against them:

- **<kbd>Zero history</kbd>** — no new persistence of viewing, search, or resume activity. If your patch creates a "Continue Watching" row, it has already failed.
- **<kbd>Loopback only</kbd>** — the engine binds to `127.0.0.1:46900–46903`. Nothing you add may open an externally reachable socket.
- **<kbd>Allow-list or nothing</kbd>** — media hosts stay explicitly allow-listed. Ad and tracker hosts stay dead before they load. Your patch must not weaken either direction.
- **<kbd>One player surface</kbd>** — standard playback lives inside the app. External-browser handoff is how Universes that failed ended up.

## 02 // DIRECTIVE: BUILD & VERIFY

```diff
- AN UNTESTED PR IS A THREAT VECTOR. BUILD IT OR WASTE EVERYONE'S TIME.
```

Windows (Electron):

```bash
git clone https://github.com/mohdziauddin2006-cloud/watchanybox.git
cd watchanybox
npm install
npm start          # engine + UI on 127.0.0.1:46900
```

Android (Jetpack Compose):

```bash
cd android_app
./gradlew installDebug       # Windows: .\gradlew.bat installDebug
```

A patch description should read like an incident report: what broke, what the change is, what you verified. Vague prose will be read by a machine and output to nothing.

## 03 // FILING

- **<kbd>SYSTEM FAULT</kbd>** — repro steps, platform, app version, what you watched when it died.
- **<kbd>UPGRADE DIRECTIVE</kbd>** — state the directive and which of the Four Commandments it honors. Moves to persist history, expose the engine, or delegate ad-blocking will be denied.
