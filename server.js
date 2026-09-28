import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let port = Number(process.env.PORT) || 4000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { "Content-Type": "text/plain" });
    return response.end("Method Not Allowed");
  }

  let cleanPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  if (!path.extname(cleanPath)) {
    const candidate = path.resolve(__dirname, `.${cleanPath}.html`);
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      cleanPath = `${cleanPath}.html`;
    }
  }

  let filePath = path.resolve(__dirname, `.${cleanPath}`);
  if (!filePath.startsWith(__dirname) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = path.resolve(__dirname, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const isDynamic = ext === ".html" || ext === ".css" || ext === ".js";
  response.writeHead(200, {
    "Content-Type": contentTypes[ext] || "application/octet-stream",
    "Cache-Control": isDynamic ? "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" : "max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  if (isDynamic) {
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
  }
  response.end(readFileSync(filePath));
});

server.on("error", (error) => {
  if (error.code !== "EADDRINUSE") throw error;
  port += 1;
  server.listen(port, "0.0.0.0");
});

const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, () => {
  console.log(`Infinity Gamers Dedicated Admin Portal running at http://${host}:${port}`);
});
