/* libraries.js - WatchAnyBox custom-library scrapers (data in, items out).
   ---------------------------------------------------------------------------
   Every function returns plain item arrays; the renderer turns them into cards.
   Fetch strategy for any URL: Chromium/direct fetch first (it reaches hosts
   Node cannot), then the local /extract + /page proxy, then allorigins.
   Nothing here draws UI, plays video or knows about the server scanner. */
(function () {
  'use strict';
  if (window.SC) return;
  var ZAI = window.ZAI || {};
  var PORTS = [46901, 46902, 46903];
  var enc = encodeURIComponent;

  /* ---------------- proxy base (srv2 live port) ---------------- */
  var BASE = null, ALT = null, baseP = null;
  /* The backend also listens on the 127.0.0.2 loopback alias - a DIFFERENT
     site for Chromium, so proxied video-player pages get their own renderer
     process and a hung/crashing player can never freeze the app's own UI. */
  function base() {
    if (BASE) return Promise.resolve(BASE);
    if (baseP) return baseP;
    baseP = (function () {
      var i = 0;
      return new Promise(function (res) {
        (function nx() {
          if (i >= PORTS.length) { BASE = 'http://127.0.0.1:46901'; ALT = BASE; return res(BASE); }
          var p = PORTS[i++];
          fetch('http://127.0.0.1:' + p + '/ping', { cache: 'no-store' })
            .then(function (r) { return r.json(); })
            .then(function (j) {
              BASE = 'http://127.0.0.1:' + p;
              ALT = (j && j.alt) ? 'http://' + j.alt : BASE;
              res(BASE);
            })
            .catch(nx);
        })();
      });
    })();
    return baseP;
  }
  function alt() {
    return base().then(function () { return ALT || BASE; });
  }

  function withTimeout(p, ms) {
    return Promise.race([
      p,
      new Promise(function (_z, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })
    ]);
  }

  /* Chromium FIRST: the renderer's real browser fingerprint plus the session's
     clearance cookies sail through Cloudflare challenges and per-IP scraping
     rate limits that stall the Node proxy (katmoviehd.pk, hentaicity, ...). The
     Node proxy and allorigins stay as silent fallbacks.
     NOTE: the bare "challenge-platform" string also appears on NORMAL pages
     (the benign /cdn-cgi/challenge-platform/scripts/jsd/main.js snippet), so
     only real interstitial markers count - a false positive here throws away
     a perfectly good direct fetch and cascades into the slow fallbacks. */
  function cfChallenge(t) {
    return /just a moment|enable javascript and cookies|checking your browser|cf-chl|cf_chl_opt|ddos protection|challenge-platform\/h\//i.test(String(t).slice(0, 4000));
  }
  async function fetchText(u, ms) {
    ms = ms || 12000;
    try {
      var rd = await withTimeout(fetch(u, { cache: 'no-store' }), ms);
      if (rd && rd.ok) { var td = await withTimeout(rd.text(), ms); if (td && td.length > 40 && !cfChallenge(td)) return td; }
    } catch (e) {}
    try {
      var B = await base();
      var rp = await withTimeout(fetch(B + '/page?url=' + enc(u), { cache: 'no-store' }), ms);
      if (rp && rp.ok) { var tp = await withTimeout(rp.text(), ms); if (tp && tp.length > 40 && tp.indexOf('PROXY_ERROR') !== 0 && !cfChallenge(tp)) return tp; }
    } catch (e) {}
    var ra = await withTimeout(fetch('https://api.allorigins.win/raw?url=' + enc(u), { cache: 'no-store' }), ms);
    if (!ra.ok) throw new Error('HTTP ' + ra.status);
    return await ra.text();
  }

  async function fetchJSON(u, ms) {
    try {
      var rd = await withTimeout(fetch(u, { cache: 'no-store' }), ms || 12000);
      if (rd && rd.ok) { var t = await rd.text(); if (t && t.trim().charAt(0) !== '<') return JSON.parse(t); }
    } catch (e) {}
    var tx = await fetchText(u, ms || 12000);
    return JSON.parse(tx);
  }

  /* JSON APIs that rate-limit the renderer (Eporner returns 503 to direct
     browser calls) go through the local proxy first: upstream failures stay
     server-side and never paint a red network entry in DevTools. */
  async function fetchJSONProxy(u, ms) {
    try {
      var B = await base();
      var rp = await withTimeout(fetch(B + '/page?url=' + enc(u), { cache: 'no-store' }), ms || 12000);
      if (rp && rp.ok) {
        var t = await withTimeout(rp.text(), ms || 12000);
        t = String(t || '').trim();
        if (t && t.charAt(0) !== '<' && t.indexOf('PROXY_ERROR') !== 0) return JSON.parse(t);
      }
    } catch (e) {}
    return fetchJSON(u, ms);
  }

  /* ---------------- small html helpers ---------------- */
  function strip(s) { return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function decode(s) {
    return String(s || '')
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return m; } })
      .replace(/&#(\d+);/g, function (m, d) { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return m; } })
      .replace(/&nbsp;/gi, ' ').replace(/&hellip;/gi, '\u2026')
      .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'")
      .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  }
  function abs(u, b) {
    try { return new URL(decode(u), b).href; } catch (e) { return ''; }
  }
  var JUNK = /(facebook|twitter|x\.com|instagram|telegram|whatsapp|pinterest|reddit|linkedin|youtube\.com\/(channel|user)|wp-login|wp-admin|\/feed|\.(css|js|json|png|jpg|jpeg|gif|svg|webp|ico)(\?|$)|doubleclick|exoclick|juicyads|popads|googlesyndication|\/tag\/|\/author\/|\/page\/\d+|\/comment)/i;

  /* Site chrome never becomes a card and never reaches the player
     ("LINK CLICK", "Download", "Watch Online", "Read more", "logo", ...). */
  var JUNK_TITLE = /^(link\s*click|click(\s*here)?(\s*(to|for|and))?(\s*(watch|play|download|stream|view))?(\s*(now|online|free|movie|video))?|watch(\s*(now|online|free|movie|video))?|download(\s*(now|links?|here|movie))?|play(\s*(now|online))?|read\s*more|view\s*more|continue\s*reading|see\s*more|show\s*more|load\s*more|sorry|oops|more|next|prev(ious)?|home|menu|login|log\s*in|register|sign\s*up|search|all|movies?|series|episodes?|untitled|no\s*title|logo|icon|banner|sprite|spacer|placeholder|thumbnail|avatar|default|loading|spinner|overlay|privacy\s*policy|dmca|contact(\s*us)?|about(\s*us)?)$/i;

  /* SEO tails scrapers bake into titles ("X - Free Online", "Y Watch Online
     HD", "Z 2024 Dual Audio 480p"). Two tiers: full boilerplate phrases strip
     after any separator; bare single words (free|online|full|hd|4k|480p)
     strip only behind explicit punctuation - so "Born Free" survives. */
  var TITLE_TAIL_STRONG = /[\s\-–—|:·]*\s*(?:free\s*online(?:\s*(?:hd|4k|\d{3,4}p))?|watch\s*online(?:\s*free)?(?:\s*(?:hd|4k|\d{3,4}p))?|online\s*free(?:\s*(?:hd|4k))?|free\s*download(?:\s*(?:hd|4k))?|download\s*(?:free|now|links?)|full\s*(?:movie|episode|ep|video|series)|(?:hd|4k|\d{3,4}p)(?:\s*(?:hd|4k|\d{3,4}p))*)\s*$/i;
  var TITLE_TAIL_WEAK = /[\-–—|:·]\s*(?:free|online|full|hd|4k|\d{3,4}p)\s*$/i;
  function cleanTitle(s) {
    s = decode(s);
    for (var i = 0; i < 4; i++) {
      var next = s.replace(TITLE_TAIL_STRONG, '').replace(TITLE_TAIL_WEAK, '');
      if (next === s) break;
      s = next;
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  function firstImg(inner) {
    var m = inner.match(/<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i);
    if (!m) return '';
    var u = decode(m[1]).trim();
    if (/^data:/i.test(u) || /(1x1|pixel|blank|placeholder|spacer)/i.test(u)) {
      var m2 = inner.match(/<img[^>]+(?:data-src|data-lazy-src|data-original)=["']([^"']+)["']/i);
      return m2 ? decode(m2[1]).trim() : '';
    }
    return u;
  }
  function imgAlt(inner) { var m = inner.match(/<img[^>]+alt=["']([^"']+)["']/i); return m ? strip(m[1]) : ''; }

  /* ---------------- universal episode ladder (client side) ----------------
     Mirrors the backend rules (srv2.findEpisodeLinks): an episode token in a
     URL ('-s1-e5', 's01e05', '1x05', 'episode-3', 'part-2', '?ep=4') pins the
     show, and every same-host link with the SAME normalized shape - or, from a
     series landing page, the same path extended by one short episode token -
     is a sibling episode. Cloudflare-protected providers (Hentaicity)
     cannot be read by the Node backend but ARE readable here in the real
     browser session, so the ladder is parsed from HTML the renderer already
     fetched. Nothing else (page 2 of a list, another show) ever qualifies. */
  function ladderNorm(p) {
    return String(p || '').toLowerCase().replace(/\/+$/, '')
      .replace(/(^|[^a-z0-9])s(?:eason)?[._-]?(\d{1,2})[._-]?e(?:p(?:isode)?)?[._-]?(\d{1,4})(?=$|[^a-z0-9])/g, '$1s$2e#')
      .replace(/(^|[^a-z0-9])(\d{1,2})[._-]?x[._-]?(\d{1,4})(?=$|[^a-z0-9])/g, '$1s$2e#')
      .replace(/(^|[^a-z0-9])(episodes?|eps?|e|parts?|pts?|vol(?:ume)?s?|chapters?|chaps?)[._-]?(\d{1,4})(?=$|[^a-z0-9])/g, '$1$2#')
      .replace(/([?&](?:episode|ep|e|part|pt|vol|volume|chapter|chap)=)\d{1,4}/g, '$1#')
      /* Same rule as the backend: query noise riding along with the episode
         token ('?ep=3&x=1') is not a different episode. */
      .replace(/#(?:&[\s\S]*|#[\s\S]*)?$/g, '#');
  }
  function ladderNum(p) {
    var t = String(p || '').toLowerCase();
    var m = t.match(/(?:^|[^a-z0-9])s(?:eason)?[._-]?(\d{1,2})[._-]?e(?:p(?:isode)?)?[._-]?(\d{1,4})(?=$|[^a-z0-9])/);
    if (m) return { s: Number(m[1]) || 0, n: Number(m[2]) || 0 };
    m = t.match(/(?:^|[^a-z0-9])(\d{1,2})[._-]?x[._-]?(\d{1,4})(?=$|[^a-z0-9])/);
    if (m) return { s: Number(m[1]) || 0, n: Number(m[2]) || 0 };
    m = t.match(/(?:^|[^a-z0-9])(?:episodes?|eps?|e|parts?|pts?|vol(?:ume)?s?|chapters?|chaps?)[._-]?(\d{1,4})(?=$|[^a-z0-9]|$)/);
    if (m) return { s: 0, n: Number(m[1]) || 0 };
    m = t.match(/[?&](?:episode|ep|e|part|pt|vol|volume|chapter|chap)=(\d{1,4})(?:&|#|$)/);
    if (m) return { s: 0, n: Number(m[1]) || 0 };
    return null;
  }
  function ladderStem(norm) { return String(norm || '').split('#').join('').replace(/[-_./]+$/, ''); }
  /* The part number carried by a LINK TEXT ("Episode 3", "Part 2", "Video 8").
     Only ever used for links that provably live inside the page's own series
     folder, so prose or a card badge can never invent an episode. */
  var PART_TEXT_RE = /(?:^|[^0-9a-z])(?:episodes?|eps?|parts?|pts?|videos?|vids?|vol(?:ume)?s?|chapters?|chaps?)[._\- ]?(\d{1,4})(?=[^0-9]|$)/i;
  var PART_TEXT_TAIL_RE = /^\s*(\d{1,4})\s*(?:videos?|vids?|episodes?|eps?|parts?|pts?)\s*$/i;
  function partNumOfText(txt) {
    var s = String(txt || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 160) return null;
    var m = s.match(/(?:^|[^0-9a-z])s(?:eason)?[._\- ]?(\d{1,2})[._\- ]?e(?:p(?:isode)?)?[._\- ]?(\d{1,4})(?=$|[^0-9])/i);
    if (m) return { s: Number(m[1]) || 0, n: Number(m[2]) || 0 };
    m = s.match(PART_TEXT_RE) || s.match(PART_TEXT_TAIL_RE);
    if (m) return { s: 0, n: Number(m[1]) || 0 };
    return null;
  }
  /* Page parts inside ONE folder ('/show/1', '/show/2', ...): the trailing
     number is only a part number when every candidate shares the same base and
     the numbers are consecutive from 1 - pagination and site-wide numbering
     can never satisfy that. */
  function folderBase(p) { return String(p || '').replace(/\/+$/, '').replace(/[._\-]?\d{1,4}$/, '').replace(/[-_./]+$/, '').toLowerCase(); }
  /* The LAST path segment (the slug) of a URL path: '/series/<slug>/' indexes
     the parts of '/<slug>/?ep=N', so the slug ties a series index to its own
     parts even when they live in different folders. */
  function leafOf(p) {
    var segs = String(p || '').toLowerCase().split(/[?#]/)[0].split('/').filter(Boolean);
    return segs.length ? segs[segs.length - 1] : '';
  }
  var PART_QUERY_NOISE_RE = /[?&](?:paged?|page|p|start|offset|sort|order|filter|tab|view)=/i;
  var PART_LINK_JUNK_RE = /(facebook|twitter|instagram|telegram|whatsapp|pinterest|reddit|linkedin|youtube\.com\/(channel|user)|wp-login|wp-admin|\/feed|\/page\/\d+|\/paged?\/|\/tag\/|\/author\/|\/comment|\.(?:css|js|json|png|jpg|jpeg|gif|svg|webp|ico)(?:[?#]|$))/i;

  /* ------------------------------------------------------------------------
     PARTS / EPISODE LADDER of a page, in FIVE provable shapes:
       A) sibling episode pages  - the URL itself carries an episode token
          ('-s1-e5', 'episode-3', 'part-2', '?ep=4') and the normalized shape
          matches the page (or extends the page's own series stem);
       B) titled part links      - the URL has no token, but the LINK TEXT names
          a numbered part ("Episode 3", "Part 2", "Video 8") and the target
          provably belongs to the page's own series;
       B2) the slug rule       - '/series/<slug>/' indexes '/<slug>/?ep=N':
          same series, different folder (the Desi web-series providers);
       C) numbered folder parts  - '/show/1', '/show/2', ... with bare-number
          link text, consecutive from 1, one shared folder;
       D) direct media parts     - the page itself holds several media files
          (a "8 Videos" page). Only accepted when every URL is numbered or the
          page declares the count, so a player + trailer pair never qualifies.
     When the ladder numbers start at 2, the show's own '/<slug>/' link (or the
     page itself) becomes part 1 - the site's own first card points there.
     opts.media === false disables shape D (used for single-video providers).
     ------------------------------------------------------------------------ */
  function partsFromHtml(html, pageUrl, opts) {
    opts = opts || {};
    var out = [], anchors = [], folder = [], medias = [], slugLinks = [], flat = [];
    var seenA = {}, seenF = {}, seenM = {};
    var curHost = '', curPath = '', curQuery = '';
    try {
      var cu = new URL(pageUrl);
      curHost = cu.hostname.replace(/^www\./i, '');
      curPath = cu.pathname;
      curQuery = cu.search || '';
    } catch (e) { return out; }
    var src = String(html || '').replace(/\\\//g, '/').replace(/\\u002F/gi, '/');
    var curNorm = ladderNorm(curPath + curQuery);
    var curNum = ladderNum(curPath + curQuery);
    var curIsEp = curNorm.indexOf('#') >= 0 || !!curNum;
    var curStem = ladderStem(curNorm);
    var curLeaf = leafOf(curPath);
    var curBase = folderBase(curPath);
    var curPathKey = curPath.replace(/\/+$/, '').toLowerCase();
    var keyOf = function (u) { return String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase(); };
    /* Does this link provably belong to the SAME show as the page? Same
       normalized shape/stem (the classic rule) OR the same series slug under a
       different folder ('/series/aadhi-gharwali/' -> '/aadhi-gharwali/?ep=N').
       A number is still required before either rule runs. */
    var sibling = function (norm2, path2) {
      var stem2 = ladderStem(norm2);
      if (stem2 === curStem) return true;
      if (curStem.length >= 4 && stem2.indexOf(curStem) === 0 && (stem2.length - curStem.length) <= 48) return true;
      var leaf2 = leafOf(path2);
      if (!curLeaf || curLeaf.length < 3 || !leaf2) return false;
      return leaf2 === curLeaf || leaf2.indexOf(curLeaf + '-') === 0 ||
             leaf2.indexOf(curLeaf + '_') === 0 || leaf2.indexOf(curLeaf + '.') === 0;
    };
    /* Parts are identified by their NUMBER: the href repeats (thumbnail +
       title links) while a path-only key would collapse the query-token
       ladder ('?ep=2' vs '?ep=3') into one entry. */
    var add = function (seen2, list, url, num, title, direct) {
      var u = String(url).replace(/#.*$/, '');
      if (!u) return;
      var n0 = Number(num && num.n) || 0, s0 = Number(num && num.s) || 0;
      var t0 = String(title || '').trim();
      /* A thumbnail anchor wraps the whole card, so its text is the RUN TIME
         ("21:37") - never a title. */
      if (/^\d{1,3}:\d{2}(?::\d{2})?$/.test(t0)) t0 = '';
      var k = n0 ? (s0 + '|' + n0) : ('u|' + keyOf(u));
      var ex = seen2[k];
      if (ex) {
        var named = function (x) { return /(?:episode|ep|part|pt|video|vid|vol(?:ume)?)\s*\d{1,4}/i.test(String(x || '')); };
        if (t0 && (!ex.t || (!named(ex.t) && named(t0)))) ex.t = t0.slice(0, 120);
        if (direct && !ex.d) ex.d = 1;
        return;
      }
      var obj = { n: n0, s: s0, url: u, t: t0.slice(0, 120), d: direct ? 1 : 0 };
      seen2[k] = obj;
      list.push(obj);
    };
    var anchorRe = /<a\s+([^>]*)>([\s\S]{0,600}?)<\/a>/gi, m;
    while ((m = anchorRe.exec(src))) {
      var attrs = m[1], inner = m[2];
      var hm = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hm) continue;
      var href = decode(hm[1]).trim();
      if (!href || href.charAt(0) === '#' || /^(?:javascript|mailto|tel|data):/i.test(href)) continue;
      var a = abs(href, pageUrl);
      if (!a || PART_LINK_JUNK_RE.test(a)) continue;
      var h2 = '', p2 = '', q2 = '';
      try { var tu = new URL(a); h2 = tu.hostname.replace(/^www\./i, ''); p2 = tu.pathname; q2 = tu.search || ''; } catch (e) { continue; }
      if (h2 !== curHost) continue;
      var title = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      var full2 = p2 + q2;
      var num = ladderNum(full2);
      var norm2 = ladderNorm(full2);
      if (num && norm2.indexOf('#') >= 0) {
        /* (A) token sibling: the same rule the backend uses. */
        if (norm2 === curNorm || sibling(norm2, p2)) add(seenA, anchors, a, num, title, 0);
        continue;
      }
      if (PART_QUERY_NOISE_RE.test(q2)) continue;
      /* (B) titled part link: the number comes from the LINK TEXT, so the
         target must provably belong to THIS page's own series. */
      var tnum = partNumOfText(title);
      if (tnum && tnum.n >= 1 && sibling(norm2, p2)) { add(seenA, anchors, a, tnum, title, 0); continue; }
      /* (E) the show's own page: same slug, no number token anywhere - that
         link IS the first part on these series index pages ('/<slug>/' plays
         episode 1). Recorded, adopted only when no numbered part 1 exists. */
      if (!curIsEp && curLeaf.length >= 3 && leafOf(p2) === curLeaf && p2.replace(/\/+$/, '').toLowerCase() !== curPathKey) {
        slugLinks.push({ url: a, t: title });
        continue;
      }
      /* (C) bare-number part in the page's own folder. */
      var bare = title.match(/^\s*(\d{1,3})\s*$/);
      if (bare && curBase && curBase.length >= 3 && folderBase(p2) === curBase && p2.replace(/\/+$/, '').toLowerCase() !== curPathKey) {
        add(seenF, folder, a, { s: 0, n: Number(bare[1]) || 0 }, title, 0);
      }
    }
    /* (D) the page's own media files (several parts on ONE page). */
    if (opts.media !== false) {
      var mediaRe = /<(?:video|source|audio)[^>]*\bsrc\s*=\s*["']([^"']+)["']|["'](?:file|src|source|url|contentUrl|videoUrl|video_url|stream|mp4|m3u8|sd|hd)["']\s*:\s*["']([^"']{6,700})["']|data-(?:src|file|video|video-src|stream|hls|mp4|url)\s*=\s*["']([^"']+)["']/gi;
      while ((m = mediaRe.exec(src))) {
        var mu = m[1] || m[2] || m[3] || '';
        var mm = abs(mu, pageUrl);
        if (!mm || !/\.(?:mp4|webm|m4v|m3u8)(?:[?#]|$)/i.test(mm)) continue;
        var mn = ladderNum(mm) || partNumOfText(String(mu));
        flat.push({ url: mm, n: Number(mn && mn.n) || 0, s: Number(mn && mn.s) || 0 });
      }
      var uniqM = [], mseen = {};
      flat.forEach(function (x) {
        var k = keyOf(x.url);
        if (!k || mseen[k]) return;
        mseen[k] = 1;
        uniqM.push(x);
      });
      var pageCount = partsCountOf(src.slice(0, 4000)) ||
                      partsCountOf((src.match(/<h1[^>]*>([\s\S]{0,200}?)<\/h1>/i) || [])[1] || '') ||
                      partsCountOf((src.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i) || [])[1] || '');
      var numbered = uniqM.length > 1 && uniqM.every(function (x) { return x.n >= 1; });
      if (uniqM.length > 1 && (numbered || pageCount >= 2)) {
        uniqM.forEach(function (x, i) { add(seenM, medias, x.url, { s: x.s || 0, n: x.n || (i + 1) }, 'Part ' + (x.n || (i + 1)), 1); });
      }
    }
    var finish = function (list) {
      var s2 = list.slice(0, 200);
      s2.sort(function (x, y) { return (x.s - y.s) || (x.n - y.n); });
      s2.forEach(function (x, i) { if (!x.n) x.n = i + 1; });
      return s2;
    };
    if (anchors.length) {
      /* The show's own '/<slug>/' link IS episode 1 on these series indexes:
         adopt it even when the page lists a single numbered part. */
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
      var nums = folder.map(function (x) { return x.n; }).sort(function (x, y) { return x - y; });
      var consecutive = nums.every(function (v, i) { return v === i + 1; });
      if (consecutive) {
        if (curIsEp && curNum && curNum.n >= 1 && folderBase(curPath) === curBase) add(seenF, folder, pageUrl, curNum, '', 0);
        return finish(folder);
      }
    }
    if (medias.length > 1) return finish(medias);
    return out;
  }
  /* The classic token-only ladder: kept for providers whose pages hold ONE
     video (hentai players) - media parts never apply there. */
  function ladderFromHtml(html, pageUrl) {
    return partsFromHtml(html, pageUrl, { media: false });
  }
  /* Client-side part scrape for the Web Series tab: the Desi series pages are
     readable from the real browser session, so the dropdown is filled here
     even when the Node backend cannot fetch the mirror. */
  async function xsEpisodes(pageUrl, title) {
    if (!pageUrl) return null;
    var html = '';
    try { html = await fetchText(pageUrl, 15000); } catch (e) { return null; }
    if (!html) return null;
    var parts = [];
    try { parts = partsFromHtml(html, pageUrl, { media: true }); } catch (e) { parts = []; }
    if (parts.length < 2) return null;
    return {
      title: String(title || ''),
      episodes: parts.map(function (p, i) {
        return { ep: p.n || (i + 1), title: p.t || ('Episode ' + (p.n || (i + 1))), url: p.url, direct: !!p.d };
      })
    };
  }

  /* Generic list-page card parser: anchors that carry a thumbnail image.
     Works for KatMovieHD / KatDrama / KDramasMaza / PikaHD / XMaal and any
     WordPress-style mirror; the host/base filter keeps navigation links out. */
  /* "8 Videos" / "2 Episodes" / "5 Parts" printed on a card IS the part count
     of a multi-video series page (Desi web-series providers badge their series
     cards with it). The count and the word both have to be present, so a
     duration ("12:45") or a year can never be mistaken for it. */
  var PARTS_BADGE_RE = /(?:^|[^0-9a-z])(\d{1,3})\s*(?:videos?|vids?|episodes?|eps|parts?|pts)(?=[^0-9a-z]|$)/i;
  function partsCountOf(txt) {
    var m = String(txt || '').match(PARTS_BADGE_RE);
    if (!m) return 0;
    var n = Number(m[1]) || 0;
    return (n >= 2 && n <= 500) ? n : 0;
  }
  function parseAnchorCards(html, baseUrl, opts) {
    opts = opts || {};
    var out = [], seen = {}, re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, m;
    var wantHost = ''; try { wantHost = new URL(baseUrl).hostname.replace(/^www\./, ''); } catch (e) {}
    while ((m = re.exec(html))) {
      var href = decode(m[1]).trim(), inner = m[2];
      if (!href || href.charAt(0) === '#' || JUNK.test(href)) continue;
      var a = abs(href, baseUrl);
      if (!a) continue;
      var host = ''; try { host = new URL(a).hostname.replace(/^www\./, ''); } catch (e) { continue; }
      var sameSite = (host === wantHost) || /\.(top|my|net|in|pro|com\.co|la|cz|co|ws|xxx)$/.test(host) && (host.indexOf(wantHost.split('.').slice(-2).join('.')) >= 0 || wantHost.indexOf(host.split('.').slice(-2).join('.')) >= 0);
      if (!sameSite) continue;
      if (/^\/?(category|categories|tag|tags|page|author|genre|season|wp-content|cdn-cgi)\b/i.test(a.split(host)[1] || '')) continue;
      var img = firstImg(inner);
      if (!img) continue;
      var title = '';
      var h = inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
      if (h) title = strip(h[1]);
      if (!title) title = imgAlt(inner);
      if (!title) title = strip(inner);
      title = cleanTitle(title).slice(0, 110);
      if (!title || title.length < 3 || JUNK_TITLE.test(title)) continue;
      if (opts.slugFilter && !opts.slugFilter.test(a)) continue;
      if (seen[a]) continue;
      seen[a] = 1;
      var badge = '';
      var bm = inner.match(/class=["'][^"']*(?:badge|duration|runtime|episodes?|count|parts|videos?)[^"']*["'][^>]*>([^<]{1,20})</i);
      if (bm) badge = strip(bm[1]);
      /* Series tagging: an explicit row flag (the whole XMaal catalogue is made
         of multi-video series) OR a real part-count badge on the card. Either
         way the card enters the app carrying isSeries + type:'tv' so the player
         is required to mount the Season/Episode dropdown and Next/Prev. */
      var cnt = partsCountOf(bm ? bm[1] : '') || partsCountOf(inner.slice(0, 160));
      var card = { t: title, poster: abs(img, baseUrl), page: a, badge: badge, kind: opts.kind || 'kat' };
      if (opts.series || cnt) {
        card.isSeries = true;
        card.type = 'tv';
        card.parts = cnt || 0;
      }
      out.push(card);
      if (out.length >= 60) break;
    }
    return out;
  }

  var SC = {};

  /* ---------------- Kat-style rows (KatMovieHD / KatDrama / KDramasMaza / PikaHD / KatMovie18) ---------------- */
  async function katRow(row) {
    var html = await fetchText(row.u, 15000);
    var items = parseAnchorCards(html, row.u, { kind: row.k, slugFilter: /\.(html?|php)(\?|$)/i.test(row.u) ? null : /\/[a-z0-9-]+\/?$/i });
    if (!items.length) items = parseAnchorCards(html, row.u, { kind: row.k });
    items.forEach(function (it) { it.badge = it.badge || (row.k === 'kd' ? 'KD' : 'KAT'); it.src = row.t; });
    return items;
  }

  /* ---------------- HindiDrama rows (K-Drama tab) ---------------- */
  /* Card: <div class="course-box shop-wrapper"> <a href=".../watch-<slug>">
     <div class="image-wrap entry"><div class="badge"> Drama</div>
     <img src="poster"/></div></a> ... <h4><a ...>Title</a></h4> ... */
  function hdClean(t) {
    var s = cleanTitle(strip(t)).replace(/\s+/g, ' ').trim();
    s = s.replace(/\s*[|\u2013\u2014-]\s*watch[\s\S]*$/i, '');
    s = s.replace(/\s*[|\u2013\u2014-]\s*(?:hindi\s*drama|hindidrama)[\s\S]*$/i, '');
    s = s.replace(/\s+hindi\s+dubbed\s*$/i, '');
    s = s.replace(/\s*(?:full\s*episodes?|all\s*episodes?)\s*$/i, '');
    return s.replace(/\s+/g, ' ').trim().slice(0, 110);
  }
  function parseHd(html, baseUrl) {
    var out = [], seen = {};
    var re = /<a\s+[^>]*href=["']([^"']*\/hindi-dubbed-online\/watch-[^"']+)["'][^>]*>([\s\S]{0,1200}?)<\/a>/gi, m;
    while ((m = re.exec(html))) {
      var a = abs(decode(m[1]), baseUrl);
      if (!a || seen[a]) continue;
      var inner = m[2];
      var im = inner.match(/<img[^>]+(?:data-src|data-lazy-src|data-original|src)=["']([^"']+)["']/i);
      if (!im) continue;                   /* only the poster anchor opens a card */
      var win = html.slice(m.index, m.index + 1800);
      var h4 = win.match(/<h4[^>]*>[\s\S]{0,200}?<a[^>]*>([\s\S]*?)<\/a>/i) || win.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i);
      var title = h4 ? hdClean(h4[1]) : '';
      if (!title) title = hdClean(imgAlt(inner));
      if (!title || title.length < 2 || JUNK_TITLE.test(title) || /^drama$/i.test(title)) continue;
      seen[a] = 1;
      out.push({ t: title, poster: abs(decode(im[1]), baseUrl), page: a, kind: 'hd', badge: 'HD' });
      if (out.length >= 60) break;
    }
    return out;
  }
  async function hdRow(row) {
    var html = await fetchText(row.u, 16000);
    var items = parseHd(html, row.u);
    items.forEach(function (it) { it.badge = 'HD'; it.src = row.t; });
    return items;
  }
  async function hdSearch(q) {
    var term = String(q || '').trim();
    if (!term) return [];
    var html = await fetchText('https://hindidrama.net/search.php?search=' + enc(term), 15000);
    var items = parseHd(html, 'https://hindidrama.net/');
    items.forEach(function (it) { it.badge = 'RES'; });
    return items.slice(0, 24);
  }

  /* ---------------- XMaal rows (Web Series, direct mp4 pages) ----------------
     Every XMaal row is a SERIES catalogue (Desi web series: Siskiyaan, Shahad,
     Aadhi Gharwali...). The cards are titles whose own page holds the parts
     ("8 Videos" / "2 Videos"), so every card is tagged isSeries + type:'tv'
     here - the player then mounts the Season/Episode dropdown and Next/Prev
     for them, exactly like a TMDB show. Rows may opt out with series:false. */
  var xHost = null;
  async function xsRow(path, row) {
    var mirrors = xHost ? [xHost].concat(ZAI.XMAAL.mirrors) : ZAI.XMAAL.mirrors;
    var opts = { kind: 'xs', series: !(row && row.series === false) };
    for (var i = 0; i < mirrors.length; i++) {
      try {
        var html = await fetchText(mirrors[i] + path, 14000);
        var items = parseAnchorCards(html, mirrors[i], opts);
        if (items.length) { xHost = mirrors[i]; return items; }
      } catch (e) {}
    }
    return [];
  }

  /* ---------------- AniMixPlay rows ---------------- */
  var anHost = null;
  async function anxRow(path) {
    var mirrors = anHost ? [anHost].concat(ZAI.ANIMIX.mirrors) : ZAI.ANIMIX.mirrors;
    for (var i = 0; i < mirrors.length; i++) {
      try {
        var html = await fetchText(mirrors[i] + path, 14000);
        var items = parseAnchorCards(html, mirrors[i], { kind: 'anx', slugFilter: /\/v1\//i });
        if (items.length) { anHost = mirrors[i]; return items; }
      } catch (e) {}
    }
    return [];
  }

  /* ---------------- Eporner (18+) ---------------- */
  async function epRow(row) {
    var u = 'https://www.eporner.com/api/v2/video/search/?query=' + enc(row.q || '') +
            '&per_page=30&page=1&thumbsize=big&order=' + enc(row.order || 'top-weekly') + '&format=json';
    var j = await fetchJSONProxy(u, 14000);
    var vids = (j && j.videos) || [];
    return vids.map(function (v) {
      var t = decode(v.title || '').replace(/\s*[-|]\s*(HD|4K).*$/i, '').trim();
      return {
        t: t || 'Video', poster: (v.thumbs && (v.thumbs[0] && (v.thumbs[0].big || v.thumbs[0].src))) || v.thumb || '',
        page: v.embed || ('https://www.eporner.com/embed/' + v.id + '/'),
        dur: v.length_min ? v.length_min + 'm' : '', badge: row.badge || 'NEW', kind: 'ep'
      };
    });
  }
  async function epSearch(q) {
    var j = await fetchJSONProxy('https://www.eporner.com/api/v2/video/search/?query=' + enc(q) +
      '&per_page=30&page=1&thumbsize=big&order=top-weekly&format=json', 12000);
    return ((j && j.videos) || []).map(function (v) {
      return { t: decode(v.title || ''), poster: (v.thumbs && (v.thumbs[0] && (v.thumbs[0].big || v.thumbs[0].src))) || '', page: v.embed || '', badge: 'RES', kind: 'ep' };
    });
  }

  /* ---------------- Rule34 (direct animation files) ---------------- */
  /* Rule34 Video (KVS tube serving full .mp4 files): real animated videos
     with clean titles. Used by the "Animated" rows + adult search; falls
     back to the generic animated feed so a row is never empty.
     STRICT DEDUPE: every post is keyed by its video id (else by normalized
     media URL) through a Set, so the exact same post can never produce two
     cards in one row - even when the feed repeats it with cosmetic URL
     differences (trailing slash, query string, two anchors per card). */
  function normMedia(u) {
    return String(u || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '')
      .replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
  /* ONE identity per post: the numeric post/video id wherever the URL carries
     one (with or without the slug, either mirror, http/https), else the
     normalized media URL. Cosmetic differences can never fork it. */
  function r34vKey(pageUrl) {
    var s = String(pageUrl || '');
    var m = s.match(/\/(?:video|videos|post|posts|view)\/(\d+)/i) || s.match(/[?&](?:id|video_id|post_id)=(\d+)/i);
    if (m) return 'v' + m[1];
    return 'u' + normMedia(s);
  }
  async function r34vRow(row) {
    var q = String(row.q || 'animated');
    var tries = [q];
    if (q !== 'animated') tries.push('animated');
    var seen = new Set(), uniq = [];
    for (var i = 0; i < tries.length; i++) {
      try {
        var u = 'https://rule34video.com/search/?q=' + enc(tries[i]) + '&sort_by=post_date&from=1';
        var html = await fetchText(u, 16000);
        var cards = parseAnchorCards(html, 'https://rule34video.com', { kind: 'r34v' });
        cards.forEach(function (c) {
          var id = r34vKey(c.page);
          var uk = 'u:' + normMedia(c.page);
          if (seen.has(id) || seen.has(uk)) return;
          seen.add(id); seen.add(uk);
          uniq.push(c);
        });
      } catch (e) {}
      if (uniq.length) break;                 /* the fallback query is a last resort only */
    }
    if (!uniq.length) return [];
    uniq.forEach(function (c) { c.badge = row.badge || 'R34'; });
    return uniq.slice(0, 40);
  }

  async function r34Row(row) {
    /* api.rule34.xxx locked its public API behind authentication and the
       site itself serves CAPTCHA to non-browser traffic. xbooru speaks the
       same gelbooru-style dapi JSON with .mp4/.webm video posts and stays
       open - the animated rows keep serving real playable video.
       The local backend feed (/r34) runs first: srv2 dedupes posts there,
       keyed by post id (fallback: normalized media URL), before anything
       reaches the DOM. The direct fetches below carry the same strict
       dedupe, and stay as the fallback when the backend is unreachable. */
    var wanted = String(row.tags || 'animated');
    try {
      var B0 = await base();
      var jp = await fetchJSON(B0 + '/r34?tags=' + enc(wanted), 14000);
      if (jp && jp.ok && Array.isArray(jp.posts) && jp.posts.length) {
        var seenS = new Set(), outS = [];
        jp.posts.forEach(function (p) {
          if (!p || !p.file) return;
          var id = String(p.id || '').trim();
          var key = id ? ('id:' + id) : ('u:' + normMedia(p.file));
          var ukey = 'u:' + normMedia(p.file);
          if (seenS.has(key) || seenS.has(ukey)) return;
          seenS.add(key); seenS.add(ukey);
          outS.push({
            t: 'R34 #' + (id || ''), poster: p.preview || '', file: String(p.file).replace(/\\\//g, '/'),
            page: p.page || '', badge: row.badge || 'R34', kind: 'r34'
          });
          if (outS.length >= 40) return;
        });
        if (outS.length) return outS;
      }
    } catch (e) {}
    var sources = [
      { u: 'https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=40&tags=', page: 'https://xbooru.com/index.php?page=post&s=view&id=' },
      { u: 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=40&tags=', page: 'https://rule34.xxx/index.php?page=post&s=view&id=' }
    ];
    var attempts = [wanted];
    if (wanted.indexOf(' ') > 0) attempts.push(wanted.split(' ')[0]);
    var arr = [], src = sources[0];
    for (var s = 0; s < sources.length && !arr.length; s++) {
      for (var a = 0; a < attempts.length && !arr.length; a++) {
        try {
          var j = await fetchJSON(sources[s].u + enc(attempts[a]), 14000);
          var list = Array.isArray(j) ? j : ((j && j.post) || []);
          var vids = list.filter(function (p) { return /\.(mp4|webm)/i.test(p.file_url || p.file_url_hd || ''); });
          if (vids.length) { arr = list; src = sources[s]; }
        } catch (e) {}
      }
    }
    var out = [], seenP = new Set(), seenU = new Set();
    arr.forEach(function (p) {
      var f = p.file_url || p.file_url_hd || '';
      if (!f || !/\.(mp4|webm)/i.test(f)) return;
      var id = String(p.id || '').trim();
      var key = id ? ('id:' + id) : ('u:' + normMedia(f));
      var ukey = 'u:' + normMedia(f);
      if (seenP.has(key) || seenP.has(ukey) || seenU.has(ukey)) return;
      seenP.add(key); seenP.add(ukey); seenU.add(ukey);
      var pre = p.preview_url || p.sample_url || '';
      if (pre && /sample\.(mp4|webm)/i.test(pre)) pre = p.preview_url || '';
      out.push({ t: 'R34 #' + (p.id || ''), poster: /\.(jpg|jpeg|png|gif|webp)/i.test(pre) ? pre : '', file: f, page: src.page + (p.id || ''), badge: row.badge || 'R34', kind: 'r34' });
      if (out.length >= 40) return;
    });
    return out;
  }

  /* ---------------- Hentaicity (direct signed HLS) ---------------- */
  /* Card markup: <a href=".../click/1-1/video/<slug>.html" class="thumb-img
     pop-execute"> with the poster <img alt="title">, <span class="time">,
     <span class="flag-hd">. Strip the /click/<n>-<n> hop to get the real
     video page; /extract turns that page into a signed master.m3u8. */
  function parseHc(html, baseUrl) {
    var out = [], seen = {}, re = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi, m;
    while ((m = re.exec(html))) {
      var attrs = m[1], inner = m[2];
      if (!/thumb-img/i.test(attrs)) continue;
      var hm = attrs.match(/href=["']([^"']+)["']/i);
      if (!hm) continue;
      var href = decode(hm[1]).trim();
      if (!href || href.charAt(0) === '#' || JUNK.test(href)) continue;
      var a = abs(href, baseUrl).replace(/\/click\/\d+-\d+/i, '');
      if (!a || a.indexOf('hentaicity.com') < 0 || !/\/video\/[a-z0-9_-]+(?:\.html)?$/i.test(a)) continue;
      if (seen[a]) continue;
      seen[a] = 1;
      var im = inner.match(/<img[^>]+src=["']([^"']+)["']/i);
      var t = decode((inner.match(/<img[^>]+alt=["']([^"']+)["']/i) || [])[1] || '').trim();
      t = cleanTitle(strip(t)).slice(0, 110);
      if (!t || t.length < 3 || JUNK_TITLE.test(t)) continue;
      var dur = strip((inner.match(/<span[^>]*class=["'][^"']*\btime\b[^"']*["'][^>]*>([^<]{1,12})</i) || [])[1] || '');
      out.push({ t: t, poster: im ? abs(decode(im[1]).trim(), baseUrl) : '', page: a, dur: dur, badge: 'H-CITY', kind: 'hc' });
      if (out.length >= 48) break;
    }
    return out;
  }
  async function hcRow(row) {
    var html = await fetchText(row.u, 16000);
    var items = parseHc(html, row.u);
    items.forEach(function (it) { it.badge = row.badge || 'H-CITY'; it.src = row.t; });
    return items;
  }
  async function hcSearch(q) {
    var term = String(q || '').trim();
    if (!term) return [];
    var tries = [
      'https://www.hentaicity.com/search/video/' + enc(term),
      'https://www.hentaicity.com/search/video/' + enc(term.replace(/\s+/g, '-'))
    ];
    for (var i = 0; i < tries.length; i++) {
      try {
        var html = await fetchText(tries[i], 14000);
        var items = parseHc(html, tries[i]);
        if (items.length) { items.forEach(function (it) { it.badge = 'RES'; }); return items.slice(0, 30); }
      } catch (e) {}
    }
    return [];
  }

  /* ---------------- Hentai.tv (JSON API; stream via nhplayer) ---------------- */
  /* /api/browse and /api/search?q= answer clean JSON; every item carries an
     embedUrl = https://nhplayer.com/v/<id>/ whose data-id holds the signed
     mp4 (url|expiry|sig) after one base64 hop. Decoded in the renderer -
     nhplayer.com is unreachable from Node (connect timeout) but perfectly
     readable from Chromium. */
  function htvItems(j, badge) {
    var vids = (j && j.videos) || [];
    var out = [], seen = {};
    vids.forEach(function (v) {
      var t = decode(v.title || '').trim();
      if (!t) return;
      var ep = Number(v.ep) || 0;
      var page = v.embedUrl || '';
      if (!page || seen[page]) return;
      seen[page] = 1;
      var cover = v.cover || v.thumb || '';
      out.push({
        t: (t + (ep ? ' - Ep ' + ep : '')).slice(0, 110),
        poster: cover ? ('https://hentai.tv' + (cover.charAt(0) === '/' ? cover : '/' + cover)) : '',
        page: page, dur: v.duration || '', badge: badge || 'HTV', kind: 'htv',
        year: v.year || '',
        /* Series grouping data: every episode of one title shares `series`,
           and `ep` is its own number - the player's episode selector reads
           these directly (titles alone can be ambiguous). */
        series: t.slice(0, 110), ep: ep
      });
    });
    return out.filter(function (it) { return !!it.page; });
  }
  async function htvRow(row) {
    var j = await fetchJSON(row.u, 16000);
    return htvItems(j, row.badge);
  }
  async function htvSearch(q) {
    var j = await fetchJSON('https://hentai.tv/api/search?q=' + enc(q), 14000);
    return htvItems(j, 'RES').slice(0, 30);
  }
  /* nhplayer decode: <li data-id="/player.php?vid=<b64>&s=<subs>&i=<img>"> ->
     atob(vid) = https://r2.1hanime.com/<name>.mp4|expiry|sig */
  async function nhStream(pageUrl) {
    if (!pageUrl) return null;
    var html = '';
    try { html = await fetchText(pageUrl, 15000); } catch (e) { return null; }
    var dm = html.match(/data-id=["']([^"']+)["']/i);
    if (!dm) return null;
    var rawAttr = decode(dm[1]);
    var vm = rawAttr.match(/[?&]vid=([^&"']+)/i);
    if (!vm) return null;
    var b64 = vm[1];
    var dec = '';
    try { dec = atob(b64); } catch (e) { return null; }
    if (!/^https?:\/\//i.test(dec)) return null;
    var sM = rawAttr.match(/[?&]s=([^&"']*)/i), iM = rawAttr.match(/[?&]i=([^&"']*)/i);
    var playerUrl = 'https://nhplayer.com/player.php?vid=' + b64 +
      (sM && sM[1] ? '&s=' + sM[1] : '') + (iM && iM[1] ? '&i=' + iM[1] : '') + '&type=';
    return { raw: dec, url: dec.split('|')[0], playerUrl: playerUrl };
  }

  /* ---------------- JAV (123av, server-side catalogue) ----------------
     The backend resolves the whole lane: one bounded upstream fetch per row
     and one /extract answer per video (native HLS). The renderer never
     scrapes the site itself, so a Cloudflare/CORS dead end cannot stall the
     row. Search falls back to the Eporner JAV shelf when 123av has no hit. */
  async function javRow(row) {
    var B = await base();
    var j = await fetchJSON(B + '/jav?row=' + enc(row.p || 'new'), 15000);
    return ((j && j.items) || []);
  }
  async function javSearch(q) {
    var term = String(q || '').trim();
    if (!term) return [];
    var B = await base();
    var out = [];
    try {
      var j = await fetchJSON(B + '/jav?q=' + enc(term), 15000);
      out = ((j && j.items) || []);
    } catch (e) {}
    if (!out.length) { try { out = await epSearch('japanese ' + term); } catch (e) {} }
    return out.slice(0, 24);
  }

  /* TMDB search through the local key-injecting proxy (adult vault only). */
  async function tmdbSearch(q, adult) {
    var B = await base();
    var j = await fetchJSON(B + '/tmdb/3/search/multi?query=' + enc(q) + '&include_adult=' + (adult ? 'true' : 'false'), 14000);
    return ((j && j.results) || []).filter(function (x) { return x.media_type === 'movie' || x.media_type === 'tv'; }).map(function (m) {
      return {
        t: m.title || m.name || '', poster: m.poster_path ? 'https://image.tmdb.org/t/p/w342' + m.poster_path : '',
        kind: 'tmdb', tmdb: m.id, mt: m.media_type === 'tv' ? 'tv' : 'movie',
        year: (m.release_date || m.first_air_date || '').slice(0, 4), badge: adult ? '18+' : ''
      };
    });
  }

  /* ---------------- Country rows (TMDB discover) ---------------- */
  async function countryRow(row) {
    var o = row.o || {};
    var B = await base();
    var p = 'sort_by=popularity.desc&include_adult=false&page=1';
    if (o.lang) p += '&with_original_language=' + o.lang;
    if (o.region) p += '&with_origin_country=' + o.region;
    var j = await fetchJSON(B + '/tmdb/3/discover/' + (o.kind || 'movie') + '?' + p, 12000);
    return ((j && j.results) || []).map(function (m) {
      return {
        t: m.title || m.name || '', poster: m.poster_path ? 'https://image.tmdb.org/t/p/w342' + m.poster_path : '',
        badge: o.badge || '', kind: 'country', tmdb: m.id, mt: (o.kind || 'movie') === 'tv' ? 'tv' : 'movie',
        year: (m.release_date || m.first_air_date || '').slice(0, 4)
      };
    });
  }

  /* ---------------- Live TV m3u ---------------- */
  function parseM3U(txt) {
    if (typeof txt !== 'string') txt = String(txt == null ? '' : txt);
    var out = [], L = txt.split('\n'), cur = null;
    for (var i = 0; i < L.length; i++) {
      var ln = L[i].trim();
      if (!ln) continue;
      if (ln.indexOf('#EXTINF') === 0) {
        cur = {
          name: (ln.split(',').pop() || '').trim(),
          logo: (ln.match(/tvg-logo="([^"]*)"/) || [])[1] || '',
          group: (ln.match(/group-title="([^"]*)"/) || [])[1] || '',
          ua: '', ref: '', url: ''
        };
        continue;
      }
      if (ln.charAt(0) === '#') {
        if (cur) {
          var m1 = /http-user-agent=(.+)$/i.exec(ln); if (m1) cur.ua = m1[1].trim();
          var m2 = /http-refer(?:r|er)=(.+)$/i.exec(ln); if (m2) cur.ref = m2[1].trim();
        }
        continue;
      }
      if (cur) { cur.url = ln; out.push(cur); cur = null; }
    }
    return out;
  }
  async function liveList(group) {
    var u = group.u === '__FTV__' ? ZAI.LIVE.ftv : ZAI.LIVE.cdn + group.u;
    try {
      var txt = await fetchText(u, 20000);
      return parseM3U(txt).filter(function (c) { return /^https?:/i.test(c.url); });
    } catch (e) { return []; }
  }

  /* ---------------- AI Video (Huangguo Drama feed) ---------------- */
  var HG = 'https://huangguodrama.ai';
  var HG_FEED = HG + '/api/home-feed/?locale=en';
  var aiCache = { at: 0, items: [] };

  async function hgJSON(u) {
    var B = await base();
    return fetchJSON(B + '/page?url=' + enc(u), 17000);
  }
  function hgOffset(u, off) {
    return u.replace(/([?&])offset=\d+/, '$1offset=' + off);
  }
  function hgMap(list, genre) {
    var out = [], seen = {};
    var want = String(genre || '').toLowerCase();
    (list || []).forEach(function (x) {
      if (!x || (x.kind !== 'drama' && x.kind !== 'short')) return;
      var href = String(x.href || '');
      if (!/^\/en\/video\/\d+\/?$/i.test(href)) return;
      var genres = Array.isArray(x.genres) ? x.genres : [];
      if (want && !genres.some(function (g) { return String(g || '').toLowerCase() === want; })) return;
      var page = abs(href, HG + '/en/');
      if (!page || seen[page]) return;
      var title = decode(x.title || '').replace(/\s+/g, ' ').trim();
      if (!title) return;
      var cover = String(x.cover || '');
      if (cover.charAt(0) === '/') cover = HG + cover;
      seen[page] = 1;
      out.push({
        kind: 'ai', t: title, poster: cover, page: page, badge: 'AI',
        dur: x.totalEpisodes ? (x.totalEpisodes + ' EP') : '',
        year: String(x.publishedAt || '').slice(0, 4),
        desc: String(x.description || '').slice(0, 240),
        genres: genres
      });
    });
    return out;
  }
  async function aiRow(row) {
    var pages = Math.max(1, Math.min(4, Number(row.pages) || 1));
    var reqs = [];
    for (var i = 0; i < pages; i++) {
      reqs.push(hgJSON(hgOffset(row.u, i * 24)).catch(function () { return null; }));
    }
    var js = await Promise.all(reqs);
    var raw = [];
    js.forEach(function (j) { if (j && Array.isArray(j.items)) raw = raw.concat(j.items); });
    return hgMap(raw, row.genre).slice(0, 60);
  }
  async function aiCatalog() {
    if (aiCache.items.length && Date.now() - aiCache.at < 300000) return aiCache.items;
    var reqs = [];
    for (var i = 0; i < 8; i++) {
      reqs.push(hgJSON(HG_FEED + '&sort=all&offset=' + (i * 24)).catch(function () { return null; }));
    }
    var js = await Promise.all(reqs);
    var raw = [];
    js.forEach(function (j) { if (j && Array.isArray(j.items)) raw = raw.concat(j.items); });
    var items = hgMap(raw);
    if (items.length) { aiCache = { at: Date.now(), items: items }; }
    return items;
  }
  async function aiSearch(q) {
    var term = String(q || '').trim().toLowerCase();
    if (!term) return [];
    var all = await aiCatalog();
    var words = term.split(/\s+/).filter(Boolean);
    return all.filter(function (it) {
      var hay = [it.t, it.desc, (it.genres || []).join(' ')].join(' ').toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 36);
  }

  /* ---------------- Tube (ad-free YouTube) ---------------- */
  async function ytAPI(path) {
    var B = await base();
    return fetchJSON(B + path, 20000);
  }
  function ytMap(items, badge) {
    var out = [], seen = {};
    (items || []).forEach(function (v) {
      var id = String((v && (v.id || v.videoId)) || '').trim();
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(id) || seen[id]) return;
      var title = decode(v.title || '').replace(/\s+/g, ' ').trim();
      if (!title) return;
      /* Live/upcoming streams have no duration and public resolvers cannot
         always hand them out as progressive MP4s; keep Tube to playable VODs. */
      if (!String(v.duration || v.dur || '').trim()) return;
      seen[id] = 1;
      out.push({
        kind: 'yt', t: title, vid: id, badge: badge || 'YT',
        poster: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
        dur: String(v.duration || v.dur || '').slice(0, 12),
        page: 'https://www.youtube.com/watch?v=' + id
      });
    });
    return out;
  }
  async function ytSearch(q) {
    var term = String(q || '').trim();
    if (!term) return [];
    var j = await ytAPI('/yt/search?q=' + enc(term) + '&limit=30');
    return ytMap(j && j.items, 'YT');
  }
  async function ytRow(row) {
    var j;
    if (row.browse === 'trending') j = await ytAPI('/yt/trending?limit=30');
    else j = await ytAPI('/yt/search?q=' + enc(row.q || '') + '&limit=30');
    return ytMap(j && j.items, row.badge || 'YT');
  }
  async function ytStream(id) {
    if (!id) return { ok: false };
    return ytAPI('/yt/stream?id=' + enc(id));
  }

  /* ---------------- clean extraction (delegates to srv2 /extract) ---------------- */
  async function extract(url, title, ms) {
    var B = await base();
    var ctl = new AbortController();
    /* The abort timer must cover the BODY read too: clearing it when the
       response headers arrive left a stalled backend hanging the click for
       a minute. Every server gets up to 45s to answer or extract a raw
       stream before the ladder rotates. */
    var tm = setTimeout(function () { ctl.abort(); }, Number(ms) > 0 ? Number(ms) : 45000);
    try {
      var r = await fetch(B + '/extract?url=' + enc(url) + '&title=' + enc(title || ''), { cache: 'no-store', signal: ctl.signal });
      var j = await r.json();
      clearTimeout(tm);
      return j;
    } catch (e) {
      clearTimeout(tm);
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  /* Full season/episode map for a TMDB show (series player selector). One
     request carries every season with every episode; the backend caches it. */
  async function eps(tmdbId, ms) {
    if (!tmdbId) return null;
    var B = await base();
    try { return await fetchJSON(B + '/eps?tmdb=' + enc(tmdbId), ms || 15000); } catch (e) { return null; }
  }

  /* ---------------- thumbnails ---------------- */
  function proxyImg(u) {
    if (!u) return '';
    var B = BASE || 'http://127.0.0.1:46901';
    return B + '/img?url=' + enc(u) + '&cv=2';
  }
  function imgChain(u) {
    if (!u) return [''];
    if (/^https?:\/\/image\.tmdb\.org/i.test(u)) return [u];
    var B = BASE || 'http://127.0.0.1:46901';
    return [B + '/img?url=' + enc(u) + '&cv=2', u, 'https://images.weserv.nl/?url=' + enc(u.replace(/^https?:\/\//, ''))];
  }

  /* ---------------- search helpers ---------------- */
  /* Section-scoped search. The renderer calls this with the ACTIVE section
     (and, for the 18+ vault, the active sub-page) so a search only ever
     queries the scrapers that tab owns. Adult is NEVER reachable without
     section === 'adult' + an explicit vault sub. */
  async function search(q, section, sub) {
    var out = [];
    q = String(q || '').trim();
    if (!q) return out;
    if (section === 'tube') {
      try { return await ytSearch(q); } catch (e) { return out; }
    }
    if (section === 'adult') {
      sub = sub || 'jav';
      if (sub === 'jav') {
        try { out = out.concat(await javSearch(q)); } catch (e) {}
      } else if (sub === 'eporner') {
        try { out = out.concat(await epSearch(q)); } catch (e) {}
      } else if (sub === 'rule34') {
        try {
          var rr = await r34vRow({ q: q, badge: 'RES' });
          if (!rr.length) rr = await r34Row({ tags: q.replace(/\s+/g, '_'), badge: 'RES' });
          out = out.concat(rr.slice(0, 20));
        } catch (e) {}
      } else if (sub === 'mms') {
        try { out = out.concat(await epSearch(q)); } catch (e) {}
        try { out = out.concat((await r34vRow({ q: q, badge: 'RES' })).slice(0, 8)); } catch (e) {}
      } else if (sub === 'aws') {
        try {
          var hx = await fetchText('https://xmaal.in/?s=' + enc(q), 12000);
          out = out.concat(parseAnchorCards(hx, 'https://xmaal.in', { kind: 'xs', series: true }).slice(0, 20));
        } catch (e) {}
      } else if (sub === 'amov') {
        try { out = out.concat(await tmdbSearch(q, true)); } catch (e) {}
      } else if (sub === 'hentai') {
        try { out = out.concat(await hcSearch(q)); } catch (e) {}
        try { out = out.concat(await htvSearch(q)); } catch (e) {}
        try { out = out.concat((await epSearch(q)).slice(0, 10)); } catch (e) {}
      } else if (sub === 'ai') {
        try { out = out.concat(await aiSearch(q)); } catch (e) {}
      }
      return out;
    }
    if (section === 'webseries') {
      try {
        var hx2 = await fetchText('https://xmaal.in/?s=' + enc(q), 12000);
        out = out.concat(parseAnchorCards(hx2, 'https://xmaal.in', { kind: 'xs', series: true }).slice(0, 12));
      } catch (e) {}
    }
    if (section === 'kdrama') {
      try { out = out.concat((await hdSearch(q)).slice(0, 10)); } catch (e) {}
      /* kdramasmaza results are K-Drama items (kind 'kd') so the player's
         native-stream gate applies to them; katmoviehd results stay 'kat'. */
      var hosts = [
        { u: 'https://kdramasmaza.net/?s=', k: 'kd' },
        { u: 'https://katmoviehd.pk/?s=', k: 'kat' }
      ];
      for (var i = 0; i < hosts.length; i++) {
        try {
          var hk = await fetchText(hosts[i].u + enc(q), 12000);
          var arr = parseAnchorCards(hk, hosts[i].u, { kind: hosts[i].k }).filter(function (it) {
            var p = String(it.page || '');
            /* Site chrome (logo / category / tag / search links) is not a title. */
            if (/\/category\/|\/tag\/|\/page\/|\?s=|\/author\//i.test(p)) return false;
            try { if (new URL(p).pathname.replace(/\/+$/, '') === '') return false; } catch (e) { return false; }
            if (/^(?:kdramas?\s*maza|katmoviehd|hindidrama)$/i.test(String(it.t || '').trim())) return false;
            return true;
          });
          out = out.concat(arr.slice(0, 8));
        } catch (e) {}
      }
    }
    return out;
  }

  SC.base = base;
  SC.alt = alt;
  SC.fetchText = fetchText;
  SC.fetchJSON = fetchJSON;
  SC.katRow = katRow;
  SC.hdRow = hdRow;
  SC.hdSearch = hdSearch;
  SC.aiRow = aiRow;
  SC.aiSearch = aiSearch;
  SC.ytRow = ytRow;
  SC.ytSearch = ytSearch;
  SC.ytStream = ytStream;
  SC.xsRow = xsRow;
  SC.parseAnchorCards = parseAnchorCards;
  SC.anxRow = anxRow;
  SC.epRow = epRow;
  SC.r34Row = r34Row;
  SC.r34vRow = r34vRow;
  SC.javRow = javRow;
  SC.javSearch = javSearch;
  SC.hcRow = hcRow;
  SC.hcSearch = hcSearch;
  SC.htvRow = htvRow;
  SC.htvSearch = htvSearch;
  SC.nhStream = nhStream;
  SC.ladderFromHtml = ladderFromHtml;
  SC.partsFromHtml = partsFromHtml;
  SC.xsEpisodes = xsEpisodes;
  SC.r34vKey = r34vKey;
  SC.normMedia = normMedia;
  SC.tmdbSearch = tmdbSearch;
  SC.countryRow = countryRow;
  SC.liveList = liveList;
  SC.parseM3U = parseM3U;
  SC.extract = extract;
  SC.eps = eps;
  SC.proxyImg = proxyImg;
  SC.imgChain = imgChain;
  SC.search = search;
  SC.imgAlt = imgAlt;
  window.SC = SC;
})();
