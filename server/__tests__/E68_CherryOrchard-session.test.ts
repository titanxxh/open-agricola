import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/E/E068_CherryOrchard'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

const CARD_ID = 'E068_CherryOrchard'
const FILLER = '__test_placeholder__'
const VIRTUAL_TILE = { row: -1, col: 5068 }

type CardCrop = { crop: 'wood'; remaining: number } | null

const setup = ({
  played = false, wood = 0, grain = 0, vegetable = 0, cardWood, round = 14,
  normalFields = 0,
}: {
  played?: boolean
  wood?: number
  grain?: number
  vegetable?: number
  cardWood?: number
  round?: number
  normalFields?: number
} = {}) => {
  const session = new GameSession(7068, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  Object.assign(owner.resources, { wood, grain, vegetable })
  owner.fields = Array.from({ length: normalFields }, (_, index) => ({
    row: 0, col: index, stacks: [],
  }))
  if (cardWood !== undefined) {
    writeCardExtraData(owner, CARD_ID, 'cardFieldStacks', [
      cardWood > 0 ? { crop: 'wood', remaining: cardWood } : null,
    ])
  }
  if ([4, 7, 9, 11, 13, 14].includes(round) && cardWood !== undefined) {
    state.players.forEach((player) => markAllWorkersUsed(state, player))
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const enterSow = (session: GameSession) => {
  const response = session.takeAction(0, 'grain-utilization')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const sowOrchard = (session: GameSession, crop: 'wood' | 'grain' | 'vegetable') => {
  enterSow(session)
  return session.commitSelectionChoice(0, { crops: [{ ...VIRTUAL_TILE, crop }] })
}

const cardStacks = (response: SessionResponse) =>
  readCardExtraData<CardCrop[]>(response.state.players[0]!, CARD_ID, 'cardFieldStacks')

const fieldScore = (response: SessionResponse) =>
  response.scores[0]!.categories.find((category) => category.key === 'fields')

describe('E068 Cherry Orchard parity', () => {
  it('E068 S1: Cherry Orchard can be played for free with no prerequisite', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('E068 S2: one wood sows Cherry Orchard as a three-wood stack', () => {
    const response = sowOrchard(setup({ played: true, wood: 1 }), 'wood')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(cardStacks(response)).toEqual([{ crop: 'wood', remaining: 3 }])
  })

  it('E068 S3: Cherry Orchard rejects grain atomically and still accepts a wood retry', () => {
    const session = setup({ played: true, wood: 1, grain: 1 })
    enterSow(session)

    const rejected = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'grain' }],
    })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1 })
    expect(cardStacks(rejected) ?? [null]).toEqual([null])

    const retried = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'wood' }],
    })
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 1 })
    expect(cardStacks(retried)).toEqual([{ crop: 'wood', remaining: 3 }])
  })

  it('E068 S4: Cherry Orchard rejects vegetable sowing', () => {
    const session = setup({ played: true, wood: 1, vegetable: 1 })
    enterSow(session)

    const response = session.commitSelectionChoice(0, {
      crops: [{ ...VIRTUAL_TILE, crop: 'vegetable' }],
    })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, vegetable: 1 })
    expect(cardStacks(response) ?? [null]).toEqual([null])
  })

  it('E068 S5: harvesting a non-last wood gives no vegetable', () => {
    const response = setup({ played: true, cardWood: 3, round: 4 }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, vegetable: 0 })
    expect(cardStacks(response)).toEqual([{ crop: 'wood', remaining: 2 }])
  })

  it('E068 S6: harvesting the last wood also gives one vegetable', () => {
    const session = setup({ played: true, cardWood: 1, round: 4 })

    const response = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, vegetable: 1 })
    expect(cardStacks(response)).toEqual([null])
  })

  it('E068 S7: an empty Cherry Orchard gives no vegetable during harvest', () => {
    const response = setup({ played: true, cardWood: 0, round: 4 }).performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
    expect(cardStacks(response)).toEqual([null])
  })

  it('E068 S8: Cherry Orchard is excluded from base field scoring', () => {
    const response = setup({ played: true, normalFields: 1 }).getState()

    expect(fieldScore(response)).toMatchObject({ quantity: 1, total: -1 })
  })
})

describe('ae-negative-40-crops', () => {
  const { sessions, ok, save, setup, finish, hand, buy, printed, completeRemaining, cardStacks, tileFor, fieldSession, enterCardSow, sowCard, finishToRound } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E068 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'E068_CherryOrchard'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, {}); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.ok(r.scores);assert.equal(r.scores[0]!.categories.find(c=>c.key==='fields')?.quantity,0);save("E068-N1-legal", r); });
  it('E068 N2 real purchase and sow create three wood and only the natural last harvest gives a vegetable', () => { const card = 'E068_CherryOrchard', s = fieldSession(card); let r = sowCard(s, card, 'wood'); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(cardStacks(r, card), [{ kind: 'wood', remaining: 3 }]); save('E068-N2-sown', r); for (const [target, wood, vegetable, remaining] of [[12, 1, 1, 2], [14, 2, 1, 1]]) {
      r = finishToRound(s, target!);
      assert.equal(r.state.players[0]!.resources.wood, wood);
      assert.equal(r.state.players[0]!.resources.vegetable, vegetable);
      assert.deepEqual(cardStacks(r, card), [{ kind: 'wood', remaining }]);
      save(`E068-N2-${target}`, r);
  } r = finish(s, completeRemaining(s), true); assert.equal(r.state.gameOver, true); assert.equal(r.state.players[0]!.resources.wood, 3); assert.equal(r.state.players[0]!.resources.vegetable, 2); assert.deepEqual(cardStacks(r, card), []); assert.equal(r.state.players[0]!.fields.length, 0); save('E068-N2-final', r); });
  it('E068 N3 invalid grain target rejects before a real legal card field sow retry', () => { for (const bad of ['grain', 'vegetable'] as const) {
      const card = 'E068_CherryOrchard', s = fieldSession(card);
      let r = enterCardSow(s);
      save(`E068-N3-before-${bad}`, r);
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ ...tileFor(card), crop: bad }] }));
      assert.deepEqual(cardStacks(s.getState(), card), []);
      r = ok(s.commitSelectionChoice(0, { crops: [{ ...tileFor(card), crop: 'wood' }] }));
      assert.deepEqual(cardStacks(r, card), [{ kind: 'wood', remaining: 3 }]);
      assert.equal(r.state.players[0]!.resources.grain, 1);
      save(`E068-N3-retry-${bad}`, r);
  } });
})
