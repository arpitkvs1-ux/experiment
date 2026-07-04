/**
 * Local dev server: static files + SAMAGAM pending API + SAMAGAM reverse proxy (auto login/fill).
 */
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PROXY_PREFIX = "/samagam-proxy";
const SAMAGAM_ORIGIN = "https://samagam.kvs.gov.in";
/** Dev proxy only: school/corporate networks often MITM HTTPS with a local CA Node does not trust. */
const samagamHttpsAgent = new https.Agent({
  rejectUnauthorized: process.env.KV_SAMAGAM_TLS_STRICT === "1",
});

let samagamPending = null;

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

function rewriteLocation(loc) {
  const s = String(loc || "");
  if (s.startsWith(SAMAGAM_ORIGIN)) return PROXY_PREFIX + s.slice(SAMAGAM_ORIGIN.length);
  if (s.startsWith("/")) return PROXY_PREFIX + s;
  return s;
}

function rewriteSetCookie(cookies) {
  const list = Array.isArray(cookies) ? cookies : [cookies];
  return list.map((cookie) => {
    let c = String(cookie);
    c = c.replace(/;\s*domain=[^;]+/gi, "");
    c = c.replace(/;\s*path=[^;]+/gi, "");
    c = c.replace(/;\s*secure/gi, "");
    return c + "; Path=" + PROXY_PREFIX + "/";
  });
}

function rewriteSamagamUrls(text) {
  let s = String(text);
  s = s.replace(/https?:\/\/samagam\.kvs\.gov\.in/gi, PROXY_PREFIX);
  s = s.replace(/\/\/samagam\.kvs\.gov\.in/gi, PROXY_PREFIX);
  return s;
}

function rewriteHtml(html) {
  let s = rewriteSamagamUrls(html);
  // Root-relative only — do not double-prefix paths already rewritten above.
  s = s.replace(/(src|href|action)=(["'])\/(?!\/|samagam-proxy\/)/gi, `$1=$2${PROXY_PREFIX}/`);
  const inject =
    '<script src="/samagam-inject.js"></script><script src="/samagam-proxy-boot.js"></script>';
  if (s.includes("</body>")) s = s.replace("</body>", inject + "</body>");
  else s += inject;
  return s;
}

function rewriteCss(css) {
  let s = rewriteSamagamUrls(css);
  s = s.replace(/url\(\s*(['"]?)\/(?!\/|samagam-proxy\/)/gi, `url($1${PROXY_PREFIX}/`);
  return s;
}

function filterHeaders(headers) {
  const out = { ...headers };
  delete out.host;
  delete out.connection;
  delete out["content-length"];
  return out;
}

function proxySamagam(req, res) {
  const rawUrl = req.url || "/";
  const q = rawUrl.indexOf("?");
  const pathAndQuery = rawUrl.slice(PROXY_PREFIX.length) || "/";
  const targetPath = pathAndQuery.startsWith("/") ? pathAndQuery : "/" + pathAndQuery;

  const options = {
    hostname: "samagam.kvs.gov.in",
    path: targetPath,
    method: req.method,
    agent: samagamHttpsAgent,
    headers: {
      ...filterHeaders(req.headers),
      host: "samagam.kvs.gov.in",
      origin: SAMAGAM_ORIGIN,
      referer: SAMAGAM_ORIGIN + "/"
    }
  };

  const proxyReq = https.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    if (headers["set-cookie"]) {
      headers["set-cookie"] = rewriteSetCookie(headers["set-cookie"]);
    }
    if (headers.location) {
      headers.location = rewriteLocation(headers.location);
    }

    const chunks = [];
    proxyRes.on("data", (c) => chunks.push(c));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks);
      const ct = String(proxyRes.headers["content-type"] || "");
      if (ct.includes("text/html")) {
        body = Buffer.from(rewriteHtml(body.toString("utf8")), "utf8");
        delete headers["content-length"];
        headers["content-length"] = String(body.length);
      } else if (ct.includes("text/css")) {
        body = Buffer.from(rewriteCss(body.toString("utf8")), "utf8");
        delete headers["content-length"];
        headers["content-length"] = String(body.length);
      } else if (
        ct.includes("javascript") ||
        ct.includes("ecmascript") ||
        /\.m?js(?:[?#]|$)/i.test(targetPath)
      ) {
        body = Buffer.from(rewriteSamagamUrls(body.toString("utf8")), "utf8");
        delete headers["content-length"];
        headers["content-length"] = String(body.length);
      }
      res.writeHead(proxyRes.statusCode || 502, headers);
      res.end(body);
    });
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("SAMAGAM proxy error: " + err.message);
  });

  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "*";
  const url = req.url || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }

  if (url === "/api/health" && req.method === "GET") {
    sendJson(res, 200, { ok: true, server: "vaayu-dev" }, origin);
    return;
  }

  if (url === "/samagam-pending.json" && req.method === "GET") {
    sendJson(res, 200, samagamPending || { active: false }, origin);
    return;
  }

  if (url === "/api/samagam-pending" && req.method === "POST") {
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

  if (url === PROXY_PREFIX || url.startsWith(PROXY_PREFIX + "/")) {
    proxySamagam(req, res);
    return;
  }

  const filePath = safeFilePath(url === "/" ? "/index.html" : url);
  if (!filePath) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }
  serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log("Vaayu dev server at http://localhost:" + PORT);
  console.log("SAMAGAM auto-flow uses http://localhost:" + PORT + "/samagam-proxy/ (no Tampermonkey needed)");
  if (process.env.KV_SAMAGAM_TLS_STRICT !== "1") {
    console.log("SAMAGAM proxy: relaxed TLS (set KV_SAMAGAM_TLS_STRICT=1 to enforce certificate checks)");
  }
  console.log("Open Vaayu at http://localhost:" + PORT + " — not the file:// path");
});
