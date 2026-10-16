import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'
import '../../shared/cards/A/A064_BarleyMill'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { type PlayerState, type Field } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A064 Barley Mill through Session', () => {
  it.each([
    { material: 'clay', resources: { wood: 1, clay: 4 }, remaining: { wood: 0, clay: 0 } },
    { material: 'stone', resources: { wood: 1, stone: 2 }, remaining: { wood: 0, stone: 0 } },
  ])('charges the shared wood in the $material cost', ({ resources, remaining }) => {
    const response = playMinor(sessionEvidence.track(setupMinorSession({ cardId: 'A064_BarleyMill', resources })), 'A064_BarleyMill')
    expect(response.state.players[0]!.minorPlayed).toContain('A064_BarleyMill')
    expect(response.state.players[0]!.resources).toMatchObject(remaining)
  })

  it('rejects play when the shared wood is missing', () => {
    const response = playMinor(sessionEvidence.track(setupMinorSession({
      cardId: 'A064_BarleyMill', resources: { clay: 4 },
    })), 'A064_BarleyMill')
    expect(response.state.players[0]!.minorPlayed).not.toContain('A064_BarleyMill')
    expect(response.state.players[0]!.resources.clay).toBe(4)
  })
})

describe('A064 command boundaries', () => {
  const WAGE = 'B007_Wage'
  const CARD_ID = 'A064_BarleyMill'
  function setup({
    played = true,
    round = 4,
    occupations = [],
    extra = [],
    resources = {},
    noCard = false,
    fields = [],
    opponentFields = [],
  }: {
    played?: boolean
    round?: number
    occupations?: string[]
    extra?: string[]
    resources?: Partial<PlayerState['resources']>
    noCard?: boolean
    fields?: Field[]
    opponentFields?: Field[]
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
          p.fields = fields
          state.players[1]!.fields = opponentFields
          p.minorHand = [
            ...(!played && !noCard ? [CARD_ID, WAGE, 'A016_RammedClay'] : []),
            '__test_placeholder__',
          ]
          p.minorPlayed = [...(played && !noCard ? [CARD_ID] : []), ...extra]
          p.occupationPlayed = occupations
          Object.assign(p.resources, resources)
          state.actionSpaces.find((a) => a.id === 'forest')!.resources.wood = 3
        },
      }),
    )
    return s
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
  function roundStarted(r: SessionResponse, round: number) {
    assert.equal(r.ok, true, r.error)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.roundPhase, 'work')
    assert.equal(r.state.gameOver, false)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.round, round)
    return r
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
      r = confirmNext(s, confirmed(r, 1 - actor))
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
    return confirmed(r)
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
    const retry = confirmed(ok(s.resolveChoice(0, WAGE)))
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
  function save(name: string, r: SessionResponse) {
    sessionEvidence.record(name, r)
  }
  function fields(...crops: Array<'grain' | 'vegetable' | null>): Field[] {
    return crops.map((crop, i) => ({
      row: i,
      col: 2,
      stacks: crop ? [{ kind: crop, remaining: crop === 'grain' ? 3 : 2 }] : [],
    }))
  }
  function sowStart(s: GameSession, actor = 0, space = 'grain-utilization') {
    let r = turn(s, actor, space)
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice'
    )
      r = choose(s, r, (o) => o.value === 'sow' || o.value !== '__skip__')
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'farm-select',
      JSON.stringify(r.interaction),
    )
    save('sow-pending', r)
    return r
  }
  function sow(
    s: GameSession,
    crops: Array<{
      row: number
      col: number
      crop: 'grain' | 'vegetable' | 'wood'
    }>,
  ) {
    sowStart(s)
    return confirmed(ok(s.commitSelectionChoice(0, { crops })))
  }
  function afterSowHarvest(s: GameSession) {
    turn(s, 1, 'clay-pit')
    turn(s, 0, 'forest')
    return roundStarted(confirmNext(s, confirmed(turn(s, 1, 'reed-bank'), 1)), 14)
  }
  function mill(config: Parameters<typeof setup>[0] = {}) {
    return setup({ resources: { food: 4 }, ...config })
  }
  function printedVp(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    return (
      r.scores[0]!.categories.find((c) => c.key === 'cards')
        ?.entries.filter((e) => e.type === 'card' && e.cardId === card)
        .reduce((n, e) => n + e.score, 0) ?? 0
    )
  }
  it('common wood and alternative material shortages reject before exact buys', () => {
    for (const resources of [
      { wood: 0, clay: 4 },
      { wood: 0, stone: 2 },
      { wood: 1, clay: 3, stone: 1 },
    ])
      deny(mill({ played: false, resources }), CARD_ID)
    for (const resources of [
      { wood: 1, clay: 4 },
      { wood: 1, stone: 2 },
    ]) {
      const r = buy(mill({ played: false, resources }), CARD_ID)
      assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(r.state.players[0]!.resources.stone, 0)
      assert.equal(printedVp(r, CARD_ID), 1)
      save('A064-N1-purchase-score', r)
    }
  })
  it('malformed alternative payment cannot omit common wood or mix partial costs', () => {
    const s = mill({ played: false, resources: { wood: 1, clay: 4, stone: 2 } })
    let r = minorMenu(s, CARD_ID)
    r = choose(s, r, (o) => o.value === CARD_ID)
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'choice',
    )
    save('A064-N2-payment', r)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '999'))
    r = confirmed(choose(s, r, (o) => {
      const full = opts(r).find((x) => x.value === o.value)
      return full !== undefined && amountPaid(r, full.value, 'stone') === 2
    }))
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 4)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '999'))
  })
  it('one or two grain fields count once regardless of crop quantity', () => {
    for (const count of [1, 2]) {
      const fs = fields(...Array<'grain'>(count).fill('grain'))
      fs[count - 1]!.stacks[0]!.remaining = 1
      const s = mill({ fields: fs })
      const r = roundStarted(endWork(s), 5)
      save(`A064-N3-${count}-done`, r)
      assert.equal(r.state.players[0]!.resources.grain, count)
      resource(r, 'food', count)
      assert.equal(gainCount(r, CARD_ID), 1)
      assert.equal(r.state.players[0]!.fields[count - 1]!.stacks.length, 0)
    }
  })
  it('vegetable and empty fields do not add grain field food', () => {
    for (const grain of [true, false]) {
      const s = mill({
        fields: grain
          ? fields('grain', 'vegetable', null)
          : fields('vegetable', null),
      })
      const r = roundStarted(endWork(s), 5)
      save(`A064-N4-${grain}`, r)
      assert.equal(r.state.players[0]!.resources.grain, grain ? 1 : 0)
      assert.equal(r.state.players[0]!.resources.vegetable, 1)
      resource(r, 'food', grain ? 1 : 0)
      assert.equal(gainCount(r, CARD_ID), grain ? 1 : 0)
    }
  })
  it('last grain rewards current harvest then empty field gives no later reward', () => {
    const fs = fields('grain')
    fs[0]!.stacks[0]!.remaining = 1
    const s = mill({ fields: fs, resources: { food: 16 } })
    for (const round of [4, 5, 6, 7]) {
      const r = roundStarted(endWork(s), round + 1)
      save(`A064-N5-round${round}`, r)
      resource(r, 'food', round === 7 ? 9 : 13)
      assert.equal(r.state.players[0]!.resources.grain, 1)
      assert.equal(gainCount(r, CARD_ID), 1)
      assert.equal(r.state.round, round + 1)
    }
  })
  it('actual sow on farm and Patch Caregiver yields two logical grain fields', () => {
    const s = mill({
      round: 13,
      fields: fields(null),
      occupations: ['B113_PatchCaregiver'],
      resources: { food: 4, grain: 2 },
    })
    const planted = sow(s, [
      { row: 0, col: 2, crop: 'grain' },
      { row: -1, col: 2113, crop: 'grain' },
    ])
    assert.equal(planted.state.players[0]!.resources.grain, 0)
    const r = afterSowHarvest(s)
    save('A064-N6-done', r)
    assert.equal(r.state.players[0]!.resources.grain, 2)
    resource(r, 'food', 2)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2)
    assert.deepEqual(
      r.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData
        ?.cardFieldStacks,
      [{ crop: 'grain', remaining: 2 }],
    )
  })
  it('Wood Field two slots harvest wood and add no grain bonus', () => {
    const s = mill({
      round: 13,
      fields: fields(null),
      extra: ['D075_WoodField'],
      occupations: ['A124_Knapper'],
      resources: { food: 4, grain: 1, wood: 2 },
    })
    sow(s, [
      { row: 0, col: 2, crop: 'grain' },
      { row: -1, col: 4075, crop: 'wood' },
      { row: -1, col: 4076, crop: 'wood' },
    ])
    const r = afterSowHarvest(s)
    save('A064-N7-done', r)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    resource(r, 'wood', 5)
    resource(r, 'food', 1)
    assert.deepEqual(
      r.state.players[0]!.cardStates.D075_WoodField?.extraData?.cardFieldStacks,
      [
        { crop: 'wood', remaining: 2 },
        { crop: 'wood', remaining: 2 },
      ],
    )
  })
  it('hand foreign nonharvest and purchase undo cannot grant extra mill food', () => {
    for (const config of [
      { played: false },
      { noCard: true },
      { fields: fields(null), opponentFields: fields('grain') },
      { round: 3 },
    ]) {
      const s = mill({ fields: fields('grain'), ...config })
      const r = roundStarted(endWork(s), config.round ? 4 : 5)
      resource(r, 'food', config.round ? 4 : 0)
      assert.equal(gainCount(r, CARD_ID), 0)
    }
    const s = mill({ played: false, resources: { wood: 1, clay: 4, food: 0 } })
    const initial = s.getState()
    assert.equal(initial.interaction.stateId, 'idle')
    assert.equal(initial.state.currentPlayerIndex, 0)
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    const r = buy(s, CARD_ID)
    resource(r, 'food', 0)
    const restored = s.undoAction()
    assertUndoRestored(before, restored)
    assert.equal(JSON.stringify(restored.interaction), beforeInteraction)
    assert.equal(JSON.stringify(s.getState().interaction), beforeInteraction)
    assert.equal(restored.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    const replay = buy(s, CARD_ID)
    resource(replay, 'wood', 0)
    assert.equal(replay.state.players[0]!.resources.clay, 0)
    resource(replay, 'food', 0)
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
