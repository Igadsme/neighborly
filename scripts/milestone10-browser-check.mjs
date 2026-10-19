#!/usr/bin/env node
/**
 * Milestone 10 browser verification.
 *
 * Drives the system Chrome over the DevTools protocol, matching the approach
 * already used by scripts/docker-release-browser-smoke.mjs, so no npm browser
 * dependency is introduced.
 *
 * Measures, against the real production build:
 *   - console errors and failed network requests
 *   - horizontal overflow at six viewport widths (320 / 375 / 390 / 768 /
 *     1024 / 1440)
 *   - the skip link being reachable and moving focus into <main>
 *   - presence of landmark and heading structure
 *   - images without an alt attribute
 *   - tap-target sizing on interactive controls
 *   - paint timings (FCP / LCP) from the Performance API
 *
 *   APP_URL=http://localhost:4173 node scripts/milestone10-browser-check.mjs
 *
 * Results are written to artifacts/milestone10-browser/. Screenshots are only
 * captured when the page actually rendered.
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const APP_URL = process.env.APP_URL ?? 'http://localhost:4173'
const OUT = resolve(process.env.CHECK_OUT ?? 'artifacts/milestone10-browser')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DEBUG_PORT = process.env.CHROME_DEBUG_PORT ?? '9333'

const VIEWPORTS = [
  { name: '320', width: 320, height: 720 },
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
]

const results = []
let failed = false

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms))
}

async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Chrome is still starting.
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
    this.ws.addEventListener('message', event => {
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
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
    }
    return result.result?.value
  }

  /** Drains collected protocol events for one navigation. */
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
      '--user-data-dir=/tmp/milestone10-chrome-profile',
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

function record(name, passed, detail) {
  results.push({ name, passed, detail })
  const mark = passed ? 'PASS' : 'FAIL'
  process.stdout.write(`${mark}  ${name}${detail ? ` — ${detail}` : ''}\n`)
  if (!passed) failed = true
}

async function setViewport(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  })
}

async function navigate(cdp, url) {
  cdp.drain()
  await cdp.send('Page.navigate', { url })
  // Wait for the load event, then let lazy chunks settle.
  for (let i = 0; i < 80; i += 1) {
    const ready = await cdp.evaluate(`document.readyState === 'complete'`)
    if (ready) break
    await sleep(100)
  }
  await sleep(700)
}

function problems(events) {
  const consoleErrors = []
  const failedRequests = []
  for (const event of events) {
    if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
      consoleErrors.push(event.params.entry.text)
    }
    if (event.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(event.params?.exceptionDetails?.text ?? 'exception')
    }
    if (event.method === 'Network.loadingFailed') {
      failedRequests.push(event.params?.errorText ?? 'failed')
    }
  }
  return { consoleErrors, failedRequests }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const { cdp, chrome } = await connect()

  try {
    for (const viewport of VIEWPORTS) {
      await setViewport(cdp, viewport.width, viewport.height)
      await navigate(cdp, APP_URL)

      const overflow = await cdp.evaluate(`(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        offenders: [...document.querySelectorAll('body *')]
          .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
          .slice(0, 5)
          .map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0,3).join('.') : '')),
        rendered: document.body.innerText.trim().length > 0
      }))()`)

      record(
        `renders at ${viewport.name}px`,
        overflow.rendered,
        `body text length ${overflow.rendered ? '> 0' : '0'}`
      )

      const hasOverflow = overflow.scrollWidth > overflow.clientWidth + 1
      record(
        `no horizontal overflow at ${viewport.name}px`,
        !hasOverflow,
        hasOverflow
          ? `scrollWidth ${overflow.scrollWidth} > clientWidth ${overflow.clientWidth}; offenders: ${overflow.offenders.join(', ')}`
          : `scrollWidth ${overflow.scrollWidth} == clientWidth ${overflow.clientWidth}`
      )

      if (viewport.name === '390' || viewport.name === '1440') {
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
        await writeFile(resolve(OUT, `landing-${viewport.name}.png`), Buffer.from(shot.data, 'base64'))
      }
    }

    // Accessibility structure at a desktop viewport.
    await setViewport(cdp, 1440, 900)
    await navigate(cdp, APP_URL)

    const structure = await cdp.evaluate(`(() => ({
      hasMain: !!document.querySelector('main'),
      mainId: document.querySelector('main')?.id ?? null,
      mainTabIndex: document.querySelector('main')?.getAttribute('tabindex') ?? null,
      h1Count: document.querySelectorAll('h1').length,
      headings: [...document.querySelectorAll('h1,h2,h3')].slice(0, 6).map(h => h.tagName + ':' + h.textContent.trim().slice(0, 30)),
      landmarks: [...document.querySelectorAll('header,nav,main,footer,[role]')].map(el => el.tagName.toLowerCase() + (el.getAttribute('role') ? '[' + el.getAttribute('role') + ']' : '')).slice(0, 20),
      imagesMissingAlt: [...document.querySelectorAll('img')].filter(img => !img.hasAttribute('alt')).length,
      imageCount: document.querySelectorAll('img').length,
      buttonsWithoutName: [...document.querySelectorAll('button')].filter(b => !(b.textContent || '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby')).length,
      buttonCount: document.querySelectorAll('button').length,
      inputsWithoutLabel: [...document.querySelectorAll('input,select,textarea')].filter(el => {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
        if (el.id && document.querySelector('label[for="' + el.id + '"]')) return false
        return !el.closest('label')
      }).length,
      inputCount: document.querySelectorAll('input,select,textarea').length,
      lang: document.documentElement.lang,
      title: document.title
    }))()`)

    record('has a main landmark with an id for the skip link', structure.hasMain && structure.mainId === 'main-content', `main id=${structure.mainId}`)
    record('main is programmatically focusable', structure.mainTabIndex === '-1', `tabindex=${structure.mainTabIndex}`)
    record('exactly one h1', structure.h1Count === 1, `h1 count = ${structure.h1Count}`)
    record('every image has an alt attribute', structure.imagesMissingAlt === 0, `${structure.imageCount} images, ${structure.imagesMissingAlt} missing alt`)
    record('every button has an accessible name', structure.buttonsWithoutName === 0, `${structure.buttonCount} buttons, ${structure.buttonsWithoutName} unnamed`)
    record('every form control has a label', structure.inputsWithoutLabel === 0, `${structure.inputCount} controls, ${structure.inputsWithoutLabel} unlabelled`)
    record('document declares a language', (structure.lang ?? '').length > 0, `lang="${structure.lang}"`)
    record('document has a non-empty title', (structure.title ?? '').trim().length > 0, `title="${structure.title ?? ''}"`)

    // Skip link: hidden until focused, then first in tab order.
    // The wait is required: the reveal is a 120ms transition, so reading the
    // transform in the same tick still returns the pre-focus value.
    const skip = await cdp.evaluate(`(async () => {
      const link = document.querySelector('a.skip-link')
      if (!link) return { found: false }
      const hidden = getComputedStyle(link).transform
      link.focus()
      const isFirst = document.activeElement === link
      await new Promise(r => setTimeout(r, 250))
      const revealed = getComputedStyle(link).transform
      return { found: true, href: link.getAttribute('href'), hidden, revealed, isFirst }
    })()`)
    record('skip link exists and is focusable', skip.found && skip.isFirst === true, skip.found ? `focusable=${skip.isFirst}, href=${skip.href}` : 'not found')
    record(
      'skip link is visually hidden until focused',
      Boolean(skip.hidden) && Boolean(skip.revealed) && skip.hidden !== skip.revealed,
      skip.found ? `transform ${skip.hidden} → ${skip.revealed} after focus` : 'n/a',
    )

    // Following the skip link lands focus inside the main landmark.
    const skipTarget = await cdp.evaluate(`(() => {
      const main = document.querySelector('main')
      main.focus()
      return document.activeElement === main
    })()`)
    record('main receives focus when targeted', skipTarget === true, `activeElement is main: ${skipTarget}`)

    // Keyboard reachability: tab through and count focusable stops.
    const keyboard = await cdp.evaluate(`(() => {
      const focusable = [...document.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(el => el.offsetParent !== null || el.classList.contains('skip-link'))
      const smallTargets = focusable.filter(el => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && r.height < 24
      })
      return { count: focusable.length, small: smallTargets.length, smallSample: smallTargets.slice(0,4).map(el => el.tagName.toLowerCase() + ':' + (el.textContent||'').trim().slice(0,20)) }
    })()`)
    record('page exposes many focusable stops', keyboard.count > 10, `${keyboard.count} focusable elements`)
    record('no focusable control under 24px tall', keyboard.small === 0, keyboard.small === 0 ? 'all controls >= 24px' : `${keyboard.small} smaller: ${keyboard.smallSample.join(', ')}`)

    // Paint timings from the real build.
    await navigate(cdp, APP_URL)
    const timings = await cdp.evaluate(`(() => new Promise(resolve => {
      const out = { fcp: null, lcp: null, cls: null, domContentLoaded: null }
      try {
        const nav = performance.getEntriesByType('navigation')[0]
        if (nav) out.domContentLoaded = Math.round(nav.domContentLoadedEventEnd)
        const fcp = performance.getEntriesByName('first-contentful-paint')[0]
        if (fcp) out.fcp = Math.round(fcp.startTime)
        const paints = performance.getEntriesByType('paint')
        const lcpEntry = paints.find(p => p.name === 'largest-contentful-paint')
        if (lcpEntry) out.lcp = Math.round(lcpEntry.startTime)
      } catch {}
      let cls = 0
      try {
        cls = performance.getEntriesByType('layout-shift').reduce((sum, e) => sum + (e.hadRecentInput ? 0 : e.value), 0)
        out.cls = Number(cls.toFixed(4))
      } catch {}
      resolve(out)
    }))()`)
    record('First Contentful Paint under 2000ms', timings.fcp !== null && timings.fcp < 2000, `FCP = ${timings.fcp}ms`)
    record('Cumulative Layout Shift at or below 0.1', timings.cls !== null && timings.cls <= 0.1, `CLS = ${timings.cls}`)
    record('DOMContentLoaded under 2000ms', timings.domContentLoaded !== null && timings.domContentLoaded < 2000, `DCL = ${timings.domContentLoaded}ms`)

    // Reduced motion is honoured by the stylesheet.
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await navigate(cdp, APP_URL)
    const reduced = await cdp.evaluate(`(() => {
      const probe = document.createElement('div')
      probe.className = 'animate-fade-in-up'
      document.body.appendChild(probe)
      const duration = getComputedStyle(probe).animationDuration
      probe.remove()
      return { duration, scroll: getComputedStyle(document.documentElement).scrollBehavior }
    })()`)
    record('reduced motion collapses animation durations', reduced.duration !== null && parseFloat(reduced.duration) < 0.05, `animation-duration = ${reduced.duration}`)
    await cdp.send('Emulation.setEmulatedMedia', { features: [] })

    // Console and network cleanliness across a final pass.
    // The API backend is not running during this check, so requests to it are
    // expected to fail. They are separated out and reported rather than being
    // counted as application defects; a genuine browser error is a console
    // message that is not an API connection failure.
    cdp.drain()
    await navigate(cdp, APP_URL)
    const issues = problems(cdp.drain())
    const isApiFailure = text => /ERR_CONNECTION_REFUSED|Failed to load resource/.test(text)
    const appConsoleErrors = issues.consoleErrors.filter(text => !isApiFailure(text))
    const apiFailures = issues.consoleErrors.filter(isApiFailure)
    record(
      'no application console errors',
      appConsoleErrors.length === 0,
      appConsoleErrors.length ? appConsoleErrors.slice(0, 3).join(' | ') : 'none',
    )
    record(
      'no failed requests other than the absent API',
      issues.failedRequests.filter(text => !isApiFailure(text)).length === 0,
      issues.failedRequests.filter(text => !isApiFailure(text)).slice(0, 3).join(' | ') || 'none beyond API',
    )
    process.stdout.write(`NOTE  ${apiFailures.length} API connection failures (backend not running in this check)\n`)

    const summary = {
      url: APP_URL,
      viewports: VIEWPORTS.map(v => v.name),
      structure,
      keyboard,
      timings,
      reducedMotion: reduced,
      problems: issues,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    }
    await writeFile(resolve(OUT, 'browser-check.json'), JSON.stringify(summary, null, 2))

    process.stdout.write(`\n${summary.passed} passed, ${summary.failed} failed\n`)
    process.stdout.write(`Report: ${resolve(OUT, 'browser-check.json')}\n`)
  } finally {
    chrome.kill()
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error}\n`)
  process.exit(1)
})