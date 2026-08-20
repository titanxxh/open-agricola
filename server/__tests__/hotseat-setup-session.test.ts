import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  buildInitialStateOptions,
  parseGameSetupRequest,
  resolveCustomCardDbIds,
} from '../game/game-setup-options'
import { parseDraftOptions } from '../connection/room-router'
import { nextHotseatDraftSeatId, nextHotseatParentSeatId } from '../../client/app/hotseat-seat'

/**
 * The lobby's setup panel drives both room creation and the `/api/game/new`
 * debug endpoint through the same mapping helpers, so these tests pin that the
 * mapped options really reach the dealt game.
 *
 * They also cover the two setup phases that never advance `currentPlayerIndex`
 * — card draft and parent selection — which is why a hotseat client walks the
 * seats itself instead of following the current player.
 */
const setupFromPayload = (payload: Record<string, unknown>) => {
  const draft = parseDraftOptions(payload)
  if (!draft.ok) throw new Error(draft.error)
  return buildInitialStateOptions(parseGameSetupRequest(payload, draft.value))
}

describe('hotseat game setup', () => {
  it('deals the requested player count', () => {
    const session = new GameSession(4242, undefined, setupFromPayload({ maxPlayers: 4 }))
    expect(session.getState().state.players).toHaveLength(4)
  })

  it('clamps the player count to the supported range', () => {
    expect(setupFromPayload({ maxPlayers: 9 }).playerCount).toBe(6)
    expect(setupFromPayload({ maxPlayers: 1 }).playerCount).toBe(2)
    expect(setupFromPayload({}).playerCount).toBe(2)
  })

  it('accepts the hotseat playerCount wording as well as the room maxPlayers one', () => {
    expect(setupFromPayload({ playerCount: 3 }).playerCount).toBe(3)
  })

  it('turns on the expansions the lobby selected', () => {
    const session = new GameSession(4242, undefined, setupFromPayload({
      maxPlayers: 2,
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
    }))
    const state = session.getState().state
    expect(state.enableThroughTheSeasons).toBe(true)
    expect(state.enableFarmersOfTheMoor).toBe(true)
  })

  it('leaves expansions off by default', () => {
    const session = new GameSession(4242, undefined, setupFromPayload({ maxPlayers: 2 }))
    const state = session.getState().state
    expect(state.enableThroughTheSeasons).toBe(false)
    expect(state.enableFarmersOfTheMoor).toBe(false)
    expect(state.enableParentCards).toBe(false)
  })

  it('rejects an invalid draft mode instead of silently dealing a classic hand', () => {
    expect(() => setupFromPayload({ draftMode: 'auction' })).toThrow(/invalid draftMode/)
  })
})

describe('hotseat draft phase', () => {
  const startDraftGame = () => new GameSession(4242, undefined, setupFromPayload({
    maxPlayers: 2,
    draftMode: 'simultaneous',
    draftPoolSize: 7,
  }))

  it('does not advance currentPlayerIndex, so the panel cannot follow the turn', () => {
    // This is why hotseat walks the seats itself instead of reusing currentPlayer.
    const session = startDraftGame()
    const before = session.getState().state
    expect(before.phase).toBe('draft')
    expect(before.currentPlayerIndex).toBe(0)

    const draft = before.draft!
    session.submitDraftPick('p1', {
      occCardId: draft.pools['p1']!.occ[0]!,
      minorCardId: draft.pools['p1']!.minor[0]!,
    })

    const after = session.getState().state
    expect(after.phase).toBe('draft')
    expect(after.currentPlayerIndex).toBe(0)
  })

  it('points at the first seat that has not submitted yet', () => {
    const session = startDraftGame()
    expect(nextHotseatDraftSeatId(session.getState().state.draft!)).toBe('p1')

    const draft = session.getState().state.draft!
    session.submitDraftPick('p1', {
      occCardId: draft.pools['p1']!.occ[0]!,
      minorCardId: draft.pools['p1']!.minor[0]!,
    })

    expect(nextHotseatDraftSeatId(session.getState().state.draft!)).toBe('p2')
  })

  it('completes the whole draft by submitting one seat at a time', () => {
    const session = startDraftGame()
    for (let step = 0; step < 64; step += 1) {
      const state = session.getState().state
      if (state.phase !== 'draft' || !state.draft) break
      const seatId = nextHotseatDraftSeatId(state.draft)
      expect(seatId).not.toBeNull()
      const pool = state.draft.pools[seatId!]!
      const resp = session.submitDraftPick(seatId!, {
        ...(pool.occ.length > 0 ? { occCardId: pool.occ[0]! } : {}),
        ...(pool.minor.length > 0 ? { minorCardId: pool.minor[0]! } : {}),
      })
      expect(resp.ok).toBe(true)
    }

    expect(session.getState().state.phase).not.toBe('draft')
  })
})

describe('hotseat community cards', () => {
  it('never deals community-deck cards when the deck switch is off', () => {
    const setup = setupFromPayload({ maxPlayers: 2, customCardIds: ['card-a'] })
    expect(setup.enableCommunityDeck).toBe(false)
    expect(resolveCustomCardDbIds({ customCardIds: ['card-a'] }, false)).toEqual([])
  })

  it('keeps the selected card ids once the deck switch is on', () => {
    expect(resolveCustomCardDbIds(
      { customCardIds: ['card-a', 'card-b', 7] },
      true,
    )).toEqual(['card-a', 'card-b'])
  })
})

describe('hotseat parent selection phase', () => {
  const startParentGame = () => new GameSession(4242, undefined, setupFromPayload({
    maxPlayers: 2,
    enableParentCards: true,
  }))

  const submitFirstCandidates = (session: GameSession, seatId: string) => {
    const state = session.getState().state
    const candidates = state.parentSelection!.candidates[seatId]!
    const playerIndex = state.players.findIndex((player) => player.id === seatId)
    return session.submitParentSelection(playerIndex, {
      mother: candidates.mother[0]!,
      father: candidates.father[0]!,
    })
  }

  it('points at the first seat that has not submitted yet', () => {
    const session = startParentGame()
    expect(session.getState().state.phase).toBe('parent-selection')
    expect(nextHotseatParentSeatId(session.getState().state)).toBe('p1')

    expect(submitFirstCandidates(session, 'p1').ok).toBe(true)
    expect(nextHotseatParentSeatId(session.getState().state)).toBe('p2')
  })

  it('completes parent selection by submitting one seat at a time', () => {
    const session = startParentGame()
    for (let step = 0; step < 8; step += 1) {
      const seatId = nextHotseatParentSeatId(session.getState().state)
      if (!seatId) break
      expect(submitFirstCandidates(session, seatId).ok).toBe(true)
    }

    expect(nextHotseatParentSeatId(session.getState().state)).toBeNull()
    expect(session.getState().state.phase).not.toBe('parent-selection')
  })

  it('returns null when the game has no parent selection at all', () => {
    const session = new GameSession(4242, undefined, setupFromPayload({ maxPlayers: 2 }))
    expect(nextHotseatParentSeatId(session.getState().state)).toBeNull()
  })
})
