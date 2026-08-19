import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mind": "application/octet-stream",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/mind") {
    const key = String(req.headers["x-mind-key"] || "").replace(/[^a-z0-9_-]/gi, "");
    if (key !== "logo" && key !== "hito") {
      send(res, 400, "invalid key");
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const dest = path.join(root, "assets", `${key}.mind`);
      fs.writeFileSync(dest, buf);
      send(res, 200, JSON.stringify({ ok: true, bytes: buf.length, dest: `assets/${key}.mind` }), {
        "Content-Type": "application/json; charset=utf-8",
      });
    });
    return;
  }

  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") filePath = "/index.html";
  const abs = path.normalize(path.join(root, filePath));
  if (!abs.startsWith(root)) {
    send(res, 403, "forbidden");
    return;
  }

  fs.readFile(abs, (err, data) => {
    if (err) {
      send(res, 404, "not found");
      return;
    }
    send(res, 200, data, {
      "Content-Type": mime[path.extname(abs)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
  });
});

server.listen(port, () => {
  console.log(`D.LEAGUE AR  http://localhost:${port}`);
  console.log(`compile      http://localhost:${port}/compile.html`);
});
