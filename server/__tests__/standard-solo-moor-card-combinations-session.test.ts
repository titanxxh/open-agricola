import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import { readScheduledOffers, writeScheduledOffers } from '../../shared/actions/effects/internal/scheduled-offers'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, acceptCard, chooseCardAction, restore, TERRAIN_CARD } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'

const IMPLEMENT = 'M054_AgriculturalImplement'
const RIGHTS = 'M056_PeatCuttingRights'
const TAPS = 'M057_Taps'
const SOWING = 'M060_SowingMachine'
const evidence = createScenarioEvidence(import.meta.url)
const schedule = (state: GameState, dueRound: number) => writeScheduledOffers(state.players[0]!, RIGHTS, [
  { id: `${RIGHTS}-${dueRound}`, kind: 'moor-special-action', dueRound, actionId: 'cut-peat', cost: {}, consumed: false },
])
const drawOrder = (session: GameSession) => session.state.farmersOfTheMoor!.specialActionCards
  .filter(card => card.location.kind === 'solo-draw')
  .sort((a, b) => (a.location.kind === 'solo-draw' ? a.location.order : 0) - (b.location.kind === 'solo-draw' ? b.location.order : 0))
  .map(card => card.id)
const passExchanges = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger'; step++) {
    expect(response.interaction.request.options.filter(option => option.value !== '__pass__' && !option.disabled)
      .every(option => option.labelKey === 'actions.exchange.name')).toBe(true)
    response = session.resolveChoice(response.interaction.playerIndex, '__pass__')
  }
  return response
}

describe('one solo supply shared by the three Moor card opportunities', () => {
  it('uses Rights then Implement without allowing Taps to draw a third card, including retention and real after recovery', () => {
    const original = evidence.track(work({ playerCount: 1, round: 6, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [IMPLEMENT, RIGHTS, TAPS, SOWING]
      Object.assign(player.resources, { food: 20, fuel: 0, grain: 1, horse: 2 })
      player.farmTerrain!.push({ row: 2, col: 1, kind: 'moor' }, { row: 2, col: 2, kind: 'moor' })
      player.pastures = [{ id: 'combo-horses', tiles: [{ row: 1, col: 3 }, { row: 1, col: 4 }], animalType: 'horse', animalCount: 2 }]
      player.fenceSegments = ['H-1-3', 'H-1-4', 'H-2-3', 'H-2-4', 'V-1-3', 'V-1-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      schedule(state, 7)
      let order = 1
      for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = { kind: 'solo-draw', order: card.id === TERRAIN_CARD ? 0 : order++ }
    } }))
    confirmNext(original, original.takeAction(0, 'grain-seeds'))
    let response = confirmNext(original, original.takeAction(0, 'clay-pit'))
    expect(response.state.round).toBe(7)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      const source = getChoiceOptions(response).find(option => option.sourceCard === RIGHTS)!
      response = original.resolveChoice(0, source.value)
    }
    if (!getChoiceOptions(response).some(option => option.value.startsWith('offer:'))) response = acceptCard(original, response, RIGHTS)
    const due = ['offer', `${RIGHTS}-7`, 'moor', TERRAIN_CARD, 'cut-peat', 2, 0].join(':')
    expect(getChoiceOptions(response)).toContainEqual(expect.objectContaining({ value: due }))
    const draw = drawOrder(original)
    response = original.resolveChoice(0, due)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    let session = evidence.track(restore(original))
    response = session.resolveChoice(0, 'retain')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: SOWING })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 18, fuel: 3 })
    session = evidence.track(restore(session))
    response = passExchanges(session, session.resolveChoice(0, '__skip__'))
    expect(response.state.roundPhase).toBe('work')
    expect(readScheduledOffers(session.state.players[0]!, RIGHTS)[0]).toMatchObject({ consumed: true, consumedRound: 7 })
    session.takeAction(0, 'farmland')
    response = acceptCard(session, session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }), IMPLEMENT)
    response = chooseCardAction(session, response, IMPLEMENT, TERRAIN_CARD, 'cut-peat', { row: 2, col: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: SOWING })
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 18, fuel: 6 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-discard')
    expect(drawOrder(session)).toEqual(draw)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    confirmNext(session, response)
    response = session.takeAction(0, 'day-laborer')
    expect(session.withCtx(() => hasPendingExtraTurn(session.state, session.state.players[0]!))).toBe(false)
    expect(response.state.players[0]!.cardStates[TAPS]?.extraData?.usedThisRound).not.toBe(true)
    response = confirmNext(session, response)
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources.fuel).toBe(6)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 2, col: 2, kind: 'moor' })
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat'))
      .toEqual([expect.objectContaining({ sourceCardId: RIGHTS }), expect.objectContaining({ sourceCardId: IMPLEMENT })])
    expect(drawOrder(session)).toEqual(draw)
    for (let attempt = 0; attempt < 2; attempt++) {
      assertRejectedUnchanged(session, () => session.takeSpecialAction(0, TERRAIN_CARD, 'cut-peat', { tile: { row: 2, col: 2 } }))
      assertRejectedUnchanged(session, () => session.resolveChoice(0, ['offer', `${RIGHTS}-7`, 'moor', TERRAIN_CARD, 'cut-peat', 2, 2].join(':')))
    }
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'fields', quantity: 2, total: 1 }))
    evidence.record('two shared uses before ordinary harvest continuation', response)
  })

  it('also prevents a third use after an ordinary action followed by the last-worker Implement action', () => {
    const session = evidence.track(work({ playerCount: 1, round: 7, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [IMPLEMENT, RIGHTS, TAPS]
      Object.assign(player.resources, { food: 4, fuel: 0 })
      player.farmTerrain!.push({ row: 2, col: 1, kind: 'moor' }, { row: 2, col: 2, kind: 'moor' })
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: '1' }]
      schedule(state, 10)
    } }))
    const draw = drawOrder(session)
    let response = session.takeSpecialAction(0, TERRAIN_CARD, 'cut-peat', { tile: { row: 2, col: 0 } })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    response = session.resolveChoice(0, 'retain')
    confirmNext(session, response)
    session.takeAction(0, 'farmland')
    response = acceptCard(session, session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }), IMPLEMENT)
    response = chooseCardAction(session, response, IMPLEMENT, TERRAIN_CARD, 'cut-peat', { row: 2, col: 1 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 6 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-discard')
    expect(session.withCtx(() => hasPendingExtraTurn(session.state, session.state.players[0]!))).toBe(false)
    expect(readScheduledOffers(session.state.players[0]!, RIGHTS)[0]!.consumed).toBe(false)
    expect(drawOrder(session)).toEqual(draw)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
  })

  it('keeps a genuine Tool Shed grant separate from the outer current-card use', () => {
    const shed = 'M055_ToolShed'
    const session = evidence.track(work({ playerCount: 1, configure(state) {
      state.players[0]!.minorPlayed = [shed]
      Object.assign(state.players[0]!.resources, { food: 4, fuel: 0 })
    } }))
    const draw = drawOrder(session)
    let response = session.takeSpecialAction(0, TERRAIN_CARD, 'slash-and-burn', { tile: { row: 0, col: 0 } })
    response = acceptCard(session, response, shed)
    const cut = getChoiceOptions(response).find(option => option.value === 'action:cut-peat:2:0')
    if (cut) response = session.resolveChoice(0, cut.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.state.players[0]!.farmTerrain).toEqual([])
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention', currentCardId: TERRAIN_CARD } } })
    response = session.resolveChoice(0, 'retain')
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-current')
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat'))
      .toEqual([expect.objectContaining({ sourceCardId: shed })])
    expect(drawOrder(session)).toEqual(draw)
    assert.ok(response.state.players[0]!.cardStates[shed]?.counters?.usage === response.state.round)
  })
})
