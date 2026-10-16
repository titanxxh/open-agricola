import { describe, expect, it } from 'vitest'
import '../../shared/cards/C/C104_Collector'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { type PlayerState, type GameState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'C104_Collector'
const createSession = (options: { used?: number; currentPlayerIndex?: number } = {}) => {
  const session = evidence.track(createWorkSession({
    seed: 42, configure: state => {
      state.currentPlayerIndex = options.currentPlayerIndex ?? 0
      state.round = 1
      state.players[0]!.occupationPlayed = [CARD_ID]
      if (options.used !== undefined) writeCardExtraData(state.players[0]!, CARD_ID, 'used', options.used)
      state.actionSpaces.push(...createPlayerActionSpaces(state))
    }
  }))
  return session
}

describe('C104 — multi-select session (player action space)', () => {
  it('resolves the browser multi-select value through GameSession', () => {
    const session = createSession()
    const before = { ...session.state.players[0]!.resources }

    const started = session.takeAction(0, CARD_ID)
    expect(started.ok).toBe(true)
    expect(started.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice' },
      promptParams: { needed: 6 },
    })
    expect(started.interaction.allowedCommands).toContain('resolveChoice')
    if (started.interaction.stateId !== 'wait' || started.interaction.request.kind !== 'choice') return
    expect(getChoiceOptions(started)).toHaveLength(10)

    const resolved = session.resolveChoice(0, 'wood,clay,reed,stone,food,grain')
    expect(resolved.ok).toBe(true)
    expect(resolved.state.players[0]!.resources).toMatchObject({
      wood: before.wood + 1,
      clay: before.clay + 1,
      reed: before.reed + 1,
      stone: before.stone + 1,
      food: before.food + 1,
      grain: before.grain + 1,
      begging: before.begging + 1,
    })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(1)
    expect(resolved.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toHaveLength(1)
    expect(resolved.state.log).toEqual(started.state.log)
    expect(resolved.scores).toHaveLength(2)
  })

  it('keeps waiting when fewer than six distinct goods are submitted through GameSession', () => {
    const session = createSession()
    const before = { ...session.state.players[0]!.resources }
    expect(session.takeAction(0, CARD_ID).ok).toBe(true)

    const resolved = session.resolveChoice(0, 'wood,clay,reed,stone,food,wood')
    expect(resolved.ok).toBe(true)
    expect(resolved.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice' },
      promptParams: { needed: 6 },
    })
    expect(resolved.state.players[0]!.resources).toEqual(before)
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBeUndefined()
  })

  it.each<{ used: number; needed: number; selection: string; goods: (keyof PlayerState['resources'])[] }>([
    {
      used: 1,
      needed: 7,
      selection: 'wood,clay,reed,stone,food,grain,vegetable',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable'],
    },
    {
      used: 2,
      needed: 8,
      selection: 'wood,clay,reed,stone,food,grain,vegetable,sheep',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep'],
    },
    {
      used: 3,
      needed: 9,
      selection: 'wood,clay,reed,stone,food,grain,vegetable,sheep,boar',
      goods: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar'],
    },
  ])(
    'use $needed asks for and grants $needed distinct goods plus 1 begging through GameSession',
    ({ used, needed, selection, goods }) => {
      const session = createSession({ used })
      const before = { ...session.state.players[0]!.resources }

      const started = session.takeAction(0, CARD_ID)
      expect(started.ok).toBe(true)
      expect(started.interaction).toMatchObject({
        stateId: 'wait',
        playerIndex: 0,
        promptParams: { needed },
      })

      const resolved = session.resolveChoice(0, selection)

      expect(resolved.ok).toBe(true)
      for (const key of goods) {
        expect(resolved.state.players[0]!.resources[key]).toBe((before[key] ?? 0) + 1)
      }
      expect(resolved.state.players[0]!.resources.begging).toBe(before.begging + 1)
      expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(used + 1)
    },
  )

  it('does not execute a fifth use through GameSession', () => {
    const session = createSession({ used: 4 })
    const before = { ...session.state.players[0]!.resources }

    const response = session.takeAction(0, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[0]!.resources).toEqual(before)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.used).toBe(4)
  })

  it('does not execute the owner-only space for a non-owner through GameSession', () => {
    const session = createSession({ currentPlayerIndex: 1 })
    const before = { ...session.state.players[1]!.resources }

    const response = session.takeAction(1, CARD_ID)

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[1]!.resources).toEqual(before)
    expect(response.state.players[1]!.cardStates[CARD_ID]?.extraData?.used).toBeUndefined()
  })
})

describe('C104 rule boundaries', () => {

  const B = 'B018_GrasslandHarrow', C = 'C104_Collector'

  function setup(card: string, configure: (state: GameState) => void = () => { }, round = 3) {
    return evidence.track(createWorkSession({
      seed: 8318, options: { playerCount: 2 }, configure: state => {
        state.round = round
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0 })
        }
        const p = state.players[0]!
        if (card === B) {
          p.minorHand = [B]
          p.occupationPlayed = ['A125_Priest', 'A124_Knapper']
          Object.assign(p.resources, { wood: 2, clay: 1 })
        }
        else
          p.occupationPlayed.push(card)
        configure(state)
        if (card === C)
          state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }))
  }

  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction }

  function finish(s: GameSession, initial: SessionResponse) {
    let r = initial
    for (let n = 0; n < 6 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'confirm-next-player')
        r = confirmNext(s, r)
      else if (r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === '__skip__'))
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
      else
        break
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function place(s: GameSession, actor: number, id: string) { const r = s.takeAction(actor, id); assert.equal(r.ok, true, r.error); return r }

  function ownerUsed(r: SessionResponse) { return Number(r.state.players[0]!.cardStates[C]?.extraData?.used ?? 0) }

  it("wrong distinct counts cannot grant goods and six-good retry settles one begging marker", () => {
    const s = setup(C)
    let r = place(s, 0, C)
    for (const value of ['wood,clay,reed,stone,food', 'wood,clay,reed,stone,food,wood', 'wood,clay,reed,stone,food,grain,vegetable']) {
      const before = JSON.stringify(r.state.players[0]!.resources)
      const unchanged = JSON.stringify({ log: r.state.log, scores: r.scores })
      r = s.resolveChoice(0, value)
      assert.equal(r.ok, true, r.error)
      wait(r)
      assert.equal(ownerUsed(r), 0)
      assert.equal(JSON.stringify(r.state.players[0]!.resources), before)
      assert.equal(JSON.stringify({ log: r.state.log, scores: r.scores }), unchanged)
    }
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'wood,clay,reed,stone,food,grain'))
    r = s.resolveChoice(0, 'wood,clay,reed,stone,food,grain')
    assert.equal(r.ok, true, r.error)
    assert.equal(ownerUsed(r), 1)
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.stone, r.state.players[0]!.resources.grain, r.state.players[0]!.resources.begging], [1, 1, 1, 1, 1, 1])
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.ok(r.scores)
    assert.equal(r.scores[0]!.categories.find(c => c.key === 'beggings')!.total, -3)
    assert.equal(r.scores[0]!.categories.find(c => c.key === 'grains')!.total, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'wood,clay,reed,stone,food,grain'))
  })

  it("real opponent turn and fifth-use limit cannot use the owners card", () => {
    const s = setup(C)
    finish(s, place(s, 0, 'grain-seeds'))
    assertRejectedUnchanged(s, () => s.takeAction(1, C))
    const exhausted = setup(C, state => { state.players[0]!.cardStates[C] = { extraData: { used: 4 } } })
    assertRejectedUnchanged(exhausted, () => exhausted.takeAction(0, C))
    assert.equal(exhausted.getState().state.players[0]!.resources.begging, 0)
  })

  it("a begging marker is not a sixth different good and cannot grant an extra penalty", () => {
    const s = setup(C)
    place(s, 0, C)
    const r = s.resolveChoice(0, 'wood,clay,reed,stone,food,begging')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual({ used: ownerUsed(r), wood: r.state.players[0]!.resources.wood, begging: r.state.players[0]!.resources.begging }, { used: 0, wood: 0, begging: 0 })
    wait(r)
  })

  it("undo of six-good use restores gains begging count card counter and worker", () => {
    const s = setup(C)
    const before = JSON.stringify(s.getState().state.players[0]!.resources)
    const score = JSON.stringify(s.getState().scores)
    place(s, 0, C)
    s.resolveChoice(0, 'wood,clay,reed,stone,food,grain')
    const r = s.undoAction()
    assert.equal(r.ok, true, r.error)
    assert.equal(JSON.stringify(r.state.players[0]!.resources), before)
    assert.equal(JSON.stringify(r.scores), score)
    assert.equal(ownerUsed(r), 0)
    assert.deepEqual(r.state.actionSpaces.find(x => x.id === C)!.takenBy, [])
  })

  it("recorded prior uses demand seven eight and nine different goods rather than six", () => {
    for (const [used, needed] of [[1, 7], [2, 8], [3, 9]]) {
      const s = setup(C, state => { state.players[0]!.cardStates[C] = { extraData: { used } } })
      let r = place(s, 0, C)
      const i = wait(r)
      assert.equal(i.promptParams?.needed, needed)
      r = s.resolveChoice(0, 'wood,clay,reed,stone,food,grain')
      wait(r)
      assert.equal(ownerUsed(r), used)
      assert.equal(r.state.players[0]!.resources.begging, 0)
      assert.equal(r.state.players[0]!.resources.wood, 0)
    }
  })
})
