const baseUrl = process.env.API_URL ?? 'http://localhost:3000/api/v1'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function request(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${JSON.stringify(payload)}`)
  }
  return payload
}

async function expectStatus(path, expectedStatus, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  assert(response.status === expectedStatus, `${method} ${path} returned ${response.status}, expected ${expectedStatus}`)
  return response.json().catch(() => null)
}

async function register(role, runId) {
  const auth = await request('/auth/register', {
    method: 'POST',
    body: {
      email: `smoke-${role}-${runId}@neighborly.test`,
      password: 'Neighborly smoke test password 2026!',
      firstName: role === 'seller' ? 'Sam' : 'Bailey',
      lastName: 'Smoke',
      neighborhood: 'Test Neighborhood',
      city: 'Test City',
      state: 'NY',
    },
  })
  assert(auth.accessToken && auth.user?.id, `${role} registration did not issue a session`)
  await request('/users/me/onboarding', {
    token: auth.accessToken,
    method: 'PATCH',
    body: {
      neighborhood: 'Test Neighborhood',
      city: 'Test City',
      state: 'NY',
      interests: ['marketplace'],
      capabilities: ['delivery'],
      messages: true,
    },
  })
  return { token: auth.accessToken, id: auth.user.id }
}

async function uploadPresignedForm(grant, bytes) {
  const boundary = `----neighborly-smoke-${Date.now().toString(16)}`
  const chunks = []
  for (const [key, value] of Object.entries(grant.fields)) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
    ))
  }
  chunks.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="smoke.png"\r\nContent-Type: image/png\r\n\r\n`,
  ))
  chunks.push(Buffer.from(bytes))
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  const body = Buffer.concat(chunks)
  return fetch(grant.url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
    },
    body,
  })
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const health = await request('/health')
  assert(health.status === 'ok', 'health endpoint is not healthy')
  const ready = await request('/ready')
  assert(ready.status === 'ready', 'readiness endpoint is not ready')

  const seller = await register('seller', runId)
  const buyer = await register('buyer', runId)

  const updatedProfile = await request('/users/me', {
    token: buyer.token,
    method: 'PATCH',
    body: { displayName: 'Bailey the Neighbor', bio: 'Here to help with the live smoke test.' },
  })
  assert(updatedProfile.profile?.displayName === 'Bailey the Neighbor', 'profile update was not persisted')
  const publicProfile = await request(`/users/${buyer.id}/profile`, { token: seller.token })
  assert(publicProfile.profile?.displayName === 'Bailey the Neighbor', 'public profile could not be loaded')
  const exportData = await request('/users/me/export', { token: buyer.token })
  assert(exportData.user?.id === buyer.id && !exportData.user?.passwordHash, 'account export is missing or exposed credentials')

  const categories = await request('/categories')
  assert(categories.length > 0, 'seeded categories are missing')

  const listing = await request('/listings', {
    token: seller.token,
    method: 'POST',
    body: {
      categoryId: categories[0].id,
      title: 'Smoke-tested neighborhood item',
      description: 'A listing created by the production readiness smoke test.',
      priceCents: 2500,
      condition: 'Good',
      neighborhood: 'Test Neighborhood',
      city: 'Test City',
      pickupAvailable: true,
    },
  })
  const sellerDrafts = await request('/listings/mine', { token: seller.token })
  assert(sellerDrafts.some((item) => item.id === listing.id && item.status === 'DRAFT'), 'saved draft is missing from the seller dashboard feed')

  const pngBytes = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ))
  const grant = await request(`/listings/${listing.id}/images/upload`, {
    token: seller.token,
    method: 'POST',
    body: { contentType: 'image/png', sizeBytes: pngBytes.length },
  })
  const upload = await uploadPresignedForm(grant, pngBytes)
  if (!upload.ok) {
    const uploadError = await upload.text()
    throw new Error(`object storage rejected the listing image (${upload.status}): ${uploadError}`)
  }
  await request(`/listings/${listing.id}/images/complete`, {
    token: seller.token,
    method: 'POST',
    body: { key: grant.key },
  })
  const published = await request(`/listings/${listing.id}/publish`, {
    token: seller.token,
    method: 'POST',
  })
  assert(published.status === 'PUBLISHED' && published.images.length === 1, 'listing did not publish with its image')

  const discovered = await request(`/listings?query=${encodeURIComponent('Smoke-tested')}`)
  assert(discovered.some((item) => item.id === listing.id), 'published listing is not searchable')
  const saved = await request(`/listings/${listing.id}/favorite`, { token: buyer.token, method: 'POST' })
  assert(saved.saved === true, 'favorite was not persisted')
  const savedSearch = await request('/listings/saved-searches', {
    token: buyer.token,
    method: 'POST',
    body: { query: 'Smoke-tested', filters: { maxPriceCents: 5000 } },
  })

  const need = await request('/requests', {
    token: buyer.token,
    method: 'POST',
    body: {
      categoryId: categories[0].id,
      title: 'Need an item for smoke testing',
      description: 'Looking for an item that can complete the full exchange workflow.',
      budgetCents: 3000,
      radiusMiles: 10,
      mode: 'BUY',
    },
  })
  const offer = await request(`/requests/${need.id}/offers`, {
    token: seller.token,
    method: 'POST',
    body: { amountCents: 2500, message: 'I can help with this request.', listingIds: [listing.id] },
  })
  await request(`/requests/offers/${offer.id}/counter`, {
    token: buyer.token,
    method: 'POST',
    body: { amountCents: 2400, message: 'Would you accept this amount?' },
  })
  const transaction = await request(`/requests/offers/${offer.id}/accept`, {
    token: buyer.token,
    method: 'PATCH',
  })
  assert(transaction.status === 'ACCEPTED' && transaction.conversation?.id, 'offer acceptance did not create the exchange')

  const message = await request(`/conversations/${transaction.conversation.id}/messages`, {
    token: seller.token,
    method: 'POST',
    body: { body: 'The live smoke-test exchange is ready.' },
  })
  assert(message.body.includes('smoke-test'), 'message was not persisted')
  await request(`/conversations/${transaction.conversation.id}/read`, { token: buyer.token, method: 'PATCH' })

  await request(`/transactions/${transaction.id}/appointments`, {
    token: buyer.token,
    method: 'POST',
    body: { startsAt: new Date(Date.now() + 86_400_000).toISOString(), locationNote: 'Test meetup point' },
  })
  await request(`/transactions/${transaction.id}/status`, {
    token: seller.token,
    method: 'PATCH',
    body: { status: 'IN_PROGRESS' },
  })
  await request(`/transactions/${transaction.id}/status`, {
    token: buyer.token,
    method: 'PATCH',
    body: { status: 'COMPLETED' },
  })
  await request(`/transactions/${transaction.id}/reviews`, {
    token: buyer.token,
    method: 'POST',
    body: { subjectId: seller.id, rating: 5, body: 'Smoke test completed successfully.' },
  })

  const notifications = await request('/notifications', { token: buyer.token })
  assert(notifications.some((notification) => notification.type === 'OFFER_RECEIVED'), 'offer notification was not persisted')
  assert(notifications.some((notification) => notification.type === 'MESSAGE_RECEIVED'), 'message notification was not persisted')
  await request('/notifications/read-all', { token: buyer.token, method: 'PATCH' })
  const unread = await request('/notifications/unread-count', { token: buyer.token })
  assert(unread.count === 0, 'notification read state did not persist')

  const post = await request('/community/posts', {
    token: seller.token,
    method: 'POST',
    body: { body: 'Smoke-tested community announcement for nearby neighbors.' },
  })
  await request(`/community/posts/${post.id}/comments`, {
    token: buyer.token,
    method: 'POST',
    body: { body: 'Thanks for sharing this update!' },
  })
  await request(`/community/posts/${post.id}/reactions`, {
    token: buyer.token,
    method: 'POST',
    body: { type: 'HELPFUL' },
  })
  const communityPosts = await request('/community/posts', { token: buyer.token })
  const communityPost = communityPosts.find((item) => item.id === post.id)
  assert(communityPost?.comments.length === 1, 'community comment was not persisted')
  assert(communityPost?.reactionCounts?.HELPFUL === 1, 'community reaction was not aggregated')

  const event = await request('/community/events', {
    token: seller.token,
    method: 'POST',
    body: {
      title: 'Smoke test block party',
      description: 'A future community event created by the live smoke test.',
      location: 'Test Neighborhood Park',
      startsAt: new Date(Date.now() + 172_800_000).toISOString(),
      capacity: 12,
    },
  })
  await request(`/community/events/${event.id}/rsvp`, {
    token: buyer.token,
    method: 'POST',
    body: { status: 'GOING' },
  })
  const communityEvents = await request('/community/events', { token: buyer.token })
  assert(communityEvents.find((item) => item.id === event.id)?.goingCount === 1, 'event RSVP was not persisted')

  await request('/safety/reports', {
    token: buyer.token,
    method: 'POST',
    body: { targetType: 'USER', targetId: seller.id, reason: 'OTHER', details: 'Automated smoke-test report; no action required.' },
  })
  await request(`/safety/blocks/${seller.id}`, { token: buyer.token, method: 'POST' })
  const blockedPosts = await request('/community/posts', { token: buyer.token })
  assert(!blockedPosts.some((item) => item.id === post.id), 'blocked user community activity remained visible')
  await expectStatus(`/conversations/${transaction.conversation.id}/messages`, 403, {
    token: seller.token,
    method: 'POST',
    body: { body: 'This blocked message must not be delivered.' },
  })
  await request(`/safety/blocks/${seller.id}`, { token: buyer.token, method: 'DELETE' })

  await request(`/listings/saved-searches/${savedSearch.id}`, { token: buyer.token, method: 'DELETE' })

  const loginResponse = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `smoke-seller-${runId}@neighborly.test`,
      password: 'Neighborly smoke test password 2026!',
    }),
  })
  assert(loginResponse.ok, 'session login failed')
  const originalCookie = loginResponse.headers.get('set-cookie')?.split(';')[0]
  assert(originalCookie, 'login did not issue an HTTP-only refresh cookie')
  const refreshResponse = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: originalCookie },
  })
  const refreshed = await refreshResponse.json()
  assert(refreshResponse.ok && refreshed.accessToken, 'refresh-token rotation failed')
  const rotatedCookie = refreshResponse.headers.get('set-cookie')?.split(';')[0]
  assert(rotatedCookie && rotatedCookie !== originalCookie, 'refresh token was not rotated')
  const replayResponse = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { Cookie: originalCookie },
  })
  assert(replayResponse.status === 401, 'a rotated refresh token could be replayed')
  const logoutResponse = await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST',
    headers: { Cookie: rotatedCookie },
  })
  assert(logoutResponse.ok, 'session logout failed')

  console.log('Neighborly live smoke test passed: auth and refresh rotation, onboarding, profiles and export, listing image upload, search, favorites, saved searches, requests, offers, transactions, messaging, reviews, notifications, community posts/comments/reactions/events/RSVP, reporting, and blocking.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
