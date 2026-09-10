import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { A068_AsparagusGift } from '../../shared/cards/A/A068_AsparagusGift'
import '../../shared/cards/B/B030_WoodPalisades'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'A068_AsparagusGift'
const B30 = 'B030_WoodPalisades'

// Tile (0,0) edges
const tile00Fences = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
// For palisades, only border edges of tile (0,0) are valid: H-0-0 (top) and V-0-0 (left).
// Complete the enclosure with internal fences: H-1-0, V-0-1.
const tile00BorderPalisades = ['H-0-0', 'V-0-0']
const tile00InternalFences = ['H-1-0', 'V-0-1']

const setup = (opts: { withB30?: boolean; wood: number; round?: number }) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = opts.round ?? 3

  const player = state.players[0]!
  player.resources = { ...player.resources, wood: opts.wood }
  player.minorPlayed = [...player.minorPlayed, CARD_ID]
  player.minorPlayed.push(CARD_ID)
  if (opts.withB30) {
    player.minorPlayed.push(B30)
  }

  session.loadState(state)
  return session
}

describe('A68 Asparagus Gift — session', () => {
  it('does not award vegetable when palisade-dominated build at round 3 has fewer real fences than round', () => {
    // fencesBuilt measured via getFenceCount (regular fences only). Delta must be < round.
    // 2 palisades (border: H-0-0, V-0-0) + 2 real fences (internal: H-1-0, V-0-1).
    // fencesBuilt = 2, round = 3 → 2 < 3 → no vegetable.
    // Cost: 2 palisades × 2 + 2 fences × 1 = 6 wood.
    const session = setup({ withB30: true, wood: 6, round: 3 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: tile00InternalFences,
      palisadeEdges: tile00BorderPalisades,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(0)
  })

  it('awards 1 vegetable when building 4 real fences at round 3', () => {
    const session = setup({ wood: 4, round: 3 })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: tile00Fences,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(1)
  })

  describe('prerequisite "1 Unplanted Field"', () => {
    it('blocks when player has no empty fields', () => {
      const session = new GameSession()
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = []
      expect(meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state)).toBe(false)
    })

    it('allows when player has at least one empty field', () => {
      const session = new GameSession()
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state)).toBe(true)
    })
  })
})

describe('A68 Asparagus Gift — session', () => {
  const CARD_ID = 'A068_AsparagusGift'

  const setupPlay = (withEmptyField: boolean) => {
    const session = new GameSession(6068, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID, 'A025_Bassinet']
    player.occupationHand = ['__test_placeholder__']
    player.fields = withEmptyField ? [{ row: 0, col: 3, stacks: [] }] : []
    player.resources.wood = 1
    player.resources.reed = 1
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  const offeredMinorIds = (session: GameSession) => {
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok, resp.error).toBe(true)
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
      const enter = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    return resp.interaction.stateId === 'wait'
      ? resp.interaction.request.options?.map((option) => option.value) ?? []
      : []
  }

  it('A068 S1: an unplanted field allows playing Asparagus Gift for free', () => {
    const session = setupPlay(true)
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
      const enter = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)) {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      resp = session.resolveChoice(0, card!.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A068 S2: without an unplanted field Asparagus Gift is not offered', () => {
    expect(offeredMinorIds(setupPlay(false))).not.toContain(CARD_ID)
  })
})
