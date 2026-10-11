import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import type { GameSyncPayload } from '../shared/contract/protocol/game'
import type { ReplaySegment } from '../shared/contract/protocol/replay'
import { BACKEND_URL, getJson, postJson } from './fixtures'

const CARD = 'B033_Mantlepiece'
const snapshot = async (request: APIRequestContext): Promise<GameSyncPayload> =>
  await getJson(request, `${BACKEND_URL}/api/game/state`)

const play = async (page: Page, request: APIRequestContext) => {
  await page.locator('[data-action-id="meeting-place"] button').first().click()
  await expect.poll(async () => (await snapshot(request)).interaction.stateId).toBe('wait')
  let state = await snapshot(request)
  for (let step = 0; step < 2 && !state.state.players[0]!.minorPlayed.includes(CARD); step++) {
    if (state.interaction.stateId !== 'wait' || state.interaction.request.kind !== 'choice') {
      throw new Error(`Expected improvement choice: ${JSON.stringify(state.interaction)}`)
    }
    const options = state.interaction.request.options
    const option = options.find(option => option.value === CARD)
      ?? options.find(option => option.value.startsWith('action-improvement-'))
    if (!option) throw new Error('Missing Mantlepiece option')
    state = await postJson(request, `${BACKEND_URL}/api/game/choice`, {
      playerIndex: state.interaction.playerIndex, value: option.value,
    })
    expect(state.ok).toBe(true)
  }
  expect(state.state.players[0]!.cardStates[CARD]?.counters?.bonusVp).toBe(1)
  await page.reload()
  await expect(page.locator('.game-layout')).toBeVisible()
  return state
}

for (const [locale, actionName] of [['en', 'Gain Bonus VP'], ['zh', '获得加分']] as const) {
  test(`new ${locale} bonus-vp logs stay singular across reload and distinct after undo`, async ({ page, request }) => {
    expect((await postJson(request, `${BACKEND_URL}/api/game/new-sandbox`, {
      seed: 1097, playerCount: 2, customCardIds: [],
    })).ok).toBe(true)
    const { state } = await snapshot(request)
    state.round = 13
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    state.players[0]!.minorHand = [CARD]
    state.players[0]!.houseType = 'clay'
    state.players[0]!.resources.stone = 1
    expect((await postJson(request, `${BACKEND_URL}/api/game/load`, { state })).ok).toBe(true)
    await page.addInitScript(locale => localStorage.setItem('open-agricola-locale-v2', locale), locale)
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await expect(page.locator('.game-layout')).toBeVisible()
    const first = await play(page, request)
    const rows = page.locator('.action-log__text').filter({ hasText: actionName })
    await expect(rows).toHaveCount(1)
    await page.reload()
    await expect(rows).toHaveCount(1)
    const oldTrigger = first.state.events.find(event => event.type === 'card.triggered' && event.cardId === CARD)!

    expect((await postJson(request, `${BACKEND_URL}/api/game/undo-action`)).ok).toBe(true)
    await page.reload()
    await expect(rows).toHaveCount(1)
    await expect(page.locator('.action-log__text--canceled').filter({ hasText: actionName })).toHaveCount(1)
    const second = await play(page, request)
    await expect(rows).toHaveCount(2)
    await expect(page.locator('.action-log__text--canceled').filter({ hasText: actionName })).toHaveCount(1)
    const newTrigger = second.state.events.find(event => event.type === 'card.triggered' && event.cardId === CARD)!
    expect(newTrigger.occurrenceId).not.toBe(oldTrigger.occurrenceId)
    expect(second.state.log.filter(log => log.key === 'log.cardTriggered' && log.params?.cardId === CARD))
      .toMatchObject([{ sourceEvent: { occurrenceId: newTrigger.occurrenceId, rowIndex: 0 } }])

    // A newly pinned completed archive must retain the relation in its Frame,
    // independently of Room History display metadata and current runtime objects.
    const completed = await request.post(`${BACKEND_URL}/api/test/replays/completed`, { data: { state: second.state } })
    expect(completed.status(), await completed.text()).toBe(201)
    const { roomId } = await completed.json() as { roomId: string }
    const segmentResponse = await request.get(`${BACKEND_URL}/api/v1/replays/${roomId}/segments/0`)
    expect(segmentResponse.ok()).toBe(true)
    const segment = await segmentResponse.json() as ReplaySegment
    const frame = segment.steps[0]!.frame
    expect(frame.events.find(event => event.occurrenceId === newTrigger.occurrenceId)).toBeDefined()
    expect(frame.log.find(log => log.key === 'log.cardTriggered' && log.params?.cardId === CARD)?.sourceEvent)
      .toEqual({ occurrenceId: newTrigger.occurrenceId, rowIndex: 0 })
  })
}
