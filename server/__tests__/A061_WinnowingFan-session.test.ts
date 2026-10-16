import { describe, expect, it } from 'vitest'
import { playMinor, setupMinorSession } from './_helpers/batch07-card-play'
import '../../shared/cards/A/A061_WinnowingFan'
import '../../shared/cards/D/D064_BakingCourse'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A061 Winnowing Fan through Session', () => {
  it('requires a baking improvement', () => {
    const blocked = playMinor(sessionEvidence.track(setupMinorSession({
      cardId: 'A061_WinnowingFan', resources: { reed: 1 },
    })), 'A061_WinnowingFan')
    expect(blocked.state.players[0]!.minorPlayed).not.toContain('A061_WinnowingFan')
    expect(blocked.state.players[0]!.resources.reed).toBe(1)

    const played = playMinor(sessionEvidence.track(setupMinorSession({
      cardId: 'A061_WinnowingFan', resources: { reed: 1 }, improvements: ['Major_Fireplace1'],
    })), 'A061_WinnowingFan')
    expect(played.state.players[0]!.minorPlayed).toContain('A061_WinnowingFan')
    expect(played.state.players[0]!.resources.reed).toBe(0)
  })

  it('accepts a played minor baking improvement', () => {
    const played = playMinor(sessionEvidence.track(setupMinorSession({
      cardId: 'A061_WinnowingFan',
      resources: { reed: 1 },
      minorPlayed: ['D064_BakingCourse'],
    })), 'A061_WinnowingFan')

    expect(played.state.players[0]!.minorPlayed).toContain('A061_WinnowingFan')
    expect(played.state.players[0]!.resources.reed).toBe(0)
  })
})

describe('A061 command boundaries', () => {
  const ORIENTAL = 'A060_OrientalFireplace',
    CARD_ID = 'A061_WinnowingFan',
    MILL = 'A063_DutchWindmill',
    FIRE = 'Major_Fireplace1'
  function setup({
    played = true,
    round = 5,
    resources = {},
    majors = [],
    minor = [],
    field = false,
    crop = 0,
    configure = () => {},
  }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    majors?: string[]
    minor?: string[]
    field?: boolean
    crop?: number
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
          if (field)
            p.fields = [
              {
                row: 0,
                col: 1,
                stacks: crop ? [{ kind: 'grain', remaining: crop }] : [],
              },
            ]
          configure(state)
        },
      }),
    )
    assert.equal(s.getState().interaction.stateId, 'idle')
    assert.equal(s.getState().state.roundPhase, 'work')
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
    confirmed(r)
    const e = r.state.events.find(
      (e) => e.type === 'card.played' && e.cardId === card,
    )
    assert.ok(e?.type === 'card.played')
    if (card === CARD_ID) assert.deepEqual(e.payment?.resources, { reed: 1 })

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
  function workEnd(s: GameSession) {
    turn(s, 0, 'forest')
    turn(s, 1, 'grain-seeds')
    turn(s, 0, 'clay-pit')
    return confirmNext(s, turn(s, 1, 'reed-bank'))
  }
  function fanChoice(r: SessionResponse) {
    return (
      r.interaction.stateId === 'wait' &&
      r.interaction.request.kind === 'choice' &&
      r.interaction.sourceCard === CARD_ID
    )
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
  function fanOffer(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, CARD_ID)
    assert.equal(r.interaction.promptKey, 'ui.interactionFlowSelect')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'field')
    const options = opts(r)
    const exchanges = options.filter(o => !o.disabled && o.value !== '__skip__')
    assert.equal(exchanges.length, 1)
    const exchange = exchanges[0]!
    assert.equal(exchange.sourceCard, CARD_ID)
    assert.deepEqual(exchange.effectPreview, { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 2 } })
    assert.ok(options.some(o => o.value === '__skip__' && !o.disabled))
    return exchange
  }
  function fanHarvest({
    grain = 1,
    crop = 0,
    played = true,
    round = 4,
    mill = false,
  }: {
    grain?: number
    crop?: number
    played?: boolean
    round?: number
    mill?: boolean
  } = {}) {
    const s = setup({
      played,
      round,
      resources: { grain },
      majors: [FIRE],
      minor: mill ? [MILL] : [],
      field: crop > 0,
      crop,
    })
    const r = workEnd(s)
    return { s, r }
  }
  it('one reed with a real owned Fireplace permits the actual purchase', () => {
    const r = buy(
      setup({ played: false, resources: { reed: 1 }, majors: [FIRE] }),
      CARD_ID,
    )
    assert.equal(values(r).reed, 0)
    assert.equal(values(r).food, 20)
    return void sessionEvidence.record('observed outcome', {
      fanPlayed: true,
      reed: 0,
      paid: { reed: 1 },
      fanFoodOnBuy: 0,
    })
  })
  it('owned Oriental Fireplace independently qualifies as a baking improvement', () => {
    const r = buy(
      setup({ played: false, resources: { reed: 1 }, minor: [ORIENTAL] }),
      CARD_ID,
    )
    assert.equal(values(r).reed, 0)
    assert.ok(r.state.players[0]!.minorPlayed.includes(ORIENTAL))
    return void sessionEvidence.record('observed outcome', {
      fanPlayed: true,
      reed: 0,
      orientalStillPlayed: true,
    })
  })
  it('missing reed rejects purchase despite owned baking provider', () => {
    const r = deny(setup({ played: false, majors: [FIRE] }), CARD_ID)
    assert.ok(r.state.players[0]!.minorHand.includes(CARD_ID))
    return void sessionEvidence.record('observed outcome', {
      fanInHand: true,
      forgedPurchaseRejected: true,
      legalRetryCompleted: true,
    })
  })
  it('nonbaking Joinery does not satisfy the baking prerequisite', () => {
    const r = deny(
      setup({
        played: false,
        resources: { reed: 1 },
        majors: ['Major_Joinery'],
      }),
      CARD_ID,
    )
    assert.equal(values(r).reed, 1)
    return void sessionEvidence.record('observed outcome', {
      fanInHand: true,
      reed: 1,
      forgedPurchaseRejected: true,
      legalRetryCompleted: true,
    })
  })
  it('only the opponent baking provider does not satisfy owner prerequisite', () => {
    const r = deny(
      setup({
        played: false,
        resources: { reed: 1 },
        configure(state) {
          state.players[1]!.improvements = [FIRE]
          takeMajorImprovementFromSupply(state, FIRE)
        },
      }),
      CARD_ID,
    )
    assert.equal(values(r).reed, 1)
    assert.ok(r.state.players[1]!.improvements.includes(FIRE))
    return void sessionEvidence.record('observed outcome', {
      fanInHand: true,
      reed: 1,
      forgedPurchaseRejected: true,
      opponentBakerStillOwned: true,
    })
  })
  it('zero grain after a real field phase supplies no Fan exchange', () => {
    const { r } = fanHarvest({ grain: 0 })
    assert.equal(fanChoice(r), false)
    const end = roundStarted(r, 5)
    assert.equal(values(end).grain, 0)
    assert.equal(values(end).food, 16)
    assert.equal(cardFood(end, CARD_ID), 0)
    return void sessionEvidence.record('observed outcome', {
      grain: 0,
      fanBakeOffered: false,
      fanFoodGain: 0,
      foodAfterFeeding: 16,
    })
  })
  it('one grain actually harvested can be turned into food only after the field phase', () => {
    const { s, r } = fanHarvest({ grain: 0, crop: 1 })
    assert.equal(values(r).grain, 1)
    assert.equal(r.state.players[0]!.fields[0]!.stacks.length, 0)
    assert.equal(fanChoice(r), true)
    const next = ok(
      s.resolveChoice(0, fanOffer(r).value),
    )
    assert.equal(values(next).grain, 0)
    assert.equal(values(next).food, 18)
    assert.equal(cardFood(next, CARD_ID), 2)
    const end = roundStarted(next, 5)
    assert.equal(values(end).food, 18)
    return void sessionEvidence.record('observed outcome', {
      grainAfterField: 1,
      fieldRemaining: 0,
      fanPaidGrain: 1,
      fanReceivedFood: 2,
      grainAfterFan: 0,
      foodAfterFeeding: 18,
    })
  })
  it('two supplied grain still permit only one grain in one Fan activation', () => {
    const { s, r } = fanHarvest({ grain: 2 })
    assert.equal(fanChoice(r), true)
    const end = roundStarted(ok(s.resolveChoice(0, fanOffer(r).value)), 5)
    assert.equal(values(end).grain, 1)
    assert.equal(values(end).food, 18)
    assert.equal(cardFood(end, CARD_ID), 2)
    return void sessionEvidence.record('observed outcome', {
      fanPaidGrain: 1,
      fanReceivedFood: 2,
      remainingGrain: 1,
      foodAfterFeeding: 18,
    })
  })
  it('the optional Fan exchange can be declined without a grain conversion', () => {
    const { s, r } = fanHarvest({ grain: 2 })
    assert.equal(fanChoice(r), true)
    fanOffer(r)
    const end = roundStarted(ok(s.resolveChoice(0, '__skip__')), 5)
    assert.equal(values(end).grain, 2)
    assert.equal(values(end).food, 16)
    assert.equal(cardFood(end, CARD_ID), 0)
    return void sessionEvidence.record('observed outcome', {
      grain: 2,
      fanPaidGrain: 0,
      fanFoodGain: 0,
      foodAfterFeeding: 16,
    })
  })
  it('a nonharvest round completion cannot trigger Fan', () => {
    const { r } = fanHarvest({ grain: 2, round: 5 })
    assert.equal(fanChoice(r), false)
    const end = roundStarted(r, 6)
    assert.equal(end.state.round, 6)
    assert.equal(values(end).grain, 2)
    assert.equal(values(end).food, 20)
    return void sessionEvidence.record('observed outcome', {
      round: 6,
      grain: 2,
      food: 20,
      fanFoodGain: 0,
    })
  })
  it('Fan in hand cannot convert grain after harvest fields', () => {
    const { r } = fanHarvest({ grain: 1, played: false })
    assert.equal(fanChoice(r), false)
    const end = roundStarted(r, 5)
    assert.equal(values(end).grain, 1)
    assert.equal(values(end).food, 16)
    assert.ok(end.state.players[0]!.minorHand.includes(CARD_ID))
    return void sessionEvidence.record('observed outcome', {
      fanInHand: true,
      fanBakeOffered: false,
      grain: 1,
      foodAfterFeeding: 16,
    })
  })
  it('a real Fan conversion at harvest fourteen is not Bake Bread and cannot trigger Dutch Windmill', () => {
    const { s, r } = fanHarvest({ grain: 1, round: 14, mill: true })
    assert.equal(fanChoice(r), true)
    const next = ok(
      s.resolveChoice(0, fanOffer(r).value),
    )
    assert.equal(values(next).grain, 0)
    assert.equal(values(next).food, 18)
    assert.equal(cardFood(next, CARD_ID), 2)
    assert.equal(cardFood(next, MILL), 0)
    const end = next
    assert.equal(end.interaction.stateId, 'gameover', JSON.stringify(end.interaction))
    assert.equal(end.state.gameOver, true)
    assert.equal(end.state.round, 14)
    assert.equal(end.state.roundPhase, 'preparation')
    assert.equal(end.state.currentPlayerIndex, 1)
    assert.equal(values(end).food, 18)
    return void sessionEvidence.record('observed outcome', {
      fanPaidGrain: 1,
      fanReceivedFood: 2,
      windmillReceivedFood: 0,
      fanFoodReceivedBeforeAutomaticFeeding: 2,
      postChoiceFood: 18,
      foodAfterFeeding: 18,
    })
  })
  it('completed Fan harvest conversion rejects step undo without changing state', () => {
    const { s, r } = fanHarvest()
    assert.equal(fanChoice(r), true)
    const next = ok(
      s.resolveChoice(0, fanOffer(r).value),
    )
    assert.equal(values(next).grain, 0)
    assert.equal(values(next).food, 18)
    assert.equal(cardFood(next, CARD_ID), 2)
    roundStarted(next, 5)
    const undone = assertRejectedUnchanged(s, () => s.undoStep())
    assert.equal(undone.error, 'no history to undo')
    assert.equal(values(undone).grain, 0)
    assert.equal(values(undone).food, 18)
    assert.equal(cardFood(undone, CARD_ID), 2)
    sessionEvidence.record('step undo rejected', {
      undoError: undone.error,
      grain: 0,
      food: 18,
      fanFood: 2,
    })
  })
})
