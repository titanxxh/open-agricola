import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import type { PlayerState } from '../../shared/contract/types'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

const CARD_ID = 'B085_FarmHand'
const CENTER = { row: 0, col: 2 }
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const setup = (configure?: (player: PlayerState) => void) => {
  const session = createWorkSession({
    seed: 4242,
    configure(state) {
      state.round = 8
      const player = state.players[0]!
      player.occupationPlayed = [CARD_ID]
      player.fields = [CENTER, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }]
        .map((tile) => ({ ...tile, stacks: [] }))
      Object.assign(player.resources, { wood: 2, reed: 0, clay: 0, food: 20 })
      configure?.(player)
    },
  })
  sessions.push(session)
  return session
}

const enterStableSelection = (session: GameSession) => {
  const response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select')
  assert.equal(response.interaction.request.farm.farmType, 'stable')
  return response
}

const ruleSnapshot = ({ state, interaction, scores }: SessionResponse) => JSON.stringify({ state, interaction, scores })

describe('B085 Farm Hand rejected selections', () => {
  it.each([false, true])('keeps the whole stable interaction after an invalid centre and builds a legal centre without undo, reconnect=%s', (reconnect) => {
    let session = setup()
    const pending = enterStableSelection(session)
    const before = ruleSnapshot(pending)
    const rejected = session.commitSelectionChoice(0, { farmHand: { row: 2, col: 4 } })

    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('log.buildStableFail')
    expect(ruleSnapshot(rejected)).toBe(before)

    if (reconnect) {
      session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
      sessions.push(session)
    }
    const built = session.commitSelectionChoice(0, { farmHand: CENTER })
    expect(built.ok, built.error).toBe(true)
    const player = built.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.cardStates[CARD_ID]).toMatchObject({ flagged: true, extraData: { position: CENTER } })
    expect(player.stableTiles).toEqual([])
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
    expect(session.withCtx(() => getAvailableStableSupplyCount(built.state, player))).toBe(3)
    expect(session.withCtx(() => computeAnimalZones(player, built.state)).filter((zone) => zone.zoneType === 'stable')).toEqual([])
    expect(built.state.events.filter((event) => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(built.state.events.find(event => event.type === 'farm.stableBuilt')).toMatchObject({ newlyUsedTiles: [] })
    expect(built.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ effects: { buildStables: 1 } }) }) }),
    ]))
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.wood).toBe(2)
    expect(undone.state.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(session.withCtx(() => getAvailableStableSupplyCount(undone.state, undone.state.players[0]!))).toBe(4)
  })
  it('rejects a mixed ordinary and illegal special stable atomically and allows an ordinary stable retry', () => {
    const session = setup((player) => { player.resources.wood = 4 })
    const pending = enterStableSelection(session)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assert.equal(pending.interaction.request.farm.farmType, 'stable')
    expect(pending.interaction.request.farm.farmHandPositions).toEqual([CENTER])
    const ordinary = pending.interaction.request.farm.selectableTiles[0]
    assert.ok(ordinary)
    const before = ruleSnapshot(pending)
    const wrongActor = session.commitSelectionChoice(1, { farmHand: CENTER })
    expect(wrongActor.ok).toBe(false)
    expect(ruleSnapshot(wrongActor)).toBe(before)

    const rejected = session.commitSelectionChoice(0, { stables: [ordinary], farmHand: { row: 2, col: 4 } })
    expect(rejected.ok).toBe(false)
    expect(ruleSnapshot(rejected)).toBe(before)

    const built = session.commitSelectionChoice(0, { stables: [ordinary] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.stableTiles).toEqual([ordinary])
    expect(built.state.players[0]!.resources.wood).toBe(2)
    expect(session.withCtx(() => getExtraRoomCapacity(built.state.players[0]!))).toBe(0)
    expect(built.state.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(built.state.events.filter((event) => event.type === 'farm.stableBuilt')).toHaveLength(1)
  })

  it.each(['unplayed', 'non-square', 'already-used'])('retains ordinary stable selection after a forged centre with %s Farm Hand', (mode) => {
    const session = setup((player) => {
      if (mode === 'unplayed') player.occupationPlayed = []
      if (mode === 'non-square') player.fields = []
      if (mode === 'already-used') player.cardStates[CARD_ID] = { flagged: true }
    })
    const pending = enterStableSelection(session)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assert.equal(pending.interaction.request.farm.farmType, 'stable')
    expect(pending.interaction.request.farm.farmHandPositions).toBeUndefined()
    const ordinary = pending.interaction.request.farm.selectableTiles[0]
    assert.ok(ordinary)
    const before = ruleSnapshot(pending)
    const rejected = session.commitSelectionChoice(0, { farmHand: CENTER })
    expect(rejected.ok).toBe(false)
    expect(ruleSnapshot(rejected)).toBe(before)
    const built = session.commitSelectionChoice(0, { stables: [ordinary] })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.stableTiles).toEqual([ordinary])
    expect(session.withCtx(() => getExtraRoomCapacity(built.state.players[0]!))).toBe(0)
  })

  it.each([false, true])('rejects an illegal centre before alternative payments and retries legally without undo, mixed=%s', (mixed) => {
    const session = setup((player) => {
      player.resources.wood = mixed ? 4 : 2
      player.resources.clay = 2
      player.activeModifiers = [{
        type: 'trade', cardId: 'Test_Stable_Clay', appliesTo: ['stables'],
        from: { clay: 2 }, to: { wood: 2 }, max: 1,
      }]
    })
    const pending = enterStableSelection(session)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select')
    assert.equal(pending.interaction.request.farm.farmType, 'stable')
    const ordinary = pending.interaction.request.farm.selectableTiles[0]
    assert.ok(ordinary)
    const stables = mixed ? [ordinary] : []
    const farmBefore = ruleSnapshot(pending)
    const rejected = session.commitSelectionChoice(0, { stables, farmHand: { row: 2, col: 4 } })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('log.buildStableFail')
    expect(ruleSnapshot(rejected)).toBe(farmBefore)

    const payment = session.commitSelectionChoice(0, { stables, farmHand: CENTER })
    expect(payment.ok, payment.error).toBe(true)
    assert.ok(payment.interaction.stateId === 'wait' && payment.interaction.request.kind === 'choice')
    expect(payment.interaction.promptKey).toBe('prompt.selectPayment')
    expect(payment.state.players[0]!.resources).toMatchObject({ wood: mixed ? 4 : 2, clay: 2 })
    expect(payment.state.players[0]!.stableTiles).toEqual([])
    expect(payment.state.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(payment.state.events.filter((event) => event.type === 'farm.stableBuilt')).toHaveLength(0)
    const before = ruleSnapshot(payment)
    const invalidPayment = session.resolveChoice(0, 'pay:stable:not-an-option')
    expect(invalidPayment.ok).toBe(false)
    expect(ruleSnapshot(invalidPayment)).toBe(before)
    const clayPayment = payment.interaction.request.options.find((option) => {
      const paid = option.labelParams?.resourcesPaid
      return typeof paid === 'object' && paid !== null && 'clay' in paid && paid.clay === 2
    })
    assert.ok(clayPayment)
    const built = session.resolveChoice(0, clayPayment.value)
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 0 })
    expect(built.state.players[0]!.cardStates[CARD_ID]).toMatchObject({ flagged: true, extraData: { position: CENTER } })
    expect(session.withCtx(() => getAvailableStableSupplyCount(built.state, built.state.players[0]!))).toBe(mixed ? 2 : 3)
    expect(built.state.players[0]!.stableTiles).toEqual(stables)
    expect(built.state.events.filter((event) => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(built.state.events.filter((event) => event.type === 'resource.paid' && event.paymentFor === 'stables')).toHaveLength(1)
  })

})
