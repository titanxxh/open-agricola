import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A058_AsparagusKnife'
import '../../shared/cards/A/A059_PotatoRidger'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const FILLER = '__test_placeholder__'
const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []
const playSession = (cardId: string) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7058, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources.wood = 0
  })
  state.players[0]!.minorHand = [cardId]
  state.players[0]!.resources.wood = 1
  session.loadState(state)
  return session
}
const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}
const phaseSession = ({ cardId, round, fields, reserveVegetable = 0, }: {
  cardId: string
  round: number
  fields: Array<{
    crop: 'vegetable' | 'grain'
    remaining: number
  }>
  reserveVegetable?: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7158 + round, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 10
    player.resources.vegetable = 0
    player.fields = []
  })
  const owner = state.players[0]!
  owner.minorPlayed = [cardId]
  owner.resources.vegetable = reserveVegetable
  owner.fields = fields.map((field, index) => ({
    row: 0, col: index, stacks: [{ kind: field.crop, remaining: field.remaining }],
  }))
  session.loadState(state)
  return session
}
describe('A058 Asparagus Knife parity', () => {
  const CARD_ID = 'A058_AsparagusKnife'

  it('A058 S1: paying one wood plays Asparagus Knife', () => {
    const response = playMinor(playSession(CARD_ID), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const finish = (session: GameSession, mode: 'accept-first' | 'accept-second' | 'decline' | 'none') => {
    autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        if (interaction.request.kind === 'choice') {
          const skip = interaction.request.options?.find((option) => option.value === '__skip__')
          const accept = interaction.request.options?.find((option) => option.value !== '__skip__')
          if (skip && mode === 'decline') return current.resolveChoice(interaction.playerIndex, skip.value)
          if (accept && mode !== 'none') return current.resolveChoice(interaction.playerIndex, accept.value)
        }
        if (interaction.request.kind === 'selection') {
          const col = mode === 'accept-second' ? 1 : 0
          return current.commitSelectionChoice(interaction.playerIndex, { positions: [{ row: 0, col }] })
        }
        return undefined
      },
    })
    return session.getState()
  }

  it('A058 S2: round eight may take one vegetable from one field for three food and one point', () => {
    const response = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [{ crop: 'vegetable', remaining: 2 }],
    }), 'accept-first')
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(13)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('A058 S3: the round-eight Asparagus Knife effect may be declined', () => {
    const response = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [{ crop: 'vegetable', remaining: 2 }],
    }), 'decline')
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(10)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A058 S4: with two vegetable fields Asparagus Knife takes from exactly the selected field', () => {
    const response = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [
        { crop: 'vegetable', remaining: 2 }, { crop: 'vegetable', remaining: 1 },
      ],
    }), 'accept-second')
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
    expect(response.state.players[0]!.resources.food).toBe(13)
  })

  it('A058 S5: non-trigger rounds or no vegetable field offer no Asparagus Knife effect', () => {
    const wrongRound = finish(phaseSession({
      cardId: CARD_ID, round: 7, fields: [{ crop: 'vegetable', remaining: 2 }],
    }), 'none')
    expect(wrongRound.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)

    const noVegetable = finish(phaseSession({
      cardId: CARD_ID, round: 8, fields: [{ crop: 'grain', remaining: 2 }],
    }), 'none')
    expect(noVegetable.state.players[0]!.resources.food).toBe(10)
  })
})
describe('A059 Potato Ridger parity', () => {
  const CARD_ID = 'A059_PotatoRidger'

  it('A059 S1: paying one wood plays Potato Ridger', () => {
    const response = playMinor(playSession(CARD_ID), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  const finish = (reserveVegetable: number, fields: number, mode: 'accept' | 'decline' | 'auto') => {
    const session = phaseSession({
      cardId: CARD_ID, round: 4, reserveVegetable,
      fields: Array.from({ length: fields }, () => ({ crop: 'vegetable' as const, remaining: 1 })),
    })
    autoAdvanceRoundEnd(session, {
      onChoice: (interaction, current) => {
        if (interaction.sourceCard !== CARD_ID || interaction.request.kind !== 'choice') return undefined
        const target = mode === 'decline'
          ? interaction.request.options?.find((option) => option.value === '__skip__')
          : interaction.request.options?.find((option) => option.value !== '__skip__')
        return target ? current.resolveChoice(interaction.playerIndex, target.value) : undefined
      },
    })
    return session.getState()
  }

  it('A059 S2: harvesting to exactly three vegetables may exchange one for six food', () => {
    const response = finish(2, 1, 'accept')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 2, food: 14 })
  })

  it('A059 S3: the exchange at exactly three vegetables may be declined', () => {
    const response = finish(2, 1, 'decline')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 3, food: 8 })
  })

  it('A059 S4: harvesting to four vegetables forces one vegetable into six food', () => {
    const response = finish(3, 1, 'auto')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 3, food: 14 })
  })

  it('A059 S5: fewer than three vegetables or no harvested vegetable triggers no exchange', () => {
    const tooFew = finish(1, 1, 'auto')
    expect(tooFew.state.players[0]!.resources.vegetable).toBe(2)
    const noHarvest = finish(5, 0, 'auto')
    expect(noHarvest.state.players[0]!.resources.vegetable).toBe(5)
  })
})
describe("A058 command boundaries", () => {
  const KNIFE = 'A058_AsparagusKnife'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup({ round = 5, played = false, occupations = 0, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => { }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : ["A058_AsparagusKnife", '__test_placeholder__']
        p.minorPlayed = played ? ["A058_AsparagusKnife"] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return getChoiceOptions(r); }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) { const matches = options(r).filter(predicate); assert.equal(matches.length, 1, JSON.stringify(r.interaction)); const o = matches[0]; assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
  function buyMenu(s: GameSession, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string, space = 'meeting-place') {
    const r = buyMenu(s, space)
    if (!r.state.players[0]!.minorHand.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); }
  function bonus(r: SessionResponse) { const value = r.state.players[0]!.cardStates[KNIFE]?.counters?.bonusVp ?? 0; assert.ok(r.scores); assert.ok(r.scores[0]); assert.equal(r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === KNIFE)?.score ?? 0, value); return value; }
  it("actual printed one wood purchase has no immediate crop food or point", () => { deny(setup(), KNIFE); const r = buy(setup({ resources: { wood: 1 } }), KNIFE); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(bonus(r), 0); })
})
describe("A059 command boundaries", () => {
  const RIDGER = 'A059_PotatoRidger'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup({ round = 5, played = false, occupations = 0, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => { }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : ["A059_PotatoRidger", '__test_placeholder__']
        p.minorPlayed = played ? ["A059_PotatoRidger"] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return getChoiceOptions(r); }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) { const matches = options(r).filter(predicate); assert.equal(matches.length, 1, JSON.stringify(r.interaction)); const o = matches[0]; assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
  function buyMenu(s: GameSession, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string, space = 'meeting-place') {
    const r = buyMenu(s, space)
    if (!r.state.players[0]!.minorHand.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function cardFlow(s: GameSession, r: SessionResponse, card: string, accept = true) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'select-trigger') {
        const o = getChoiceOptions(r).find(o => o.value === card)
        assert.ok(o, JSON.stringify(r.interaction))
        r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
        continue
      }
      if (r.interaction.request.kind !== 'choice')
        break
      const opts = getChoiceOptions(r)
      const selected = opts.filter(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__' && !o.disabled)
      assert.equal(selected.length, 1, JSON.stringify(r.interaction))
      const o = selected[0]
      assert.ok(o, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
    }
    return r
  }
  function fields(state: GameState, crop: 'vegetable' | 'grain', amounts: number[], owner = 0) { state.players[owner]!.fields = amounts.map((remaining, i) => ({ row: 0, col: 1 + i, stacks: remaining > 0 ? [{ kind: crop, remaining }] : [] })); }
  function phase(round = 8, amounts = [2], vegetable = 0, played = true, configure: (state: GameState) => void = () => { }) { return setup({ round, played, resources: { vegetable } }, state => { fields(state, 'vegetable', amounts); configure(state); }); }
  function end(s: GameSession) { turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'reed-bank'); return confirmNext(s, turn(s, 1, 'clay-pit')); }
  function remaining(r: SessionResponse, owner = 0) { return r.state.players[owner]!.fields.map(f => f.stacks.reduce((n, stack) => n + stack.remaining, 0)); }
  function potato(vegetable = 2, amounts = [2], configure: (state: GameState) => void = () => { }) { return phase(4, amounts, vegetable, true, configure); }
  function potatoResult(r: SessionResponse) { return [r.state.players[0]!.resources.vegetable, r.state.players[0]!.resources.food]; }
  it("actual printed one wood purchase cannot exchange existing vegetable stock", () => { deny(setup(), RIDGER); const r = buy(setup({ resources: { wood: 1, vegetable: 4 } }), RIDGER); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(potatoResult(r), [4, 40]); })
  it("real ordinary harvest to two gives none and to three may exchange one", () => { const low = potato(1); assert.deepEqual(potatoResult(end(low)), [2, 36]); const s = potato(2); const r = cardFlow(s, end(s), RIDGER); assert.deepEqual(potatoResult(r), [2, 42]); assert.deepEqual(remaining(r), [1]); })
  it("real ordinary harvest to four and five automatically exchanges one", () => {
    for (const before of [3, 4]) {
      const s = potato(before)
      const r = cardFlow(s, end(s), RIDGER)
      assert.deepEqual(potatoResult(r), [before, 42])
      assert.equal(r.state.round, 5)
    }
  })
  it("own grain only harvest and real opponent vegetable harvest do not trigger owner", () => {
    const grain = potato(4, [], state => fields(state, 'grain', [2]))
    let r = end(grain)
    assert.deepEqual(potatoResult(r), [4, 36])
    assert.deepEqual(remaining(r), [1])
    const s = potato(4, [], state => fields(state, 'vegetable', [2], 1))
    r = end(s)
    assert.deepEqual(potatoResult(r), [4, 36])
    assert.equal(r.state.players[1]!.resources.vegetable, 1)
  })
  it("optional decline at three preserves vegetables and stale exchange is rejected", () => { const s = potato(2); const r = cardFlow(s, end(s), RIDGER, false); assert.deepEqual(potatoResult(r), [3, 36]); assertRejectedUnchanged(s, () => s.resolveChoice(0, 'invalid-exchange-two-vegetables')); })
  it("three actual vegetable fields harvest once and exchange one from stock eight", () => { const s = potato(5, [2, 2, 2]); const r = cardFlow(s, end(s), RIDGER); assert.deepEqual(potatoResult(r), [7, 42]); assert.deepEqual(remaining(r), [1, 1, 1]); })
  it("harvest boundary rejects step undo unchanged before one legal exchange retry", () => {
    const s = potato(2)
    const pending = end(s)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.sourceCard === RIDGER)
    assert.deepEqual(potatoResult(pending), [3, 40])
    const undone = assertRejectedUnchanged(s, () => s.undoStep())
    sessionEvidence.record('A059-N8-undo', { pending, undone })
    assert.equal(undone.error, 'cannot undo past boundary')
    const retried = cardFlow(s, s.getState(), RIDGER)
    assert.deepEqual(potatoResult(retried), [2, 42])
    assert.deepEqual(remaining(retried), [1])
    assert.equal(retried.state.round, 5)
  })

})
