import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const port = Number.parseInt(process.env.PORT || "8080", 10);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

export function resolveServedFile(rootPath, encodedPathname) {
  let pathname;
  try {
    pathname = decodeURIComponent(encodedPathname === "/" ? "/index.html" : encodedPathname);
  } catch {
    return { status: 400, file: null, reason: "invalid URL encoding" };
  }

  const segments = pathname.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return { status: 403, file: null, reason: "dotfiles are not served" };
  }

  const servedRoot = resolve(rootPath);
  const file = resolve(servedRoot, `.${pathname}`);
  const containment = relative(servedRoot, file);
  if (containment === ".." || containment.startsWith(`..\\`) || containment.startsWith("../") || isAbsolute(containment)) {
    return { status: 403, file: null, reason: "path is outside the served root" };
  }
  return { status: 200, file, reason: null };
}

export function createDevServer({ rootPath = root } = {}) {
  return createServer((request, response) => {
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { allow: "GET, HEAD" });
        response.end("method not allowed");
        return;
      }
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const resolved = resolveServedFile(rootPath, url.pathname);
      if (resolved.status !== 200) {
        response.writeHead(resolved.status);
        response.end(resolved.reason);
        return;
      }
      const file = resolved.file;

      if (!existsSync(file) || statSync(file).isDirectory()) {
        response.writeHead(404);
        response.end("not found");
        return;
      }

      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": mime[extname(file)] || "application/octet-stream",
      });
      if (request.method === "HEAD") {
        response.end();
      } else {
        createReadStream(file).pipe(response);
      }
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
}

export function startDevServer({ rootPath = root, listenPort = port } = {}) {
  const server = createDevServer({ rootPath });
  server.listen(listenPort, "127.0.0.1", () => {
    console.log(`caps-webgpu localhost-only dev server: http://127.0.0.1:${listenPort}/`);
    console.log("Development only. Do not expose this server as a public deployment server.");
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  startDevServer();
}
