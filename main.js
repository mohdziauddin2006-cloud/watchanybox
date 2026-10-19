/* main.js - WatchAnyBox clean build (Electron main process)
   ----------------------------------------------------------------------------
   1. Static UI server on 127.0.0.1:46900 (skips the proxy range on EADDRINUSE).
   2. Network-level ad / tracker / popup shield: ONE onBeforeRequest listener
      with a media-extension allowlist so legitimate stream hosts are NEVER
      eaten by the rule regex.
   3. Response-header surgery: X-Frame-Options and CSP frame-ancestors are
      stripped from every response, so valid external video players are
      permitted to render inside the application window (no ERR_BLOCKED_BY_RESPONSE).
   4. setWindowOpenHandler -> deny on every web contents: no popups, no
      top-level ad hijacks. will-navigate only ever allows 127.0.0.1/localhost.
   5. One BrowserWindow with an isolated preload bridge.
   The proxy backend (srv2.js) runs alongside on 46901-46903. */
const { app, BrowserWindow, shell, ipcMain, session, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

/* ---------------------------------------------------------------------------
   CRASH / STARTUP INSTRUMENTATION
   A packaged app has no visible terminal: anything thrown before the window
   opens would look like "double-click did nothing". Every boot milestone and
   every uncaught error is therefore written to a persistent log first, then
   surfaced in a native error box. Logging itself can never throw.
   --------------------------------------------------------------------------- */
let LOG_FILE = '';
function pickLogFile() {
  const candidates = [];
  try { candidates.push(path.join(app.getPath('userData'), 'watchanybox.log')); } catch (e) {}
  try {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      candidates.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'WatchAnyBox.log'));
    }
  } catch (e) {}
  try { candidates.push(path.join(path.dirname(process.execPath), 'WatchAnyBox.log')); } catch (e) {}
  try { candidates.push(path.join(os.tmpdir(), 'WatchAnyBox.log')); } catch (e) {}
  for (let i = 0; i < candidates.length; i++) {
    try {
      fs.mkdirSync(path.dirname(candidates[i]), { recursive: true });
      fs.appendFileSync(candidates[i], '');
      return candidates[i];
    } catch (e) {}
  }
  return '';
}
LOG_FILE = pickLogFile();

function logLine(level, message, err) {
  let detail = '';
  if (err) {
    detail = ' :: ' + (err && err.stack ? err.stack : String(err));
  }
  const line = '[' + new Date().toISOString() + '] [' + level + '] ' + message + detail + '\n';
  try { if (LOG_FILE) fs.appendFileSync(LOG_FILE, line); } catch (e) {}
  try { process.stderr.write(line); } catch (e) {}
}

function showFatal(title, message, err) {
  logLine('FATAL', message, err);
  try {
    const detail = err && err.stack ? err.stack : (err ? String(err) : '');
    dialog.showErrorBox(
      'WatchAnyBox - ' + title,
      message + '\n\n' + detail + (LOG_FILE ? '\n\nLog file:\n' + LOG_FILE : '')
    );
  } catch (e) {}
}

process.on('uncaughtException', function (err) {
  showFatal('Crash', 'The application hit an unrecoverable error.', err);
});
process.on('unhandledRejection', function (reason) {
  logLine('ERROR', 'Unhandled promise rejection', reason);
});

app.on('child-process-gone', function (_event, details) {
  try { logLine('ERROR', 'Child process gone: ' + JSON.stringify(details)); } catch (e) {}
});
app.on('render-process-gone', function (_event, _contents, details) {
  try { logLine('ERROR', 'Renderer process gone: ' + JSON.stringify(details)); } catch (e) {}
});
app.on('gpu-process-crashed', function (_event, killed) {
  logLine('ERROR', 'GPU process crashed (killed=' + killed + ')');
});
process.on('exit', function (code) { logLine('INFO', 'Process exit code ' + code); });

logLine('INFO', 'Boot start | version=' + app.getVersion() + ' | electron=' + process.versions.electron +
  ' | node=' + process.versions.node + ' | exe=' + process.execPath + ' | dir=' + __dirname);

app.userAgentFallback =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* Each external site gets its own renderer process: a broken stream page can
   never take the app's own renderer down. Autoplay + timers run unthrottled so
   provider playback and watchdogs stay accurate. */
app.commandLine.appendSwitch('site-per-process');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

/* ---------------------------------------------------------------------------
   EMBEDDED PROXY SERVER (srv2.js)
   It starts both HTTP listeners as a require side effect. A failure there must
   never take the main process down before the UI has a chance to open, so the
   load is isolated and reported instead of escaping to the top level.
   --------------------------------------------------------------------------- */
let proxyError = null;
try {
  require(path.join(__dirname, 'srv2.js'));
  logLine('INFO', 'srv2.js loaded; proxy listeners requested on 46901-46903');
} catch (err) {
  proxyError = err;
  logLine('ERROR', 'srv2.js failed to initialise', err);
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.avif': 'image/avif', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.vtt': 'text/vtt; charset=utf-8', '.srt': 'text/plain; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg'
};

let win = null;
const PROXY_PORTS = [46901, 46902, 46903];
function nextStaticPort(port) {
  let p = port + 1;
  while (PROXY_PORTS.indexOf(p) !== -1) p++;
  return p;
}

function srtToVtt(t) {
  if (/^\s*WEBVTT/.test(t)) return t;
  return 'WEBVTT\n\n' + t.replace(/\r/g, '').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

function startServer(port) {
  return new Promise(function (resolve, reject) {
    const srv = http.createServer(function (req, res) {
      /* Subtitle proxy (srt -> vtt) for anything that hands the player a plain srt. */
      if (req.url.indexOf('/sub?') === 0) {
        const i = req.url.indexOf('url=');
        fetch(decodeURIComponent(req.url.slice(i + 4)))
          .then(function (r) { return r.text(); })
          .then(function (t) {
            res.writeHead(200, { 'Content-Type': 'text/vtt; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(srtToVtt(t));
          })
          .catch(function () { res.writeHead(502); res.end('WEBVTT\n\n'); });
        return;
      }
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      if (p === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: true, app: 'WatchAnyBox', pid: process.pid, port: port, versions: process.versions.electron }));
        return;
      }
      const file = path.join(__dirname, p);
      fs.readFile(file, function (err, data) {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.on('error', function (e) {
      if (e.code === 'EADDRINUSE') startServer(nextStaticPort(port)).then(resolve, reject);
      else reject(e);
    });
    srv.listen(port, '127.0.0.1', function () { resolve(srv.address().port); });
  });
}

/* ---------------------------------------------------------------------------
   AGGRESSIVE AD & POPUP SHIELD
   One regex covers every known ad network, tracker, popunder farm and generic
   ad-serving path. Real media files are explicitly allow-listed BEFORE the
   regex runs, so a legitimate stream host can never be blocked by accident.
   --------------------------------------------------------------------------- */
const AD_BLOCK_RE = new RegExp([
  'doubleclick', 'googlesyndication', 'googleadservices', 'google-analytics', 'googletagmanager', 'adservice',
  'exoclick', 'exosrv', 'exdynsrv', 'realsrv', 'magsrv', 'juicyads', 'trafficjunky', 'trafficstars', 'trafficfactory',
  'popads', 'popcash', 'propellerads', 'adsterra', 'hilltopads', 'clickadu', 'clickaine', 'onclickads',
  'tsyndicate', 'mgid', 'outbrain', 'taboola', 'adnxs', 'criteo', 'pubmatic', 'rubiconproject', 'openx',
  'smartadserver', 'adform', 'amazon-adsystem', 'admaven', 'adspyglass', 'adcash', 'adroll', 'adtrue', 'adyoulike',
  'adnium', 'adplugg', 'adpushup', 'adriver', 'bidswitch', 'casalemedia', 'districtm', 'gumgum', 'inmobi',
  'loopme', 'nativeads', 'onetag', 'sharethrough', 'smaato', 'sonobi', 'spotx', 'teads', 'tremor', 'triplelift',
  'unrulymedia', 'vidazoo', 'viqeo', 'yieldmo', 'zergnet', 'revcontent', 'histats', 'statcounter',
  'quantserve', 'scorecardresearch', 'clckd', 'afu\\.php', 'wwdme', 'popunder', 'preroll',
  'adserver', 'adsbygoogle', 'vast\\.xml', 'vpaid', 'adtng',
  'youtube\\.com\\/api\\/stats\\/ads', 'youtube\\.com\\/pagead', 'youtube\\.com\\/ptracking',
  'youtube\\.com\\/api\\/stats\\/qoe', 'youtube\\.com\\/get_midroll_info', 'youtubei\\/v1\\/log_event'
].join('|'), 'i');

const MEDIA_ALLOW_RE = /\.(mp4|m3u8|ts|m4v|webm|mpd|vtt|srt|key)(\?|#|$)/i;

function isBlockedUrl(u) {
  if (!u) return false;
  const s = String(u);
  /* NEVER block the app's own local servers. */
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(s)) return false;
  /* NEVER block YouTube's actual media CDN or poster CDN. The ad regex only
     targets YouTube's ad/telemetry paths, never googlevideo itself. */
  if (/^https?:\/\/[^/]*(googlevideo\.com|ytimg\.com|youtube-nocookie\.com\/embed)/i.test(s)) return false;
  /* NEVER block real media files - ads almost never wear a media extension,
     while legitimate stream hosts always do. */
  if (MEDIA_ALLOW_RE.test(s)) return false;
  try { return AD_BLOCK_RE.test(s); } catch (e) { return false; }
}

function hardenContents(contents) {
  try {
    contents.setWindowOpenHandler(function () { return { action: 'deny' }; });
    contents.on('will-navigate', function (event, navigationUrl) {
      try {
        const parsed = new URL(navigationUrl);
        if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') return;
      } catch (e) {}
      event.preventDefault();
    });
  } catch (e) {}
}

/* Cloudflare challenge sniff: Electron's own network stack sees every
   subframe response, so a challenged embed (403/503 + cf-mitigated, or a
   turnstile challenge-platform load) is reported to the renderer BEFORE the
   user could ever stare at "Verifying you are not a robot". The renderer
   silently drops that provider and mounts the next candidate. */
function cfSniff(details, why) {
  try {
    if (!win || win.isDestroyed() || !win.webContents) return;
    const chain = [];
    let f = details.frame;
    for (let i = 0; f && i < 5; i++) {
      try { if (f.url) chain.push(String(f.url).slice(0, 200)); } catch (e) {}
      f = f.parent;
    }
    win.webContents.send('wab:cf', {
      u: String(details.url || '').slice(0, 240),
      c: chain,
      s: details.statusCode || 0,
      w: why || '',
      t: Date.now()
    });
  } catch (e) {}
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1460, height: 920, minWidth: 1000, minHeight: 640,
    backgroundColor: '#08080c', autoHideMenuBar: true, title: 'Watch AnyBox',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      /* The preload also runs inside every direct player iframe - that is how
         a cross-origin embed's dead-media text ("We couldnt find that") and
         media progress reach the app without any DOM privileges. Nothing is
         ever exposed to those frames: the subframe branch only READS its own
         DOM and postMessages tiny statuses up. */
      nodeIntegrationInSubFrames: true,
      /* External sources play inside sandboxed iframes fed by the local /page
         proxy; the shell session needs DOM storage, mixed content and
         per-source user agents without ever sharing the app's renderer. */
      webSecurity: false, allowRunningInsecureContent: true,
      backgroundThrottling: false, domStorageEnabled: true
    }
  });
  const appUrl = 'http://127.0.0.1:' + port + '/index.html';
  logLine('INFO', 'Creating window for ' + appUrl);
  win.once('ready-to-show', function () {
    if (!win || win.isDestroyed()) return;
    win.show();
    logLine('INFO', 'Window ready-to-show; visible=' + win.isVisible());
  });
  win.loadURL(appUrl).catch(function (err) {
    showFatal('UI failed to load', 'The local UI server did not answer at ' + appUrl, err);
  });
  hardenContents(win.webContents);

  win.webContents.on('did-finish-load', function () {
    logLine('INFO', 'UI finished loading: ' + appUrl);
  });
  win.webContents.on('did-fail-load', function (_e, code, desc, failedUrl, isMainFrame) {
    logLine('ERROR', 'did-fail-load code=' + code + ' desc=' + desc + ' url=' + failedUrl + ' main=' + isMainFrame);
    if (isMainFrame) {
      showFatal('UI failed to load',
        'The window could not load ' + failedUrl + '\nError ' + code + ': ' + desc, null);
    }
  });
  win.webContents.on('console-message', function (_e, level, message) {
    if (level >= 2) logLine('RENDERER', String(message || '').slice(0, 2000));
  });
  win.on('closed', function () { logLine('INFO', 'Window closed'); win = null; });

  /* Self-heal: if the app's own renderer ever dies or wedges, reload it
     automatically instead of leaving a black unresponsive window. An
     embedded player frame dying is NOT the app renderer - probe liveness
     first so a dead iframe never interrupts the app. */
  let lastHeal = 0;
  win.webContents.on('render-process-gone', function (_e, details) {
    logLine('ERROR', 'Renderer gone: ' + JSON.stringify(details || {}));
    const now = Date.now();
    if (now - lastHeal < 10000) return;
    lastHeal = now;
    setTimeout(function () {
      if (!win || win.isDestroyed()) return;
      Promise.race([
        win.webContents.executeJavaScript('1+1', true).catch(function () { throw new Error('dead'); }),
        new Promise(function (_z, rej) { setTimeout(function () { rej(new Error('wedged')); }, 4000); })
      ]).then(function () {}).catch(function () {
        try { win.webContents.reload(); } catch (e) {}
      });
    }, 600);
  });
}

app.whenReady().then(function () {
  try { app.setAppUserModelId('com.watchanybox.desktop'); } catch (e) {}
  logLine('INFO', 'app ready');

  if (proxyError) {
    showFatal('Proxy engine failed',
      'The embedded streaming engine (srv2.js) did not start. The UI will open, but playback will not work.',
      proxyError);
  }

  session.defaultSession.setPermissionRequestHandler(function (_wc, _perm, cb) { cb(true); });

  /* ONE listener (Electron keeps only the last attached per event). */
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, function (d, cb) {
    try {
      /* Cloudflare's benign js-detection assets ship under .../jsd/... paths
         (scripts/jsd/main.js, h/b/scripts/jsd/<hash>, jsd/oneshot) on NORMAL
         pages - never a challenge. Real interstitials load orchestrated
         /cdn-cgi/challenge-platform/h/... assets or the challenge iframe. */
      const u = String(d.url || '');
      if (!/\/jsd\//i.test(u) && /cloudflare|cdn-cgi/i.test(u) &&
          (/challenges\.cloudflare\.com\/cdn-cgi\//i.test(u) || /cdn-cgi\/challenge-platform\/h\//i.test(u) || /cf_chl_/i.test(u))) cfSniff(d, 'turnstile');
    } catch (e) {}
    cb({ cancel: isBlockedUrl(d.url) });
  });

  session.defaultSession.webRequest.onBeforeSendHeaders(function (d, cb) {
    try {
      d.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
    } catch (e) {}
    cb({ requestHeaders: d.requestHeaders });
  });

  /* Framing fix: strip X-Frame-Options and CSP frame-ancestors from EVERY
     response. Valid external players are then allowed to render inside the
     app's iframes instead of failing with ERR_BLOCKED_BY_RESPONSE.
     CRITICAL: every header set is rebuilt from scratch as arrays of clean
     non-empty strings. Feeding Chromium a header value that is empty or
     contains CR/LF/NUL fails its IPC validation and TERMINATES THE RENDERER
     with "bad IPC message" - so scrub or drop anything questionable and
     ignore the whole response header set on any doubt. */
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, function (d, cb) {
    try {
      const st = d.statusCode || 0;
      if (st === 403 || st === 503) {
        const hh = d.responseHeaders || {};
        let mit = '';
        Object.keys(hh).forEach(function (k) {
          const lk = k.toLowerCase();
          const v = Array.isArray(hh[k]) ? hh[k][0] : hh[k];
          if (lk === 'cf-mitigated') mit = String(v || '');
        });
        /* ONLY an explicit cf-mitigated: challenge is a real block. A plain
           "server: cloudflare" subframe is just a CF-hosted page - nhplayer,
           missav pages etc. live behind CF and must still be mountable. */
        if (/challenge/i.test(mit)) cfSniff(d, 'hdr' + st);
      }
    } catch (e) {}
    const out = {};
    try {
      const h = d.responseHeaders || {};
      Object.keys(h).forEach(function (k) {
        let vals = h[k];
        if (vals == null) return;
        if (!Array.isArray(vals)) vals = [String(vals)];
        const lk = k.toLowerCase();
        if (lk === 'x-frame-options') return;              /* drop entirely */
        vals = vals.map(function (v) {
          v = String(v);
          if (lk === 'content-security-policy' || lk === 'content-security-policy-report-only') {
            v = v.replace(/frame-ancestors[^;]*(;|$)/gi, '').replace(/;;+/g, ';').trim();
          }
          return v.replace(/[\r\n\u0000]/g, '');
        }).filter(function (v) { return v.length > 0; });
        if (vals.length) out[k] = vals;
      });
    } catch (e) {
      return cb({});                                       /* unmodified on doubt */
    }
    cb({ responseHeaders: out });
  });

  /* Hotlink-protected media CDNs (rule34video, the eporner signed CDNs,
     missav's surrit, hentaicity, nhplayer/1hanime...) accept a file only when
     the Referer belongs to the site they serve for. Media elements played
     straight from this 127.0.0.1 page send ours (or none) - rewrite it for
     media traffic only. */
  const REF_FOR = [
    [/\.eporner\.com$|\.twinrdengine\.com$/i, 'https://www.eporner.com/'],
    [/\.fourhoi\.com$|\.surrit\.com$|\.missav\.[a-z]+$/i, 'https://missav.ws/'],
    [/\.hentaicity\.com$/i, 'https://www.hentaicity.com/'],
    [/\.1hanime\.com$|\.nhplayer\.com$/i, 'https://nhplayer.com/'],
    [/\.rule34video\.com$/i, 'https://rule34video.com/'],
    [/\.xbooru\.com$/i, 'https://xbooru.com/'],
    [/\.googlevideo\.com$/i, 'https://www.youtube.com/'],
    [/\.huangguo\.chat$|\.huangguodrama\.ai$/i, 'https://huangguodrama.ai/']
  ];
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, function (d, cb) {
    try {
      const u = d.url || '';
      const isMedia = d.resourceType === 'media' || /\.(mp4|webm|m4v|mov|ts|m4s|mpd|m3u8|key|bin)(\?|#|$)/i.test(u);
      if (isMedia && /^https?:/i.test(u) && !/^https?:\/\/(127\.0\.0\.1|127\.0\.0\.2|localhost)(:|\/)/i.test(u)) {
        const h = d.requestHeaders || {};
        const cur = h['Referer'] || h['referer'] || '';
        if (!cur || /(127\.0\.0\.1|127\.0\.0\.2|localhost)/i.test(cur)) {
          let o = '';
          try {
            const m = new URL(u);
            for (let i = 0; i < REF_FOR.length; i++) {
              if (REF_FOR[i][0].test(m.hostname)) { o = REF_FOR[i][1]; break; }
            }
            if (!o) o = m.origin + '/';
          } catch (e) {}
          if (o) h['Referer'] = o;
          return cb({ requestHeaders: h });
        }
      }
    } catch (e) {}
    cb({});
  });

  /* Cloudflare clearance sync: after the browser itself solves a challenge
     (MissAV warmup), the cookies are pushed to the Node proxy so server-side
     grabs of the same host return real pages instead of a challenge. */
  const CK_HOSTS = [
    'missav.ws', 'missav.ai', 'missav123.com', 'fourhoi.com', 'surrit.com',
    'hentaicity.com', 'hentai.tv', 'nhplayer.com',
    'kdramasmaza.net', 'katmoviehd.pk', 'xmaal.in', 'animixplay.la'
  ];
  function pushClearance() {
    CK_HOSTS.forEach(function (h) {
      try {
        session.defaultSession.cookies.get({ domain: h }).then(function (list) {
          if (!list || !list.length) return;
          const str = list.map(function (c) { return c.name + '=' + c.value; }).join('; ');
          fetch('http://127.0.0.1:46901/ck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ host: h, cookie: str })
          }).catch(function () {});
        }).catch(function () {});
      } catch (e) {}
    });
  }
  setTimeout(pushClearance, 9000);
  setInterval(pushClearance, 25000);

  startServer(46900).then(function (port) {
    logLine('INFO', 'Static UI server listening on 127.0.0.1:' + port);
    createWindow(port);
  }).catch(function (err) {
    showFatal('Local server failed', 'Could not start the local UI server.', err);
    app.quit();
  });
}).catch(function (err) {
  showFatal('Startup failed', 'Electron could not finish its startup sequence.', err);
  app.quit();
});

ipcMain.handle('open-external', function (_e, url) { return shell.openExternal(url); });

/* Deny popups + external navigation for EVERY web contents ever created
   (main window, future windows, any guest frames). */
app.on('web-contents-created', function (_event, contents) { hardenContents(contents); });

app.on('window-all-closed', function () { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', function () { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
