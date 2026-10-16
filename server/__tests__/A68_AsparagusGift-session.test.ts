import { setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A068_AsparagusGift } from '../../shared/cards/A/A068_AsparagusGift'
import '../../shared/cards/B/B030_WoodPalisades'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState, type Resource } from '../../shared/contract/types'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A068_AsparagusGift'

const B30 = 'B030_WoodPalisades'

const tile00Fences = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']

const tile00BorderPalisades = ['H-0-0', 'V-0-0']

const tile00InternalFences = ['H-1-0', 'V-0-1']

const setup = (opts: { withB30?: boolean; wood: number; round?: number }) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 } }))
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
      const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 } }))
      stabilizeRandomHands(session.state.players)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = []
      expect(session.withCtx(() => meetsCardPrerequisites(player, A068_AsparagusGift, state.round, state))).toBe(false)
    })

    it('allows when player has at least one empty field', () => {
      const session = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 } }))
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
    const session = sessionEvidence.track(createWorkSession({ seed: 6068, options: { playerCount: 2 } }))
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
      && !getChoiceOptions(resp).some((option) => option.value === CARD_ID)) {
      const enter = getChoiceOptions(resp).find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    return resp.interaction.stateId === 'wait'
      ? getChoiceOptions(resp).map((option) => option.value) ?? []
      : []
  }

  it('A068 S1: an unplanted field allows playing Asparagus Gift for free', () => {
    const session = setupPlay(true)
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !getChoiceOptions(resp).some((option) => option.value === CARD_ID)) {
      const enter = getChoiceOptions(resp).find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)) {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const card = getChoiceOptions(resp).find((option) => option.value === CARD_ID)
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

describe('A068 command boundaries', () => {
  const CARD_ID = 'A068_AsparagusGift'
  function save(name: string, value: unknown) {
    sessionEvidence.record(name, value)
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(
    {
      round = 14,
      played = true,
      resources = {},
    }: { round?: number; played?: boolean; resources?: Partial<Resource> } = {},
    configure: (state: GameState) => void = () => {},
  ) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 4242,
        options: { playerCount: 2 },
        configure(state) {
          state.round = round
          state.availableMajorImprovements = []
          for (const p of state.players)
            Object.assign(p.resources, {
              food: 40,
              wood: 0,
              clay: 0,
              reed: 0,
              stone: 0,
              grain: 0,
              vegetable: 0,
              sheep: 0,
              boar: 0,
              cattle: 0,
            })
          const p = state.players[0]!
          p.minorHand = played
            ? ['__test_placeholder__']
            : [CARD_ID, '__test_placeholder__']
          p.minorPlayed = played ? [CARD_ID] : []
          Object.assign(p.resources, resources)
          configure(state)
        },
      }),
    )
    s.withCtx(() => {
      for (const p of s.state.players)
        assert.equal(
          getOwnOrdinaryFenceReserveCount(p),
          15 - p.fenceSegments.length,
        )
    })
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'choice',
      JSON.stringify(r.interaction),
    )
    return getChoiceOptions(r)
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice'
    ) {
      const entry = getChoiceOptions(r).find((o) =>
        o.value.startsWith('action-improvement-'),
      )
      if (entry) r = ok(s.resolveChoice(0, entry.value))
    }
    return r
  }
  function buy(s: GameSession, card: string) {
    // These fixtures have one playable minor, selected automatically after the improvement entry.
    const r = buyMenu(s)
    assert.ok(r.state.players[0]!.minorPlayed.includes(card))
    assert.equal(r.state.players[0]!.minorHand.includes(card), false)
    return confirmed(r)
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    confirmed(s.getState())
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'confirm-next-player'
    )
      r = confirmNext(s, confirmed(r, 1 - actor))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  let nativeSequence = 0
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const before = s.getState(),
      r = ok(s.takeAction(actor, space))
    save(`native-${++nativeSequence}`, {
      command: 'takeAction',
      actor,
      space,
      before,
      response: r,
    })
    if (['forest', 'grain-seeds', 'clay-pit'].includes(space)) confirmed(r, actor)
    return r
  }
  const one = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
  function fences(p: PlayerState, edges: string[]) {
    p.fenceSegments = edges.map((edge) => ({
      edge,
      type: 'fence',
      source: { kind: 'own', ownerPlayerId: p.id },
    }))
  }
  function gift(
    {
      played = true,
      wood = 10,
      edges = [],
    }: {
      played?: boolean
      wood?: number
      edges?: string[]
    } = {},
    configure: (state: GameState) => void = () => {},
  ) {
    return setup({ round: 4, played, resources: { wood } }, (state) => {
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
      fences(state.players[0]!, edges)
      configure(state)
    })
  }
  function commit(s: GameSession, edges = one, actor = 0) {
    return confirmed(ok(
      s.commitSelectionChoice(actor, {
        edges,
        palisadeEdges: [],
        extraWood: 0,
      }),
    ), actor)
  }
  function fence(s: GameSession, edges = one, actor = 0) {
    const r = turn(s, actor, 'fencing')
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'farm-select',
      JSON.stringify(r.interaction),
    )
    return commit(s, edges, actor)
  }
  function outcome(s: GameSession, r: SessionResponse, actor = 0) {
    const p = r.state.players[actor]!
    return {
      wood: p.resources.wood,
      fences: p.fenceSegments.length,
      reserveFences: s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)),
      vegetable: p.resources.vegetable,
    }
  }
  it('a real empty field allows a free purchase without immediate vegetable', () => {
    const s = gift({ played: false, wood: 0 }),
      r = buy(s, CARD_ID)
    assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
    assert.deepEqual(outcome(s, r), {
      wood: 0,
      fences: 0,
      reserveFences: 15,
      vegetable: 0,
    })
  })
  it('missing owner unplanted field prevents purchase', () => {
    for (const variant of ['none', 'planted', 'opponent']) {
      const s = gift({ played: false }, (state) => {
        state.players[0]!.fields =
          variant === 'planted'
            ? [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
            : []
        if (variant === 'opponent')
          state.players[1]!.fields = [{ row: 0, col: 0, stacks: [] }]
      })
      deny(s, CARD_ID)
    }
  })
  it('three new fences at round four give no vegetable despite seven total', () => {
    const s = gift({ edges: one }),
      r = fence(s, ['H-0-2', 'H-1-2', 'V-0-3'])
    assert.deepEqual(outcome(s, r), {
      wood: 7,
      fences: 7,
      reserveFences: 8,
      vegetable: 0,
    })
  })
  it('four new fences at round four immediately give one vegetable', () => {
    const s = gift(),
      r = fence(s)
    assert.deepEqual(outcome(s, r), {
      wood: 6,
      fences: 4,
      reserveFences: 11,
      vegetable: 1,
    })
    assert.equal(
      r.state.log.filter(
        (e) =>
          e.key === 'log.cardTriggered' &&
          e.params?.cardId === CARD_ID &&
          e.params?.triggerAction === 'actions.gain.name',
      ).length,
      1,
    )
  })
  it('five new fences at round four give exactly one vegetable', () => {
    const s = gift({ edges: one }),
      r = fence(s, ['H-0-2', 'H-0-3', 'H-1-2', 'H-1-3', 'V-0-4'])
    assert.deepEqual(outcome(s, r), {
      wood: 5,
      fences: 9,
      reserveFences: 6,
      vegetable: 1,
    })
  })
  it('eight new fences still award only one vegetable', () => {
    const s = gift({ wood: 12 }),
      r = fence(s, [
        'H-0-1',
        'H-0-2',
        'H-0-3',
        'H-1-1',
        'H-1-2',
        'H-1-3',
        'V-0-1',
        'V-0-4',
      ])
    assert.deepEqual(outcome(s, r), {
      wood: 4,
      fences: 8,
      reserveFences: 7,
      vegetable: 1,
    })
  })
  it('opponent fencing and unplayed owner fencing give no owner vegetable', () => {
    const s = gift({}, (state) => {
      state.players[1]!.resources.wood = 10
    })
    turn(s, 0, 'forest')
    const r = fence(s, one, 1)
    assert.equal(r.state.players[0]!.resources.vegetable, 0)
    assert.deepEqual(outcome(s, r, 1), {
      wood: 6,
      fences: 4,
      reserveFences: 11,
      vegetable: 0,
    })
    assert.equal(
      fence(gift({ played: false })).state.players[0]!.resources.vegetable,
      0,
    )
  })
  it('duplicate fence packet does not build or reward twice and illegal targets fail', () => {
    const duplicate = gift()
    turn(duplicate, 0, 'fencing')
    const r = commit(duplicate, [...one, one[0]!])
    save('A068-N8-duplicate', r)
    assert.deepEqual(outcome(duplicate, r), {
      wood: 6,
      fences: 4,
      reserveFences: 11,
      vegetable: 1,
    })
    const s = gift()
    turn(s, 0, 'fencing')
    for (const edges of [
      ['H-99-99', 'H-99-100', 'H-100-99', 'H-100-100'],
      one.slice(0, 3),
      ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
    ])
      assertRejectedUnchanged(s, () =>
        s.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 }),
      )
    assertRejectedUnchanged(s, () =>
      s.commitSelectionChoice(1, {
        edges: one,
        palisadeEdges: [],
        extraWood: 0,
      }),
    )
    assert.deepEqual(outcome(s, commit(s)), {
      wood: 6,
      fences: 4,
      reserveFences: 11,
      vegetable: 1,
    })
  })
  it('insufficient wood and exhausted finite fence supply cannot award vegetable', () => {
    const low = gift({ wood: 3 }),
      lowBefore = undoRuleSnapshot(low.getState())
    assertRejectedUnchanged(low, () => low.takeAction(0, 'fencing'))
    assertRejectedUnchanged(low, () =>
      low.commitSelectionChoice(0, {
        edges: one,
        palisadeEdges: [],
        extraWood: 0,
      }),
    )
    assert.equal(undoRuleSnapshot(low.getState()), lowBefore)
    turn(low, 0, 'forest')
    turn(low, 1, 'grain-seeds')
    assert.deepEqual(outcome(low, fence(low)), {
      wood: 2,
      fences: 4,
      reserveFences: 11,
      vegetable: 1,
    })
    const edges = [
      'H-0-1',
      'H-0-2',
      'H-1-1',
      'H-1-2',
      'H-2-1',
      'H-2-2',
      'V-0-1',
      'V-0-2',
      'V-0-3',
      'V-1-1',
      'V-1-2',
      'V-1-3',
      'H-3-2',
      'V-2-2',
      'V-2-3',
    ]
    const full = gift({ edges }),
      fullBefore = undoRuleSnapshot(full.getState())
    assertRejectedUnchanged(full, () => full.takeAction(0, 'fencing'))
    assertRejectedUnchanged(full, () =>
      full.commitSelectionChoice(0, {
        edges: ['H-0-3', 'H-1-3', 'V-0-4'],
        palisadeEdges: [],
        extraWood: 0,
      }),
    )
    save('A068-N9-zero-supply', full.getState())
    assert.equal(undoRuleSnapshot(full.getState()), fullBefore)
    assert.equal(outcome(full, turn(full, 0, 'grain-seeds')).vegetable, 0)
  })
  it('actual fence undo restores payment reserve and vegetable before legal retry', () => {
    const s = gift(),
      initial = s.getState()
    assert.equal(initial.interaction.stateId, 'idle')
    assert.equal(initial.state.currentPlayerIndex, 0)
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    fence(s)
    const restored = s.undoAction()
    assertUndoRestored(before, restored)
    assert.equal(JSON.stringify(restored.interaction), beforeInteraction)
    assert.equal(JSON.stringify(s.getState().interaction), beforeInteraction)
    assert.equal(restored.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    assert.deepEqual(outcome(s, fence(s)), {
      wood: 6,
      fences: 4,
      reserveFences: 11,
      vegetable: 1,
    })
    save('A068-N10-undo-retry', s.getState())
  })
})
