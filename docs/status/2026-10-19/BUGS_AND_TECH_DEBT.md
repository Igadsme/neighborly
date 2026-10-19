# Bugs and technical debt

## P0 — critical

None confirmed in the private staging evidence.

## P1 — release or pilot blockers

1. **Email delivery absent.** Verification and recovery messages stop in `EmailOutbox`; participants cannot receive normal email links. Use operator-mediated synthetic accounts for a supervised pilot.
2. **No complete production identity/payment trust boundary.** Payments, refunds, MFA, and full dispute operations are not implemented. Do not represent the prototype as a financial marketplace or identity-verification service.
3. **Pilot data reset is not a scoped product workflow.** Existing audit scripts create timestamped records but do not provide a safe shared-staging reset. Build or approve a namespace-only reset before repeated sessions.
4. **Remote access is not available.** All staging ports bind to loopback. Keep sessions on the staging Mac unless an authenticated, separately approved tunnel is introduced.
5. **Current staging recovery is incomplete as an operational process.** The QA package has database and object-storage backups with verified checksums, but the disposable restore rehearsal remained a documented procedure rather than a shutdown-time execution.

## P2 — product gaps and misleading surfaces

- Map locate, verified-seller filters, rating filters, listing video, collections, housing tours, commute filtering, and social login are visibly unavailable.
- Compare has local UI behavior but no persisted comparison route.
- Price-alert copy is synthetic; AI Review and scam-detection copy are not model-backed.
- Promote, follow, some share/reserve/negotiate controls, and parts of community interaction remain local or unimplemented.
- Some fixture/non-UUID listing paths retain local-only behavior.
- Screen-reader testing and current staging axe evidence are outstanding.
- Documentation has historical snapshots and must be kept clearly dated when resumed.

## P3 — maintenance

- The T7 exFAT checkout emits AppleDouble/non-monotonic Git index warnings. Use the APFS checkout for all Git operations.
- Generated QA reports and credentials remain outside Git and must stay excluded.
- The internal SSD is space-constrained; keep dependencies, reports, and backups on the T7 where possible.
