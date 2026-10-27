import { describe, expect, it } from 'vitest'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { work, acceptCard, buyMinor, chooseCardAction, finishHarvest, restore, TERRAIN_CARD } from './_helpers/standard-solo-cards'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID } from '../../shared/moor/special-action-flow'

const CARD = 'M054_AgriculturalImplement'
const BEFORE = 'M112_PeatAshFertilizer'
const evidence = createScenarioEvidence(import.meta.url)
const make = (playerCount = 1, borrowed = false) => evidence.track(work({ playerCount, seed: 6054, round: 7, configure(state) {
  const player = state.players[0]!
  Object.assign(player.resources, { food: borrowed ? 2 : 4, fuel: 0 })
  player.minorPlayed = [CARD, BEFORE]
  player.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }]
  if (playerCount === 1) state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: '1' }]
  if (borrowed) state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location = { kind: 'playerFaceUp', playerId: 'p2' }
} }))

describe('Agricultural Implement adopted actual-action interpretation', () => {
  it('executes the current card after the last worker plows, with before, retention and recovery', () => {
    const original = make()
    let response = original.takeAction(0, 'farmland')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = original.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    response = acceptCard(original, response, CARD)
    expect(getChoiceOptions(response).map(option => option.value)).toContain(['card-action', TERRAIN_CARD, 'action', 'cut-peat', 2, 0].join(':'))
    const peat = getChoiceOptions(response).find(option => option.labelKey === 'moor.specialActions.cut-peat')!
    expect(peat.labelParams).toMatchObject({ location: 'solo-current', row: 2, col: 0 })
    expect(JSON.stringify(peat.descriptionPreview)).toContain('moor.specialActions.cardChoiceCurrentTile')
    assertRejectedUnchanged(original, () => original.takeSpecialAction(0, TERRAIN_CARD, 'cut-peat', { tile: { row: 2, col: 0 } }))
    response = chooseCardAction(original, response, CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: BEFORE })
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 2, col: 0, kind: 'moor' })
    const session = evidence.track(restore(original))
    response = acceptCard(session, session.getState(), BEFORE)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.state.players[0]!.farmTerrain).not.toContainEqual({ row: 2, col: 0, kind: 'moor' })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice', moorSolo: { window: 'retention', currentCardId: TERRAIN_CARD } } })
    const retained = evidence.track(restore(session))
    response = retained.resolveChoice(0, 'retain')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 3 })
    expect(response.state.farmersOfTheMoor!.soloRetentionPaid).toBe(true)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location.kind).toBe('solo-current')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed')).toHaveLength(1)
    const growth = response.state.events.find(event => event.type === 'farm.cropAdded' && event.sourceCardId === BEFORE)!
    const cleared = response.state.events.find(event => event.type === 'farm.terrainChanged' && event.sourceActionId === 'cut-peat')!
    expect(growth.seq).toBeLessThan(cleared.seq)
    expect(response.state.events.some(event => event.type === 'harvest.started')).toBe(false)
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { fuel: 3 } }) }) }))
    expect(response.scores![0]!.categories).toContainEqual(expect.objectContaining({ key: 'fields', quantity: 2, total: 1 }))
    evidence.record('last worker before Continue', response)
    const continued = evidence.track(restore(retained))
    response = finishHarvest(continued, confirmNext(continued, continued.getState()), 8)
    expect(response.state.events.filter(event => event.type === 'harvest.started')).toHaveLength(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
  })

  it('can be bought for one wood in a fresh two-player game', () => {
    const session = evidence.track(work({ configure(state) {
      state.players[0]!.minorHand = [CARD]
      state.players[0]!.resources.wood = 1
    } }))
    const response = buyMinor(session, CARD)
    expect(response.state.players[0]!.minorPlayed).toEqual([CARD])
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: CARD, resources: { wood: 1 } }))
  })

  it.each([false, true])('executes the two-player card action with borrowed=$0', borrowed => {
    const session = make(2, borrowed)
    session.takeAction(0, 'farmland')
    let response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    response = acceptCard(session, response, CARD)
    response = chooseCardAction(session, response, CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
    response = acceptCard(session, response, BEFORE)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.resources).toMatchObject({ food: borrowed ? 0 : 4, fuel: 3 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location)
      .toEqual({ kind: borrowed ? 'playerFaceDown' : 'playerFaceUp', playerId: 'p1' })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.resources.food === 2)).toHaveLength(borrowed ? 1 : 0)
  })

  it('waits for Cultivation to finish before executing the same real card action', () => {
    const session = evidence.track(work({ playerCount: 1, round: 14, configure(state) {
      state.players[0]!.minorPlayed = [CARD]
      state.players[0]!.resources.fuel = 0
    } }))
    let response = session.takeAction(0, 'cultivation')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : null).not.toBe(CARD)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    response = acceptCard(session, response, CARD)
    response = chooseCardAction(session, response, CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
    expect(response.state.players[0]!.resources.fuel).toBe(3)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    expect(session.resolveChoice(0, 'discard').ok).toBe(true)
  })

  it('rejects hidden and invalid targets twice before a legal retry without consuming the card', () => {
    const original = make()
    original.takeAction(0, 'farmland')
    acceptCard(original, original.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }), CARD)
    const session = evidence.track(restore(original))
    let response = session.getState()
    const hidden = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.location.kind === 'solo-draw')!
    for (const value of [
      ['card-action', hidden.id, 'action', 'cut-peat', 2, 0].join(':'),
      ['card-action', TERRAIN_CARD, 'action', 'cut-peat', 2, 4].join(':'),
    ]) for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.resolveChoice(0, value))
    expect(session.state.farmersOfTheMoor!.soloRetentionPaid).toBe(false)
    expect(session.state.players[0]!.resources.fuel).toBe(0)
    response = chooseCardAction(session, response, CARD, TERRAIN_CARD, 'cut-peat', { row: 2, col: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: BEFORE })
  })

  it('does not trigger for another card plowing or for Slash and Burn', () => {
    const plow = 'A002_ShiftingCultivation'
    const session = evidence.track(work({ playerCount: 1, configure(state) {
      state.players[0]!.minorPlayed = [CARD]
      state.players[0]!.minorHand = [plow]
    } }))
    let response = acceptCard(session, buyMinor(session, plow), plow)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: plow, request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.events.some(event => event.sourceCardId === CARD)).toBe(false)

    const slash = evidence.track(work({ playerCount: 1, configure(state) { state.players[0]!.minorPlayed = [CARD] } }))
    response = slash.takeSpecialAction(0, TERRAIN_CARD, 'slash-and-burn', { tile: { row: 0, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { moorSolo: { window: 'retention' } } })
    response = slash.resolveChoice(0, 'discard')
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(response.state.events.some(event => event.sourceCardId === CARD)).toBe(false)
  })

  it('does not waive the normal special-action worker gate outside its own continuation', () => {
    const session = evidence.track(work({ playerCount: 1, configure(state) {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      for (const [index, id] of ['forest', 'grain-seeds'].entries()) {
        state.actionSpaces.find(space => space.id === id)!.takenBy = [{ playerId: player.id, workerId: String(index + 1) }]
      }
    } }))
    for (let attempt = 0; attempt < 2; attempt++) assertRejectedUnchanged(session, () => session.takeSpecialAction(0, TERRAIN_CARD, 'cut-peat', { tile: { row: 2, col: 0 } }))
    expect(session.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location).toEqual({ kind: 'solo-current' })
  })

  it.each(['hand', 'no-current', 'no-action'])('does not trigger when $0', mode => {
    const session = evidence.track(work({ playerCount: 1, configure(state) {
      const player = state.players[0]!
      if (mode === 'hand') player.minorHand = [CARD]
      else player.minorPlayed = [CARD]
      if (mode === 'no-action') player.farmTerrain = []
      if (mode === 'no-current') state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location = { kind: 'solo-discard', order: 0 }
    } }))
    session.takeAction(0, 'farmland')
    const response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.events.some(event => event.sourceCardId === CARD)).toBe(false)
  })

  it('leaves a separate pure-take entry as card acquisition without a Moor action', () => {
    const source = '__test_pure_take__'
    const session = evidence.track(work({ configure(state) {
      state.players[0]!.minorPlayed = [source, BEFORE]
      state.players[0]!.resources.fuel = 0
      state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }]
    } }))
    session.withCtx(() => requireActiveCardRegistry('pure-take-control').registerListener({
      id: 'test-pure-take-after-farmland', cardIds: [source], phases: ['immediatelyAfter'], actionSpaces: ['farmland'],
      handler: () => ({ sourceCard: source, flow: { type: 'leaf', actionId: MOOR_SPECIAL_ACTION_CHOICE_ACTION_ID,
        sourceCard: source, optional: true, actionContext: { mode: 'take-card' } } }),
    }))
    session.takeAction(0, 'farmland')
    let response = acceptCard(session, session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } }), source)
    expect(getChoiceOptions(response)).toContainEqual(expect.objectContaining({ value: `card:${TERRAIN_CARD}` }))
    response = session.resolveChoice(0, `card:${TERRAIN_CARD}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(0)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 2, col: 0, kind: 'moor' })
    expect(response.state.events.some(event => event.type === 'farm.terrainChanged' || event.type === 'farm.cropAdded')).toBe(false)
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(card => card.id === TERRAIN_CARD)!.location).toEqual({ kind: 'playerFaceUp', playerId: 'p1' })
  })
})
