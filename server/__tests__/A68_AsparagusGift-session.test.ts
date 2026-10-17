import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { A068_AsparagusGift } from '../../shared/cards/A/A068_AsparagusGift'
import '../../shared/cards/B/B030_WoodPalisades'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit09Sources from './_helpers/audit/ae-negative-09-sources'

const CARD_ID = 'A068_AsparagusGift'
const B30 = 'B030_WoodPalisades'

// Tile (0,0) edges
const tile00Fences = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
// For palisades, only border edges of tile (0,0) are valid: H-0-0 (top) and V-0-0 (left).
// Complete the enclosure with internal fences: H-1-0, V-0-1.
const tile00BorderPalisades = ['H-0-0', 'V-0-0']
const tile00InternalFences = ['H-1-0', 'V-0-1']

const setup = (opts: { withB30?: boolean; wood: number; round?: number }) => {
  const session = new GameSession(42)
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
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = []
      expect(session.withCtx(() => meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state))).toBe(false)
    })

    it('allows when player has at least one empty field', () => {
      const session = new GameSession(42)
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(session.withCtx(() => meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state))).toBe(true)
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

describe('ae-negative-09-sources', () => {
  const { GIFT, sessions, save, buy, deny, turn, one, gift, commit, fence, outcome } = audit09Sources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A068 N1 a real empty field allows a free purchase without immediate vegetable', () => { const s = gift({ played: false, wood: 0 }), r = buy(s, GIFT); assert.ok(r.state.players[0]!.minorPlayed.includes(GIFT)); assert.deepEqual(outcome(s, r), { wood: 0, fences: 0, reserveFences: 15, vegetable: 0 }) })
  it('A068 N2 missing owner unplanted field prevents purchase', () => { for (const variant of ['none', 'planted', 'opponent']) { const s = gift({ played: false }, state => { state.players[0]!.fields = variant === 'planted' ? [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }] : []; if (variant === 'opponent') state.players[1]!.fields = [{ row: 0, col: 0, stacks: [] }] }); deny(s, GIFT) } })
  it('A068 N3 three new fences at round four give no vegetable despite seven total', () => { const s = gift({ edges: one }), r = fence(s, ['H-0-2', 'H-1-2', 'V-0-3']); assert.deepEqual(outcome(s, r), { wood: 7, fences: 7, reserveFences: 8, vegetable: 0 }) })
  it('A068 N4 four new fences at round four immediately give one vegetable', () => { const s = gift(), r = fence(s); assert.deepEqual(outcome(s, r), { wood: 6, fences: 4, reserveFences: 11, vegetable: 1 }); assert.equal(r.state.log.filter(e => e.key === 'log.cardTriggered' && e.params?.cardId === GIFT && e.params?.triggerAction === 'actions.gain.name').length, 1) })
  it('A068 N5 five new fences at round four give exactly one vegetable', () => { const s = gift({ edges: one }), r = fence(s, ['H-0-2', 'H-0-3', 'H-1-2', 'H-1-3', 'V-0-4']); assert.deepEqual(outcome(s, r), { wood: 5, fences: 9, reserveFences: 6, vegetable: 1 }) })
  it('A068 N6 eight new fences still award only one vegetable', () => { const s = gift({ wood: 12 }), r = fence(s, ['H-0-1', 'H-0-2', 'H-0-3', 'H-1-1', 'H-1-2', 'H-1-3', 'V-0-1', 'V-0-4']); assert.deepEqual(outcome(s, r), { wood: 4, fences: 8, reserveFences: 7, vegetable: 1 }) })
  it('A068 N7 opponent fencing and unplayed owner fencing give no owner vegetable', () => { const s = gift({}, state => { state.players[1]!.resources.wood = 10 }); turn(s, 0, 'forest'); const r = fence(s, one, 1); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.deepEqual(outcome(s, r, 1), { wood: 6, fences: 4, reserveFences: 11, vegetable: 0 }); assert.equal(fence(gift({ played: false })).state.players[0]!.resources.vegetable, 0) })
  it('A068 N8 duplicate fence packet does not build or reward twice and illegal targets fail', () => { const duplicate = gift(); turn(duplicate, 0, 'fencing'); const r = commit(duplicate, [...one, one[0]!]); save('A068-N8-duplicate', r); assert.deepEqual(outcome(duplicate, r), { wood: 6, fences: 4, reserveFences: 11, vegetable: 1 }); const s = gift(); turn(s, 0, 'fencing'); for (const edges of [['H-99-99', 'H-99-100', 'H-100-99', 'H-100-100'], one.slice(0, 3), ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 })); assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { edges: one, palisadeEdges: [], extraWood: 0 })); assert.deepEqual(outcome(s, commit(s)), { wood: 6, fences: 4, reserveFences: 11, vegetable: 1 }) })
  it('A068 N9 insufficient wood and exhausted finite fence supply cannot award vegetable', () => { const low = gift({ wood: 3 }), lowBefore = undoRuleSnapshot(low.getState()); assertRejectedUnchanged(low, () => low.takeAction(0, 'fencing')); assertRejectedUnchanged(low, () => low.commitSelectionChoice(0, { edges: one, palisadeEdges: [], extraWood: 0 })); assert.equal(undoRuleSnapshot(low.getState()), lowBefore); turn(low, 0, 'forest'); turn(low, 1, 'grain-seeds'); assert.deepEqual(outcome(low, fence(low)), { wood: 2, fences: 4, reserveFences: 11, vegetable: 1 }); const edges = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-0-1', 'V-0-2', 'V-0-3', 'V-1-1', 'V-1-2', 'V-1-3', 'H-3-2', 'V-2-2', 'V-2-3']; const full = gift({ edges }), fullBefore = undoRuleSnapshot(full.getState()); assertRejectedUnchanged(full, () => full.takeAction(0, 'fencing')); assertRejectedUnchanged(full, () => full.commitSelectionChoice(0, { edges: ['H-0-3', 'H-1-3', 'V-0-4'], palisadeEdges: [], extraWood: 0 })); save('A068-N9-zero-supply', full.getState()); assert.equal(undoRuleSnapshot(full.getState()), fullBefore); assert.equal(outcome(full, turn(full, 0, 'grain-seeds')).vegetable, 0) })
  it('A068 N10 actual fence undo restores payment reserve and vegetable before legal retry', () => { const s = gift(), before = undoRuleSnapshot(s.getState()); fence(s); assertUndoRestored(before, s.undoAction()); assert.deepEqual(outcome(s, fence(s)), { wood: 6, fences: 4, reserveFences: 11, vegetable: 1 }); save('A068-N10-undo-retry', s.getState()) })
})
