import { expect, test } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

const CARD_ID = 'E027_PiggyBank'

test('Piggy Bank shows stored food after deposit, major redemption and browser reloads', async ({ page, request }) => {
  const fresh = await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
    data: { seed: 1294, playerCount: 2, customCardIds: [] },
  })
  expect(fresh.ok(), await fresh.text()).toBe(true)
  const fixture = createWorkSession({
    seed: 1294,
    configure: state => {
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0 })
      }
      const owner = state.players[0]!
      owner.minorPlayed = [CARD_ID]
      owner.resources.food = 1
      owner.cardStates[CARD_ID] = { counters: { food: 5 }, infobox: 'stale' }
      for (const [id, resource] of [['forest', 'wood'], ['clay-pit', 'clay'], ['reed-bank', 'reed']] as const) {
        state.actionSpaces.find(space => space.id === id)!.resources[resource] = 1
      }
    },
  })
  try {
    const loaded = await request.post(`${BACKEND_URL}/api/game/load`, {
      data: { state: fixture.withCtx(() => serializeState(fixture.state, {})) },
    })
    expect(loaded.ok(), await loaded.text()).toBe(true)
  } finally { fixture.dispose() }

  const command = async (path: string, data: object): Promise<SessionResponse> => {
    const response = await request.post(`${BACKEND_URL}/api/game/${path}`, { data })
    const payload: SessionResponse = await response.json()
    expect(payload.ok, payload.error).toBe(true)
    return payload
  }
  const confirmNext = (response: SessionResponse) => {
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind !== 'confirm-next-player') {
      throw new Error('Expected the ordinary work handoff')
    }
    return command('choice', { playerIndex: interaction.request.nextPlayerIndex, value: 'confirm' })
  }
  let response = await command('action', { playerIndex: 0, spaceId: 'grain-seeds' })
  for (const [playerIndex, spaceId] of [[1, 'forest'], [0, 'clay-pit'], [1, 'reed-bank']] as const) {
    await confirmNext(response)
    response = await command('action', { playerIndex, spaceId })
  }
  response = await confirmNext(response)
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') {
    throw new Error('Expected the work-end food deposit choice')
  }
  const deposit = interaction.request.options.find(option => !option.value.startsWith('__'))
  if (!deposit) throw new Error('Expected an enabled food deposit')

  await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
  await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
  const infobox = page.locator('.played-card-slot').filter({
    has: page.locator(`[data-card-anchor="${CARD_ID}"]`),
  }).locator('.card-infobox')
  await expect(infobox).toHaveText('5 / 6')
  await page.reload()
  await expect(infobox).toHaveText('5 / 6')
  const deposited = page.waitForResponse(result => result.url().endsWith('/api/game/choice'))
  await page.locator('.interaction-bar').locator(`[data-choice-value="${deposit.value}"]`).click()
  const stored: SessionResponse = await (await deposited).json()
  expect(stored.ok, stored.error).toBe(true)
  expect(stored.state.players[0]!.resources.food).toBe(0)
  await expect(infobox).toHaveText('6 / 6')
  await page.reload()
  await expect(infobox).toHaveText('6 / 6')

  const anytime = page.locator('.anytime-actions').getByRole('button', { name: /Piggy Bank/ })
  const activated = page.waitForResponse(result => result.url().endsWith('/api/game/anytime'))
  await anytime.click()
  expect((await (await activated).json()).ok).toBe(true)
  await page.reload()
  const purchased = page.waitForResponse(result => result.url().endsWith('/api/game/choice'))
  await page.locator('.interaction-bar [data-choice-value="Major_Joinery"]').click()
  const result: SessionResponse = await (await purchased).json()
  expect(result.ok, result.error).toBe(true)
  expect(result.state.players[0]!.improvements).toContain('Major_Joinery')
  expect(result.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, stone: 0 })
  await expect(infobox).toHaveText('0 / 6')
  await expect(anytime).toHaveCount(0)
  await page.reload()
  await expect(infobox).toHaveText('0 / 6')
  await expect(anytime).toHaveCount(0)
})
