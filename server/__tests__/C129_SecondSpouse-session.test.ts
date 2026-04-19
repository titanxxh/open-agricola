import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, familySize, newbornCount } from '../../shared/game/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/C/C129_SecondSpouse'

/**
 * Helper: occupy a space with a player's worker and record it as their Nth round placement.
 * If `isFirstPlacement` is true, this is the first entry in their round placements.
 * If false, a prior placement is recorded first.
 */
function occupySpace(
  state: ReturnType<GameSession['getState']>['state'],
  playerIdx: number,
  spaceId: string,
  workerId: string,
  isFirstPlacement: boolean,
) {
  const player = state.players[playerIdx]!
  const space = state.actionSpaces.find(s => s.id === spaceId)!
  space.takenBy.push({ playerId: player.id, workerId })
  if (!isFirstPlacement) {
    // Record a prior placement on some other space so this one is NOT the first
    recordRoundPlacement(player, 'forest', `${workerId}-prior`)
  }
  recordRoundPlacement(player, spaceId, workerId)
}

const setup = (options?: {
  withCard?: boolean
  playerCount?: number
}) => {
  const playerCount = options?.playerCount ?? 3
  const session = new GameSession(undefined, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5

  // Open urgent-wish-children at round 1
  state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
    spaceId === 'urgent-wish-children' ? null : spaceId,
  )
  state.roundActionOrder[0] = 'urgent-wish-children'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  setActiveWorkerCount(player, 2)
  player.rooms = 3

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('C129_SecondSpouse')
  }

  return { session, state }
}

describe('C129_SecondSpouse session', () => {
  it('allowed when occupier is other player\'s FIRST placed worker', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    occupySpace(state, 1, 'urgent-wish-children', 'b1', true)
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)
    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(true)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(newbornCount(resp.state.players[0]!)).toBe(1)
    // Original occupant preserved
    const space = resp.state.actionSpaces.find(s => s.id === 'urgent-wish-children')!
    expect(space.takenBy.some(t => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('NOT allowed when occupier is NOT other player\'s first placed worker', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    occupySpace(state, 1, 'urgent-wish-children', 'b2', false) // b2 is second placement
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(false)
    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(false)
  })

  it('allowed when 2 occupants and at least one is first placed', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    // Player B: first placement on urgent-wish-children
    occupySpace(state, 1, 'urgent-wish-children', 'b1', true)
    // Player C: NOT first placement on urgent-wish-children
    occupySpace(state, 2, 'urgent-wish-children', 'c2', false)
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)
  })

  it('NOT allowed when 3+ occupants', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    occupySpace(state, 1, 'urgent-wish-children', 'b1', true)
    occupySpace(state, 2, 'urgent-wish-children', 'c1', true)
    // Push a third occupant manually
    const space = state.actionSpaces.find(s => s.id === 'urgent-wish-children')!
    space.takenBy.push({ playerId: 'extra', workerId: 'x1' })
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(false)
  })

  it('NOT allowed when all occupants are non-first placements', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    occupySpace(state, 1, 'urgent-wish-children', 'b2', false)
    occupySpace(state, 2, 'urgent-wish-children', 'c2', false)
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(false)
  })

  it('does not allow using occupied urgent-wish-children without the card', () => {
    const { session, state } = setup({ withCard: false, playerCount: 3 })
    occupySpace(state, 1, 'urgent-wish-children', 'b1', true)
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(false)
    const resp = session.takeAction(0, 'urgent-wish-children')
    expect(resp.ok).toBe(false)
  })

  it('does not allow if occupied by own farmer', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    occupySpace(state, 0, 'urgent-wish-children', 'a1', true) // Own farmer
    session.loadState(state)

    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(false)
  })

  it('does not affect normal wish-children space', () => {
    const { session, state } = setup({ withCard: true, playerCount: 3 })
    // Make wish-children available and occupy it
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'wish-children' ? null : id,
    )
    state.roundActionOrder[1] = 'wish-children'
    occupySpace(state, 1, 'wish-children', 'b1', true)
    session.loadState(state)

    expect(session.getState().actionAvailability?.['wish-children']).toBe(false)
  })

  it('2-player game: card still fires when forcibly in occupationPlayed (deck prevents this in real play)', () => {
    const { session, state } = setup({ withCard: true, playerCount: 2 })
    occupySpace(state, 1, 'urgent-wish-children', 'b1', true)
    session.loadState(state)

    // Card triggers even in 2-player (runtime doesn't block; deck config prevents)
    expect(session.getState().actionAvailability?.['urgent-wish-children']).toBe(true)
  })
})
