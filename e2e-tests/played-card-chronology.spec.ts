import { expect, test, type Page } from '@playwright/test'
import type { SessionResponse } from '../server/game/authoritative-session'
import { createWorkSession } from '../server/__tests__/_helpers/session-fixtures'
import { serializeState } from '../shared/session/serialization'
import { BACKEND_URL } from './fixtures'

const expectedOrder = ['occupation:A110_Roughcaster', 'minor:E047_SyrupTap', 'occupation:A116_WoodCutter', 'major:Major_Fireplace1']

const playedScenario = () => {
  const session = createWorkSession({ seed: 1371, configure: state => {
    const player = state.players[0]!
    player.occupationHand = ['A110_Roughcaster', 'A116_WoodCutter']
    player.minorHand = ['E047_SyrupTap']
    Object.assign(player.resources, { food: 100, clay: 20, wood: 20, stone: 20 })
    state.players[1]!.resources.food = 100
    state.actionSpaces.find(space => space.id === 'major-improvement')!.roundAvailable = 1
  } })
  const ok = (response: SessionResponse) => {
    expect(response.ok, response.error).toBe(true)
    return response
  }
  const ready = () => {
    let response = session.getState()
    while (response.interaction.stateId === 'wait') {
      const request = response.interaction.request
      expect(['confirm-next-player', 'confirm-player-switch']).toContain(request.kind)
      response = ok(session.resolveChoice(request.kind === 'confirm-next-player' ? request.nextPlayerIndex : response.interaction.playerIndex, 'confirm'))
    }
    return response.state.currentPlayerIndex
  }
  const play = (space: string, cardId: string) => {
    let response = ok(session.takeAction(ready(), space))
    for (let step = 0; step < 8 && !response.state.events.some(event => event.type === 'card.played' && event.cardId === cardId); step++) {
      if (response.interaction.stateId !== 'wait') throw new Error(`Expected selection for ${cardId}`)
      const options = response.interaction.request.options ?? []
      const selection = options.find(option => option.value === cardId)
        ?? options.find(option => option.value.startsWith('action-improvement-'))
      if (!selection) throw new Error(`No purchase option for ${cardId}`)
      response = ok(session.resolveChoice(response.interaction.playerIndex, selection.value))
    }
    expect(response.state.events.some(event => event.type === 'card.played' && event.cardId === cardId)).toBe(true)
  }
  try {
    play('lessons', 'A110_Roughcaster')
    ok(session.takeAction(ready(), 'forest'))
    play('meeting-place', 'E047_SyrupTap')
    ok(session.takeAction(ready(), 'reed-bank'))
    play('lessons', 'A116_WoodCutter')
    ok(session.takeAction(ready(), 'forest'))
    play('major-improvement', 'Major_Fireplace1')
    expect(session.state.events.filter(event => event.type === 'card.played').map(event => event.cardId))
      .toEqual(['A110_Roughcaster', 'E047_SyrupTap', 'A116_WoodCutter', 'Major_Fireplace1'])
    return session.withCtx(() => serializeState(session.state, { actionHooks: session.actionHooks }))
  } finally { session.dispose() }
}

const assertCardOrder = async (page: Page) => {
  const cards = page.locator('.game-layout__center .played-cards > .played-row > .played-card-slot')
  await expect(cards).toHaveCount(4)
  expect(await cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-played-card-key'))))
    .toEqual(expectedOrder)
  for (const card of await cards.all()) await expect(card.locator('[data-card-anchor]')).toBeVisible()
  const positions = await cards.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y }
  }))
  for (let index = 1; index < positions.length; index++) {
    const previous = positions[index - 1]!
    const current = positions[index]!
    expect(current.y > previous.y || current.y === previous.y && current.x > previous.x).toBe(true)
  }
}

for (const viewport of [{ width: 1920, height: 1080 }, { width: 390, height: 844 }]) {
  test(`mixed played cards retain authoritative chronology after reload at ${viewport.width}px`, async ({ page, request }) => {
    await page.setViewportSize(viewport)
    expect((await request.post(`${BACKEND_URL}/api/game/new-sandbox`, {
      data: { seed: 1371, playerCount: 2, customCardIds: [] },
    })).ok()).toBe(true)
    const state = playedScenario()
    expect(state.players[0]?.playedCardChronology).toEqual(expectedOrder)
    expect((await request.post(`${BACKEND_URL}/api/game/load`, { data: { state } })).ok()).toBe(true)
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en'))
    await page.goto('/?page=game&player=p1&embedded=1&devMode=1')
    await assertCardOrder(page)
    await page.reload()
    await assertCardOrder(page)
    await page.locator('.game-layout__center .played-cards').screenshot({ path: `output/playwright/played-card-chronology-${viewport.width}.png` })
  })
}
