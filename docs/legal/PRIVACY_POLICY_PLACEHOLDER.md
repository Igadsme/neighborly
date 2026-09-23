# Privacy Policy (placeholder)

**Not a policy. Not legal advice. Not published.**

Product Owner Imani Gad must replace this file with text a lawyer has reviewed before any launch. Phase 7 does not publish it. The landing footer and the onboarding line render "Privacy Policy" as `<a href="#">`. Those anchors were not changed and do not open this file.

## Data the API actually stores today

This list is for counsel. It is not a disclosure to users.

- Account: email, name, password hash (Argon2), profile fields the onboarding write accepts, account status (`ACTIVE`, and suspend or delete)
- Marketplace rows the user creates: listings, requests, offers, messages, transactions, reviews
- Housing, jobs, services, and community rows, including applications and quotes
- Safety rows: reports, blocks, moderation actions
- Access token: HS256 bearer token. No refresh token and no cookie is set. The browser keeps the access token in its own storage
- Server logs: JSON lines. `http.request` omits the query string. `auth.login.failure` includes the submitted email. Treat logs as sensitive

The API does not call a payment processor, an email provider, Mapbox, or an AI model. No upload route is mounted, so no image bytes are stored. Public listing and profile reads do not return `passwordHash`, an email field, or listing coordinates (Phase 6).

## What counsel needs to decide

- Which of the fields above are personal data, and the purpose for each
- Retention for accounts, messages, reports, and logs
- Who the operator is, and whether a processor (a future host, database, or log drain) is named
- What suspend, restore, and delete do, and whether delete is a hard delete
- That seed fixtures and staging QA users are not a production population and must not be copied to a public database
- Cookie and local-storage language that matches the cookie placeholder and the real bearer-token behavior
- How people ask for access or deletion, and who answers

## Do not ship this page

Do not link the Figma screens at this file. An empty "Privacy Policy" anchor is still what the UI shows.
