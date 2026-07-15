var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var worker_default = {
  async fetch(request) {
    return handleRequest(request);
  }
};

var AD_PATTERNS = [
  "googlesyndication.com",
  "doubleclick.net",
  "googleadservices.com",
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "adservice.google.com",
  "pagead2.googlesyndication.com",
  "tpc.googlesyndication.com",
  "video-ad-stats.googlesyndication.com",
  "ads.google.com",
  "adssettings.google.com",
  "static.ads-twitter.com",
  "ads-api.twitter.com",
  "ads.facebook.com",
  "an.facebook.com",
  "adnxs.com",
  "advertising.com",
  "outbrain.com",
  "taboola.com",
  "criteo.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "adsafeprotected.com",
  "moatads.com",
  "scorecardresearch.com",
  "/ads/",
  "/ad/",
  "/advert/",
  "/advertisement/",
  "/adsense/",
  "/adserver/",
  "/analytics/",
  "prebid",
  "advertis",
  "banner",
  "popup"
];

function isAdRequest(url) {
  const urlLower = url.toLowerCase();
  return AD_PATTERNS.some((pattern) => urlLower.includes(pattern));
}
__name(isAdRequest, "isAdRequest");

async function handleRequest(request) {
  const url = new URL(request.url);
  
  if (url.pathname === "/" || url.pathname === "") {
    return proxyRequest(request, "https://browser.lol/en/create");
  }

  return proxyRequest(request);
}
__name(handleRequest, "handleRequest");

async function proxyRequest(request, overrideURL = null) {
  const url = new URL(request.url);
  let targetURL;

  if (overrideURL) {
    targetURL = overrideURL;
  } else if (url.pathname.startsWith("/proxy/")) {
    const encodedURL = url.pathname.substring("/proxy/".length);
    try {
      targetURL = decodeURIComponent(encodedURL);
      if (url.search) {
        targetURL += url.search;
      }
    } catch (e) {
      console.error("Failed to decode proxy URL:", encodedURL);
      return new Response("Invalid proxy URL", { status: 400 });
    }
  } else {
    return new Response("Invalid request", { status: 400 });
  }

  if (isAdRequest(targetURL)) {
    console.log("[Ad Blocked]", targetURL);
    return new Response("", { status: 204 });
  }

  console.log("Proxying:", targetURL);

  const headers = new Headers(request.headers);
  headers.set("Host", new URL(targetURL).host);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("x-forwarded-proto");
  headers.delete("x-real-ip");

  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
  }

  const proxyReq = new Request(targetURL, {
    method: request.method,
    headers,
    body: request.body,
    redirect: "follow"
  });

  let response;
  try {
    response = await fetch(proxyReq);
  } catch (error) {
    console.error("Proxy fetch failed:", error);
    return new Response("Failed to fetch resource", { status: 502 });
  }

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*");
  newHeaders.set("Access-Control-Allow-Methods", "*");
  newHeaders.set("Access-Control-Allow-Headers", "*");
  newHeaders.delete("Content-Security-Policy");
  newHeaders.delete("X-Frame-Options");

  const contentType = response.headers.get("Content-Type") || "";

  if (contentType.includes("text/html")) {
    let html = await response.text();
    html = blockAdsInHTML(html);
    
    const adBlockScript = `
<script id="cm-ad-blocker">
(function(){
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = args[0];
    if (typeof url === 'string' && isAdUrl(url)) {
      console.log('[Ad Blocked]', url);
      return Promise.reject(new Error('Ad blocked'));
    }
    return originalFetch.apply(this, args);
  };
  
  const originalXHR = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function(method, url) {
    if (isAdUrl(url)) {
      console.log('[Ad Blocked]', url);
      return;
    }
    return originalXHR.apply(this, arguments);
  };
  
  function isAdUrl(url) {
    const patterns = ['googlesyndication', 'doubleclick', 'googleadservices', 'google-analytics', 'googletagmanager', '/ads/', '/ad/', 'adsense', 'analytics'];
    return patterns.some(p => url.toLowerCase().includes(p));
  }
  
  function removeAds() {
    const selectors = [
      'iframe[src*="googlesyndication"]',
      'iframe[src*="doubleclick"]',
      'div[id*="google_ads"]',
      'div[class*="adsbygoogle"]',
      'ins.adsbygoogle',
      '[data-ad-slot]'
    ];
    selectors.forEach(s => {
      document.querySelectorAll(s).forEach(el => {
        el.style.display = 'none';
        try { el.remove(); } catch (e) {}
      });
    });
  }
  
  removeAds();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", removeAds);
  }
  window.addEventListener("load", removeAds);
  setInterval(removeAds, 500);
  
  new MutationObserver(removeAds).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });
})();
<\/script>`;
    
    if (html.includes("</head>")) {
      html = html.replace("</head>", adBlockScript + "</head>");
    } else {
      html = adBlockScript + html;
    }

    return new Response(html, {
      status: response.status,
      headers: newHeaders
    });
  }

  if (contentType.includes("javascript")) {
    if (isAdRequest(targetURL)) {
      console.log("[Ad Blocked] Script:", targetURL);
      return new Response("", { status: 200, headers: { "Content-Type": "application/javascript" } });
    }
  }

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}
__name(proxyRequest, "proxyRequest");

function blockAdsInHTML(html) {
  html = html.replace(/<script[^>]*googlesyndication[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*adsbygoogle[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*google-analytics[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*googletagmanager[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<script[^>]*doubleclick[^>]*>[\s\S]*?<\/script>/gi, "");
  html = html.replace(/<iframe[^>]*googlesyndication[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<iframe[^>]*doubleclick[^>]*>[\s\S]*?<\/iframe>/gi, "");
  html = html.replace(/<ins[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins>/gi, "");
  html = html.replace(/<div[^>]*id="google_ads[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");
  return html;
}
__name(blockAdsInHTML, "blockAdsInHTML");

export { worker_default as default };
