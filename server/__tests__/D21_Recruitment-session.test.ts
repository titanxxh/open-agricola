import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { D21_Recruitment } from '../../shared/cards/D/D21_Recruitment'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

const CARD_ID = 'D21_Recruitment'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

describe('D21_Recruitment session', () => {
  const setup = (round: number, rooms: number, familySize: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const owner = state.players[0]!
    owner.minorPlayed.push(CARD_ID)
    owner.rooms = rooms
    owner.familySize = familySize

    session.loadState(state)
    return session
  }

  it('computeReplace listener declines and offers family-growth in round 5+ with room', () => {
    const session = setup(5, 3, 2)
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-replace-improvement')
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)

    expect(result?.decline).toBe(true)
    expect(result?.sourceCard).toBe(CARD_ID)
    expect(result?.alternativeFlow).toEqual({
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'family-growth',
          sourceCard: CARD_ID,
        },
      ],
    })
  })

  it('computeReplace listener is silent before round 5', () => {
    const session = setup(4, 3, 2)
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-replace-improvement')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('computeReplace listener is silent when no room in the house', () => {
    const session = setup(5, 2, 2) // rooms == familySize → no room
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-replace-improvement')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('also fires on improvement-any action', () => {
    const session = setup(5, 3, 2)
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-replace-improvement')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)

    expect(result?.decline).toBe(true)
  })

  it('isDoable listener reports doable when replace conditions met', () => {
    const session = setup(5, 3, 2)
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-isdoable-improvement')
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'improvement',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)

    expect(result?.doable).toBe(true)
  })

  it('isDoable listener no-ops when round too early', () => {
    const session = setup(3, 3, 2)
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-isdoable-improvement')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  describe('prerequisite "No People Left in the House"', () => {
    it('blocks buy when at least one farmer is still at home', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      // Default fresh game: 2 active farmers, both at home → buy must be blocked
      expect(meetsCardPrerequisites(player, D21_Recruitment, state.round, state)).toBe(false)
    })

    it('allows buy when all active farmers have been placed (no people left at home)', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      setActiveWorkerCount(player, 2)
      markAllWorkersUsed(state, player)
      expect(meetsCardPrerequisites(player, D21_Recruitment, state.round, state)).toBe(true)
    })
  })

  it('computeReplace is silent when trueAction=false (nested card-triggered action)', () => {
    const session = setup(5, 3, 2)
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener('D21-recruitment-replace-improvement')!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'improvement',
      phase: 'computeReplace',
      actionContext: { trueAction: false },
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
