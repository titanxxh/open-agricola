import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { MarketplaceTransfer } from '../../shared/contract/marketplace'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import type { TeamConfiguration } from '../../shared/contract/team'
import { GameSession } from '../game/authoritative-session'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })
const team = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } satisfies TeamConfiguration
function table(configure: (state: GameState) => void = () => {}, teamConfig: TeamConfiguration = team, playerCount = 4) {
  const session = createWorkSession({ seed: 1624, options: { playerCount, teamConfig }, configure(state) {
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
    }
    configure(state)
  } })
  sessions.push(session)
  return session
}

describe('Marketplace goods transfers', () => {
  it('takes one worker and lets the giver send goods plus one same-good tax to a teammate', () => {
    const session = table(state => {
      state.players[0]!.resources.wood = 6
      state.players[2]!.resources.wood = 1
    })
    const started = session.takeAction(0, 'marketplace')
    expect(started.ok, started.error).toBe(true)
    expect(started.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: {
      kind: 'marketplace-select', teammates: [{ playerId: 'p3' }], availableByResource: { wood: 6 },
    } })
    const received = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 3 },
    ] })
    expect(received.ok, received.error).toBe(true)
    expect(received.state.players[0]!.resources.wood).toBe(2)
    expect(received.state.players[2]!.resources.wood).toBe(4)
    expect(received.state.players[1]!.resources.wood).toBe(0)
    expect(received.state.players[3]!.resources.wood).toBe(0)
    expect(received.state.actionSpaces.find(space => space.id === 'marketplace')?.takenBy).toHaveLength(1)
    expect(received.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
  })
  it('charges the selected giver when taking several goods in one submission', () => {
    const session = table(state => {
      Object.assign(state.players[0]!.resources, { wood: 6, food: 1 })
      Object.assign(state.players[2]!.resources, { wood: 0, food: 5 })
    })
    expect(session.takeAction(0, 'marketplace').ok).toBe(true)
    const result = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 3 },
      { resource: 'food', direction: 'take', teammatePlayerId: 'p3', amount: 2 },
    ] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ wood: 2, food: 3 })
    expect(result.state.players[2]!.resources).toMatchObject({ wood: 3, food: 2 })
    expect(result.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: 'p1', playerRefs: { giver: 'p1', receiver: 'p3' }, params: expect.objectContaining({ goods: { wood: 3 }, tax: { wood: 1 } }) }),
      expect.objectContaining({ playerId: 'p3', playerRefs: { giver: 'p3', receiver: 'p1' }, params: expect.objectContaining({ goods: { food: 2 }, tax: { food: 1 } }) }),
    ]))
  })

  it('rejects the complete batch without consuming goods or the waiting step, then accepts a corrected retry', () => {
    const session = table(state => {
      state.players[0]!.resources.wood = 3
      state.players[2]!.resources.food = 2
    })
    expect(session.takeAction(0, 'marketplace').ok).toBe(true)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 1 },
      { resource: 'food', direction: 'take', teammatePlayerId: 'p3', amount: 2 },
    ] }))
    for (const transfers of [
      [],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 0 }],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: -1 }],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 1.5 }],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: Infinity }],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p2', amount: 1 }],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p1', amount: 1 }],
      [{ resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 1 }, { resource: 'wood', direction: 'take', teammatePlayerId: 'p3', amount: 1 }],
    ] satisfies MarketplaceTransfer[][]) {
      assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { marketplaceTransfers: transfers }))
    }
    const result = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 1 },
      { resource: 'food', direction: 'take', teammatePlayerId: 'p3', amount: 1 },
    ] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ wood: 1, food: 1 })
    expect(result.state.players[2]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('runs obtain reactions as the receiving card owner without counting transferred goods as card income', () => {
    const session = table(state => {
      state.players[0]!.resources.wood = 5
      state.players[2]!.resources.wood = 4
      state.players[2]!.minorPlayed = ['A048_ShavingHorse']
    })
    expect(session.takeAction(0, 'marketplace').ok).toBe(true)
    const result = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 3 },
    ] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(result.state.players[2]!.resources).toMatchObject({ wood: 6, food: 3 })
    expect(result.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
    expect(result.state.events).toContainEqual(expect.objectContaining({ type: 'resource.moved', reason: 'receive',
      from: { kind: 'player', playerId: 'p1' }, to: { kind: 'player', playerId: 'p3' }, resources: { wood: 3 } }))
  })

  it('keeps ordinary games and team configurations without cooperation free of Marketplace', () => {
    for (const cooperationRules of [false, undefined]) {
      const session = table(() => {}, { ...team, cooperationRules })
      expect(session.getState().state.actionSpaces.some(space => space.id === 'marketplace')).toBe(false)
      assertRejectedUnchanged(session, () => session.takeAction(0, 'marketplace'))
    }
  })

  it('lets a three-seat team choose a different teammate for each good', () => {
    const session = table(state => {
      state.players[0]!.resources.wood = 3
      state.players[2]!.resources.food = 3
    }, { ...team, seatsPerTeam: 3 }, 6)
    const start = session.takeAction(0, 'marketplace')
    expect(start.interaction).toMatchObject({ stateId: 'wait', request: { teammates: [{ playerId: 'p3' }, { playerId: 'p5' }] } })
    const result = session.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p5', amount: 1 },
      { resource: 'food', direction: 'take', teammatePlayerId: 'p3', amount: 1 },
    ] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ wood: 1, food: 1 })
    expect(result.state.players[2]!.resources.food).toBe(1)
    expect(result.state.players[4]!.resources.wood).toBe(1)
  })

  it('restores an outstanding Marketplace request and continues it exactly once', () => {
    const session = table(state => { state.players[0]!.resources.wood = 6 }, { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true })
    expect(session.takeAction(0, 'marketplace').ok).toBe(true)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    expect(restored.getState().interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'marketplace-select' } })
    const result = restored.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 3 },
    ] })
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.wood).toBe(2)
    expect(result.state.players[2]!.resources.wood).toBe(3)
    expect(result.state.log.filter(entry => entry.key === 'log.marketplaceTransfer')).toHaveLength(1)
    assertRejectedUnchanged(restored, () => restored.commitSelectionChoice(0, { marketplaceTransfers: [
      { resource: 'wood', direction: 'give', teammatePlayerId: 'p3', amount: 3 },
    ] }))
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.wood).toBe(6)
    expect(undone.state.players[2]!.resources.wood).toBe(0)
    expect(undone.state.actionSpaces.find(space => space.id === 'marketplace')?.takenBy).toEqual([])
    expect(undone.state.log.some(entry => entry.key === 'log.marketplaceTransfer')).toBe(false)
  })

  it('restores old team snapshots without adding a new action space and continues an existing action', () => {
    const { cooperationRules: _switch, ...legacyTeam } = team
    const session = table(state => { state.players[0]!.resources.wood = 3 }, legacyTeam)
    const spaces = session.state.actionSpaces.map(space => space.id)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    expect(restored.state.actionSpaces.map(space => space.id)).toEqual(spaces)
    const result = restored.takeAction(0, 'grain-seeds')
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.grain).toBe(1)
    expect(result.state.team?.configuration.cooperationRules).toBeUndefined()
  })

})
