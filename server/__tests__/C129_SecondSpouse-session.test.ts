import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, familySize, newbornCount } from '../../shared/domain/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import '../../shared/cards/C/C129_SecondSpouse'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

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
  stabilizeRandomHands(session.state.players)
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

describe('C129 Second Spouse parity', () => {
  const CARD_ID = 'C129_SecondSpouse'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true } = {}) => {
    const session = new GameSession(6129, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'urgent-wish-children'
    state.roundActionOrder[1] = 'wish-children'
    state.roundActionOrder[2] = 'lessons'
    state.roundActionOrder[3] = 'forest'
    state.actionSpaces.forEach((space) => {
      space.takenBy = []
      if (['urgent-wish-children', 'wish-children', 'lessons', 'forest'].includes(space.id)) {
        space.roundAvailable = 1
      }
    })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.rooms = 3
      player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }]
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources.food = 20
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const resetCurrentPlayer = (session: GameSession, playerIndex: number) => {
    const state = session.getState().state
    state.currentPlayerIndex = playerIndex
    session.loadState(state)
  }

  it('C129 S2: the owner may use Urgent Wish occupied by another player first person', () => {
    const session = setup()
    resetCurrentPlayer(session, 1)
    const opponent = session.takeAction(1, 'urgent-wish-children')
    expect(opponent.ok, opponent.error).toBe(true)
    resetCurrentPlayer(session, 0)

    const response = session.takeAction(0, 'urgent-wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(familySize(response.state.players[1]!)).toBe(3)
  })

  it('C129 S3: another player second person on Urgent Wish does not unlock it', () => {
    const session = setup()
    resetCurrentPlayer(session, 1)
    expect(session.takeAction(1, 'forest').ok).toBe(true)
    resetCurrentPlayer(session, 1)
    expect(session.takeAction(1, 'urgent-wish-children').ok).toBe(true)
    resetCurrentPlayer(session, 0)

    expect(session.getActionAvailability(0)['urgent-wish-children']).toBe(false)
    const response = session.takeAction(0, 'urgent-wish-children')
    expect(response.ok).toBe(false)
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
})

describe('ae-negative-51-family', () => {
  const { sessions, save, setup, finish, next, take, move } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C129 N1 genuine opponent first placement permits occupied Urgent Wish while preserving real placement history', () => { const s = setup('C129_SecondSpouse', 14, state => state.currentPlayerIndex = 1); move(s, 'urgent-wish-children'); next(s); finish(s, take(s, 'forest')); next(s); const r = finish(s, take(s, 'urgent-wish-children')); assert.equal(familySize(r.state.players[0]!), 3); assert.equal(familySize(r.state.players[1]!), 3); assert.equal(r.state.actionSpaces.find(a => a.id === 'urgent-wish-children')!.takenBy.length, 4); save('C129-N1', r); })
  it('C129 N2 opponent second own first and hand-only occupations cannot bypass occupied Urgent Wish', () => {
    for (const mode of ['second', 'self', 'hand']) {
      const s = setup('C129_SecondSpouse', 14, state => {
        if (mode === 'second')
          state.currentPlayerIndex = 1
        if (mode === 'hand') {
          state.players[0]!.occupationPlayed = []
          state.players[0]!.occupationHand = ['C129_SecondSpouse']
        }
      })
      if (mode === 'second') {
        for (const space of ['grain-seeds', 'forest', 'clay-pit', 'urgent-wish-children', 'reed-bank']) {
          move(s, space)
        }
        next(s)
      }
      else {
        move(s, mode === 'self' ? 'urgent-wish-children' : 'grain-seeds')
        next(s)
        finish(s, take(s, mode === 'self' ? 'forest' : 'urgent-wish-children'))
        next(s)
        finish(s, take(s, 'clay-pit'))
        next(s)
      }
      assertRejectedUnchanged(s, () => s.takeAction(0, 'urgent-wish-children'))
      const r = finish(s, take(s, mode === 'second' ? 'day-laborer' : 'reed-bank'))
      assert.equal(familySize(r.state.players[0]!), mode === 'self' ? 3 : 2)
      save(`C129-N2-${mode}`, r)
    }
  })
})
