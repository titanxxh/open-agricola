import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, buyMinor, openMinor, restore } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, getChoiceOptions, undoRuleSnapshot } from './_helpers/session-assertions'
import type { GameSession, SessionResponse } from '../game/authoritative-session'

const CARD = 'E066_BarnShed'
const OCCUPATIONS = ['A085_Homekeeper', 'A087_Conservator', 'A092_AdoptiveParents']
const evidence = createScenarioEvidence(import.meta.url)
const make = (playerCount = 1, played = false, wood = 2, occupations = 3) => evidence.track(work({ playerCount, moor: false, seed: 6066, configure(state) {
  state.players[0]!.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  state.players[0]!.resources.wood = wood
  if (played) state.players[0]!.minorPlayed = [CARD]
  else state.players[0]!.minorHand = [CARD]
  state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = playerCount === 1 ? 2 : 3
} }))
const finishSwitches = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
    response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

describe('Barn Shed printed solo Forest exception', () => {
  it('buys for two wood and grants exactly one grain on the sole owner Forest use through recovery and undo', () => {
    const original = make()
    const bought = buyMinor(original, CARD)
    expect(bought.state.players[0]!.resources.wood).toBe(0)
    expect(bought.state.players[0]!.minorPlayed).toEqual([CARD])
    expect(bought.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: CARD, resources: { wood: 2 } }))
    confirmNext(original, bought)
    const before = undoRuleSnapshot(original.getState())
    const score = original.getState().scores![0]!.total
    let response = original.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, grain: 1 })
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD))
      .toEqual([expect.objectContaining({ resources: { grain: 1 }, to: { kind: 'player', playerId: 'p1' } })])
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardEffectGain', params: expect.objectContaining({ cardId: CARD, gain: { grain: 1 } }) }))
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'grains', quantity: 1, total: 1 }))
    expect(response.scores![0]!.total - score).toBe(2)
    const session = evidence.track(restore(original))
    assertUndoRestored(before, session.undoAction())
    response = session.takeAction(0, 'forest')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, grain: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD)).toHaveLength(1)
  })

  it.each([0, 1])('keeps the multiplayer opponent rule for actual Forest actor %i', actor => {
    const session = make(2, true, 0)
    if (actor === 1) confirmNext(session, session.takeAction(0, 'day-laborer'))
    const response = finishSwitches(session, session.takeAction(actor, 'forest'))
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[actor]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.resources.grain).toBe(actor === 1 ? 1 : 0)
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD)).toHaveLength(actor === 1 ? 1 : 0)
  })

  it.each([{ wood: 1, occupations: 3 }, { wood: 2, occupations: 2 }])('rejects a purchase with $wood wood and $occupations actual occupations', ({ wood, occupations }) => {
    const session = make(1, false, wood, occupations)
    const pending = openMinor(session)
    expect(getChoiceOptions(pending).some(option => option.value === CARD)).toBe(false)
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    expect(session.state.players[0]!.resources.wood).toBe(wood)
    expect(session.state.players[0]!.minorHand).toEqual([CARD])
  })

  it('does not reward Forest before purchase, an unrelated action or a card granting wood', () => {
    const held = make()
    const before = held.takeAction(0, 'forest')
    expect(before.ok, before.error).toBe(true)
    expect(before.state.players[0]!.resources.grain).toBe(0)
    const unrelated = make(1, true, 0)
    expect(unrelated.takeAction(0, 'day-laborer').state.players[0]!.resources.grain).toBe(0)
    const grant = evidence.track(work({ playerCount: 1, moor: false, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.minorHand = ['B004_WoodPile']
      state.actionSpaces.find(space => space.id === 'clay-pit')!.takenBy = [{ playerId: player.id, workerId: '1' }]
    } }))
    const response = buyMinor(grant, 'B004_WoodPile')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === CARD)).toBe(false)
    assert.ok(response.state.players[0]!.minorPlayed.includes(CARD))
  })
})
