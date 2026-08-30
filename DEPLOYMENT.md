# Static Cloudflare Pages Deployment Preparation

This repository is prepared for a static Cloudflare Pages deployment, but this
document does not authorize or perform a deployment.

Use the repository root as the static output directory. The project has no
build step, Pages Functions, Workers, runtime dependencies, telemetry, or
external services. `index.html`, same-origin JavaScript/CSS, and the committed
vector JSON are the complete runtime application.

The root `_headers` file applies a same-origin Content Security Policy,
origin isolation required by WebMCP, MIME-sniffing protection, a no-referrer
policy, and a same-origin `tools` Permissions Policy. The policy permits the
existing same-origin modules and JSON fetch, WebGPU use, clipboard calls made
after a user action, and local Blob downloads. It intentionally disables
workers, plugins, framing, and cross-origin runtime connections.

## WebMCP origin-trial token

Do not register or add a token until the final public HTTPS hostname is known.
After registering that exact origin in Chrome's WebMCP origin trial, add the
issued token to `_headers` inside the `/*` rule as:

```text
  Origin-Trial: <issued token for the exact production origin>
```

Do not commit a placeholder that resembles a valid token. Validate the deployed
response headers, then confirm `document.modelContext` and all four tools in the
production browser session.

## Local development boundary

Run `npm run dev` for local testing. That command binds only to `127.0.0.1`.

**This server is for localhost development only and must not be exposed as the
public deployment server.** Cloudflare Pages should serve the static files
directly; do not deploy `scripts/dev-server.js`, a Worker, or a Function as an
application server.
