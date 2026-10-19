/* sources.js - WatchAnyBox data catalog v4 (pure data, no DOM).
   ---------------------------------------------------------------------------
   Extracted and cleaned from the reference build:
     - TMDB/Bollywood provider ladder (dead hosts purged: VidBinge invalid-cert,
       VidSrc.net connection-reset, plus the old build's autoembed/moviesapi/
       embed.su/vidsrc.sbs/vidsrc.xyz/smashy corpses stay deleted)
     - TMDB + AniList + archive.org row definitions (Public Domain tab removed)
     - XMaal rows split: SFW Web Series rows stay in the main tab, every
       adult platform becomes the 18+ vault's "Adult Web Series" group
     - KatMovieHD rows, KDramasMaza rows (KatDrama/KatMovie18 now parked
       domains - purged), TMDB keyword erotica rows for "Adult Movies"
     - THE 18+ VAULT: JAV / Eporner / Rule34 / MMS / Adult Web Series /
       Adult Movies / Hentai (Hentaicity + Hentai.tv + Rule34 + Eporner)
     - iptv-org + Free-TV live sources
   Loaded BEFORE libraries.js and renderer.js. Nothing here touches the DOM. */
(function () {
  'use strict';
  if (window.ZAI) return;

  /* ---------------- TMDB embed provider ladder ---------------- */
  /* Provider pool v3 - every host below was re-verified reachable. Dead
     productions deleted with prejudice: player.autoembed.cc, moviesapi.club,
     embed.su, vidsrc.sbs, vidsrc.xyz, player.smashy.stream (old build),
     vidbinge.dev (broken TLS cert), vidsrc.net (connection reset). */
  var PROVIDERS = [
    /* SFW provider ladder, ranked by live host health (probed): fast
       answering hosts run first, Cloudflare-challenged / slow hosts last.
       The native pipeline extracts each page server-side and only ever plays
       a raw .mp4/.m3u8 - no provider iframe is mounted outside the 18+ vault,
       so a dead shell is always rotated away, never displayed. */
    { n:'VidFast',      ids:['tmdb'],                  m:'https://vidfast.pro/movie/{id}',               t:'https://vidfast.pro/tv/{id}/{s}/{e}' },
    { n:'VidSrc.pm',    ids:['tmdb','imdb'],           m:'https://vidsrc.pm/embed/movie/{id}',           t:'https://vidsrc.pm/embed/tv/{id}/{s}/{e}' },
    { n:'VidLink',      ids:['tmdb'],                  m:'https://vidlink.pro/movie/{id}',               t:'https://vidlink.pro/tv/{id}/{s}/{e}' },
    { n:'Videasy',      ids:['tmdb'],                  m:'https://player.videasy.net/movie/{id}',        t:'https://player.videasy.net/tv/{id}/{s}/{e}' },
    { n:'EmbedWave',    ids:['tmdb'],                  m:'https://embedwave.cc/embed/movie/{id}',        t:'https://embedwave.cc/embed/tv/{id}/{s}/{e}' },
    { n:'VidCore',      ids:['tmdb'],                  m:'https://vidcore.org/embed/movie/{id}',         t:'https://vidcore.org/embed/tv/{id}/{s}/{e}' },
    { n:'2Embed',       ids:['tmdb','imdb'],           m:'https://www.2embed.cc/embed/{id}',             t:'https://www.2embed.cc/embedtv/{id}&s={s}&e={e}' },
    { n:'VidSrc.to',    ids:['tmdb','imdb'], sub:true, m:'https://vidsrc.to/embed/movie/{id}',            t:'https://vidsrc.to/embed/tv/{id}/{s}/{e}' },
    { n:'VidSrc Main',  ids:['tmdb','imdb'], sub:true, m:'https://vidsrc.mov/embed/movie/{id}',          t:'https://vidsrc.mov/embed/tv/{id}/{s}/{e}' },
    { n:'VidSrc.cc',    ids:['tmdb','imdb'],           m:'https://vidsrc.cc/v2/embed/movie/{id}',        t:'https://vidsrc.cc/v2/embed/tv/{id}/{s}/{e}' },
    { n:'VixSrc',       ids:['tmdb'],                  m:'https://vixsrc.to/movie/{id}',                 t:'https://vixsrc.to/tv/{id}/{s}/{e}' },
    { n:'SuperEmbed',   ids:['tmdb'],                  m:'https://multiembed.mov/?video_id={id}&tmdb=1', t:'https://multiembed.mov/?video_id={id}&tmdb=1&s={s}&e={e}' }
  ];

  var LANGS = [
    ['en-US','English'],['hi-IN','Hindi'],['ko-KR','Korean'],['ja-JP','Japanese'],['es-ES','Spanish'],
    ['de-DE','German'],['pt-BR','Portuguese'],['ru-RU','Russian'],['ar-SA','Arabic'],['tr-TR','Turkish'],
    ['id-ID','Indonesian'],['th-TH','Thai'],['vi-VN','Vietnamese'],['it-IT','Italian'],['pl-PL','Polish'],
    ['nl-NL','Dutch'],['fa-IR','Persian'],['he-IL','Hebrew'],['sv-SE','Swedish'],['uk-UA','Ukrainian']
  ];

  /* ---------------- TMDB / AniList row tables (per tab) ---------------- */
  /* The "Upcoming" row is gone: unreleased future titles never belong in a
     default catalog row (the TMDB loader also filters future release dates). */
  var TMDB_ROWS = {
    home: [
      { t:'Trending This Week', p:'/trending/all/week' },
      { t:'Popular Movies', p:'/movie/popular' },
      { t:'Popular Series', p:'/tv/popular' },
      { t:'Trending Anime', al:'TRENDING_DESC' },
      { t:'Top Rated Movies', p:'/movie/top_rated' }
    ],
    movie: [
      { t:'Trending Movies', p:'/trending/movie/week' },
      { t:'Popular', p:'/movie/popular' },
      { t:'Top Rated', p:'/movie/top_rated' },
      { t:'Now Playing', p:'/movie/now_playing' }
    ],
    tv: [
      { t:'Trending Series', p:'/trending/tv/week' },
      { t:'Popular', p:'/tv/popular' },
      { t:'Top Rated', p:'/tv/top_rated' },
      { t:'Airing Today', p:'/tv/airing_today' }
    ],
    webseries: [
      { t:'Trending Web Series', p:'/trending/tv/week' },
      { t:'Indian Web Series', p:'/discover/tv', q:{ with_origin_country:'IN', sort_by:'popularity.desc' } },
      { t:'Korean Web Series', p:'/discover/tv', q:{ with_original_language:'ko', sort_by:'popularity.desc' } }
    ],
    kdrama: [
      { t:'Trending Korean Dramas', p:'/trending/tv/week' },
      { t:'K-Dramas on TMDB', p:'/discover/tv', q:{ with_original_language:'ko', sort_by:'popularity.desc' } }
    ],
    anime: [
      { t:'Trending Anime', al:'TRENDING_DESC' },
      { t:'Top Rated Anime', al:'SCORE_DESC' },
      { t:'Anime Movies', al:'POPULARITY_DESC', fmt:'MOVIE' },
      { t:'Anime on TMDB', p:'/discover/tv', q:{ with_genres:'16', with_original_language:'ja', sort_by:'popularity.desc' } }
    ],
    kids: [
      { t:'Family Movies', p:'/discover/movie', q:{ with_genres:'10751', sort_by:'popularity.desc' } },
      { t:'Animated Movies', p:'/discover/movie', q:{ with_genres:'16', sort_by:'popularity.desc' } },
      { t:'Kids TV', p:'/discover/tv', q:{ with_genres:'10762', sort_by:'popularity.desc' } },
      { t:'Family Series', p:'/discover/tv', q:{ with_genres:'10751', sort_by:'popularity.desc' } }
    ]
  };

  var ARCHIVE_ROWS = {
    cartoons: [
      { t:'Classic Cartoons', arc:'classic_cartoons' },
      { t:'Animation and Cartoons', arc:'animationandcartoons' },
      { t:'More Animation', arc:'more_animation' }
    ]
  };

  /* ---------------- Web Series: XMaal scrape rows ---------------- */
  /* Split: sfw rows stay in the SFW Web Series tab; every adult platform and
     adult tag becomes the 18+ vault's "Adult Web Series" group. */
  var XMAAL = {
    mirrors: ['https://xmaal.in','https://xmaal.pro','https://zmaal.net'],
    sfw: [
      ['/','Latest Web Series'],
      ['/all-series/','All Series A-Z'],
      ['/all-platforms/','All Platforms']
    ],
    adult: [
      ['/video_platform/ullu/','ULLU'],
      ['/video_platform/kooku/','Kooku'],
      ['/video_platform/altbalaji/','AltBalaji'],
      ['/video_platform/moodx/','Moodx'],
      ['/video_platform/neonx/','NeonX'],
      ['/video_platform/aatrangii/','Aatrangii'],
      ['/video_platform/sigma/','Sigma'],
      ['/video_platform/rabbitmovies/','Rabbit Movies'],
      ['/video_platform/primeplay/','PrimePlay'],
      ['/video_platform/gupchup/','Gupchup'],
      ['/video_platform/besharams/','Besharams'],
      ['/video_platform/wow/','Wow Originals'],
      ['/video_platform/jugnu/','Jugnu'],
      ['/video_platform/uncutmaza/','UncutMaza'],
      ['/video_platform/xmasti/','XMasti'],
      ['/video_platform/xmaza/','XMaza'],
      ['/video_platform/hotshots/','HotShots'],
      ['/video_platform/nuefliks/','Nuefliks'],
      ['/video_tag/hindi-hot-web-series/','Hindi Hot Web Series'],
      ['/video_tag/ullu-hot-web-series/','ULLU Hot'],
      ['/video_tag/kooku-hot-web-series/','Kooku Hot'],
      ['/video_tag/altbalaji-hot-web-series/','AltBalaji Hot'],
      ['/video_tag/rabbitmovies-hot-web-series/','Rabbit Hot'],
      ['/video_tag/adult-series/','Adult Series'],
      ['/video_tag/uncutmaza/','Uncut'],
      ['/video_tag/webxseries/','WebXSeries']
    ]
  };
  /* XMaal rows -> Web Series descriptors. Every XMaal row is a SERIES
     catalogue (the Desi web series: Siskiyaan, Shahad, Aadhi Gharwali...):
     each card is a title whose OWN page holds its parts ("8 Videos" /
     "2 Videos" badge), so every card of these rows is built with an EXPLICIT
     series flag - isSeries:true + type:'tv' - and the player mounts the
     Season/Episode dropdown and Prev/Next for it, exactly like a TMDB show.
     A tuple may opt out with a third `false`, an object with series:false. */
  function xmaalRows(list, badge) {
    return (list || []).map(function (r) {
      var arr = Array.isArray(r);
      var p = arr ? r[0] : r.p;
      var t = arr ? r[1] : r.t;
      var isSeries = arr ? (r[2] !== false) : (r.series !== false);
      var row = { kind: 'xs', t: t, path: p, badge: badge };
      if (isSeries) { row.series = true; row.isSeries = true; row.type = 'tv'; }
      return row;
    });
  }

  /* ---------------- Kat-style scraped rows (mirror + list page) ---------------- */
  /* KatDrama (new.katdrama.my) and KatMovie18 (new.katmovie18.my) are parked
     domains now - fully deleted. KDramasMaza carries the K-Drama tab. */
  var KAT = {
    ws: [
      { t:'KatMovieHD - Latest Movies & Series', u:'https://katmoviehd.pk/', k:'kat' },
      { t:'KatMovieHD - Web Series Dubbed', u:'https://katmoviehd.pk/category/tv-series/', k:'kat' },
      { t:'KatMovieHD - Hindi Dubbed', u:'https://katmoviehd.pk/category/movies/', k:'kat' }
    ],
    kd: [
      { t:'HindiDrama - Trending', u:'https://hindidrama.net/trending', k:'hd' },
      { t:'HindiDrama - Latest', u:'https://hindidrama.net/', k:'hd' },
      { t:'KDramasMaza - Latest Dramas', u:'https://kdramasmaza.net/', k:'kd' },
      { t:'KatMovieHD - Latest Series', u:'https://katmoviehd.pk/', k:'kat' }
    ]
  };

  /* ---------------- Anime: AniMixPlay scrape rows ---------------- */
  var ANIMIX = {
    mirrors: ['https://animixplay.la','https://animixplay.cz'],
    rows: [
      ['/','Latest Episodes'],
      ['/list','A-Z List']
    ]
  };

  var MISSAV_HOSTS = ['https://missav.ws','https://missav.ai','https://missav123.com','https://missav.tv'];

  /* ---------------- THE 18+ VAULT ----------------
     Everything adult lives here - grouped by sub-page. The main sidebar has
     exactly ONE adult entry (18+); all of these categories render inside it. */
  var VAULT_GROUPS = [
    { id:'jav',     t:'JAV' },
    { id:'eporner', t:'Eporner' },
    { id:'rule34',  t:'Rule34' },
    { id:'mms',     t:'MMS' },
    { id:'aws',     t:'Adult Web Series' },
    { id:'amov',    t:'Adult Movies' },
    { id:'hentai',  t:'Hentai' },
    { id:'ai',      t:'AI Video' }
  ];

  var VAULT = {};

  /* JAV - MissAV rows (native surrit extraction + isolated-page fallback). */
  VAULT.jav = [];
  function M(t, b, path) { VAULT.jav.push({ kind:'mv', t:t, path:path, badge:b }); }
  M('JAV New Releases','JAV-NEW','/en/new');
  M('JAV Uncensored Leak','LEAK','/en/uncensored-leak');
  M('SIRO Amateur','SIRO','/en/siro');
  M('LUXU Amateur','LUXU','/en/luxu');
  M('FC2 PPV','FC2','/en/fc2');
  M('Tokyo Hot','TH','/en/tokyohot');

  /* Eporner - direct signed streams via the /xhr/video hash trick. */
  VAULT.eporner = [];
  function A(t, b, q, o) { VAULT.eporner.push({ kind:'ep', t:t, q:q, order:o, badge:b }); }
  A('Newest Uploads','NEW','','latest');
  A('Most Popular','HOT','','most-popular');
  A('Top Rated All Time','TOP','','top-rated');
  A('Top This Week','WEEK','','top-weekly');
  A('Top This Month','MONTH','','top-monthly');
  A('Full Length Movies','LONG','','longest');
  A('4K Ultra HD','4K','4k','top-rated');
  A('1080p HD','HD','1080p','latest');
  A('Uncensored','UNC','uncensored','top-rated');
  A('American','US','american','top-weekly');
  A('Russian','RU','russian','top-weekly');
  A('Indian / Desi','IN','indian','top-weekly');
  A('Indian Hindi Audio','IN-HI','indian hindi','latest');
  A('Desi Aunty / Bhabhi','DESI','aunty indian','top-rated');
  A('Japanese JAV','JAV','japanese','top-weekly');
  A('JAV Uncensored','JAV-UNC','uncensored japanese','top-rated');
  A('Korean','KR','korean','top-rated');
  A('Thai','TH','thai','top-rated');
  A('Filipino','PH','filipino','top-rated');
  A('Vietnamese','VN','vietnamese','top-rated');
  A('Arab','AR','arab','top-rated');
  A('Turkish','TR','turkish','top-rated');
  A('Brazilian','BR','brazilian','top-rated');
  A('Latina','LAT','latina','top-weekly');
  A('German','DE','german','top-rated');
  A('French','FR','french','top-rated');
  A('Italian','IT','italian','top-rated');
  A('Spanish','ES','spanish','top-rated');
  A('Czech','CZ','czech','top-rated');
  A('Ukrainian','UA','ukrainian','top-rated');
  A('Ebony','EBN','ebony','top-weekly');
  A('Asian','ASIA','asian','top-weekly');
  A('MILF','MILF','milf','top-weekly');
  A('Mature / Granny','MAT','mature','top-rated');
  A('Teen 18-19','TEEN','teen','top-weekly');
  A('Petite','PET','petite','top-rated');
  A('Big Tits','BT','big tits','top-weekly');
  A('Small Tits','ST','small tits','top-rated');
  A('Big Ass','ASS','big ass','top-weekly');
  A('Anal','ANAL','anal','top-weekly');
  A('Creampie','CP','creampie','top-rated');
  A('Squirt','SQ','squirt','top-rated');
  A('Lesbian','LES','lesbian','top-weekly');
  A('Threesome','3S','threesome','top-rated');
  A('POV','POV','pov','top-weekly');
  A('Amateur','AM','amateur','top-weekly');
  A('Homemade','HM','homemade','top-rated');
  A('Casting','CAST','casting','top-rated');
  A('Massage','MSG','massage','top-rated');
  A('Gym / Yoga','GYM','gym','top-rated');
  A('Public / Outdoor','PUB','public','top-rated');
  A('Shower / Bath','BATH','shower','top-rated');
  A('BDSM','BDSM','bdsm','top-rated');
  A('Stockings / Feet','FEET','stockings','top-rated');
  A('Lingerie','LNG','lingerie','top-rated');
  A('Cosplay','COS','cosplay','top-rated');
  A('Interracial','IR','interracial','top-weekly');
  A('Cheating / Wife','WIFE','cheating wife','top-rated');
  A('Stepsister','FAM','stepsister','top-rated');
  A('VR','VR','vr','top-rated');

  /* Rule34 - full animated .mp4 files from rule34video (KVS tube). */
  VAULT.rule34 = [];
  function R(t, b, q) { VAULT.rule34.push({ kind:'r34v', t:t, q:q || t, badge:b }); }
  R('Animated (R34)','R34','animated');
  R('Animated With Sound','R34-S','animated voice');
  R('3D / CG','3D','3d');
  R('Animated Creampie','R34-CP','animated creampie');
  R('Animated Big Breasts','R34-BB','animated big tits');
  R('Animated Yuri','R34-Y','animated yuri');
  R('Animated Futanari','R34-F','animated futanari');
  R('Animated Anal','R34-A','animated anal');

  /* MMS - viral / desi / leaked rows + JAV mirrors. */
  VAULT.mms = [];
  function MM(t, b, p) { VAULT.mms.push({ kind:'mv', t:t, path:p, badge:b }); }
  function MA(t, b, q, o) { VAULT.mms.push({ kind:'ep', t:t, q:q, order:o, badge:b }); }
  MM('Latest JAV','JAV','/en/new');
  MM('Uncensored Leak','LEAK','/en/uncensored-leak');
  MM('FC2 PPV','FC2','/en/fc2');
  MA('Viral MMS','MMS','mms','latest');
  MA('Indian Viral MMS','IN','indian mms','latest');
  MA('Desi Leaked','DESI','desi leaked','top-weekly');
  MA('Leaked Sex Tapes','LEAK','leaked','top-weekly');
  MA('Instagram Models','IG','instagram','top-rated');
  MA('Amateur Homemade','AM','homemade amateur','latest');
  MA('OnlyFans Style','OF','onlyfans','top-rated');
  MA('Casting Auditions','CAST','casting','top-rated');
  MA('Public Flashing','PUB','public flashing','top-rated');
  VAULT.mms.push({ kind:'r34v', t:'Animated / Hentai', q:'animated', badge:'R34' });

  /* Adult Web Series - the adult XMaal platform rows (moved out of the SFW
     Web Series tab; the SFW rows stay there untouched). */
  VAULT.aws = xmaalRows(XMAAL.adult, 'AWS');

  /* Adult Movies - TMDB keyword erotica (the parked KatMovie18 mirror is
     gone; these route through the standard provider race and play). */
  VAULT.amov = [
    { kind:'adv', t:'Erotic Movies - Popular', q:{ include_adult:'true', with_keywords:'155477', sort_by:'popularity.desc' }, badge:'18+' },
    { kind:'adv', t:'Erotic Movies - Top Rated', q:{ include_adult:'true', with_keywords:'155477', sort_by:'vote_count.desc' }, badge:'18+' },
    { kind:'adv', t:'Indian Erotic Movies', q:{ include_adult:'true', with_keywords:'155477', with_original_language:'hi', sort_by:'popularity.desc' }, badge:'18+' },
    { kind:'adv', t:'Japanese Erotic Movies', q:{ include_adult:'true', with_keywords:'155477', with_original_language:'ja', sort_by:'popularity.desc' }, badge:'18+' }
  ];

  /* Hentai - TWO new verified providers (Hentaicity direct HLS, Hentai.tv
     JSON API + nhplayer stream decode) alongside Rule34 + Eporner hentai. */
  VAULT.hentai = [
    { kind:'hc',  t:'Hentaicity - Newest', u:'https://www.hentaicity.com/', badge:'H-CITY' },
    { kind:'hc',  t:'Hentaicity - Hentai', u:'https://www.hentaicity.com/search/video/hentai', badge:'H-CITY' },
    { kind:'hc',  t:'Hentaicity - 3D / CG', u:'https://www.hentaicity.com/search/video/3d', badge:'H-CITY' },
    { kind:'hc',  t:'Hentaicity - Uncensored', u:'https://www.hentaicity.com/search/video/uncensored', badge:'H-CITY' },
    { kind:'hc',  t:'Hentaicity - Futanari', u:'https://www.hentaicity.com/search/video/futanari', badge:'H-CITY' },
    { kind:'htv', t:'Hentai.tv - Latest', u:'https://hentai.tv/api/browse', badge:'HTV' },
    { kind:'htv', t:'Hentai.tv - Top Rated', u:'https://hentai.tv/api/browse?sort=rating&order=desc', badge:'HTV' },
    { kind:'ep',  t:'Eporner - Hentai', q:'hentai', order:'top-rated', badge:'EP-H' },
    { kind:'r34v', t:'Rule34 - Animated', q:'animated', badge:'R34' }
  ];

  /* AI Video - Huangguo Drama's public Next.js feed. Only drama/short feed
     items with an /en/video/ page become cards; games, novels, albums, comics
     and every other site artifact are excluded by the parser. */
  var HG_FEED = 'https://huangguodrama.ai/api/home-feed/?locale=en';
  VAULT.ai = [
    { kind:'ai', t:'AI Video - Trending',       u:HG_FEED + '&sort=popular&offset=0', badge:'AI', pages:1 },
    { kind:'ai', t:'AI Video - New Releases',   u:HG_FEED + '&sort=new&offset=0',     badge:'AI', pages:1 },
    { kind:'ai', t:'AI Video - All Titles',     u:HG_FEED + '&sort=all&offset=0',     badge:'AI', pages:1 },
    { kind:'ai', t:'AI Video - Romance',        u:HG_FEED + '&sort=all&offset=0',     badge:'AI', pages:3, genre:'Romance' },
    { kind:'ai', t:'AI Video - Fantasy',        u:HG_FEED + '&sort=all&offset=0',     badge:'AI', pages:3, genre:'Fantasy' },
    { kind:'ai', t:'AI Video - Urban Stories',  u:HG_FEED + '&sort=all&offset=0',     badge:'AI', pages:3, genre:'Urban stories' },
    { kind:'ai', t:'AI Video - Action',         u:HG_FEED + '&sort=all&offset=0',     badge:'AI', pages:2, genre:'Action' }
  ];

  /* ---------------- Tube rows (ad-free YouTube) ---------------- */
  var YT_ROWS = [
    { kind:'ytr', t:'Trending on YouTube', browse:'trending', badge:'TREND' },
    { kind:'ytr', t:'Music', q:'popular music', badge:'MUSIC' },
    { kind:'ytr', t:'Gaming', q:'gaming highlights', badge:'GAME' },
    { kind:'ytr', t:'Technology', q:'technology reviews', badge:'TECH' },
    { kind:'ytr', t:'Movie Trailers', q:'official movie trailers', badge:'TRAILER' },
    { kind:'ytr', t:'Comedy', q:'comedy sketches', badge:'COMEDY' },
    { kind:'ytr', t:'Science & Space', q:'science space documentary', badge:'SCI' },
    { kind:'ytr', t:'Lofi & Focus', q:'lofi study music', badge:'LOFI' }
  ];

  /* ---------------- Country cinema rows (TMDB discover) ---------------- */
  var COUNTRY = [];
  function C(title, badge, lang, region, kind) {
    COUNTRY.push({ kind:'country', t:title, badge:badge, o:{ name:title, badge:badge, lang:lang, region:region, kind:kind || 'movie' } });
  }
  C('Bollywood / Hindi','IN','hi','IN');
  C('Tamil Cinema','IN','ta','IN');
  C('Telugu Cinema','IN','te','IN');
  C('Malayalam Cinema','IN','ml','IN');
  C('Punjabi Cinema','IN','pa','IN');
  C('Russian Cinema','RU','ru','RU');
  C('Korean Cinema','KR','ko','KR');
  C('Japanese Cinema','JP','ja','JP');
  C('Chinese Cinema','CN','zh','CN');
  C('Turkish Cinema','TR','tr','TR');
  C('Spanish Cinema','ES','es','ES');
  C('French Cinema','FR','fr','FR');
  C('German Cinema','DE','de','DE');
  C('Italian Cinema','IT','it','IT');
  C('Arabic Cinema','AR','ar','EG');
  C('Portuguese / Brazil','BR','pt','BR');
  C('Thai Cinema','TH','th','TH');
  C('Indonesian Cinema','ID','id','ID');
  C('Vietnamese Cinema','VN','vi','VN');
  C('Filipino Cinema','PH','tl','PH');
  C('Persian Cinema','IR','fa','IR');
  C('Urdu Cinema','PK','ur','PK');
  C('Polish Cinema','PL','pl','PL');
  C('Swedish Cinema','SE','sv','SE');
  C('Korean Dramas','KR-TV','ko','KR','tv');
  C('Turkish Dramas','TR-TV','tr','TR','tv');
  C('Japanese Anime TV','JP-TV','ja','JP','tv');
  C('Hindi Web Series','IN-TV','hi','IN','tv');

  /* ---------------- Live TV (iptv-org + Free-TV) ---------------- */
  var LIVE = {
    cdn: 'https://iptv-org.github.io/iptv/',
    ftv: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8',
    groups: [
      { t:'India', u:'countries/in.m3u' },
      { t:'Pakistan', u:'countries/pk.m3u' },
      { t:'United States', u:'countries/us.m3u' },
      { t:'United Kingdom', u:'countries/uk.m3u' },
      { t:'Bangladesh', u:'countries/bd.m3u' },
      { t:'Nepal', u:'countries/np.m3u' },
      { t:'UAE', u:'countries/ae.m3u' },
      { t:'Saudi Arabia', u:'countries/sa.m3u' },
      { t:'News', u:'categories/news.m3u' },
      { t:'Sports', u:'categories/sports.m3u' },
      { t:'Movies', u:'categories/movies.m3u' },
      { t:'Music', u:'categories/music.m3u' },
      { t:'Kids', u:'categories/kids.m3u' },
      { t:'Documentary', u:'categories/documentary.m3u' },
      { t:'Comedy', u:'categories/comedy.m3u' },
      { t:'Animation', u:'categories/animation.m3u' },
      { t:'Free-TV', u:'__FTV__' }
    ]
  };

  /* ---------------------------------------------------------------------
     VAULT FINALIZATION - every 18+ group (Rule34 included) is injected
     exactly ONCE. The `if (window.ZAI) return;` guard above already makes
     this whole file a no-op on any re-evaluation; this pass additionally
     collapses any row that was somehow pushed twice, so a category can never
     duplicate in the vault UI no matter how the tables above evolve.

     A row's identity is its kind PLUS its exact source target (query / path /
     url / tmdb id, with order, genre, page count and mirror key) PLUS its
     label - cosmetic differences can no longer fork the same feed into two
     duplicate rows. A second pass keeps at most ONE row per label inside a
     group, and the group chips themselves are deduped by id: Rule34 (and
     every other group) therefore renders once, exactly. */
  (function finalizeVault() {
    var targetOf = function (r) {
      var t = r.q != null ? r.q : (r.path || r.u || r.tmdb || '');
      var extra = [r.order || '', r.genre || '', r.pages || '', r.arc || '', r.browse || '', r.k || ''].join('~');
      return String(t) + '~' + extra;
    };
    Object.keys(VAULT).forEach(function (k) {
      var seen = {}, seenLabel = {}, out = [];
      (VAULT[k] || []).forEach(function (r) {
        if (!r) return;
        var key = [String(r.kind || ''), targetOf(r), String(r.t || '')].join('|').toLowerCase();
        var lbl = [String(r.kind || ''), String(r.t || '')].join('|').toLowerCase();
        if (seen[key] || seenLabel[lbl]) return;
        seen[key] = 1;
        seenLabel[lbl] = 1;
        out.push(r);
      });
      VAULT[k] = out;
    });
    var gseen = {};
    VAULT_GROUPS = (VAULT_GROUPS || []).filter(function (g) {
      if (!g || !g.id || gseen[g.id]) return false;
      gseen[g.id] = 1;
      return true;
    });
  })();

  window.ZAI = {
    TMDB_KEY: '3104601db7b49ab8140edd482412445a',
    PROVIDERS: PROVIDERS,
    LANGS: LANGS,
    TMDB_ROWS: TMDB_ROWS,
    ARCHIVE_ROWS: ARCHIVE_ROWS,
    XMAAL: XMAAL,
    xmaalRows: xmaalRows,
    KAT: KAT,
    ANIMIX: ANIMIX,
    MISSAV_HOSTS: MISSAV_HOSTS,
    VAULT: VAULT,
    VAULT_GROUPS: VAULT_GROUPS,
    YT_ROWS: YT_ROWS,
    COUNTRY: COUNTRY,
    LIVE: LIVE
  };
})();
