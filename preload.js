/* preload.js - minimal bridge. The renderer gets THREE things and nothing else:
   openExternal (browser launch) and a version tag. No filesystem, no node.
   Guarded: exposed ONLY in the app's top window - never inside guest frames
   (Electron runs preloads in every frame; exposing privileged IPC into
   third-party player iframes is exactly the "conflicting preload" class of
   problem that trips renderer IPC validation). */
if (window.top === window) {
  const { contextBridge, ipcRenderer } = require('electron');

  contextBridge.exposeInMainWorld('bridge', {
    openExternal: function (url) {
      try { if (/^https?:\/\//i.test(String(url || ''))) return ipcRenderer.invoke('open-external', String(url)); } catch (e) {}
      return false;
    },
    onCf: function (fn) {
      try { ipcRenderer.on('wab:cf', function (_e, msg) { try { fn(msg); } catch (e) {} }); } catch (e) {}
    },
    version: '3.1.0'
  });
} else {
  /* DIRECT PLAYER IFRAME WATCHDOG (cross-origin embeds like Videasy/VidLink).
     The app cannot read a direct iframe's DOM (cross-origin), but a preload
     runs INSIDE the frame: read our own DOM, and post tiny statuses to the
     app - the same protocol the /page ENHANCER uses. Nothing privileged is
     exposed to this page: no IPC, no bridge, and reporting is postMessage
     only. */
  (function () {
    var IS_YT = /(^|\.)youtube(?:-nocookie)?\.com$/i.test(location.hostname);
    /* CLICK-UNSTICK. Provider pages (vidfast and friends) inject an
       impression/ad script that watches every click at window+document
       capture and, whenever its popunder budget is exhausted (always in an
       app where popups are denied), eats the click with preventDefault +
       stopPropagation + stopImmediatePropagation before the player's own
       React controls ever hear it - every button looks dead while
       pointer-only gestures (dragging the seek bar) still work. The preload
       itself runs in an isolated world (contextIsolation), whose per-world
       event wrappers can never affect the page - so the fix is a tiny
       listener injected into the page's OWN world straight from the
       preload, before any page script exists (the ad script is an external
       file that loads later over the network). That listener is the first
       to see each real click and shadows the stop* methods (and the legacy
       cancelBubble setter) with no-ops on that single event instance, so
       nothing downstream can swallow the click on its way to the player
       UI. Nothing else changes: default actions, synthetic events, all
       other event types and every other page keep their exact semantics -
       and YouTube frames are skipped entirely. */
    if (!IS_YT) {
      var UNSTICK = '(function(){if(window.__wabUnstick)return;window.__wabUnstick=1;var noop=function(){};function unstick(ev){try{if(!ev||ev.isTrusted!==true||ev.button!==0)return;try{Object.defineProperty(ev,"stopPropagation",{configurable:true,get:function(){return noop;}});}catch(e){}try{Object.defineProperty(ev,"stopImmediatePropagation",{configurable:true,get:function(){return noop;}});}catch(e){}try{Object.defineProperty(ev,"cancelBubble",{configurable:true,get:function(){return false;},set:noop});}catch(e){}}catch(e){}}try{window.addEventListener("click",unstick,true);}catch(e){}})();';
      try {
        require('electron').webFrame.executeJavaScript(UNSTICK);
      } catch (e) {
        try {
          var su = document.createElement('script');
          su.textContent = UNSTICK;
          (document.head || document.documentElement).appendChild(su);
          if (su.parentNode) su.parentNode.removeChild(su);
        } catch (e2) {}
      }
    }
    /* YouTube ad shield: network blocking (main.js) removes the ad calls;
       this in-frame layer hides any residual ad UI and fast-forwards a
       pre-roll the instant the player marks itself as an ad. It also keeps
       the native media reporter below alive, so clean playback is provable. */
    function ytShield() {
      if (!IS_YT) return;
      try {
        if (!document.getElementById('__wabYtShield')) {
          var st = document.createElement('style');
          st.id = '__wabYtShield';
          st.textContent = [
            '.video-ads,.ytp-ad-module,.ytp-ad-overlay-container,.ytp-ad-overlay-slot',
            '.ytp-ad-player-overlay,.ytp-ad-player-overlay-layout,.ytp-ad-image-overlay',
            '.ytp-ad-text-overlay,.ytp-ad-survey,.ytp-ad-progress-list,.ytp-ad-progress',
            '.ytp-ad-skip-button-container,.ytp-suggested-action,.ytp-featured-product',
            '.ytp-merch-shelf,.ytp-pause-overlay,.ytp-ad-badge,.ytp-ad-label'
          ].join(',') + '{display:none!important;visibility:hidden!important;pointer-events:none!important}';
          (document.head || document.documentElement).appendChild(st);
        }
        var skip = document.querySelectorAll('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-overlay-close-button,.ytp-ad-survey-answer-button--dismiss');
        for (var i = 0; i < skip.length; i++) { try { skip[i].click(); } catch (e) {} }
        var pl = document.querySelector('.html5-video-player');
        var v = document.querySelector('video');
        var ad = !!(pl && pl.classList.contains('ad-showing'));
        if (v) {
          if (ad) {
            try { v.muted = true; v.playbackRate = 16; } catch (e) {}
            if (isFinite(v.duration) && v.duration > 0.5 && v.currentTime < v.duration - 0.7) {
              try { v.currentTime = Math.max(v.currentTime, v.duration - 0.4); } catch (e) {}
            }
          } else if (v.__wabAdMode) {
            try { v.muted = false; v.playbackRate = 1; } catch (e) {}
          }
          v.__wabAdMode = ad;
        }
      } catch (e) {}
    }
    if (IS_YT) {
      ytShield();
      setInterval(ytShield, 350);
    }
    var DEAD = /we\s*could\s*n['\u2019]?t\s*find\s*(that|this|the|content|episode|movie|show)|couldn['\u2019]?t\s*find\s*(that|this|the|content|episode|movie|show)|(episode|content|video|movie|show)\s+(is\s+)?(not\s+available|unavailable)|media\s+not\s+found|not\s+found\s+in\s+our|no\s+(playable|streaming)\s+(source|stream|server)|no\s+video\s+(available|found)|stream\s+not\s+found|video\s+not\s+found|source\s+(not\s+found|unavailable)|this\s+video\s+is\s+(unavailable|private)|video\s+is\s+private/i;
    var CF = /just\s*a\s*moment|checking\s+your\s+browser|verify\s+you\s+are\s+human|verifying\s+that\s+you\s+are\s+not\s+a\s+robot|performing\s+security\s+verification|verifies\s+you\s+are\s+not\s+a\s+bot|security\s+service\s+to\s+protect|enable\s+javascript\s+and\s+cookies|attention\s+required|ddos\s+protection/i;
    /* nhplayer's player.php shows its OWN "Verifying that you are not a
       robot.." overlay while its challenge resolves - that is the player
       booting, not a Cloudflare wall. Never kill it from text alone. */
    var OWN_VERIFY = /nhplayer\.com\/player\.php/i;
    var DV = 0, dv = setInterval(function () {
      DV++;
      try {
        var v = document.querySelector('video');
        if (v && !v.paused && v.currentTime > 0.5) return;   /* really playing - stay quiet */
        var tx = (document.body && document.body.innerText || '').slice(0, 2500);
        if (tx && !IS_YT) {
          if (DEAD.test(tx)) { clearInterval(dv); try { window.parent.postMessage({ __zaiDead: 1 }, '*'); } catch (e) {} return; }
          if (DV > 12 && CF.test(tx) && !OWN_VERIFY.test(location.href)) { clearInterval(dv); try { window.parent.postMessage({ __zaiDead: 1 }, '*'); } catch (e) {} return; }
        }
      } catch (e) {}
      if (DV > 40) clearInterval(dv);
    }, 800);
    var MR = 0, mr = setInterval(function () {
      MR++;
      try {
        var v = document.querySelector('video');
        var d = (v && !v.paused && v.currentTime > 0.2)
          ? { rs: v.readyState, ct: Math.round((v.currentTime || 0) * 100) / 100, paused: !!v.paused, w: v.videoWidth || 0 }
          : null;
        try { window.parent.postMessage({ __zaiMedia: d }, '*'); } catch (e) {}
      } catch (e) {}
      if (MR > 600) clearInterval(mr);
    }, 1000);
    /* Gentle autostart: press the usual big play buttons and resume a paused
       video that already has data - never touch a page mid-buffering. */
    var NT = 0, nv = setInterval(function () {
      NT++;
      try {
        var v = document.querySelector('video');
        if (v && !v.paused) { clearInterval(nv); return; }
        if (v && v.paused && v.readyState >= 2) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
        var b = document.querySelector('.vjs-big-play-button,.jw-display-icon-container,.ytp-large-play-button,[class*="big-play"],[class*="play-btn"],[class*="playButton"],.play-button,.play_button,#play,.btn-play,.p-pulse,button[aria-label*="lay" i]');
        if (b && !b.__zaiNudged && (b.offsetWidth || 0) > 10) { b.__zaiNudged = 1; try { b.click(); } catch (e) {} }
      } catch (e) {}
      if (NT > 45) clearInterval(nv);
    }, 900);
  })();
}
