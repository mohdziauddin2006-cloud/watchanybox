// srv2.js - WatchAnyBox local proxy + extractor (ports 46901-46903)
const http = require('http');
const { Readable } = require('stream');
const { URL } = require('url');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PORTS = [46901, 46902, 46903];
let LIVE_PORT = PORTS[0];
let ALT_OK = false;

/* Injected into every /page-proxied streaming source. Runs INSIDE the player
   iframe and adds what the renderer cannot reach cross-origin: silent popup/ad
   blocking, same-domain link routing, overlay sweep, scroll-to-player and a
   clean fullscreen trigger. */
const ENHANCER = `(function(){
  if (window.__zaiEnhancer) return; window.__zaiEnhancer = 1;
  var AD = /(doubleclick|googlesyndication|googleadservices|adservice|exoclick|juicyads|trafficjunky|popads|propellerads|adsterra|hilltopads|popcash|clickadu|realsrv|magsrv|tsyndicate|onclickads|mgid|outbrain|taboola|adnxs|criteo|pubmatic|rubiconproject|openx|smartadserver|adform|amazon-adsystem|admaven|adspyglass|adcash|adroll|clckd|afu\\.php|wwdme|adtng)/i;
  var ADCLS = /(^|[^a-z])(ad|ads|advert|advertisement|popup|popunder|overlay|banner|sponsor|preroll|interstitial)([^a-z]|$)/i;
  window.open = function(){ return null; };
  function pick(){ return document.querySelector('video') || document.querySelector('iframe[allowfullscreen]') || document.querySelector('iframe[src]'); }
  function enterFullscreen(){
    try{
      var el = pick();
      if(el){ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){ el.scrollIntoView(); } }
      if(document.fullscreenElement){ if(document.exitFullscreen) document.exitFullscreen(); }
      else if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
      return true;
    }catch(e){ return false; }
  }
  window.__appEnterFullscreen = enterFullscreen;
  function sweep(){
    try{
      var n = document.querySelectorAll('div,ins,iframe,a,section');
      for(var i=0;i<n.length;i++){
        var e = n[i];
        if(e.__zaiAd) continue;
        var cls = (e.className && e.className.toString) ? e.className.toString() : '';
        var id = e.id || '';
        var src = e.getAttribute ? (e.getAttribute('src')||'') : '';
        if(/^https?:/i.test(src) && AD.test(src)){ e.style.display='none'; e.__zaiAd=1; continue; }
        var marker = id + ' ' + cls;
        if(marker && ADCLS.test(marker)){ e.style.display='none'; e.__zaiAd=1; }
      }
    }catch(e){}
  }
  document.addEventListener('click',function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
    if(!a) return;
    var h = a.getAttribute('href') || '';
    if(!h) return;
    e.preventDefault(); e.stopPropagation();
    var abs; try{ abs = new URL(h, location.href); }catch(x){ return; }
    if(AD.test(abs.href)) return;
    if(abs.host === location.host){ location.href = abs.href; }
  },true);
  function button(){
    if(document.getElementById('__zaiFsBt')) return;
    var b = document.createElement('div'); b.id = '__zaiFsBt'; b.textContent = '\\u26F6'; b.title = 'Fullscreen';
    b.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147483647;width:38px;height:38px;border-radius:50%;background:rgba(10,10,16,.8);color:#fff;font:18px/38px system-ui;text-align:center;cursor:pointer;border:1px solid rgba(255,255,255,.25);opacity:.35;transition:opacity .2s';
    b.onmouseenter = function(){ b.style.opacity = '1'; }; b.onmouseleave = function(){ b.style.opacity = '.35'; };
    b.onclick = function(ev){ try{ ev.preventDefault(); ev.stopPropagation(); }catch(e){} enterFullscreen(); };
    (document.body || document.documentElement).appendChild(b);
  }
  function nudge(){
    try{
      var v = document.querySelector('video');
      if(v){
        if(v.paused){ var p = v.play(); if(p && p.catch) p.catch(function(){}); }
        if(!v.paused) return true;
      }
      var b = document.querySelector('.vjs-big-play-button,.jw-display-icon-container,[class*="big-play"],[class*="play-btn"],[class*="playButton"],.play-button,.play_button,#play,.btn-play,.p-pulse,button[aria-label*="lay" i]');
      if(b && !b.__zaiClicked){ b.__zaiClicked = 1; b.click(); }
    }catch(e){}
    return false;
  }
  var nt=0, nv=setInterval(function(){ nt++; if(nudge() || nt>22) clearInterval(nv); },700);
  /* Dead-content watchdog: a player page that never gets a <video> playing
     and shows "We couldnt find that"/"not found" text tells the app so, and
     the app silently rotates to the next provider. Never fires while any
     video is actually playing. */
  var DT=0, dv=setInterval(function(){
    DT++;
    try{
      var pv = document.querySelector('video');
      if(pv && !pv.paused && pv.currentTime > 0.5){ return; }
      var tx = (document.body && document.body.innerText || '').slice(0, 2500);
      if(tx && /we\\s*could\\s*n['\\u2019]?t\\s*find\\s*that|couldn['\\u2019]?t\\s*find\\s*that|media\\s+not\\s+found|not\\s+found\\s+in\\s+our|no\\s+(playable|streaming)\\s+(source|stream|server)|stream\\s+not\\s+found|video\\s+not\\s+found|source\\s+(not\\s+found|unavailable)/i.test(tx)){
        clearInterval(dv);
        try{ if(window.parent && window.parent !== window) window.parent.postMessage({__zaiDead:1},'*'); }catch(e){}
      }
      /* A Cloudflare / anti-bot screen or a denied-access page left sitting
         without any video running is dead weight too - report it so the app
         rotates silently instead of leaving a verification screen up. */
      if(DT>15 && tx && /just\\s*a\\s*moment|checking\\s+your\\s+browser|verify\\s+you\\s+are\\s+human|verifying\\s+that\\s+you\\s+are\\s+not\\s+a\\s+robot|access\\s+denied|enable\\s+javascript\\s+and\\s+cookies|attention\\s+required|ddos\\s+protection/i.test(tx)){
        clearInterval(dv);
        try{ if(window.parent && window.parent !== window) window.parent.postMessage({__zaiDead:1},'*'); }catch(e){}
      }
    }catch(e){}
    if(DT>20) clearInterval(dv);
  },800);
  /* Media reporter: while this page's own <video> actually runs, report its
     state to the app every second (the frame is cross-origin to the app, so
     this is the only live progress signal). "null" says nothing is running. */
  var MR=0, mr=setInterval(function(){
    MR++;
    try{
      var v = document.querySelector('video');
      var d = (v && !v.paused && v.currentTime > 0.2)
        ? { rs: v.readyState, ct: Math.round((v.currentTime||0)*100)/100, paused: !!v.paused, w: v.videoWidth||0 }
        : null;
      if(window.parent && window.parent !== window) window.parent.postMessage({__zaiMedia:d},'*');
    }catch(e){}
    if(MR>600) clearInterval(mr);
  },1000);
  window.addEventListener('load',function(){ sweep(); button(); nudge(); setTimeout(sweep,1500); setTimeout(sweep,4000); });
  setInterval(sweep, 2500);
  var t=0, iv=setInterval(function(){ t++; if(pick()){ clearInterval(iv); button(); setTimeout(sweep,600); } if(t>25) clearInterval(iv); },500);
})();`;

// Baked-in TMDB v3 key (same one the renderer falls back to).
const TMDB_KEY = '3104601db7b49ab8140edd482412445a';

const AD_RE = /(doubleclick|googlesyndication|googleadservices|adservice|exoclick|juicyads|trafficjunky|popads|propellerads|adsterra|hilltopads|popcash|clickadu|realsrv|magsrv|tsyndicate|onclickads|mgid|outbrain|taboola|adnxs|criteo|pubmatic|rubiconproject|openx|smartadserver|adform|amazon-adsystem|admaven|adspyglass|adcash|adroll|clckd|afu\.php|wwdme|adtng)/i;
/* Cloudflare challenge pages are never shown to a user: a page/grab that
   comes back as a challenge is either treated as a failed provider (rotated
   silently) or replaced with a black auto-close page. NOTE: the bare string
   "challenge-platform" also appears on NORMAL pages (the benign
   /cdn-cgi/challenge-platform/scripts/jsd/main.js bot-detection snippet), so
   only the orchestrated challenge path counts. */
const CF_RE = /just a moment|checking your browser|enable javascript and cookies|cf-chl|__cf_chl|cf_chl_opt|attention required|verify you are human|performing security verification|verifies you are not a bot|security service to protect|ddos protection|challenge-platform\/h\//i;
function isCfChallenge(status, body) {
  const b = String(body || '').slice(0, 4000);
  if (!b) return status === 403 || status === 503;
  if (CF_RE.test(b)) return true;
  if ((status === 403 || status === 503) && /cloudflare|<title>\s*(403|503|error)/i.test(b)) return true;
  return false;
}
/* Served through /page or /mv when the upstream is a blocked/challenge page:
   a black frame that tells the app "this source is dead" so it rotates to the
   next provider without ever painting a verification screen. */
const CF_DEAD_PAGE = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{background:#000;margin:0;height:100%}</style></head><body><script>(function(){function s(){try{if(window.parent&&window.parent!==window)window.parent.postMessage({__zaiDead:1},"*");}catch(e){}}s();setTimeout(s,400);setTimeout(s,1600);})();</scr' + 'ipt></body></html>';

/* ---------------------------------------------------------------------------
   DIRECT SOURCE-TO-APP NATIVE STREAM EXTRACTION (pure functions).
   --------------------------------------------------------------------------- */

/* Custom library sources. Cards that carry one of these hosts are ALWAYS
   resolved here on the backend - they never fall back to a server scanner. */
const CUSTOM_SRC_RE = /(katmoviehd|kdramasmaza|xmaal|zmaal|animixplay|missav|hentaicity|hentai\.tv|nhplayer|1hanime|huangguodrama)/i;

/* Never surfaced to the player: advertising, popup, tracker and widget frames. */
const JUNK_FRAME_RE = /(doubleclick|googlesyndication|googleadservices|google-analytics|googletagmanager|facebook|twitter\.com\/intent|platform\.twitter|amazon-adsystem|adnxs|histats|yandex|vk\.com\/share|addthis|sharethis|disqus|outbrain|taboola|mgid|zergnet|criteo|pubmatic|rubicon|openx|smartadserver|teads|triplelift|sharethrough|smaato|inmobi|loopme)/i;

const MEDIA_EXT_RE = /\.(?:mp4|m3u8|webm|m4v|mpd)(?:[?#]|$)/i;

/* Only these services are DRM-walled (no scrapable stream): resolving the
   title on TMDB is the only useful answer for them, and ONLY for them. */
const DRM_RE = /(mxplayer|hotstar|primevideo|amazon\.|minitv|sonyliv|zee5|jiocinema|netflix|disneyplus)/i;

function absUrl(u, base){
  if (!u) return '';
  /* HTML-encoded query separators: &amp; and the numeric &#038; (xmaal/CDN
     pages write signed URLs that way). Left undecoded, the '#' starts a URL
     fragment and the signature params vanish -> guaranteed 403. */
  let s = String(u).replace(/\\\//g, '/').replace(/\\u002F/gi, '/').replace(/&amp;/g, '&').replace(/&#0*38;/gi, '&').trim();
  if (s.charAt(0) === '/' && s.charAt(1) === '/') s = 'https:' + s;
  if (/^(?:data|blob|about|javascript|mailto|tel):/i.test(s)) return '';
  try { return new URL(s, base || undefined).href; } catch (e) { return ''; }
}

/* Find the raw stream (or the single cleanest player iframe) inside a fetched
   page. A real <video>/<source> tag or an escaped JSON "file":"x.m3u8" always
   wins over a generic iframe, so an ad iframe can never shadow the media. */
function findMedia(html, base){
  /* Several embed pages JSON-escape EVERY slash ("https:\/\/host\/x.mp4",
     "\u002F"). Normalizing first lets all the plain regexes below match
     instead of silently yielding nothing. */
  html = String(html).replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
  const cands = [];
  const push = function (u) {
    const a = absUrl(u, base);
    /* The Eporner hotlink "not available" clip and friends are never media. */
    if (a && MEDIA_EXT_RE.test(a) && cands.indexOf(a) < 0 && !AD_RE.test(a) && !EP_STUB_RE.test(a)) cands.push(a);
  };
  let m;
  const tagRe = /<(?:video|source|audio)[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = tagRe.exec(html))) push(m[1]);
  const jsonRe = /["'](?:file|src|source|url|contentUrl|hls|playlist|videoUrl|video_url|stream|stream_url|mp4|m3u8|sd|hd)["']\s*:\s*["']([^"']{6,700})["']/gi;
  while ((m = jsonRe.exec(html))) push(m[1]);
  const bareEsc = /https?:(?:\\\/|\/){2}[^"'\s<>\\]+?\.(?:mp4|m3u8|webm|m4v)(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = bareEsc.exec(html))) push(m[0]);
  const bare = /https?:\/\/[^"'\s<>\\]+?\.(?:mp4|m3u8|webm|m4v)(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = bare.exec(html))) push(m[0]);
  const dataRe = /data-(?:src|file|video|video-src|stream|hls|mp4|url)\s*=\s*["']([^"']+)["']/gi;
  while ((m = dataRe.exec(html))) push(m[1]);

  const hls = cands.filter(function (u) { return /\.m3u8/i.test(u); })[0];
  if (hls) return { type: 'hls', file: hls };
  /* Candidate order is significant: a <source>/<video> tag URL is what the
     site's own player uses (and plays in Chromium with the Referer rewrite).
     Signed JSON-LD twins (xmaal/boldmaal) carry a 1h S3 signature that is
     usually ALREADY EXPIRED in the served page - never prefer them. */
  const mp4 = cands.filter(function (u) { return /\.(?:mp4|webm|m4v)/i.test(u); })[0];
  if (mp4) return { type: 'direct', file: mp4 };

  /* No raw media: isolate the exact player iframe, stripping site chrome,
     navigation and every tracker frame that surrounds it. */
  let best = '';
  const ifr = html.match(/<iframe[^>]+src=["']([^"']+)["']/gi) || [];
  for (let i = 0; i < ifr.length; i++) {
    const sm = ifr[i].match(/src=["']([^"']+)["']/i);
    if (!sm) continue;
    const a = absUrl(sm[1], base);
    if (!a || AD_RE.test(a) || JUNK_FRAME_RE.test(a)) continue;
    if (/(embed|player|video|watch|stream|iframe)/i.test(a)) return { type: 'embed', embed: a };
    if (!best) best = a;
  }
  if (best) return { type: 'embed', embed: best };
  return null;
}

/* Huangguo Drama: every /en/video/<id>/ page embeds the first episode as a
   plain MP4 (JSON-LD contentUrl and the player's data-media-backup-src).
   Return that file directly - the full site (games, novels, ads, chrome)
   never enters a player frame. */
function hgResolve(html, pageUrl) {
  const t = String(html || '').replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
  const pool = [];
  const add = function (u) {
    const a = absUrl(u, pageUrl);
    if (!a || !/\.mp4(?:\?|#|$)/i.test(a) || AD_RE.test(a)) return;
    if (pool.indexOf(a) < 0) pool.push(a);
  };
  let m;
  const tagRe = /<(?:video|source)[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = tagRe.exec(t))) add(m[1]);
  const dataRe = /data-(?:media-backup-src|src|file|video-src)\s*=\s*["']([^"']+)["']/gi;
  while ((m = dataRe.exec(t))) add(m[1]);
  const jsonRe = /["'](?:contentUrl|contentURL|videoUrl|video_url|file|src|url)["']\s*:\s*["']([^"']{8,900})["']/gi;
  while ((m = jsonRe.exec(t))) add(m[1]);
  const bare = /https?:\/\/[^"'\s<>\\]+?\.mp4(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = bare.exec(t))) add(m[0]);
  if (!pool.length) return null;
  const ep = pool.filter(function (u) { return /drama-episodes|\/episodes?\//i.test(u); })[0];
  return { type: 'direct', file: ep || pool[0], source: 'huangguodrama' };
}

/* ---------------------------------------------------------------------------
   YouTube (Innertube search + public Invidious/Piped stream resolution).
   The YouTube player endpoint is currently bot-gated; these public mirrors
   still expose real progressive MP4 URLs. Search never needs an API key.
   --------------------------------------------------------------------------- */
const YT_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const YT_CLIENT = { clientName: 'WEB', clientVersion: '2.20260101.00.00', hl: 'en', gl: 'US' };
const YT_STREAM_CACHE = new Map();
const YT_SEARCH_CACHE = new Map();
const YT_INVIDIOUS = [
  'https://invidious.f5.si',
  'https://invidious.private.coffee',
  'https://invidious.privacyredirect.com',
  'https://inv.nadeko.net',
  'https://yewtu.be'
];
const YT_PIPED = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de'
];

async function fetchJSONUrl(u, ms, headers) {
  const ctl = new AbortController();
  const tm = setTimeout(function () { ctl.abort(); }, ms || 12000);
  try {
    const r = await fetch(u, { headers: Object.assign({ 'User-Agent': UA, 'Accept': 'application/json' }, headers || {}), signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) return null;
    const body = await r.text();
    if (!body || body.trim().charAt(0) === '<') return null;
    return JSON.parse(body);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(tm);
  }
}

async function ytInnertube(endpoint, body, ms) {
  const ctl = new AbortController();
  const tm = setTimeout(function () { ctl.abort(); }, ms || 12000);
  try {
    const r = await fetch('https://www.youtube.com/youtubei/v1/' + endpoint + '?key=' + YT_KEY + '&prettyPrint=false', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': YT_CLIENT.clientVersion
      },
      body: JSON.stringify(body),
      signal: ctl.signal
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(tm);
  }
}

function ytText(o) {
  if (!o) return '';
  if (o.simpleText) return String(o.simpleText);
  if (Array.isArray(o.runs)) return o.runs.map(function (x) { return x.text || ''; }).join('');
  return '';
}

function ytVideos(root) {
  const out = [], seen = {};
  const walk = function (o) {
    if (!o || typeof o !== 'object') return;
    if (o.videoRenderer && o.videoRenderer.videoId && !seen[o.videoRenderer.videoId]) {
      const v = o.videoRenderer;
      seen[v.videoId] = 1;
      out.push({
        id: v.videoId,
        title: ytText(v.title),
        duration: ytText(v.lengthText),
        views: ytText(v.viewCountText),
        channel: ytText(v.ownerText)
      });
    }
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) walk(o[i]); return; }
    for (const k in o) {
      if (k !== 'videoRenderer' && Object.prototype.hasOwnProperty.call(o, k)) walk(o[k]);
    }
  };
  walk(root);
  return out;
}

function ytProxy(u, ref) {
  return 'http://127.0.0.1:' + LIVE_PORT + '/raw?url=' + encodeURIComponent(u) + '&ref=' + encodeURIComponent(ref || 'https://www.youtube.com/');
}

async function ytSearch(q, limit) {
  const term = String(q || '').trim();
  if (!term) return [];
  const ck = term.toLowerCase() + ':' + (limit || 30);
  const hit = YT_SEARCH_CACHE.get(ck);
  if (hit && Date.now() - hit.t < 180000) return hit.items;
  const j = await ytInnertube('search', { context: { client: YT_CLIENT }, query: term }, 14000);
  const items = ytVideos(j).slice(0, limit || 30);
  if (items.length) YT_SEARCH_CACHE.set(ck, { t: Date.now(), items: items });
  if (YT_SEARCH_CACHE.size > 60) { const now = Date.now(); for (const [k, v] of YT_SEARCH_CACHE) { if (now - v.t > 300000) YT_SEARCH_CACHE.delete(k); } }
  return items;
}

async function ytTrending(limit) {
  const j = await ytInnertube('browse', { context: { client: YT_CLIENT }, browseId: 'FEtrending' }, 14000);
  let items = ytVideos(j);
  if (!items.length) items = await ytSearch('trending videos', limit || 30);
  return items.slice(0, limit || 30);
}

function ytFirst(items) {
  return new Promise(function (resolve) {
    let left = items.length, done = false;
    if (!left) return resolve(null);
    items.forEach(function (p) {
      Promise.resolve(p).then(function (v) {
        if (!done && v && v.url) { done = true; resolve(v); }
        if (--left === 0 && !done) resolve(null);
      }, function () {
        if (--left === 0 && !done) resolve(null);
      });
    });
  });
}

async function ytStream(id) {
  const vid = String(id || '').trim();
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(vid)) return { ok: false, error: 'bad id' };
  const hit = YT_STREAM_CACHE.get(vid);
  if (hit && Date.now() - hit.t < 420000) return hit.v;

  /* Race every public resolver in parallel. Sequential fallbacks made a single
     slow mirror delay the player for 10s+; first clean progressive MP4 wins. */
  const tasks = [];
  YT_PIPED.forEach(function (h) {
    tasks.push((async function () {
      const j = await fetchJSONUrl(h + '/streams/' + encodeURIComponent(vid), 8000);
      if (!j) return null;
      const vids = (j.videoStreams || []).filter(function (v) {
        return v && v.url && /video\/mp4/i.test(v.mime || '') && v.videoOnly === false;
      });
      const best = vids.filter(function (v) { return /360p|480p|720p/i.test(v.quality || ''); })[0] || vids[0];
      return best && best.url ? { ok: true, type: 'direct', url: best.url, proxy: ytProxy(best.url, 'https://piped.video/'), source: 'piped', title: j.title || '' } : null;
    })());
  });
  YT_INVIDIOUS.forEach(function (h) {
    tasks.push((async function () {
      const j = await fetchJSONUrl(h + '/api/v1/videos/' + encodeURIComponent(vid), 8000);
      if (!j) return null;
      const fs = (j.formatStreams || []).filter(function (v) { return v && v.url && /video\/mp4/i.test(v.type || ''); });
      const best = fs.filter(function (v) { return /360p|480p|720p/i.test(v.qualityLabel || ''); })[0] || fs[0];
      if (best && best.url) return { ok: true, type: 'direct', url: best.url, proxy: ytProxy(best.url, 'https://www.youtube.com/'), source: 'invidious', title: j.title || '' };
      if (j.hlsUrl) return { ok: true, type: 'hls', url: j.hlsUrl, proxy: 'http://127.0.0.1:' + LIVE_PORT + '/hls?url=' + encodeURIComponent(j.hlsUrl) + '&ref=' + encodeURIComponent('https://www.youtube.com/'), source: 'invidious-hls', title: j.title || '' };
      return null;
    })());
  });
  let out = await ytFirst(tasks);
  if (!out) {
    const embed = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(vid) + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&iv_load_policy=3';
    out = { ok: true, type: 'embed', url: embed, source: 'youtube-nocookie' };
  }
  YT_STREAM_CACHE.set(vid, { t: Date.now(), v: out });
  if (YT_STREAM_CACHE.size > 80) { const now = Date.now(); for (const [k, v] of YT_STREAM_CACHE) { if (now - v.t > 600000) YT_STREAM_CACHE.delete(k); } }
  return out;
}

/* KatMovieHD (fmovie theme): movie pages expose a `var Servers = {...}` blob
   holding the TMDB/IMDB ids; series pages expose data-load-embed buttons with
   season/episode. Both are routed into the app's TMDB provider pool, where a
   real stream is guaranteed to surface. */
function katRoute(html, title) {
  const t = String(html || '');
  const m = t.match(/var\s+Servers\s*=\s*(\{[\s\S]{20,2400}?\});/);
  if (m) {
    try {
      const S = JSON.parse(m[1]);
      if (S && (S.id || S.imdb_id)) {
        return { ok: true, type: 'tmdb', tmdb: String(S.id || ''), imdb: String(S.imdb_id || ''), mt: 'movie', season: 1, episode: 1, title: title || '', source: 'katmoviehd' };
      }
    } catch (e) {}
  }
  const s = t.match(/data-load-embed=["'](\d+)["']/i);
  if (s) {
    const se = (t.match(/data-load-season=["'](\d+)["']/i) || [])[1] || 1;
    const ep = (t.match(/data-load-episode=["'](\d+)["']/i) || [])[1] || 1;
    return { ok: true, type: 'tmdb', tmdb: s[1], imdb: '', mt: 'tv', season: Number(se) || 1, episode: Number(ep) || 1, title: title || '', source: 'katmoviehd' };
  }
  return null;
}

/* Eporner: the page markup only exposes a dead gvideo URL. The live streams
   sit behind /xhr/video/<vid>?hash=<t>, where <t> is the page's 32-hex hash
   with each 8-char chunk re-encoded to base36 and concatenated - exactly what
   their own player JS computes.
   SESSION CONTINUITY: the watch page also hands out Set-Cookie headers, and
   the signed MP4 CDN answers anything without that exact session with a stub
   clip ("only available on Eporner"). Cookies are captured here and replayed
   on EVERY byte-range request by the local /ep twin below. */
const EP_SESS = new Map(); // vid -> { cookie, file, t }
const EP_STUB_RE = /(?:static\.eporner\.com\/na\.mp4|\/na\.mp4|(?:^|[\/_.-])(?:stub|dummy|placeholder|not[_-]?available)(?:[\/_.-]|$))/i;

/* True while an Eporner session entry is fresh enough to replay. */
function epSession(vid) {
  const s = EP_SESS.get(String(vid || ''));
  return (s && Date.now() - s.t < 1800000) ? s : null;
}

/* A response that is NOT the real signed video: the static "not available"
   stub redirect, a hard denial, or a WAF/HTML page. Those must never reach the
   native player - the session is refreshed and the request replayed instead. */
function epIsStubResponse(r) {
  if (!r) return true;
  try {
    if (r.status === 403 || r.status === 410 || r.status === 451) return true;
    if (EP_STUB_RE.test(String(r.url || ''))) return true;
    const ct = String(r.headers.get('content-type') || '');
    if (ct && !/^(?:video|audio)\//i.test(ct) && !/octet-stream|mp4|mpegurl|dash/i.test(ct)) return true;
  } catch (e) { return false; }
  return false;
}

/* Fresh sign for one Eporner video: re-enters the exact /xhr/video path with a
   NEW session, so the local /ep twin always has a live cookie + signed URL. */
async function epSessionRefresh(vid) {
  try {
    const got = await epornerSources('https://www.eporner.com/embed/' + encodeURIComponent(String(vid || '')) + '/', '');
    return (got && got.file) ? got.file : '';
  } catch (e) { return ''; }
}

function epCookieMerge(prev, setCookies) {
  const jar = new Map();
  String(prev || '').split(';').forEach(function (p2) {
    const kv = p2.trim();
    if (!kv) return;
    const i = kv.indexOf('=');
    if (i > 0) jar.set(kv.slice(0, i), kv.slice(i + 1));
  });
  (setCookies || []).forEach(function (sc) {
    const first = String(sc || '').split(';')[0].trim();
    if (!first) return;
    const i = first.indexOf('=');
    if (i > 0) jar.set(first.slice(0, i), first.slice(i + 1));
  });
  return Array.from(jar.entries()).map(function (e2) { return e2[0] + '=' + e2[1]; }).join('; ');
}

async function epFetch(url, referer, cookies, ms, ajax) {
  const ctl = new AbortController();
  const tm = setTimeout(function () { ctl.abort(); }, ms || 6000);
  const h = {
    'User-Agent': UA,
    'Accept': ajax ? 'application/json, text/javascript, */*; q=0.01' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': referer || 'https://www.eporner.com/'
  };
  if (ajax) h['X-Requested-With'] = 'XMLHttpRequest';
  if (cookies) h['Cookie'] = cookies;
  try {
    const r = await fetch(url, { headers: h, redirect: 'follow', signal: ctl.signal });
    let sc = [];
    try {
      sc = (typeof r.headers.getSetCookie === 'function') ? r.headers.getSetCookie()
         : [r.headers.get('set-cookie')].filter(Boolean);
    } catch (e2) { sc = []; }
    const body = await r.text();
    return { ok: r.ok, status: r.status, body: body, setCookies: sc };
  } catch (e2) {
    return { ok: false, status: 0, body: '', setCookies: [] };
  } finally {
    clearTimeout(tm);
  }
}

async function epornerSources(pageUrl, html) {
  try {
    const vidM = pageUrl.match(/\/embed\/([A-Za-z0-9]+)/i) || pageUrl.match(/video-([A-Za-z0-9]+)/i) ||
                 String(html || '').match(/EP\.video\.player\.vid\s*=\s*'([^']+)'/);
    const vid = vidM && vidM[1];
    if (!vid) return null;
    /* The client aborts /extract at 13s. Bound all retries under that cap so a
       stalled mirror cannot eat the whole click window. */
    const epDeadline = Date.now() + 11000;
    const epBudget = function (cap) { return Math.max(1200, Math.min(cap, epDeadline - Date.now())); };

    /* 1. Session continuity: the watch page is what sets the cookies the
          signed stream CDN checks. A recent session is reused when present. */
    let cookie = '';
    const prev = EP_SESS.get(vid);
    if (prev && Date.now() - prev.t < 1800000) cookie = prev.cookie || '';
    let md5 = html ? ((html.match(/EP\.video\.player\.hash\s*=\s*'([0-9a-f]{32})'/i) || [])[1] || '') : '';
    if (!cookie || !md5) {
      const w = await epFetch('https://www.eporner.com/video-' + vid + '/', 'https://www.eporner.com/', cookie, epBudget(5500));
      if (w && w.setCookies && w.setCookies.length) cookie = epCookieMerge(cookie, w.setCookies);
      if (w && w.ok && w.body) {
        md5 = md5 || ((w.body.match(/EP\.video\.player\.hash\s*=\s*'([0-9a-f]{32})'/i) || [])[1] || '');
        if (!html) html = w.body;
      }
    }

    /* 2. The embed page also carries the hash (and more Set-Cookie hops).
          Eporner occasionally squashes one embed request while still serving
          the next, so two fresh attempts are made. */
    for (let attempt = 0; !md5 && attempt < 2 && Date.now() < epDeadline - 1000; attempt++) {
      const r = await epFetch('https://www.eporner.com/embed/' + vid + '/' + (attempt ? '?_=' + Date.now() : ''), 'https://www.eporner.com/', cookie, epBudget(5000));
      if (r && r.setCookies && r.setCookies.length) cookie = epCookieMerge(cookie, r.setCookies);
      md5 = (String(r && r.body || '').match(/EP\.video\.player\.hash\s*=\s*'([0-9a-f]{32})'/i) || [])[1] || '';
      if (!md5) await new Promise((r2) => setTimeout(r2, 200));
    }
    if (!md5 && Date.now() < epDeadline - 2500) {
      try {
        const ar = await epFetch('https://www.eporner.com/api/v2/video/id/?id=' + encodeURIComponent(vid) + '&format=json', 'https://www.eporner.com/', cookie, epBudget(4000), true);
        if (ar && ar.setCookies && ar.setCookies.length) cookie = epCookieMerge(cookie, ar.setCookies);
        let aj = null;
        try { aj = ar && ar.ok ? JSON.parse(ar.body) : null; } catch (e2) {}
        if (aj && aj.url && Date.now() < epDeadline - 1200) {
          const pr = await epFetch(aj.url, 'https://www.eporner.com/', cookie, epBudget(4000));
          if (pr && pr.setCookies && pr.setCookies.length) cookie = epCookieMerge(cookie, pr.setCookies);
          md5 = (String(pr && pr.body || '').match(/EP\.video\.player\.hash\s*=\s*'([0-9a-f]{32})'/i) || [])[1] || '';
        }
      } catch (e2) {}
    }
    if (!md5) return null;
    if (cookie) {
      EP_SESS.set(vid, { cookie: cookie, t: Date.now() });
      if (EP_SESS.size > 120) { const now = Date.now(); for (const [k, v2] of EP_SESS) { if (now - v2.t > 1800000) EP_SESS.delete(k); } }
    }

    /* 3. The player's own XHR: base36 hash, AJAX headers, session cookie. */
    const tk = [0, 1, 2, 3].map(function (i) { return parseInt(md5.substr(i * 8, 8), 16).toString(36); }).join('');
    const xUrl = 'https://www.eporner.com/xhr/video/' + vid + '?hash=' + tk +
      '&domain=www.eporner.com&pixelRatio=1&playerWidth=0&playerHeight=0&fallback=false&embed=true' +
      '&supportedFormats=hls,dash,h265,vp9,av1,mp4&_=' + Date.now();
    let j = null;
    for (let attempt = 0; !j && attempt < 2 && Date.now() < epDeadline; attempt++) {
      const xr = await epFetch(xUrl + (attempt ? '&r=' + Date.now() : ''), 'https://www.eporner.com/', cookie, epBudget(4500), true);
      if (xr && xr.setCookies && xr.setCookies.length) { cookie = epCookieMerge(cookie, xr.setCookies); EP_SESS.set(vid, { cookie: cookie, t: Date.now() }); }
      if (xr && xr.ok) {
        try {
          const parsed = JSON.parse(xr.body);
          if (parsed && parsed.available !== false && parsed.sources) j = parsed;
        } catch (e2) {}
      }
      if (!j) await new Promise((r2) => setTimeout(r2, 250));
    }
    if (!j) return null;

    /* 4. Dummy / stub URLs are never surfaced - a stub means the CDN wants a
          session we do not have, which the /ep twin now always carries. */
    const mp4 = j.sources.mp4 || {};
    let pick = '';
    const order = ['720p HD', '720p', '480p', '360p', '1080p HD', '1080p', '240p'];
    for (let i = 0; i < order.length; i++) {
      const v = mp4[order[i]];
      if (v && v.src && !EP_STUB_RE.test(v.src)) { pick = v.src; break; }
    }
    if (!pick) { for (const k in mp4) { const v = mp4[k]; if (v && v.src && !EP_STUB_RE.test(v.src)) { pick = v.src; break; } } }
    if (pick) {
      /* The live session (cookie + its current signed file) is kept so the
         local /ep twin can replay BOTH on every byte-range request - and can
         re-sign once when the CDN decides the signature aged out. */
      EP_SESS.set(vid, { cookie: cookie, file: pick, t: Date.now() });
      return { type: 'direct', file: pick, epv: vid, ref: 'https://www.eporner.com/', source: 'eporner-xhr' };
    }
    const hls = j.sources.hls || {};
    const hv = hls['auto'] || hls[Object.keys(hls)[0]];
    if (hv && hv.src && !EP_STUB_RE.test(hv.src)) {
      EP_SESS.set(vid, { cookie: cookie, file: hv.src, t: Date.now() });
      return { type: 'hls', file: hv.src, ref: 'https://www.eporner.com/', source: 'eporner-xhr' };
    }
    return null;
  } catch (e) { return null; }
}

/* Dean Edwards packer unpacker - MissAV hides its real stream URL inside an
   eval(function(p,a,c,k,e,d)) blob; unpack it back to plain JS text. */
function unpackEval(t) {
  const m = String(t || '').match(/eval\(function\(p,a,c,k,e,d\)[\s\S]{0,120}?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/);
  if (!m) return '';
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const a = parseInt(m[2], 10) || 36, c = parseInt(m[3], 10) || 0, k = m[4].split('|');
  let i = c;
  while (i--) {
    if (k[i]) { try { p = p.replace(new RegExp('\\b' + i.toString(a) + '\\b', 'g'), k[i]); } catch (e) {} }
  }
  return p;
}

/* MissAV video pages: the surrit.com HLS playlist lives in the packed blob. */
function missavStream(html) {
  let src = String(html || '');
  if (src.indexOf('eval(function(p,a,c,k,e,d)') >= 0) {
    const un = unpackEval(src);
    if (un) src = un;
  }
  const m = src.match(/https?:\/\/surrit\.com\/[a-z0-9-]+\/playlist\.m3u8/i) ||
            src.match(/https?:\/\/[^"'\s<>\\]*surrit[^"'\s<>\\]*\.m3u8[^"'\s<>\\]*/i);
  return m ? m[0].replace(/\\\//g, '/') : '';
}

/* TMDB id resolution used only when a page exposes no stream at all (DRM
   sources such as MX Player / Amazon miniTV). preferTv biases K-drama/Chinese
   drama pages (which are series) and prefers an EXACT title match. */
async function tmdbByTitle(rawTitle, preferTv){
  const cleanTitle = (rawTitle || '').replace(/\b(download|watch|online|hindi|dubbed|dual audio|720p|1080p|season\s*\d+|s\d+|episodes?\s*\d+.*)\b/gi, '').replace(/[-_:]/g, ' ').trim();
  if (!cleanTitle) return null;
  const want = cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const asks = preferTv ? ['tv', 'multi'] : ['multi'];
  for (let a = 0; a < asks.length; a++) {
    try {
      const r = await grab('https://api.themoviedb.org/3/search/' + asks[a] + '?api_key=' + TMDB_KEY + '&query=' + encodeURIComponent(cleanTitle), undefined, undefined, undefined, 9000);
      if (!r || !r.ok) continue;
      const j = await r.json();
      const pool = ((j && j.results) || []).filter(function (x) {
        if (!x || x.adult) return false;
        if (asks[a] === 'tv') return true;
        return x.media_type === 'tv' || x.media_type === 'movie';
      });
      const norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
      const first = pool.find(function (x) { return norm(x.name || x.title) === want; }) || pool[0];
      if (!first) continue;
      return { tmdb: first.id, type: first.media_type || (asks[a] === 'tv' ? 'tv' : 'movie'), title: first.title || first.name || rawTitle,
               year: (first.release_date || first.first_air_date || '').slice(0, 4),
               poster: first.poster_path ? ('https://image.tmdb.org/t/p/w342' + first.poster_path) : '' };
    } catch (e) {}
  }
  return null;
}

/* Promise list -> first result carrying a `.file`, or null when all miss.
   Late answers are dropped; the losing resolvers finish harmlessly. */
function firstNonNull(ps) {
  return new Promise(function (resolve) {
    let done = 0;
    const total = ps.length;
    if (!total) { resolve(null); return; }
    ps.forEach(function (p) {
      Promise.resolve(p).then(function (v) {
        if (v && v.file) resolve(v);
        else if (++done === total) resolve(null);
      }, function () { if (++done === total) resolve(null); });
    });
  });
}

/* The real title of a library page: JSON-LD keywords first, then the slug. */
function kdTitleFrom(html, url, rawTitle) {
  let title = '';
  const kw = String(html || '').match(/"keywords"\s*:\s*"([^"]{3,90})"/i);
  if (kw) title = kw[1].replace(/&amp;/g, '&').trim();
  if (!title) {
    try {
      const seg = (new URL(url).pathname.replace(/\/+$/, '').split('/').pop() || '');
      const stop = /^(dubbed|hindi|urdu|in|drama|dramas|korean|chinese|taiwanese|turkish|thai|japanese|philippines|spanish|english|eng|sub|online|watch|hd|free)$/i;
      const parts = seg.split('-').filter(Boolean);
      while (parts.length && stop.test(parts[parts.length - 1])) parts.pop();
      if (parts.length >= 2) title = parts.join(' ');
    } catch (e) {}
  }
  if (!title) title = String(rawTitle || '');
  return title;
}

/* Same title on HindiDrama: search, pick the closest slug and resolve its
   watch page through the standard host race. This is the reliable native
   mirror for titles whose kdramasmaza file mirrors are dead or x265-only. */
async function hindidramaFallback(title) {
  const t = String(title || '').trim();
  if (!t || !/[a-z]{3}/i.test(t)) return null;
  try {
    const s = await grab('https://hindidrama.net/search.php?search=' + encodeURIComponent(t), 'https://hindidrama.net/', undefined, undefined, 10000);
    if (!s || !s.ok) return null;
    const sh = await s.text();
    const links = [];
    const re = /["']((?:https?:\/\/hindidrama\.net)?\/hindi-dubbed-online\/watch-[^"']+)["']/gi;
    let m;
    while ((m = re.exec(sh))) {
      const u = /^https?:/i.test(m[1]) ? m[1] : 'https://hindidrama.net' + m[1];
      if (links.indexOf(u) < 0) links.push(u);
    }
    if (!links.length) return null;
    const words = t.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) { return w.length > 3; });
    const score = function (u) { const s2 = u.toLowerCase(); let n = 0; words.forEach(function (w) { if (s2.indexOf(w) >= 0) n++; }); return n; };
    links.sort(function (a, b) { return score(b) - score(a); });
    for (let i = 0; i < links.length && i < 3; i++) {
      if (!words.length || score(links[i]) === 0) break;
      const p = await grab(links[i], 'https://hindidrama.net/', undefined, undefined, 10000);
      if (!p || !p.ok) continue;
      const hd = await hdResolve(links[i], await p.text());
      if (hd && hd.file) { hd.title = t; return hd; }
    }
  } catch (e) {}
  return null;
}

/* Shared title cache around the HindiDrama chain: the staggered provider
   race asks for the SAME title from up to three candidates at once - the
   search runs once and every racer awaits the same promise. Results (and
   misses) live for five minutes. */
const HINDI_TITLE = new Map();
function hindidramaCached(title) {
  const key = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!key) return Promise.resolve(null);
  const hit = HINDI_TITLE.get(key);
  if (hit) {
    if (hit.p) return hit.p;
    if (Date.now() - hit.t < 300000) return Promise.resolve(hit.v);
  }
  const p = hindidramaFallback(title).then(function (v) {
    HINDI_TITLE.set(key, { t: Date.now(), v: v || null });
    return v;
  }).catch(function () { HINDI_TITLE.delete(key); return null; });
  HINDI_TITLE.set(key, { t: Date.now(), p: p });
  if (HINDI_TITLE.size > 80) { const now = Date.now(); for (const [k2, v2] of HINDI_TITLE) { if (now - v2.t > 300000) HINDI_TITLE.delete(k2); } }
  return p;
}

/* KDramasMaza: the drama page links to its own "All Episodes" archive on
   kdramasmaza.com.pk, which lists the episode file hosts per episode
   (Dyarlinks -> real StreamTape MP4, HubCloud -> file mirrors...). That chain
   races the same title on HindiDrama - whichever yields a live native stream
   first wins. Only when both miss does the TMDB provider race answer (never
   the raw site page). */
async function kdRoute(html, url, rawTitle) {
  const t0 = Date.now();
  const left = function () { return 30000 - (Date.now() - t0); };
  const title = kdTitleFrom(html, url, rawTitle);
  const jobs = [];
  /* A) kdramasmaza's own file mirrors. */
  jobs.push((async function () {
    try {
      const t = String(html || '');
      let arch = (t.match(/https?:\/\/kdramasmaza\.com\.pk\/archives\/\d+/i) || [])[0] || '';
      if (!arch) { const m = t.match(/["'](https?:\/\/[^"']*\/archives\/\d+[^"']*)["']/i); if (m) arch = m[1]; }
      if (!arch) return null;
      const ar = await grab(arch, url, undefined, undefined, Math.max(6000, Math.min(12000, left())));
      if (!ar || !ar.ok) return null;
      const ah = await ar.text();
      const found = [];
      const re = /https?:\/\/[^"'\s<>]*?(dyarlinks\.[a-z]+\/file\/[A-Za-z0-9]+|hubcloud\.[a-z.]+\/drive\/[A-Za-z0-9]+|gdflix\.[a-z]+\/file\/[A-Za-z0-9]+|new1\.drivehub\.dad\/file\/[0-9]+)/gi;
      let m;
      while ((m = re.exec(ah))) {
        /* The regex captures host+path; rebuild an absolute URL. */
        const full = 'https://' + m[1];
        if (found.indexOf(full) < 0) found.push(full);
      }
      const rank = function (u) { return /dyarlinks\./i.test(u) ? 0 : (/hubcloud\./i.test(u) ? 1 : (/drivehub\./i.test(u) ? 2 : 3)); };
      found.sort(function (a, b) { return rank(a) - rank(b); });
      const seen = {};
      for (let i = 0; i < found.length && i < 6; i++) {
        if (left() < 8000) break;
        const u = found[i];
        let host = '';
        try { host = new URL(u).hostname; } catch (e) {}
        if (seen[host]) continue;
        seen[host] = 1;
        const media = await streamHostResolve(u);
        if (media && media.file) { media.title = rawTitle || ''; return media; }
      }
    } catch (e) {}
    return null;
  })());
  /* B) The same title on HindiDrama. */
  jobs.push(hindidramaFallback(title));
  const first = await firstNonNull(jobs);
  if (first) return Object.assign({ ok: true }, first);
  /* C) Last resort: TMDB provider race (still never the raw site page). */
  if (!title || !/[a-z]{3}/i.test(title)) return null;
  const t2 = await tmdbByTitle(title, true);
  if (!t2) return null;
  return { ok: true, type: 'tmdb', tmdb: String(t2.tmdb), imdb: '', mt: t2.type === 'movie' ? 'movie' : 'tv',
           season: 1, episode: 1, title: t2.title || rawTitle || '', source: 'kdramasmaza' };
}

/* HindiDrama (K-Drama tab): watch pages carry an episode strip whose
   data-src points at the site's own /embed/tvshow_srv server-switcher page.
   That switcher is NEVER mounted (it paints a Change-Server button). We read
   its server table and resolve a real stream instead: Streamtape's decoy-token
   page -> 302 tapecontent.mp4, or the vidhide/morencius eval-packed HLS.
   Both resolve HERE, so the app only ever receives mp4/m3u8. */
function hdServers(embedHtml) {
  const out = [], seen = {};
  const re = /case\s*(\d+)\s*:\s*(?:src|url)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(embedHtml))) {
    const u = m[2].replace(/&amp;/g, '&').trim();
    if (!u || seen[u]) continue;
    seen[u] = 1;
    out.push({ id: Number(m[1]) || 0, url: u });
  }
  if (!out.length) {
    const rx = /https?:\/\/[^"'\s<>]*\/(?:e|embed|v)\/[A-Za-z0-9_-]+/g;
    while ((m = rx.exec(embedHtml))) {
      if (seen[m[0]]) continue;
      seen[m[0]] = 1;
      out.push({ id: 0, url: m[0] });
    }
  }
  return out;
}

/* Streamtape hides decoy tokens; only one of them answers with the 302 to the
   tapecontent CDN. Try each until a Location appears. NOTE: the page answers a
   FOREIGN referer (hindidrama etc.) with a connection reset - only the site's
   own origin works, so that is what we send. */
async function hdStreamtape(stpUrl) {
  const deadline = Date.now() + 30000;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ms = Math.max(5000, Math.min(10000, deadline - Date.now()));
      const r = await grab(stpUrl, 'https://streamtape.com/', undefined, undefined, ms);
      if (r && r.ok) {
        const html = await r.text();
        const id = (html.match(/get_video\?id=([A-Za-z0-9]+)/) || [])[1];
        const expires = (html.match(/[?&]expires=(\d+)/) || [])[1] || '';
        const ip = (html.match(/[?&]ip=([A-Za-z0-9]+)/) || [])[1] || '';
        const toks = Array.from(new Set((html.match(/token=([A-Za-z0-9]{8,30})/g) || []).map((s) => s.slice(6))));
        if (id && toks.length) {
          /* Only one decoy token answers; it is usually the last one. Probe
             all four in parallel instead of walking a shrinking budget. */
          const locs = await Promise.all(toks.map(async (tk) => {
            try {
              const q = 'https://streamtape.com/get_video?id=' + id + '&expires=' + expires + '&ip=' + ip + '&token=' + tk;
              const g = await fetch(q, {
                headers: { 'User-Agent': UA, Referer: 'https://streamtape.com/' },
                redirect: 'manual', signal: AbortSignal.timeout(10000)
              });
              return g.headers.get('location') || '';
            } catch (e) { return ''; }
          }));
          const loc = locs.find((x) => x && /tapecontent|streamtape/i.test(x));
          if (loc) return loc.replace(/^\/\//, 'https://');
        }
      }
    } catch (e) {}
    if (Date.now() > deadline - 8000) break;
  }
  return '';
}

/* morencius = vidhide: the player config is eval-packed; unpacking it yields
   the signed HLS playlist. The CDN regularly serves a playlist URL that is
   already dead (or stalls), so the URL is PROBED before it may win a race -
   a broken Vidhide answer must never shadow a working StreamTape/Vidara. */
async function hdVidhide(embedUrl) {
  const ref = 'https://morencius.com/';
  try {
    const r = await grab(embedUrl, ref, undefined, undefined, 10000);
    if (!r || !r.ok) return '';
    const un = unpackEval(await r.text());
    const m = (un || '').match(/https?:\/\/[^"'\s<>\\]+?\.m3u8[^"'\s<>\\]*/i);
    if (!m) return '';
    const file = m[0].replace(/&amp;/g, '&');
    try {
      const p = await fetch(file, { headers: { 'User-Agent': UA, 'Referer': ref, 'Accept': '*/*' }, signal: AbortSignal.timeout(8000) });
      if (!p.ok) return '';
      const body = await p.text();
      if (!/#EXTM3U/i.test(body)) return '';
    } catch (e) { return ''; }
    return file;
  } catch (e) {}
  return '';
}

/* Any other file host: most use the same packed player template, so scan the
   page (after unpacking) for a real HLS/MP4 URL before giving up. One fast
   retry absorbs a transient CDN hiccup; the referer follows the actual embed
   page instead of being hardwired to hindidrama. */
async function hdGeneric(embedUrl, referer) {
  const ref = referer || 'https://hindidrama.net/';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await grab(embedUrl, ref, undefined, undefined, 10000);
      if (!r || !r.ok) return null;
      const raw = await r.text();
      const src = unpackEval(raw) || raw;
      const m3 = src.match(/https?:\/\/[^"'\s<>\\]+?\.m3u8[^"'\s<>\\]*/i);
      if (m3) return { type: 'hls', file: m3[0].replace(/&amp;/g, '&') };
      const mp = src.match(/https?:\/\/[^"'\s<>\\]+?\.(?:mp4|webm)[^"'\s<>\\]*/i);
      if (mp) return { type: 'direct', file: mp[0].replace(/&amp;/g, '&') };
      if (r.ok) break;
    } catch (e) {}
  }
  return null;
}

/* Vidara player: the embed page holds only a filecode; the real HLS playlist
   comes from its own /api/stream endpoint (POST filecode+device+codecs). */
async function vidaraStream(embedUrl) {
  const m = String(embedUrl || '').match(/vidara\.[a-z]+\/e\/([A-Za-z0-9]+)/i);
  if (!m) return null;
  try {
    const r = await fetch('https://vidara.to/api/stream', {
      method: 'POST',
      headers: {
        'User-Agent': UA, 'Referer': embedUrl, 'Origin': 'https://vidara.to',
        'Content-Type': 'application/json', 'Accept': 'application/json'
      },
      body: JSON.stringify({ filecode: m[1], device: 'web', codecs: ['av1', 'h265'] }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j.streaming_url) {
      /* The API carries the title's real subtitle set: keep it so the player
         can offer captions instead of pretending the stream has none. The
         set is ordered Hindi -> English -> original, matching the app-wide
         track priority, so the first CC press always lands on Hindi. */
      const sRank = function (lang) {
        const s = String(lang || '');
        if (/(^|[^a-z])(hi|hin|hindi)([^a-z]|$)/i.test(s)) return 0;
        if (/(^|[^a-z])(en|eng|english)([^a-z]|$)/i.test(s)) return 1;
        return 2;
      };
      const subs = (Array.isArray(j.subtitles) ? j.subtitles : [])
        .filter(function (s) { return s && s.file_path && s.status !== 0; })
        .map(function (s) { return { lang: String(s.language || 'Subtitle'), url: String(s.file_path).replace(/\\\//g, '/') }; })
        .sort(function (a, b) { return sRank(a.lang) - sRank(b.lang); });
      return { type: 'hls', file: String(j.streaming_url).replace(/\\\//g, '/'), ref: 'https://vidara.to/', source: 'vidara-api', subs: subs.length ? subs : null };
    }
  } catch (e) {}
  return null;
}

/* Dyarlinks pages: the file page carries a /play/<id> button whose player
   config is a plain `var S = [{name,type,src}]` array - StreamTape embed or a
   direct video URL (PixelDrain). Both resolve natively here. */
function parseSourcesArray(html) {
  const m = String(html || '').match(/\[\s*\{\s*"name"[\s\S]{2,6000}?\}\s*\]/);
  if (!m) return [];
  try { const a = JSON.parse(m[0]); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}

async function dyarlinksResolve(fileUrl) {
  try {
    const r = await grab(fileUrl, 'https://dyarlinks.net/', undefined, undefined, 10000);
    if (!r || !r.ok) return null;
    const html = await r.text();
    let play = (html.match(/data-go=["']([^"']+)["']/i) || [])[1] || '';
    if (!play) { const m = html.match(/https?:\/\/dyarlinks\.[a-z]+\/play\/[A-Za-z0-9_-]+/i); if (m) play = m[0]; }
    if (!play) return null;
    if (play.charAt(0) === '/') play = 'https://dyarlinks.net' + play;
    const r2 = await grab(play, fileUrl, undefined, undefined, 10000);
    if (!r2 || !r2.ok) return null;
    const ph = await r2.text();
    const list = parseSourcesArray(ph);
    const stp = list.find(function (x) { return x && x.type === 'embed' && /streamtape/i.test(x.src || ''); });
    if (stp) {
      const f = await hdStreamtape(absUrl(stp.src, play));
      if (f) return { type: 'direct', file: f, ref: 'https://streamtape.com/', source: 'dyarlinks-streamtape' };
    }
    const vid = list.find(function (x) { return x && x.type === 'video' && x.src; });
    if (vid) {
      const u = absUrl(vid.src, play);
      if (u) return { type: 'direct', file: u, ref: 'https://dyarlinks.net/', source: 'dyarlinks-video' };
    }
    const em = list.find(function (x) { return x && x.type === 'embed' && x.src; });
    if (em) {
      const g = await hdGeneric(absUrl(em.src, play), play);
      if (g) return Object.assign({}, g, { ref: 'https://dyarlinks.net/', source: 'dyarlinks-host' });
    }
    const src = unpackEval(ph) || ph;
    const m3 = src.match(/https?:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4|webm)[^"'\s<>\\]*/i);
    if (m3) return { type: /\.m3u8/i.test(m3[0]) ? 'hls' : 'direct', file: m3[0].replace(/&amp;/g, '&'), ref: 'https://dyarlinks.net/', source: 'dyarlinks-page' };
  } catch (e) {}
  return null;
}

/* HubCloud drive pages: the generated download page (hubcloud.php with a
   token) exposes PixelDrain / FSL file URLs directly. */
async function hubcloudResolve(driveUrl) {
  try {
    const r = await grab(driveUrl, 'https://hubcloud.ist/', undefined, undefined, 10000);
    if (!r || !r.ok) return null;
    const html = await r.text();
    const m = html.match(/https?:\/\/[^"'\s<>]+hubcloud\.php\?[^"'\s<>"']+/i);
    if (!m) return null;
    const r2 = await grab(m[0].replace(/&amp;/g, '&'), driveUrl, undefined, undefined, 10000);
    if (!r2 || !r2.ok) return null;
    const h2 = await r2.text();
    const px = h2.match(/https?:\/\/pixeldrain\.[a-z]{2,5}\/u\/([A-Za-z0-9]+)/i);
    if (px) return { type: 'direct', file: 'https://pixeldrain.com/api/file/' + px[1], ref: 'https://pixeldrain.com/', source: 'hubcloud-pixeldrain' };
    const dl = h2.match(/https?:\/\/[^"'\s<>]+?\.(?:mp4|webm|mkv)(?:\?[^"'\s<>]*)?/i);
    if (dl) return { type: 'direct', file: dl[0].replace(/&amp;/g, '&'), ref: 'https://hubcloud.ist/', source: 'hubcloud-file' };
  } catch (e) {}
  return null;
}

/* File-host dispatcher shared by every custom-library path. */
function streamHostResolve(u) {
  if (/dyarlinks\./i.test(u)) return dyarlinksResolve(u);
  if (/hubcloud\./i.test(u)) return hubcloudResolve(u);
  if (/vidara\.[a-z]+\/e\//i.test(u)) return vidaraStream(u);
  if (/streamtape\./i.test(u)) return hdStreamtape(u).then(function (f) { return f ? { type: 'direct', file: f, ref: 'https://streamtape.com/', source: 'streamtape' } : null; });
  return Promise.resolve(null);
}

/* Episode strip of a HindiDrama watch page: every "-eNN" sibling link is a
   playable next episode. The landing page itself plays the first episode, so
   "next" is the first episode strictly after the current one. */
function hdNextEpisode(watchUrl, html) {
  try {
    if (!html) return '';
    const cur = String(watchUrl).match(/watch-([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-s(\d+))?(?:-e(\d+))?\/?$/i);
    if (!cur) return '';
    const re = new RegExp('watch-' + cur[1] + (cur[2] ? '-s' + cur[2] : '') + '-e(\\d+)', 'gi');
    const eps = [];
    let m; while ((m = re.exec(html))) eps.push(Number(m[1]));
    if (!eps.length) return '';
    eps.sort(function (a, b) { return a - b; });
    const curEp = cur[3] ? Number(cur[3]) : eps[0];
    const nxt = eps.find(function (n) { return n > curEp; });
    if (!nxt) return '';
    const pad = String(nxt).length >= 2 ? String(nxt) : '0' + nxt;
    return 'https://hindidrama.net/hindi-dubbed-online/watch-' + cur[1] + (cur[2] ? '-s' + cur[2] : '') + '-e' + pad;
  } catch (e) { return ''; }
}

async function hdResolve(watchUrl, pageHtml) {
  const t0 = Date.now();
  const left = () => 30000 - (Date.now() - t0);
  let embed = '';
  let pageHTML = pageHtml || '';
  if (/\/embed\/tvshow_srv/i.test(watchUrl)) embed = watchUrl;
  else {
    let html = pageHTML;
    if (!html) {
      try {
        const r = await grab(watchUrl, undefined, undefined, undefined, 10000);
        if (r && r.ok) { html = await r.text(); pageHTML = html; }
      } catch (e) {}
    }
    const m = html.match(/data-src=["']([^"']*\/embed\/tvshow_srv[^"']*)["']/i) ||
              html.match(/<iframe[^>]+src=["']([^"']*\/embed\/tvshow_srv[^"']*)["']/i);
    if (m) embed = m[1].replace(/&amp;/g, '&');
  }
  if (!embed) return null;
  if (/^\/\//.test(embed)) embed = 'https:' + embed;
  else if (!/^https?:/i.test(embed)) { try { embed = new URL(embed, 'https://hindidrama.net').href; } catch (e) { return null; } }
  let servers = [];
  try {
    const r2 = await grab(embed, 'https://hindidrama.net/', undefined, undefined, Math.max(6000, Math.min(12000, left())));
    if (r2 && r2.ok) servers = hdServers(await r2.text());
  } catch (e) {}
  if (!servers.length) return null;
  const pick = (re) => servers.find((s) => re.test(s.url));
  const withNext = function (o) { if (o && o.ok) { const n = hdNextEpisode(watchUrl, pageHTML); if (n) o.next = n; } return o; };

  /* Every host resolves in parallel and the FIRST live stream wins: a slow or
     dead host can never hold the others back, and the click stays well inside
     the client's /extract cap. Streamtape is still preferred when it answers
     quickly (progressive MP4); Vidara's API is the fast common winner. */
  const stp = pick(/streamtape\./i);
  const vh = pick(/morencius|vidhide/i);
  const vr = pick(/vidara\.[a-z]+\/e\//i);
  const cands = [];
  if (stp) cands.push(hdStreamtape(stp.url).then(function (f) { return f ? { type: 'direct', file: f, ref: 'https://streamtape.com/', source: 'hindidrama-streamtape' } : null; }).catch(function () { return null; }));
  if (vh) cands.push(hdVidhide(vh.url).then(function (f) { return f ? { type: 'hls', file: f, ref: 'https://morencius.com/', source: 'hindidrama-vidhide' } : null; }).catch(function () { return null; }));
  if (vr) cands.push(vidaraStream(vr.url).then(function (m) { return m && m.file ? Object.assign({}, m, { source: 'hindidrama-vidara' }) : null; }).catch(function () { return null; }));
  const first = await firstNonNull(cands);
  if (first) return withNext(Object.assign({ ok: true }, first));
  /* luluvido / lulustream and friends: same eval-packed player template. */
  const lulu = pick(/lulu(?:vido|stream)/i);
  if (lulu) {
    const g = await hdGeneric(lulu.url, embed);
    if (g) return withNext({ ok: true, type: g.type, file: g.file, source: 'hindidrama-host' });
  }
  /* Every remaining server: known file hosts resolve through their own API
     first, then one bounded packed-player scan. NO third-party player page is
     ever mounted as a fallback - a miss fails cleanly instead. */
  for (const s of servers) {
    if (left() < 8000) break;
    if (/streamtape|morencius|vidhide|lulu(?:vido|stream)|vidara\.[a-z]+\/e\//i.test(s.url)) continue;
    const hn = await streamHostResolve(s.url);
    if (hn && hn.file) return withNext(Object.assign({ ok: true }, hn, { source: 'hindidrama-' + (hn.source || 'host') }));
    const g = await hdGeneric(s.url, embed);
    if (g) return withNext({ ok: true, type: g.type, file: g.file, source: 'hindidrama-host' });
  }
  return null;
}

/* ---------------------------------------------------------------------------
   SERIES EPISODE DATA - one payload feeds the player's Season/Episode
   selectors and its Prev Ep / Next Ep buttons for EVERY episodic source.
   --------------------------------------------------------------------------- */

/* Normalize every known episode/season token inside a URL path+query:
   '-s1-e5', 's01e05', '1x05', '_ep2', 'episode-3', 'part-2', '?ep=4' all
   collapse to a placeholder, so links that differ ONLY in the episode number
   are provably siblings of the SAME series (page 2 of a list, links to other
   shows, or anything else, can never be mistaken for an episode). */
function epNormPath(p) {
  return String(p || '').toLowerCase().replace(/\/+$/, '')
    .replace(/(^|[^a-z0-9])s(?:eason)?[._-]?(\d{1,2})[._-]?e(?:p(?:isode)?)?[._-]?(\d{1,4})(?=$|[^a-z0-9])/g, '$1s$2e#')
    .replace(/(^|[^a-z0-9])(\d{1,2})[._-]?x[._-]?(\d{1,4})(?=$|[^a-z0-9])/g, '$1s$2e#')
    .replace(/(^|[^a-z0-9])(episodes?|eps?|e|parts?|pts?|vol(?:ume)?s?|chapters?|chaps?)[._-]?(\d{1,4})(?=$|[^a-z0-9])/g, '$1$2#')
    .replace(/([?&](?:episode|ep|e|part|pt|vol|volume|chapter|chap)=)\d{1,4}/g, '$1#')
    /* Cosmetic query noise that rides ALONG with the episode token
       ('?ep=3&x=1', '?ep=3#t=30') never forks an episode into a stranger:
       the placeholder compares equal to the bare '-ep' form of its siblings. */
    .replace(/#(?:&[\s\S]*|#[\s\S]*)?$/g, '#');
}

/* The episode (and season) number carried by a URL path+query, or null. */
function epNumOf(p) {
  const t = String(p || '').toLowerCase();
  let m = t.match(/(?:^|[^a-z0-9])s(?:eason)?[._-]?(\d{1,2})[._-]?e(?:p(?:isode)?)?[._-]?(\d{1,4})(?=$|[^a-z0-9])/);
  if (m) return { s: Number(m[1]) || 0, n: Number(m[2]) || 0 };
  m = t.match(/(?:^|[^a-z0-9])(\d{1,2})[._-]?x[._-]?(\d{1,4})(?=$|[^a-z0-9])/);
  if (m) return { s: Number(m[1]) || 0, n: Number(m[2]) || 0 };
  m = t.match(/(?:^|[^a-z0-9])(?:episodes?|eps?|e|parts?|pts?|vol(?:ume)?s?|chapters?|chaps?)[._-]?(\d{1,4})(?=$|[^a-z0-9]|$)/);
  if (m) return { s: 0, n: Number(m[1]) || 0 };
  m = t.match(/[?&](?:episode|ep|e|part|pt|vol|volume|chapter|chap)=(\d{1,4})(?:&|#|$)/);
  if (m) return { s: 0, n: Number(m[1]) || 0 };
  return null;
}

/* The show a URL belongs to: its normalized shape with every episode
   placeholder (and trailing separators) removed. Two episodes of the SAME
   series share one stem; another show or a list page never does. */
function epStem(norm) {
  return String(norm || '').split('#').join('').replace(/[-_./]+$/, '');
}

/* Two page URLs that only differ in scheme/noise are the same page. */
function normPageKey(u) {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./i, '') + x.pathname).replace(/\/+$/, '').toLowerCase();
  } catch (e) { return ''; }
}

/* Full sibling-episode ladder of a fetched page, sorted by season then
   episode. TWO page shapes are recognized, covering every provider the app
   ships (web series, standard series, anime, K-drama, hentai, adult web
   series, AI drama...):
     A) the current URL IS an episode page -> every same-host link with the
        same normalized episode shape (path or '?ep=' query) is a sibling;
     B) the current URL IS a series landing page -> same-host episode links
        whose normalized shape extends the landing path by one short token
        (the show's own episode list) form the ladder.
   Anything else (page 2 of a list, links to other shows, category links) is
   never mistaken for an episode. */
const EP_MAX = 400;
function findEpisodeLinks(html, pageUrl) {
  const out = [], seen = {};
  let curHost = '', curPath = '', curQuery = '';
  try {
    const cu = new URL(pageUrl);
    curHost = cu.hostname.replace(/^www\./i, '');
    curPath = cu.pathname;
    curQuery = cu.search || '';
  } catch (e) { return out; }
  const curFull = curPath + curQuery;
  const curNorm = epNormPath(curFull);
  const curNum = epNumOf(curFull);
  const curIsEp = curNorm.indexOf('#') >= 0 || !!curNum;
  const curStem = epStem(curNorm);
  const identity = function (num) { return String(num.s) + '|' + String(num.n); };
  const add = function (url, num) {
    const key = identity(num);
    if (seen[key]) return;
    seen[key] = 1;
    out.push({ n: num.n, s: num.s, url: String(url).replace(/#.*$/, ''), t: '' });
  };
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(String(html)))) {
    const href = String(m[1] || '').replace(/&amp;/g, '&').trim();
    if (!href || href.charAt(0) === '#' || /^(?:javascript|mailto|tel|data):/i.test(href)) continue;
    const a = absUrl(href, pageUrl);
    if (!a) continue;
    let h2 = '', p2 = '', q2 = '';
    try {
      const tu = new URL(a);
      h2 = tu.hostname.replace(/^www\./i, '');
      p2 = tu.pathname;
      q2 = tu.search || '';
    } catch (e) { continue; }
    if (h2 !== curHost) continue;
    const full2 = p2 + q2;
    const num = epNumOf(full2);
    if (!num || num.n < 1 || num.n > 9999) continue;
    const norm2 = epNormPath(full2);
    if (norm2.indexOf('#') < 0) continue;
    let ok = false;
    if (curIsEp) {
      ok = (norm2 === curNorm);
    } else if (curStem) {
      const stem2 = epStem(norm2);
      ok = (stem2 === curStem) ||
           (curStem.length >= 4 && stem2.indexOf(curStem) === 0 && (stem2.length - curStem.length) <= 48);
    }
    if (!ok) continue;
    /* Dedupe on the episode IDENTITY (season + number), not the raw href: the
       same episode linked twice with cosmetic query strings enters once. */
    add(a, num);
    if (out.length >= EP_MAX) break;
  }
  /* The current page belongs in its own ladder even when it does not link to
     itself (many watch pages omit the self link) - without it the selector
     would open on the wrong episode. */
  if (curIsEp && curNum && curNum.n >= 1) add(pageUrl, curNum);
  out.sort(function (x, y) { return (x.s - y.s) || (x.n - y.n); });
  return out.slice(0, EP_MAX);
}

/* ---------------------------------------------------------------------------
   MULTI-PART pages (the Desi web-series providers the Web Series tab shows).
   Their cards are badged with the part count ("8 Videos" / "2 Videos") and the
   page itself holds the parts in one of FOUR provable shapes:
     A) sibling episode links  - the URL carries an episode token; the SAME
        rule findEpisodeLinks() applies (it runs first and keeps its numbers);
     B) titled part links      - no token in the URL, but the LINK TEXT names a
        numbered part ("Episode 3", "Part 2", "Video 8") and the target lives
        inside the page's own series folder;
     C) numbered folder parts  - '/show/1', '/show/2', ... with bare-number link
        text, consecutive from 1 inside ONE folder (a parts grid can do that,
        pagination cannot);
     D) direct media parts     - the page itself holds several media files.
        Accepted only when every URL is numbered or the page declares the count,
        so a player + trailer pair never becomes a playlist.
   Only same-host, non-junk links qualify, and only when at least TWO parts
   exist: a normal single-video page never grows a fake playlist.
   --------------------------------------------------------------------------- */
const PART_QUERY_NOISE_RE = /[?&](?:paged?|page|p|start|offset|sort|order|filter|tab|view)=/i;
const PART_LINK_JUNK_RE = /(facebook|twitter|instagram|telegram|whatsapp|pinterest|reddit|linkedin|youtube\.com\/(?:channel|user)|wp-login|wp-admin|\/feed|\/page\/\d+|\/paged?\/|\/tag\/|\/author\/|\/comment|\.(?:css|js|json|png|jpg|jpeg|gif|svg|webp|ico)(?:[?#]|$))/i;
const PART_TEXT_RE = /(?:^|[^0-9a-z])(?:episodes?|eps?|parts?|pts?|videos?|vids?|vol(?:ume)?s?|chapters?|chaps?)[._\- ]?(\d{1,4})(?=[^0-9]|$)/i;
const PART_TEXT_TAIL_RE = /^\s*(\d{1,4})\s*(?:videos?|vids?|episodes?|eps?|parts?|pts?)\s*$/i;
const PARTS_BADGE_RE = /(?:^|[^0-9a-z])(\d{1,3})\s*(?:videos?|vids?|episodes?|eps|parts?|pts)(?=[^0-9a-z]|$)/i;

/* "8 Videos" / "2 Episodes" / "5 Parts" printed on a page IS a part count. */
function partsCountOf(txt) {
  const m = String(txt || '').match(PARTS_BADGE_RE);
  if (!m) return 0;
  const n = Number(m[1]) || 0;
  return (n >= 2 && n <= 500) ? n : 0;
}
/* The part number carried by a LINK TEXT - only ever applied to links that
   provably live inside the page's own series folder, so prose or a card badge
   can never invent an episode. */
function partNumOfText(txt) {
  const s = String(txt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 160) return null;
  let m = s.match(/(?:^|[^0-9a-z])s(?:eason)?[._\- ]?(\d{1,2})[._\- ]?e(?:p(?:isode)?)?[._\- ]?(\d{1,4})(?=$|[^0-9])/i);
  if (m) return { s: Number(m[1]) || 0, n: Number(m[2]) || 0 };
  m = s.match(PART_TEXT_RE) || s.match(PART_TEXT_TAIL_RE);
  if (m) return { s: 0, n: Number(m[1]) || 0 };
  return null;
}
/* The folder a URL lives in, with a trailing part number stripped. */
function folderBase(p) {
  return String(p || '').replace(/\/+$/, '').replace(/[._\-]?\d{1,4}$/, '').replace(/[-_./]+$/, '').toLowerCase();
}
/* The LAST path segment (the slug) of a URL path. The Desi web-series providers
   keep the series INDEX under /series/<slug>/ while every part lives one level
   down at /<slug>/?ep=N - the slug is what ties the two together. */
function leafOf(p) {
  const segs = String(p || '').toLowerCase().split(/[?#]/)[0].split('/').filter(Boolean);
  return segs.length ? segs[segs.length - 1] : '';
}

function findPartLinks(html, pageUrl) {
  const anchors = [], folder = [], medias = [], slugLinks = [], out = [];
  const seenA = {}, seenF = {}, seenM = {};
  let curHost = '', curPath = '', curQuery = '';
  try {
    const cu = new URL(pageUrl);
    curHost = cu.hostname.replace(/^www\./i, '');
    curPath = cu.pathname;
    curQuery = cu.search || '';
  } catch (e) { return out; }
  const src = String(html || '').replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
  const curFull = curPath + curQuery;
  const curNorm = epNormPath(curFull);
  const curNum = epNumOf(curFull);
  const curIsEp = curNorm.indexOf('#') >= 0 || !!curNum;
  const curStem = epStem(curNorm);
  const curLeaf = leafOf(curPath);
  const curBase = folderBase(curPath);
  const curPathKey = curPath.replace(/\/+$/, '').toLowerCase();
  const keyOf = function (u) { return String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase(); };
  /* Does this link provably belong to the SAME show as the page?
     1) the classic rule: the normalized shapes agree, or the link extends the
        page's own stem by one short token, or
     2) the slug rule: '/series/aadhi-gharwali/' indexes the parts of
        '/aadhi-gharwali/?ep=N' - same show, different folder.
     A number is still REQUIRED before either rule runs, so prose, cards and
     related-show links can never invent a part. */
  const sibling = function (norm2, path2) {
    const stem2 = epStem(norm2);
    if (stem2 === curStem) return true;
    if (curStem.length >= 4 && stem2.indexOf(curStem) === 0 && (stem2.length - curStem.length) <= 48) return true;
    const leaf2 = leafOf(path2);
    if (!curLeaf || curLeaf.length < 3 || !leaf2) return false;
    return leaf2 === curLeaf || leaf2.indexOf(curLeaf + '-') === 0 ||
           leaf2.indexOf(curLeaf + '_') === 0 || leaf2.indexOf(curLeaf + '.') === 0;
  };
  /* Parts are identified by their NUMBER (the same rule findEpisodeLinks
     uses): the raw href repeats on these pages (thumbnail link + title link),
     while a path-only key would collapse the query-token ladder
     ('?ep=2' vs '?ep=3') into a single entry. */
  const add = function (seen2, list, url, num, title, direct) {
    const u = String(url).replace(/#.*$/, '');
    if (!u) return;
    const n0 = Number(num && num.n) || 0, s0 = Number(num && num.s) || 0;
    let t0 = String(title || '').trim();
    /* A thumbnail anchor wraps the whole card, so its "text" is the RUN TIME
       ("21:37") - never a title. The title link (h2) is what names the part. */
    if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(t0)) t0 = '';
    const k = n0 ? (s0 + '|' + n0) : ('u|' + keyOf(u));
    const ex = seen2[k];
    if (ex) {
      const named = function (x) { return /(?:episode|ep|part|pt|video|vid|vol(?:ume)?)\s*\d{1,4}/i.test(String(x || '')); };
      if (t0 && (!ex.t || (!named(ex.t) && named(t0)))) ex.t = t0.slice(0, 120);
      if (direct && !ex.d) ex.d = 1;
      return;
    }
    const obj = { n: n0, s: s0, url: u, t: t0.slice(0, 120), d: direct ? 1 : 0 };
    seen2[k] = obj;
    list.push(obj);
  };
  const re = /<a\s+([^>]*)>([\s\S]{0,600}?)<\/a>/gi;
  let m;
  while ((m = re.exec(src))) {
    const attrs = m[1], inner = m[2];
    const hm = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hm) continue;
    const href = String(hm[1]).replace(/&amp;/g, '&').replace(/&#0*38;/gi, '&').trim();
    if (!href || href.charAt(0) === '#' || /^(?:javascript|mailto|tel|data):/i.test(href)) continue;
    const a = absUrl(href, pageUrl);
    if (!a || PART_LINK_JUNK_RE.test(a) || AD_RE.test(a)) continue;
    let h2 = '', p2 = '', q2 = '';
    try {
      const tu = new URL(a);
      h2 = tu.hostname.replace(/^www\./i, '');
      p2 = tu.pathname;
      q2 = tu.search || '';
    } catch (e) { continue; }
    if (h2 !== curHost) continue;
    const title = String(inner).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const full2 = p2 + q2;
    const num = epNumOf(full2);
    const norm2 = epNormPath(full2);
    if (num && norm2.indexOf('#') >= 0) {
      /* (A) token sibling: the findEpisodeLinks rule, carrying a title. */
      if (norm2 === curNorm || sibling(norm2, p2)) add(seenA, anchors, a, num, title, 0);
      continue;
    }
    if (PART_QUERY_NOISE_RE.test(q2)) continue;
    /* (B) titled part link: the number comes from the LINK TEXT, so the target
       must provably belong to this page's own series (shape or slug rule). */
    const tnum = partNumOfText(title);
    if (tnum && tnum.n >= 1 && sibling(norm2, p2)) { add(seenA, anchors, a, tnum, title, 0); continue; }
    /* (E) the show's own page: same slug, no number token anywhere. On the
       series INDEX ('/series/<slug>/') that link IS the first part - the one
       the site's own first card points at ('/<slug>/' plays episode 1). It is
       recorded, not counted: the ladder adopts it only when nothing numbered
       as part 1 exists. */
    if (!curIsEp && curLeaf.length >= 3 && leafOf(p2) === curLeaf && p2.replace(/\/+$/, '').toLowerCase() !== curPathKey) {
      slugLinks.push({ url: a, t: title });
      continue;
    }
    /* (C) bare-number part inside the page's own folder. */
    const bare = title.match(/^\s*(\d{1,3})\s*$/);
    if (bare && curBase && curBase.length >= 3 && folderBase(p2) === curBase && p2.replace(/\/+$/, '').toLowerCase() !== curPathKey) {
      add(seenF, folder, a, { s: 0, n: Number(bare[1]) || 0 }, title, 0);
    }
  }
  /* (D) the page's own media files (all parts on ONE page). */
  const pool = [];
  const pushMedia = function (u) {
    const a = absUrl(u, pageUrl);
    if (!a || !MEDIA_EXT_RE.test(a) || AD_RE.test(a) || EP_STUB_RE.test(a)) return;
    if (pool.indexOf(a) < 0) pool.push(a);
  };
  const tagRe = /<(?:video|source|audio)[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi;
  while ((m = tagRe.exec(src))) pushMedia(m[1]);
  const jsonRe = /["'](?:file|src|source|url|contentUrl|hls|playlist|videoUrl|video_url|stream|stream_url|mp4|m3u8|sd|hd)["']\s*:\s*["']([^"']{6,700})["']/gi;
  while ((m = jsonRe.exec(src))) pushMedia(m[1]);
  const dataRe = /data-(?:src|file|video|video-src|stream|hls|mp4|url)\s*=\s*["']([^"']+)["']/gi;
  while ((m = dataRe.exec(src))) pushMedia(m[1]);
  const bare2 = /https?:\/\/[^"'\s<>\\]+?\.(?:mp4|webm|m4v|m3u8)(?:\?[^"'\s<>\\]*)?/gi;
  while ((m = bare2.exec(src))) pushMedia(m[0]);
  const uniqM = [], mseen = {};
  pool.forEach(function (u) {
    const k = keyOf(u);
    if (!k || mseen[k]) return;
    mseen[k] = 1;
    const mn = epNumOf(u) || partNumOfText(u);
    uniqM.push({ url: u, n: Number(mn && mn.n) || 0, s: Number(mn && mn.s) || 0 });
  });
  const pageCount = partsCountOf(src.slice(0, 4000)) ||
                    partsCountOf((src.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i) || [])[1] || '') ||
                    partsCountOf((src.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1] || '');
  const numbered = uniqM.length > 1 && uniqM.every(function (x) { return x.n >= 1; });
  if (uniqM.length > 1 && (numbered || pageCount >= 2)) {
    uniqM.forEach(function (x, i) {
      add(seenM, medias, x.url, { s: x.s || 0, n: x.n || (i + 1) }, 'Part ' + (x.n || (i + 1)), 1);
    });
  }
  const finish = function (list) {
    const s2 = list.slice(0, EP_MAX);
    s2.sort(function (x, y) { return (x.s - y.s) || (x.n - y.n); });
    s2.forEach(function (x, i) { if (!x.n) x.n = i + 1; });
    return s2;
  };
  if (anchors.length) {
    /* The show's own '/<slug>/' link IS episode 1 on these series indexes:
       adopt it even when the page lists a single numbered part (a "2 Videos"
       series has exactly one '?ep=2' link) - that still yields the full
       two-part ladder instead of nothing. */
    if (slugLinks.length && !anchors.some(function (x) { return x.n === 1; })) {
      slugLinks.forEach(function (s3) { add(seenA, anchors, s3.url, { s: 0, n: 1 }, s3.t, 0); });
    }
    if (anchors.length > 1) {
      if (curIsEp && curNum && curNum.n >= 1) add(seenA, anchors, pageUrl, curNum, '', 0);
      else if (!anchors.some(function (x) { return x.n === 1; }) && !curNum) {
        /* No numbered part 1 and no '/<slug>/' link: the page itself is 1. */
        add(seenA, anchors, pageUrl, { s: 0, n: 1 }, '', 0);
      }
      return finish(anchors);
    }
  }
  if (folder.length > 1) {
    /* Consecutive from 1, no gaps: that is a parts grid, not pagination. */
    const nums = folder.map(function (x) { return x.n; }).sort(function (x, y) { return x - y; });
    const consecutive = nums.every(function (v, i) { return v === i + 1; });
    if (consecutive) {
      if (curIsEp && curNum && curNum.n >= 1 && folderBase(curPath) === curBase) add(seenF, folder, pageUrl, curNum, '', 0);
      return finish(folder);
    }
  }
  if (medias.length > 1) return finish(medias);
  return out;
}

/* The page's ladder from EVERY evidence source: the token ladder
   (findEpisodeLinks) plus the titled/numbered/media parts (findPartLinks).
   Entries that both shapes know enter ONCE, with the missing fields (title,
   part number, direct flag) filled in from the other source. */
function mergeLadders(primary, secondary) {
  const out = [], seen = {};
  const add = function (x) {
    if (!x || !x.url) return;
    /* Identity carries the part NUMBER: query-token ladders ('?ep=2' vs
       '?ep=3') share a path key, so a path-only key would merge them. */
    const k = (normPageKey(x.url) || String(x.url)) + '|' + (Number(x.n) || 0) + '|' + (Number(x.s) || 0);
    const ex = seen[k];
    if (ex) {
      if (!ex.t && x.t) ex.t = x.t;
      if (!ex.n && x.n) { ex.n = x.n; if (!ex.s) ex.s = x.s || 0; }
      if (x.d && !ex.d) ex.d = x.d;
      return;
    }
    seen[k] = x;
    out.push(x);
  };
  (primary || []).forEach(add);
  (secondary || []).forEach(add);
  out.sort(function (x, y) { return ((x.s || 0) - (y.s || 0)) || ((x.n || 0) - (y.n || 0)); });
  return out.slice(0, EP_MAX);
}

/* Full season/episode map for a TMDB show: /eps?tmdb=<id>. Every season and
   every episode in ONE payload - no per-episode round trips while browsing. */
const EPS_CACHE = new Map();
async function tmdbEpisodes(id) {
  const key = String(id);
  const hit = EPS_CACHE.get(key);
  if (hit && Date.now() - hit.t < 600000) return hit.v;
  const base2 = 'https://api.themoviedb.org/3/tv/' + encodeURIComponent(key);
  let d = null;
  try {
    const r = await grab(base2 + '?api_key=' + TMDB_KEY, undefined, undefined, undefined, 9000);
    if (!r || !r.ok) return null;
    d = await r.json();
  } catch (e) { return null; }
  if (!d) return null;
  const seasons = (Array.isArray(d.seasons) ? d.seasons : [])
    .filter(function (s) { return s && Number(s.season_number) >= 0 && Number(s.episode_count) > 0; })
    .sort(function (a, b) { return Number(a.season_number) - Number(b.season_number); })
    .slice(0, 40);
  const out = await Promise.all(seasons.map(async function (s) {
    const n = Number(s.season_number);
    const label = String(s.name || ('Season ' + n));
    try {
      const rr = await grab(base2 + '/season/' + n + '?api_key=' + TMDB_KEY, undefined, undefined, undefined, 9000);
      if (!rr || !rr.ok) return { n: n, name: label, eps: [] };
      const sd = await rr.json();
      const eps = (Array.isArray(sd.episodes) ? sd.episodes : [])
        .filter(function (e2) { return e2 && Number(e2.episode_number) > 0; })
        .sort(function (a, b) { return Number(a.episode_number) - Number(b.episode_number); })
        .slice(0, 200)
        .map(function (e2) { return { n: Number(e2.episode_number), name: String(e2.name || ('Episode ' + e2.episode_number)), air: String(e2.air_date || '') }; });
      return { n: n, name: label, eps: eps };
    } catch (e) { return { n: n, name: label, eps: [] }; }
  }));
  const v = { ok: true, id: key, name: String(d.name || ''), seasons: out };
  if (out.some(function (s) { return s.eps.length; })) EPS_CACHE.set(key, { t: Date.now(), v: v });
  if (EPS_CACHE.size > 40) { const now = Date.now(); for (const [k2, v2] of EPS_CACHE) { if (now - v2.t > 600000) EPS_CACHE.delete(k2); } }
  return v;
}

/* Rule34 backend feed with a STRICT server-side dedupe: every post is keyed
   by its id (fallback: normalized media URL) inside a Set - the same post can
   never be returned twice, no matter how the upstream feed repeats it. */
function normMediaUrl(u) {
  return String(u || '').trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
}
async function r34Feed(tags) {
  const srcs = [
    { u: 'https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=40&tags=', page: 'https://xbooru.com/index.php?page=post&s=view&id=' },
    { u: 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=40&tags=', page: 'https://rule34.xxx/index.php?page=post&s=view&id=' }
  ];
  const wanted = String(tags || 'animated').trim() || 'animated';
  const attempts = [wanted];
  if (wanted.indexOf(' ') > 0) attempts.push(wanted.split(' ')[0]);
  for (let s = 0; s < srcs.length; s++) {
    for (let a = 0; a < attempts.length; a++) {
      try {
        const r = await grab(srcs[s].u + encodeURIComponent(attempts[a]), undefined, undefined, undefined, 12000);
        if (!r || !r.ok) continue;
        const txt = await r.text();
        if (!txt || txt.trim().charAt(0) === '<') continue;   /* captcha / challenge page */
        let j = null;
        try { j = JSON.parse(txt); } catch (e) { continue; }
        const list = Array.isArray(j) ? j : ((j && j.post) || []);
        const seen = new Set(), out = [];
        for (let i = 0; i < list.length && out.length < 40; i++) {
          const p = list[i] || {};
          const f = String(p.file_url || p.file_url_hd || '');
          if (!/\.(mp4|webm)(\?|#|$)/i.test(f)) continue;
          const ukey = 'u:' + normMediaUrl(f);
          const key = p.id ? ('id:' + String(p.id)) : ukey;
          if (seen.has(key) || seen.has(ukey)) continue;
          seen.add(key); seen.add(ukey);
          let pre = p.preview_url || p.sample_url || '';
          if (pre && /sample\.(mp4|webm)/i.test(pre)) pre = p.preview_url || '';
          out.push({
            id: String(p.id || ''), file: f,
            preview: /\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(pre) ? pre : '',
            page: srcs[s].page + (p.id || '')
          });
        }
        if (out.length) return { ok: true, source: s ? 'rule34.xxx' : 'xbooru', posts: out };
      } catch (e) {}
    }
  }
  return { ok: false, posts: [] };
}

function hdr(res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}
/* Cloudflare clearance cookies for scraper hosts (missav, ...) - pushed from
   the app's real browser session so Node grabs are not served a challenge. */
const COOKJAR = new Map();
function cookFor(host) {
  for (const k of COOKJAR.keys()) { if (host === k || host.endsWith('.' + k)) return COOKJAR.get(k); }
  return '';
}

async function grab(url, referer, range, ua, ms){
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms || 12000);
  const h = {
    'User-Agent': ua || UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache'
  };
  try {
    const o = new URL(url).origin;
    h.Referer = referer || (o + '/');
    /* Do not synthesize Origin on plain GETs. A browser only sends it for
       CORS/POST; some player CDNs (morencius) answer the synthetic header
       with a Cloudflare stall, which timed out the vidhide HLS fallback. */
    const ck = cookFor(new URL(url).hostname);
    if (ck) h['Cookie'] = ck;
  } catch (e) {}
  if (range) h.Range = range;
  const r = await fetch(url, { headers: h, redirect: 'follow', signal: ctl.signal });
  clearTimeout(t);
  return r;
}

// 10-second in-memory response cache
const CACHE_TTL = 10000;
const memCache = new Map();
function getCached(key) {
  const c = memCache.get(key);
  if (!c) return null;
  if (Date.now() - c.time > CACHE_TTL) { memCache.delete(key); return null; }
  return c;
}
function setCached(key, status, headers, body) {
  if (memCache.size > 250) {
    const now = Date.now();
    for (const [k, v] of memCache.entries()) { if (now - v.time > CACHE_TTL) memCache.delete(k); }
  }
  memCache.set(key, { time: Date.now(), status, headers, body });
}

async function handle(req, res){
  hdr(res);
  const u = new URL(req.url, 'http://127.0.0.1');
  const path = u.pathname;
  const t = u.searchParams.get('url') || u.searchParams.get('u');
  const pRef = u.searchParams.get('ref') || '';
  const pUA = u.searchParams.get('ua') || '';
  if (req.method === 'OPTIONS'){ res.writeHead(204); return res.end(); }
  if (path === '/ping'){ res.writeHead(200, {'Content-Type':'application/json','Cache-Control':'no-store'}); return res.end(JSON.stringify({ ok: true, alt: ALT_OK ? ('127.0.0.2:' + LIVE_PORT) : '' })); }
  /* Session cookie sync: the real browser pushes clearance cookies here so
     Node-side grabs of challenge-protected hosts look like the same client. */
  if (path === '/ck' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 262144) req.destroy(); });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        if (j && j.host && j.cookie) COOKJAR.set(String(j.host).toLowerCase(), String(j.cookie));
      } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end('{"ok":true}');
    });
    return;
  }
  if (path === '/enhance.js'){ res.writeHead(200, {'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache'}); return res.end(ENHANCER); }

  /* Reachability gate: server-side fetch used to test candidate player URLs
     BEFORE Chromium ever touches them. Dead domains, DNS failures and bad
     certificates are dropped here in Node - the app window never requests
     them, so the terminal stays free of ERR_NAME_NOT_RESOLVED / ERR_CERT_*. */
  if (path === '/probe') {
    const t0 = Date.now();
    const jout = function (o) { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!t) return jout({ reach: false, err: 'no url' });
    try {
      const r = await grab(t, undefined, undefined, undefined, 10000);
      const buf = Buffer.from(await r.arrayBuffer());
      return jout({ reach: true, status: r.status, size: buf.length, ms: Date.now() - t0 });
    } catch (e) {
      return jout({ reach: false, status: 0, size: 0, err: String((e && e.message) || e).slice(0, 120) });
    }
  }

  if (path === '/server' || path === '/srv' || path === '/format') {
    const tmdbId = u.searchParams.get('tmdb') || u.searchParams.get('id') || '';
    const imdbId = u.searchParams.get('imdb') || '';
    const s = u.searchParams.get('season') || u.searchParams.get('s') || '1';
    const e = u.searchParams.get('episode') || u.searchParams.get('e') || '1';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ tmdb: tmdbId, imdb: imdbId, season: Number(s), episode: Number(e), s1e1: 's' + s + 'e' + e, format: 'season=' + s + '&episode=' + e }));
  }

  /* Tube search / trending / clean stream resolution. */
  if (path === '/yt/search') {
    const q = u.searchParams.get('q') || '';
    const limit = Math.max(1, Math.min(50, Number(u.searchParams.get('limit')) || 30));
    try {
      const items = await ytSearch(q, limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, items: items }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, items: [], error: String((e && e.message) || e).slice(0, 120) }));
    }
  }
  if (path === '/yt/trending') {
    const limit = Math.max(1, Math.min(50, Number(u.searchParams.get('limit')) || 30));
    try {
      const items = await ytTrending(limit);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: true, items: items }));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, items: [], error: String((e && e.message) || e).slice(0, 120) }));
    }
  }
  if (path === '/yt/stream') {
    const id = u.searchParams.get('id') || '';
    try {
      const st = await ytStream(id);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(st));
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ ok: false, error: String((e && e.message) || e).slice(0, 120) }));
    }
  }

  /* Full season/episode map for a TMDB show - the player's Season/Episode
     selector and Prev Ep / Next Ep controls read this one payload. */
  if (path === '/eps') {
    const id = u.searchParams.get('tmdb') || u.searchParams.get('id') || '';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    if (!id) return res.end('{"ok":false,"seasons":[]}');
    try {
      const v = await tmdbEpisodes(id);
      return res.end(JSON.stringify(v || { ok: false, seasons: [] }));
    } catch (e) {
      return res.end('{"ok":false,"seasons":[]}');
    }
  }

  /* Rule34 post feed (server-side, strictly deduped by post id / normalized
     media URL) - the animated vault rows read this before touching the DOM. */
  if (path === '/r34') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    try { return res.end(JSON.stringify(await r34Feed(u.searchParams.get('tags') || 'animated'))); }
    catch (e) { return res.end('{"ok":false,"posts":[]}'); }
  }

  if (req.method === 'GET' && !req.headers.range) {
    const cached = getCached(req.url);
    if (cached) {
      res.writeHead(cached.status, Object.assign({}, cached.headers, { 'X-Cache': 'HIT' }));
      return res.end(cached.body);
    }
  }

  /* TMDB proxy - the renderer calls /tmdb/3/<endpoint>. The baked key is
     injected so callers need not send one. */
  if (path === '/tmdb' || path.indexOf('/tmdb/') === 0){
    const rest = path.slice('/tmdb'.length) + (u.search || '');
    let tgt;
    try { tgt = new URL('https://api.themoviedb.org' + (rest.charAt(0) === '/' ? rest : '/' + rest)); }
    catch (e) { res.writeHead(400, {'Content-Type':'application/json; charset=utf-8'}); return res.end('{"error":"bad tmdb path"}'); }
    if (!tgt.searchParams.get('api_key')) tgt.searchParams.set('api_key', TMDB_KEY);
    try {
      /* Cold-start networks (first DNS lookup / TLS handshake on a device that
         just booted) can fail the very first request; one bounded retry keeps
         the worst case (7s + 7s) under the renderer's 15s client timeout. */
      let r;
      try { r = await grab(tgt.href, undefined, undefined, undefined, 7000); }
      catch (e1) { r = await grab(tgt.href, undefined, undefined, undefined, 7000); }
      const body = Buffer.from(await r.arrayBuffer());
      const cType = r.headers.get('content-type') || 'application/json; charset=utf-8';
      setCached(req.url, r.status, { 'Content-Type': cType, 'X-Upstream-Status': String(r.status) }, body);
      res.writeHead(r.status, {'Content-Type': cType, 'X-Upstream-Status': String(r.status)});
      return res.end(body);
    } catch (e) {
      res.writeHead(502, {'Content-Type':'application/json; charset=utf-8'});
      return res.end('{"error":"tmdb proxy failed: ' + String((e && e.message) || e).replace(/[^a-zA-Z0-9 .:_-]/g, '') + '"}');
    }
  }

  /* Clean media extractor: resolves direct streams (.mp4/.m3u8/.webm) or an
     isolated player iframe URL - NEVER returns an ad-filled raw webpage. */
  if (path === '/extract') {
    const rawUrl = u.searchParams.get('url') || '';
    const rawTitle = u.searchParams.get('title') || '';
    let targetUrl = rawUrl;
    try { if (!/^https?:\/\//i.test(targetUrl)) targetUrl = decodeURIComponent(targetUrl); } catch (_) {}

    const jsonOut = function (o) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(o));
    };
    /* Attach a ready-to-play local proxy twin so the native <video> never
       fights upstream Referer / CORS / mixed-content rules. Surrit (missav's
       CDN) is Cloudflare-fingerprinted against anything that is not the real
       browser: those play natively in Chromium with the missav referer, so
       no proxy twin is attached for them. */
    const emit = function (o) {
      o.ok = o.ok !== false;
      if ((o.type === 'direct' || o.type === 'hls') && o.file) {
        o.file = String(o.file).replace(/\\\//g, '/');
        /* NEVER hand the player a stub/dummy clip (Eporner's "only available on
           Eporner" warning, placeholder files...). A stream that failed its
           session check fails loudly so the client re-extracts instead of
           showing a warning video. */
        if (EP_STUB_RE.test(o.file)) {
          delete o.file; delete o.play;
          o.ok = false;
          o.error = o.error || 'stub-stream';
          return jsonOut(o);
        }
        if (o.epv) {
          /* Eporner: the signed CDN only serves the real file to a request
             carrying the captured session cookie + eporner referer, so the
             stream is routed through the local /ep twin (206-capable) which
             replays both headers on EVERY byte-range request. */
          const epVid = String(o.epv);
          delete o.epv;
          o.file = 'http://127.0.0.1:' + LIVE_PORT + '/ep?vid=' + encodeURIComponent(epVid) + '&url=' + encodeURIComponent(o.file);
          o.native = true;
        } else if (/surrit\.com|tapecontent\.net/i.test(o.file)) { o.native = true; }
        else {
          /* A resolver can pin the exact upstream referer its CDN expects
             (Vidara/PixelDrain/StreamTape); otherwise the source page origin
             is the best generic guess. */
          let ref = String(o.ref || '');
          if (!ref) { try { ref = new URL(targetUrl).origin + '/'; } catch (e) {} }
          o.play = 'http://127.0.0.1:' + LIVE_PORT + (o.type === 'hls' ? '/hls?url=' : '/raw?url=') +
                   encodeURIComponent(o.file) + '&ref=' + encodeURIComponent(ref) + '&ua=' + encodeURIComponent(UA);
        }
        delete o.ref;
      }
      if (o.type === 'embed' && o.embed) o.embed = String(o.embed).replace(/\\\//g, '/');
      /* Sibling-episode ladder of the source page (series selector + Prev/Next
         in the player). Sanitized and capped here so the client always gets a
         clean, ordered array of playable page URLs. */
      if (Array.isArray(o.eps) && o.eps.length > 1) {
        o.eps = o.eps
          .filter(function (x) { return x && /^https?:/i.test(String(x.url || '')); })
          .slice(0, 200)
          .map(function (x) { return { n: Number(x.n) || 0, s: Number(x.s) || 0, url: String(x.url), t: String(x.t || ''), d: x.d ? 1 : 0 }; });
        if (o.eps.length < 2) delete o.eps;
      } else { delete o.eps; }
      /* A page whose strip answered only as a single "next" link (no full
         ladder) still gets a two-step selector: the current page plus that
         next episode, instead of a lonesome Next button. */
      if (!Array.isArray(o.eps) && typeof o.next === 'string' && /^https?:/i.test(o.next) && targetUrl && /^https?:/i.test(targetUrl)) {
        const ck = normPageKey(targetUrl);
        if (ck && ck !== normPageKey(o.next)) {
          o.eps = [{ n: 1, s: 0, url: targetUrl, t: '' }, { n: 2, s: 0, url: o.next, t: '' }];
        }
      }
      /* The EXPLICIT episodes array the Web Series frontend binds to its
         Season/Episode selector: [{ ep, title, url }, ...]. `direct:true` tells
         the player the URL already IS the stream, so it plays it instead of
         resolving it like a page. Built from the same ladder, so the two
         shapes can never disagree. */
      if (Array.isArray(o.eps) && o.eps.length > 1) {
        o.episodes = o.eps.map(function (x, i) {
          const n = Number(x.n) || (i + 1);
          return {
            ep: n,
            title: String(x.t || ('Episode ' + n)),
            url: String(x.url),
            direct: !!x.d || /\.(?:mp4|webm|m4v|m3u8)(?:[?#]|$)/i.test(String(x.url))
          };
        });
      } else { delete o.episodes; }
      /* Caption files ride the same local twin: the CDN never sees a foreign
         origin and the text tracks keep loading on every title. */
      if (Array.isArray(o.subs) && o.subs.length) {
        o.subs = o.subs.filter(function (s) { return s && s.url; }).map(function (s) {
          return { lang: String(s.lang || 'Subtitle'),
                   url: 'http://127.0.0.1:' + LIVE_PORT + '/raw?url=' + encodeURIComponent(s.url) +
                        '&ref=' + encodeURIComponent('https://vidara.to/') + '&ua=' + encodeURIComponent(UA) };
        });
      } else { delete o.subs; }
      if (typeof o.next !== 'string' || !/^https?:/i.test(o.next)) delete o.next;
      return jsonOut(o);
    };

    /* 1. targetUrl is already a direct media stream */
    if (/\.(mp4|webm|m4v)(\?|#|$)/i.test(targetUrl)) return emit({ type: 'direct', file: targetUrl });
    if (/\.m3u8(\?|#|$)/i.test(targetUrl)) return emit({ type: 'hls', file: targetUrl });

    /* 1b. Dailymotion watch pages map straight to the bare embed player. */
    const mDm = targetUrl.match(/dailymotion\.com\/(?:embed\/)?video\/([a-zA-Z0-9]+)/i);
    if (mDm) return emit({ type: 'embed', embed: 'https://www.dailymotion.com/embed/video/' + mDm[1], source: 'dailymotion', isolated: true });

    /* 1c. File hosts that expose a raw stream directly: StreamTape (decoy
       token page -> 302 MP4), Dyarlinks (play config -> StreamTape/video),
       HubCloud (PixelDrain/FSL file), Vidara (own /api/stream HLS). */
    try {
      const h0 = new URL(targetUrl).hostname;
      if (/^(?:www\.)?(?:streamtape\.(?:com|net)|dyarlinks\.[a-z]+)$/i.test(h0) ||
          /hubcloud\./i.test(h0) || /vidara\.[a-z]+\/e\//i.test(targetUrl)) {
        const hn = await streamHostResolve(targetUrl);
        if (hn && hn.file) return emit(hn);
      }
    } catch (e) {}

    const isCustom = CUSTOM_SRC_RE.test(targetUrl);

    /* 2. Fetch the source page once. Each attempt gets a fast 10s socket
          budget; a source that answers with a Cloudflare challenge is dropped
          quietly: the app rotates to the next provider instead of painting a
          challenge. */
    let html = '', cfBlocked = false;
    if (targetUrl) {
      /* Custom mirrors flake at the DNS/TLS layer now and then; one fast
         retry turns a transient name-resolution blip into a normal play
         instead of a dead-end isolated page. Slow attempts are NOT retried
         (each attempt already gets a fast 10s socket budget). */
      const tFetch = Date.now();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await grab(targetUrl, undefined, undefined, undefined, 10000);
          if (r) {
            html = await r.text();
            if (isCfChallenge(r.status, html) || ((r.status === 403 || r.status === 503) && !html)) { cfBlocked = true; html = ''; }
          }
        } catch (_) {}
        if (html || cfBlocked || Date.now() - tFetch > 10000) break;
        await new Promise((r2) => setTimeout(r2, 350));
      }
    }

    let media = html ? findMedia(html, targetUrl) : null;

    /* Sibling-episode ladder of the fetched page: feeds the player's
       Season/Episode selector + Prev Ep / Next Ep controls for every
       episodic source (K-Drama / web series / AI drama pages...). Same-host
       and same normalized path shape only, so only true siblings qualify. */
    let pageEps = [];
    if (html) { try { pageEps = findEpisodeLinks(html, targetUrl); } catch (e) {} }
    /* Web-series pages list their parts as a titled grid ("Episode 3" /
       "Part 2" / "Video 8") or hold every part as its OWN media file - the
       same ladder read from different evidence, so both are merged into one
       list. The Desi series providers all ride this path. */
    let partEps = [];
    if (html) { try { partEps = findPartLinks(html, targetUrl); } catch (e) {} }
    if (partEps.length > 1) pageEps = mergeLadders(pageEps, partEps);

    /* 2b. Eporner pages: the markup's gvideo URL is dead. Get the signed
           streams from their /xhr/video endpoint instead. When the session
           handshake fails, the provider FAILS (ok:false) - the page's own
           markup only carries the dead gvideo URL or the "not available" stub
           clip, and neither may ever reach the player. */
    let epHost = '';
    try { epHost = new URL(targetUrl).hostname; } catch (e) {}
    const isEporner = /^(?:www\.)?eporner\.com$/i.test(epHost);
    if (isEporner) {
      const ep = await epornerSources(targetUrl, html);
      if (ep) { if (pageEps.length > 1) ep.eps = pageEps; return emit(ep); }
      return emit({ ok: false, error: 'eporner-session', page: targetUrl });
    }

    /* 2b-bis. MissAV video pages: unpack the eval blob for the surrit HLS. */
    if (/^(?:www\.)?missav[a-z0-9.]*$/i.test(epHost) && html) {
      const mv = missavStream(html);
      if (mv) return emit({ type: 'hls', file: mv, source: 'missav' });
    }

    /* 2b-ter. Huangguo AI Video: the page carries the first episode as a
       direct MP4. Play the file itself; the site's Next.js shell is never
       rendered inside the app. */
    if (/^(?:www\.)?huangguodrama\.(?:ai|com)$/i.test(epHost)) {
      const hg = hgResolve(html, targetUrl);
      if (hg) { if (pageEps.length > 1) hg.eps = pageEps; return emit(hg); }
    }

    /* 2c. KatMovieHD (fmovie theme): movie pages ship a `var Servers = {...}`
           blob with the TMDB/IMDB ids; series pages ship data-load-embed /
           season / episode server buttons. Both route straight into the TMDB
           provider race - real streams without a dead player middleman. */
    if (/^(?:www\.)?katmoviehd\.[a-z]+$/i.test(epHost) && html) {
      const kk = katRoute(html, rawTitle);
      if (kk) return emit(kk);
    }

    /* 2c-bis. KDramasMaza: no streams on-site at all (episode buttons point at
           a download mirror) - resolve the drama title to TMDB and race the
           providers, exactly like KatMovieHD. */
    if (/^(?:www\.)?kdramasmaza\.[a-z.]+$/i.test(epHost) && html) {
      const kd = await kdRoute(html, targetUrl, rawTitle);
      if (kd) { if (kd.file && pageEps.length > 1) kd.eps = pageEps; return emit(kd); }
    }

    /* 2c-ter. HindiDrama: watch page -> episode embed -> server table ->
       raw Streamtape mp4 / vidhide HLS. The site's switcher page is never
       mounted, so no server dropdown or site chrome can reach the player. */
    if (/^(?:www\.)?hindidrama\.[a-z.]+$/i.test(epHost)) {
      const hd = await hdResolve(targetUrl, html);
      if (hd) { if (pageEps.length > 1) hd.eps = pageEps; return emit(hd); }
    }

    /* 2d. TMDB provider shells (VidFast / VidSrc / VidLink / Videasy / ...):
       their pages hold only JS players this extractor cannot run, so when
       the page itself yielded no raw media the SAME title is resolved
       through the HindiDrama direct-stream chain instead - a real
       .mp4/.m3u8 wins where a dead shell would otherwise answer. The strict
       provider-hostname allowlist keeps this branch exclusive to the SFW
       provider ladder: custom library and vault sources can never enter. */
    if ((!media || media.type === 'embed') && rawTitle && /[a-z]{3}/i.test(rawTitle) &&
        /^(?:www\.)?(?:vidfast\.pro|vidsrc\.(?:pm|cc|to|mov|xyz|net)|vidlink\.pro|(?:player\.)?videasy\.net|embedwave\.cc|vidcore\.org|2embed\.(?:cc|to|si)|vixsrc\.to|multiembed\.mov)$/i.test(epHost)) {
      try {
        const hb = await hindidramaCached(rawTitle);
        if (hb && hb.file) return emit(hb);
      } catch (e) {}
    }

    /* 3b. Custom sources: resolve an isolated player iframe ONE level deeper -
       known file hosts through their own resolver, everything else by
       unpacking the page and looking for raw media again. */
    if (media && media.type === 'embed' && isCustom && media.embed && media.embed !== targetUrl) {
      try {
        const hn = await streamHostResolve(media.embed);
        if (hn && hn.file) media = hn;
        else {
          const r2 = await grab(media.embed, targetUrl, undefined, undefined, 12000);
          if (r2 && r2.ok) {
            const raw2 = await r2.text();
            const deep = findMedia(unpackEval(raw2) || raw2, media.embed);
            if (deep && deep.type !== 'embed') media = deep;
            else if (deep && deep.embed) {
              const hn2 = await streamHostResolve(deep.embed);
              media = (hn2 && hn2.file) ? hn2 : deep;
            }
          }
        }
      } catch (_) {}
    }

    /* 3b. Series INDEX pages of the Desi web-series providers carry the parts
           but NO stream of their own: the card opens '/series/<slug>/' while
           every part lives one hop down at '/<slug>/?ep=N'. When the page
           proved to be such an index and nothing here plays, resolve the
           ladder's FIRST part once and hand the whole ladder over - the click
           plays episode 1 and the selector knows every part. A single extra
           fetch, only for pages with no media of any kind. */
    if ((!media || media.type === 'embed') && pageEps.length > 1 && targetUrl) {
      const first = pageEps[0];
      if (first && first.url && normPageKey(first.url) !== normPageKey(targetUrl)) {
        try {
          if (first.d || MEDIA_EXT_RE.test(first.url)) {
            media = { type: /\.m3u8(?:[?#]|$)/i.test(first.url) ? 'hls' : 'direct', file: first.url };
          } else {
            const pr = await grab(first.url, targetUrl, undefined, undefined, 15000);
            if (pr && pr.status === 200) {
              const phtml = await pr.text();
              const pm = findMedia(phtml, first.url);
              if (pm && (pm.type !== 'embed' || pm.embed)) media = pm;
            }
          }
        } catch (e) {}
      }
    }
    if (media && media.type === 'embed') return emit({ type: 'embed', embed: media.embed, isolated: true, source: isCustom ? 'custom-embed' : 'embed', eps: pageEps.length > 1 ? pageEps : null });
    if (media) return emit({ type: media.type, file: media.file, source: isCustom ? 'custom-stream' : 'page-stream', eps: pageEps.length > 1 ? pageEps : null });

    /* 4. Nothing playable on the page. Only for DRM sources (MX Player /
          Amazon miniTV...) resolve the title on TMDB - fuzzy-matching OTHER
          sources' titles turns adult/junk pages into wrong movies. */
    if (DRM_RE.test(targetUrl)) {
      const t2 = await tmdbByTitle(rawTitle);
      if (t2) return emit(Object.assign({}, t2));
    }

    /* 5. Still nothing: hand back the ISOLATED player URL (headers, sidebars
          and trackers stripped by /page?hide=1) so the client shows the
          source's own player - never a raw ad-filled page. Cloudflare-blocked
          sources answer cf:true with no isolated URL at all, so the app can
          never mount a challenge screen. */
    if (cfBlocked) return emit({ ok: false, cf: true, error: 'cloudflare', page: targetUrl, isolated: '' });
    /* A page whose stream failed still hands its PART LIST over: a series card
       (the Desi web-series providers) lets the viewer pick another part
       instead of dead-ending on the one that did not resolve. */
    return emit({ ok: false, error: 'No clean stream found', page: targetUrl,
                  eps: pageEps.length > 1 ? pageEps : null,
                  isolated: targetUrl ? ('http://' + (ALT_OK ? '127.0.0.2' : '127.0.0.1') + ':' + LIVE_PORT + '/page?url=' + encodeURIComponent(targetUrl) + '&hide=1') : '' });
  }

  if (!t){ res.writeHead(400); return res.end('missing url'); }
  let url = t; try { if (!/^https?:\/\//i.test(url)) url = decodeURIComponent(url); } catch (e) {}
  let autoRef = '';
  try {
    const hh = new URL(url).hostname;
    if (/(^|\.)huangguo(?:drama)?\.(?:ai|com|chat)$/i.test(hh)) autoRef = 'https://huangguodrama.ai/';
    else if (/(^|\.)googlevideo\.com$/i.test(hh)) autoRef = 'https://www.youtube.com/';
    else if (/(^|\.)fourhoi\.com$/i.test(hh)) autoRef = 'https://missav.ws/';
  } catch (e) {}
  try {
    if (path === '/img'){
      /* A missing hotlink-protected poster is cosmetic. Return a transparent
         1x1 with HTTP 200 instead of leaking the upstream 403/404 into the
         renderer console (and into Chromium's terminal log). */
      const blank = function () {
        const px = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
        res.writeHead(200, {'Content-Type':'image/gif', 'Content-Length':px.length, 'Cache-Control':'public, max-age=600'});
        res.end(px);
      };
      let r = null;
      try { r = await grab(url, pRef || autoRef || undefined, undefined, pUA || undefined); } catch (e) {}
      const ct = r ? String(r.headers.get('content-type') || '') : '';
      if (!r || r.status >= 400 || !r.body || !/^image\//i.test(ct)) return blank();
      res.writeHead(r.status, {'Content-Type': ct || 'image/jpeg', 'Cache-Control':'public, max-age=86400'});
      return Readable.fromWeb(r.body).pipe(res);
    }
    if (path === '/raw'){
      const r = await grab(url, pRef || autoRef || undefined, req.headers.range, pUA || undefined);
      const h = {'Content-Type': r.headers.get('content-type') || 'video/mp4', 'Accept-Ranges':'bytes', 'Cache-Control':'public, max-age=3600'};
      const cr = r.headers.get('content-range'); if (cr) h['Content-Range'] = cr;
      const cl = r.headers.get('content-length'); if (cl) h['Content-Length'] = cl;
      res.writeHead(r.status, h);
      if (!r.body) return res.end();
      return Readable.fromWeb(r.body).pipe(res);
    }
    /* Eporner stream twin: every byte-range request replays the captured
       session cookie + the eporner referer, so the signed CDN serves the
       REAL video (206 responses pass straight through) instead of its
       "only available on Eporner" stub. A stub/denied answer triggers ONE
       silent re-sign (fresh cookie + fresh signature) and the same range is
       replayed before anything reaches the player. */
    if (path === '/ep') {
      const vid = u.searchParams.get('vid') || '';
      let sess = epSession(vid);
      let cookie = (sess && sess.cookie) || '';
      let target = url;
      const epHdr = function (range) {
        const h = {
          'User-Agent': UA,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.eporner.com/',
          'Origin': 'https://www.eporner.com'
        };
        if (cookie) h['Cookie'] = cookie;
        if (range) h['Range'] = String(range);
        return h;
      };
      let r = null;
      try { r = await fetch(target, { headers: epHdr(req.headers.range), redirect: 'follow' }); } catch (e) { r = null; }
      if (epIsStubResponse(r)) {
        try { if (r && r.body) r.body.cancel(); } catch (e) {}
        const freshFile = await epSessionRefresh(vid);
        sess = epSession(vid);
        cookie = (sess && sess.cookie) || cookie;
        if (freshFile && freshFile !== target) target = freshFile;
        r = null;
        try { r = await fetch(target, { headers: epHdr(req.headers.range), redirect: 'follow' }); } catch (e) { r = null; }
      }
      if (!r) { res.writeHead(502); return res.end(); }
      /* The stub itself is never streamed: a clean 502 lets the native player
         fail fast, so the app re-extracts instead of showing the warning clip. */
      if (EP_STUB_RE.test(String(r.url || '')) || r.status === 403 || r.status === 410 || r.status === 451) {
        try { if (r.body) r.body.cancel(); } catch (e) {}
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        return res.end('eporner stub');
      }
      const out = {
        'Content-Type': r.headers.get('content-type') || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      };
      const cr2 = r.headers.get('content-range'); if (cr2) out['Content-Range'] = cr2;
      const cl2 = r.headers.get('content-length'); if (cl2) out['Content-Length'] = cl2;
      res.writeHead(r.status === 206 ? 206 : (r.status === 200 ? 200 : (r.status || 502)), out);
      if (!r.body) return res.end();
      return Readable.fromWeb(r.body).pipe(res);
    }
    if (path === '/hls'){
      const r = await grab(url, pRef || undefined, undefined, pUA || undefined);
      let t = Buffer.from(await r.arrayBuffer()).toString('utf8').replace(/^\uFEFF/, '');
      if (t.indexOf('#EXTM3U') < 0) { const mm = t.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i); if (mm) { try { const r2 = await grab(mm[0]); const t2 = Buffer.from(await r2.arrayBuffer()).toString('utf8').replace(/^\uFEFF/, ''); if (t2.indexOf('#EXTM3U') >= 0) t = t2; } catch (e) {} } }
      const ab = function (u2) { try { return new URL(u2, url).href; } catch (e) { return u2; } };
      /* Segments and nested playlists are routed back through this server as
         well when a channel ships its own Referer/User-Agent. Chromium then
         never talks to a possibly-dead CDN host directly (no terminal ERR_*)
         and hotlink-protected channels keep working. */
      const proxyLine = function (u2) {
        const a = ab(u2);
        if (!/^https?:/i.test(a) || a.indexOf('127.0.0.1:' + LIVE_PORT) === 0) return a;
        const qs = (pRef ? '&ref=' + encodeURIComponent(pRef) : '') + (pUA ? '&ua=' + encodeURIComponent(pUA) : '');
        if (/\.m3u8(\?|#|$)/i.test(a)) return 'http://127.0.0.1:' + LIVE_PORT + '/hls?url=' + encodeURIComponent(a) + qs;
        if (!pRef && !pUA) return a;
        return 'http://127.0.0.1:' + LIVE_PORT + '/raw?url=' + encodeURIComponent(a) + qs;
      };
      t = t.split(/\r?\n/).map(function (ln) {
        const s = ln.trim();
        if (!s) return ln;
        if (s.charAt(0) === '#') return ln.replace(/URI="([^"]+)"/g, function (m, u2) { return 'URI="' + proxyLine(u2) + '"'; });
        return proxyLine(s);
      }).join('\n');
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
      return res.end(t);
    }
    /* /mv - fetch a page and re-serve it framable. X-Frame-Options / CSP
       headers are deliberately NOT set here: the app page lives on a
       different 127.0.0.1 port, and SAMEORIGIN blocked every iframe
       (ERR_BLOCKED_BY_RESPONSE) in the previous build. */
    if (path === '/mv'){
      const r = await grab(url, pRef || undefined, undefined, pUA || undefined);
      let html = Buffer.from(await r.arrayBuffer()).toString('utf8');
      if (isCfChallenge(r.status, html)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }); return res.end(CF_DEAD_PAGE); }
      html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
      let origin = ''; try { origin = new URL(url).origin + '/'; } catch (e) {}
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><base href="' + origin + '">');
      else html = '<base href="' + origin + '">' + html;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(html);
    }
    if (path === '/page'){
      const r = await grab(url, pRef || undefined, undefined, pUA || undefined);
      const ctype = r.headers.get('content-type') || '';
      let html = Buffer.from(await r.arrayBuffer()).toString('utf8');
      /* Cloudflare challenge: never paint it - serve the black dead page. */
      if (/text\/html|application\/xhtml/i.test(ctype) && isCfChallenge(r.status, html)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(CF_DEAD_PAGE);
      }
      /* Non-HTML (JSON APIs such as archive.org advancedsearch): pass through
         untouched so library fetchers can parse it. */
      if (!/text\/html|application\/xhtml/i.test(ctype)) {
        res.writeHead(200, { 'Content-Type': ctype || 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
        return res.end(html);
      }
      let origin = ''; try { origin = new URL(url).origin + '/'; } catch (e) {}
      html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
      if (u.searchParams.get('hide') === '1') {
        const hideCss = '<style>header,nav,.navbar,.sidebar,#sidebar,footer,.footer,.app-header,.header-container,.nav-container{display:none!important}html,body{margin:0;padding:0;background:#000;overflow:hidden}iframe,video{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;border:0!important;z-index:2147483000!important}</style>';
        if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, hideCss + '</head>');
        else html = hideCss + html;
      }
      if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, '<head$1><base href="' + origin + '">');
      else html = '<base href="' + origin + '">' + html;
      const tag = '<script src="http://127.0.0.1:' + LIVE_PORT + '/enhance.js"></scr' + 'ipt>';
      if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, tag + '</body>');
      else html += tag;
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
      return res.end(html);
    }
    const r = await grab(url, pRef || undefined, undefined, pUA || undefined);
    const body = Buffer.from(await r.arrayBuffer());
    res.writeHead(200, {'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8', 'X-Upstream-Status': String(r.status)});
    return res.end(body);
  } catch (e) {
    res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8'});
    return res.end('PROXY_ERROR: ' + (e && e.message ? e.message : String(e)));
  }
}

function start(i){
  if (i >= PORTS.length) return;
  const onReq = (req, res) => { handle(req, res).catch(e => { try { res.end('ERR ' + e.message); } catch (_) {} }); };
  const s = http.createServer(onReq);
  s.on('error', e => { if (e.code === 'EADDRINUSE') start(i + 1); });
  s.listen(PORTS[i], '127.0.0.1', () => {
    LIVE_PORT = PORTS[i];
    /* Iron-wall embed isolation: ALSO listen on the 127.0.0.2 loopback alias.
       Chromium treats it as a different site, so proxied provider/player pages
       run in their own renderer process - a hung or crashing player page can
       never freeze the app UI or kill its watchdog timers. */
    try {
      const s2 = http.createServer(onReq);
      s2.on('error', () => { ALT_OK = false; });
      s2.listen(PORTS[i], '127.0.0.2', () => { ALT_OK = true; });
    } catch (e) { ALT_OK = false; }
  });
}
start(0);
/* Hooks for the local verification harness (main.js ignores the value; a
   plain `true` would hide the internals the tests need to inspect). */
module.exports = {
  EP_SESS, EP_STUB_RE, findEpisodeLinks, epornerSources, epIsStubResponse,
  epNormPath, epNumOf, epStem, normPageKey,
  findPartLinks, mergeLadders, partNumOfText, folderBase, partsCountOf,
  LIVE_PORT: function () { return LIVE_PORT; }
};
