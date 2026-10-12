/**
 * Translates an API-provided link into the app's own routing vocabulary.
 *
 * Notifications and alerts carry links the backend builds, so the mapping
 * lives in one place rather than being re-derived by each screen. A link that
 * matches nothing falls back to the notification list instead of a dead page.
 */
export function routeFor(link: string): [page: string, id?: string] {
  const listing = link.match(/^\/listings\/([^/?]+)/)
  if (listing) return ["listing", listing[1]]
  const request = link.match(/^\/requests\/([^/?]+)/)
  if (request) return ["request-detail", request[1]]
  const transaction = link.match(/^\/transactions\/([^/?]+)/)
  if (transaction) return ["transactions", transaction[1]]
  return ["notifications"]
}
