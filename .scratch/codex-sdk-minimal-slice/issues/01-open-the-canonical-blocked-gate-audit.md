# 01. Open the canonical blocked-gate audit

**What to build:** Give a HELIX reviewer a runnable workbench that opens the canonical synthetic bundle on the blocked `C-BW-HIGH` evidence case. The workbench derives the audit from bundle data and keeps the ten-stage journey visible as context.

**Blocked by:** None. Can start immediately.

**Status:** ready-for-agent

- [ ] The running workbench loads only the canonical synthetic bundle and labels all displayed study data as synthetic.
- [ ] Fixture preflight stops startup when any invariant from the spec fails and names the failed invariant.
- [ ] The initial audit shows the `286.2 g` claim, the `mean-v1` transform, and exactly ten ordered provenance edges for `C-BW-HIGH`.
- [ ] The audit shows `VR-003` as passed and explains that the claim traces to ten terminal records.
- [ ] The audit shows `VR-004` as a blocker and explains that dose-group grain does not meet the required dose-group-by-sex grain.
- [ ] The Section 5 gate is blocked by `VR-004`. The release gate is blocked by `VR-004`, `VR-005`, and `VR-006`.
- [ ] Open review dispositions and required human actions are visible. `validated` is described as source reconciliation, not release readiness.
- [ ] Approval, signature, checksum, and export controls are disabled or absent. Any static preview says that the action is unavailable in this slice.
- [ ] The ten-stage rail remains visible, while the selected audit stays focused on `C-BW-HIGH`.
- [ ] The workbench does not read the separate CSV study or use the stale `263.8 g` wireframe value as the claim.
- [ ] Automated checks cover fixture preflight and the displayed blocked audit against the running workbench.
