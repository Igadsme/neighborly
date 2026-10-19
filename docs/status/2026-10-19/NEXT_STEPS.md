# Next steps

1. Keep the project paused and preserve the QA package and staging volumes.
2. When resuming, install dependencies only after checking internal SSD capacity; prefer T7 caches.
3. Run the existing unit, lint, typecheck, browser, security, storage, and backup suites from the APFS checkout.
4. Add a scoped synthetic-account/listing fixture reset that cannot touch non-pilot records.
5. Complete a disposable database and RustFS restore using the preserved QA backups.
6. Re-run the two-user marketplace flow through the current HTTPS browser endpoint.
7. Perform manual keyboard and screen-reader review for the selected pilot tasks.
8. Decide which placeholder surfaces are explicitly excluded from user sessions and update facilitator materials.
9. Resolve email delivery and recovery strategy before any beta involving real participants.
10. Reassess deployment only after security, legal, operational, and product approvals.

Acceptance criteria for resuming supervised testing:

- Ten synthetic accounts and a scoped reset are documented.
- No real addresses, IDs, payment details, or participant email accounts are collected.
- Core listing, discovery, messaging, offer, completion, and review tasks pass in Chrome.
- Six staging containers remain healthy throughout.
- Backup integrity and disposable restore are demonstrated.
- Facilitators can identify every excluded placeholder feature.
