# Neighborly Architecture Blueprint

## 1. Summary

This repository contains a polished React 19 + TypeScript marketplace prototype for a request-first local exchange platform. The current frontend already defines the user journeys and core screens for a neighborhood marketplace: landing, onboarding, home feed, explore, categories, map discovery, listing detail, create listing, messages, saved items, profile, dashboard, housing, services, jobs, and community.

The goal is to evolve this experience into a production-ready product without replacing the current visual design. The architecture therefore preserves the interface structure and semantics while layering in a secure, modular backend and data model that supports both supply-side and demand-side flows.

## 2. Frontend inventory and route map

The app currently uses a single-state page engine in `src/App.tsx` with the following route IDs:

- `landing`
- `onboarding`
- `home`
- `explore`
- `categories`
- `map`
- `listing`
- `create`
- `messages`
- `saved`
- `profile`
- `dashboard`
- `housing`
- `services`
- `jobs`
- `community`

Key frontend modules:

- `src/components/Navigation.tsx` – desktop/mobile nav, global search, location selector, profile menu
- `src/components/ui.tsx` – reusable cards, badges, buttons, tabs, sections, icons, avatars
- `src/data/index.ts` – canonical mock content for sellers, listings, services, jobs, communities, map results, and conversation data
- `src/pages/*` – view-specific screens and UI actions

## 3. Hardcoded data and visual-only actions

The current app clearly uses mock data for nearly every workflow. This is appropriate for prototype fidelity, but it must be converted to real API-backed flows.

Major data sources in `src/data/index.ts`:

- `sellers`
- `listings`
- `jobs`
- `services`
- `housingListings`
- `communityPosts`
- `mapListings`
- `conversations`

Hardcoded flow assumptions:

- Listing cards are clickable but do not resolve a real listing id
- Save/bookmark toggles are client-only
- Search inputs are interactive but not connected to backend search
- Chat and messaging screens are static mock conversations
- Post listing form has state and steps but no persistence
- Dashboard metrics are static and not generated from transactions
- Community events and posts are not backed by server data
- Location and neighborhood selection are a local UI state rather than authenticated profile state

These visual flows must be reimplemented as domain-driven APIs and persistence-backed services.

## 4. Core product model

Neighborly is best understood as a request-first local marketplace and community exchange platform. The important difference from a traditional listing-only app is the central user workflow:

1. A user creates a need request
2. The system matches nearby inventory, services, people, or listings
3. Another user sends an offer
4. The requester and offerer negotiate in chat
5. Offer is accepted or rejected
6. The exchange is scheduled
7. Transaction is completed
8. Reviews and reputation update the user passport

This means the backend must support both supply and demand actors, not simply product listing CRUD.

## 5. Architectural direction

### Modular monolith

We will build a modular monolith in NestJS with domain modules:

- `auth`
- `users`
- `listings`
- `requests`
- `offers`
- `transactions`
- `messaging`
- `trust`
- `community`
- `locations`
- `notifications`
- `media`
- `search`

This keeps the first release operational and deployable without unnecessary service fragmentation.

### Persistence

- PostgreSQL for transactional data and relational integrity
- Prisma ORM for schema, migrations, typed queries, and relation management
- Redis for rate limiting, caching, session data, queues, notifications, and ephemeral state
- PostGIS for spatial indexing and geographic queries
- S3-compatible object storage for listing images, documents, and identity verification uploads

### Real-time features

- Socket.IO or Nest WebSockets for messaging, offers, notifications, transaction updates, and typing indicators
- Structured event emitter pattern for domain events such as request matched, offer received, appointment scheduled, and payment captured

## 6. Staged implementation plan

### Phase 1: foundation and contracts

- Create NestJS application skeleton and environment validation
- Define Prisma schema, enums, migrations, and seed data
- Set up Redis, PostgreSQL, Docker Compose, and Swagger
- Establish logging, error filters, security headers, and rate limiting
- Build a frontend-to-backend feature map and API contract documentation

### Phase 2: identity, auth, and local profiles

- Implement user, profile, verification, notification preferences, and device sessions
- Add JWT/session-based auth with refresh-token rotation
- Build role management and authorization guards
- Support neighborhood and location-based profile preferences
- Add onboarding and preference persistence

### Phase 3: listing and request lifecycle

- Create listing CRUD with images, availability, attributes, pricing history, and location data
- Add request-first commerce entities: `NeedRequest`, `RequestOffer`, `OfferItem`, `CounterOffer`, and matches
- Implement category, attribute, and search indexing
- Add saved searches, favorites, and wishlist flows

### Phase 4: transactions and communication

- Create transactions, milestones, appointments, pickup details, and payment records
- Add messaging domain with conversations, participants, attachments, typing status, and read receipts
- Integrate offer acceptance/rejection workflow and event-driven status history

### Phase 5: trust, community, and specialized modules

- Add reviews, trust passport, reputation scoring, reports, dispute workflows
- Implement community posts, events, missions, volunteers, and neighborhood goals
- Add housing, services, jobs, and other category-specific modules with normalized relationship patterns

### Phase 6: production hardening

- Add Sentry monitoring, logs, alerts, usage dashboards
- Add Stripe Connect, email service, file uploads, and abuse controls
- Optimize geospatial search and caching
- Run security review, load checks, and rollout guardrails

## 7. Implementation principles

- Preserve the current frontend UI and interaction structure
- Use real data only where model contracts align with the product flow
- Prefer server-side validation and domain logic over frontend-only behavior
- Design for trust, safety, and moderation from the start
- Use soft deletes and audit timestamps for all domains that support user-generated content
- Introduce feature flags for new marketplace flows rather than modifying core screens for experimental data shapes

## 8. Recommendation

The best next step is to author the formal backend contract and schema first, then connect the existing screens to their corresponding domain module APIs. This sequencing avoids reworking the UI while also making the backend contract reflect the current product semantics.

The current prototype is already rich enough to drive the first production release plan. The backend should be designed around the real user flow: request, match, offer, communication, acceptance, completion, and review.

## 9. Current implementation stage

The repository now contains the foundation and the first request-first vertical slice:

- NestJS application with validated configuration, Swagger, Helmet, CORS, and global DTO validation
- Prisma/PostgreSQL schema with initial migration
- Registration and login with Argon2 password hashing and JWT access tokens
- Listing search and authenticated listing creation
- Need request publishing and public discovery
- Offer creation, listing ownership checks, and counteroffers
- Authenticated transaction listing and a server-enforced transaction state machine
- Centralized typed frontend API client for auth, listings, requests, offers, and transaction transitions

The remaining prototype pages still use fixture data until their domain modules are implemented. They are not represented as production-backed behavior yet; this avoids silently presenting fake persistence as complete functionality.
