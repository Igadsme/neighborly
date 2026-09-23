#!/usr/bin/env node
/**
 * Signed-in browser smoke for the Docker gate.
 * Drives the system Chrome over the DevTools protocol. No extra npm dependency.
 *
 *   node scripts/docker-release-browser-smoke.mjs
 *   APP_URL=http://localhost:8443 node scripts/docker-release-browser-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const APP_URL = process.env.APP_URL ?? 'http://localhost:8443'
const OUT = resolve(process.env.SMOKE_OUT ?? 'artifacts/docker-release-verification/browser-smoke')
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const EMAIL = process.env.SMOKE_EMAIL ?? 'seed.marcus@example.com'
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'neighborly-local-seed'
const DEBUG_PORT = process.env.CHROME_DEBUG_PORT ?? '9222'

const results = []
let failed = false

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms))
}

async function waitFor(url, tries = 40) {
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
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && this.pending.has(message.id)) {
        const { resolve: done, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(JSON.stringify(message.error)))
        else done(message.result)
      }
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
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed')
    }
    return result.result?.value
  }
}

async function connect() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/neighborly-chrome-smoke',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1440,1100',
    'about:blank'
  ], { stdio: 'ignore' })
  await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`)
  const version = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`).then((response) => response.json())
  if (!version.webSocketDebuggerUrl) throw new Error('Chrome did not expose a browser DevTools socket')
  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((done, reject) => {
    ws.addEventListener('open', done)
    ws.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed')))
  })
  const cdp = new Cdp(ws)
  const created = await cdp.send('Target.createTarget', { url: 'about:blank' }, null)
  const attached = await cdp.send('Target.attachToTarget', { targetId: created.targetId, flatten: true }, null)
  cdp.sessionId = attached.sessionId
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false
  })
  return { chrome, cdp }
}

async function shot(cdp, name) {
  const image = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const file = resolve(OUT, `${name}.png`)
  await writeFile(file, Buffer.from(image.data, 'base64'))
  return file
}

async function text(cdp) {
  const body = await cdp.evaluate('document.body ? document.body.innerText.slice(0, 8000) : ""')
  return typeof body === 'string' ? body : ''
}

async function dialogText(cdp) {
  const body = await cdp.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (!dialog) return ''
    const box = dialog.getBoundingClientRect()
    return JSON.stringify({
      text: (dialog.innerText || '').slice(0, 500),
      width: Math.round(box.width),
      height: Math.round(box.height)
    })
  })()`)
  if (typeof body !== 'string' || !body) return { text: '', width: 0, height: 0 }
  try {
    return JSON.parse(body)
  } catch {
    return { text: '', width: 0, height: 0 }
  }
}

async function waitForText(cdp, pattern, timeoutMs = 8000) {
  const started = Date.now()
  const source = pattern instanceof RegExp ? pattern.source : pattern
  const flags = pattern instanceof RegExp ? pattern.flags : ''
  while (Date.now() - started < timeoutMs) {
    const body = await text(cdp)
    if (new RegExp(source, flags).test(body)) return body
    await sleep(200)
  }
  return text(cdp)
}

function judge(body, { ready, fail }) {
  const failure = fail.find((item) => body.includes(item))
  if (failure) return { ok: false, note: `Visible failure copy: ${failure}` }
  const hit = ready.find((item) => body.includes(item))
  if (hit) return { ok: true, note: `Visible: ${hit}` }
  if (body.trim().length < 20) return { ok: false, note: 'Page body was nearly empty' }
  return { ok: false, note: 'Expected copy was not visible' }
}

async function record(cdp, name, judgment, extra = '') {
  const file = await shot(cdp, name)
  const body = await text(cdp)
  const result = { name, ...judgment, screenshot: file, excerpt: body.replace(/\s+/g, ' ').slice(0, 280), extra }
  results.push(result)
  if (!result.ok) failed = true
  console.log(JSON.stringify({ name: result.name, ok: result.ok, note: result.note }))
  return result
}

async function clickButton(cdp, label) {
  return cdp.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)}
    const nodes = [...document.querySelectorAll('button, a, [role="button"]')]
    const el = nodes.find((node) => (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim() === wanted)
    if (!el) return false
    el.click()
    return true
  })()`)
}

async function clickContaining(cdp, label) {
  return cdp.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)}
    const nodes = [...document.querySelectorAll('button, a, [role="button"]')]
    const el = nodes.find((node) => (node.innerText || node.textContent || '').replace(/\\s+/g, ' ').includes(wanted))
    if (!el || el.disabled) return false
    el.click()
    return true
  })()`)
}

async function scrollToText(cdp, label) {
  await cdp.evaluate(`(() => {
    const wanted = ${JSON.stringify(label)}
    const el = [...document.querySelectorAll('h1, h2, h3, button, p, section')].find((node) => (node.innerText || '').includes(wanted))
    if (el) el.scrollIntoView({ block: 'center' })
    return Boolean(el)
  })()`)
  await sleep(400)
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const { chrome, cdp } = await connect()
  try {
    await cdp.send('Page.navigate', { url: APP_URL })
    let body = await waitForText(cdp, /Sign in|Get started/, 20000)
    await record(cdp, '01-landing', judge(body, {
      ready: ['Sign in', 'Get started'],
      fail: ['This page could not be found', 'Unable to sign in']
    }))

    const openedOnboarding = await clickButton(cdp, 'Get started')
    body = await waitForText(cdp, /Buy & Sell|Create an account|Email/, 8000)
    await record(cdp, '02-onboarding', {
      ok: openedOnboarding && /Buy & Sell|Email|account/i.test(body),
      note: openedOnboarding
        ? 'Opened Get started. Did not submit a new account.'
        : 'Get started button was not clicked'
    })

    await cdp.send('Page.navigate', { url: APP_URL })
    await waitForText(cdp, /Sign in/, 15000)
    let openedSignIn = await clickButton(cdp, 'Sign in')
    let dialog = { text: '', width: 0, height: 0 }
    const dialogStarted = Date.now()
    while (Date.now() - dialogStarted < 8000) {
      dialog = await dialogText(cdp)
      if (dialog.text.includes('Welcome back') && dialog.width > 200 && dialog.height > 200) break
      await sleep(200)
    }
    if (!dialog.text.includes('Welcome back')) {
      openedSignIn = await clickButton(cdp, 'Sign in')
      await sleep(500)
      dialog = await dialogText(cdp)
    }
    body = await text(cdp)
    await record(cdp, '03-sign-in-dialog', {
      ok: openedSignIn && dialog.text.includes('Welcome back') && dialog.width > 200 && dialog.height > 200,
      note: dialog.text.includes('Welcome back')
        ? `Sign-in dialog is in the layout (${dialog.width}x${dialog.height}).`
        : openedSignIn
          ? 'Sign in was clicked, and the dialog did not open.'
          : 'Sign in button was not clicked'
    })

    const filled = await cdp.evaluate(`(() => {
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return 'no-dialog'
      const email = dialog.querySelector('input[type="email"]')
      const password = dialog.querySelector('input[type="password"]')
      if (!email || !password) return 'no-inputs'
      const set = (el, value) => {
        const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
        proto.set.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
      set(email, ${JSON.stringify(EMAIL)})
      set(password, ${JSON.stringify(PASSWORD)})
      const button = [...dialog.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Sign in')
      if (!button) return 'no-submit'
      button.click()
      return 'submitted'
    })()`)
    body = await waitForText(cdp, /Good morning|Good afternoon|Good evening|Unable to sign in|Listings could not be loaded/, 15000)
    await record(cdp, '04-home', {
      ok: filled === 'submitted' && /Good morning|Good afternoon|Good evening/.test(body) && !body.includes('Listings could not be loaded') && !body.includes('Unable to sign in'),
      note: `Sign-in action: ${filled}. ${body.includes('Listings could not be loaded') ? 'Listings error was visible.' : 'Home greeting was checked.'}`
    })

    const pages = [
      { name: '05-explore', click: 'Explore', ready: ['results', 'Save search', 'Loading listings'], fail: ['Listings could not be loaded', 'Sign in to continue'] },
      { name: '06-categories', click: 'All →', homeFirst: true, ready: ['Browse by category', 'Featured in Atlanta'], fail: ['Categories could not be loaded', 'Listings could not be loaded', 'No featured listings yet', 'Sign in to continue'], scroll: 'Featured in Atlanta' },
      { name: '07-map', click: 'Map', ready: ['Search this area', 'Search area', 'Furniture'], fail: ['could not be loaded', 'Sign in to continue'] },
      { name: '08-housing', click: 'Housing', ready: ['Find your next home', 'Loading', 'No housing'], fail: ['could not be loaded', 'Sign in to continue'] },
      { name: '09-services', click: 'Services', ready: ['Local services'], fail: ['could not be loaded', 'Sign in to continue'] },
      { name: '10-jobs', click: 'Jobs', ready: ['Local jobs'], fail: ['could not be loaded', 'Sign in to continue'] },
      { name: '11-community', click: 'Community', ready: ['Community'], fail: ['could not be loaded', 'Sign in to continue'] }
    ]

    for (const page of pages) {
      if (page.homeFirst) {
        await clickButton(cdp, 'Neighborly')
        await waitForText(cdp, /All →|Good morning|Good afternoon|Good evening/, 8000)
      }
      const clicked = await clickButton(cdp, page.click)
      body = await waitForText(cdp, new RegExp(page.ready.concat(page.fail).map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')), 8000)
      if (page.scroll) await scrollToText(cdp, page.scroll)
      body = await text(cdp)
      const judgment = judge(body, page)
      const featuredCards = page.name === '06-categories'
        ? await cdp.evaluate(`(() => {
            const heading = [...document.querySelectorAll('h2')].find((node) => (node.textContent || '').includes('Featured in Atlanta'))
            const section = heading?.closest('section')
            return section ? section.querySelectorAll('div.cursor-pointer').length : 0
          })()`)
        : null
      const featuredOk = featuredCards === null || (Number(featuredCards) > 0 && !body.includes('No featured listings yet'))
      await record(cdp, page.name, {
        ok: clicked && judgment.ok && featuredOk,
        note: clicked
          ? `${judgment.note}${featuredCards === null ? '' : ` Featured cards: ${featuredCards}.`}`
          : `Click failed for ${page.click}. ${judgment.note}`
      })
    }

    await clickButton(cdp, 'Neighborly')
    await waitForText(cdp, /All →|Good morning|Good afternoon|Good evening/, 8000)
    await clickButton(cdp, 'All →')
    body = await waitForText(cdp, /Featured in Atlanta|No featured listings yet|Listings could not be loaded/, 10000)
    const featuredState = await cdp.evaluate(`(() => {
      const text = document.body ? document.body.innerText : ''
      return {
        featured: text.includes('Featured in Atlanta'),
        empty: text.includes('No featured listings yet'),
        error: text.includes('Listings could not be loaded')
      }
    })()`)
    const openedListing = await cdp.evaluate(`(() => {
      const heading = [...document.querySelectorAll('h2, h3, p, span')].find((node) => (node.textContent || '').includes('Featured in Atlanta'))
      const section = heading?.closest('section') || document
      const card = section.querySelector('div.cursor-pointer')
      if (!card) return false
      card.click()
      return true
    })()`)
    if (openedListing) {
      body = await waitForText(cdp, /Message seller|This listing could not be loaded|Loading listing/, 10000)
    }
    await record(cdp, '12-listing-detail', {
      ok: openedListing && body.includes('Message seller') && !body.includes('This listing could not be loaded'),
      note: openedListing
        ? 'Opened a featured listing card.'
        : `Featured strip state ${JSON.stringify(featuredState)}. No listing card was opened.`
    })

    const saved = await clickButton(cdp, 'Save')
    body = await waitForText(cdp, /Saved|Saving this listing is unavailable|Sign in to continue/, 8000)
    await record(cdp, '13-listing-save', {
      ok: saved && body.includes('Saved') && !body.includes('Sign in to continue') && !body.includes('Saving this listing is unavailable'),
      note: saved ? 'Clicked Save on Listing Detail and waited for Saved.' : 'Save button was not clicked.'
    })

    const sellerMessage = 'Is this still available?'
    const messaged = await clickButton(cdp, 'Message seller')
    await sleep(400)
    const pickedReply = await clickButton(cdp, sellerMessage)
    await sleep(300)
    const sentMessage = await clickButton(cdp, 'Send message')
    body = await waitForText(cdp, /Message sent!|couldn't be sent|Sign in to continue|You cannot message yourself/, 10000)
    await record(cdp, '14-message-modal', {
      ok: messaged && pickedReply && sentMessage && body.includes('Message sent!') && !body.includes('Sign in to continue'),
      note: messaged
        ? `Quick reply: ${pickedReply}. Send: ${sentMessage}.`
        : 'Message seller was not clicked.'
    })

    const created = await clickButton(cdp, 'Post Listing')
    body = await waitForText(cdp, /Post a listing|Categories are unavailable/, 8000)
    const pickedType = await cdp.evaluate(`(() => {
      const card = [...document.querySelectorAll('main button, button')].find((node) => (node.innerText || '').includes('Item for Sale'))
      if (!card) return false
      card.click()
      return (card.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
    })()`)
    await sleep(300)
    const steps = []
    for (let step = 0; step < 5; step += 1) {
      const label = step === 4 ? 'Continue to publish →' : 'Continue →'
      const moved = await clickButton(cdp, label)
      steps.push(moved ? label : `miss:${label}`)
      await sleep(400)
    }
    body = await waitForText(cdp, /Ready to go live|Listing published|Categories are unavailable|Add a title/, 8000)
    const published = await clickContaining(cdp, 'Publish now')
    if (published) body = await waitForText(cdp, /Listing published!|Unable to publish|still loading/, 10000)
    await record(cdp, '15-create', {
      ok: created && Boolean(pickedType) && body.includes('Listing published!') && !body.includes('Categories are unavailable'),
      note: `Type card: ${pickedType || 'not selected'}. Steps: ${steps.join(' | ')}. Publish clicked: ${Boolean(published)}.`
    })

    const messagesClicked = await cdp.evaluate(`(() => {
      const button = document.querySelector('header button.relative')
      if (!button) return false
      button.click()
      return true
    })()`)
    body = await waitForText(cdp, /Is this still available\?|No messages yet|could not be loaded|Sign in to continue/, 10000)
    await record(cdp, '16-messages', {
      ok: messagesClicked && body.includes('Is this still available?') && !body.includes('could not be loaded') && !body.includes('Sign in to continue'),
      note: body.includes('Is this still available?')
        ? 'The seeded-listing message is in the inbox.'
        : messagesClicked
          ? 'Opened Messages. The seller message was not visible.'
          : 'Messages icon was not found.'
    })

    const savedNav = await cdp.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('header button.w-9')]
      const button = buttons.find((node) => !node.classList.contains('relative'))
      if (!button) return false
      button.click()
      return true
    })()`)
    body = await waitForText(cdp, /Saved items|could not be loaded|Sign in to continue/, 8000)
    await record(cdp, '17-saved', {
      ok: savedNav && body.includes('Saved items') && !body.includes('could not be loaded') && !body.includes('Sign in to continue'),
      note: savedNav ? 'Opened the saved icon.' : 'Saved icon was not found.'
    })

    const menu = await cdp.evaluate(`(() => {
      const button = [...document.querySelectorAll('header button')].find((node) => (node.innerText || '').includes('Gad') || node.querySelector('img, svg'))
      const profile = [...document.querySelectorAll('header button')].reverse().find((node) => node.querySelector('img') || /chevron/i.test(node.innerHTML))
      const target = profile || button
      if (!target) return false
      target.click()
      return true
    })()`)
    await sleep(300)
    const profileClicked = await clickButton(cdp, 'My Profile')
    body = await waitForText(cdp, /Marcus|Profile could not be loaded|Neighbor|Listings|Reviews/, 8000)
    await record(cdp, '18-profile', {
      ok: menu && profileClicked && !body.includes('Profile could not be loaded') && !body.includes('Sign in to continue'),
      note: profileClicked ? 'Opened My Profile from the account menu.' : 'My Profile was not clicked. The nav name is painted copy.'
    })

    const menuAgain = await cdp.evaluate(`(() => {
      const profile = [...document.querySelectorAll('header button')].reverse().find((node) => node.querySelector('img'))
      if (!profile) return false
      profile.click()
      return true
    })()`)
    await sleep(300)
    const dashboardClicked = await clickButton(cdp, 'My Dashboard')
    body = await waitForText(cdp, /My dashboard|could not be loaded|Sign in to continue/, 8000)
    await record(cdp, '19-dashboard', {
      ok: menuAgain && dashboardClicked && body.includes('My dashboard') && !body.includes('Sign in to continue'),
      note: dashboardClicked ? 'Opened My Dashboard.' : 'My Dashboard was not clicked.'
    })
  } finally {
    await writeFile(resolve(OUT, 'results.json'), `${JSON.stringify({ appUrl: APP_URL, finishedAt: new Date().toISOString(), failed, results }, null, 2)}\n`)
    chrome.kill('SIGTERM')
  }
}

main().catch(async (cause) => {
  failed = true
  console.error(cause instanceof Error ? cause.stack : cause)
  await mkdir(OUT, { recursive: true })
  await writeFile(resolve(OUT, 'results.json'), `${JSON.stringify({ failed: true, error: String(cause), results }, null, 2)}\n`)
  process.exit(1)
})
