# Milestone 10 — UI/UX, Accessibility & Performance

Branch: `milestone10-ui-ux-accessibility-performance`, branched from the Milestone 9
commit (`55cbc2d`).

This milestone was measured before it was changed. Most of what follows is a
record of defects that were found by running the real production build in a real
browser, not of features that were added on spec.

No production system was touched. No backend behaviour, API contract or database
schema was modified.

## Acceptance criteria

| # | Requirement | Status |
| --- | --- | --- |
| 10A | Design system | Done |
| 10B | Navigation and IA | Done |
| 10C | Responsive design | Done (landing verified in-browser) |
| 10D | Marketplace | Partial |
| 10E | I Need and matching | Partial |
| 10F | Messaging and notifications | Done (routing fix) |
| 10G | Borrow and lending | Done (routing fix) |
| 10H | Passport and trust | Done (contrast) |
| 10I | Missions and community | Done (contrast) |
| 10J | Accessibility | Done for the shell and shared primitives |
| 10K | Performance | Done (code splitting measured) |
| 10L | Loading/error/empty states | Improved, not exhaustive |
| 10M | Forms and interactions | Partial |
| 10N | Cross-feature consistency | Done (dead-link class fixed) |

Tasks D, E, G, H, I and M are marked **Partial** deliberately: the defects
fixed were systemic (contrast, routing, tap targets) rather than per-screen.
Individual screens still need the per-feature pass described under *Remaining
issues*. Claiming those complete would be inaccurate.

## Measured baseline

Taken on `milestone9` before any change, using `vite build` on this machine:

| Metric | Baseline |
| --- | --- |
| Entry JS (gzip) | 263.91 kB |
| Entry JS (raw) | 1,156.57 kB |
| CSS (gzip) | 11.08 kB |
| JavaScript chunks | 1 |

A single 1.15 MB bundle meant every feature shipped on first paint.

## The four real defects found

### 1. Notifications led to pages that did not exist

`routeFor` mapped `/transactions/<id>` to a page named `transactions`. No screen
in `App.tsx` rendered that page, so tapping such a notification produced a
**blank screen**. Borrow and mission links (`/borrow/requests/…`,
`/borrow/disputes/…`, `/missions/…`, `/missions/contributions`) matched no
pattern at all and silently fell back to the notification list, so the two
largest features added in Milestones 7 and 9 could not be reached from a
notification at all.

This was not caught before because the existing test asserted the broken
behaviour: it expected `["transactions", "t-1"]` and so enshrined a dead route.

Fixed in `src/lib/routes.ts`, with transactions resolving to `dashboard` (which
is where completed exchanges and pending offers actually render). A regression
test now reads `App.tsx` and asserts every mapped page name corresponds to a
real render branch, so this class of bug cannot return silently.

### 2. Muted text failed contrast across most of the product

`text-[#8A9AB5]` was used **250 times** across 32 files and measured **2.85:1**
on white — well below the 4.5:1 that WCAG 2.2 AA requires for body text. It
carried timestamps, prices, captions and helper text throughout Passport,
Missions, Borrow, Marketplace and Messages.

Two further offenders: `#C5CCDA` (**1.54:1**, used 60 times for content text and
placeholders) and `#E8694A` (**3.21:1**, 28 uses).

Migrated to measured replacements that pass AA on every surface they appear on:

| Token | Was | Now | Contrast on white |
| --- | --- | --- | --- |
| Muted text | `#8A9AB5` | `#5C6E8A` | 2.85 → **5.18:1** |
| Content/placeholder | `#C5CCDA` | `#5C6E8A` | 1.54 → **5.18:1** |
| Accent text | `#E8694A` | `#B94C2A` | 3.21 → **5.08:1** |

A semantic token layer was added to `src/index.css` (`--color-fg-muted`,
`--color-status-*`, `--color-surface-*`, `--color-focus`) so the next contrast
fix is a single edit rather than 250.

### 3. The header showed one member's identity to everyone

`Navigation.tsx` rendered a hardcoded name, avatar and neighbourhood
("Gad Miller", "Inman Park · Atlanta", a fixed Unsplash photo id). Every signed-in
member saw this. It now loads the real viewer via `api.passport.me()` and
degrades to a neutral "Your account" label on failure rather than inventing an
identity.

The avatar component was also fixed to accept absolute URLs (real uploaded
avatars) rather than assuming every image is an Unsplash id.

### 4. A floating badge rendered over the page header

Visible in the 1440px screenshot only: the "Published listing" badge was
`absolute` with no positioned ancestor, so it resolved against a distant section
and drew over the site header, clipped and overlapping the nav. Fixed by
positioning it against the card wrapper.

This is the clearest argument for looking at screenshots. Every automated check
passed while this bug was on screen.

## Design system

- **Semantic tokens** for surfaces, foregrounds, lines, focus, brand and status
  colours, with the contrast rationale recorded next to each value.
- **Reduced motion** honoured through `prefers-reduced-motion: reduce`, which
  collapses animation and transition durations and disables hover transforms.
  Verified in-browser: `animation-duration` resolves to `1e-05s` under emulation.
- **Focus**: `:focus-visible` ring using `--color-focus`, with `scroll-padding-top`
  so anchor targets are not hidden beneath the sticky header.
- **Touch targets**: a coarse-pointer media query sets `min-height: 2.75rem` on
  buttons, links and form controls, and inline text buttons that had no padding
  were given vertical padding instead of visual chrome.

## Accessibility

New shared primitives in `src/components/a11y.tsx`, each covered by tests:

- **`SkipLink`** — first focusable element, targets the `main` landmark.
- **`LiveRegion`** — polite/assertive announcements that stay mounted when
  empty (a live region added together with its text is frequently not announced).
- **`Modal`** — focus trap, Escape to close, focus restoration, `aria-modal`,
  scroll lock.
- **`Menu`** — Escape returns focus to the trigger, arrow keys move between
  items and wrap, outside click dismisses.
- **`RouteFallback`** — announced skeleton for lazily-loaded routes.

Also: `aria-current="page"` on active navigation, `aria-expanded`/`aria-haspopup`
on menu triggers, unread badges capped at `99+` and mirrored in the accessible
name, `alt` on every image, decorative verification ticks marked `aria-hidden`,
and `StarRating` given a text alternative so the value is not conveyed by a
glyph.

The document previously had **no title** (it shipped the Vite placeholder
"Figma Make App"); `site.json` now sets a real one.

## Performance

| Metric | Before | After |
| --- | --- | --- |
| Entry JS (gzip) | 263.91 kB | **159.69 kB** (−39.5%) |
| Entry JS (raw) | 1,156.57 kB | **568 kB** (−50.9%) |
| JavaScript chunks | 1 | **47** |
| CSS (gzip) | 11.08 kB | 11.57 kB |

Every screen is now `React.lazy`-loaded behind a `Suspense` boundary. `Landing`
is the deliberate exception: it is the first thing a signed-out visitor sees, so
bundling it eagerly keeps the entry chunk meaningful rather than deferring the
only visible screen.

Measured in headless Chrome against the production build (see *Browser
verification*): FCP **104 ms**, DOMContentLoaded **19 ms**, CLS **0**.

## Browser verification

`scripts/milestone10-browser-check.mjs` drives the system Chrome over the
DevTools protocol — the same approach as the existing
`docker-release-browser-smoke.mjs`, so no browser dependency was added. It runs
against the **production build** served by `vite preview`.

```
pnpm exec vite build
pnpm exec vite preview --port 4173 &
CHECK_OUT=artifacts/milestone10-browser node scripts/milestone10-browser-check.mjs
```

**31 checks, 31 passing**, covering six viewports (320 / 375 / 390 / 768 / 1024 /
1440). Both a desktop and a mobile screenshot were captured and **visually
reviewed** — the header-overlap bug above was found this way.

The first run failed 4 checks (tap targets, skip-link reveal, document title,
network). Three were genuine defects now fixed. Two notes on rigour:

- The title check originally passed against an empty title because the predicate
  was wrong; it was corrected so the fix is actually verified.
- The skip-link check was racing a 120 ms transition and reading a stale value;
  the check now waits before sampling.

## Test results

All executed in this milestone.

| Suite | Result |
| --- | --- |
| Frontend Vitest | 19 files, **241 passed** (baseline 222; +19 new) |
| Frontend ESLint | Clean |
| Frontend TypeScript | Clean |
| Frontend production build | Pass |
| Backend Jest | 35 suites, **282 passed** |
| Backend ESLint | Clean |
| Backend production build | Pass |
| PostgreSQL integration | 16 suites, **319 passed** |
| Storage integration (real PG + S3) | 3 suites, **33 passed** |
| Browser checks | **31 passed** |

New tests: `src/components/a11y.test.tsx` (15) and expanded
`notifications.test.tsx` (route coverage + the dead-route guard).

No backend file was modified, so no migration drift check was required; the
schema is untouched.

## Known limitations

These are stated plainly because automated checks cannot establish them:

- **No full WCAG 2.2 AA conformance claim.** Automated checks and manual
  keyboard review are not screen-reader testing. No NVDA, JAWS or VoiceOver
  testing was performed. Manual testing with real assistive technology remains
  outstanding.
- **Browser verification covered the signed-out landing page only.** Running the
  authenticated app required the backend, which was not started during this
  milestone; API calls correctly failed and were reported separately rather than
  being counted as passes. Screens authenticated screens remain unverified.
- **No Lighthouse run.** Playwright, Puppeteer and Lighthouse are absent from the
  project and none was added. The performance figures above are bundle sizes and
  browser paint timings, not Lighthouse scores. To reproduce a Lighthouse audit,
  install it separately against the preview server.
- **LCP was not captured** (the Performance API exposed no LCP entry under
  headless emulation). FCP and CLS were.
- **Per-screen design review is incomplete.** Tasks D, E, G, H, I and M received
  systemic fixes only; a screen-by-screen consistency pass across those areas is
  still to do.
- **Contrast was verified by calculation**, using the WCAG 2.x relative
  luminance formula against each background in use, not by an automated scanner
  over every rendered state.

## Remaining issues

1. Screen-reader testing (NVDA/VoiceOver) on the new dialog and menu primitives.
2. Authenticated-route browser verification, which needs the backend running.
3. Per-screen design pass for Marketplace, I Need, Borrow, Passport and Missions.
4. The sign-in dialog in `Landing.tsx` (`signInOpen`, `role="dialog"`) is
   hand-rolled: it has no focus trap, no Escape handling and no focus
   restoration. It should adopt the shared `Modal` from `a11y.tsx`.
5. Add a Lighthouse or equivalent budget to CI so bundle regressions are caught
   automatically rather than by manual measurement.

## Readiness for Milestone 11

The frontend builds, typechecks, lints and passes 241 tests. The backend passes
its full regression set (282 unit + 319 integration + 33 storage) with no
changes made to it. The shell, design system and shared primitives are in a
sound state to build on.

The honest gap is coverage breadth: one screen verified in a real browser, no
screen-reader testing, and no Lighthouse gate. Milestone 11 (End-to-End QA &
Release Hardening) should treat authenticated-route verification and automated
a11y regression gates as its first work.