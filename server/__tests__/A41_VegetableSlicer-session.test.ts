import { ActionHookRegistry } from '../../shared/actions/hooks'
import { createInitialState } from '../../shared/session/state-bootstrap'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerDispatchInput } from '../../shared/cards/card-listeners'
import { playImprovement } from '../../shared/actions/effects/improvement'
import { type DraftGameEvent } from '../../shared/contract/events'
import { type ActionExecutionResult, type ActionSpace, type GameState, type PlayerState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A041_VegetableSlicer'
import '../../shared/cards/A/A060_OrientalFireplace'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A041_VegetableSlicer'

const FIREPLACE_ID = 'Major_Fireplace1'

const COOKING_HEARTH_ID = 'Major_CookingHearth1'

const FIREPLACE3_ID = 'Major_Fireplace3'

const COOKING_HEARTH3_ID = 'Major_CookingHearth3'

const ORIENTAL_FIREPLACE_ID = 'A060_OrientalFireplace'

const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
]

const createPlayer = (): PlayerState => {
  const player = createInitialState(1, { playerCount: 2 }).players[0]!
  player.id = 'p1'; player.name = 'P1'
  player.minorHand = []; player.occupationHand = []
  Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
  return player
}

const createState = (player: PlayerState): GameState => ({
  ...createInitialState(1, { playerCount: 2 }), players: [player], availableMajorImprovements: [COOKING_HEARTH_ID],
})

const createSpace = (): ActionSpace => {
  const space = createInitialState(1, { playerCount: 2 }).actionSpaces.find(space => space.id === 'major-improvement')
  assert.ok(space)
  return space
}

const findListener = (ruleOwner: TestCardRegistry, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((listener) => listener.id === id)
  return withActiveRegistry(ruleOwner, lookupRule1)
}

const playedMajor = (
  cardId = COOKING_HEARTH_ID,
): DraftGameEvent<'card.played'> => ({
  type: 'card.played',
  cardId,
  cardType: 'major',
})

const paidForImprovement = (
  returnedCardId?: string,
): DraftGameEvent<'resource.paid'> => ({
  type: 'resource.paid',
  resources: {},
  paymentFor: 'major-improvement',
  ...(returnedCardId ? { returnedCardId } : {}),
})

describe('A041_VegetableSlicer improvement listener', () => {
  it('A041 S2: returning a major Fireplace for a Cooking Hearth grants two wood and one vegetable', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 1 }))
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = [COOKING_HEARTH_ID]

    const player = state.players[0]!
    setWorkersAtHome(state, player, 1)
    player.minorPlayed.push(CARD_ID)
    player.improvements = [FIREPLACE_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      grain: 0,
      vegetable: 0,
    }
    player.minorHand = [FIXED_HANDS[0]!.minor]
    player.occupationHand = [FIXED_HANDS[0]!.occupation]

    state.players[1]!.minorHand = [FIXED_HANDS[1]!.minor]
    state.players[1]!.occupationHand = [FIXED_HANDS[1]!.occupation]
    session.loadState(state)

    const resp = session.takeAction(0, 'major-improvement')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(resp.state.players[0]!.improvements).not.toContain(FIREPLACE_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'major-improvement',
        returnedCardId: FIREPLACE_ID,
      }),
      expect.objectContaining({
        type: 'card.played',
        cardId: COOKING_HEARTH_ID,
        cardType: 'major',
      }),
      expect.objectContaining({
        type: 'card.triggered',
        cardId: CARD_ID,
      }),
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'card', cardId: CARD_ID }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
        resources: expect.objectContaining({ wood: 2, vegetable: 1 }),
      }),
    ]))
  })

  it('gains 2 wood and 1 vegetable when Fireplace becomes Cooking Hearth', () => {
    const actionHooks = new ActionHookRegistry()
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.improvements = [FIREPLACE_ID]

    const state = createState(player)
    const result = withActiveRegistry(ruleRegistry, () => playImprovement(state, player, `major:${COOKING_HEARTH_ID}`, 'any', undefined, undefined, actionHooks))

    expect(result.type).toBe('ok')
    const actionEvents = [paidForImprovement(FIREPLACE_ID), playedMajor()]
    const hookResult = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {state,
      player,
      space: createSpace(),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
      actionHooks
    } satisfies CardListenerDispatchInput))

    expect(player.improvements).toContain(COOKING_HEARTH_ID)
    expect(player.improvements).not.toContain(FIREPLACE_ID)
    expect(hookResult?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: 2, vegetable: 1 },
    })
  })

  it('gains 2 wood and 1 vegetable when duplicate Fireplace becomes duplicate Cooking Hearth', () => {
    const actionHooks = new ActionHookRegistry()
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.improvements = [FIREPLACE3_ID]

    const state = createState(player)
    const actionEvents = [paidForImprovement(FIREPLACE3_ID), playedMajor(COOKING_HEARTH3_ID)]
    const hookResult = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {state,
      player,
      space: createSpace(),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH3_ID}`,
      result: { type: 'ok' },
      transactionEvents: actionEvents,
      actionEvents,
      actionHooks
    } satisfies CardListenerDispatchInput))

    expect(hookResult?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: 2, vegetable: 1 },
    })
  })

  it('does not trigger on a pure clay Cooking Hearth purchase', () => {
    const actionHooks = new ActionHookRegistry()
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    player.resources.clay = 4

    const state = createState(player)
    const result = withActiveRegistry(ruleRegistry, () => playImprovement(state, player, `major:${COOKING_HEARTH_ID}`, 'any', undefined, undefined, actionHooks))

    expect(result.type).toBe('ok')
    const actionEvents = [paidForImprovement(), playedMajor()]
    const hookResult = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {state,
      player,
      space: createSpace(),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result,
      transactionEvents: actionEvents,
      actionEvents,
      actionHooks
    } satisfies CardListenerDispatchInput))

    expect(player.improvements).toContain(COOKING_HEARTH_ID)
    expect(hookResult).toBeUndefined()
  })

  it('ignores legacy improvementPayment extraData when returned-card event is missing', () => {
    const actionHooks = new ActionHookRegistry()
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'A41-vegetable-slicer-after-improvement')
    expect(listener).toBeDefined()

    const player = createPlayer()
    player.minorPlayed = [CARD_ID]
    const state = createState(player)
    const actionEvents = [playedMajor()]
    const result = {
      type: 'ok',
      extraData: {
        improvementPayment: {
          improvementId: COOKING_HEARTH_ID,
          returnedCardId: FIREPLACE_ID,
        },
      },
    } satisfies ActionExecutionResult

    const hookResult = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {state,
      player,
      space: createSpace(),
      actionId: 'improvement',
      phase: 'after',
      choice: `major:${COOKING_HEARTH_ID}`,
      result,
      transactionEvents: actionEvents,
      actionEvents,
      actionHooks
    } satisfies CardListenerDispatchInput))

    expect(hookResult).toBeUndefined()
  })
})

const improvementSession = ({ returnedCard, clay = 0 }: { returnedCard?: string; clay?: number }) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 41, options: { playerCount: 2 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.availableMajorImprovements = [COOKING_HEARTH_ID]
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 1)
    player.minorHand = [FIXED_HANDS[index]!.minor]
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  if (returnedCard === ORIENTAL_FIREPLACE_ID) player.minorPlayed.push(returnedCard)
  else if (returnedCard) player.improvements = [returnedCard]
  player.resources = { ...player.resources, clay, wood: 0, vegetable: 0 }
  session.loadState(state)
  return session
}

const playA41 = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 41, options: { playerCount: 2 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 1)
    player.minorHand = [FIXED_HANDS[index]!.minor]
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
  })
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.wood = 1
  state.players[0]!.resources.vegetable = 0
  session.loadState(state)

  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = getChoiceOptions(resp)?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) resp = session.resolveChoice(0, improvementOption.value)
  if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(0, cardOption!.value)
}

const buyCookingHearth = (session: GameSession) => {
  const resp = session.takeAction(0, 'major-improvement')
  if (resp.state.players[0]!.improvements.includes(COOKING_HEARTH_ID)) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const option = getChoiceOptions(resp)?.find((entry) => entry.value === COOKING_HEARTH_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A041 parity batch-02 characterization', () => {
  it('A041 S1: playing Vegetable Slicer costs one wood and grants no retroactive reward', () => {
    const resp = playA41()

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A041 S3: buying a Cooking Hearth with clay grants no Vegetable Slicer reward', () => {
    const resp = buyCookingHearth(improvementSession({ clay: 4 }))

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(resp.state.players[0]!.resources).toMatchObject({ clay: 0, wood: 0, vegetable: 0 })
  })

  it('A041 S4: OA upgrades Oriental Fireplace but grants no Vegetable Slicer reward', () => {
    const resp = buyCookingHearth(improvementSession({ returnedCard: ORIENTAL_FIREPLACE_ID }))

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain(COOKING_HEARTH_ID)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(ORIENTAL_FIREPLACE_ID)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
  })
})

describe("A041 command boundaries", () => {
  const A041 = 'A041_VegetableSlicer'
  const ORIENTAL = 'A060_OrientalFireplace'
  function setup({ played = true, resources = {}, opponent = {}, fireplace = '', opponentFireplace = '', hearth = 'Major_CookingHearth1' }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
    fireplace?: string
    opponentFireplace?: string
    hearth?: string
  } = {}) {
    return sessionEvidence.track(createWorkSession({ seed: 724, configure: state => {
        state.round = 14
        state.availableMajorImprovements = [hearth]
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
          player.minorPlayed = []
          player.occupationPlayed = []
          player.improvements = []
          player.cardStates = {}
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        }
        const owner = state.players[0]!
        owner.minorPlayed = played ? [A041] : []
        owner.minorHand = played ? ['__test_placeholder__'] : [A041, '__test_placeholder__']
        if (fireplace.startsWith('Major_'))
          owner.improvements = [fireplace]
        else if (fireplace)
          owner.minorPlayed.push(fireplace)
        if (opponentFireplace)
          state.players[1]!.improvements = [opponentFireplace]
        Object.assign(owner.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      } }))
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? getChoiceOptions(r) : []
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const r = ok(s.takeAction(actor, space))
    return space === 'forest' ? confirmed(r, actor) : r
  }
  function minor(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = minor(s, card)
    return confirmed(r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card))
  }
  function denied(s: GameSession, card: string) {
    const r = minor(s, card)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.ok(s.getState().state.players[0]!.minorHand.includes(card))
  }
  function hearth(s: GameSession, actor = 0, target = 'Major_CookingHearth1') {
    const r = turn(s, actor, 'major-improvement')
    if (r.state.players[actor]!.improvements.includes(target))
      return confirmed(r, actor)
    return confirmed(choose(s, r, option => option.value === target || option.value === 'major:' + target), actor)
  }
  function reward(r: SessionResponse, wood: number, vegetable: number, actor = 0) {
    assert.equal(r.state.players[actor]!.resources.wood, wood)
    assert.equal(r.state.players[actor]!.resources.vegetable, vegetable)
  }
  it("fee shortage rejects forged card and exact one wood buys no reward", () => {
    denied(setup({ played: false }), A041)
    const r = buy(setup({ played: false, resources: { wood: 1 } }), A041)
    reward(r, 0, 0)
  })
  it("actual major Fireplace return grants two wood one vegetable exactly once", () => {
    for (const n of [1, 2]) {
      const fireplace = `Major_Fireplace${n}`, target = `Major_CookingHearth${n}`
      const s = setup({ fireplace, hearth: target })
      const r = hearth(s, 0, target)
      assert.ok(r.state.players[0]!.improvements.includes(target))
      assert.equal(r.state.players[0]!.improvements.includes(fireplace), false)
      assert.ok(r.state.availableMajorImprovements.includes(fireplace))
      assert.ok(r.state.events.some(e => e.type === 'resource.paid' && e.returnedCardId === fireplace))
      reward(r, 2, 1)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, target))
      reward(s.getState(), 2, 1)
    }
  })
  it("cash clay Hearth purchase grants no upgrade reward", () => {
    const s = setup({ resources: { clay: 4 } })
    const r = hearth(s)
    assert.ok(r.state.players[0]!.improvements.includes('Major_CookingHearth1'))
    assert.equal(r.state.players[0]!.resources.clay, 0)
    reward(r, 0, 0)
  })
  it("opponent actual Fireplace upgrade grants no holder reward", () => {
    const s = setup({ opponentFireplace: 'Major_Fireplace2', hearth: 'Major_CookingHearth2' })
    turn(s, 0, 'forest')
    const r = hearth(s, 1, 'Major_CookingHearth2')
    assert.ok(r.state.players[1]!.improvements.includes('Major_CookingHearth2'))
    assert.ok(r.state.availableMajorImprovements.includes('Major_Fireplace2'))
    reward(r, 3, 0)
    reward(r, 0, 0, 1)
  })
  it("actual Oriental return keeps the narrow accepted no-reward difference", () => {
    const s = setup({ fireplace: ORIENTAL })
    const r = hearth(s)
    assert.ok(r.state.players[0]!.improvements.includes('Major_CookingHearth1'))
    assert.equal(r.state.players[0]!.minorPlayed.includes(ORIENTAL), false)
    assert.ok(r.state.events.some(e => e.type === 'resource.paid' && e.returnedCardId === ORIENTAL))
    reward(r, 0, 0)
  })
  it("real earlier upgrade is not retroactive and undo later return restores reward", () => {
    const past = setup({ played: false, fireplace: 'Major_Fireplace1', resources: { wood: 1 } })
    reward(hearth(past), 1, 0)
    turn(past, 1, 'forest')
    reward(buy(past, A041), 0, 0)
    const s = setup({ fireplace: 'Major_Fireplace1' })
    const beforeInteraction = JSON.stringify(s.getState().interaction)
    assert.equal(s.getState().interaction.stateId, 'idle')
    const before = undoRuleSnapshot(s.getState())
    reward(hearth(s), 2, 1)
    const beforeRestored = s.undoAction()
    assertUndoRestored(before, beforeRestored)
    assert.equal(JSON.stringify(beforeRestored.interaction), beforeInteraction)
    assert.equal(beforeRestored.state.currentPlayerIndex, 0)
    const r = hearth(s)
    assert.equal(r.state.players[0]!.improvements.includes('Major_Fireplace1'), false)
    reward(r, 2, 1)
  })
})
