# UX request-flow states

June Sprint 1 spec for Nova. Documentation only. The screens already exist. This file says which state each existing control is in, which call to attach, and what must stay painted.

Read with [DECISIONS.md](./DECISIONS.md) (D1, D4, D5, D6, D7, D10, D12) and [FRONTEND_BACKEND_MAP.md](./FRONTEND_BACKEND_MAP.md).

## Rules

- Do not add a page id. Composer = `create`. Offers = `dashboard` and `messages`. Review prompt = `dashboard`, using the modal shell from `listing`.
- Do not restyle. Reuse the class strings named below.
- Do not call a model. Step "AI Review" stays a Continue step.
- Do not show fixture people (Marcus, David, Priya, Gad's stats) on a surface after it is switched to the API. Fixtures remain only on surfaces this spec leaves unwired.
- If the endpoint is in the **TARGET** column of [API_SPEC.md](./API_SPEC.md), the success copy for that action does not appear. Show the error treatment and leave the controls as they were.

## Surface map

| State group | File | Region |
| --- | --- | --- |
| Composer | `src/pages/CreateListing.tsx` | Header, `ProgressBar`, steps 0–5, footer Back / Cancel / Continue |
| Offer list | `src/pages/Dashboard.tsx` | Overview "Pending offers"; Offers tab |
| Offer in thread | `src/pages/Messages.tsx` | Centered "Offer received" card and the transaction strip |
| Review prompt | `src/pages/Dashboard.tsx` | "Reviews to complete" |
| Review submit | `src/pages/ListingDetail.tsx` | Message modal (`messageOpen` block) cloned in behavior, not a new layout |

Shared pieces from `src/components/ui.tsx`: `Button`, `ProgressBar`, `Badge`, `EmptyState`, `Card`, `TabBar`, `Icon`.

---

## 1. Request composer

Host: page `create`. Initial sample strings (desk title, description, price `480`, two Unsplash photos, tags) are the Figma seed. Nova may replace them with empty strings when entering the need flow. Do not replace the inputs, labels, or step chrome.

`mode` comes from the selected type card. Map: [DECISIONS.md](./DECISIONS.md) D6. Card labels stay.

Publish call when this wizard is the need flow:

`api.requests.create` → `POST /api/v1/requests`

```json
{
  "categoryId": "<uuid from GET /categories>",
  "title": "<title input, trimmed>",
  "description": "<description input, trimmed>",
  "budgetCents": "<Math.round(Number(price) * 100) when price is a finite number ≥ 0, else omit>",
  "mode": "<from D6>"
}
```

Do not send photos, tags, condition, pickup, delivery, or shipping. Those controls stay on screen. `radiusMiles` may be omitted (server default 10).

The sale path that already calls `api.listings.create` must keep working if Nova leaves a way to publish a listing. Do not add a second page to do it. Prefer one publish handler that calls `POST /requests` for this sprint's need flow and does not remove the listing client method.

### 1.1 Empty

When: step `0`, `listingType === null`, no publish attempted.

What is already true:

- Heading "What are you listing?" and the 8-card grid.
- Continue is `disabled={step === 0 && !listingType}`.
- Footer shows text button "Cancel" (`text-sm text-[#8A9AB5] hover:text-[#1B2A4A]`), not Back.
- Header does not show "Save draft" (`step > 0` only).

Nova: keep Continue disabled until a card is selected. Cancel goes `onNavigate("home")` and does not call the API.

### 1.2 Drafting

When: a type card is selected and `published === false`. Steps 1–4 and the step-5 form before a successful POST.

Existing chrome to keep:

- `ProgressBar` `steps={6}` `current={step}`.
- Step labels: Type, Photos, Details, AI Review, Preview, Publish. Current label `text-[#2D6A4F]`, earlier `text-[#74C69D]`, later `text-[#C5CCDA]`.
- Selected type card: `border-[#2D6A4F] bg-[#F0FBF3]`.
- Header "Save draft" when `step > 0`, same classes, `onNavigate("home")`.
- Footer "← Back" (`Button variant="ghost"`) when `step > 0`. Continue label "Continue →", or "Continue to publish →" on step 4.
- Details: title `<input>`, description `<textarea>`, category `<select>`, condition `<select>`, price `<input>`, free checkbox, tag chips, pickup/delivery/shipping grid. All stay.
- AI Review (step 3): render the suggested-title card, price bar, and "No issues detected" card. "Apply suggestion" may still copy the local `aiSuggestions.title` into the title field (it is a hardcoded string, not a request). Continue does not fetch.
- Preview (step 4): the white preview card stays. It may show the in-progress title, price, condition, and description.

Drafting is browser state only. There is no draft endpoint (D7). Refresh loses it. That is acceptable for this slice.

Field edits that matter for the request:

| Control | Request use |
| --- | --- |
| Type card | Sets `mode` |
| Title | `title` |
| Description | `description` |
| Category `<select>` | Match `name` to `GET /categories` the way the page already does, store `categoryId` |
| Price | `budgetCents` |
| Everything else | Visible, not submitted |

### 1.3 Validation errors

When: the user activates "Publish now" and the body is illegal, or categories failed to load.

Use the alert that already sits above the step-5 choices:

```tsx
className="mb-4 rounded-xl border border-[#E8694A]/30 bg-[#FFF5F2] px-4 py-3 text-sm text-[#A63D27]"
role="alert"
```

Copy to show (one string, same node):

| Condition | Message |
| --- | --- |
| Categories request failed | `Categories are unavailable. Please retry before publishing.` (already in the page) |
| No `categoryId` | `Choose a valid category before publishing.` (already in the page) |
| Title trim length &lt; 3 | `Add a title of at least 3 characters.` |
| Description trim length &lt; 10 | `Add a description of at least 10 characters.` |
| Price present and not a finite number ≥ 0 | `Enter a budget using numbers only.` |
| No type selected | Do not reach step 5; Continue on step 0 stays disabled |
| `ApiError` from POST | `cause.message` (Nest may return a string array; join with a space) |
| Any other throw | `Unable to publish this listing. Please try again.` (existing fallback sentence; keep it so the node does not gain a second style) |

Do not add per-field red borders. The Figma inputs do not have an error variant. Keep the user on step 5 with the alert visible. Do not set `published`.

Client-side checks run before the POST so the user sees a single alert instead of only a 400.

### 1.4 Publishing

When: `publishing === true` during `POST /requests`.

Already implemented for listings; keep the same flags:

- Both step-5 cards `disabled={publishing || categoryLoading}`.
- Primary card icon `⏳` and label `Publishing...` while `publishing && primary`.
- Secondary "Save as draft" stays disabled for that in-flight request so a navigation cannot race the POST.

### 1.5 Success

When: POST returns without throwing.

Set `published` true. The existing block renders:

- Circle `w-20 h-20 rounded-full bg-[#D8F3DC]`
- Heading node `font-display text-2xl font-semibold text-[#1B2A4A]`
- Two buttons: `Button variant="primary"` and `Button variant="outline"`

Text inside those nodes for a need:

| Node | Text |
| --- | --- |
| Heading | `Request published!` |
| First paragraph (`text-[#5C6E8A]`) | `Your request is live and visible to neighbors nearby.` |
| Second paragraph (`text-sm text-[#8A9AB5]`) | `Offers will show up on your dashboard.` |
| Primary button | `View offers →` → `onNavigate("dashboard")` |
| Outline button | `Go to feed` → `onNavigate("home")` |

Hide the footer Back/Continue row when `published` (the page already does this).

There is no request-detail page. Do not route to `listing` for a need; `listing` is the sofa fixture.

### 1.6 Cancel

Two existing exits. Neither is success.

| Control | When it shows | Result |
| --- | --- | --- |
| "Cancel" | Step 0 footer | `onNavigate("home")`. No request. |
| "Save draft" | Header when `step > 0`, and the step-5 secondary card | `onNavigate("home")`. No request. Do not set `published`. |

If `publishing` is true, the step-5 secondary card is disabled. The header control should not fire a second navigation until the POST settles; ignore header Save draft while `publishing` is true.

"← Back" is not cancel. It only decrements `step`.

---

## 2. Offer compare

Hosts: Dashboard Offers tab (full list) and Overview "Pending offers" (status pending only). Thread affordance: Messages offer card. Do not build a side-by-side page. Saved Items has a compare bar for listings; do not reuse it for offers.

### Data Nova can use

`GET /api/v1/requests` returns every published request and offers as `{ id, status }` only. That cannot fill amount, message, or offerer.

Until a target read exists (`GET /requests/:id` with amount, message, offerer profile — [API_SPEC.md](./API_SPEC.md) TARGET):

- Do not render the hardcoded `offers` array once this tab is on the API path.
- Load, then empty or error, as below.

`api.requests.list` is the only implemented read. Filter client-side to `requester.id === current user id` from `GET /users/me` if Nova wants "my requests" before the target query exists. Still do not invent amounts.

### 2.1 Loading

Replace the offer stack with one block, same classes as Saved Items:

`bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]`

Text: `Loading offers…`

Use it in the Offers tab body and in place of the Overview pending stack. Leave the tab bar and the Received/Sent/Accepted/Declined chips in place. Chips stay visual filters; they do not need new styles. Default the first chip to look selected only by reusing the Dashboard selected-chip idea already used elsewhere (`bg-[#2D6A4F] text-white` is the Messages filter selected style). The Offers chips are currently all unselected (`border-[#E8E6DF]`). When wiring, the active chip uses the Messages selected classes; the rest keep the current chip classes.

### 2.2 Empty offers

When the filtered list is empty and there is no error.

Use `EmptyState` from `src/components/ui.tsx` (Saved Items already uses it):

| Prop | Value |
| --- | --- |
| `title` | `No offers yet` |
| `description` | `When neighbors respond to a request you posted, their offers will show up here.` |
| `actionLabel` | `Post a request` |
| `action` | `() => onNavigate("create")` |
| `icon` | `<Icon name="dollar" size={24} />` |

Overview pending section: if the pending filter is empty but other offers exist, do not use this empty state. Omit the pending cards and keep the section header. If the user has no offers at all, one `EmptyState` under "Pending offers" is enough; the Offers tab uses the same component.

### 2.3 List

When real offer objects include amount and offerer (target payload). One `Card` per offer, the markup already in the Offers tab:

- Thumb `w-14 h-14 rounded-xl` (listing image only if `items[0].listing` has an image URL; otherwise the empty `bg-[#F5F4EF]` box, no broken Unsplash id).
- Title: request title.
- Subline: `{offerer first name} · {relative time from createdAt}`.
- Price row: offer dollars (`amountCents / 100`) in `font-bold text-[#1B2A4A]`, the word `of`, budget dollars in `text-sm text-[#8A9AB5]` when `budgetCents` is set. If amount is null, show the offer `message` in `text-xs text-[#8A9AB5]` instead of a fake price.
- `Badge`: `green` if `ACCEPTED`, `amber` if `PENDING` or `COUNTERED`, `coral` if `REJECTED`, `WITHDRAWN`, or `EXPIRED`.

Overview pending cards keep the three buttons in the row (next section). Offers-tab rows keep the badge and do not need a second button row; the Figma tab is badge-only. Compare means scanning that list, not a new grid.

Received / Sent:

- Received: caller is the requester.
- Sent: caller is the offerer.
- Accepted: status `ACCEPTED`.
- Declined: status `REJECTED` or `WITHDRAWN`.

`COUNTERED` stays under Received or Sent, with the amber badge label `Countered`.

### 2.4 Accept, Counter, Decline

Buttons already on the Overview pending card and on the Messages offer card. Labels and colors stay.

| Button | Classes already in Dashboard | Call |
| --- | --- | --- |
| Accept | `px-3 py-1.5 bg-[#2D6A4F] text-white text-xs font-semibold rounded-lg` | **None.** Target route missing. |
| Counter | white border, `text-[#5C6E8A]` | `POST /api/v1/requests/offers/:id/counter` |
| Decline | white border, `text-[#E8694A]` | **None.** Target route missing. |

Messages card uses the same three labels with `flex-1 py-2` and `rounded-xl`. Keep those classes inside the thread.

Accept and Decline:

- On click, do not set `offerStatus` to `accepted` or `declined`.
- Do not show `✓ Offer accepted! Schedule a meetup.` or `✗ Offer declined`.
- Show the error line inside the card, reusing the composer alert classes (section 1.3): `Accepting an offer isn't available yet.` or `Declining an offer isn't available yet.`
- Leave the three buttons visible.

Counter:

- Do not open a new modal. The Messages composer is already under the card.
- Clicking Counter focuses that textarea and sends on the existing send button **only when** the active thread is an offer thread and the textarea is non-empty.
- Payload: `{ "message": "<trimmed composer text>", "amountCents": <optional integer parsed from a leading $ amount in that text> }`. If the user did not type a number, omit `amountCents`. Message minimum length is 2; if shorter, do not POST, and show `Add a short message to counter.` in the alert node.
- On 200: badge/status text becomes `Countered` (amber). Do not invent a new confirmation card. The existing pending button row can remain so they can counter again (`PENDING` and `COUNTERED` are both legal).
- On failure: alert node with `ApiError.message`. Buttons unchanged.

Dashboard Counter, where there is no composer: do not add a modal. Route `onNavigate("messages")` only when a conversation id for that offer exists. If it does not (no create-conversation route), show `Open Messages isn't available for this offer yet.` in the alert node and stay on the card.

### 2.5 Errors

List load failure: Saved Items error block.

`bg-[#FFF5F2] border border-[#E8694A]/20 rounded-2xl p-5 text-sm text-[#C4512D]`

Text: `Offers could not be loaded.` plus `ApiError.message` when present.

Offer action failure: composer alert inside the card (2.4). Do not use `window.alert`.

### 2.6 Messages thread around the card

Unchanged layout: list pane, header, green transaction strip, bubbles, quick replies, composer, safety footer.

Transaction strip labels stay: Offer sent, Offer accepted, Meetup scheduled, Item exchanged, Review requested. The strip is display-only. Drive the active index from `Transaction.status` when `GET /transactions` returns a row whose `offerId` matches. Map:

| Status | Highest filled step index |
| --- | --- |
| `OFFER_RECEIVED`, `NEGOTIATING` | 0 |
| `ACCEPTED` | 1 |
| `SCHEDULED` | 2 |
| `IN_PROGRESS` | 3 |
| `COMPLETED` | 4 |

If no transaction row exists, keep the strip at index 0 (current offer received) and do not animate it locally on Accept.

Empty inbox (`GET /conversations` returns `[]`): hide the thread pane the way the page hides it when `selected` is empty on small screens, and show `EmptyState` in the list pane:

| Prop | Value |
| --- | --- |
| `title` | `No messages yet` |
| `description` | `When you and a neighbor start a thread, it will show up here.` |
| `actionLabel` | `Back to dashboard` |
| `action` | navigate `dashboard` |
| `icon` | `<Icon name="message" size={24} />` |

Do not create a conversation from the header plus button. That plus button stays without a handler until `POST /conversations` exists.

Send, for a real conversation id: `api.conversations.send`. On success, append the returned message into the existing bubble list (`msg-bubble-sent` / `msg-bubble-recv` stay). On failure, leave the draft text and show the safety-banner slot with the alert colors from 1.3 instead of the yellow scam banner.

The yellow scam banner stays for the current local check (venmo, zelle, paypal) and still does not send. Copy and classes stay.

Quick replies stay and only fill the textarea.

---

## 3. Review prompt

Host: Dashboard Overview, section "Reviews to complete" / "Leave reviews for recent transactions". Profile's reviews tab is a read-only fixture and is not the prompt.

### 3.1 Post-completion prompt

When: `GET /transactions` includes a row the caller participates in, `status === "COMPLETED"`, and the target review read says this author has not reviewed it. `GET /transactions` does not include reviews today. Until `GET /users/:id/reviews` or an equivalent exists, treat every completed transaction as still needing a prompt. Do not hide the prompt because fixture reviews exist on Profile.

Card (already in Dashboard):

- Thumb `w-12 h-12 rounded-xl`
- `text-xs text-[#8A9AB5]` "Transaction complete"
- `font-semibold text-sm text-[#1B2A4A]` — transaction label. Use the related request or listing title when the payload has one. If it does not, use `Completed exchange`.
- `Button variant="soft" size="xs"` label `Rate {subject first name}` when the other participant's profile is loaded, otherwise `Rate neighbor`

No completed transactions: `EmptyState`

| Prop | Value |
| --- | --- |
| `title` | `No reviews waiting` |
| `description` | `After a completed exchange, you can rate your neighbor from here.` |
| `actionLabel` | `View offers` |
| `action` | switch Dashboard tab to `Offers` (existing `setActiveTab`) |
| `icon` | `<Icon name="star" size={24} />` (`Icon` already defines `star`) |

### 3.2 Skip

The card does not have a skip control today. Add one text button in the existing `flex items-center gap-4` row, after the Rate button, using the composer Cancel classes:

`text-sm text-[#8A9AB5] hover:text-[#1B2A4A]`

Label: `Skip`.

Skip removes that card from local component state for the session and does not call the API. It reappears on the next successful transaction fetch. Do not persist a skip flag (no column).

The modal X is also skip: close, no request, card remains.

### 3.3 Submit

Rate opens a panel that copies the Listing Detail message modal structure (do not invent a different shell):

- Overlay: `fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4`
- Panel: `bg-white rounded-3xl w-full max-w-md p-6`
- Title: `Rate {name}` in `font-display text-lg font-semibold text-[#1B2A4A]`
- Close: existing `w-8 h-8 rounded-full bg-[#F5F4EF]` X
- Context row: the same `flex gap-3 p-3 bg-[#F5F4EF] rounded-xl` preview, title of the exchange
- Stars: five buttons in a row, character `★`, `text-[#F59E0B]` when selected and `text-[#E8E6DF]` when not (Profile reviews already use `#F59E0B` stars). `rating` is 1–5. Default none selected.
- Textarea: Listing Detail classes `w-full p-3 bg-[#F5F4EF] border border-[#E8E6DF] rounded-xl text-sm text-[#1B2A4A] resize-none`
- Primary button: `Button variant="primary" size="md"` label `Submit review`, disabled when `rating` is empty or body trim is empty

`POST /reviews` is **target**. Until it exists:

- Submit stays disabled, or if Nova enables it, the click shows the section 1.3 alert inside the panel: `Reviews can't be submitted yet.`
- Do not show the success check.
- Do not write a review into Profile fixture data.

When the route exists, body:

```json
{
  "transactionId": "<uuid>",
  "subjectId": "<other participant user id>",
  "rating": 5,
  "body": "<trimmed textarea>"
}
```

Server should reject a transaction that is not `COMPLETED` or that the author is not on. The UI still sends only this shape.

### 3.4 Success

Only after a 2xx from `POST /reviews`.

Replace the panel body with the Listing Detail sent-state pattern:

- `text-3xl` check
- `font-semibold text-[#1B2A4A]` `Review submitted`
- `text-sm text-[#8A9AB5]` `Thanks for rating your neighbor.`

Then close the modal and drop that card from the waiting list. Do not navigate away from Dashboard.

### 3.5 Error

Non-2xx or network failure: keep the modal open, keep the star selection and text, show the section 1.3 alert above the textarea with `ApiError.message` or `Unable to submit this review. Please try again.`

Skip and X remain available.

---

## 4. What Nova does not change

- Landing, onboarding, home, explore, categories, map, housing, services, jobs, community, profile layout.
- Navigation structure and the landing Preview bar.
- Create Listing step count and the AI Review step's presence.
- Dashboard tab names and the trust-level banner (it stays fixture until trust tables exist; do not zero it out).
- Saved Items price-alert fiction, until `PriceHistory` is actually returned. Out of this flow.
