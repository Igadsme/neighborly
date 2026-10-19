import { pathFor } from "./paths"

/**
 * Translates an API-provided link into the app's own routing vocabulary.
 *
 * Notifications and alerts carry links the backend builds, so the mapping
 * lives in one place rather than being re-derived by each screen.
 *
 * Every link the backend currently emits must map to a page that actually
 * renders, otherwise tapping a notification lands the user on a blank screen.
 * A link that matches nothing falls back to the notification list, which is a
 * real destination, rather than a route that renders nothing.
 *
 * `notificationPath` is the address bar path for that page. Navigation writes
 * it with `history.pushState`, so a notification target survives refresh.
 */
export function routeFor(link: string): [page: string, id?: string] {
  const id = (pattern: RegExp): string | undefined => link.match(pattern)?.[1]

  const listing = id(/^\/listings\/([^/?]+)/)
  if (listing) return ["listing", listing]

  const request = id(/^\/requests\/([^/?]+)/)
  if (request) return ["request-detail", request]

  // Transactions have no dedicated screen; completed exchanges, pending
  // offers and meetups are all shown on the dashboard.
  if (/^\/transactions\/[^/?]+/.test(link)) return ["dashboard"]

  // Borrowing: `/borrow/requests/<id>` is a single borrow request, and
  // `/borrow/disputes/<id>` opens the dispute centre focused on that dispute.
  const borrowRequest = id(/^\/borrow\/requests\/([^/?]+)/)
  if (borrowRequest) return ["borrow-detail", borrowRequest]

  const dispute = id(/^\/borrow\/disputes\/([^/?]+)/)
  if (dispute) return ["borrow-dispute", dispute]

  // Missions: `/missions/contributions` is a fixed screen, `/missions/<id>`
  // is a mission, and `/missions/<id>/manage` is the organizer dashboard for
  // that mission.
  if (/^\/missions\/contributions/.test(link)) return ["mission-contributions"]
  const missionManage = id(/^\/missions\/([^/?]+)\/manage/)
  if (missionManage) return ["mission-manage", missionManage]
  const mission = id(/^\/missions\/([^/?]+)/)
  if (mission) return ["mission-detail", mission]

  const conversation = id(/^\/(?:messages|conversations)\/([^/?]+)/)
  if (conversation) return ["messages", conversation]

  const profile = id(/^\/(?:profile|users)\/([^/?]+)/)
  if (profile) return ["profile", profile]

  const borrowItem = id(/^\/borrow\/items\/([^/?]+)/)
  if (borrowItem) return ["borrow-item", borrowItem]

  // `/borrow` and other bare area links open the area's landing screen.
  if (/^\/borrow\/?$/.test(link)) return ["borrow-lent"]

  return ["notifications"]
}

/** Addressable path a notification should open. */
export function notificationPath(link: string): string {
  const [page, id] = routeFor(link)
  return pathFor(page, id) ?? "/notifications"
}
