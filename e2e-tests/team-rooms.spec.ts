// @covers client/app/LobbyPage.tsx
// @covers client/app/TeamSetupFields.tsx
// @covers client/app/TeamWaitingRoom.tsx
// @covers client/styles/pages/
import { expect, test, type BrowserContext } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ServerEvent } from '../shared/contract/protocol/ws'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { authenticateTeamAccount } from './helpers/team-account'

for (const variant of [
  { name: 'desktop-en', locale: 'en', width: 1280, height: 900 },
  { name: 'mobile-zh', locale: 'zh', width: 390, height: 844 },
] as const) {
  test(`team creation, self selection, host moves and authoritative start (${variant.name})`, async ({ browser }, testInfo) => {
    test.setTimeout(120000)
    const contexts: BrowserContext[] = []
    const labels = variant.locale === 'en' ? {
      entry: 'Team game', create: 'Create Game', players4: '4 players', players6: '6 players',
      seats: 'Seats per team', seating: 'Seat arrangement', scoring: 'Team scoring', visibility: 'Teammate visibility',
      choose: 'Choose a team', moveBob: 'Move Bob to a team', start: 'Start game', join: 'Join', mode: 'Team',
    } : {
      entry: '组队模式', create: '创建游戏', players4: '4 人', players6: '6 人',
      seats: '每队席位数', seating: '座位排布', scoring: '队伍计分', visibility: '队友可见性',
      choose: '选择队伍', moveBob: '为 Bob 调整队伍', start: '开始游戏', join: '加入', mode: '组队模式',
    }
    try {
      const suffix = `${Date.now().toString(36)}${variant.locale}`
      const names = ['Host', 'Alice', 'Bob', 'Carol']
      for (const [index, name] of names.entries()) {
        const context = await browser.newContext({ viewport: { width: variant.width, height: variant.height },
          ...(variant.locale === 'zh' ? { isMobile: true, hasTouch: true } : {}) })
        contexts.push(context)
        await context.addInitScript(locale => { localStorage.setItem('open-agricola-locale-v2', locale) }, variant.locale)
        await authenticateTeamAccount(context, `tm${index}_${suffix}`, name)
      }
      const pages = await Promise.all(contexts.map(context => context.newPage()))
      const snapshots: Array<GameSyncPayload | undefined> = []
      for (const [index, page] of pages.entries()) page.on('websocket', socket => socket.on('framereceived', event => {
        const message: ServerEvent = JSON.parse(event.payload.toString())
        if (message.type === 'stateUpdate') snapshots[index] = message.payload
      }))
      const host = pages[0]!
      await host.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      await host.getByRole('button', { name: labels.entry, exact: true }).click()
      expect(await host.getByRole('combobox', { name: labels.scoring }).inputValue()).toBe('category-min')
      expect(await host.getByRole('combobox', { name: labels.visibility }).inputValue()).toBe('shared')
      const counts = host.locator('.player-select-options').first().getByRole('button')
      expect(await counts.count()).toBe(2)
      await counts.nth(1).click()
      await host.getByRole('combobox', { name: labels.seats }).selectOption('3')
      await counts.nth(0).click()
      expect(await host.getByRole('combobox', { name: labels.seats }).inputValue()).toBe('2')
      await host.getByRole('combobox', { name: labels.seating }).selectOption('random')
      await host.getByRole('combobox', { name: labels.scoring }).selectOption('sum')
      await host.getByRole('combobox', { name: labels.visibility }).selectOption('private')
      await host.screenshot({ path: testInfo.outputPath('team-setup.png'), fullPage: true })
      await host.getByRole('button', { name: labels.create, exact: true }).click()
      await expect(host.locator('.team-waiting-room')).toBeVisible()
      const roomId = await host.locator('.ws-invite-roomid strong').textContent()
      if (!roomId) throw new Error('Missing team room identity')
      expect(new URL(host.url()).search).toBe(`?room=${roomId}`)
      await expect(host.getByRole('button', { name: labels.start, exact: true })).toBeDisabled()
      expect(await host.locator('.ws-seat-label').count()).toBe(0)
      const listing = await contexts[1]!.request.get(`${BACKEND_URL}/api/rooms`)
      const listed = await listing.json() as { rooms: Array<{ id: string; teamConfig?: unknown }> }
      expect(listed.rooms.find(room => room.id === roomId)?.teamConfig).toEqual({ mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'sum', teammateVisibility: 'private' })
      const alice = pages[1]!
      await alice.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' })
      const row = alice.locator('.room-item').filter({ hasText: roomId })
      await expect(row.locator('.team-config-summary')).toContainText(labels.mode)
      await row.getByRole('button', { name: labels.join, exact: true }).click()
      await expect(alice.locator('.team-waiting-room')).toBeVisible()
      await alice.getByRole('combobox', { name: labels.choose }).selectOption('1')
      await expect(alice.getByRole('combobox', { name: labels.choose })).toHaveValue('1')
      const bob = pages[2]!
      await bob.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await expect(bob.locator('.team-waiting-room')).toBeVisible()
      await host.getByRole('combobox', { name: labels.moveBob }).selectOption('1')
      await expect(bob.getByRole('combobox', { name: labels.choose })).toHaveValue('1')
      const carol = pages[3]!
      await carol.goto(`${FRONTEND_URL}/?room=${roomId}`, { waitUntil: 'domcontentloaded' })
      await expect(carol.locator('.team-waiting-room')).toBeVisible()
      await expect(host.getByRole('button', { name: labels.start, exact: true })).toBeEnabled()
      expect(snapshots.filter(Boolean)).toHaveLength(0)
      expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await host.screenshot({ path: testInfo.outputPath('team-waiting.png'), fullPage: true })
      await host.getByRole('button', { name: labels.start, exact: true }).click()
      await expect.poll(() => snapshots.filter(Boolean).length).toBe(4)
      for (const page of pages) await expect(page.locator('.team-waiting-room')).toHaveCount(0)
      const state = snapshots[0]!.state
      const team = state.team!
      expect(state.players.filter((_, index) => team.playerTeams[index] === 0).map(player => player.name).sort()).toEqual(['Carol', 'Host'])
      expect(state.players.filter((_, index) => team.playerTeams[index] === 1).map(player => player.name).sort()).toEqual(['Alice', 'Bob'])
    } finally { for (const context of contexts) await context.close() }
  })
}
