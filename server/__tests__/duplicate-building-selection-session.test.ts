import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { setWorkersAtHome } from '../../shared/domain/player'

const CLEANER = 'C094_StableCleaner'
const HAMMER = 'A014_CarpentersHammer'
const A = { row: 0, col: 0 }
const B = { row: 0, col: 1 }
const duplicateLayouts = [
  { name: '[A, A]', positions: [A, A] },
  { name: '[A, B, A]', positions: [A, B, A] },
]
const sessions: GameSession[] = []

afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// Confirmed #1127/#1129 seam: real two-player Session farm choices and payment.
// The shared geometry validator owns rejection; card costs and flags stay local.
const setup = (card?: typeof CLEANER | typeof HAMMER) => {
  const session = createWorkSession({
    seed: 42,
    configure(state) {
      state.round = 5
      state.currentPlayerIndex = 0
      for (const player of state.players) {
        setWorkersAtHome(state, player, 2)
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.fields = []
        player.stableTiles = []
        player.pastures = []
        player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
        player.rooms = 2
        player.houseType = 'wood'
        Object.assign(player.resources, {
          wood: card === CLEANER ? 10 : 20, food: card === CLEANER ? 10 : 20,
          reed: 10, clay: 0, stone: 0, grain: 0, vegetable: 0,
          sheep: 0, boar: 0, cattle: 0,
        })
      }
      if (card === CLEANER) state.players[0]!.occupationPlayed = [card]
      if (card === HAMMER) state.players[0]!.minorPlayed = [card]
    },
  })
  sessions.push(session)
  return session
}

const snapshot = ({ state, interaction, scores }: SessionResponse) =>
  JSON.stringify({ state, interaction, scores })

const beginBuilding = (session: GameSession, kind: 'room' | 'stable') => {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected building choice')
  if (response.interaction.request.kind !== 'farm-select' || response.interaction.request.farm.farmType !== kind) {
    if (response.interaction.request.kind !== 'choice') throw new Error('Expected building branch choice')
    const option = response.interaction.request.options?.find((entry) =>
      entry.labelKey === (kind === 'room' ? 'actions.construct.name' : 'actions.stables.name'))
    expect(option).toBeDefined()
    if (!option) throw new Error('Missing building branch')
    response = session.resolveChoice(0, option.value)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected farm selection')
  expect(response.interaction.request.farm.farmType).toBe(kind)
  return response
}

describe('duplicate building coordinates', () => {
  it.each(duplicateLayouts)('rejects $name Stable Cleaner targets without changing the pending action, then permits a legal retry', ({ positions }) => {
    const session = setup(CLEANER)
    const pending = session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select') throw new Error('Expected stable selection')
    expect(pending.interaction.request.farm.farmType).toBe('stable')
    expect(pending.state.players[0]!.cardStates[CLEANER]?.flagged).toBe(true)
    const before = snapshot(pending)

    const rejected = session.commitSelectionChoice(0, { stables: positions })

    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toEqual(before)
    expect(session.withCtx(() => getAvailableStableSupplyCount(rejected.state, rejected.state.players[0]!))).toBe(4)
    const retried = session.commitSelectionChoice(0, { stables: [A] })
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources).toMatchObject({ wood: 9, food: 9 })
    expect(retried.state.players[0]!.stableTiles).toEqual([A])
    expect(retried.state.players[0]!.cardStates[CLEANER]?.flagged).toBe(false)
    expect(session.withCtx(() => getAvailableStableSupplyCount(retried.state, retried.state.players[0]!))).toBe(3)
  })

  it.each(duplicateLayouts)('rejects $name Hammer room targets without changing the pending action, then charges the two-room discount once', ({ positions }) => {
    const session = setup(HAMMER)
    const pending = beginBuilding(session, 'room')
    const before = snapshot(pending)

    const rejected = session.commitSelectionChoice(0, { rooms: positions })

    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toEqual(before)
    const retried = session.commitSelectionChoice(0, { rooms: [A, B] })
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!).toMatchObject({
      rooms: 4, resources: { wood: 12, reed: 8 },
      roomTiles: [{ row: 1, col: 0 }, { row: 2, col: 0 }, A, B],
    })
    expect(retried.state.events.find((event) => event.type === 'farm.roomBuilt')).toMatchObject({
      rooms: [A, B],
    })
  })

  for (const kind of ['room', 'stable'] satisfies Array<'room' | 'stable'>) {
    it.each(duplicateLayouts)(`rejects $name ordinary ${kind} targets and allows a single-target retry`, ({ positions }) => {
      const session = setup()
      const before = snapshot(beginBuilding(session, kind))
      const rejected = session.commitSelectionChoice(0,
        kind === 'room' ? { rooms: positions } : { stables: positions })

      expect(rejected.ok).toBe(false)
      expect(snapshot(rejected)).toEqual(before)
      const retried = session.commitSelectionChoice(0,
        kind === 'room' ? { rooms: [A] } : { stables: [A] })
      expect(retried.ok, retried.error).toBe(true)
      if (kind === 'room') {
        expect(retried.state.players[0]!).toMatchObject({
          rooms: 3, resources: { wood: 15, reed: 8 },
          roomTiles: [{ row: 1, col: 0 }, { row: 2, col: 0 }, A],
        })
      } else {
        expect(retried.state.players[0]!.resources).toMatchObject({ wood: 18, food: 20 })
        expect(retried.state.players[0]!.stableTiles).toEqual([A])
        expect(session.withCtx(() => getAvailableStableSupplyCount(retried.state, retried.state.players[0]!))).toBe(3)
      }
    })
  }

  it('keeps Stable Cleaner multi-stable building costs and supply unchanged', () => {
    const session = setup(CLEANER)
    expect(session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime').ok).toBe(true)
    const response = session.commitSelectionChoice(0, { stables: [A, B] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([A, B])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, food: 8 })
    expect(response.state.players[0]!.cardStates[CLEANER]?.flagged).toBe(false)
    expect(session.withCtx(() => getAvailableStableSupplyCount(response.state, response.state.players[0]!))).toBe(2)
    expect(response.state.events.filter((event) => event.type === 'farm.stableBuilt')).toHaveLength(1)
    expect(response.state.events.find((event) => event.type === 'farm.stableBuilt')).toMatchObject({
      stables: [A, B],
    })
  })

  it('can undo and rebuild discounted rooms after a rejected duplicate submission', () => {
    const session = setup(HAMMER)
    beginBuilding(session, 'room')
    expect(session.commitSelectionChoice(0, { rooms: [A, A] }).ok).toBe(false)
    expect(session.commitSelectionChoice(0, { rooms: [A, B] }).ok).toBe(true)

    const undone = session.undoAction()

    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!).toMatchObject({
      rooms: 2, resources: { wood: 20, reed: 10 },
      roomTiles: [{ row: 1, col: 0 }, { row: 2, col: 0 }],
    })
    beginBuilding(session, 'room')
    const rebuilt = session.commitSelectionChoice(0, { rooms: [A, B] })
    expect(rebuilt.ok, rebuilt.error).toBe(true)
    expect(rebuilt.state.players[0]!).toMatchObject({
      rooms: 4, resources: { wood: 12, reed: 8 },
    })
  })
})
