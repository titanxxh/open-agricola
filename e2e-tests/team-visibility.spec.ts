// @covers client/components/board/FarmBoard.tsx
// @covers client/app/GameContainerApi.tsx
// @covers server/connection/
import { expect, test, type BrowserContext } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { FRONTEND_URL } from './fixtures'
import { authenticateTeamAccount } from './helpers/team-account'

for (const visibility of ['shared', 'private'] as const) {
  test(`teammate hands are ${visibility} and remain read-only`, async ({ browser }, testInfo) => {
    test.setTimeout(120000)
    const contexts: BrowserContext[] = []
    const mobile = visibility === 'shared'
    try {
      const suffix = crypto.randomUUID().slice(0, 8)
      for (let index = 0; index < 4; index++) {
        const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1440, height: 900 },
          ...(mobile ? { isMobile: true, hasTouch: true } : {}) })
        contexts.push(context)
        await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
        await authenticateTeamAccount(context, `tv${index}_${suffix}`, ['Host', 'Alice', 'Bob', 'Carol'][index]!)
      }
      const pages = await Promise.all(contexts.map(context => context.newPage()))
      const snapshots: Array<GameSyncPayload | undefined> = []
      const bindings: Array<Extract<ServerEvent, { type: 'roomJoined' }> | undefined> = []
      const sent: string[][] = pages.map(() => [])
      for (const [index, page] of pages.entries()) page.on('websocket', socket => {
        socket.on('framereceived', event => {
          const message: ServerEvent = JSON.parse(event.payload.toString())
          if (message.type === 'stateUpdate') snapshots[index] = message.payload
          if (message.type === 'roomJoined') bindings[index] = message
        })
        socket.on('framesent', event => sent[index]!.push(JSON.parse(event.payload.toString()).type))
      })
      const host = pages[0]!
      await host.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await host.getByRole('button', { name: 'Team game', exact: true }).click()
      await host.getByRole('combobox', { name: 'Teammate visibility' }).selectOption(visibility)
      await host.getByRole('button', { name: 'Create Game', exact: true }).click()
      await expect(host.locator('.team-waiting-room')).toBeVisible()
      const roomId = await host.locator('.ws-invite-roomid strong').textContent()
      for (const page of pages.slice(1)) {
        await page.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
        await expect(page.locator('.team-waiting-room')).toBeVisible()
      }
      await host.getByRole('button', { name: 'Start game', exact: true }).click()
      await expect.poll(() => snapshots.filter(Boolean).length).toBe(4)
      await expect(host.locator('.game-layout')).toBeVisible()
      const teammateIndex = bindings[1]!.playerIndex
      const teammateId = snapshots[0]!.state.players[teammateIndex]!.id
      const teammateHand = snapshots[1]!.state.players[teammateIndex]!.occupationHand
      expect(teammateHand.length).toBeGreaterThan(0)
      expect(snapshots[0]!.state.players[teammateIndex]!.occupationHand).toEqual(visibility === 'shared' ? teammateHand : teammateHand.map(() => '?'))
      const sentBefore = sent[0]!.length
      const browse = async (name: string) => {
        if (mobile) {
          await host.getByRole('button', { name: /^Switch player view/ }).click()
          await host.getByRole('listbox').getByRole('option', { name: new RegExp(name) }).click()
        } else await host.getByRole('tab', { name: new RegExp(name) }).click()
      }
      await browse('Alice')
      if (visibility === 'shared') {
        const hand = host.locator(`[data-hand-anchor="${teammateId}"]`)
        await expect(hand).toBeVisible()
        await expect(hand.locator('[data-card-anchor]')).toHaveCount(14)
        await expect(hand.locator('[data-card-anchor][aria-disabled="false"]')).toHaveCount(0)
        await expect(host.getByTestId('occupation-hand-confirm')).toHaveCount(0)
        await hand.locator('[data-card-anchor]').first().tap()
        await expect(host.getByRole('dialog', { name: 'Card details', exact: true })).toBeVisible()
        await expect(host.locator('.card-details__footer button:enabled')).toHaveCount(0)
        await host.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
        await host.screenshot({ path: testInfo.outputPath('teammate-readable-hand.png'), fullPage: true })
      } else {
        await expect(host.locator('[data-hand-anchor]')).toHaveCount(0)
        await expect(host.locator('.hand-hidden')).toHaveText('Hand cards are hidden')
      }
      await browse('Bob')
      await expect(host.locator('[data-hand-anchor]')).toHaveCount(0)
      await expect(host.locator('.hand-hidden')).toHaveText('Hand cards are hidden')
      expect(sent[0]!.slice(sentBefore).filter(type => !['getState', 'getHistory', 'getCommandScope', 'ping'].includes(type))).toEqual([])
    } finally { for (const context of contexts) await context.close() }
  })
}
