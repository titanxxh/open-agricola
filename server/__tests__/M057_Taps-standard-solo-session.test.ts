import { describe, expect, it } from 'vitest'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, acceptCard, buyMinor, chooseCardAction, finishHarvest, openMinor, restore, TERRAIN_CARD } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'

const CARD = 'M057_Taps'
const evidence = createScenarioEvidence(import.meta.url)

describe('Taps shares the ordinary solo current-card lifecycle', () => {
  it('waits for the last worker, retains once and cannot use Taps twice before the next work phase', () => {
    const original = evidence.track(work({ playerCount: 1, seed: 6057, round: 7, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      Object.assign(player.resources, { food: 4, fuel: 0 })
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: '1' }]
    } }))
    expect(original.withCtx(() => hasPendingExtraTurn(original.state, original.state.players[0]!))).toBe(false)
    let response = original.takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources.food).toBe(6)
    expect(response.state.round).toBe(7)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    response = confirmNext(original, response)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD, request: { kind: 'choice' } })
    expect(response.state.events.some(event => event.type === 'harvest.started')).toBe(false)
    const session = evidence.track(restore(original))
    const hidden = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-draw')!
    const invalid = ['card-action', hidden.id, 'action', 'cut-peat', 2, 0].join(':')
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, invalid))
    response = chooseCardAction(session, session.getState(), CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 6, fuel: 3 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention', currentCardId: TERRAIN_CARD } } })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).not.toBe(true)
    const retained = evidence.track(restore(session))
    response = retained.resolveChoice(0, 'retain')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, fuel: 3 })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).toBe(true)
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(true)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-current')
    expect(retained.withCtx(() => hasPendingExtraTurn(retained.state, retained.state.players[0]!))).toBe(false)
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat')).toHaveLength(1)
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { fuel: 3 } }) }) }))
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'fields', quantity: 1, total: -1 }))
    const completed = evidence.track(restore(retained))
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(completed, () => completed.resolveChoice(0, CARD))
    response = finishHarvest(completed, confirmNext(completed, completed.getState()), 8)
    expect(response.state.events.filter(event => event.type === 'harvest.started')).toHaveLength(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'preparation', currentCardId: TERRAIN_CARD } } })
    response = completed.resolveChoice(0, 'keep')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).toBe(false)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-current')
    evidence.record('next work phase retains the known card', response)
  })

  it.each([1, 2])('requires two actual improvements before purchase, existing=%i', count => {
    const session = evidence.track(work({ configure(state) {
      state.players[0]!.minorPlayed = ['A032_Manger', 'E014_WoodSaw'].slice(0, count)
      state.players[0]!.minorHand = [CARD]
    } }))
    if (count === 2) {
      const response = buyMinor(session, CARD)
      expect(response.state.players[0]!.minorPlayed).toEqual(['A032_Manger', 'E014_WoodSaw', CARD])
      expect(response.state.players[0]!.resources).toMatchObject({ food: 20, fuel: 10 })
    } else {
      const response = openMinor(session)
      expect(getChoiceOptions(response).some(option => option.value === CARD)).toBe(false)
      for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
      expect(session.state.players[0]!.minorHand).toEqual([CARD])
    }
  })

  it.each(['no-current', 'discarded', 'no-terrain', 'hand', 'used'])('does not create an extra opportunity from %s', mode => {
    const session = evidence.track(work({ playerCount: 1, round: 5, configure(state) {
      const player = state.players[0]!
      Object.assign(player.resources, { food: 4, fuel: 0 })
      if (mode === 'hand') player.minorHand = [CARD]
      else player.minorPlayed = [CARD]
      if (mode === 'used') player.cardStates[CARD] = { extraData: { usedThisRound: true } }
      if (mode === 'no-terrain') player.farmTerrain = []
      const current = state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!
      if (mode === 'no-current') current.location = { kind: 'solo-draw', order: 9 }
      if (mode === 'discarded') current.location = { kind: 'solo-discard', order: 0 }
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: '1' }]
    } }))
    const action = session.takeAction(0, 'day-laborer')
    expect(action.ok, action.error).toBe(true)
    expect(session.withCtx(() => hasPendingExtraTurn(session.state, session.state.players[0]!))).toBe(false)
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, CARD))
    if (mode === 'used') expect(session.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).toBe(true)
    const response = confirmNext(session, session.getState())
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.terrainChanged' && event.sourceCardId === CARD)).toBe(false)
  })

  it('waits through real before, retention and after sowing before marking the extra turn used', () => {
    const before = 'M112_PeatAshFertilizer'
    const after = 'M060_SowingMachine'
    const original = evidence.track(work({ playerCount: 1, round: 7, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [CARD, before, after]
      Object.assign(player.resources, { food: 4, fuel: 0, grain: 1, horse: 2 })
      player.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }]
      player.fields.push({ row: 0, col: 2, stacks: [] })
      player.pastures = [{ id: 'taps-horses', tiles: [{ row: 1, col: 3 }, { row: 1, col: 4 }], animalType: 'horse', animalCount: 2 }]
      player.fenceSegments = ['H-1-3', 'H-1-4', 'H-2-3', 'H-2-4', 'V-1-3', 'V-1-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: '1' }]
    } }))
    let response = confirmNext(original, original.takeAction(0, 'day-laborer'))
    response = chooseCardAction(original, response, CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: before })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    response = acceptCard(original, response, before)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    response = original.resolveChoice(0, 'discard')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: after })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).not.toBe(true)
    const session = evidence.track(restore(original))
    response = acceptCard(session, session.getState(), after)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: after, request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'grain', remaining: 3 }], [{ kind: 'grain', remaining: 3 }]])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, fuel: 3 })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).toBe(true)
    const growth = response.state.events.find(event => event.type === 'farm.cropAdded' && event.sourceCardId === before)!
    const peat = response.state.events.find(event => event.type === 'farm.terrainChanged' && event.sourceCardId === CARD)!
    const sown = response.state.events.find(event => event.type === 'farm.sown' && event.sourceCardId === after)!
    expect(growth.seq).toBeLessThan(peat.seq)
    expect(peat.seq).toBeLessThan(sown.seq)
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'fields', quantity: 2, total: 1 }))
  })

  it.each(['market', 'borrowed', 'own', 'down'])('keeps ordinary two-player card eligibility for %s', mode => {
    const session = evidence.track(work({ round: 5, configure(state) {
      state.currentPlayerIndex = 1
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      Object.assign(player.resources, { food: 2, fuel: 0 })
      for (const [index, id] of ['forest', 'grain-seeds'].entries()) state.actionSpaces.find(space => space.id === id)!.takenBy = [{ playerId: player.id, workerId: String(index + 1) }]
      state.actionSpaces.find(space => space.id === 'clay-pit')!.takenBy = [{ playerId: 'p2', workerId: '1' }]
      const card = state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!
      if (mode === 'borrowed') card.location = { kind: 'playerFaceUp', playerId: 'p2' }
      if (mode === 'own') card.location = { kind: 'playerFaceUp', playerId: 'p1' }
      if (mode === 'down') card.location = { kind: 'playerFaceDown', playerId: 'p2' }
    } }))
    let response = confirmNext(session, session.takeAction(1, 'day-laborer'))
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD, request: { kind: 'choice' } })
    if (mode === 'market' || mode === 'borrowed') {
      response = chooseCardAction(session, response, CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
      expect(response.state.players[0]!.resources).toMatchObject({ food: mode === 'borrowed' ? 0 : 2, fuel: 3 })
      expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location)
        .toEqual({ kind: mode === 'borrowed' ? 'playerFaceDown' : 'playerFaceUp', playerId: 'p1' })
    } else {
      const value = ['card-action', TERRAIN_CARD, 'action', 'cut-peat', 2, 0].join(':')
      expect(getChoiceOptions(response).some(option => option.value === value)).toBe(false)
      for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, value))
      const hire = getChoiceOptions(response).find(option => option.labelKey === 'moor.specialActions.hiring-fair')!
      response = session.resolveChoice(0, hire.value)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 3, fuel: 0 })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.usedThisRound).toBe(true)
    expect(response.state.farmersOfTheMoor!.specialActionCards.some(card => card.location.kind.startsWith('solo-'))).toBe(false)
  })
})
