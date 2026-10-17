import { expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { type ActionFlow, type ChoiceDescriptionPreview } from '../../shared/contract/types'
import { cloneState } from '../../shared/session/state-bootstrap'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

import { assertRejectedUnchanged, undoRuleSnapshot, assertUndoRestored } from './_helpers/session-assertions'
import { setWorkersAtHome, setActiveWorkerCount, availableWorkers } from '../../shared/domain/player'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

function ready(session: GameSession): SessionResponse {
  let response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction.stateId).toBe('idle')
  return response
}

function take(session: GameSession, actor: number, spaceId: string): SessionResponse {
  expect(ready(session).state.currentPlayerIndex).toBe(actor)
  const response = session.takeAction(actor, spaceId)
  expect(response.ok, response.error).toBe(true)
  return response
}

function choose(session: GameSession, response: SessionResponse, value: string): SessionResponse {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') {
    throw new Error(`Expected choice for ${value}: ${JSON.stringify(interaction)}`)
  }
  const option = interaction.request.options.find(option => option.value === value || option.value.startsWith(value))
  expect(option, JSON.stringify(interaction)).toBeDefined()
  if (!option) throw new Error(`Missing choice ${value}`)
  const result = session.resolveChoice(interaction.playerIndex, option.value)
  expect(result.ok, result.error).toBe(true)
  return result
}

const FOREST_TALLYMAN = 'A162_ForestTallyman'

function forestTallymanSession(ownerWorkers = 2): GameSession {
  const session = sessionEvidence.track(createWorkSession({
    seed: 4242,
    options: { playerCount: 4 },
    configure(state) {
      state.round = 14
      for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 0, clay: 0 })
      state.players[0]!.occupationHand = [FOREST_TALLYMAN, 'A110_Roughcaster']
      if (ownerWorkers === 3) {
        state.players[0]!.roomTiles.push({ row: 0, col: 0 })
        state.players[0]!.rooms = 3
        setActiveWorkerCount(state.players[0]!, 3)
        setWorkersAtHome(state, state.players[0]!, 3)
      }
    },
  }))

  return session
}

it('a real Forest Tallyman purchase makes its private space executable without loading the game', () => {
  const cardId = FOREST_TALLYMAN
  const session = forestTallymanSession()
  const purchase = choose(session, take(session, 0, 'lessons'), cardId)
  expect(purchase.state.players[0]!.occupationPlayed).toContain(cardId)
  expect(purchase.state.actionSpaces.find(space => space.id === cardId)?.takenBy).toEqual([])
  ready(session)
  assertRejectedUnchanged(session, () => session.takeAction(1, cardId))
  take(session, 1, 'forest')
  take(session, 2, 'clay-pit')
  take(session, 3, 'fishing')

  ready(session)
  const beforeResponse = session.getState()
  const beforeInteraction = JSON.stringify(beforeResponse.interaction)
  sessionEvidence.record('before private action', beforeResponse)
  // Recovery preserves these original representations after a public purchase.
  expect(beforeResponse.state.players[0]!.playedCards).toEqual([])
  expect(beforeResponse.state.actionSpaces.find(space => space.id === cardId)?.blockedBy).toBeUndefined()
  const before = undoRuleSnapshot(beforeResponse)
  const assertOutcome = (response: SessionResponse) => {
    for (const result of [response, session.getState()]) {
      expect(result.state.players[0]!.resources).toEqual({ wood: 3, clay: 2, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
      expect(result.state.actionSpaces.find(space => space.id === cardId)!.takenBy).toEqual([
        { playerId: beforeResponse.state.players[0]!.id, workerId: '2' },
      ])
      expect(availableWorkers(result.state, result.state.players[0]!)).toEqual([])
    }
  }
  const used = take(session, 0, cardId)
  assertOutcome(used)
  expect(used.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
  expect(used.state.actionSpaces.find(space => space.id === cardId)?.takenBy).toHaveLength(1)
  expect(used.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === cardId)).toBe(true)
  expect(used.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
  expect(used.state.currentPlayerIndex).toBe(0)
  const undone = session.undoAction()
  sessionEvidence.record('after private action undo', undone)
  expect(undone.state.players[0]!.playedCards).toEqual([])
  expect(undone.state.actionSpaces.find(space => space.id === cardId)?.blockedBy).toBeUndefined()
  assertUndoRestored(before, undone)
  assertUndoRestored(before, session.getState())
  expect(JSON.stringify(undone.interaction)).toBe(beforeInteraction)
  expect(JSON.stringify(session.getState().interaction)).toBe(beforeInteraction)
  expect(undone.interaction.stateId).toBe('idle')
  expect(undone.state.currentPlayerIndex).toBe(0)
  expect(undone.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  expect(undone.state.actionSpaces.find(space => space.id === cardId)?.takenBy).toEqual([])
  const retried = take(session, 0, cardId)
  assertOutcome(retried)
  expect(retried.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
  expect(retried.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
  expect(retried.state.currentPlayerIndex).toBe(0)
})

it.each(['none', 'forest', 'clay'] as const)('a purchased Forest Tallyman remains unavailable with %s occupancy', mode => {
  const session = forestTallymanSession()
  choose(session, take(session, 0, 'lessons'), FOREST_TALLYMAN)
  take(session, 1, mode === 'forest' ? 'forest' : 'grain-seeds')
  take(session, 2, mode === 'clay' ? 'clay-pit' : 'reed-bank')
  take(session, 3, 'fishing')
  ready(session)
  expect(session.getActionAvailability(0)[FOREST_TALLYMAN]).toBe(false)
  assertRejectedUnchanged(session, () => session.takeAction(0, FOREST_TALLYMAN))
  const retried = take(session, 0, 'day-laborer')
  expect(retried.state.players[0]!.resources).toMatchObject({ food: 42, wood: 0, clay: 0 })
  expect(retried.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
  expect(retried.state.currentPlayerIndex).toBe(0)
})

function flowHostSession(flow: ActionFlow): GameSession {
  const session = sessionEvidence.track(createWorkSession({
    configure(state) {
      const template = state.actionSpaces.find(space => space.id === 'day-laborer')
      if (!template) throw new Error('Missing day-laborer fixture template')
      state.actionSpaces.push({
        ...template,
        id: 'card_test_missing_definition_host',
        flow: undefined,
        flowFactory: undefined,
        canBeExecutedByPlayer: () => true,
        execute: () => ({ type: 'flow', flow: {
          type: 'seq', children: [{ type: 'leaf', actionId: 'gain', params: { wood: 3 } }, flow],
        } }),
        resources: { ...template.resources },
        takenBy: [],
      })
    },
  }))

  return session
}

function ruleOutcome(response: SessionResponse) {
  return structuredClone({
    players: response.state.players,
    spaces: response.state.actionSpaces.map(({ id, takenBy, resources, blockedBy }) => ({ id, takenBy, resources, blockedBy })),
    events: response.state.events,
    log: response.state.log,
    interaction: response.interaction,
    scores: response.scores,
  })
}


it('a missing executable definition fails internally and rolls back the worker and earlier effects', () => {
  const session = flowHostSession({ type: 'leaf', actionId: 'card_test_unregistered_leaf' })
  const before = ruleOutcome(session.getState())
  expect(() => session.takeAction(0, 'card_test_missing_definition_host'))
    .toThrow('missing action definition: card_test_unregistered_leaf')
  expect(ruleOutcome(session.getState())).toEqual(before)
  expect(take(session, 0, 'grain-seeds').state.players[0]!.resources.grain).toBe(1)
})

it.each(['optional', 'xor'] as const)('a missing %s branch definition cannot silently skip the action', mode => {
  const missing: ActionFlow = { type: 'leaf', actionId: 'card_test_unregistered_leaf' }
  const flow: ActionFlow = mode === 'optional' ? { ...missing, optional: true } : {
    type: 'xor', children: [missing, { type: 'leaf', actionId: 'gain', params: { clay: 1 } }],
  }
  const session = flowHostSession(flow)
  const before = ruleOutcome(session.getState())
  expect(() => session.takeAction(0, 'card_test_missing_definition_host'))
    .toThrow('missing action definition: card_test_unregistered_leaf')
  expect(ruleOutcome(session.getState())).toEqual(before)
})

const FOREST_INN = 'B042_ForestInn'

function forestInnSession(ownerWood: number, guestWood = 0, guestFood = 1): GameSession {
  const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
    state.round = 6
    const [owner, guest] = state.players
    if (!owner || !guest) throw new Error('Forest Inn requires two players')
    owner.minorHand = [FOREST_INN, 'B004_WoodPile']
    Object.assign(owner.resources, { food: 100, wood: ownerWood, clay: 1, reed: 1 })
    Object.assign(guest.resources, { wood: guestWood, food: guestFood })
  } }))

  return session
}

function buyForestInn(session: GameSession): SessionResponse {
  const action = choose(session, take(session, 0, 'meeting-place'), 'action-improvement-')
  const response = choose(session, action, FOREST_INN)
  expect(response.state.players[0]!.minorPlayed).toContain(FOREST_INN)
  expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  expect(response.state.actionSpaces.find(space => space.id === FOREST_INN)?.takenBy).toEqual([])
  expect(response.scores?.[0]?.categories.find(category => category.key === 'cards')?.entries)
    .toContainEqual(expect.objectContaining({ cardId: FOREST_INN, score: 1 }))
  return response
}

function paysWood(preview: ChoiceDescriptionPreview | undefined, wood: number): boolean {
  if (!preview) return false
  if (preview.kind === 'action') {
    return (preview.effectPreview?.kind === 'payment' || preview.effectPreview?.kind === 'resourceExchange') &&
      preview.effectPreview.resourcesPaid?.wood === wood
  }
  if (preview.kind === 'conditional') return paysWood(preview.body, wood)
  return preview.parts.some(part => paysWood(part, wood))
}

function gainsWood(preview: ChoiceDescriptionPreview | undefined, wood: number): boolean {
  if (!preview) return false
  if (preview.kind === 'action') {
    return preview.effectPreview?.kind === 'resourceExchange' && preview.effectPreview.resourcesGained?.wood === wood
  }
  if (preview.kind === 'conditional') return gainsWood(preview.body, wood)
  return preview.parts.some(part => gainsWood(part, wood))
}

function chooseWoodGain(session: GameSession, response: SessionResponse, wood: number): SessionResponse {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') throw new Error('Expected resource choice')
  const option = interaction.request.options.find(option => gainsWood(option.descriptionPreview, wood))
  if (!option) throw new Error(`Missing ${wood}-wood gain`)
  return choose(session, response, option.value)
}

function exchange(session: GameSession, response: SessionResponse, wood: number): SessionResponse {
  if (wood === 5) return response
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'choice') throw new Error('Expected Forest Inn exchange choice')
  const option = interaction.request.options.find(option => paysWood(option.descriptionPreview, wood))
  if (!option) throw new Error(`Missing ${wood}-wood exchange`)
  return choose(session, response, option.value)
}

it.each([[5, 2], [7, 4], [9, 7]])('a purchased Forest Inn lets its owner exchange %i wood for eight wood and %i food without an entry fee', (wood, food) => {
  const session = forestInnSession(wood)
  buyForestInn(session)
  take(session, 1, 'day-laborer')
  const response = exchange(session, take(session, 0, FOREST_INN), wood)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, food: 100 + food })
  expect(response.state.players[1]!.resources.food).toBe(3)
  expect(response.state.actionSpaces.find(space => space.id === FOREST_INN)?.takenBy).toHaveLength(1)
  expect(response.state.events.some(event => event.type === 'resource.paid' && event.sourceCardId === FOREST_INN && event.resources.wood === wood)).toBe(true)
})

it.each([[5, 2], [7, 4], [9, 7]])('a purchased Forest Inn charges its guest once before the %i wood exchange, including cursor restore and undo', (wood, food) => {
  const session = forestInnSession(5, wood)
  buyForestInn(session)
  const entered = take(session, 1, FOREST_INN)
  expect(entered.state.players[0]!.resources.food).toBe(101)
  expect(entered.state.players[1]!.resources.food).toBe(wood === 5 ? 2 : 0)
  if (wood > 5) {
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'invalid'))
    assertRejectedUnchanged(session, () => session.resolveChoice(1, 'invalid'))
    const restored = sessionEvidence.track(new GameSession({ state: cloneState(session.state), sessionCursor: session.createSessionPrivateCursor() }))

    const restoredResponse = restored.getState()
    expect(restoredResponse.interaction).toEqual(entered.interaction)
    const restoredDone = exchange(restored, restoredResponse, wood)
    expect(restoredDone.state.players[0]!.resources.food).toBe(101)
    expect(restoredDone.state.players[1]!.resources).toMatchObject({ wood: 8, food })
  }
  const done = exchange(session, session.getState(), wood)
  expect(done.state.players[0]!.resources.food).toBe(101)
  expect(done.state.players[1]!.resources).toMatchObject({ wood: 8, food })
  const undone = session.undoAction()
  expect(undone.ok, undone.error).toBe(true)
  expect(undone.state.players[0]!.resources.food).toBe(100)
  expect(undone.state.players[1]!.resources).toMatchObject({ wood, food: 1 })
  expect(undone.state.actionSpaces.find(space => space.id === FOREST_INN)?.takenBy).toEqual([])
  const retried = exchange(session, take(session, 1, FOREST_INN), wood)
  expect(retried.state.players[0]!.resources.food).toBe(101)
  expect(retried.state.players[1]!.resources).toMatchObject({ wood: 8, food })
  ready(session)
  assertRejectedUnchanged(session, () => session.takeAction(0, FOREST_INN))
})

it('undoing a Forest Inn purchase removes access and rebuying enables its action again', () => {
  const session = forestInnSession(5)
  buyForestInn(session)
  const undone = session.undoAction()
  expect(undone.ok, undone.error).toBe(true)
  expect(undone.state.actionSpaces.some(space => space.id === FOREST_INN)).toBe(false)
  expect(undone.state.players[0]!.resources).toMatchObject({ clay: 1, reed: 1 })
  assertRejectedUnchanged(session, () => session.takeAction(0, FOREST_INN))
  buyForestInn(session)
  take(session, 1, 'day-laborer')
  expect(take(session, 0, FOREST_INN).state.players[0]!.resources).toMatchObject({ wood: 8, food: 102 })
})

it.each(['guest-food', 'guest-wood', 'owner-wood'] as const)('Forest Inn rejects %s shortage without consuming resources or a worker', mode => {
  const session = forestInnSession(mode === 'owner-wood' ? 4 : 0, mode === 'guest-wood' ? 4 : 5, mode === 'guest-food' ? 0 : 1)
  buyForestInn(session)
  const actor = mode === 'owner-wood' ? 0 : 1
  if (actor === 0) take(session, 1, 'day-laborer')
  ready(session)
  expect(session.getActionAvailability(actor)[FOREST_INN]).toBe(false)
  assertRejectedUnchanged(session, () => session.takeAction(actor, FOREST_INN))
  expect(take(session, actor, 'grain-seeds').state.players[actor]!.resources.grain).toBe(1)
})

it.each(['optional', 'xor'] as const)('a registered but unaffordable %s branch retains the normal skip semantics', mode => {
  const pay: ActionFlow = { type: 'leaf', actionId: 'pay', params: { wood: 100 } }
  const session = flowHostSession(mode === 'optional' ? { ...pay, optional: true } : {
    type: 'xor', children: [pay, { type: 'leaf', actionId: 'gain', params: { clay: 1 } }],
  })
  const response = take(session, 0, 'card_test_missing_definition_host')
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: mode === 'xor' ? 1 : 0 })
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
})

function preparationSourceSession(flow: ActionFlow): GameSession {
  const cardId = 'CARD_TEST_PreparationDefinition'
  const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
    for (const player of state.players) player.resources.food = 40
    state.players[0]!.minorPlayed = [cardId]
  } }))

  session.withCtx(() => requireActiveCardRegistry('preparation definition regression').loadImpl(cardId, {
    effect: { id: cardId, onRoundStart: () => flow },
  }))
  take(session, 0, 'reed-bank')
  take(session, 1, 'forest')
  take(session, 0, 'clay-pit')
  take(session, 1, 'day-laborer')
  return session
}

it('a missing definition in a preparation activation preview rolls back the advancing confirmation', () => {
  const session = preparationSourceSession({ type: 'leaf', actionId: 'card_test_unregistered_stage_leaf', optional: true })
  const before = ruleOutcome(session.getState())
  expect(() => ready(session))
    .toThrow('missing action definition: card_test_unregistered_stage_leaf')
  expect(ruleOutcome(session.getState())).toEqual(before)
  expect(session.state.round).toBe(1)
  expect(session.getState().interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
})

it('a registered but unpaid preparation activation retains the normal skip semantics', () => {
  const session = preparationSourceSession({ type: 'leaf', actionId: 'pay', params: { wood: 100 }, optional: true })
  const response = ready(session)
  expect(response.state.round).toBe(2)
  expect(response.state.roundPhase).toBe('work')
  expect(response.interaction.stateId).toBe('idle')
  expect(response.state.players[0]!.resources.wood).toBe(0)
  expect(response.state.events.filter(event => event.type === 'resource.paid'
    && event.sourceCardId === 'CARD_TEST_PreparationDefinition')).toEqual([])
})

it('a flow can create a new composite space and immediately offer and execute it', () => {
  const dynamicId = 'card_test_created_composite'
  const hostId = 'card_test_create_composite'
  const session = sessionEvidence.track(createWorkSession({ configure(state) {
    const template = state.actionSpaces.find(space => space.id === 'day-laborer')
    if (!template) throw new Error('Missing day-laborer fixture template')
    state.actionSpaces.push({
      ...template, id: hostId, flow: undefined, flowFactory: undefined,
      canBeExecutedByPlayer: () => true,
      execute: ({ state: liveState }) => {
        liveState.actionSpaces.push({
          ...template, id: dynamicId, flowFactory: undefined,
          flow: { type: 'xor', children: [
            { type: 'leaf', actionId: 'gain', params: { wood: 3 } },
            { type: 'leaf', actionId: 'gain', params: { clay: 2 } },
          ] },
          canBeExecutedByPlayer: () => true,
          resources: { ...template.resources }, takenBy: [],
        })
        return { type: 'flow', flow: { type: 'xor', children: [
          { type: 'leaf', actionId: dynamicId, expandFlow: true },
          { type: 'leaf', actionId: 'gain', params: { food: 1 } },
        ] } }
      },
      resources: { ...template.resources }, takenBy: [],
    })
  } }))

  const offered = take(session, 0, hostId)
  const selected = chooseWoodGain(session, offered, 3)
  const completed = chooseWoodGain(session, selected, 3)
  expect(completed.state.players[0]!.resources.wood).toBe(3)
  expect(completed.state.players[0]!.resources.clay).toBe(0)
  expect(completed.state.actionSpaces.some(space => space.id === dynamicId)).toBe(true)
})

it('a new composite space exposes its action choice on first use', () => {
  const session = sessionEvidence.track(createWorkSession())

  const template = session.state.actionSpaces.find(space => space.id === 'day-laborer')
  if (!template) throw new Error('Missing day-laborer fixture template')
  const dynamicId = 'card_test_new_composite_entry'
  session.state.actionSpaces.push({
    ...template, id: dynamicId, flowFactory: undefined,
    flow: { type: 'xor', children: [
      { type: 'leaf', actionId: 'gain', params: { wood: 3 } },
      { type: 'leaf', actionId: 'gain', params: { clay: 2 } },
    ] },
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { ...template.resources }, takenBy: [],
  })
  const offered = take(session, 0, dynamicId)
  const completed = chooseWoodGain(session, offered, 3)
  expect(completed.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 0 })
  expect(completed.state.actionSpaces.find(space => space.id === dynamicId)?.takenBy).toHaveLength(1)
})


it('Forest Tallyman hand, another player, and an occupied private space reject without using a person', () => {
  const hand = forestTallymanSession()
  take(hand, 0, 'grain-seeds')
  take(hand, 1, 'forest')
  take(hand, 2, 'clay-pit')
  take(hand, 3, 'fishing')
  ready(hand)
  expect(hand.getActionAvailability(0)).not.toHaveProperty(FOREST_TALLYMAN)
  assertRejectedUnchanged(hand, () => hand.takeAction(0, FOREST_TALLYMAN))
  expect(hand.getState().state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })

  const session = forestTallymanSession(3)
  choose(session, take(session, 0, 'lessons'), FOREST_TALLYMAN)
  take(session, 1, 'forest')
  take(session, 2, 'clay-pit')
  take(session, 3, 'fishing')
  ready(session)
  expect(session.getActionAvailability(1)[FOREST_TALLYMAN]).toBe(false)
  assertRejectedUnchanged(session, () => session.takeAction(1, FOREST_TALLYMAN))
  const used = take(session, 0, FOREST_TALLYMAN)
  expect(used.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
  take(session, 1, 'reed-bank')
  take(session, 2, 'grove')
  take(session, 3, 'day-laborer')
  const ownerTurn = ready(session)
  expect(ownerTurn.state.currentPlayerIndex).toBe(0)
  expect(availableWorkers(ownerTurn.state, ownerTurn.state.players[0]!)).toHaveLength(1)
  expect(session.getActionAvailability(0)[FOREST_TALLYMAN]).toBe(false)
  assertRejectedUnchanged(session, () => session.takeAction(0, FOREST_TALLYMAN))
  expect(session.getState().state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
  const retried = take(session, 0, 'vegetable-seeds')
  expect(retried.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2, vegetable: 1 })
  expect(retried.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 0 } })
  expect(retried.state.currentPlayerIndex).toBe(0)
})
