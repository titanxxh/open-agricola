import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

const CARD_ID = 'B037_Grange'

describe('B037 Grange prerequisites', () => {
  it.each([
    { fields: 6, missing: '', cardField: false, reserveOnly: false, allowed: true },
    { fields: 5, missing: '', cardField: true, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'sheep', cardField: false, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'boar', cardField: false, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'cattle', cardField: false, reserveOnly: false, allowed: false },
    { fields: 6, missing: 'cattle', cardField: false, reserveOnly: true, allowed: false },
  ])('requires six farmyard fields and placed animals: $fields/$missing/$reserveOnly', (scenario) => {
    const session = new GameSession(8037, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
    }
    const owner = state.players[0]!
    owner.minorHand = [CARD_ID]
    owner.minorPlayed = scenario.cardField ? ['B068_Beanfield'] : []
    owner.resources.food = 0
    owner.fields = Array.from({ length: scenario.fields }, (_, index) => ({
      row: Math.floor(index / 3), col: index % 3 + 2, stacks: [],
    }))
    owner.pastures = (['sheep', 'boar', 'cattle'] as const).map((animal, index) => ({
      id: `grange-${animal}`, size: 1, tiles: [{ row: index, col: 1 }], stables: 0,
      animalType: animal === scenario.missing ? null : animal,
      animalCount: animal === scenario.missing ? 0 : 1,
    }))
    for (const animal of ['sheep', 'boar', 'cattle'] as const) {
      owner.resources[animal] = animal !== scenario.missing || scenario.reserveOnly ? 1 : 0
    }
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait'; step++) {
      const option = response.interaction.request.options?.find((candidate) =>
        candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'))
      if (!option) break
      response = session.resolveChoice(0, option.value)
    }

    expect(response.state.players[0]!.minorPlayed.includes(CARD_ID)).toBe(scenario.allowed)
    expect(response.state.players[0]!.resources.food).toBe(scenario.allowed ? 1 : 0)
    if (scenario.allowed) {
      expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
        .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 3 }))
    } else {
      const before = JSON.stringify(response.state)
      const rejected = session.resolveChoice(0, CARD_ID)
      expect(rejected.ok).toBe(false)
      expect(JSON.stringify(rejected.state)).toBe(before)
    }
  })
})
