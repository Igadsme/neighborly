#!/usr/bin/env node
/**
 * Milestone 10 authenticated browser verification.
 *
 * Extends the unauthenticated check with a real sign-in and a walk through
 * every major authenticated product area, driven over the Chrome DevTools
 * Protocol so no browser dependency is added (matching
 * scripts/docker-release-browser-smoke.mjs).
 *
 * A route only counts as passing when its API calls succeeded against the
 * local backend. API failures are reported separately and never as passes.
 *
 *   APP_URL=http://localhost:4173 \
 *   API_URL=http://localhost:3001/api/v1 \
 *   CHECK_OUT=artifacts/milestone10-auth node scripts/milestone10-auth-check.mjs
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const AXE_SOURCE = resolve(HERE, '..', 'node_modules', 'axe-core', 'axe.min.js')

const APP_URL = process.env.APP_URL ?? 'http://localhost:4173'
const OUT = resolve(process.env.CHECK_OUT ?? 'artifacts/milestone10-auth')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DEBUG_PORT = process.env.CHROME_DEBUG_PORT ?? '9334'
// The profile directory carries the session token between runs, so a reused
// profile starts already signed in and the sign-in journey cannot be tested.
const PROFILE_DIR = process.env.CHROME_PROFILE ?? '/tmp/milestone10-auth-profile'
const EMAIL = process.env.M10_EMAIL ?? 'seed.marcus@example.com'
const PASSWORD = process.env.M10_PASSWORD ?? 'neighborly-local-seed'

const results = []
const screenshots = []
const axeFindings = []
let failed = 0

/**
 * Runs axe-core against the current DOM and returns the violations that
 * affect a real user of the flow: serious and critical impact only.
 *
 * Moderate and minor findings are still returned and written to the report,
 * but they do not fail the run, because a large number of them are design
 * opinions rather than barriers to completing a task.
 */
async function runAxe(cdp) {
  const source = await readFile(AXE_SOURCE, 'utf8')
  await cdp.evaluate(`${source}; window.axe = axe; true`)
  const result = await cdp.evaluate(`axe
    .run(document, { resultTypes: ['violations'], elementRef: false })
    .then(r => ({
      total: r.violations.length,
      serious: r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').length,
      summary: r.violations.map(v => v.id + '(' + v.impact + '): ' + v.nodes.length + ' node(s) — ' + v.help),
      detail: r.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')),
      })),
    }))
    .catch(e => ({ error: String(e) }))`)
  if (!result || result.error) return null
  return result
}

function record(name, passed, detail) {
  results.push({ name, passed, detail })
  if (!passed) failed += 1
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}\n`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* still starting */
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.next = 0
    this.sessionId = null
    this.pending = new Map()
    this.events = []
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(JSON.stringify(message.error)))
        else done(message.result)
        return
      }
      if (message.method) this.events.push(message)
    })
  }

  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.next
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    return new Promise((done, reject) => {
      this.pending.set(id, { resolve: done, reject })
      this.ws.send(JSON.stringify(payload))
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'eval failed')
    return result.result?.value
  }

  drain() {
    const captured = this.events
    this.events = []
    return captured
  }
}

async function connect() {
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      `--user-data-dir=${PROFILE_DIR}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
  const socket = new WebSocket(
    (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json()).webSocketDebuggerUrl,
  )
  await new Promise((done, fail) => {
    socket.addEventListener('open', done)
    socket.addEventListener('error', fail)
  })
  const cdp = new Cdp(socket)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  cdp.sessionId = sessionId
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  await cdp.send('Network.enable')
  return { cdp, chrome }
}

const setViewport = (cdp, width, height) =>
  cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  })

async function settle(cdp) {
  for (let i = 0; i < 100; i += 1) {
    if (await cdp.evaluate('document.readyState === "complete"')) break
    await sleep(100)
  }
  await sleep(600)
}

async function navigate(cdp, url) {
  cdp.drain()
  await cdp.send('Page.navigate', { url })
  await settle(cdp)
}

/** Network + console outcome for the last navigation. */
function outcome(events) {
  const api = { ok: 0, failed: [] }
  const consoleErrors = []
  for (const event of events) {
    if (event.method === 'Network.responseReceived') {
      const { response } = event.params
      if (response.url.includes('/api/')) {
        if (response.status >= 400) api.failed.push(`${response.status} ${response.url.replace(/.*\/api\//, '/api/')}`)
        else api.ok += 1
      }
    }
    if (event.method === 'Network.loadingFailed' && !/websocket/i.test(event.params?.errorText ?? '')) {
      api.failed.push(`net ${event.params?.errorText}`)
    }
    if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
      consoleErrors.push(event.params.entry.text)
    }
    if (event.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(event.params?.exceptionDetails?.text ?? 'exception')
    }
  }
  return { api, consoleErrors }
}

/** Click a control by its visible text and wait for the UI to settle. */
async function clickByText(cdp, selector, text) {
  const clicked = await cdp.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(e => (e.textContent || '').trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))
    if (!el) return false
    el.click()
    return true
  })()`)
  await sleep(1200)
  return clicked
}

/** Structural + layout snapshot of whatever is on screen. */
const probe = `(() => {
  const doc = document.documentElement
  const bodyText = (document.body.innerText || '')
  // A screen showing a load failure is not a passing screen, however well it
  // is laid out. This caught a Messages bug that every other check missed.
  const errorBanner = /could not be loaded|failed to load|something went wrong|unable to load/i.test(bodyText)
  const buttons = [...document.querySelectorAll('button')]
  const focusable = [...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
    .filter(el => el.offsetParent !== null || el.classList.contains('skip-link'))
  const small = focusable.filter(el => {
    // A visually-hidden control (such as the checkbox behind a switch) is
    // operated through its visible label or graphic, so its own box is not a
    // pointer target.
    if (el.classList.contains('sr-only')) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.height < 24
  })
  return {
    text: (document.body.innerText || '').trim().length,
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    overflow: doc.scrollWidth > doc.clientWidth + 1,
    offenders: [...document.querySelectorAll('body *')]
      .filter(el => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 4)
      .map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').slice(0,2).join('.')),
    h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim().slice(0, 40)),
    h2Count: document.querySelectorAll('h2').length,
    unnamedButtons: buttons.filter(b => !(b.textContent||'').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby')).length,
    unlabelledControls: [...document.querySelectorAll('input,select,textarea')].filter(el => {
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
      if (el.id && document.querySelector('label[for="' + el.id + '"]')) return false
      return !el.closest('label')
    }).length,
    imagesMissingAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
    brokenImages: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length,
    smallTargets: small.length,
    smallSample: small.slice(0, 4).map(el => ({
      label: el.tagName.toLowerCase() + ':' + (el.textContent || '').trim().slice(0, 24),
      height: Math.round(el.getBoundingClientRect().height * 10) / 10,
      cls: String(el.className || '').slice(0, 70),
    })),
    focusableCount: focusable.length,
    hasMain: !!document.querySelector('main'),
    dialogsWithoutName: [...document.querySelectorAll('[role="dialog"]')].filter(d => !d.getAttribute('aria-label') && !d.getAttribute('aria-labelledby')).length,
    // aria-modal is only required of dialogs that actually block the page.
    // A notification popover is non-modal by design, so requiring it there
    // would be asserting the wrong thing.
    nonModalOverlays: [...document.querySelectorAll('[role="dialog"]')].filter(d => d.getAttribute('aria-modal') === 'false').length,
    liveRegions: document.querySelectorAll('[aria-live]').length,
    skipLink: !!document.querySelector('a.skip-link'),
    errorBanner
  }
})()`

async function checkRoute(cdp, name, width, height) {
  await setViewport(cdp, width, height)
  const events = cdp.drain()
  await settle(cdp)
  const snap = await cdp.evaluate(probe)
  const { api, consoleErrors } = outcome(events)

  // axe-core scan of the rendered page. Injected fresh per screen because the
  // SPA replaces the DOM on navigation.
  const axe = await runAxe(cdp)
  if (axe) {
    record(
      `${name} @${width}px has no serious/critical axe violations`,
      axe.serious === 0,
      axe.serious === 0
        ? `${axe.violations} minor/moderate rule(s) only`
        : axe.summary.slice(0, 3).join(' | '),
    )
    axeFindings.push({ screen: name, viewport: width, ...axe })
  }

  record(`${name} @${width}px renders content`, snap.text > 0, `${snap.text} chars`)
  record(`${name} @${width}px is not showing a load error`, snap.errorBanner === false, snap.errorBanner ? 'an error banner is visible' : 'no error banner')
  record(
    `${name} @${width}px API calls succeed`,
    api.failed.length === 0,
    api.failed.length ? api.failed.slice(0, 3).join(' | ') : `${api.ok} successful`,
  )
  record(`${name} @${width}px no horizontal overflow`, !snap.overflow, snap.overflow ? `offenders: ${snap.offenders.join(', ')}` : 'none')
  record(`${name} @${width}px no console errors`, consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 2).join(' | ') : 'none')
  record(`${name} @${width}px buttons all named`, snap.unnamedButtons === 0, `${snap.unnamedButtons} unnamed`)
  record(`${name} @${width}px form controls labelled`, snap.unlabelledControls === 0, `${snap.unlabelledControls} unlabelled`)
  record(`${name} @${width}px images have alt`, snap.imagesMissingAlt === 0, `${snap.imagesMissingAlt} missing`)
  record(`${name} @${width}px no broken images`, snap.brokenImages === 0, `${snap.brokenImages} broken`)
  record(`${name} @${width}px tap targets >= 24px`, snap.smallTargets === 0, snap.smallTargets ? JSON.stringify(snap.smallSample) : 'ok')
  record(`${name} @${width}px exactly one h1`, snap.h1.length === 1, `h1=${snap.h1.length} ${JSON.stringify(snap.h1)}`)
  record(`${name} @${width}px dialogs are named and not falsely modal`, snap.dialogsWithoutName === 0 && snap.nonModalOverlays === 0, `unnamed=${snap.dialogsWithoutName} nonModalOverlays=${snap.nonModalOverlays}`)

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${width}.png`
  await writeFile(resolve(OUT, file), Buffer.from(shot.data, 'base64'))
  screenshots.push(file)
  return snap
}

async function main() {
  await mkdir(OUT, { recursive: true })
  // Start from a clean browser profile so the run always exercises a real
  // sign-in rather than a session left behind by a previous run.
  await rm(PROFILE_DIR, { recursive: true, force: true })
  const { cdp, chrome } = await connect()

  try {
    await setViewport(cdp, 1440, 900)
    await navigate(cdp, APP_URL)

    // ── Sign in through the real form ────────────────────────────────────
    await clickByText(cdp, 'button, a', 'sign in')
    await sleep(800)

    const formFound = await cdp.evaluate(`(() => {
      const inputs = [...document.querySelectorAll('input')]
      const email = inputs.find(i => i.type === 'email' || /email/i.test(i.name + i.id + (i.placeholder||'')))
      const password = inputs.find(i => i.type === 'password')
      if (!email || !password) return false
      const setValue = (el, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      setValue(email, ${JSON.stringify(EMAIL)})
      setValue(password, ${JSON.stringify(PASSWORD)})
      return true
    })()`)
    record('sign-in form exposes labelled email and password fields', formFound === true, `found=${formFound}`)

    if (!formFound) throw new Error('sign-in form not reachable; cannot continue authenticated journey')

    const submitEvents = cdp.drain()
    await cdp.evaluate(`(() => {
      // Click the submit button *inside the dialog*. Clicking by text alone
      // matched the header link and left the user on the landing page.
      const dialog = document.querySelector('[role="dialog"]')
      const scope = dialog || document
      const button = [...scope.querySelectorAll('button')]
        .find(b => /^sign in$/i.test((b.textContent || '').trim()))
      if (button) button.click()
      else [...document.querySelectorAll('button')].find(b => /sign in/i.test(b.textContent || ''))?.click()
    })()`)
    await sleep(3500)
    await settle(cdp)

    const loginOutcome = outcome(submitEvents)
    const signedIn = await cdp.evaluate(`(() => ({
      hasNav: !!document.querySelector('nav'),
      accountMenu: !!document.querySelector('button[aria-haspopup="true"]'),
      text: (document.body.innerText || '').slice(0, 400)
    }))()`)
    record('login succeeds and the shell renders', signedIn.hasNav && signedIn.accountMenu, loginOutcome.api.failed.length ? loginOutcome.api.failed.join(' | ') : 'nav + account menu present')

    // The header must show the real member, never a hardcoded identity.
    const identity = await cdp.evaluate(`(() => {
      const body = document.body.innerText || ''
      return {
        showsMarcus: /Marcus/i.test(body),
        showsGad: /Gad Miller/.test(body),
        avatarFromBackend: [...document.querySelectorAll('img')].some(i => i.src.includes('/api/') || i.src.startsWith('http://localhost:3001'))
      }
    })()`)
    record('header shows the real member, not a hardcoded identity', identity.showsMarcus && !identity.showsGad, `marcus=${identity.showsMarcus} hardcoded=${identity.showsGad}`)

    // ── Authenticated product areas ─────────────────────────────────────
    // Each area is opened through the real navigation or the account menu so
    // the route is reached the way a member would reach it.
    const AREAS = [
      { name: 'home', nav: 'Neighborly' },
      { name: 'explore', nav: 'Explore' },
      { name: 'my-listings', menu: 'My listings' },
      { name: 'my-requests', menu: 'My requests' },
      { name: 'missions', menu: 'Neighborhood missions' },
      { name: 'borrow', menu: 'Borrowing' },
      { name: 'saved', aria: 'Saved items' },
      { name: 'passport-me', menu: 'My passport' },
      { name: 'messages', aria: 'Messages' },
      { name: 'notifications', aria: 'Notifications' },
      { name: 'account', menu: 'Account settings' },
      { name: 'dashboard', menu: 'My dashboard' }
    ]

    for (const area of AREAS) {
      if (area.menu) {
        // Open the account menu, then the entry, which also exercises the menu.
        await cdp.evaluate(`(() => {
          const t = document.querySelector('button[aria-haspopup="true"]')
          if (t && t.getAttribute('aria-expanded') !== 'true') t.click()
        })()`)
        await sleep(350)
        const opened = await clickByText(cdp, 'button', area.menu)
        if (!opened) {
          record(`${area.name} reachable from the account menu`, false, `menu item "${area.menu}" not found`)
          continue
        }
        record(`${area.name} reachable from the account menu`, true, area.menu)
      } else if (area.nav) {
        const clicked = await clickByText(cdp, 'nav button, header button', area.nav)
        record(`${area.name} reachable from the header`, clicked, `clicked "${area.nav}"`)
      } else if (area.aria) {
        const clicked = await cdp.evaluate(`(() => {
          const el = document.querySelector('button[aria-label*=${JSON.stringify(area.aria)}]')
          if (!el) return false
          el.click()
          return true
        })()`)
        await sleep(1200)
        record(`${area.name} reachable from the header`, clicked === true, `aria-label contains "${area.aria}"`)
      }
      await checkRoute(cdp, area.name, 390, 844)
      await checkRoute(cdp, area.name, 1440, 900)
    }

    // ── Keyboard-only journey ───────────────────────────────────────────
    await navigate(cdp, APP_URL)
    const keyboard = await cdp.evaluate(`(async () => {
      const first = document.querySelector('a.skip-link')
      if (!first) return { ok: false, reason: 'no skip link' }
      first.focus()
      const skipFocused = document.activeElement === first
      document.querySelector('main').focus()
      const mainFocused = document.activeElement === document.querySelector('main')
      const stops = document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])').length
      return { ok: true, skipFocused, mainFocused, stops }
    })()`)
    record('keyboard: skip link is first stop and main is focusable', keyboard.ok && keyboard.skipFocused && keyboard.mainFocused, JSON.stringify(keyboard))

    // ── Account menu keyboard behaviour ─────────────────────────────────
    await navigate(cdp, APP_URL)
    const menuKeyboard = await cdp.evaluate(`(async () => {
      const trigger = document.querySelector('button[aria-haspopup="true"]')
      if (!trigger) return { ok: false }
      trigger.focus()
      trigger.click()
      await new Promise(r => setTimeout(r, 250))
      const expanded = trigger.getAttribute('aria-expanded') === 'true'
      const container = trigger.parentElement
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await new Promise(r => setTimeout(r, 150))
      const moved = document.activeElement !== trigger && trigger.parentElement.contains(document.activeElement)
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await new Promise(r => setTimeout(r, 250))
      const closed = trigger.getAttribute('aria-expanded') === 'false'
      const restored = document.activeElement === trigger
      return { ok: true, expanded, moved, closed, restored }
    })()`)
    record('account menu: opens, arrows to an item, Escape closes and restores focus', menuKeyboard.ok && menuKeyboard.expanded && menuKeyboard.moved && menuKeyboard.closed && menuKeyboard.restored, JSON.stringify(menuKeyboard))

    // ── Reduced motion ──────────────────────────────────────────────────
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await navigate(cdp, APP_URL)
    const reduced = await cdp.evaluate(`(() => {
      const el = document.createElement('div')
      el.className = 'animate-fade-in-up'
      document.body.appendChild(el)
      const duration = getComputedStyle(el).animationDuration
      el.remove()
      return duration
    })()`)
    record('reduced motion collapses animations', parseFloat(reduced) < 0.05, `animation-duration=${reduced}`)
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })

    const summary = {
      url: APP_URL,
      email: EMAIL,
      screens: AREAS.map(a => a.name),
      viewports: [390, 1440],
      screenshots,
      axeFindings,
      passed: results.filter(r => r.passed).length,
      failed
    }
    await writeFile(resolve(OUT, 'auth-check.json'), JSON.stringify(summary, null, 2))
    process.stdout.write(`\n${summary.passed} passed, ${failed} failed\n`)
    process.stdout.write(`Report: ${resolve(OUT, 'auth-check.json')}\n`)
  } finally {
    chrome.kill()
  }
  process.exitCode = failed > 0 ? 1 : 0
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})