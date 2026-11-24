// @covers client/service-worker/web-push.worker.ts
// @covers client/app/WebPushClickRouter.tsx
// @covers client/app/WebPushSettings.tsx
// @covers client/services/web-push.ts
// @covers server/web-push/
//
// This drives the published Worker with an injected browser event and the real Pages app,
// backend and PostgreSQL. Operating-system delivery and click permission require a real device.
import { randomUUID } from 'node:crypto'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, type Worker } from '@playwright/test'
import { authCookieNames } from '../server/auth-cookies'
import { getSessionByToken } from '../server/auth'
import { getDb } from '../server/db'
import { enqueueWebPush, WebPushStore } from '../server/web-push/store'
import { WebPushDelivery } from '../server/web-push/delivery'
import type { WebPushKind } from '../shared/contract/web-push'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { buildPagesFrontend, servePagesFrontend } from './helpers/pages-frontend'
import { authenticateSolo, SoloBrowserDriver } from './helpers/standard-solo-acceptance'

type Displayed = { title: string; body?: string; icon?: string; badge?: string; data: unknown; tag?: string }

/** Dispatches a push with this payload to the Worker and returns what it asked the browser to show. */
async function showPush(worker: Worker, payload: unknown) {
  return worker.evaluate(async payload => {
    const scope = self as unknown as ServiceWorkerGlobalScope
    const push = new PushEvent('push', { data: JSON.stringify(payload) })
    let messageShown: Promise<unknown> | undefined
    let displayed: Displayed | undefined
    const show = scope.registration.showNotification
    scope.registration.showNotification = async (title, options) => {
      displayed = { title, body: options?.body, icon: options?.icon, badge: options?.badge, data: options?.data, tag: options?.tag }
    }
    try {
      Object.defineProperty(push, 'waitUntil', { value: (work: Promise<unknown>) => { messageShown = work } })
      scope.dispatchEvent(push)
      await messageShown
    } finally {
      scope.registration.showNotification = show
    }
    return displayed
  }, payload)
}

async function clickPush(worker: Worker, kind: WebPushKind, deliveryId: string, title: string) {
  return worker.evaluate(async ({ kind, deliveryId, title }) => {
    // The Playwright callback runs in the active classic Service Worker.
    const scope = self as unknown as ServiceWorkerGlobalScope
    const push = new PushEvent('push', { data: JSON.stringify({ kind, deliveryId, title }) })
    let messageShown: Promise<unknown> | undefined
    let displayed: Displayed | undefined
    const show = scope.registration.showNotification
    scope.registration.showNotification = async (name, options) => {
      displayed = { title: name, body: options?.body, icon: options?.icon, data: options?.data, tag: options?.tag }
    }
    try {
      Object.defineProperty(push, 'waitUntil', { value: (work: Promise<unknown>) => { messageShown = work } })
      scope.dispatchEvent(push)
      await messageShown
    } finally {
      scope.registration.showNotification = show
    }
    if (!displayed || displayed.tag !== deliveryId) throw new Error('The Worker did not show the expected notification')
    const notification = { ...displayed, close: () => {} }
    const click = new Event('notificationclick')
    let clickComplete: Promise<unknown> | undefined
    Object.defineProperties(click, {
      notification: { value: notification },
      waitUntil: { value: (work: Promise<unknown>) => { clickComplete = work } },
    })

    // Synthetic events do not carry OS activation. Record the actual WindowClient
    // that the Worker selected, without requiring the desktop to grant focus.
    let focusedUrl: string | null = null
    let openedUrl: string | null = null
    const open = scope.clients.openWindow
    scope.clients.openWindow = async url => { openedUrl = url; return null }
    const focus = WindowClient.prototype.focus
    WindowClient.prototype.focus = async function () { focusedUrl = this.url; return this }
    try {
      scope.dispatchEvent(click)
      await clickComplete
      return { title: notification.title, body: notification.body, icon: notification.icon, focusedUrl, openedUrl }
    } finally {
      WindowClient.prototype.focus = focus
      scope.clients.openWindow = open
    }
  }, { kind, deliveryId, title })
}

test('shows the account device count and opens draft, inbox and turn notifications in the correct Pages game',
  async ({ browser, browserName, request }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The Chromium runner exposes the active Service Worker for event injection')
    test.setTimeout(180_000)
    testInfo.annotations.push({ type: 'limitation', description: 'Worker events are injected in Chromium. Provider delivery and operating-system click activation remain device tests.' })
    expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
    const siteDirectory = mkdtempSync(join(tmpdir(), 'oa-web-push-'))
    const site = await servePagesFrontend(siteDirectory, { backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL })
    const context = await browser.newContext()
    const otherContext = await browser.newContext()
    try {
      cpSync(buildPagesFrontend(site.origin).directory, siteDirectory, { recursive: true })
      const name = `push_${randomUUID().slice(0, 8)}`
      await authenticateSolo(context, request, name, site.origin)
      await authenticateSolo(otherContext, request, `${name}_other`, site.origin)

      const cookie = (await context.cookies(site.origin)).find(item => item.name === authCookieNames().session)
      const session = await getSessionByToken(cookie?.value ?? '')
      if (!cookie || !session) throw new Error('Missing test account login')
      const store = new WebPushStore(getDb())
      const deviceId = randomUUID()
      const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/isolated-pages-fixture',
        keys: { p256dh: 'A'.repeat(87), auth: 'A'.repeat(22) } }
      await store.preferences(cookie.value, deviceId, null)
      for (const kind of ['draft', 'bug-report-inbox'] as const) {
        await store.bind(cookie.value, { deviceId, subscription, kind, enabled: true, locale: 'en' })
      }

      const game = await context.newPage()
      const driver = new SoloBrowserDriver(game)
      const sockets = observeSockets(game)
      await game.goto(`${site.origin}/?bg=none`)
      await expect.poll(() => game.evaluate(async () =>
        (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
      await game.goto(`${site.origin}/?page=settings&bg=none`)
      await expect(game.getByText('Devices with notifications enabled: 1', { exact: true })).toBeVisible()
      await expect(game.getByRole('checkbox', { name: 'Turn reminders' })).toBeVisible()
      await game.goto(`${site.origin}/?transport=ws&maxPlayers=2&draftMode=simultaneous&draftPoolSize=7&bg=none`)
      const invitation = game.locator('.ws-invite-roomid strong')
      await expect(invitation).toBeVisible()
      const roomId = await invitation.innerText()
      const other = await otherContext.newPage()
      await other.goto(`${site.origin}/?page=settings&bg=none`)
      await expect(other.getByText('Devices with notifications enabled: 0', { exact: true })).toBeVisible()
      await other.goto(`${site.origin}/?room=${roomId}&bg=none`)
      await other.getByRole('button', { name: 'Confirm color and start', exact: true }).click()
      await expect(game.getByRole('dialog', { name: 'Card draft' })).toBeVisible()
      const worker = context.serviceWorkers().find(item => item.url() === `${site.origin}/sw.js`)
      if (!worker) throw new Error('The Pages Service Worker was not running')

      const feedbackSubject = randomUUID()
      const now = Date.now()
      const messageId = await getDb().transaction(async () => {
        await getDb().prepare(`INSERT INTO bug_report_feedback_subjects(submission_id,source,reporter_user_id,github_issue_number,import_audit)
          VALUES (?,'historical',?,991234,'{}'::jsonb)`).run(feedbackSubject, session.user.id)
        const message = await getDb().prepare(`INSERT INTO bug_report_feedback(submission_id,recipient_user_id,request_id,kind,
          report_summary,explanation,missing_items,version,created_at)
          VALUES (?,?,?,'needs_info','Pages test feedback','Please send a screenshot','["A screenshot"]'::jsonb,1,?) RETURNING id`)
          .get<{ id: number }>(feedbackSubject, session.user.id, randomUUID(), now)
        if (!message) throw new Error('No test message was saved')
        await enqueueWebPush(getDb(), { kind: 'bug-report-inbox', userId: session.user.id, messageId: message.id, createdAt: now })
        return message.id
      })()

      const deliveryIds = new Map<WebPushKind, string>()
      await new WebPushDelivery(store, async delivery => {
        deliveryIds.set(delivery.kind, delivery.deliveryId)
        return { kind: 'accepted' }
      }).deliverDue(['draft', 'bug-report-inbox'])
      const draft = deliveryIds.get('draft'), inbox = deliveryIds.get('bug-report-inbox')
      if (!draft || !inbox) throw new Error('The isolated sender did not receive both notifications')

      const [gameClient] = await worker.evaluate(async () =>
        (await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({ type: 'window' })).map(client => client.url))
      expect(gameClient).toContain('draftMode=simultaneous')
      const pageStart = await game.evaluate(() => performance.timeOrigin)
      const activeSocket = sockets.at(-1)
      expect(activeSocket?.isClosed()).toBe(false)
      const beforeClick = sockets.length
      // The current backend's payload: generic copy under the site name with the bundled brand icon.
      const icon = expect.stringMatching(/^\/assets\/brand-logo-[\w-]+\.png$/)
      const draftCopy = "It's your turn to pick cards in the draft."
      expect(await clickPush(worker, 'draft', draft, draftCopy))
        .toEqual({ title: 'Open Agricola', body: draftCopy, icon, focusedUrl: gameClient, openedUrl: null })
      // Payloads stay generic: an added field never reaches the notification, and an unreadable one still shows the site name.
      const extra = await showPush(worker, { kind: 'draft', deliveryId: draft, title: draftCopy, roomName: 'Secret room' })
      expect(extra).toEqual({ title: 'Open Agricola', body: draftCopy, icon, data: { kind: 'draft', deliveryId: draft }, tag: draft })
      expect(await showPush(worker, { title: 'Not a delivery' })).toEqual({ title: 'Open Agricola', icon })

      const wrongAccount = await otherContext.newPage()
      await wrongAccount.goto(`${site.origin}/?push=${draft}&pushKind=draft`)
      await expect(wrongAccount.getByText('This notification is no longer available.')).toBeVisible()
      expect(new URL(wrongAccount.url()).searchParams.has('context')).toBe(false)
      expect(new URL(wrongAccount.url()).searchParams.has('push')).toBe(false)

      const noApp = await context.newPage()
      await noApp.route(url => url.pathname.startsWith('/assets/index-'), route => route.abort())
      await noApp.goto(`${site.origin}/?bg=none`)
      await noApp.bringToFront()
      // A newer tab on the same browser still renders the other account after
      // the session cookie switches back. It can only return a generic probe.
      const otherCookie = (await otherContext.cookies(site.origin)).find(item => item.name === authCookieNames().session)
      if (!otherCookie) throw new Error('Missing the second test account login')
      await context.addCookies([otherCookie])
      const staleAccountTab = await context.newPage()
      await staleAccountTab.goto(`${site.origin}/?page=settings&bg=none`)
      await expect(staleAccountTab.getByRole('textbox', { name: 'Display Name', exact: true })).toHaveValue(`${name}_other`)
      await context.addCookies([cookie])
      await staleAccountTab.bringToFront()
      await expect.poll(() => worker.evaluate(async () =>
        (await (self as unknown as ServiceWorkerGlobalScope).clients.matchAll({ type: 'window' }))[0]?.url))
        .toContain('page=settings')

      const lookup = game.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/inbox/${messageId}`)
      // A backend from before the copy change sends its short line as the title; it becomes the body.
      expect(await clickPush(worker, 'bug-report-inbox', inbox, 'You have a new inbox message'))
        .toEqual({ title: 'Open Agricola', body: 'You have a new inbox message', icon, focusedUrl: gameClient, openedUrl: null })
      expect((await lookup).status()).toBe(200)
      await expect(staleAccountTab.locator('dialog.inbox-dialog')).toHaveCount(0)
      const modal = game.locator('dialog.inbox-dialog')
      await expect(modal.getByRole('heading', { name: 'Pages test feedback' })).toBeVisible()
      await expect.poll(async () => (await getDb().prepare('SELECT read_at FROM bug_report_feedback WHERE id=?')
        .get<{ read_at: number | null }>(messageId))?.read_at).toBeGreaterThan(now)
      await modal.getByRole('button', { name: 'Close', exact: true }).click()
      await game.locator('.draft-pool-row-occ .draft-card').first().click()
      await game.locator('.draft-pool-row-minor .draft-card').first().click()
      await driver.ui('confirm a pick after both notifications', () => game.getByRole('button', { name: 'Confirm picks', exact: true }).click())
      expect(sockets).toHaveLength(beforeClick)
      expect(activeSocket?.isClosed()).toBe(false)
      expect(await game.evaluate(() => performance.timeOrigin)).toBe(pageStart)

      const guestDevice = randomUUID()
      const guestSubscription = { ...subscription, endpoint: subscription.endpoint + '-guest' }
      await store.preferences(otherCookie.value, guestDevice, null)
      await store.bind(otherCookie.value, { deviceId: guestDevice, subscription: guestSubscription, kind: 'turn', enabled: true, locale: 'en' })
      await store.bind(cookie.value, { deviceId, subscription, kind: 'turn', enabled: true, locale: 'en' })

      const hostGameUrl = `${site.origin}/?transport=ws&maxPlayers=2&bg=none`
      await game.goto(hostGameUrl)
      const ordinaryRoom = await game.locator('.ws-invite-roomid strong').innerText()
      const guestGameUrl = `${site.origin}/?room=${ordinaryRoom}&bg=none`
      await other.goto(guestGameUrl)
      await other.getByRole('button', { name: 'Confirm color and start', exact: true }).click()
      await expect(game.locator('.game-layout')).toBeVisible()
      await expect(other.locator('.game-layout')).toBeVisible()
      const turns: Array<{ recipient: string; id: string }> = []
      await new WebPushDelivery(store, async item => {
        turns.push({ recipient: item.subscription.endpoint, id: item.deliveryId })
        return { kind: 'accepted' }
      }).deliverDue(['turn'])
      expect(turns).toHaveLength(1)
      const hostActs = turns[0]!.recipient === subscription.endpoint
      const actingWorker = hostActs ? worker : otherContext.serviceWorkers().find(item => item.url() === `${site.origin}/sw.js`)
      if (!actingWorker) throw new Error('Missing responder Worker')
      const turnClick = await clickPush(actingWorker, 'turn', turns[0]!.id, 'It’s your turn to act.')
      expect(turnClick).toMatchObject({ title: 'Open Agricola', body: 'It’s your turn to act.', openedUrl: null })
      expect(turnClick.focusedUrl).toBe(hostActs ? hostGameUrl : guestGameUrl)

    } finally {
      await Promise.all([context.close(), otherContext.close()])
      await site.close()
      rmSync(siteDirectory, { recursive: true, force: true })
    }
  })

function observeSockets(page: import('@playwright/test').Page) {
  const sockets: import('@playwright/test').WebSocket[] = []
  page.on('websocket', socket => { if (/^\/nodes\/[^/]+\/ws$/.test(new URL(socket.url()).pathname)) sockets.push(socket) })
  return sockets
}
