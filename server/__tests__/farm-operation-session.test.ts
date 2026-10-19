import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'

const RECEIPT = 'TEST_FarmOperationReceipt'
const POTTER = 'A040_PottersYard'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  expect(options(response).some(option => option.value === value && !option.disabled), JSON.stringify(response.interaction)).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a waiting interaction')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

function setup(configure?: (state: GameState) => void) {
  const session = createWorkSession({ configure: state => {
    state.round = 4
    const player = state.players[0]!
    player.minorPlayed = [POTTER, RECEIPT]
    Object.assign(player.resources, { wood: 10, clay: 0, food: 2 })
    player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
    player.farmyardSpaceStates = ['0-0', '0-1', '0-2', '1-1', '1-2', '2-1', '2-2'].map(spaceKey => ({
      spaceKey, sourceCardId: POTTER, kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
    }))
    configure?.(state)
  } })
  sessions.push(session)
  registerReceipt(session)
  return session
}

function registerReceipt(session: GameSession) {
  session.withCtx(() => requireActiveCardRegistry('farm-operation-session').registerListener({
    id: 'test-farm-operation-receipt', cardIds: [RECEIPT], actions: ['stables', 'plow', 'construct', 'fence'], phases: ['after'],
    handler: context => {
      if (context.result?.type !== 'ok' || !context.result.farmOperations?.length) return
      const prior = context.player.cardStates[RECEIPT]?.extraData?.operations
      return {
        sourceCard: RECEIPT,
        flow: { type: 'leaf', actionId: 'special-effect', sourceCard: RECEIPT,
          params: { kind: 'set-extra-data', key: 'operations', value: JSON.parse(JSON.stringify([
            ...(Array.isArray(prior) ? prior : []), ...context.result.farmOperations,
          ])) } },
      }
    },
  }))
}

// Agreed seams: two-player GameSession commands, host listener results,
// authoritative layout/payment, selectable sources and persisted pending.
describe('farm operations at their original host completion', () => {
  it.each([false, true])('commits two stables once before either reaction; receiptFirst=%s', receiptFirst => {
    let session = setup()
    let response = session.takeAction(0, 'farm-expansion')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }, { row: 1, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 6, clay: 0, food: 2 })
    expect(response.state.players[0]!.stableTiles).toEqual([{ row: 0, col: 1 }, { row: 1, col: 1 }])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('select-trigger')
    expect(options(response).map(option => option.value)).toEqual(expect.arrayContaining([POTTER, RECEIPT]))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    session = restored
    registerReceipt(session)
    response = session.getState()
    response = choose(session, response, receiptFirst ? RECEIPT : POTTER)
    if (!receiptFirst) response = choose(session, response, '__skip__')
    if (options(response).some(option => option.value === RECEIPT)) response = choose(session, response, RECEIPT)
    if (options(response).some(option => option.value === POTTER)) response = choose(session, response, POTTER)
    if (options(response).some(option => option.value === '__skip__')) response = choose(session, response, '__skip__')
    const player = response.state.players[0]!
    expect(player.resources).toMatchObject({ wood: 6, clay: 2, food: 2 })
    expect(player.cardStates[RECEIPT]?.extraData?.operations).toMatchObject([{
      kind: 'stables', playerId: player.id,
      positions: [{ row: 0, col: 1 }, { row: 1, col: 1 }],
      newlyUsedTiles: [{ playerId: player.id, row: 0, col: 1 }, { playerId: player.id, row: 1, col: 1 }],
    }])
    expect(response.state.events.filter(event => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'stables'))
      .toEqual([expect.objectContaining({ resources: { wood: 4 } })])
  })

  it('rejects a duplicate stable batch without a receipt, then accepts a legal retry', () => {
    const session = setup()
    session.takeAction(0, 'farm-expansion')
    const rejected = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, {
      stables: [{ row: 0, col: 1 }, { row: 0, col: 1 }],
    }))
    expect(rejected.interaction.stateId === 'wait' && rejected.interaction.request.kind).toBe('farm-select')
    let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, RECEIPT)
    expect(response.state.players[0]!.resources.wood).toBe(8)
    expect(response.state.players[0]!.cardStates[RECEIPT]?.extraData?.operations).toMatchObject([
      { kind: 'stables', positions: [{ row: 0, col: 1 }] },
    ])
  })

  it('commits two paid rooms as one operation before the existing claim reaction', () => {
    const session = setup(state => Object.assign(state.players[0]!.resources, { wood: 12, reed: 4 }))
    let response = session.takeAction(0, 'farm-expansion')
    const construct = options(response).find(option => option.value.includes('construct'))
    if (construct) response = choose(session, response, construct.value)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }, { row: 0, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 0, clay: 0 })
    expect(options(response).map(option => option.value)).toEqual(expect.arrayContaining([POTTER, RECEIPT]))
    response = choose(session, response, RECEIPT)
    response = choose(session, response, POTTER)
    response = choose(session, response, '__skip__')
    const player = response.state.players[0]!
    expect(player.rooms).toBe(4)
    expect(player.resources.clay).toBe(2)
    expect(player.cardStates[RECEIPT]?.extraData?.operations).toMatchObject([{
      kind: 'rooms', positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
      before: { roomTiles: expect.arrayContaining([{ row: 1, col: 0 }, { row: 2, col: 0 }]) },
      after: { roomTiles: expect.arrayContaining([{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 0, col: 0 }, { row: 0, col: 1 }]) },
    }])
    expect(response.state.events.filter(event => event.type === 'farm.roomBuilt')).toHaveLength(1)
  })

  it('keeps A020 independent plow completions separate with the successful source', () => {
    const card = 'A020_DoubleTurnPlow'
    const session = setup(state => {
      state.round = 3
      const player = state.players[0]!
      player.minorPlayed = [RECEIPT]
      player.minorHand = [card]
      player.fields = []
      player.farmyardSpaceStates = []
      player.resources.grain = 1
    })
    let response = session.takeAction(0, 'meeting-place')
    for (let guard = 0; guard < 8 && !response.state.players[0]!.minorPlayed.includes(card); guard++) {
      const option = options(response).find(entry => entry.value === card || entry.value.startsWith('action-improvement-'))
      if (!option) throw new Error(`Expected minor purchase: ${JSON.stringify(response.interaction)}`)
      response = choose(session, response, option.value)
    }
    for (const tile of [{ row: 0, col: 0 }, { row: 0, col: 1 }]) {
      while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
        const accept = options(response).find(option => !option.disabled && !option.value.startsWith('__'))
        if (!accept) throw new Error('Expected optional plow')
        response = choose(session, response, accept.value)
      }
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
      response = session.commitSelectionChoice(0, { tile })
      expect(response.ok, response.error).toBe(true)
    }
    const player = response.state.players[0]!
    expect(player.fields).toEqual([{ row: 0, col: 0, stacks: [] }, { row: 0, col: 1, stacks: [] }])
    expect(player.resources.grain).toBe(0)
    expect(player.cardStates[RECEIPT]?.extraData?.operations).toMatchObject([
      { kind: 'plow', sourceCardId: card, positions: [{ row: 0, col: 0 }], before: { fields: [] }, after: { fields: [{ row: 0, col: 0 }] } },
      { kind: 'plow', sourceCardId: card, positions: [{ row: 0, col: 1 }], before: { fields: [{ row: 0, col: 0 }] }, after: { fields: [{ row: 0, col: 0 }, { row: 0, col: 1 }] } },
    ])
    expect(response.state.events.filter(event => event.type === 'farm.fieldPlowed').map(event => event.newlyUsedTiles))
      .toEqual([[{ playerId: player.id, row: 0, col: 0 }], [{ playerId: player.id, row: 0, col: 1 }]])
  })

  it('keeps an outer two-tile receipt separate when a nested one-tile fence finishes first', () => {
    const stock = 'B094_StockProtector'
    let session = setup(state => {
      state.players[0]!.minorPlayed.push('B015_CarpentersBench')
      state.players[0]!.occupationPlayed = [stock]
      Object.assign(state.players[0]!.resources, { wood: 20, food: 20 })
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    let response = session.takeAction(0, 'fencing')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'],
    })
    response = choose(session, response, stock)
    const accept = options(response).find(option => !option.disabled && !option.value.startsWith('__'))
    if (!accept) throw new Error('Expected extra worker offer')
    response = choose(session, response, accept.value)
    response = choose(session, response, 'forest')
    const fence = options(response).find(option => !option.disabled && !option.value.startsWith('__'))
    if (!fence) throw new Error('Expected Carpenter\'s Bench offer')
    response = choose(session, response, fence.value)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
    response = session.commitSelectionChoice(0, { edges: ['H-0-2', 'H-1-2', 'V-0-3'] })
    expect(response.ok, response.error).toBe(true)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    session = restored
    registerReceipt(session)
    response = session.getState()
    for (let guard = 0; guard < 8; guard++) {
      const next = options(response).find(option => option.value === RECEIPT)
        ?? options(response).find(option => option.value === POTTER)
        ?? options(response).find(option => option.value === '__skip__')
      if (!next) break
      response = choose(session, response, next.value)
    }
    const player = response.state.players[0]!
    expect(player.resources.clay).toBe(3)
    expect(player.cardStates[RECEIPT]?.extraData?.operations).toMatchObject([
      { kind: 'fence', positions: [{ row: 0, col: 2 }], newlyUsedTiles: [{ playerId: player.id, row: 0, col: 2 }],
        before: { pastures: [{ tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }] }] } },
      { kind: 'fence', positions: [{ row: 0, col: 0 }, { row: 0, col: 1 }], newlyUsedTiles: [
        { playerId: player.id, row: 0, col: 0 }, { playerId: player.id, row: 0, col: 1 },
      ], before: { pastures: [] }, after: { pastures: [{ tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }] }] } },
    ])
    expect(response.state.events.filter(event => event.type === 'farm.fenceBuilt').map(event => event.newlyUsedTiles.length))
      .toEqual([2, 1])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })
})
