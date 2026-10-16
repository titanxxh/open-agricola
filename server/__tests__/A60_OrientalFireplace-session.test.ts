import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A060_OrientalFireplace'
import { countRoomAnimals } from '../../shared/domain/animals'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A060_OrientalFireplace'

const FIREPLACE_ID = 'Major_Fireplace1'

const COOKING_HEARTH_ID = 'Major_CookingHearth1'

const FILLER = '__test_placeholder__'

const setupPurchase = (fireplace = true) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5060, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.improvements = fireplace ? [FIREPLACE_ID] : []
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    grain: 0,
    vegetable: 0,
    food: 0,
  }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = getChoiceOptions(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response).find((candidate) => candidate.value === CARD_ID)
  if (!option) return response
  response = session.resolveChoice(0, option.value)
  return response
}

const setupPlayed = (resources: Partial<{
  vegetable: number
  sheep: number
  cattle: number
  grain: number
}> = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6060, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed = [CARD_ID]
  player.minorHand = [FILLER]
  player.occupationHand = [FILLER]
  player.resources = {
    ...player.resources,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    cattle: 0,
    ...resources,
  }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy = []
  state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy = []
  session.loadState(state)
  return session
}

describe('A060 Oriental Fireplace parity', () => {
  it('A060 S1: returning a Fireplace plays Oriental Fireplace without resources', () => {
    const response = play(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.improvements).not.toContain(FIREPLACE_ID)
    expect(response.state.availableMajorImprovements).toContain(FIREPLACE_ID)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0,
    })
  })

  it('A060 S2: without a Fireplace or Cooking Hearth Oriental Fireplace is unavailable', () => {
    const response = enterImprovementChoice(setupPurchase(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.interaction.stateId !== 'wait'
      || !(getChoiceOptions(response).some((option) => option.value === CARD_ID) ?? false)).toBe(true)
  })

  it('A060 S3: anytime exchanges convert vegetables, sheep, and cattle at printed rates', () => {
    const session = setupPlayed({ vegetable: 1, sheep: 2, cattle: 1 })
    expect(session.takeAction(0, 'farmland').ok).toBe(true)

    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    response = session.resolveChoice(0, 'bulk:0=1,1=2,2=1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      vegetable: 0, sheep: 0, cattle: 0, food: 15,
    })
  })

  it('A060 S4: grain is excluded from anytime cooking and bakes for two food per grain', () => {
    const session = setupPlayed({ grain: 2 })
    const active = session.takeAction(0, 'farmland')
    expect(active.ok, active.error).toBe(true)
    expect(active.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')

    const bakeSession = setupPlayed({ grain: 2 })
    let response = bakeSession.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const bakeOptions = getChoiceOptions(response).map((option) => option.value) ?? []
    expect(bakeOptions).toContain(`count-${CARD_ID}-2`)
    response = bakeSession.resolveChoice(0, `count-${CARD_ID}-2`)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 4 })
  })

  it('A060 S5: upgrading Oriental Fireplace removes it instead of returning it to major supply', () => {
    const session = setupPlayed()
    const state = session.getState().state
    state.availableMajorImprovements = [COOKING_HEARTH_ID]
    session.loadState(state)

    let response = session.takeAction(0, 'major-improvement')
    if (!response.state.players[0]!.improvements.includes(COOKING_HEARTH_ID)
      && response.interaction.stateId === 'wait') {
      const option = getChoiceOptions(response).find((candidate) =>
        candidate.value === COOKING_HEARTH_ID)
      if (option) response = session.resolveChoice(0, option.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.availableMajorImprovements).not.toContain(CARD_ID)
  })
})

describe('A060 command boundaries', () => {
  const CARD_ID = 'A060_OrientalFireplace',
    FIRE = 'Major_Fireplace1'
  function setup({
    played = true,
    resources = {},
    majors = [],
    animal = null,
    configure = () => {},
  }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    majors?: string[]
    animal?: 'sheep' | 'boar' | 'cattle' | null
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(
      createWorkSession({
        seed: 4242,
        options: { playerCount: 2 },
        configure(state) {
          state.round = 5
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
          p.minorPlayed = played ? [CARD_ID] : []
          if (!played) p.minorHand.push(CARD_ID)
          p.improvements = majors
          majors.forEach((id) => takeMajorImprovementFromSupply(state, id))
          Object.assign(p.resources, resources)
          if (animal) {
            p.houseAnimals = { '2-0': animal }
            p.resources[animal] = 1
          }
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
    confirmed(r, actor)
    return r
  }
  function idle(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function cook(s: GameSession, from: 'vegetable' | 'sheep' | 'cattle') {
    const r = ok(s.takeAnytimeAction(0, 'exchange'))
    const options = opts(r)
    assert.ok(options.length)
    const index = from === 'vegetable' ? 0 : from === 'sheep' ? 1 : 2
    const result = idle(ok(s.resolveChoice(0, `bulk:${index}=1`)))
    assert.equal(values(result)[from], 0)
    return result
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
  it('returning owned Fireplace1 is the actual printed payment', () => {
    const s = setup({ played: false, majors: ['Major_Fireplace1'] })
    const r = buy(s, CARD_ID)
    assert.equal(
      r.state.players[0]!.improvements.includes('Major_Fireplace1'),
      false,
    )
    assert.equal(
      r.state.availableMajorImprovements.includes('Major_Fireplace1'),
      true,
    )
    assert.equal(values(r).food, 20)
    point(r, CARD_ID, 1)
    return void sessionEvidence.record('observed outcome', {
      cardPlayed: true,
      returnedMajor: 'Major_Fireplace1',
      ownedReturnedMajor: false,
      paidBuildingGoods: {},
      food: 20,
      printedPoints: 1,
    })
  })
  it('returning owned Fireplace2 is a separate legal payment', () => {
    const s = setup({ played: false, majors: ['Major_Fireplace2'] })
    const r = buy(s, CARD_ID)
    assert.equal(
      r.state.players[0]!.improvements.includes('Major_Fireplace2'),
      false,
    )
    assert.equal(
      r.state.availableMajorImprovements.includes('Major_Fireplace2'),
      true,
    )
    assert.equal(values(r).food, 20)
    return void sessionEvidence.record('observed outcome', {
      cardPlayed: true,
      returnedMajor: 'Major_Fireplace2',
      ownedReturnedMajor: false,
      paidBuildingGoods: {},
      food: 20,
    })
  })
  it('returning owned CookingHearth1 is an independent legal payment', () => {
    const s = setup({ played: false, majors: ['Major_CookingHearth1'] })
    const r = buy(s, CARD_ID)
    assert.equal(
      r.state.players[0]!.improvements.includes('Major_CookingHearth1'),
      false,
    )
    assert.equal(
      r.state.availableMajorImprovements.includes('Major_CookingHearth1'),
      true,
    )
    assert.equal(values(r).food, 20)
    return void sessionEvidence.record('observed outcome', {
      cardPlayed: true,
      returnedMajor: 'Major_CookingHearth1',
      ownedReturnedMajor: false,
      paidBuildingGoods: {},
      food: 20,
    })
  })
  it('returning owned CookingHearth2 is an independent legal payment', () => {
    const s = setup({ played: false, majors: ['Major_CookingHearth2'] })
    const r = buy(s, CARD_ID)
    assert.equal(
      r.state.players[0]!.improvements.includes('Major_CookingHearth2'),
      false,
    )
    assert.equal(
      r.state.availableMajorImprovements.includes('Major_CookingHearth2'),
      true,
    )
    assert.equal(values(r).food, 20)
    return void sessionEvidence.record('observed outcome', {
      cardPlayed: true,
      returnedMajor: 'Major_CookingHearth2',
      ownedReturnedMajor: false,
      paidBuildingGoods: {},
      food: 20,
    })
  })
  it('no owned replacement card blocks and rejects a forged purchase', () => {
    const r = deny(setup({ played: false }), CARD_ID)
    return void sessionEvidence.record('observed outcome', {
      orientalInHand: true,
      orientalPlayed: false,
      forgedPurchaseRejected: true,
      legalRetryCompleted:
        r.state.players[0]!.minorPlayed.includes('A054_Credit'),
    })
  })
  it('an opponent owned Fireplace cannot pay the owner replacement fee', () => {
    const s = setup({
      played: false,
      configure(state) {
        state.players[1]!.improvements = [FIRE]
        takeMajorImprovementFromSupply(state, FIRE)
      },
    })
    const r = deny(s, CARD_ID)
    assert.ok(r.state.players[1]!.improvements.includes(FIRE))
    return void sessionEvidence.record('observed outcome', {
      orientalInHand: true,
      forgedPurchaseRejected: true,
      opponentStillOwnsFireplace: true,
      legalRetryCompleted: true,
    })
  })
  it('a nonmatching owned Joinery cannot replace the printed return fee', () => {
    const r = deny(
      setup({ played: false, majors: ['Major_Joinery'] }),
      CARD_ID,
    )
    assert.ok(r.state.players[0]!.improvements.includes('Major_Joinery'))
    return void sessionEvidence.record('observed outcome', {
      orientalInHand: true,
      forgedPurchaseRejected: true,
      joineryStillOwned: true,
      legalRetryCompleted: true,
    })
  })
  it('actual anytime vegetable cooking gives four food', () => {
    const s = setup({ resources: { vegetable: 1 } })
    const r = cook(s, 'vegetable')
    assert.equal(values(r).food, 24)
    return void sessionEvidence.record('observed outcome', {
      vegetable: 0,
      food: 24,
      paid: { vegetable: 1 },
      received: { food: 4 },
    })
  })
  it('actual anytime cooking consumes one legally housed sheep for three food', () => {
    const s = setup({ animal: 'sheep' })
    const r = cook(s, 'sheep')
    assert.equal(values(r).food, 23)
    assert.equal(countRoomAnimals(r.state.players[0]!), 0)
    return void sessionEvidence.record('observed outcome', {
      housedSheep: 0,
      food: 23,
      paid: { sheep: 1 },
      received: { food: 3 },
    })
  })
  it('actual anytime cooking consumes one legally housed cattle for five food', () => {
    const s = setup({ animal: 'cattle' })
    const r = cook(s, 'cattle')
    assert.equal(values(r).food, 25)
    assert.equal(countRoomAnimals(r.state.players[0]!), 0)
    return void sessionEvidence.record('observed outcome', {
      housedCattle: 0,
      food: 25,
      paid: { cattle: 1 },
      received: { food: 5 },
    })
  })
  it('the printed Oriental cooking options exclude boar while a legal vegetable exchange preserves the pet', () => {
    const s = setup({ animal: 'boar', resources: { vegetable: 1 } })
    const pending = ok(s.takeAnytimeAction(0, 'exchange'))
    assert.equal(
      opts(pending).some((o) => JSON.stringify(o).includes('boar')),
      false,
    )
    const r = idle(ok(s.resolveChoice(0, 'bulk:0=1')))
    assert.equal(values(r).vegetable, 0)
    assert.equal(values(r).food, 24)
    assert.equal(values(r).boar, 1)
    assert.equal(countRoomAnimals(r.state.players[0]!), 1)
    return void sessionEvidence.record('observed outcome', {
      orientalBoarOption: false,
      housedBoar: 1,
      vegetable: 0,
      food: 24,
    })
  })
  it('grain is excluded from Oriental anytime cooking and real Bake Bread converts two grains to four food', () => {
    const s = setup({ resources: { grain: 2 } })
    assert.equal(
      s.getState().interaction.anytimeActions.some((a) => a.id === 'exchange'),
      false,
    )
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'exchange'))
    const r = bake(s, 2, 0, CARD_ID)
    assert.equal(values(r).grain, 0)
    assert.equal(values(r).food, 24)
    return void sessionEvidence.record('observed outcome', {
      orientalAnytimeGrainOption: false,
      grain: 0,
      food: 24,
      bakePaidGrain: 2,
      bakeReceivedFood: 4,
    })
  })
  it('Oriental in hand supplies no Oriental cooking rate', () => {
    const s = setup({ played: false, resources: { vegetable: 1 } })
    assert.equal(
      s
        .getState()
        .interaction.anytimeActions.some((a) => a.sourceCard === CARD_ID),
      false,
    )
    idle(s.getState())
    assert.ok(s.getState().state.players[0]!.minorHand.includes(CARD_ID))
    return void sessionEvidence.record('observed outcome', {
      orientalCookSourceOffered: false,
      orientalInHand: true,
    })
  })
  it('undo restores actual replacement payment and permits one purchase retry', () => {
    const s = setup({ played: false, majors: [FIRE] })
    const initial = idle(s.getState())
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    buy(s, CARD_ID)
    const restored = s.undoAction()
    assertUndoRestored(before, restored)
    assert.equal(JSON.stringify(restored.interaction), beforeInteraction)
    assert.equal(JSON.stringify(s.getState().interaction), beforeInteraction)
    assert.equal(restored.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    const r = buy(s, CARD_ID)
    assert.equal(
      r.state.players[0]!.minorPlayed.filter((c) => c === CARD_ID).length,
      1,
    )
    return void sessionEvidence.record('observed outcome', {
      fullRuleScopeRestored: true,
      singleRetryCardPlayed: true,
    })
  })
  it('a real return-card choice cannot select the opponent card and returns only the chosen owned major', () => {
    const s = setup({
      played: false,
      majors: [FIRE, 'Major_CookingHearth1'],
      configure(state) {
        state.players[1]!.improvements = ['Major_Fireplace2']
        takeMajorImprovementFromSupply(state, 'Major_Fireplace2')
      },
    })
    let r = enter(s)
    assert.ok(opts(r).some((o) => o.value === CARD_ID))
    r = ok(s.resolveChoice(0, CARD_ID))
    assert.ok(r.interaction.stateId === 'wait')
    assert.equal(r.interaction.promptKey, 'prompt.selectPayment')
    assert.equal(
      opts(r).some((o) => JSON.stringify(o).includes('Major_Fireplace2')),
      false,
    )
    const own = opts(r).find((o) => JSON.stringify(o).includes(FIRE))
    assert.ok(own, JSON.stringify(r.interaction))
    assertRejectedUnchanged(s, () =>
      s.resolveChoice(0, own.value.split('~')[0] + '~foreign-unissued-payment'),
    )
    r = confirmed(ok(s.resolveChoice(0, own.value)))
    assert.ok(r.state.players[0]!.minorPlayed.includes(CARD_ID))
    assert.ok(r.state.players[0]!.improvements.includes('Major_CookingHearth1'))
    assert.ok(r.state.players[1]!.improvements.includes('Major_Fireplace2'))
    assert.equal(r.state.players[0]!.improvements.includes(FIRE), false)
    return void sessionEvidence.record('observed outcome', {
      unissuedReturnChoiceRejected: true,
      returnedMajor: FIRE,
      hearthStillOwned: true,
      opponentFireplaceStillOwned: true,
      orientalPlayed: true,
    })
  })
})
