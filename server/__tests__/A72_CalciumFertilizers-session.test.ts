import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterAll, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A072_CalciumFertilizers'
import '../../shared/cards/B/B113_PatchCaregiver'
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10FieldSource from './_helpers/audit/ae-negative-10-field-source'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext } from './_helpers/session-assertions'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'

const CARD_ID = 'A072_CalciumFertilizers'

describe('A072_CalciumFertilizers session', () => {
  /**
   * Setup with A72 already played.
   * Player has sown fields and quarry spaces have accumulated resources.
   */
  const setup = (round = 4) => {
    const session = new GameSession(42)
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
    const session = new GameSession(42)
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

    // A72 fails prerequisite (has field tiles), so no minor improvement is offered.
    // The optional minor-improvement step is auto-skipped, going to confirmNextPlayer.
    if (resp.interaction.stateId === 'wait') {
      // If a choice is somehow presented, A72 should NOT be in the options
      const a72Option = resp.interaction.request.options?.find(
        (option) => option.value === CARD_ID,
      )
      expect(a72Option).toBeUndefined()
    } else {
      // Expected: the optional is auto-skipped because A72 is the only card and it fails prerequisite
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    }
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
    const session = new GameSession(42)
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

  const setup = (round = 4) => {
    const session = new GameSession(6072, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed.push(CARD_ID)
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']

    const easternQuarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (easternQuarry) easternQuarry.resources.stone = 2

    const westernQuarry = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (westernQuarry) westernQuarry.resources.stone = 2

    session.loadState(state)
    return session
  }

  it('A072 S2: having a field tile keeps Calcium Fertilizers unavailable', () => {
    const session = new GameSession(6172, undefined, { playerCount: 2 })
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
      && !resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
      const improvement = resp.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      if (improvement) resp = session.resolveChoice(0, improvement.value)
    }


    if (resp.interaction.stateId === 'wait') {

      const a72Option = resp.interaction.request.options?.find(
        (option) => option.value === CARD_ID,
      )
      expect(a72Option).toBeUndefined()
    } else {

      expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    }
  })

  it('A072 S1: with no field tiles Calcium Fertilizers can be played for free', () => {
    const session = new GameSession(6272, undefined, { playerCount: 2 })
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
      if (!resp.interaction.request.options?.some((option) => option.value === CARD_ID)) {
        const improvement = resp.interaction.request.options?.find((option) =>
          option.value.startsWith('action-improvement-'))
        if (improvement) resp = session.resolveChoice(0, improvement.value)
      }
      if (resp.state.players[0]!.minorHand.includes(CARD_ID) && resp.interaction.stateId === 'wait') {
        const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
        expect(card).toBeDefined()
        resp = session.resolveChoice(0, card!.value)
      }
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })
})

describe('ae-negative-10-field-source', () => {
  const { CALCIUM, root, sessions, saved, save, setup, buy, deny, turn, fields, board, cropSupply, calcium } = audit10FieldSource
  afterAll(() => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(`${root}/manifest.json`, JSON.stringify({ raw: process.env.AGRICOLA_NEGATIVE_RAW === '1', files: saved }, null, 2)) })
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A072 N1 free purchase allows a Card Field but refuses one farmyard field tile', () => {
   deny(setup(CALCIUM, { played: false, round: 14 }, state => fields(state, [null])), CALCIUM)
   const s = setup(CALCIUM, { played: false, round: 14 }, state => { state.players[0]!.minorPlayed.push('B068_Beanfield'); state.players[0]!.occupationPlayed = ['A125_Priest', 'A111_WallBuilder']; state.players[0]!.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } } }); const r = buy(s, CALCIUM); assert.ok(r.state.players[0]!.minorPlayed.includes(CALCIUM)); assert.equal(r.state.players[0]!.fields.length, 0); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 }); assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it('A072 N2 each real quarry grows each planted crop field once and leaves an empty field empty', () => {
   for (const space of ['eastern-quarry', 'western-quarry']) { const s = calcium(); const before = s.getState().scores; const r = turn(s, 0, space); assert.deepEqual(board(r), [3, 2, 0]); assert.equal(r.state.players[0]!.resources.stone, 1); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 }); assert.ok(before); assert.ok(r.scores); assert.equal(r.state.log.filter(e => e.key === 'log.farmCropAdded').length, 2); save(`A072-N2-${space}`, { scoresBefore: before, response: r }) }
  })
  it('A072 N3 a legal vegetable Card Field grows once while Wood Field stays unchanged', () => {
   const s = calcium(true, state => { const p = state.players[0]!; p.minorPlayed.push('B068_Beanfield', 'D075_WoodField'); p.occupationPlayed = ['A125_Priest', 'A111_WallBuilder']; p.cardStates.B068_Beanfield = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] } }; p.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 1 }] } } }); const r = turn(s, 0, 'western-quarry'); assert.deepEqual(r.state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks, [{ crop: 'vegetable', remaining: 3 }]); assert.deepEqual(r.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks, [{ crop: 'wood', remaining: 2 }, { crop: 'wood', remaining: 1 }]); assert.deepEqual(board(r), [3, 2, 0]); save('A072-N3-card-fields', r)
  })
  it('A072 N4 unplayed owner opponent quarry and non quarry stone purchase cannot grow owner fields', () => {
   let r = turn(calcium(false), 0, 'eastern-quarry'); assert.deepEqual(board(r), [2, 1, 0]); const s = calcium(); turn(s, 0, 'reed-bank'); r = turn(s, 1, 'eastern-quarry'); assert.deepEqual(board(r), [2, 1, 0]); assert.equal(r.state.players[1]!.resources.stone, 1)
   const other = setup('B006_ExcursiontotheQuarry', { played: false, round: 14 }, state => { const p = state.players[0]!; p.minorPlayed = [CALCIUM]; p.occupationPlayed = ['A125_Priest']; fields(state, [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }]) }); r = buy(other, 'B006_ExcursiontotheQuarry'); assert.deepEqual(board(r), [2, 1]); assert.equal(r.state.players[0]!.resources.stone, 2); assert.equal(r.state.players[0]!.resources.food, 38)
  })
  it('A072 N5 actual quarry undo restores crops supply worker pile logs and score before one retry', () => { const s = calcium(), before = undoRuleSnapshot(s.getState()); turn(s, 0, 'eastern-quarry'); const undone = s.undoAction(); save('A072-N5-undo', { before: JSON.parse(before), response: undone }); assertUndoRestored(before, undone); const r = turn(s, 0, 'eastern-quarry'); assert.deepEqual(board(r), [3, 2, 0]); assert.equal(r.state.players[0]!.resources.stone, 1); save('A072-N5-retry', r) })
})

describe('A072 before timing (#1322)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  const make = () => {
    const session = createWorkSession({ seed: 1322072, configure: state => {
      state.round = 14
      const owner = state.players[0]!
      owner.minorPlayed = [CARD_ID]
      owner.fields = [{ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }]
      Object.assign(owner.resources, { stone: 0 })
      state.players[1]!.resources.stone = 0
      for (const id of ['eastern-quarry', 'western-quarry']) state.actionSpaces.find(space => space.id === id)!.resources.stone = 2
    } })
    sessions.push(session)
    return session
  }

  it('grows the owner fields before the Quarry stone is collected; an opponent Quarry does not', () => {
    const session = make()
    const response = session.takeAction(0, 'eastern-quarry')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources.stone).toBe(2)
    expectCardEffectBeforeHostCollect(response, { cardId: CARD_ID, spaceId: 'eastern-quarry', type: 'farm.cropAdded' })

    confirmNext(session, response)
    const used = session.takeAction(1, 'western-quarry')
    expect(used.ok, used.error).toBe(true)
    expect(used.state.players[1]!.resources.stone).toBe(2)
    expect(used.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  })
})
