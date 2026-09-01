# Challenge Provenance

This project existed before the OpenAI WebMCP Challenge. The public repository
is [toiletslayer/webgpu-experiment-lab](https://github.com/toiletslayer/webgpu-experiment-lab).
Its history was reconstructed to replace private commit metadata while
preserving the corresponding project snapshots.

| Milestone | Private development commit | Public equivalent |
| --- | --- | --- |
| Pre-challenge baseline | `bbb0405142c6bd61f996179e949e6ad2ff755413` | `15720cc10c1ea0edee39103ba81baddc2cf74658` |
| WebMCP Milestone 1 | `6587cd1f9ce67249cbd8688ec82774416eac0d84` | `7067fc76860b1fd09c36d2754e22f223036bbf78` |
| WebMCP Milestone 2 | `ce7fb13faa09fb7de48f76e44ba3139b7edbfb10` | `3ffe0ebfe8ed4dd6c87f857ec88c649062c00d02` |
| Release hardening | `3670673feb1725b122e81e8ec6768fdc385d9ffb` | `5b8324628a54742fca5888673deafc640165d489` |

History reconstruction was solely a privacy measure. It was not intended to
hide pre-existing work or present the original WebGPU project as
challenge-period work. [WEBMCP_CHALLENGE.md](./WEBMCP_CHALLENGE.md) identifies
which functionality existed before the challenge and which functionality was
added during it.

After the four reconstructed snapshots, public commit
`47ef09a7ecb2e7c5b1cda7e3e1930dcffbdfb063` (`Enable WebMCP origin trial`)
configured the already-built application for ordinary-Chrome production
testing at [https://webgpu-experiment-lab.pages.dev](https://webgpu-experiment-lab.pages.dev).
This fifth public commit adds no challenge functionality; it delivers the
origin-bound WebMCP trial header through the committed Cloudflare Pages
`_headers` configuration.
