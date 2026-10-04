import { describe, expect, it } from 'vitest'

import { GameSession, type SessionResponse } from '../game/authoritative-session.ts'
import { rollAndCacheCardPick } from '../../shared/cards/helpers/card-random.ts'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import type { GameSyncPayload } from '../../shared/contract/protocol/game.ts'
import type { SyncPayloadMode } from '../../shared/session/sync-payload.ts'

/**
 * Issue #946 / ADR-0020 — Session test, because what a seat may see depends on
 * the round the authoritative session has reached.
 *
 * Setup: a fresh 2-player game on Explicit Seed 946 with placeholder hands, so
 * no improvement or occupation prompt can open while the rounds are played.
 * Steps: read each viewer's sync payload at round 1, play to rounds 2 and 3
 * through `takeAction` / `resolveChoice`, and read the payloads again.
 * Asserted on `state`: `gameSeed`, `roundActionOrder`, `futureMeeples`.
 * Must not change: the full-state (`debug`) payload and the viewer's own hand.
 */

const WIDE_SEED = /^[0-9a-f]{32}$/
const SAFE_ACTIONS = ['forest', 'clay-pit', 'reed-bank', 'fishing', 'day-laborer', 'grain-seeds']

const newSession = (seed?: number): GameSession => {
  const session = new GameSession(seed, undefined, { playerCount: 2 })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  return session
}

const stateFor = (
  session: GameSession,
  viewerPlayerId: string | null,
  mode: SyncPayloadMode = 'viewer',
): GameSyncPayload['state'] =>
  session.buildSyncPayload(session.getState(), viewerPlayerId, mode).state

const step = (session: GameSession, resp: SessionResponse): SessionResponse => {
  if (resp.interaction.stateId === 'wait') {
    const { request, playerIndex } = resp.interaction
    if (request.kind === 'confirm-next-player') return session.resolveChoice(request.nextPlayerIndex, 'confirm')
    if (request.kind === 'confirm-player-switch') return session.resolveChoice(request.toPlayerIndex, 'confirm')
    if (request.kind === 'feed') return session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    throw new Error(`unexpected ${request.kind} at round ${session.state.round}`)
  }
  const playerIndex = session.state.currentPlayerIndex
  const availability = session.getActionAvailability(playerIndex)
  const actionId = SAFE_ACTIONS.find((id) => availability[id])
  if (!actionId) throw new Error(`no safe action at round ${session.state.round}`)
  return session.takeAction(playerIndex, actionId)
}

const playToRound = (session: GameSession, round: number): void => {
  let resp = session.getState()
  for (let commands = 0; session.state.round < round; commands += 1) {
    if (commands > 200) throw new Error(`did not reach round ${round}`)
    resp = step(session, resp)
    expect(resp.ok).toBe(true)
  }
}

const revealedRounds = (order: readonly (string | null)[]): number[] =>
  order.flatMap((actionId, index) => (actionId === null ? [] : [index + 1]))

describe('game seed and round cards in sync payloads', () => {
  it('withholds the seed from every seat and from spectators', () => {
    const session = newSession(946)
    const [p1, p2] = session.state.players

    for (const viewer of [p1!.id, p2!.id, null]) {
      expect(stateFor(session, viewer)).not.toHaveProperty('gameSeed')
    }
    expect(stateFor(session, p1!.id, 'dev-viewer')).not.toHaveProperty('gameSeed')

    // A wide seed is distinctive enough to search the whole payload for.
    const wide = newSession()
    const wideSeed = wide.state.gameSeed as string
    for (const viewer of [wide.state.players[0]!.id, null]) {
      const payload = wide.buildSyncPayload(wide.getState(), viewer, 'viewer')
      expect(JSON.stringify(payload)).not.toContain(wideSeed)
    }
  })

  it('keeps the seed in the full-state payload', () => {
    const session = newSession(946)

    expect(stateFor(session, null, 'debug').gameSeed).toBe(946)
  })

  it('shows a round card only once its round has started', () => {
    const session = newSession(946)
    const [p1, p2] = session.state.players
    const order = [...session.state.roundActionOrder]

    for (const viewer of [p1!.id, p2!.id, null]) {
      const visible = stateFor(session, viewer).roundActionOrder
      expect(revealedRounds(visible)).toEqual([1])
      expect(visible[0]).toBe(order[0])
    }

    playToRound(session, 2)
    expect(revealedRounds(stateFor(session, p1!.id).roundActionOrder)).toEqual([1, 2])
    expect(stateFor(session, p2!.id).roundActionOrder[1]).toBe(order[1])

    // Round 4 stays face down even though it is the last stage-1 card left.
    playToRound(session, 3)
    const atRoundThree = stateFor(session, p2!.id).roundActionOrder
    expect(revealedRounds(atRoundThree)).toEqual([1, 2, 3])
    expect(atRoundThree.slice(0, 3)).toEqual(order.slice(0, 3))

    // The authoritative order itself is untouched.
    expect(session.state.roundActionOrder).toEqual(order)
  })

  it('reveals no round card while the draft or Parent Selection is still running', () => {
    for (const options of [
      { draftMode: 'simultaneous' as const, draftPoolSize: 7 },
      { enableParentCards: true },
    ]) {
      const session = new GameSession(946, undefined, { playerCount: 2, ...options })

      expect(session.state.phase).not.toBe('playing')
      expect(session.state.round).toBe(1)
      for (const viewer of [session.state.players[0]!.id, session.state.players[1]!.id, null]) {
        expect(revealedRounds(stateFor(session, viewer).roundActionOrder)).toEqual([])
      }
      expect(stateFor(session, null, 'dev-viewer').roundActionOrder).toEqual(session.state.roundActionOrder)
    }
  })

  it('hides which card goods are scheduled on until that round is revealed', () => {
    const session = newSession(946)
    const [p1, p2] = session.state.players
    const order = session.state.roundActionOrder
    session.state.futureMeeples.push(
      { id: 'near', cardId: 'TEST', playerId: p1!.id, round: 1, actionId: order[0]!, resources: { food: 1 } },
      { id: 'far', cardId: 'TEST', playerId: p1!.id, round: 6, actionId: order[5]!, resources: { food: 1 } },
    )

    for (const viewer of [p1!.id, p2!.id, null]) {
      const [near, far] = stateFor(session, viewer).futureMeeples
      expect(near).toMatchObject({ round: 1, actionId: order[0] })
      expect(far).toMatchObject({ round: 6, actionId: null, resources: { food: 1 } })
    }
    expect(stateFor(session, null, 'debug').futureMeeples[1]!.actionId).toBe(order[5])
  })

  it('lets a dev-room viewer keep the round-card order while hands stay masked', () => {
    const session = newSession(946)
    const [p1, p2] = session.state.players
    session.state.futureMeeples.push(
      { id: 'far', cardId: 'TEST', playerId: p1!.id, round: 6, actionId: session.state.roundActionOrder[5]!, resources: { food: 1 } },
    )

    const state = stateFor(session, p1!.id, 'dev-viewer')

    expect(state.roundActionOrder).toEqual(session.state.roundActionOrder)
    expect(state.futureMeeples[0]!.actionId).toBe(session.state.roundActionOrder[5])
    expect(state.players.find((player) => player.id === p1!.id)!.minorHand).toEqual(['__test_placeholder__'])
    expect(state.players.find((player) => player.id === p2!.id)!.minorHand).toEqual(['?'])
  })
})

describe('wide game seeds', () => {
  it('draws an unguessable seed when none is given', () => {
    const first = new GameSession(undefined, undefined, { playerCount: 2 })
    const second = new GameSession(undefined, undefined, { playerCount: 2 })

    expect(first.state.gameSeed).toMatch(WIDE_SEED)
    expect(second.state.gameSeed).toMatch(WIDE_SEED)
    expect(first.state.gameSeed).not.toBe(second.state.gameSeed)
    expect(first.state.roundActionOrder).toHaveLength(14)
    expect(first.state.players.every((player) => player.occupationHand.length === 7)).toBe(true)
  })

  it('keeps an Explicit Seed reproducible', () => {
    const first = new GameSession(946, undefined, { playerCount: 2 })
    const second = new GameSession(946, undefined, { playerCount: 2 })

    expect(first.state.gameSeed).toBe(946)
    expect(second.state.roundActionOrder).toEqual(first.state.roundActionOrder)
    expect(second.state.players.map((player) => [player.occupationHand, player.minorHand]))
      .toEqual(first.state.players.map((player) => [player.occupationHand, player.minorHand]))
  })

  it('survives a persistence round trip', () => {
    const session = newSession()
    const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))

    const restored = new GameSession(rehydrateState(snapshot))

    expect(restored.state.gameSeed).toBe(session.state.gameSeed)
    expect(restored.state.roundActionOrder).toEqual(session.state.roundActionOrder)
  })

  it('rolls card randomness from the wide seed, one stream per roll', () => {
    const candidates = Array.from({ length: 50 }, (_, index) => `option-${index}`)
    const rollTwice = (seed: string): string[] => {
      const session = newSession()
      session.state.gameSeed = seed
      const player = session.state.players[0]!
      return [
        rollAndCacheCardPick(session.state, player, 'TEST', 'first', candidates),
        rollAndCacheCardPick(session.state, player, 'TEST', 'second', candidates),
      ]
    }

    const picks = rollTwice('00112233445566778899aabbccddeeff')

    expect(rollTwice('00112233445566778899aabbccddeeff')).toEqual(picks)
    expect(rollTwice('ffeeddccbbaa99887766554433221100')).not.toEqual(picks)
  })
})
