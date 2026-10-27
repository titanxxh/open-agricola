import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { readScheduledOffers, writeScheduledOffers } from '../../shared/actions/effects/internal/scheduled-offers'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, acceptCard, buyMinor, finishHarvest, openMinor, restore, TERRAIN_CARD, HORSE_CARD } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'

const CARD = 'M056_PeatCuttingRights'
const evidence = createScenarioEvidence(import.meta.url)
const schedule = (state: GameState, due: number, later = due + 3) => writeScheduledOffers(state.players[0]!, CARD,
  [due, later].map(dueRound => ({ id: `${CARD}-${dueRound}`, kind: 'moor-special-action', dueRound, actionId: 'cut-peat', cost: {}, consumed: false })))
const offers = (session: GameSession) => readScheduledOffers(session.state.players[0]!, CARD)
const currentFromDraw = (state: GameState) => {
  let order = 1
  for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = { kind: 'solo-draw', order: card.id === TERRAIN_CARD ? 0 : order++ }
}
const reachOffer = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const source = response.interaction.request.options.find(option => option.sourceCard === CARD)
    assert.ok(source, JSON.stringify(response.interaction))
    response = session.resolveChoice(response.interaction.playerIndex, source.value)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD, request: { kind: 'choice' } })
  if (!getChoiceOptions(response).some(option => option.value.startsWith('offer:'))) response = acceptCard(session, response, CARD)
  expect(getChoiceOptions(response).some(option => option.value.startsWith('offer:'))).toBe(true)
  return response
}
const choosePeat = (session: GameSession, response: SessionResponse, due: number, row = 2, col = 0) => {
  response = reachOffer(session, response)
  const value = ['offer', `${CARD}-${due}`, 'moor', TERRAIN_CARD, 'cut-peat', row, col].join(':')
  expect(getChoiceOptions(response)).toContainEqual(expect.objectContaining({ value }))
  assert.ok(response.interaction.stateId === 'wait')
  return session.resolveChoice(response.interaction.playerIndex, value)
}
const nextRound = (session: GameSession, round: number) => {
  confirmNext(session, session.takeAction(0, 'grain-seeds'))
  const action = session.takeAction(0, 'clay-pit')
  expect(action.state.round).toBe(round - 1)
  let response = finishHarvest(session, confirmNext(session, action), round)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
    && response.interaction.request.moorSolo?.window === 'preparation') response = session.resolveChoice(0, 'keep')
  return response
}

describe('Peat-Cutting Rights adopted current-card interpretation', () => {
  it.each([{ round: 1, due: [5, 8] }, { round: 10, due: [14] }, { round: 11, due: [] }])('buys with a real horse in round $round and schedules only $due', ({ round, due }) => {
    const session = evidence.track(work({ round, seed: 6056, configure(state) {
      const player = state.players[0]!
      player.minorHand = [CARD]
      player.resources.horse = 1
      player.houseAnimals = { '2-3': 'horse' }
      player.resources.fuel = 0
    } }))
    const response = buyMinor(session, CARD)
    expect(response.state.players[0]!.minorPlayed).toEqual([CARD])
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(offers(session).map(offer => offer.dueRound)).toEqual(due)
    expect(offers(session).every(offer => offer.kind === 'moor-special-action' && offer.actionId === 'cut-peat' && !offer.consumed)).toBe(true)
    expect(response.state.events.some(event => event.type === 'farm.terrainChanged' || (event.type === 'resource.moved' && event.resources.fuel))).toBe(false)
  })

  it('prepares the current card before a due action, allowing sick people without placing or curing them', () => {
    const original = evidence.track(work({ playerCount: 1, round: 4, seed: 6056, configure(state) {
      state.players[0]!.minorPlayed = [CARD]
      state.players[0]!.resources.fuel = 0
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
      schedule(state, 5, 8)
      currentFromDraw(state)
    } }))
    confirmNext(original, original.takeAction(0, 'grain-seeds'))
    let response = finishHarvest(original, confirmNext(original, original.takeAction(0, 'fishing')), 5)
    response = reachOffer(original, response)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location).toEqual({ kind: 'solo-current' })
    expect(response.state.roundPhase).toBe('preparation')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 16, grain: 1, fuel: 0 })
    expect(response.state.players[0]!.sickWorkerIds?.toSorted()).toEqual(['1', '2'])
    const sick = [...response.state.players[0]!.sickWorkerIds!]
    const session = evidence.track(restore(original))
    const hidden = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-draw')!
    for (const value of [
      ['offer', `${CARD}-5`, 'moor', hidden.id, 'cut-peat', 2, 0].join(':'),
      ['offer', `${CARD}-5`, 'moor', TERRAIN_CARD, 'cut-peat', 2, 4].join(':'),
    ]) for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, value))
    response = choosePeat(session, session.getState(), 5)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 16, fuel: 3 })
    expect(response.state.players[0]!.sickWorkerIds).toEqual(sick)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    const retained = evidence.track(restore(session))
    response = retained.resolveChoice(0, 'discard')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.roundPhase).toBe('work')
    expect(offers(retained)).toEqual([
      expect.objectContaining({ dueRound: 5, consumed: true, consumedRound: 5 }),
      expect.objectContaining({ dueRound: 8, consumed: false }),
    ])
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-discard')
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === CARD)).toEqual([])
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(2)
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'grains', quantity: 1, total: 1 }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { fuel: 3 } }) }) }))
    const completed = evidence.track(restore(retained))
    assertRejectedUnchanged(completed, () => completed.takeSpecialAction(0, TERRAIN_CARD, 'cut-peat', { tile: { row: 2, col: 0 } }))
    expect(offers(completed)[0]!.consumed).toBe(true)
    evidence.record('due opportunity consumed before work', completed.getState())
  })

  it('cannot be purchased without a real horse', () => {
    const session = evidence.track(work({ configure(state) { state.players[0]!.minorHand = [CARD] } }))
    const response = openMinor(session)
    expect(getChoiceOptions(response).some(option => option.value === CARD)).toBe(false)
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    expect(offers(session)).toEqual([])
  })

  it.each(['wrong-card', 'no-terrain', 'decline', 'disabled', 'consumed', 'expired'])('expires or preserves the correct offer without an independent grant when %s', mode => {
    const session = evidence.track(work({ playerCount: 1, round: 6, moor: mode !== 'disabled', configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.resources.fuel = 0
      schedule(state, 7, 10)
      if (mode === 'no-terrain') player.farmTerrain = []
      if (mode === 'wrong-card') {
        let order = 1
        for (const card of state.farmersOfTheMoor!.specialActionCards) card.location = card.id === HORSE_CARD
          ? { kind: 'solo-current' } : { kind: 'solo-draw', order: card.id === TERRAIN_CARD ? 0 : order++ }
      }
      if (mode === 'consumed' || mode === 'expired') writeScheduledOffers(player, CARD, [
        { id: `${CARD}-${mode === 'expired' ? 5 : 7}`, kind: 'moor-special-action', dueRound: mode === 'expired' ? 5 : 7,
          actionId: 'cut-peat', cost: {}, consumed: true, consumedRound: mode === 'expired' ? 5 : 7 },
        { id: `${CARD}-10`, kind: 'moor-special-action', dueRound: 10, actionId: 'cut-peat', cost: {}, consumed: false },
      ])
    } }))
    let response = nextRound(session, 7)
    if (mode === 'decline') {
      response = reachOffer(session, response)
      expect(getChoiceOptions(response)).toContainEqual(expect.objectContaining({ value: '__skip__' }))
      response = session.resolveChoice(0, '__skip__')
    }
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger'; step++) {
      const options = response.interaction.request.options
      expect(options.filter(option => option.value !== '__pass__' && !option.disabled)
        .every(option => option.labelKey === 'actions.exchange.name')).toBe(true)
      response = session.resolveChoice(response.interaction.playerIndex, '__pass__')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('idle')
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat')).toBe(false)
    expect(offers(session)[0]!.consumed).toBe(true)
    expect(offers(session)[0]!.consumedRound).toBe(mode === 'expired' ? 5 : 7)
    expect(offers(session)[1]).toMatchObject({ dueRound: 10, consumed: false })
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'fields', quantity: 1, total: -1 }))
  })

  it('shares one retention payment and the second use with ordinary work in the due round', () => {
    const session = evidence.track(work({ playerCount: 1, round: 6, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      Object.assign(player.resources, { food: 4, fuel: 0 })
      player.farmTerrain!.push({ row: 2, col: 1, kind: 'moor' })
      schedule(state, 7, 10)
      currentFromDraw(state)
    } }))
    let response = choosePeat(session, nextRound(session, 7), 7)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    response = session.resolveChoice(0, 'retain')
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 3 })
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(true)
    expect(offers(session)[0]).toMatchObject({ dueRound: 7, consumed: true })
    response = session.takeSpecialAction(0, TERRAIN_CARD, 'cut-peat', { tile: { row: 2, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 6 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-discard')
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
  })

  it('uses the ordinary before lifecycle for a due opportunity and restores it before execution', () => {
    const before = 'M112_PeatAshFertilizer'
    const original = evidence.track(work({ playerCount: 1, round: 6, configure(state) {
      state.players[0]!.minorPlayed = [CARD, before]
      state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }]
      state.players[0]!.resources.fuel = 0
      schedule(state, 7)
    } }))
    let response = choosePeat(original, nextRound(original, 7), 7)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: before })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    const session = evidence.track(restore(original))
    response = acceptCard(session, session.getState(), before)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    response = session.resolveChoice(0, 'discard')
    expect(response.state.roundPhase).toBe('work')
    const growth = response.state.events.find(event => event.type === 'farm.cropAdded' && event.sourceCardId === before)!
    const peat = response.state.events.find(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat')!
    assert.ok(growth, JSON.stringify(response.state.events.filter(event => event.type === 'farm.cropAdded')))
    expect(growth.seq).toBeLessThan(peat.seq)
  })

  it('keeps the independent second due round after the first opportunity was declined', () => {
    const session = evidence.track(work({ playerCount: 1, round: 7, configure(state) {
      state.players[0]!.minorPlayed = [CARD]
      writeScheduledOffers(state.players[0]!, CARD, [
        { id: `${CARD}-5`, kind: 'moor-special-action', dueRound: 5, actionId: 'cut-peat', cost: {}, consumed: true, consumedRound: 5 },
        { id: `${CARD}-8`, kind: 'moor-special-action', dueRound: 8, actionId: 'cut-peat', cost: {}, consumed: false },
      ])
    } }))
    let response = choosePeat(session, nextRound(session, 8), 8)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 14, fuel: 11 })
    response = session.resolveChoice(0, 'discard')
    expect(response.state.roundPhase).toBe('work')
    expect(offers(session)).toEqual([
      expect.objectContaining({ dueRound: 5, consumed: true, consumedRound: 5 }),
      expect.objectContaining({ dueRound: 8, consumed: true, consumedRound: 8 }),
    ])
  })

  it('retains real two-player preparation ownership and the ordinary borrowing fee', () => {
    const session = evidence.track(work({ round: 6, configure(state) {
      for (const [index, player] of state.players.entries()) {
        player.startPlayer = index === 1
        player.minorPlayed = [CARD]
        Object.assign(player.resources, { food: index === 0 ? 2 : 0, fuel: 0 })
        writeScheduledOffers(player, CARD, [{ id: `${CARD}-7`, kind: 'moor-special-action', dueRound: 7,
          actionId: 'cut-peat', cost: {}, consumed: false }])
      }
    } }))
    for (const [actor, space] of [[0, 'grain-seeds'], [1, 'forest'], [0, 'clay-pit']] satisfies Array<[number, string]>) {
      confirmNext(session, session.takeAction(actor, space))
    }
    let response = confirmNext(session, session.takeAction(1, 'day-laborer'))
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
      response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    }
    response = reachOffer(session, response)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1 })
    response = choosePeat(session, response, 7)
    expect(response.state.players[1]!.resources).toMatchObject({ fuel: 3, food: 2 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location)
      .toEqual({ kind: 'playerFaceUp', playerId: 'p2' })
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
      response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    }
    response = choosePeat(session, response, 7)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 3, food: 0 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location)
      .toEqual({ kind: 'playerFaceDown', playerId: 'p1' })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.resources.food === 2)).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice' ? response.interaction.request.moorSolo : undefined).toBeUndefined()
  })
})
