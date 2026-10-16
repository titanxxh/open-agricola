import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A124_Knapper'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A124_Knapper'

describe('A124_Knapper session', () => {
  const setupForRound = (round: number, revealedSpaceId: string) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    // Reveal the specified action-card space on the given round.
    state.roundActionOrder[round - 1] = revealedSpaceId

    // Stock the revealed space with some resources so we can measure gain.
    const space = state.actionSpaces.find((s) => s.id === revealedSpaceId)
    if (space) {
      space.resources.stone = 1
    }

    session.loadState(state)
    return session
  }

  it('grants 1 STONE when placing on a round-5 action-card space', () => {
    const session = setupForRound(5, 'western-quarry')
    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Space yields 1 stone (we stocked 1). Card adds +1. Total = 2.
    expect(p.resources.stone ?? 0).toBe(2)
  })

  it('grants 1 STONE when placing on a round-7 action-card space', () => {
    const session = setupForRound(7, 'western-quarry')
    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    expect(p.resources.stone ?? 0).toBe(2)
  })

  it('does not trigger on a non-action-card space (day-laborer)', () => {
    const session = setupForRound(5, 'western-quarry')
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // day-laborer is a common (not round-card) space; knapper shouldn't fire.
    expect(p.resources.stone ?? 0).toBe(0)
  })

  it('does not trigger on round 4 action-card space (outside 5-7 range)', () => {
    // Space revealed on round 4 — the card should NOT trigger.
    const session = setupForRound(4, 'eastern-quarry')
    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // eastern-quarry gives stone from its accumulated resources, but Knapper
    // should add nothing (only 1 stone from the space, not 2).
    // We stocked the space with 1 stone, so total should be exactly 1.
    expect(p.resources.stone ?? 0).toBe(1)
  })

  it('does not trigger when card is not played', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundActionOrder[4] = 'western-quarry'

    const wq = state.actionSpaces.find((s) => s.id === 'western-quarry')
    if (wq) wq.resources.stone = 1

    session.loadState(state)

    const resp = session.takeAction(0, 'western-quarry')
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Only the space's own stone (1), no bonus from Knapper.
    expect(p.resources.stone ?? 0).toBe(1)
  })
})

describe('A124 Knapper parity', () => {
  const CARD_ID = 'A124_Knapper'

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true }: { played?: boolean } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6124, options: { playerCount: 2 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[4] = 'pig-market'
    state.roundActionOrder[5] = 'vegetable-seeds'
    state.roundActionOrder[6] = 'western-quarry'
    state.roundActionOrder[7] = 'cattle-market'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    for (const id of ['pig-market', 'vegetable-seeds', 'western-quarry', 'cattle-market']) {
      const space = state.actionSpaces.find((candidate) => candidate.id === id)
      if (!space) throw new Error(`missing ${id}`)
      space.roundAvailable = 1
      space.takenBy = []
    }
    state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 0
    state.actionSpaces.find((space) => space.id === 'western-quarry')!.resources.stone = 0
    state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 1
    session.loadState(state)
    return session
  }

  it('A124 S2: its before stone cannot authorize an empty round-five Pig Market', () => {
    const session = setup()
    const before = session.getState()
    expect(session.getActionAvailability(0)['pig-market']).toBe(false)

    const response = session.takeAction(0, 'pig-market')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, boar: 0 })
  })

  it('A124 S3: using the round-six Vegetable Seeds gains exactly one stone', () => {
    const response = setup().takeAction(0, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, vegetable: 1 })
  })

  it('A124 S4: its before stone cannot authorize an empty round-seven Western Quarry', () => {
    const session = setup()
    const before = session.getState()
    expect(session.getActionAvailability(0)['western-quarry']).toBe(false)

    const response = session.takeAction(0, 'western-quarry')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('A124 S5: round-eight and basic action spaces grant no Knapper stone', () => {
    const roundEight = setup().takeAction(0, 'cattle-market')
    expect(roundEight.ok, roundEight.error).toBe(true)
    expect(roundEight.state.players[0]!.resources.stone).toBe(0)

    const basic = setup().takeAction(0, 'day-laborer')
    expect(basic.ok, basic.error).toBe(true)
    expect(basic.state.players[0]!.resources.stone).toBe(0)
  })
})

describe("A124 command boundaries", () => {
  const KNAP = 'A124_Knapper'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true, round = 14) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [KNAP] : []
        state.players[0]!.occupationHand = played ? ['A110_Roughcaster'] : [KNAP, 'A110_Roughcaster']
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function knapper(played = true, stone = 0) {
    return setup(state => {
      state.roundActionOrder = state.roundActionOrder.map(() => null)
      state.roundActionOrder[4] = 'pig-market'
      state.roundActionOrder[5] = 'vegetable-seeds'
      state.roundActionOrder[6] = 'western-quarry'
      state.roundActionOrder[7] = 'cattle-market'
      for (const id of ['pig-market', 'vegetable-seeds', 'western-quarry', 'cattle-market'])
        state.actionSpaces.find(a => a.id === id)!.roundAvailable = 1
      state.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = 0
      state.actionSpaces.find(a => a.id === 'western-quarry')!.resources.stone = stone
      state.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 1
    }, played)
  }
  it("assigned round five and seven empty accumulation rejects before any stone bonus", () => {
    for (const space of ['pig-market', 'western-quarry']) {
      const s = knapper()
      const r = assertEmptyAccumulationRejected(s, 0, space)
      assert.equal(r.state.players[0]!.resources.stone, 0)
      assert.equal(r.state.players[0]!.resources.boar, 0)
      assert.equal(r.interaction.stateId, 'idle')
      assert.equal(r.state.currentPlayerIndex, 0)
      sessionEvidence.record(`A124-N1-${space}`, r)
    }
  })
  it("round six vegetable gives stone once and later current round remains eligible", () => {
    const s = knapper()
    const r = turn(s, 0, 'vegetable-seeds')
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.round, 14)
    assert.equal(r.state.players[0]!.resources.stone, 1)
    assert.equal(r.state.players[0]!.resources.vegetable, 1)

    sessionEvidence.record('A124-N2', r)
  })
  it("basic and round eight assigned action cannot grant stone", () => {
    for (const space of ['day-laborer', 'cattle-market']) {
      const r = turn(knapper(), 0, space)
      assert.ok(r.interaction.stateId === 'wait')
      if (space === 'cattle-market') {
        assert.equal(r.interaction.promptKey, 'ui.interactionAnimalReorg')
        assert.ok(r.interaction.request.kind === 'animal-reorg')
        assert.equal(r.interaction.request.zones.find(zone => zone.animalType === 'cattle')?.animalCount, 1)
      } else {
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
      }
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.resources.stone, 0)

      sessionEvidence.record(`A124-N3-${space}`, r)
    }
  })
  it("unplayed empty source and actual opponent cannot use owner stone bonus", () => {
    const hand = knapper(false)
    const handUse = assertEmptyAccumulationRejected(hand, 0, 'western-quarry')
    assert.equal(handUse.state.players[0]!.resources.stone, 0)
    assert.equal(handUse.interaction.stateId, 'idle')
    assert.equal(handUse.state.currentPlayerIndex, 0)
    sessionEvidence.record('A124-N4-empty-use', { handUse, emptyEntryRejected: true })
    const s = knapper()
    turn(s, 0, 'grain-seeds')
    const r = turn(s, 1, 'vegetable-seeds')
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assert.equal(r.state.players[1]!.resources.stone, 0)
    assert.equal(r.state.players[1]!.resources.vegetable, 1)

    sessionEvidence.record('A124-N4', r)
  })
  it("whole action undo and stale occupied source cannot duplicate stone", () => {
    const occupied = knapper(true, 1)
    const occupiedTurn = confirmNext(occupied, turn(occupied, 0, 'western-quarry'))
    assert.equal(occupiedTurn.interaction.stateId, 'idle')
    assert.equal(occupiedTurn.state.currentPlayerIndex, 1)
    assertRejectedUnchanged(occupied, () => occupied.takeAction(1, 'western-quarry'))
    const legalOtherSpace = turn(occupied, 1, 'grain-seeds')
    assert.ok(legalOtherSpace.interaction.stateId === 'wait')
    assert.deepEqual(legalOtherSpace.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(legalOtherSpace.interaction.playerIndex, 1)
    assert.equal(legalOtherSpace.state.currentPlayerIndex, 1)
    assert.equal(legalOtherSpace.state.players[1]!.resources.grain, 1)
    const s = knapper(true, 1)
    const beforeUndo = s.getState()
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const first = turn(s, 0, 'western-quarry')
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'western-quarry'))
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.stone, 0)
    assert.equal(undone.state.actionSpaces.find(a => a.id === 'western-quarry')!.resources.stone, 1)
    const retry = turn(s, 0, 'western-quarry')
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.stone, 2)

    sessionEvidence.record('A124-N5', { first, undone, retry })
  })
})
