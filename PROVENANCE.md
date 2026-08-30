# Challenge Provenance

This project existed before the OpenAI WebMCP Challenge. The authoritative
private development history records these milestones:

| Private milestone | Commit |
| --- | --- |
| Pre-challenge baseline | `bbb0405142c6bd61f996179e949e6ad2ff755413` |
| WebMCP Milestone 1 | `6587cd1f9ce67249cbd8688ec82774416eac0d84` |
| WebMCP Milestone 2 | `ce7fb13faa09fb7de48f76e44ba3139b7edbfb10` |

The future public challenge repository may reconstruct these commits to remove personal commit metadata. Reconstructed commit hashes will therefore differ.

The reconstructed public baseline snapshot must have exactly the same Git tree
as private baseline `bbb0405142c6bd61f996179e949e6ad2ff755413`.
The next two public commits must correspond to the complete tree diffs introduced
by the two private challenge commits above. A final public hardening commit will
correspond to the release-hardening diff developed after Milestone 2.

History reconstruction is solely a privacy measure. It is not intended to hide
pre-existing work or present the original WebGPU project as challenge-period
work. `WEBMCP_CHALLENGE.md` identifies which functionality existed before the
challenge and which functionality was added during it.
