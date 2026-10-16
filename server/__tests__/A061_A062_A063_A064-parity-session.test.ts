import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/A/A061_WinnowingFan'
import '../../shared/cards/A/A062_BeerKeg'
import '../../shared/cards/A/A063_DutchWindmill'
import '../../shared/cards/A/A064_BarleyMill'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const FILLER = '__test_placeholder__'

const FIREPLACE = 'Major_Fireplace1'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const baseSession = ({
  cardId, played = false, round = 5, resources = {}, fireplace = false, fields = [],
}: {
  cardId: string
  played?: boolean
  round?: number
  resources?: Partial<PlayerState['resources']>
  fireplace?: boolean
  fields?: Array<{ crop: 'grain' | 'vegetable'; remaining: number }>
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7061 + round, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.improvements = fireplace ? [FIREPLACE] : []
  owner.fields = fields.map((field, index) => ({
    row: 0, col: index, stacks: [{ kind: field.crop, remaining: field.remaining }],
  }))
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      const payment = options(response).find((option) => option.value !== 'cancel')
      expect(payment).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
    }
  }
  return response
}

const prepareHarvest = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
    player.resources.food = Math.max(player.resources.food, 20)
  })
  session.loadState(state)
}

const finishHarvest = (session: GameSession, choose: (interaction: Extract<SessionResponse['interaction'], { stateId: 'wait' }>) => string | undefined) => {
  autoAdvanceRoundEnd(session, {
    onChoice: (interaction, current) => {
      if (interaction.request.kind !== 'choice') return undefined
      const value = choose(interaction)
      return value === undefined ? undefined : current.resolveChoice(interaction.playerIndex, value)
    },
  })
  return session.getState()
}

describe('A061 Winnowing Fan parity', () => {
  const CARD_ID = 'A061_WinnowingFan'

  it('A061 S1: a baking improvement and one reed allow Winnowing Fan to be played', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { reed: 1 }, fireplace: true,
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it('A061 S2: Winnowing Fan is unavailable without a baking improvement', () => {
    const response = playMinor(baseSession({ cardId: CARD_ID, resources: { reed: 1 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(1)
  })

  it('A061 S3: after the harvest field phase Winnowing Fan turns exactly one grain into fireplace food', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, resources: { grain: 2 },
      fireplace: true, fields: [{ crop: 'grain', remaining: 1 }],
    })
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => {
      if (interaction.sourceCard !== CARD_ID) return undefined
      return getChoiceOptions({ interaction }).find((option) => option.value !== '__skip__')?.value
    })
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 18 })
  })

  it('A061 S4: the Winnowing Fan bake may be declined and does not count as Bake Bread', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, resources: { grain: 1 },
      fireplace: true, fields: [{ crop: 'grain', remaining: 1 }],
    })
    const state = session.getState().state
    state.players[0]!.minorPlayed.push('A063_DutchWindmill')
    session.loadState(state)
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => {
      if (interaction.sourceCard !== CARD_ID) return undefined
      return '__skip__'
    })
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 16 })
  })
})

describe('A062 Beer Keg parity', () => {
  const CARD_ID = 'A062_BeerKeg'

  it('A062 S1: two grain and one wood allow Beer Keg to be played', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { grain: 2, wood: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A062 S2: Beer Keg is unavailable with fewer than two grain', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { grain: 1, wood: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, wood: 1 })
  })

  for (const { scenario, grain, points } of [
    { scenario: 'S3', grain: 1, points: 0 },
    { scenario: 'S4', grain: 2, points: 1 },
    { scenario: 'S5', grain: 3, points: 2 },
  ]) {
    it(`A062 ${scenario}: during feeding ${grain} grain become exactly three food and ${points} points`, () => {
      const session = baseSession({ cardId: CARD_ID, played: true, round: 4, resources: { grain } })
      prepareHarvest(session)
      const response = finishHarvest(session, (interaction) => {
        if (interaction.sourceCard !== CARD_ID) return undefined
        return getChoiceOptions({ interaction }).find((option) =>
          (option.effectPreview?.kind === 'resourceExchange' || option.effectPreview?.kind === 'payment')
          && option.effectPreview.resourcesPaid?.grain === grain)?.value
      })
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 19 })
      expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(points)
    })
  }

  it('A062 S6: the Beer Keg exchange may be declined', () => {
    const session = baseSession({ cardId: CARD_ID, played: true, round: 4, resources: { grain: 3 } })
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => interaction.sourceCard === CARD_ID ? '__skip__' : undefined)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 3, food: 16 })
  })
})

const bakeSession = ({ round, grain = 1, winnowingFan = false }: { round: number; grain?: number; winnowingFan?: boolean }) => {
  const session = baseSession({
    cardId: 'A063_DutchWindmill', played: true, round, resources: { grain, food: 0 }, fireplace: true,
  })
  const state = session.getState().state
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.roundAvailable = 1
  if (winnowingFan) state.players[0]!.minorPlayed.push('A061_WinnowingFan')
  session.loadState(state)
  return session
}

const bakeGrain = (session: GameSession, grain: number) => {
  let response = session.takeAction(0, 'grain-utilization')
  for (let guard = 0; guard < 8 && response.state.players[0]!.resources.grain > 0; guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const fireplace = options(response).find((option) =>
      option.value === FIREPLACE || option.sourceCard === FIREPLACE)
    const count = options(response).find((option) => option.value === `count-${FIREPLACE}-${grain}`)
    const bake = options(response).find((option) => option.value === 'bake-bread' || option.labelKey === 'actions.bakeBread.name')
    const next = count ?? fireplace ?? bake
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

describe('A063 Dutch Windmill parity', () => {
  const CARD_ID = 'A063_DutchWindmill'

  it('A063 S1: paying two wood and two stone plays Dutch Windmill for two points', () => {
    const response = playMinor(baseSession({
      cardId: CARD_ID, resources: { wood: 2, stone: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    assert.ok(response.scores)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
  })

  it('A063 S2: Bake Bread in a post-harvest round gains three additional food once', () => {
    const response = bakeGrain(bakeSession({ round: 5, grain: 2 }), 2)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 7 })
  })

  it('A063 S3: Bake Bread outside a post-harvest round gains no Dutch Windmill food', () => {
    const response = bakeGrain(bakeSession({ round: 6 }), 1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('A063 S4: Winnowing Fan is not a Bake Bread action and gains no Dutch Windmill food', () => {
    const session = bakeSession({ round: 4, winnowingFan: true })
    prepareHarvest(session)
    const response = finishHarvest(session, (interaction) => {
      if (interaction.sourceCard !== 'A061_WinnowingFan') return undefined
      return getChoiceOptions({ interaction }).find((option) => option.value !== '__skip__')?.value
    })
    expect(response.state.players[0]!.resources.food).toBe(18)
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.gained.food ?? 0).toBe(0)
  })
})

describe('A064 Barley Mill parity', () => {
  const CARD_ID = 'A064_BarleyMill'

  it('A064 S1: each Barley Mill cost includes the shared one-wood fee', () => {
    for (const resources of [{ wood: 1, clay: 4 }, { wood: 1, stone: 2 }]) {
      const response = playMinor(baseSession({ cardId: CARD_ID, resources }), CARD_ID)
      expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
      expect(response.state.players[0]!.resources.wood).toBe(0)
      expect(response.state.players[0]!.resources[resources.clay ? 'clay' : 'stone']).toBe(0)
    }
  })

  it('A064 S2: Barley Mill is unavailable without the printed one-wood fee', () => {
    const response = playMinor(baseSession({ cardId: CARD_ID, resources: { clay: 4 } }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 4 })
  })

  it('A064 S3: harvest gains one Barley Mill food per harvested grain field', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, fields: [
        { crop: 'grain', remaining: 2 }, { crop: 'grain', remaining: 1 },
      ],
    })
    prepareHarvest(session)
    const response = finishHarvest(session, () => undefined)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, food: 18 })
  })

  it('A064 S4: vegetable fields or no harvested grain field grant no Barley Mill food', () => {
    const session = baseSession({
      cardId: CARD_ID, played: true, round: 4, fields: [{ crop: 'vegetable', remaining: 1 }],
    })
    prepareHarvest(session)
    const response = finishHarvest(session, () => undefined)
    expect(response.state.players[0]!.resources.food).toBe(16)
  })
})

describe('A063 command boundaries', () => {
  const ORIENTAL = 'A060_OrientalFireplace', CARD_ID = 'A063_DutchWindmill', FIRE = 'Major_Fireplace1'
  function setup({
    played = true,
    round = 5,
    resources = {},
    majors = [],
    minor = [],
    field = false,
    configure = () => {},
  }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    majors?: string[]
    minor?: string[]
    field?: boolean
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 4242,
        options: { playerCount: 2 },
        configure(state) {
          state.round = round
          state.players.forEach((p) => {
            p.minorHand = ['B007_Wage', 'A054_Credit']
            p.occupationHand = ['__test_placeholder__']
            p.minorPlayed = []
            p.occupationPlayed = []
            p.improvements = []
            Object.assign(p.resources, {
              wood: 0,
              clay: 0,
              reed: 0,
              stone: 0,
              food: 20,
              grain: 0,
              vegetable: 0,
              sheep: 0,
              boar: 0,
              cattle: 0,
            })
          })
          const p = state.players[0]!
          p.minorPlayed = played ? [CARD_ID, ...minor] : minor
          if (!played) p.minorHand.push(CARD_ID)
          p.improvements = majors
          majors.forEach((id) => takeMajorImprovementFromSupply(state, id))
          Object.assign(p.resources, resources)
          if (field) p.fields = [{ row: 0, col: 1, stacks: [] }]
          configure(state)
        },
      }),
    )
    assert.equal(s.getState().interaction.stateId, 'idle')
    assert.equal(s.getState().state.roundPhase, 'work')
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function values(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  function opts(r: SessionResponse) {
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'choice',
      JSON.stringify(r.interaction),
    )
    return getChoiceOptions(r)
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
    const r = ok(s.takeAction(actor, space))
    assert.ok(
      r.state.actionSpaces
        .find((a) => a.id === space)!
        .takenBy.some((w) => w.playerId === r.state.players[actor]!.id),
    )
    return r
  }
  function enter(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    const branch = opts(r).find((o) =>
      o.value.startsWith('action-improvement-'),
    )
    if (branch) r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function bought(
    s: GameSession,
    r: SessionResponse,
    card: string,
    returnId?: string,
  ) {
    assert.ok(opts(r).some((o) => o.value === card && !o.disabled))
    r = ok(s.resolveChoice(0, card))
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice' &&
      r.interaction.promptKey === 'prompt.selectPayment'
    ) {
      const option = opts(r).find((o) =>
        returnId ? JSON.stringify(o).includes(returnId) : o.value !== 'cancel',
      )
      assert.ok(option, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, option.value))
    }
    assert.equal(r.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(r.state.players[0]!.minorHand.includes(card), false)
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'confirm-next-player',
      JSON.stringify(r.interaction),
    )
    const e = r.state.events.find(
      (e) => e.type === 'card.played' && e.cardId === card,
    )
    assert.ok(e?.type === 'card.played')

    if (card === CARD_ID)
      assert.deepEqual(e.payment?.resources, { wood: 2, stone: 2 })
    return r
  }
  function buy(s: GameSession, card: string, returnId?: string) {
    return bought(s, enter(s), card, returnId)
  }
  function deny(s: GameSession, card: string) {
    const r = enter(s)
    assert.equal(
      opts(r).some((o) => o.value === card && !o.disabled),
      false,
    )
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    const retry = bought(s, r, 'A054_Credit')
    assert.equal(retry.state.players[0]!.minorHand.includes(card), true)
    return retry
  }
  function cardFood(r: SessionResponse, card: string, actor = 0) {
    return (
      readCardResourceStats(r.state.players[actor]!, card)?.gained.food ?? 0
    )
  }
  function bake(s: GameSession, count = 1, actor = 0, provider = FIRE) {
    const remaining = s.getState().state.players[actor]!.resources.grain - count
    let r = turn(s, actor, 'grain-utilization')
    for (let n = 0; n < 5 && values(r, actor).grain > remaining; n++) {
      const option =
        opts(r).find((o) => o.value === `count-${provider}-${count}`) ??
        opts(r).find(
          (o) => o.value === provider || o.sourceCard === provider,
        ) ??
        opts(r).find(
          (o) =>
            o.value === 'bake-bread' || o.labelKey === 'actions.bakeBread.name',
        )
      assert.ok(option, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(actor, option.value))
    }
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'confirm-next-player',
      JSON.stringify(r.interaction),
    )
    return r
  }
  function cook(s: GameSession, from: 'vegetable' | 'sheep' | 'cattle') {
    const r = ok(s.takeAnytimeAction(0, 'exchange'))
    const options = opts(r)
    assert.ok(options.length)
    const index = from === 'vegetable' ? 0 : from === 'sheep' ? 1 : 2
    const result = ok(s.resolveChoice(0, `bulk:${index}=1`))
    assert.equal(values(result)[from], 0)
    return result
  }
  function workEnd(s: GameSession) {
    turn(s, 0, 'forest')
    turn(s, 1, 'grain-seeds')
    turn(s, 0, 'clay-pit')
    return confirmNext(s, turn(s, 1, 'reed-bank'))
  }
  function finishHarvest(s: GameSession, r: SessionResponse) {
    let paid = 0
    for (let n = 0; n < 15 && r.interaction.stateId === 'wait'; n++) {
      const i = r.interaction
      if (i.request.kind === 'feed') {
        const food = values(r, i.playerIndex).food
        r = ok(s.resolveChoice(i.playerIndex, 'confirm', { selections: [] }))
        assert.equal(values(r, i.playerIndex).food, food - 4)
        paid++
        continue
      }
      if (i.request.kind === 'confirm-player-switch') {
        r = ok(s.resolveChoice(i.request.toPlayerIndex, 'confirm'))
        continue
      }
      assert.fail(JSON.stringify(i))
    }
    assert.equal(r.interaction.stateId, r.state.gameOver ? 'gameover' : 'idle')
    assert.ok(r.state.roundPhase === 'work' || r.state.gameOver)
    assert.ok(paid <= 2)
    return r
  }
  function point(r: SessionResponse, card: string, expected: number) {
    assert.ok(r.scores)
    assert.equal(
      r.scores[0]!.categories.find((c) => c.key === 'cards')?.entries.find(
        (e) => e.type === 'card' && e.cardId === card,
      )?.score,
      expected,
    )
  }
  it('actual purchase pays two wood and two stone and earns two printed points', () => {
    const r = buy(
      setup({ played: false, resources: { wood: 2, stone: 2 } }),
      CARD_ID,
    )
    assert.equal(values(r).wood, 0)
    assert.equal(values(r).stone, 0)
    assert.equal(values(r).food, 20)
    point(r, CARD_ID, 2)
    return void sessionEvidence.record('observed outcome', {
      windmillPlayed: true,
      wood: 0,
      stone: 0,
      paid: { wood: 2, stone: 2 },
      printedPoints: 2,
      windmillFoodOnBuy: 0,
    })
  })
  it('one wood short rejects a forged Windmill purchase before a legal retry', () => {
    const r = deny(
      setup({ played: false, resources: { wood: 1, stone: 2 } }),
      CARD_ID,
    )
    assert.equal(values(r).wood, 1)
    assert.equal(values(r).stone, 2)
    return void sessionEvidence.record('observed outcome', {
      windmillInHand: true,
      wood: 1,
      stone: 2,
      forgedPurchaseRejected: true,
      legalRetryCompleted: true,
    })
  })
  it('one stone short rejects a forged Windmill purchase before a legal retry', () => {
    const r = deny(
      setup({ played: false, resources: { wood: 2, stone: 1 } }),
      CARD_ID,
    )
    assert.equal(values(r).wood, 2)
    assert.equal(values(r).stone, 1)
    return void sessionEvidence.record('observed outcome', {
      windmillInHand: true,
      wood: 2,
      stone: 1,
      forgedPurchaseRejected: true,
      legalRetryCompleted: true,
    })
  })
  it('each independently post-harvest round pays three food after one actual Bake Bread', () => {
    const byRound: Record<string, object> = {}
    for (const round of [5, 8, 10, 12, 14]) {
      const r = bake(setup({ round, majors: [FIRE], resources: { grain: 1 } }))
      assert.equal(values(r).grain, 0)
      assert.equal(values(r).food, 25)
      assert.equal(cardFood(r, CARD_ID), 3)
      byRound[String(round)] = { grain: 0, food: 25, windmillFood: 3 }
    }
    return void sessionEvidence.record('observed outcome', { byRound })
  })
  it('rounds not immediately following harvest do not give Windmill food', () => {
    const byRound: Record<string, object> = {}
    for (const round of [4, 6, 7, 9, 11, 13]) {
      const r = bake(setup({ round, majors: [FIRE], resources: { grain: 1 } }))
      assert.equal(values(r).grain, 0)
      assert.equal(values(r).food, 22)
      assert.equal(cardFood(r, CARD_ID), 0)
      byRound[String(round)] = { grain: 0, food: 22, windmillFood: 0 }
    }
    return void sessionEvidence.record('observed outcome', { byRound })
  })
  it('baking two grains in one action gives the bonus once rather than per grain', () => {
    const r = bake(setup({ majors: [FIRE], resources: { grain: 2 } }), 2)
    assert.equal(values(r).grain, 0)
    assert.equal(values(r).food, 27)
    assert.equal(cardFood(r, CARD_ID), 3)
    return void sessionEvidence.record('observed outcome', {
      grain: 0,
      food: 27,
      bakingFood: 4,
      windmillFood: 3,
      windmillReceipts: 1,
    })
  })
  it('declining optional Bake Bread after a real sow action gives no Windmill food', () => {
    const s = setup({ majors: [FIRE], resources: { grain: 2 }, field: true })
    let r = turn(s, 0, 'grain-utilization')
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice'
    ) {
      const sow = opts(r).find(
        (o) => o.value === 'sow' || o.labelKey === 'actions.sow.name',
      )
      assert.ok(sow)
      r = ok(s.resolveChoice(0, sow.value))
    }
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'farm-select',
    )
    r = ok(
      s.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 1, crop: 'grain' }],
      }),
    )
    for (
      let n = 0;
      n < 3 &&
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice';
      n++
    ) {
      const done = opts(r).find(
        (o) => o.value === '__skip__' || o.value === '__done__',
      )
      assert.ok(done, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, done.value))
    }
    assert.equal(values(r).grain, 1)
    assert.equal(values(r).food, 20)
    assert.equal(cardFood(r, CARD_ID), 0)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 3)
    return void sessionEvidence.record('observed outcome', {
      grain: 1,
      grainOnField: 3,
      food: 20,
      windmillFood: 0,
    })
  })
  it('zero grain with a real vegetable sow action gives no bake bonus', () => {
    const s = setup({
      majors: [FIRE],
      resources: { vegetable: 1 },
      field: true,
    })
    let r = turn(s, 0, 'grain-utilization')
    if (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice'
    ) {
      const sow = opts(r).find(
        (o) => o.value === 'sow' || o.labelKey === 'actions.sow.name',
      )
      assert.ok(sow)
      r = ok(s.resolveChoice(0, sow.value))
    }
    assert.ok(
      r.interaction.stateId === 'wait' &&
        r.interaction.request.kind === 'farm-select',
    )
    r = ok(
      s.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 1, crop: 'vegetable' }],
      }),
    )
    for (
      let n = 0;
      n < 3 &&
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice';
      n++
    ) {
      const done = opts(r).find(
        (o) => o.value === '__skip__' || o.value === '__done__',
      )
      assert.ok(done, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, done.value))
    }
    assert.equal(values(r).vegetable, 0)
    assert.equal(values(r).food, 20)
    assert.equal(cardFood(r, CARD_ID), 0)
    assert.equal(r.state.players[0]!.fields[0]!.stacks[0]!.remaining, 2)
    return void sessionEvidence.record('observed outcome', {
      grain: 0,
      vegetable: 0,
      vegetableOnField: 2,
      food: 20,
      windmillFood: 0,
    })
  })
  it('Oriental anytime vegetable cooking is not a Bake Bread action', () => {
    const r = cook(
      setup({ minor: [ORIENTAL], resources: { vegetable: 1 } }),
      'vegetable',
    )
    assert.equal(values(r).food, 24)
    assert.equal(cardFood(r, CARD_ID), 0)
    return void sessionEvidence.record('observed outcome', {
      vegetable: 0,
      food: 24,
      orientalCookingFood: 4,
      windmillFood: 0,
    })
  })
  it('an opponent real Bake Bread cannot grant owner Windmill food', () => {
    const s = setup({
      majors: [FIRE],
      configure(state) {
        state.players[1]!.improvements = ['Major_Fireplace2']
        takeMajorImprovementFromSupply(state, 'Major_Fireplace2')
        state.players[1]!.resources.grain = 1
      },
    })
    turn(s, 0, 'forest')
    const r = bake(s, 1, 1, 'Major_Fireplace2')
    assert.equal(values(r).food, 20)
    assert.equal(values(r, 1).food, 22)
    assert.equal(values(r, 1).grain, 0)
    assert.equal(cardFood(r, CARD_ID), 0)
    return void sessionEvidence.record('observed outcome', {
      ownerFood: 20,
      opponentFood: 22,
      opponentGrain: 0,
      ownerWindmillFood: 0,
    })
  })
  it('Windmill in hand supplies no bonus to a real owner bake', () => {
    const r = bake(
      setup({ played: false, majors: [FIRE], resources: { grain: 1 } }),
    )
    assert.equal(values(r).grain, 0)
    assert.equal(values(r).food, 22)
    assert.equal(cardFood(r, CARD_ID), 0)
    return void sessionEvidence.record('observed outcome', {
      windmillInHand: true,
      grain: 0,
      food: 22,
      windmillFood: 0,
    })
  })
  it('an occupied Bake Bread host rejects a repeated request before a legal retry', () => {
    const s = setup({ majors: [FIRE], resources: { grain: 2 } })
    bake(s, 1)
    turn(s, 1, 'grain-seeds')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'grain-utilization'))
    const r = turn(s, 0, 'forest')
    assert.equal(values(r).grain, 1)
    assert.equal(values(r).food, 25)
    assert.equal(cardFood(r, CARD_ID), 3)
    return void sessionEvidence.record('observed outcome', {
      repeatedHostRejected: true,
      grain: 1,
      food: 25,
      windmillReceipts: 1,
    })
  })
  it('undo restores real baked grain and Windmill bonus before one retry', () => {
    const s = setup({ majors: [FIRE], resources: { grain: 1 } })
    const before = undoRuleSnapshot(s.getState())
    bake(s)
    assertUndoRestored(before, s.undoAction())
    const r = bake(s)
    assert.equal(values(r).grain, 0)
    assert.equal(values(r).food, 25)
    return void sessionEvidence.record('observed outcome', {
      fullRuleScopeRestored: true,
      retryGrain: 0,
      retryFood: 25,
    })
  })
  it('a natural harvest four transition reaches round five before an actual bonus bake', () => {
    const s = setup({ round: 4, majors: [FIRE], resources: { grain: 1 } })
    const r = finishHarvest(s, workEnd(s))
    assert.equal(r.state.round, 5)
    assert.equal(values(r).food, 16)
    assert.equal(values(r).grain, 1)
    const end = bake(s)
    assert.equal(values(end).grain, 0)
    assert.equal(values(end).food, 21)
    assert.equal(cardFood(end, CARD_ID), 3)
    return void sessionEvidence.record('observed outcome', {
      roundAfterHarvest: 5,
      foodBeforeBake: 16,
      grainAfterBake: 0,
      foodAfterBake: 21,
      windmillFood: 3,
    })
  })
})
