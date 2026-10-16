import { ActionHookRegistry } from '../../shared/actions/hooks'
import { createInitialState } from '../../shared/session/state-bootstrap'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { descriptionEffects } from './_helpers/choice-description'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerDispatchInput } from '../../shared/cards/card-listeners'
import { type DraftGameEvent } from '../../shared/contract/events'
import { type GameState, type PlayerState, type Resource } from '../../shared/contract/types'
import { setFencesForTest, setPalisadesForTest } from '../../shared/cards/__tests__/__fixtures__/fence'
import { resolveTriggerIfPresent , expectWait } from './_helpers/trigger-select'
import '../../shared/cards/A/A034_Loppers'
import '../../shared/cards/E/E074_AshTrees'
import assert from 'node:assert/strict'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A034_Loppers'

const findListener = (ruleOwner: TestCardRegistry, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === id)
  return withActiveRegistry(ruleOwner, lookupRule1)
}

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const passTriggerSelectIfPresent = (
  session: GameSession,
  resp: SessionResponse,
): SessionResponse => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'select-trigger') return resp
  return session.resolveChoice(resp.interaction.playerIndex, '__pass__')
}

const widePastureEdges = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-0-4',
  'H-3-1',
  'H-3-2',
  'H-3-3',
  'H-3-4',
  'V-0-1',
  'V-1-1',
  'V-2-1',
  'V-0-5',
  'V-1-5',
  'V-2-5',
]

const fenceBuilt = (
  newFenceEdges: string[],
): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  fences: newFenceEdges.map((edge) => ({ edge, type: 'fence' })),
  newFenceEdges,
  newlyUsedTiles: [],
  newlyEnclosedPastureTiles: [],
})

const createPlayer = (): PlayerState => {
  const player = createInitialState(42, { playerCount: 2 }).players[0]!
  player.name = 'P1'
  player.minorPlayed = [CARD_ID]
  Object.assign(player.resources, { wood: 5, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
  return player
}

const setupFencingSession = (options: {
  wood: number
  consumedFences?: number
  existingFenceEdges?: string[]
  e74HeldFences?: number
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: options.wood,
    food: 0,
  }
  player.minorPlayed.push(CARD_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  if (options.existingFenceEdges) {
    player.fenceSegments = options.existingFenceEdges.map((edge) => ({
      edge,
      type: 'fence',
      source: { kind: 'own', ownerPlayerId: player.id },
    }))
  }
  if (options.consumedFences !== undefined) {
    player.supplyTokensConsumed = { fence: options.consumedFences }
  }
  if (options.e74HeldFences) {
    player.minorPlayed.push('E074_AshTrees')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: options.e74HeldFences } },
    }
  }

  session.loadState(state)
  return session
}

const createState = (...players: PlayerState[]): GameState => ({
  ...createInitialState(42, { playerCount: 2 }),
  round: 3,
  players,
})

const createListenerContext = (player: PlayerState, actionEvents: DraftGameEvent<'farm.fenceBuilt'>[], result?: CardListenerDispatchInput['result']): CardListenerDispatchInput => {
  const state = createState(player)
  const space = state.actionSpaces.find(candidate => candidate.id === 'fencing')
  assert.ok(space)
  return { actionHooks: new ActionHookRegistry(), state, player, space, actionId: 'fence', phase: 'after', transactionEvents: actionEvents, actionEvents, result }
}

describe('A34 Loppers — supply fence payment', () => {
  it('declares a wood + fence payment even when player has many palisades', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer()
    setPalisadesForTest(player, 15) // well above maxFences
    setFencesForTest(player, 0)
    const listener = findListener(ruleRegistry, 'A34-loppers-after-fencing')!
    const actionEvents = [fenceBuilt(['H-0-0'])]

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, createListenerContext(player, actionEvents)))

    expect(result).toBeDefined()
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('seq')
    expect(result?.flow?.type === 'seq' ? result.flow.children[0] : undefined).toMatchObject({
      type: 'leaf',
      actionId: 'pay',
      params: { wood: 1, fence: 1 },
    })
  })

  it('does not use built fence count as the supply availability gate', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer()
    setFencesForTest(player, 15)
    const listener = findListener(ruleRegistry, 'A34-loppers-after-fencing')!
    const actionEvents = [fenceBuilt(['H-0-0'])]

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, createListenerContext(player, actionEvents)))

    expect(result).toBeDefined()
  })

  it('rejects direct fencing cancel without offering the exchange', () => {
    const session = setupFencingSession({ wood: 5 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, { cancel: true })

    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('action cancel is not allowed')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected fencing prompt')
    expect(resp.interaction.request.kind).toBe('farm-select')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(resp.state.events).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'farm.fenceBuilt',
        }),
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'cardEffect',
        }),
      ]),
    )
  })

  it('does not offer the exchange when the fence event has no ordinary fence edges', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createPlayer()
    const listener = findListener(ruleRegistry, 'A34-loppers-after-fencing')!
    const actionEvents = [fenceBuilt([])]

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, createListenerContext(player, actionEvents, { type: 'ok', extraData: { newFenceEdges: ['H-0-0'] } })))

    expect(result).toBeUndefined()
  })

  it('after fencing, accepting pays wood + reserve fence for food and bonus VP', () => {
    const session = setupFencingSession({ wood: 5 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    expect(expectWait(resp).interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBe(1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(resp.state.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'fencing',
          resources: { wood: 4 },
        }),
        expect.objectContaining({
          type: 'resource.paid',
          paymentFor: 'cardEffect',
          resources: { wood: 1, fence: 1 },
        }),
      ]),
    )
  })

  it('pays fencing before after-fencing effects so exact mandatory wood cannot be spent by A34', () => {
    const session = setupFencingSession({ wood: 4 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    resp = passTriggerSelectIfPresent(session, resp)
    expect(expectWait(resp).interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not offer the exchange when E74 holds all unbuilt fence tokens', () => {
    const existing = [...widePastureEdges.slice(0, 10), 'H-1-2']
    const build = widePastureEdges.slice(10)
    const session = setupFencingSession({
      wood: 1,
      existingFenceEdges: existing,
      e74HeldFences: 4,
    })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const useAll = getChoiceOptions(resp)?.find(
      (option) => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'fenceReserve' && effect.amount === 4),
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: build,
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'select-trigger') {
      const a34 = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
      expect(a34?.disabled ?? true).toBe(true)
      resp = passTriggerSelectIfPresent(session, resp)
    }
    expect(expectWait(resp).interaction.promptKey).toBe('ui.confirmNextPlayer')
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(15)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })

  it('does not spend A34 when consumed fence supply removes the remaining reserve', () => {
    const existing = widePastureEdges.slice(0, 10)
    const build = widePastureEdges.slice(10)
    const session = setupFencingSession({
      wood: 1,
      existingFenceEdges: existing,
      consumedFences: 1,
      e74HeldFences: 4,
    })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const useAll = getChoiceOptions(resp)?.find(
      (option) => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'fenceReserve' && effect.amount === 4),
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: build,
      palisadeEdges: [],
      extraWood: 0,
    })
    resp = resolveTriggerIfPresent(session, resp, 'E074_AshTrees')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'select-trigger') {
      const a34 = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
      expect(a34?.disabled ?? true).toBe(true)
      resp = passTriggerSelectIfPresent(session, resp)
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(14)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.supplyTokensConsumed?.fence).toBe(1)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBeUndefined()
  })
})

describe('A034 Loppers parity', () => {
  const CARD_ID = 'A034_Loppers'

  const FILLER = '__test_placeholder__'

  const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

  const edgesForTile = (row: number, col: number) => [
    `H-${row}-${col}`,
    `H-${row + 1}-${col}`,
    `V-${row}-${col}`,
    `V-${row}-${col + 1}`,
  ]

  const setup = ({ played = true, occupations = 2, wood = 0 } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6034, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    player.minorHand = played ? [FILLER] : [CARD_ID]
    player.minorPlayed = played ? [CARD_ID] : []
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.resources = {
      ...player.resources, wood, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === CARD_ID)) {
      const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
      if (improvement) response = session.resolveChoice(0, improvement.value)
    }
    return response
  }

  const playCard = (session: GameSession) => {
    const response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(0, card!.value)
  }

  const fence = (session: GameSession) => {
    let response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 1), extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  const resolveLoppers = (session: GameSession, response: SessionResponse, accept: boolean) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = getChoiceOptions(response)?.find((candidate) => accept
      ? candidate.value !== '__skip__'
      : candidate.value === '__skip__')
    expect(option).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, option!.value)
  }

  it('A034 S1: two occupations and one wood allow playing Loppers', () => {
    const response = playCard(setup({ played: false, wood: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A034 S2: one occupation keeps Loppers unavailable', () => {
    const response = enterMinor(setup({ played: false, occupations: 1, wood: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A034 S4: after fencing declining preserves the spare wood and supply fence', () => {
    const session = setup({ wood: 5 })
    const response = resolveLoppers(session, fence(session), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.players[0]!.supplyTokensConsumed?.fence).toBeUndefined()
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe("A034 command boundaries", () => {
  const LOPPERS = 'A034_Loppers'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ round = 14, played = false, occupations = 2, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [LOPPERS, '__test_placeholder__']
        p.minorPlayed = played ? [LOPPERS] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    const o = options(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function score(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    assert.ok(r.scores[0])
    return r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === card)?.score ?? 0
  }
  function vp(r: SessionResponse, card: string) {
    return r.state.players[0]!.cardStates[card]?.counters?.bonusVp ?? 0
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
    return ok(s.takeAction(actor, space))
  }
  function nearFenceLimit(state: GameState, placed: 13 | 14) {
    const p = state.players[0]!
    const edges = [...[1, 2, 3, 4].flatMap(col => [`H-0-${col}`, `H-1-${col}`]), 'V-0-1', 'V-0-5', 'H-2-4', 'V-1-4', 'V-1-5']
    if (placed === 14)
      edges.push('V-0-3')
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    const top = placed === 13 ? [[1, 2, 3, 4]] : [[1, 2], [3, 4]]
    p.pastures = [...top.map((cols, i) => ({ id: `top-${i}`, tiles: cols.map(col => ({ row: 0, col })), animalType: null, animalCount: 0 })), { id: 'bottom', tiles: [{ row: 1, col: 4 }], animalType: null, animalCount: 0 }]
    assert.equal(p.fenceSegments.length, placed)
  }
  const oneCell = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
  function fence(s: GameSession, edges = oneCell, actor = 0) {
    const r = turn(s, actor, 'fencing')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    return ok(s.commitSelectionChoice(actor, { edges }))
  }
  function exchange(s: GameSession, initial: SessionResponse, accept: boolean) {
    let response = initial
    const values: string[] = []
    for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
      const interaction = response.interaction
      if (interaction.request.kind === 'select-trigger') {
        const options = interaction.request.options
        const loppers = options.find(option => option.value === LOPPERS)
        if (!loppers) assert.ok(options.filter(option => option.value !== '__pass__').every(option => option.labelKey === 'actions.exchange.name'), JSON.stringify(interaction))
        const selected = loppers ?? options.find(option => option.value === '__pass__')
        assert.ok(selected, JSON.stringify(interaction))
        values.push(selected.value)
        response = ok(s.resolveChoice(interaction.playerIndex, selected.value))
        continue
      }
      if (interaction.request.kind !== 'choice') break
      assert.equal(interaction.sourceCard, LOPPERS)
      const enabled = interaction.request.options.filter(option => accept ? option.value !== '__skip__' && !option.disabled : option.value === '__skip__')
      assert.equal(enabled.length, 1, JSON.stringify(interaction))
      values.push(enabled[0]!.value)
      response = ok(s.resolveChoice(interaction.playerIndex, enabled[0]!.value))
    }
    if (response.interaction.stateId === 'wait') assert.equal(response.interaction.request.kind, 'confirm-next-player')
    return { r: response, values }
  }
  it("actual purchase enforces two occupations and one wood", () => {
    deny(setup({ occupations: 1, resources: { wood: 1 } }), LOPPERS)
    deny(setup({ resources: { wood: 0 } }), LOPPERS)
    const r = buy(setup({ resources: { wood: 1 } }), LOPPERS)
    assert.ok(r.state.players[0]!.minorPlayed.includes(LOPPERS))
    assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  it("exact one reserve fence is paid after real subdivision without removing built fences", () => {
    const s = setup({ played: true, resources: { wood: 2 } }, state => nearFenceLimit(state, 13))
    const pending = fence(s, ['V-0-2'])
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(pending.state.players[0]!)), 1)
    const { r } = exchange(s, pending, true)
    const p = r.state.players[0]!
    assert.equal(p.fenceSegments.length, 14)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), 0)
    assert.equal(p.supplyTokensConsumed?.fence, 1)
    assert.deepEqual([p.resources.wood, p.resources.food, vp(r, LOPPERS), score(r, LOPPERS)], [0, 42, 1, 1])
  })
  it("four fences give one exchange and whole action undo permits one reward retry", () => {
    const s = setup({ played: true, resources: { wood: 5 } })
    const before = undoRuleSnapshot(s.getState())
    const result = exchange(s, fence(s), true)
    const p = result.r.state.players[0]!
    assert.equal(p.fenceSegments.length, 4)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), 10)
    assert.deepEqual([p.resources.wood, p.resources.food, vp(result.r, LOPPERS)], [0, 42, 1])
    const stale = result.values.at(-1)
    assert.ok(stale)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, stale))
    assertUndoRestored(before, s.undoAction())
    const retry = exchange(s, fence(s), true).r
    assert.equal(vp(retry, LOPPERS), 1)
    assert.equal(retry.state.players[0]!.resources.food, 42)
  })
  it("no spare wood or reserve fence prevents exchange while decline preserves both", () => {
    const noWood = setup({ played: true, resources: { wood: 4 } })
    const rw = exchange(noWood, fence(noWood), false).r
    assert.equal(rw.state.players[0]!.resources.wood, 0)
    assert.equal(noWood.withCtx(() => getOwnOrdinaryFenceReserveCount(rw.state.players[0]!)), 11)
    assert.equal(vp(rw, LOPPERS), 0)
    assert.equal(rw.state.players[0]!.resources.food, 40)
    assertRejectedUnchanged(noWood, () => noWood.resolveChoice(0, LOPPERS))
    const noFence = setup({ played: true, resources: { wood: 2 } }, state => nearFenceLimit(state, 14))
    const rf = exchange(noFence, fence(noFence, ['V-0-2']), false).r
    assert.equal(noFence.withCtx(() => getOwnOrdinaryFenceReserveCount(rf.state.players[0]!)), 0)
    assert.equal(rf.state.players[0]!.resources.wood, 1)
    assert.equal(vp(rf, LOPPERS), 0)
    assert.equal(rf.state.players[0]!.resources.food, 40)
    assertRejectedUnchanged(noFence, () => noFence.resolveChoice(0, LOPPERS))
    const decline = setup({ played: true, resources: { wood: 5 } })
    const r = exchange(decline, fence(decline), false).r
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(decline.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 11)
    assert.equal(vp(r, LOPPERS), 0)
    assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it("real opponent fencing and own unrelated action grant no owner exchange", () => {
    const s = setup({ played: true }, state => {
      state.players[1]!.resources.wood = 4
    })
    const own = turn(s, 0, 'forest')
    assert.equal(vp(own, LOPPERS), 0)
    const r = fence(s, oneCell, 1)
    assert.equal(r.state.players[1]!.fenceSegments.length, 4)
    assert.equal(vp(r, LOPPERS), 0)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 15)
  })
})
