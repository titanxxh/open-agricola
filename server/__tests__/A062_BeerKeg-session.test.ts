import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'
import '../../shared/cards/A/A062_BeerKeg'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A062 Beer Keg through Session', () => {
  it('requires two grain in supply without spending them', () => {
    const blocked = playMinor(sessionEvidence.track(setupMinorSession({
      cardId: 'A062_BeerKeg', resources: { wood: 1, grain: 1 },
    })), 'A062_BeerKeg')
    expect(blocked.state.players[0]!.minorPlayed).not.toContain('A062_BeerKeg')
    expect(blocked.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 1 })

    const played = playMinor(sessionEvidence.track(setupMinorSession({
      cardId: 'A062_BeerKeg', resources: { wood: 1, grain: 2 },
    })), 'A062_BeerKeg')
    expect(played.state.players[0]!.minorPlayed).toContain('A062_BeerKeg')
    expect(played.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
  })
})

describe('A062 command boundaries', () => {
  const WAGE = 'B007_Wage'
  const CARD_ID = 'A062_BeerKeg'
  function setup({
    played = true,
    round = 4,
    resources = {},
    opponent = {},
    noCard = false,
  }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
    noCard?: boolean
  } = {}) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 962,
        options: { playerCount: 2 },
        configure: (state) => {
          state.round = round
          state.availableMajorImprovements = []
          state.players.forEach((p) => {
            p.minorHand = ['__test_placeholder__']
            p.occupationHand = ['__test_placeholder__']
            p.minorPlayed = []
            p.occupationPlayed = []
            p.improvements = []
            p.cardStates = {}
            Object.assign(p.resources, {
              wood: 0,
              clay: 0,
              reed: 0,
              stone: 0,
              food: 40,
              grain: 0,
              vegetable: 0,
              sheep: 0,
              boar: 0,
              cattle: 0,
              begging: 0,
            })
          })
          state.roundActionOrder = state.roundActionOrder.map(() => null)
          state.roundActionOrder[0] = 'grain-utilization'
          state.actionSpaces.find(
            (a) => a.id === 'grain-utilization',
          )!.roundAvailable = 1
          const p = state.players[0]!
          p.minorHand = [
            ...(!played && !noCard ? [CARD_ID, WAGE, 'A016_RammedClay'] : []),
            '__test_placeholder__',
          ]
          p.minorPlayed = [...(played && !noCard ? [CARD_ID] : [])]
          p.occupationPlayed = []
          Object.assign(p.resources, resources)
          Object.assign(state.players[1]!.resources, opponent)
          state.actionSpaces.find((a) => a.id === 'forest')!.resources.wood = 3
        },
      }),
    )
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    return r.interaction.stateId === 'wait' &&
      (r.interaction.request.kind === 'choice' ||
        r.interaction.request.kind === 'select-trigger')
      ? getChoiceOptions(r)
      : []
  }
  function choose(
    s: GameSession,
    r: SessionResponse,
    predicate: (o: {
      value: string
      labelKey?: string
      sourceCard?: string
    }) => boolean,
  ) {
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'confirm-next-player'
    )
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function minorMenu(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    sessionEvidence.record('command boundary', r)
    if (
      !opts(r).some((o) => o.value === card) &&
      opts(r).some((o) => o.value.startsWith('action-improvement-'))
    )
      r = choose(s, r, (o) => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    let r = minorMenu(s, card)
    if (!r.state.players[0]!.minorPlayed.includes(card))
      r = choose(s, r, (o) => o.value === card)
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.promptKey === 'prompt.selectPayment'
    )
      r = choose(s, r, (o) => o.value !== 'cancel')
    return r
  }
  function deny(s: GameSession, card: string) {
    const r = minorMenu(s, card)
    assert.ok(
      opts(r).some((o) => o.value === WAGE && !('disabled' in o && o.disabled)),
      JSON.stringify(r.interaction),
    )
    assert.equal(
      opts(r).some((o) => o.value === card && !('disabled' in o && o.disabled)),
      false,
    )
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.equal(
      s.getState().state.players[0]!.minorPlayed.includes(card),
      false,
    )
    const food = r.state.players[0]!.resources.food
    const retry = ok(s.resolveChoice(0, WAGE))
    resource(retry, 'food', food + 2)
    assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false)
  }
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(
      (e) => e.key === 'log.cardEffectGain' && e.params?.cardId === card,
    ).length
  }
  function resource(
    r: SessionResponse,
    key: 'food' | 'wood' | 'begging',
    value: number,
    actor = 0,
  ) {
    assert.equal(r.state.players[actor]!.resources[key], value)
  }
  function endWork(s: GameSession) {
    turn(s, 0, 'forest')
    turn(s, 1, 'clay-pit')
    turn(s, 0, 'reed-bank')
    return confirmNext(s, turn(s, 1, 'day-laborer'))
  }
  function finishHarvest(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      const request = r.interaction.request
      if (request.kind === 'feed')
        r = ok(
          s.resolveChoice(r.interaction.playerIndex, 'confirm', {
            selections: [],
          }),
        )
      else if (request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(r.interaction.playerIndex, 'confirm'))
      else if (request.kind === 'confirm-next-player') r = confirmNext(s, r)
      else if (
        request.kind === 'choice' &&
        opts(r).some((o) => o.value === '__skip__')
      )
        r = ok(s.resolveChoice(r.interaction.playerIndex, '__skip__'))
      else assert.fail(JSON.stringify(r.interaction))
    }
    return r
  }
  function purchaseUndo(before: string, r: SessionResponse) {
    ok(r)
    const norm = (v: string) =>
      JSON.parse(v, (key, value: unknown) =>
        key === 'playedCards' ? undefined : value,
      )
    assert.deepEqual(norm(undoRuleSnapshot(r)), norm(before))
    const packet = r.state.publicEventArchive.at(-1)
    assert.ok(
      packet?.type === 'publicEvents.canceled' &&
        packet.reason === 'undoAction',
    )
  }
  function save(name: string, r: SessionResponse) {
    sessionEvidence.record(name, r)
  }
  function beer(s: GameSession, r: SessionResponse, amount: number) {
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'select-trigger'
    )
      r = ok(s.resolveChoice(0, CARD_ID))
    assert.ok(
      r.interaction.stateId === 'wait' && r.interaction.sourceCard === CARD_ID,
      JSON.stringify(r.interaction),
    )
    return choose(s, r, (o) => {
      const full = opts(r).find((x) => x.value === o.value)
      return full !== undefined && amountPaid(r, full.value, 'grain') === amount
    })
  }
  function bonus(r: SessionResponse) {
    const n = r.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0
    assert.ok(r.scores)
    assert.equal(
      r.scores[0]!.categories.find((c) => c.key === 'cardBonusVp')
        ?.entries.filter((e) => e.type === 'bonus' && e.cardId === CARD_ID)
        .reduce((sum, e) => sum + e.score, 0) ?? 0,
      n,
    )
    return n
  }
  it('grain and wood shortage reject forged purchase before exact control', () => {
    for (const resources of [
      { wood: 1, grain: 0, food: 0 },
      { wood: 1, grain: 1, food: 0 },
      { wood: 0, grain: 2, food: 0 },
    ])
      deny(setup({ played: false, resources }), CARD_ID)
    const r = buy(
      setup({ played: false, resources: { wood: 1, grain: 2, food: 0 } }),
      CARD_ID,
    )
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
  })
  for (const { n, amount, expectedBonus, testName } of [
    {
      n: 2,
      amount: 1,
      expectedBonus: 0,
      testName: 'feeding 1 grain gives exactly three food and 0 bonus once',
    },
    {
      n: 3,
      amount: 2,
      expectedBonus: 1,
      testName: 'feeding 2 grain gives exactly three food and 1 bonus once',
    },
    {
      n: 4,
      amount: 3,
      expectedBonus: 2,
      testName: 'feeding 3 grain gives exactly three food and 2 bonus once',
    },
  ])
    it(testName, () => {
      const s = setup({
        resources: { grain: amount, food: 1 },
        opponent: { food: 4 },
      })
      const offer = endWork(s)
      save(`A062-N${n}-offer`, offer)
      const paid = beer(s, offer, amount)
      save(`A062-N${n}-post-exchange`, paid)
      resource(paid, 'food', 0)
      assert.equal(paid.state.players[0]!.resources.grain, 0)
      assert.equal(bonus(paid), expectedBonus)
      const done = finishHarvest(s, paid)
      save(`A062-N${n}-done`, done)
      resource(done, 'food', 0)
      resource(done, 'begging', 0)
      assert.equal(done.state.round, 5)
      assert.equal(gainCount(done, CARD_ID), 1)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, '0'))
    })
  it('unaffordable and invalid exchange reject before one grain retry', () => {
    const s = setup({ resources: { grain: 1, food: 1 } })
    const r = endWork(s)
    save('A062-N5-offer', r)
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'choice',
    )
    const enabled = getChoiceOptions(r)
      .filter(
        (o) => !o.disabled && amountPaid(r, o.value, 'grain') !== undefined,
      )
      .map((o) => amountPaid(r, o.value, 'grain'))
    assert.deepEqual(enabled, [1])
    for (const o of getChoiceOptions(r).filter(
      (o) =>
        amountPaid(r, o.value, 'grain') === 2 ||
        amountPaid(r, o.value, 'grain') === 3,
    ))
      assertRejectedUnchanged(s, () => s.resolveChoice(0, o.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '999'))
    const done = finishHarvest(s, beer(s, r, 1))
    resource(done, 'food', 0)
    assert.equal(done.state.players[0]!.resources.grain, 0)
    assert.equal(bonus(done), 0)
  })
  it('decline no card and in hand controls grant no food or bonus', () => {
    for (const config of [{}, { played: false }, { noCard: true }]) {
      const s = setup({
        ...config,
        resources: { grain: 3, food: 4 },
        opponent: { food: 4 },
      })
      const r = finishHarvest(s, endWork(s))
      save(`A062-N6-${JSON.stringify(config)}`, r)
      resource(r, 'food', 0)
      assert.equal(r.state.players[0]!.resources.grain, 3)
      assert.equal(bonus(r), 0)
      assert.equal(gainCount(r, CARD_ID), 0)
    }
  })
  it('foreign actor and nonharvest phase cannot use owner exchange', () => {
    const s = setup({
      resources: { grain: 2, food: 4 },
      opponent: { grain: 3, food: 4 },
    })
    const offer = endWork(s)
    const first = opts(offer).find((o) => o.value !== '__skip__')
    assert.ok(first)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, first.value))
    const done = finishHarvest(s, beer(s, offer, 2))
    resource(done, 'food', 3)
    resource(done, 'food', 2, 1)
    assert.equal(done.state.players[1]!.resources.grain, 3)
    assert.equal(bonus(done), 1)
    const wrong = setup({ round: 3, resources: { grain: 2, food: 4 } })
    const r = endWork(wrong)
    assert.equal(r.state.round, 4)
    resource(r, 'food', 4)
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.equal(gainCount(r, CARD_ID), 0)
    assertRejectedUnchanged(wrong, () => wrong.resolveChoice(0, first.value))
  })
  it('purchase undo restores wood grain and card before legal replay', () => {
    const s = setup({
      played: false,
      resources: { wood: 1, grain: 2, food: 0 },
    })
    const before = undoRuleSnapshot(s.getState())
    buy(s, CARD_ID)
    purchaseUndo(before, s.undoAction())
    const r = buy(s, CARD_ID)
    resource(r, 'wood', 0)
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.equal(bonus(r), 0)
  })
  function amountPaid(
    r: SessionResponse,
    value: string,
    resource: 'grain' | 'stone',
  ) {
    if (
      r.interaction.stateId !== 'wait' ||
      r.interaction.request.kind !== 'choice'
    )
      return undefined
    const preview = getChoiceOptions(r).find(
      (o) => o.value === value,
    )?.effectPreview
    return preview?.kind === 'payment' || preview?.kind === 'resourceExchange'
      ? preview.resourcesPaid?.[resource]
      : undefined
  }
})
