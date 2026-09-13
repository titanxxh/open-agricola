import { expect, test, type Page, type APIResponse } from '@playwright/test'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'

const CARD = 'D159_ReedSeller'

const captureState = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('open-agricola-locale-v2', 'en')
    const NativeWebSocket = window.WebSocket
    window.WebSocket = class extends NativeWebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        ;(window as unknown as { auditSocket: WebSocket }).auditSocket = this
        this.addEventListener('message', (event) => {
          const message = JSON.parse(event.data as string)
          if (message.type === 'stateUpdate') (window as unknown as { auditState: unknown }).auditState = message.payload
        })
      }
    }
  })
}

const state = (page: Page) => page.evaluate(() => (window as unknown as { auditState: { state: { players: Array<{ resources: Record<string, number>; cardStates: Record<string, unknown> }> }; interaction: { stateId: string; playerIndex: number; request: { kind: string; fromPlayerIndex?: number; options?: Array<{ value: string }> } } } }).auditState)

test('D159 public multi-player sale supports cooking and a chosen buyer', async ({ browser, request }) => {
  const cookie = (response: APIResponse, name: string) => response.headersArray()
    .find((header) => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith(`${name}=`))!
    .value.split(';')[0]!.slice(name.length + 1)
  const suffix = Date.now().toString(36)
  const pages = await Promise.all([0, 1, 2, 3].map(async (index) => {
    const page = await browser.newPage()
    const username = `r893_${suffix}_${index}`
    const oauth = await request.post(`${BACKEND_URL}/api/test/oauth/github/callback`, {
      data: { providerUserId: username, providerLogin: username, email: `${username}@example.com`, displayName: username },
    })
    expect(oauth.ok(), await oauth.text()).toBe(true)
    const complete = await request.post(`${BACKEND_URL}/api/auth/onboarding/complete`, {
      headers: { Cookie: `oa_onboarding=${cookie(oauth, 'oa_onboarding')}` },
      data: { username, displayName: username, password: 'rules-pass-893', confirmPassword: 'rules-pass-893' },
    })
    expect(complete.ok(), await complete.text()).toBe(true)
    await page.context().addCookies([{ name: 'oa_session', value: cookie(complete, 'oa_session'), url: FRONTEND_URL }])
    await captureState(page)
    return page
  }))
  await pages[0]!.goto('/?player=p1&transport=ws&maxPlayers=4&devMode=1')
  const room = pages[0]!.locator('.ws-invite-roomid strong')
  await expect(room).toBeVisible({ timeout: 30000 })
  const roomId = await room.textContent()
  for (const index of [1, 2, 3]) {
    await pages[index]!.goto(`/?player=p${index + 1}&transport=ws&room=${roomId}&devMode=1`)
  }
  for (const page of pages) await expect(page.locator('.game-layout')).toBeVisible({ timeout: 30000 })
  const created = await request.post(`${BACKEND_URL}/api/game/new`, { data: { seed: 893159, playerCount: 4, maxPlayers: 4 } })
  const game = (await created.json()).state
  expect(game.players).toHaveLength(4)
  for (const player of game.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 3
  }
  game.players[0].occupationPlayed = [CARD]
  game.players[0].resources.reed = 1
  game.players[1].improvements = ['Major_Fireplace1']
  game.players[1].resources.food = 1
  game.players[1].resources.sheep = 1
  game.players[1].houseAnimalType = 'sheep'
  game.players[1].houseAnimalCount = 1
  await pages[0]!.evaluate((gameState) => {
    ;(window as unknown as { auditSocket: WebSocket }).auditSocket.send(JSON.stringify({ type: 'loadGame', state: gameState, requestId: 'audit-setup' }))
  }, game)
  await expect(pages[0]!.getByRole('button', { name: 'Reed Seller: Sell 1 Reed' })).toBeVisible()
  await pages[0]!.getByRole('button', { name: 'Reed Seller: Sell 1 Reed' }).click()
  for (let index = 1; index < 4; index++) {
    const previous = pages[index - 1]!
    const current = pages[index]!
    await expect.poll(async () => (await state(previous)).interaction.request?.kind).toBe('confirm-player-switch')
    const snapshot = await state(previous)
    if (snapshot.interaction.request.kind === 'confirm-player-switch') {
      await previous.locator('.interaction-bar').getByRole('button', { name: /Confirm/i }).click()
    }
    await expect(current.getByRole('button', { name: 'Buy 1 Reed for 2 Food' })).toBeVisible()
    await expect(pages[0]!.getByRole('button', { name: 'Buy 1 Reed for 2 Food' })).toHaveCount(0)
    if (index === 1) {
      await current.locator('.anytime-bar').getByRole('button').filter({ hasText: /Exchange|Convert/i }).first().click()
      const recipe = current.getByTestId('anytime-exchange-option-Major_Fireplace1-ex0')
      await expect(recipe).toBeVisible()
      await recipe.getByRole('button', { name: '+', exact: true }).click()
      await current.locator('.exchange-confirm').click()
      await expect(current.getByRole('button', { name: 'Buy 1 Reed for 2 Food' })).toBeVisible()
      await expect.poll(async () => (await state(current)).state.players[1]!.resources.food).toBe(3)
      await current.screenshot({ path: '/tmp/oa-893-buyer-cooking.png' })
    }
    await current.getByRole('button', { name: index === 3 ? 'Decline' : 'Buy 1 Reed for 2 Food', exact: true }).click()
  }
  await expect.poll(async () => (await state(pages[3]!)).interaction.request?.kind).toBe('confirm-player-switch')
  await pages[3]!.locator('.interaction-bar').getByRole('button', { name: /Confirm/i }).click()
  await expect(pages[0]!.locator('.interaction-bar').getByRole('button', { name: 'PlayerC', exact: true })).toBeVisible()
  await pages[0]!.locator('.interaction-bar').getByRole('button', { name: 'PlayerC', exact: true }).click()
  for (const page of pages) {
    await expect.poll(async () => (await state(page)).state.players[0]!.resources.reed).toBe(0)
    await expect.poll(async () => (await state(page)).state.players[2]!.resources.reed).toBe(1)
    expect((await state(page)).state.players[1]!.resources.food).toBe(3)
  }
  await pages[0]!.screenshot({ path: '/tmp/oa-893-seller.png' })

  game.round = 4
  game.players[0].resources.food = 1
  game.players[0].resources.grain = 1
  game.players[0].resources.reed = 1
  game.players[0].minorPlayed = ['D025_WitchesDanceFloor']
  game.players[0].cardStates.D025_WitchesDanceFloor = { extraData: { cardFieldStacks: [
    { crop: 'grain', remaining: 3, below: [{ crop: 'vegetable', remaining: 1 }] },
  ] } }
  for (const space of game.actionSpaces) space.takenBy = []
  for (const player of game.players) {
    for (const worker of player.workers.filter((entry: { isActive: boolean }) => entry.isActive)) {
      game.actionSpaces[0].takenBy.push({ playerId: player.id, workerId: worker.id })
    }
  }
  await pages[0]!.evaluate((gameState) => {
    const socket = (window as unknown as { auditSocket: WebSocket }).auditSocket
    socket.send(JSON.stringify({ type: 'loadGame', state: gameState, requestId: 'audit-feed-setup' }))
  }, game)
  await expect.poll(async () => (await state(pages[0]!)).state.players[0]!.resources.reed).toBe(1)
  const cropLayers = pages[0]!.locator('.field-crop[aria-label="Vegetable 1 · Grain 3"]')
  await expect(cropLayers).toBeVisible()
  await expect(cropLayers.locator('.field-crop-icon.res-icon-vegetable')).toHaveCount(1)
  await expect(cropLayers.locator('.field-crop-icon.res-icon-grain')).toHaveCount(3)
  await cropLayers.screenshot({ path: '/tmp/oa-893-card-field-layers.png' })
  await pages[0]!.evaluate(() => (window as unknown as { auditSocket: WebSocket }).auditSocket.send(JSON.stringify({ type: 'roundEnd', requestId: 'audit-harvest' })))
  for (let step = 0; step < 12; step++) {
    await expect.poll(async () => (await state(pages[0]!)).interaction.stateId).toBe('wait')
    const interaction = (await state(pages[0]!)).interaction
    if (interaction.request.kind === 'feed') break
    const actor = pages[interaction.playerIndex]!
    const previous = JSON.stringify(interaction)
    await actor.locator('.interaction-bar').getByRole('button', { name: /Skip|Decline/i }).first().click()
    await expect.poll(async () => JSON.stringify((await state(pages[0]!)).interaction)).not.toBe(previous)
  }
  await expect.poll(async () => (await state(pages[0]!)).interaction.request.kind).toBe('feed')
  await expect(pages[0]!.getByRole('button', { name: 'Reed Seller: Sell 1 Reed' })).toBeVisible()
  await pages[0]!.getByRole('button', { name: 'Reed Seller: Sell 1 Reed' }).click()
  for (const index of [1, 2, 3]) {
    const previous = pages[index - 1]!
    await expect.poll(async () => (await state(previous)).interaction.request.kind).toBe('confirm-player-switch')
    await previous.locator('.interaction-bar').getByRole('button', { name: /Confirm/i }).click()
    await pages[index]!.getByRole('button', { name: 'Decline', exact: true }).click()
  }
  const last = (await state(pages[3]!)).interaction
  if (last.request.kind === 'confirm-player-switch') await pages[3]!.locator('.interaction-bar').getByRole('button', { name: /Confirm/i }).click()
  await expect.poll(async () => (await state(pages[0]!)).interaction.request.kind).toBe('feed')
  await expect.poll(async () => (await state(pages[0]!)).state.players[0]!.resources.food).toBe(3)
  await pages[0]!.screenshot({ path: '/tmp/oa-893-feeding-resumed.png' })
  await pages[0]!.locator('.exchange-confirm').click()
  await expect.poll(async () => (await state(pages[0]!)).state.players[0]!.resources.food).toBe(0)
  expect((await state(pages[0]!)).state.players[0]!.resources.begging).toBe(0)

  for (const cardId of ['M062_HearthBrush', 'M063_PastoralLetter']) {
    const createdMoor = await request.post(`${BACKEND_URL}/api/game/new`, {
      data: { seed: 89362, maxPlayers: 4, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
    })
    const moor = (await createdMoor.json()).state
    moor.round = 5
    for (const player of moor.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      Object.assign(player.resources, { reed: 10, clay: 10, stone: 10, wood: 10, food: 10 })
    }
    moor.players[0].minorHand = [cardId]
    moor.players[0].improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    await pages[0]!.evaluate((gameState) => {
      ;(window as unknown as { auditSocket: WebSocket }).auditSocket.send(JSON.stringify({ type: 'loadGame', state: gameState, requestId: 'audit-supply-setup' }))
    }, moor)
    await expect(pages[0]!.getByRole('button', { name: /^Improvement 1/ })).toBeEnabled()
    await pages[0]!.getByRole('button', { name: /^Improvement 1/ }).click()
    const cardName = cardId === 'M062_HearthBrush' ? 'Hearth Brush' : 'Pastoral Letter'
    await pages[0]!.locator('.interaction-bar').getByRole('button', { name: new RegExp(cardName) }).click()
    await expect(pages[0]!.locator('.interaction-bar').getByRole('button', { name: `Do not use ${cardName}`, exact: true })).toBeVisible()
    await pages[0]!.locator('.interaction-bar').getByRole('button', { name: `Do not use ${cardName}`, exact: true }).click()
    await expect.poll(async () => (await state(pages[0]!)).interaction.request.kind).toBe('confirm-next-player')
    await pages[0]!.screenshot({ path: `/tmp/oa-893-${cardId}-declined.png` })
  }
  const craftGame = structuredClone(game)
  craftGame.players[0].occupationPlayed = []
  craftGame.players[0].minorPlayed = []
  craftGame.players[0].cardStates = {}
  craftGame.players[0].improvements = ['Major_Joinery']
  craftGame.players[0].resources.wood = 1
  craftGame.players[0].resources.food = 10
  await pages[0]!.evaluate((gameState) => {
    ;(window as unknown as { auditSocket: WebSocket }).auditSocket.send(JSON.stringify({ type: 'loadGame', state: gameState, requestId: 'audit-craft-setup' }))
  }, craftGame)
  await expect.poll(async () => (await state(pages[0]!)).state.players[0]!.resources.wood).toBe(1)
  await pages[0]!.evaluate(() => (window as unknown as { auditSocket: WebSocket }).auditSocket.send(JSON.stringify({ type: 'roundEnd', requestId: 'audit-craft-harvest' })))
  const declineCraft = pages[0]!.locator('.interaction-bar').getByRole('button', { name: 'Do not use Joinery', exact: true })
  await expect(declineCraft).toBeVisible()
  await declineCraft.click()
  await expect(declineCraft).toHaveCount(0)
  expect((await state(pages[0]!)).state.players[0]!.resources.wood).toBe(1)
  for (const page of pages) await page.close()
})
