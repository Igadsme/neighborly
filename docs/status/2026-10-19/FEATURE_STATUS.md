# Feature status

Assessments below use only recorded execution evidence or direct source inspection. “Verified” does not imply production readiness.

| Area | Status | Evidence / limitation |
| --- | --- | --- |
| Registration and login | VERIFIED WORKING | Real staging marketplace report logged in two fixture users; auth integration evidence also exists. |
| Email verification | IMPLEMENTED BUT NOT VERIFIED for a person | Tokens and UI exist, but staging uses `EmailOutbox`; no email provider is configured. See `docs/EMAIL_DELIVERY.md`. |
| Password recovery | IMPLEMENTED BUT NOT VERIFIED for a person | Local outbox flow is implemented; external delivery is absent. |
| Sessions and refresh | VERIFIED WORKING | Recorded security probe: refresh succeeds once and replay returns 401. |
| Listings and categories | VERIFIED WORKING | Staged API journey listed categories and created marketplace data; authorization probes covered ownership. |
| Search/discovery | IMPLEMENTED BUT NOT VERIFIED in the current browser | API/category evidence exists; complete current HTTPS browser journey was not rerun during shutdown. |
| Requests and offers | VERIFIED WORKING | Staged journey created a request, offer, and accepted offer. |
| Messaging | VERIFIED WORKING | Both staged participants sent messages; unrelated access returned 403. |
| Borrowing/lending | IMPLEMENTED BUT NOT VERIFIED in this shutdown | Code and prior harnesses exist, but no new test was run by shutdown instruction. |
| Transaction completion | VERIFIED WORKING | Recorded legal transitions reached completion only after both participant confirmations. |
| Reviews | VERIFIED WORKING | Staged journey submitted a review after completion. |
| Housing | IMPLEMENTED BUT NOT VERIFIED | API/UI wiring exists; tours and commute filtering remain unavailable. |
| Jobs | IMPLEMENTED BUT NOT VERIFIED | API/UI wiring exists; some sharing and city controls remain local. |
| Services | IMPLEMENTED BUT NOT VERIFIED | Quote flow exists and requests an address; avoid real addresses in pilot. |
| Community | IMPLEMENTED BUT NOT VERIFIED | Core feeds/actions are wired; reply/share and some composers remain incomplete. |
| Trust and safety | PARTIALLY WORKING | Reports, blocks, authorization and safety checks exist; trust metrics and identity signals are not a complete verification system. |
| Responsive UI | IMPLEMENTED BUT NOT VERIFIED on current staging | Historical browser report covered six widths, but targeted a development URL and recorded connection-refused requests. |
| Accessibility | IMPLEMENTED BUT NOT VERIFIED on current staging | Historical axe/keyboard evidence exists; no screen-reader test and no new run during shutdown. |
| Backend APIs | VERIFIED WORKING for the recorded marketplace slice | Staged real-service journey completed 20/20 recorded steps. |
| Database/migrations | IMPLEMENTED; prior CI evidence exists | No migrations were run during shutdown. |
| Object storage | IMPLEMENTED; backup preserved | RustFS staging is running; QA package includes a checksummed archive. |

Known UI limitations are documented in `docs/FRONTEND_BACKEND_MAP.md`, including local-only comparison, price-alert copy, AI/scam-detection presentation, Promote, follow, share, reserve, negotiate, and unavailable “Coming soon” controls.
