/**
 * Local dev server: static files + SAMAGAM/UBI pending API + reverse proxies.
 */
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const SAMAGAM_PROXY_PREFIX = "/samagam-proxy";
const UBI_PROXY_PREFIX = "/ubi-proxy";
const SAMAGAM_ORIGIN = "https://samagam.kvs.gov.in";
const UBI_ORIGIN_CO = "https://epay.unionbankofindia.co.in";
const UBI_ORIGIN_BANK = "https://epay.unionbankofindia.bank.in";
const UBI_HOST = "epay.unionbankofindia.bank.in";
/** Dev proxy only: school/corporate networks often MITM HTTPS with a local CA Node does not trust. */
const relaxedHttpsAgent = new https.Agent({
  rejectUnauthorized: process.env.KV_SAMAGAM_TLS_STRICT === "1",
});

let samagamPending = null;
let ubiPending = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".user.js": "text/javascript; charset=utf-8"
};

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}

function sendJson(res, status, obj, origin) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...corsHeaders(origin)
  });
  res.end(body);
}

function safeFilePath(urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function rewriteLocationSamagam(loc) {
  const s = String(loc || "");
  if (s.startsWith(SAMAGAM_ORIGIN)) return SAMAGAM_PROXY_PREFIX + s.slice(SAMAGAM_ORIGIN.length);
  if (s.startsWith("/")) return SAMAGAM_PROXY_PREFIX + s;
  return s;
}

function rewriteLocationUbi(loc) {
  const s = String(loc || "");
  if (s.startsWith(UBI_ORIGIN_BANK)) return UBI_PROXY_PREFIX + s.slice(UBI_ORIGIN_BANK.length);
  if (s.startsWith(UBI_ORIGIN_CO)) return UBI_PROXY_PREFIX + s.slice(UBI_ORIGIN_CO.length);
  if (s.startsWith("/")) return UBI_PROXY_PREFIX + s;
  return s;
}

function rewriteSetCookie(cookies, proxyPrefix) {
  const list = Array.isArray(cookies) ? cookies : [cookies];
  return list.map((cookie) => {
    let c = String(cookie);
    c = c.replace(/;\s*domain=[^;]+/gi, "");
    c = c.replace(/;\s*path=[^;]+/gi, "");
    c = c.replace(/;\s*secure/gi, "");
    return c + "; Path=" + proxyPrefix + "/";
  });
}

function rewriteSamagamUrls(text) {
  let s = String(text);
  s = s.replace(/https?:\/\/samagam\.kvs\.gov\.in/gi, SAMAGAM_PROXY_PREFIX);
  s = s.replace(/\/\/samagam\.kvs\.gov\.in/gi, SAMAGAM_PROXY_PREFIX);
  return s;
}

function rewriteUbiUrls(text) {
  let s = String(text);
  s = s.replace(/https?:\/\/epay\.unionbankofindia\.bank\.in/gi, UBI_PROXY_PREFIX);
  s = s.replace(/\/\/epay\.unionbankofindia\.bank\.in/gi, UBI_PROXY_PREFIX);
  s = s.replace(/https?:\/\/epay\.unionbankofindia\.co\.in/gi, UBI_PROXY_PREFIX);
  s = s.replace(/\/\/epay\.unionbankofindia\.co\.in/gi, UBI_PROXY_PREFIX);
  return s;
}

function rewriteRootRelativeUrls(text, prefix) {
  let s = String(text);
  s = s.replace(
    /(src|href|action|formaction)=(["'])\/(?!\/|samagam-proxy\/|ubi-proxy\/)/gi,
    `$1=$2${prefix}/`
  );
  return s;
}

function rewriteSamagamHtml(html, targetPath) {
  let s = rewriteSamagamUrls(html);
  s = rewriteRootRelativeUrls(s, SAMAGAM_PROXY_PREFIX);
  const isAxd = /\.axd(?:[?#]|$)/i.test(String(targetPath || ""));
  const isFullPage = !isAxd && (/<html[\s>]/i.test(s) || /<\/body>/i.test(s));
  if (isFullPage) {
    const inject =
      '<script src="/samagam-inject.js"></script><script src="/samagam-proxy-boot.js"></script>';
    if (s.includes("</body>")) s = s.replace("</body>", inject + "</body>");
    else if (/<\/html>/i.test(s)) s = s.replace(/<\/html>/i, inject + "</html>");
  }
  return s;
}

function rewriteUbiHtml(html, targetPath) {
  let s = rewriteUbiUrls(html);
  s = rewriteRootRelativeUrls(s, UBI_PROXY_PREFIX);
  s = rewriteUbiCss(s);
  s = s.replace(/\sintegrity=(["'])[^"']*\1/gi, "");
  const isAxd = /\.axd(?:[?#]|$)/i.test(String(targetPath || ""));
  const isFullPage = !isAxd && (/<html[\s>]/i.test(s) || /<\/body>/i.test(s));
  if (isFullPage) {
    const inject =
      '<script src="/ubi-fee-inject.js"></script><script src="/ubi-proxy-boot.js"></script>';
    if (s.includes("</body>")) s = s.replace("</body>", inject + "</body>");
    else if (/<\/html>/i.test(s)) s = s.replace(/<\/html>/i, inject + "</html>");
  }
  return s;
}

function rewriteSamagamCss(css) {
  let s = rewriteSamagamUrls(css);
  s = s.replace(/url\(\s*(['"]?)\/(?!\/|samagam-proxy\/|ubi-proxy\/)/gi, `url($1${SAMAGAM_PROXY_PREFIX}/`);
  return s;
}

function rewriteUbiCss(css) {
  let s = rewriteUbiUrls(css);
  s = s.replace(/url\(\s*(['"]?)\/(?!\/|samagam-proxy\/|ubi-proxy\/)/gi, `url($1${UBI_PROXY_PREFIX}/`);
  return s;
}

function filterHeaders(headers) {
  const out = { ...headers };
  delete out.host;
  delete out.connection;
  delete out["content-length"];
  return out;
}

function decompressBody(body, encoding) {
  const enc = String(encoding || "").toLowerCase().trim();
  if (!enc || enc === "identity") return body;
  try {
    if (enc.includes("gzip")) return zlib.gunzipSync(body);
    if (enc.includes("deflate")) return zlib.inflateSync(body);
    if (enc.includes("br")) return zlib.brotliDecompressSync(body);
  } catch (_e) {
    return body;
  }
  return body;
}

function rewriteRefererToUpstream(referer, prefix, origin) {
  if (!referer) return origin + "/";
  try {
    const u = new URL(referer);
    if (u.pathname.startsWith(prefix)) {
      return origin + u.pathname.slice(prefix.length) + u.search;
    }
  } catch (_e) {}
  return origin + "/";
}

function rewriteProxiedBody(body, ct, targetPath, opts) {
  const type = String(ct || "").toLowerCase();
  const pathStr = String(targetPath || "");
  if (type.includes("text/html") && opts.rewriteHtml) {
    return Buffer.from(opts.rewriteHtml(body.toString("utf8"), pathStr), "utf8");
  }
  if (type.includes("text/css") && opts.rewriteCss) {
    return Buffer.from(opts.rewriteCss(body.toString("utf8")), "utf8");
  }
  if (
    opts.rewriteJs &&
    (type.includes("javascript") ||
      type.includes("ecmascript") ||
      /\.m?js(?:[?#]|$)/i.test(pathStr) ||
      (/\.axd(?:[?#]|$)/i.test(pathStr) && type.includes("text")))
  ) {
    return Buffer.from(opts.rewriteJs(body.toString("utf8")), "utf8");
  }
  if (opts.rewriteJs && (type.includes("json") || type.includes("xml"))) {
    return Buffer.from(opts.rewriteJs(body.toString("utf8")), "utf8");
  }
  return body;
}

const UBI_PROXY_TIMEOUT_MS = 90000;

function sendProxyErrorPage(res, opts, message) {
  const official = opts.origin || UBI_ORIGIN_BANK;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>UBI connection</title>
<style>body{font-family:Segoe UI,sans-serif;max-width:520px;margin:48px auto;padding:0 20px;color:#333}
h1{font-size:1.25rem;color:#6b1c23}p{line-height:1.5}.note{background:#f5f2ef;padding:12px;border-radius:8px;font-size:0.9rem}
a{color:#6b1c23}</style></head><body>
<h1>Could not reach UBI portal</h1>
<p>${String(message || "Connection failed").replace(/</g, "&lt;")}</p>
<div class="note"><strong>Note:</strong> Vaayu only uses your saved login on the official Union Bank fee portal.
You enter the captcha yourself. For a direct, reliable connection (no local proxy), use the <strong>Vaayu Android app</strong>.</div>
<p><a href="${official}/kvsfcs/KVLogin.aspx" target="_blank" rel="noopener">Open official UBI login</a></p>
</body></html>`;
  res.writeHead(502, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function proxyUpstream(req, res, opts, attempt = 0) {
  const rawUrl = req.url || "/";
  const pathAndQuery = rawUrl.slice(opts.prefix.length) || "/";
  const targetPath = pathAndQuery.startsWith("/") ? pathAndQuery : "/" + pathAndQuery;

  const upstreamReferer = rewriteRefererToUpstream(req.headers.referer, opts.prefix, opts.origin);

  const options = {
    hostname: opts.hostname,
    path: targetPath,
    method: req.method,
    agent: relaxedHttpsAgent,
    timeout: UBI_PROXY_TIMEOUT_MS,
    headers: {
      ...filterHeaders(req.headers),
      host: opts.hostname,
      origin: opts.origin,
      referer: upstreamReferer,
    },
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    if (headers["set-cookie"]) {
      headers["set-cookie"] = rewriteSetCookie(headers["set-cookie"], opts.prefix);
    }
    if (headers.location) {
      headers.location = opts.rewriteLocation(headers.location);
    }

    const chunks = [];
    proxyRes.on("data", (c) => chunks.push(c));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks);
      const enc = headers["content-encoding"];
      if (enc) {
        body = decompressBody(body, enc);
        delete headers["content-encoding"];
      }
      const ct = String(proxyRes.headers["content-type"] || "");
      body = rewriteProxiedBody(body, ct, targetPath, opts);
      delete headers["content-length"];
      headers["content-length"] = String(body.length);
      res.writeHead(proxyRes.statusCode || 502, headers);
      res.end(body);
    });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (attempt < 1) {
      proxyUpstream(req, res, opts, attempt + 1);
      return;
    }
    sendProxyErrorPage(
      res,
      opts,
      "Connection timed out. The official UBI server did not respond in time — try again or use the Vaayu Android app."
    );
  });

  proxyReq.on("error", (err) => {
    const retryable = err.code === "ETIMEDOUT" || err.code === "ECONNRESET" || err.code === "EAI_AGAIN";
    if (attempt < 1 && retryable) {
      proxyUpstream(req, res, opts, attempt + 1);
      return;
    }
    sendProxyErrorPage(res, opts, err.message || "Connection failed");
  });

  proxyReq.setTimeout(UBI_PROXY_TIMEOUT_MS);

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

function proxySamagam(req, res) {
  proxyUpstream(req, res, {
    prefix: SAMAGAM_PROXY_PREFIX,
    hostname: "samagam.kvs.gov.in",
    origin: SAMAGAM_ORIGIN,
    label: "SAMAGAM",
    rewriteLocation: rewriteLocationSamagam,
    rewriteHtml: rewriteSamagamHtml,
    rewriteCss: rewriteSamagamCss,
    rewriteJs: rewriteSamagamUrls,
  });
}

function proxyUbi(req, res) {
  proxyUpstream(req, res, {
    prefix: UBI_PROXY_PREFIX,
    hostname: UBI_HOST,
    origin: UBI_ORIGIN_BANK,
    label: "UBI",
    rewriteLocation: rewriteLocationUbi,
    rewriteHtml: rewriteUbiHtml,
    rewriteCss: rewriteUbiCss,
    rewriteJs: rewriteUbiUrls,
  });
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "*";
  const pathname = (req.url || "/").split("?")[0];

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, server: "vaayu-dev", ubiPending: true }, origin);
    return;
  }

  if (pathname === "/samagam-pending.json" && req.method === "GET") {
    sendJson(res, 200, samagamPending || { active: false }, origin);
    return;
  }

  if (pathname === "/api/samagam-pending" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2e6) req.destroy();
    });
    req.on("end", () => {
      try {
        samagamPending = JSON.parse(body || "{}");
        samagamPending.active = true;
        samagamPending.savedAt = new Date().toISOString();
        sendJson(res, 200, { ok: true }, origin);
      } catch (_e) {
        sendJson(res, 400, { ok: false, error: "Invalid JSON" }, origin);
      }
    });
    return;
  }

  if (pathname === "/api/ubi-pending" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2e6) req.destroy();
    });
    req.on("end", () => {
      try {
        ubiPending = JSON.parse(body || "{}");
        ubiPending.active = true;
        ubiPending.savedAt = new Date().toISOString();
        sendJson(res, 200, { ok: true }, origin);
      } catch (_e) {
        sendJson(res, 400, { ok: false, error: "Invalid JSON" }, origin);
      }
    });
    return;
  }

  if (pathname === "/ubi-pending.json" && req.method === "GET") {
    sendJson(res, 200, ubiPending || { active: false }, origin);
    return;
  }

  if (pathname === SAMAGAM_PROXY_PREFIX || pathname.startsWith(SAMAGAM_PROXY_PREFIX + "/")) {
    proxySamagam(req, res);
    return;
  }

  if (pathname === UBI_PROXY_PREFIX || pathname.startsWith(UBI_PROXY_PREFIX + "/")) {
    proxyUbi(req, res);
    return;
  }

  const filePath = safeFilePath(pathname === "/" ? "/index.html" : pathname);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log("Vaayu dev server at http://localhost:" + PORT);
  console.log("SAMAGAM auto-flow uses http://localhost:" + PORT + "/samagam-proxy/");
  console.log("UBI fee flow uses http://localhost:" + PORT + "/ubi-proxy/");
  if (process.env.KV_SAMAGAM_TLS_STRICT !== "1") {
    console.log("SAMAGAM proxy: relaxed TLS (set KV_SAMAGAM_TLS_STRICT=1 to enforce certificate checks)");
  }
  console.log("Open Vaayu at http://localhost:" + PORT + " — not the file:// path");
});
