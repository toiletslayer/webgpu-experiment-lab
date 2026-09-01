# Static Cloudflare Pages Deployment

The public application is deployed from
[toiletslayer/webgpu-experiment-lab](https://github.com/toiletslayer/webgpu-experiment-lab)
to [https://webgpu-experiment-lab.pages.dev](https://webgpu-experiment-lab.pages.dev).
Cloudflare Pages serves the repository root as a static site with no build
step, Pages Functions, Workers, runtime dependencies, telemetry, or external
services. `index.html`, same-origin JavaScript/CSS, and the committed vector
JSON are the complete runtime application.

The root `_headers` file applies a same-origin Content Security Policy,
origin isolation required by WebMCP, MIME-sniffing protection, a no-referrer
policy, and a same-origin `tools` Permissions Policy. The policy permits the
existing same-origin modules and JSON fetch, WebGPU use, clipboard calls made
after a user action, and local Blob downloads. It intentionally disables
workers, plugins, framing, and cross-origin runtime connections.

## WebMCP origin trial

The exact production origin is registered for the Chrome WebMCP origin trial.
The origin-bound token is delivered by the `Origin-Trial` response header in
the committed Cloudflare Pages `_headers` configuration.

Ordinary Chrome validation on the production origin confirmed:

- `window.originAgentCluster === true`
- `document.modelContext` exists
- `get_experiment_status`, `inspect_compute_environment`,
  `start_workgroup_comparison`, and `verify_correctness` are registered
- the page loads idle with no automatic GPU workload

## Reproducing the deployment

To reproduce the current static deployment:

1. Connect `toiletslayer/webgpu-experiment-lab` to a Cloudflare Pages project.
2. Select `main` as the production branch.
3. Use no framework preset and no build command.
4. Serve the repository root as the static output directory.
5. Add no Worker, Pages Function, runtime variable, telemetry, or external
   service.
6. Confirm that Cloudflare Pages applies the committed `_headers` file.
7. Verify the response headers and then confirm `document.modelContext` and the
   four registered tools in ordinary Chrome on the exact production origin.

For a different production hostname, register that exact origin for the Chrome
WebMCP origin trial and issue an origin-bound token for it. Do not reuse the
current production origin's token on another hostname.

## Local development boundary

Run `npm run dev` for local testing. That command binds only to `127.0.0.1`.

**This server is for localhost development only and must not be exposed as the
public deployment server.** Cloudflare Pages serves the static files directly;
do not deploy `scripts/dev-server.js`, a Worker, or a Function as an application
server.
