# Cookie Policy (placeholder)

**Not a policy. Not legal advice. Not published.**

Product Owner Imani Gad must replace this file with text a lawyer has reviewed before any launch. Phase 7 does not publish it. The landing footer renders "Cookie Policy" as `<a href="#">`. That anchor was not changed and does not open this file.

## What the app does today

The API does not set a cookie. CORS is an explicit origin list with `credentials: false`. Access tokens travel in `Authorization: Bearer` only. The signed-in UI stores that token in the browser so a reload can restore the session. That storage is not an HTTP cookie. No advertising cookie and no analytics cookie were added in Phase 7.

A reviewed cookie policy should say that plainly, and it should be updated if a later phase adds a cookie. Do not claim a cookie banner exists. The Figma screens do not have one, and this phase does not add one.
