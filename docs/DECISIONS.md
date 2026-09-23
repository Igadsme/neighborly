# Decisions

## Vite stays

The frontend remains the Vite + React SPA already in this repo. v1 does not migrate to Next.js. Page switching stays in `src/App.tsx` until a later slice replaces that navigation on purpose. Tailwind v4 stays on the Vite plugin.

## No AI in v1

v1 does not call OpenAI or any other model provider. Matching, copy, and moderation stay ordinary application code. Adding a provider would be a new decision, not a default dependency of the request flow.

## Request-first spine

Neighborly is a request-first exchange, not a listing-only catalog. The spine is:

1. Someone posts a need.
2. Nearby listings, services, or people can match.
3. Another person sends an offer.
4. The two negotiate in chat.
5. The offer is accepted or rejected.
6. The exchange is scheduled, completed, and reviewed.

Listings, accounts, and messages exist to support that path. Offer acceptance, transaction completion, and reviews are the next sprint. Housing, jobs, and community stay fixture screens until they get their own APIs on this same spine.
