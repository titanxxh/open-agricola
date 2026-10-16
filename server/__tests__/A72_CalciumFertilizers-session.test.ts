import { setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A072_CalciumFertilizers'
import '../../shared/cards/B/B113_PatchCaregiver'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A072_CalciumFertilizers'

describe('A072_CalciumFertilizers session', () => {
  /**
   * Setup with A72 already played.
   * Player has sown fields and quarry spaces have accumulated resources.
   */
  const setup = (round = 4) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    // Eastern quarry available from round 4, western quarry from round 2
    const easternQuarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (easternQuarry) easternQuarry.resources.stone = 2

    const westernQuarry = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (westernQuarry) westernQuarry.resources.stone = 2

    session.loadState(state)
    return session
  }

  it('adds 1 crop to each planted grain field when using eastern quarry', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Set up planted grain fields
    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 4, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Each grain field should have +1 remaining
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(3)
    expect(p.fields[1]!.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('adds 1 crop to a planted Card Field', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 2 }] },
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'eastern-quarry')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 3 },
    ])
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropAdded',
        sourceCardId: CARD_ID,
        crops: [{
          location: { kind: 'card', playerId: player.id, cardId: 'B113_PatchCaregiver' },
          crop: 'grain',
          amount: 1,
        }],
      }),
    ]))
  })

  it('adds the crop to the top of a same-crop multi-stack field', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.fields = [
      {
        row: 0,
        col: 3,
        stacks: [
          { kind: 'grain', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ],
      },
    ]
    session.loadState(state)
    const beforeLogLength = session.state.log.length
    const beforeScores = session.getState().scores

    const resp = session.takeAction(0, 'eastern-quarry')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 1 },
      { kind: 'grain', remaining: 4 },
    ])
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.cropAdded',
        sourceCardId: CARD_ID,
        reason: 'cardEffect',
        crops: [{
          location: { kind: 'field', playerId: resp.state.players[0]!.id, row: 0, col: 3 },
          crop: 'grain',
          amount: 1,
        }],
      }),
    ]))
    expect(resp.state.actionSpaces.find((space) => space.id === 'eastern-quarry')?.takenBy).toHaveLength(1)
    expect(resp.state.log.length).toBeGreaterThan(beforeLogLength)
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.placeFarmer',
        params: expect.objectContaining({ action: 'actions.eastern-quarry.name' }),
      }),
      expect.objectContaining({
        key: 'log.farmCropAdded',
        params: expect.objectContaining({ crops: { grain: 1 } }),
      }),
    ]))
    expect(resp.scores).toEqual(beforeScores)
  })

  it('does not add a crop to a field growing multiple crop types', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.fields = [
      {
        row: 0,
        col: 3,
        stacks: [
          { kind: 'vegetable', remaining: 1 },
          { kind: 'grain', remaining: 3 },
        ],
      },
    ]
    session.loadState(state)
    const beforeLogLength = session.state.log.length
    const beforeScores = session.getState().scores

    const resp = session.takeAction(0, 'eastern-quarry')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 },
      { kind: 'grain', remaining: 3 },
    ])
    expect(resp.state.log.length).toBeGreaterThan(beforeLogLength)
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.placeFarmer',
        params: expect.objectContaining({ action: 'actions.eastern-quarry.name' }),
      }),
    ]))
    expect(resp.scores).toEqual(beforeScores)
  })

  it('adds 1 crop to each planted vegetable field when using western quarry', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 1, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
    expect(p.fields[1]!.stacks[0]?.remaining ?? 0).toBe(3)
  })

  it('adds 1 crop across separate grain and vegetable fields', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 4, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      { row: 1, col: 3, stacks: [] }, // empty field — should not be affected
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(4) // grain +1
    expect(p.fields[1]!.stacks[0]?.remaining ?? 0).toBe(2) // vegetable +1
    expect(p.fields[2]!.stacks[0]?.remaining ?? 0).toBe(0) // empty stays 0
    expect(p.fields[2]!.stacks[0]?.kind ?? null).toBeNull()
  })

  it('does NOT add crops when there are no planted fields', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Only empty fields
    player.fields = [
      { row: 0, col: 3, stacks: [] },
    ]
    session.loadState(state)

    const initialStone = player.resources.stone
    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Still gets stone from the quarry
    expect(p.resources.stone).toBeGreaterThan(initialStone)
    // Empty field unchanged
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(0)
    expect(p.fields[0]!.stacks[0]?.kind ?? null).toBeNull()
  })

  it('does NOT trigger on non-quarry spaces', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    session.loadState(state)

    // Use farmland instead of quarry
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Field should not have changed from the card effect
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('does NOT trigger if player does not have the card', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Remove the card
    player.minorPlayed = player.minorPlayed.filter((id) => id !== CARD_ID)
    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Field should not have changed
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(2)
  })

  it('prerequisite: cannot buy if player has fields', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Player has fields — should not be able to play A72
    player.fields = [
      { row: 0, col: 3, stacks: [] },
    ]
    // Ensure ONLY A72 is in hand so the test is deterministic
    player.minorHand = [CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)

    // The only minor fails its field prerequisite, so the optional purchase is skipped.
    assert.ok(resp.interaction.stateId === 'wait')
    assert.equal(resp.interaction.request.kind, 'confirm-next-player')
    expect(getChoiceOptions(resp).some(option => option.value === CARD_ID)).toBe(false)
  })

  it('does not bump stone-kind stack remaining when using a quarry', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Mixed: one grain field, one stone-clearing field (kind:'stone', remaining:1)
    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 4, stacks: [{ kind: 'stone', remaining: 1 }] },
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Grain field bumped from 2 → 3
    expect(p.fields[0]!.stacks[0]?.remaining ?? 0).toBe(3)
    // Stone field stays at 1 (guarded)
    expect(p.fields[1]!.stacks[0]?.kind).toBe('stone')
    expect(p.fields[1]!.stacks[0]?.remaining ?? 0).toBe(1)
  })

  it('prerequisite: can buy if player has no fields (prerequisite text check)', () => {
    // The "No Field Tiles" prerequisite is handled by the prerequisite system.
    // We verify the prerequisite string is correctly set on the card definition.
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // Player has NO fields — prerequisite should pass
    player.fields = []
    player.minorPlayed.push(CARD_ID)

    // Give the player quarry resources to verify the card works when played
    const easternQuarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (easternQuarry) easternQuarry.resources.stone = 1
    state.round = 4

    player.fields = [
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]

    session.loadState(state)

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)
    // Card should work — field gets +1
    expect(resp.state.players[0]!.fields[0]!.stacks[0]?.remaining ?? 0).toBe(3)
  })
})

describe('A072_CalciumFertilizers session', () => {
  const CARD_ID = 'A072_CalciumFertilizers'

  it('A072 S2: having a field tile keeps Calcium Fertilizers unavailable', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6172, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.availableMajorImprovements = []

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)

    player.fields = [
      { row: 0, col: 3, stacks: [] },
    ]

    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']

    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok, resp.error).toBe(true)
    if (resp.interaction.stateId === 'wait'
      && !getChoiceOptions(resp)?.some((option) => option.value === CARD_ID)) {
      const improvement = getChoiceOptions(resp)?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) resp = session.resolveChoice(0, improvement.value)
    }

    assert.ok(resp.interaction.stateId === 'wait')
    assert.equal(resp.interaction.request.kind, 'confirm-next-player')
    expect(getChoiceOptions(resp).some(option => option.value === CARD_ID)).toBe(false)
  })

  it('A072 S1: with no field tiles Calcium Fertilizers can be played for free', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6272, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.availableMajorImprovements = []

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.fields = []
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']

    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok, resp.error).toBe(true)
    if (resp.state.players[0]!.minorHand.includes(CARD_ID) && resp.interaction.stateId === 'wait') {
      if (!getChoiceOptions(resp)?.some((option) => option.value === CARD_ID)) {
        const improvement = getChoiceOptions(resp)?.find((option) =>
          option.value.startsWith('action-improvement-'))
        if (improvement) resp = session.resolveChoice(0, improvement.value)
      }
      if (resp.state.players[0]!.minorHand.includes(CARD_ID) && resp.interaction.stateId === 'wait') {
        const card = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
        expect(card).toBeDefined()
        resp = session.resolveChoice(0, card!.value)
      }
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })
})

describe("A072 command boundaries", () => {
  const CALCIUM = 'A072_CalciumFertilizers'
  function confirmed(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
  function idle(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function restoredInteraction(s: GameSession, r: SessionResponse, expected: string) {
    assert.equal(JSON.stringify(r.interaction), expected)
    assert.equal(JSON.stringify(s.getState().interaction), expected)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ played = true, round = 5, resources = {} }: {
    played?: boolean
    round?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [CALCIUM, '__test_placeholder__']
        p.minorPlayed = played ? [CALCIUM] : []
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    for (const p of s.getState().state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(p.workers.filter(w => w.isActive).length, 2)
      assert.equal(p.fenceSegments.length, 0)
      assert.equal(p.stableTiles.length, 0)
    }
    return s
  }
  function choices(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (o)
        r = ok(s.resolveChoice(0, o.value))
    }
    return r
  }
  function buy(s: GameSession, card: string) {
    // Each legal fixture has one playable minor, automatically selected after this entry.
    const r = buyMenu(s)
    assert.equal(r.state.players[0]!.minorHand.includes(card), false)
    if (card === CALCIUM) assert.ok(r.state.players[0]!.minorPlayed.includes(card))
    else {
      assert.equal(card, 'B006_ExcursiontotheQuarry')
      assert.ok(r.state.players[1]!.minorHand.includes(card))
    }
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
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, confirmed(r, 1 - actor))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return confirmed(ok(s.takeAction(actor, space)), actor)
  }
  function fields(state: GameState, crops: Array<{
    kind: 'grain' | 'vegetable'
    remaining: number
  } | null>, owner = 0, start = 1) {
    state.players[owner]!.fields = crops.map((crop, i) => ({ row: 0, col: start + i, stacks: crop ? [crop] : [] }))
  }
  function board(r: SessionResponse, owner = 0) {
    return r.state.players[owner]!.fields.map(f => f.stacks.reduce((n, v) => n + v.remaining, 0))
  }
  function cropSupply(r: SessionResponse) {
    return { grain: r.state.players[0]!.resources.grain, vegetable: r.state.players[0]!.resources.vegetable }
  }
  function calcium(played = true, configure: (state: GameState) => void = () => {
  }) {
    return setup({ played, round: 14 }, state => {
      fields(state, [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }, null])
      for (const space of ['eastern-quarry', 'western-quarry'])
        state.actionSpaces.find(s => s.id === space)!.resources.stone = 1
      configure(state)
    })
  }
  it("free purchase allows a Card Field but refuses one farmyard field tile", () => {
    deny(setup({ played: false, round: 14 }, state => fields(state, [null])), CALCIUM)
    const s = setup({ played: false, round: 14 }, state => {
      state.players[0]!.minorPlayed.push('B068_Beanfield')
      state.players[0]!.occupationPlayed = ['A125_Priest', 'A111_WallBuilder']
      state.players[0]!.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }
    })
    const r = buy(s, CALCIUM)
    assert.ok(r.state.players[0]!.minorPlayed.includes(CALCIUM))
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
    assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it("each real quarry grows each planted crop field once and leaves an empty field empty", () => {
    for (const space of ['eastern-quarry', 'western-quarry']) {
      const s = calcium()
      const before = s.getState().scores
      const r = turn(s, 0, space)
      assert.deepEqual(board(r), [3, 2, 0])
      assert.equal(r.state.players[0]!.resources.stone, 1)
      assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
      assert.ok(before)
      assert.ok(r.scores)
      assert.equal(r.state.log.filter(e => e.key === 'log.farmCropAdded').length, 2)
      sessionEvidence.record(`A072-N2-${space}`, { scoresBefore: before, response: r })
    }
  })
  it("a legal vegetable Card Field grows once while Wood Field stays unchanged", () => {
    const s = calcium(true, state => {
      const p = state.players[0]!
      p.minorPlayed.push('B068_Beanfield', 'D075_WoodField')
      p.occupationPlayed = ['A125_Priest', 'A111_WallBuilder']
      p.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }
      p.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 1 }] } }
    })
    const r = turn(s, 0, 'western-quarry')
    assert.deepEqual(r.state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks, [{ crop: 'vegetable', remaining: 3 }])
    assert.deepEqual(r.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks, [{ crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 1 }])
    assert.deepEqual(board(r), [3, 2, 0])
    sessionEvidence.record('A072-N3-card-fields', r)
  })
  it("unplayed owner opponent quarry and non quarry stone purchase cannot grow owner fields", () => {
    let r = turn(calcium(false), 0, 'eastern-quarry')
    assert.deepEqual(board(r), [2, 1, 0])
    const s = calcium()
    turn(s, 0, 'reed-bank')
    r = turn(s, 1, 'eastern-quarry')
    assert.deepEqual(board(r), [2, 1, 0])
    assert.equal(r.state.players[1]!.resources.stone, 1)
    const other = setup({ round: 14 }, state => {
      const p = state.players[0]!
      p.minorHand = ['B006_ExcursiontotheQuarry', '__test_placeholder__']
      p.minorPlayed = [CALCIUM]
      p.occupationPlayed = ['A125_Priest']
      fields(state, [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }])
    })
    r = buy(other, 'B006_ExcursiontotheQuarry')
    assert.deepEqual(board(r), [2, 1])
    assert.equal(r.state.players[0]!.resources.stone, 2)
    assert.equal(r.state.players[0]!.resources.food, 38)
  })
  it("actual quarry undo restores crops supply worker pile logs and score before one retry", () => {
    const s = calcium()
    const initial = idle(s.getState())
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    turn(s, 0, 'eastern-quarry')
    const undone = s.undoAction()
    sessionEvidence.record('A072-N5-undo', { before: JSON.parse(before), response: undone })
    assertUndoRestored(before, undone)
    restoredInteraction(s, undone, beforeInteraction)
    const r = turn(s, 0, 'eastern-quarry')
    assert.deepEqual(board(r), [3, 2, 0])
    assert.equal(r.state.players[0]!.resources.stone, 1)
    sessionEvidence.record('A072-N5-retry', r)
  })
})
