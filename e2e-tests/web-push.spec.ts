// @covers client/service-worker/web-push.worker.ts
// @covers client/app/WebPushClickRouter.tsx
// @covers client/services/web-push.ts
// @covers server/web-push/
//
// This drives the published Worker with an injected browser event and the real Pages app,
// backend and PostgreSQL. Operating-system delivery and click permission require a real device.
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
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

async function clickPush(worker: Worker, kind: WebPushKind, deliveryId: string) {
  return worker.evaluate(async ({ kind, deliveryId }) => {
    // The Playwright callback runs in the active classic Service Worker.
    const scope = self as unknown as ServiceWorkerGlobalScope
    const title = kind === 'draft' ? 'You have cards to draft' : 'You have a new inbox message'
    const push = new PushEvent('push', { data: JSON.stringify({ kind, deliveryId, title }) })
    let messageShown: Promise<unknown> | undefined
    let displayed: { title: string; data: unknown; tag?: string } | undefined
    const show = scope.registration.showNotification
    scope.registration.showNotification = async (name, options) => {
      displayed = { title: name, data: options?.data, tag: options?.tag }
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
      return { title: notification.title, focusedUrl, openedUrl }
    } finally {
      WindowClient.prototype.focus = focus
      scope.clients.openWindow = open
    }
  }, { kind, deliveryId })
}

test('a verified notification opens draft and inbox in the existing Pages game without replacing its connection',
  async ({ browser, browserName, request }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The Chromium runner exposes the active Service Worker for event injection')
    test.setTimeout(180_000)
    testInfo.annotations.push({ type: 'limitation', description: 'Worker events are injected in Chromium. Provider delivery and operating-system click activation remain device tests.' })
    expect(process.env.DATABASE_SCHEMA).toMatch(/^test_[a-f0-9]{32}$/)
    const site = await servePagesFrontend(resolve('dist-pages'), { backendUrl: BACKEND_URL, frontendOrigin: FRONTEND_URL })
    const context = await browser.newContext()
    const otherContext = await browser.newContext()
    try {
      buildPagesFrontend(site.origin)
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
      await game.goto(`${site.origin}/?transport=ws&maxPlayers=2&draftMode=simultaneous&draftPoolSize=7&bg=none`)
      const invitation = game.locator('.ws-invite-roomid strong')
      await expect(invitation).toBeVisible()
      const roomId = await invitation.innerText()
      const other = await otherContext.newPage()
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
      expect(await clickPush(worker, 'draft', draft)).toEqual({ title: 'You have cards to draft', focusedUrl: gameClient, openedUrl: null })

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
      expect(await clickPush(worker, 'bug-report-inbox', inbox)).toEqual({ title: 'You have a new inbox message', focusedUrl: gameClient, openedUrl: null })
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

    } finally {
      await Promise.all([context.close(), otherContext.close()])
      await site.close()
    }
  })

function observeSockets(page: import('@playwright/test').Page) {
  const sockets: import('@playwright/test').WebSocket[] = []
  page.on('websocket', socket => { if (/^\/nodes\/[^/]+\/ws$/.test(new URL(socket.url()).pathname)) sockets.push(socket) })
  return sockets
}
