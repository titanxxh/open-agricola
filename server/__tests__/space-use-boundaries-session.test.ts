import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { installSpaceProbes, probeReward, SPACE_PROBES, spaceProbeCounts } from './_helpers/space-use-probes'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { ActionRegistry } from '../../shared/engine/registry'
import type { ActionFlow, GameState } from '../../shared/contract/types'
import { getRoundPersonPlacementOrder, recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { gainAction } from '../../shared/actions/effects/gain'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make(configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 42, configure: state => {
    state.round = 13
    for (const player of state.players) {
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
      player.resources.food = 10
      setWorkersAtHome(state, player, 2)
    }
    state.players[0]!.minorPlayed = [...SPACE_PROBES]
    for (const space of state.actionSpaces) space.takenBy = []
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function choose(session: GameSession, response: SessionResponse, value: string): SessionResponse {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected choice')
  if (response.interaction.request.kind !== 'confirm-player-switch') {
    expect(getChoiceOptions(response).find(option => option.value === value && !option.disabled), JSON.stringify(response.interaction)).toBeDefined()
  }
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function label(session: GameSession, response: SessionResponse, key: string): SessionResponse {
  const option = getChoiceOptions(response).find(candidate => candidate.labelKey === key)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function accept(session: GameSession, response: SessionResponse): SessionResponse {
  const option = getChoiceOptions(response).find(candidate => !['__skip__', '__pass__', '__done__'].includes(candidate.value) && !candidate.disabled)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}
function grant(session: GameSession, flow: ActionFlow): void {
  const card = 'TEST_GrantedFlow'
  session.state.players[0]!.minorPlayed.push(card)
  session.withCtx(() => requireActiveCardRegistry('space-use-grant').registerListener({
    id: 'test-granted-flow', cardIds: [card], actions: ['anytime'], phases: ['anytime'],
    handler: () => ({ sourceCard: card, flow }),
  }))
}
function triggerCount(response: SessionResponse, card: string): number {
  return response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === card).length
}

describe('action-space use boundaries through GameSession', () => {
  it.each([
    { selector: ['forest'], target: 'forest', wood: 4, food: 10, counts: [1, 1, 1] },
    { selector: 'all' as const, target: 'day-laborer', wood: 1, food: 12, counts: [1, 1, 1] },
    { selector: ['forest'], target: 'day-laborer', wood: 0, food: 12, counts: [0, 0, 0] },
  ])('runs each phase once for $selector on $target', example => {
    const session = make()
    installSpaceProbes(session, { selector: example.selector })
    const baseline = session.getState().scores
    let response = session.takeAction(0, example.target)
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual(example.counts)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: example.wood, food: example.food,
      clay: example.counts[1], stone: example.counts[2] })
    expect(response.scores).toEqual(baseline)
    expect(response.state.actionSpaces.find(space => space.id === example.target)!.takenBy).toHaveLength(1)
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual([example.target])
    for (const [index, card] of SPACE_PROBES.entries()) {
      expect(triggerCount(response, card)).toBe(example.counts[index])
      expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === card)).toHaveLength(example.counts[index]!)
    }
    if (example.target === 'forest') {
      const gains = response.state.events.filter(event => event.type === 'resource.moved')
      expect(gains.map(event => event.sourceCardId)).toEqual([SPACE_PROBES[0], undefined, SPACE_PROBES[1], SPACE_PROBES[2]])
      expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(0)
    }
    response = confirmNext(session, response)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.currentPlayerIndex).toBe(1)
    expect(spaceProbeCounts(response)).toEqual(example.counts)
  })

  it.each(['place-farmer', 'place-farmer-on-space'] as const)('completes an extra person use via %s', actionId => {
    const session = make()
    installSpaceProbes(session)
    grant(session, { type: 'leaf', actionId, params: { spaceId: 'forest' }, actionContext: { constraints: ['forest'] } })
    let response = session.takeAnytimeAction(0, 'test-granted-flow')
    if (getChoiceOptions(response).some(option => option.value === 'forest')) {
      expect(spaceProbeCounts(response)).toEqual([0, 0, 0])
      assertRejectedUnchanged(session, () => session.resolveChoice(0, 'clay-pit'))
      response = choose(session, response, 'forest')
    }
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 1, stone: 1, food: 10 })
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual(['forest'])
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(1)
  })

  it('places without using the target when executeTarget is false', () => {
    const session = make()
    installSpaceProbes(session)
    grant(session, { type: 'leaf', actionId: 'place-farmer-on-space', params: { spaceId: 'forest', executeTarget: false } })
    const response = session.takeAnytimeAction(0, 'test-granted-flow')
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([0, 0, 0])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, stone: 0, food: 10 })
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual(['forest'])
  })

  it('honors a rule-action veto after redirecting a whole space', () => {
    const session = make()
    const card = 'TEST_SpaceRedirect'
    session.state.players[0]!.minorPlayed.push(card)
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('redirect-test')
      registry.registerListener({ id: 'test-space-redirect', cardIds: [card], actionSpaces: ['day-laborer'], phases: ['computeReplace'],
        handler: () => ({ actionId: 'gain', sourceCard: card }) })
      registry.registerListener({ id: 'test-redirect-veto', cardIds: [card], actions: ['gain'], phases: ['isDoable'],
        handler: () => ({ doable: false }) })
    })
    expect(session.getActionAvailability(0)['day-laborer']).toBe(false)
    assertRejectedUnchanged(session, () => session.takeAction(0, 'day-laborer'))
    expect(session.state.actionSpaces.find(space => space.id === 'day-laborer')!.takenBy).toEqual([])
  })

  it('runs redirected rule hooks and the enclosing space reaction exactly once', () => {
    const session = make()
    installSpaceProbes(session, { selector: ['day-laborer'] })
    const card = 'TEST_SpaceRedirect'
    session.state.players[0]!.minorPlayed.push(card)
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('redirect-test')
      registry.registerListener({ id: 'test-space-redirect', cardIds: [card], actionSpaces: ['day-laborer'], phases: ['computeReplace'],
        handler: () => ({ actionId: 'gain', sourceCard: card }) })
      for (const phase of ['before', 'after'] as const) registry.registerListener({
        id: `test-redirect-${phase}`, cardIds: [card], actions: ['gain'], phases: [phase], mandatory: true,
        handler: context => context.sourceCard === card ? { sourceCard: card, flow: {
          type: 'leaf', actionId: 'special-effect', sourceCard: card, params: { kind: 'increment-counter', key: phase, amount: 1 },
        } } : undefined,
      })
    })
    let response = session.takeAction(0, 'day-laborer')
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger'; step++) {
      const option = getChoiceOptions(response).find(option => [card, SPACE_PROBES[2]].includes(option.sourceCard ?? '') && !option.disabled)
      expect(option, JSON.stringify(response.interaction)).toBeDefined()
      response = choose(session, response, option!.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.cardStates[card]?.counters).toMatchObject({ before: 1, after: 1 })
    expect(response.state.players[0]!.resources).toMatchObject({ food: 12, wood: 1, clay: 1, stone: 1 })
  })

  it('runs an atomic space body and its collected before reaction exactly once', () => {
    const session = make()
    installSpaceProbes(session)
    const registry: unknown = Reflect.get(session, 'registry')
    if (!(registry instanceof ActionRegistry)) throw new Error('Expected Session action registry')
    const action = { ...registry.getRequired('forest'), flow: undefined,
      canBeExecutedByPlayer: () => true,
      execute: (context: Parameters<typeof gainAction.execute>[0]) => gainAction.execute({ ...context, params: { wood: 3 } }) }
    registry.register(action)
    Object.assign(session.state.actionSpaces.find(space => space.id === 'forest')!, action)
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 1, stone: 1, food: 10 })
  })

  it('uses space query identity when filtering granted XOR options', () => {
    const query = 'TEST_SpaceVeto'
    const session = make(state => state.players[0]!.minorPlayed.push(query))
    session.withCtx(() => requireActiveCardRegistry('space-query-xor').registerListener({
      id: query, cardIds: [query], actionSpaces: ['forest'], phases: ['isDoable'],
      handler: () => ({ doable: false }),
    }))
    grant(session, { type: 'xor', requiresExplicitChoice: true, children: ['forest', 'day-laborer'].map(spaceId => ({
      type: 'leaf', actionId: spaceId, expandFlow: true, spaceUse: { newPlacement: false }, actionContext: { targetSpaceId: spaceId },
    })) })
    let response = session.takeAnytimeAction(0, 'test-granted-flow')
    expect(getChoiceOptions(response).map(option => option.labelKey)).toEqual(['actions.day-laborer.name'])
    response = accept(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 12 })
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
  })

  it('can decline a native optional use before executing its body or completion phases', () => {
    const session = make()
    installSpaceProbes(session)
    grant(session, { type: 'leaf', actionId: 'forest', expandFlow: true, optional: true,
      spaceUse: { newPlacement: false }, actionContext: { targetSpaceId: 'forest' } })
    const pending = session.takeAnytimeAction(0, 'test-granted-flow')
    expect(spaceProbeCounts(pending)).toEqual([0, 0, 0])
    expect(pending.state.players[0]!.resources.wood).toBe(0)
    const response = choose(session, pending, '__skip__')
    expect(spaceProbeCounts(response)).toEqual([0, 0, 0])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, stone: 0, food: 10 })
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
  })

  it('preserves the space query marker on the original replacement branch', () => {
    const query = 'TEST_OriginalSpaceQuery'
    const session = make(state => {
      state.players[0]!.minorPlayed.push(query, 'B026_AgrarianFences')
      Object.assign(state.players[0]!.resources, { wood: 4, grain: 1 })
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    })
    session.withCtx(() => requireActiveCardRegistry('space-original-query').registerListener({
      id: query, cardIds: [query], actionSpaces: ['grain-utilization'], phases: ['isDoable'],
      handler: context => context.actionContext?.checkedReplaceAction ? { doable: false } : undefined,
    }))
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(getChoiceOptions(response).map(option => option.sourceCard)).toEqual(['B026_AgrarianFences'])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, grain: 1 })
  })

  it('keeps a targeted use with its actor through body and completion dispatch', () => {
    const card = 'TEST_TargetedSpaceAfter'
    const session = make(state => { state.players[0]!.minorPlayed = [card] })
    session.withCtx(() => requireActiveCardRegistry('targeted-space-after').registerListener({
      id: card, cardIds: [card], actionSpaces: ['forest'], phases: ['after'], scope: 'opponent',
      handler: context => ({ sourceCard: card, flow: { ...probeReward(card, { stone: 1 }), targetPlayerId: context.ownerPlayer!.id } }),
    }))
    grant(session, { type: 'leaf', actionId: 'forest', expandFlow: true, targetPlayerId: session.state.players[1]!.id,
      spaceUse: { newPlacement: false }, actionContext: { targetSpaceId: 'forest' } })
    let response = session.takeAnytimeAction(0, 'test-granted-flow')
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch'; step++) {
      response = choose(session, response, 'confirm')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 3, stone: 0 })
    expect(response.state.players[0]!.cardStates[card]?.counters?.count).toBe(1)
  })

  it('does not borrow a previous person placement ordinal for workerless use', () => {
    const session = make(state => {
      const player = state.players[0]!
      player.minorPlayed = []
      player.occupationPlayed = ['C091_PlowHero']
      const workerId = player.workers[0]!.id
      state.actionSpaces.find(space => space.id === 'forest')!.takenBy = [{ playerId: player.id, workerId }]
      recordRoundPlacement(player, 'forest', workerId)
    })
    grant(session, { type: 'leaf', actionId: 'farmland', expandFlow: true, spaceUse: { newPlacement: false },
      actionContext: { targetSpaceId: 'farmland' } })
    const pending = session.takeAnytimeAction(0, 'test-granted-flow')
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    const response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(10)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'C091_PlowHero')).toEqual([])
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe('C091_PlowHero')
  })

  it('keeps the immediate pending before after, including JSON restore, rejected input and undo', () => {
    let session = make()
    installSpaceProbes(session, { optionalImmediate: true })
    const baseline = session.getState().scores
    let response = session.takeAction(0, 'forest')
    expect(spaceProbeCounts(response)).toEqual([1, 0, 0])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 0, stone: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: SPACE_PROBES[1] })
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(session)
    installSpaceProbes(session, { optionalImmediate: true })
    assertRejectedUnchanged(session, () => session.resolveChoice(1, '__skip__'))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'invalid'))
    response = accept(session, session.getState())
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 1, stone: 1 })
    expect(response.scores).toEqual(baseline)
    response = session.undoStep(0)
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([1, 0, 0])
    response = accept(session, response)
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    response = session.undoAction(0)
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([0, 0, 0])
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toEqual([])
    response = accept(session, session.takeAction(0, 'forest'))
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
  })

  it('counts a multi-action body once while retaining two ordinary gain reactions', () => {
    const ruleCard = 'TEST_RuleGainAfter'
    const session = make(state => state.players[0]!.minorPlayed.push(ruleCard))
    installSpaceProbes(session, { selector: 'all' })
    const registry: unknown = Reflect.get(session, 'registry')
    if (!(registry instanceof ActionRegistry)) throw new Error('Expected Session action registry')
    const flow: ActionFlow = { type: 'seq', children: [
      { type: 'leaf', actionId: 'gain', params: { food: 1 } },
      { type: 'leaf', actionId: 'gain', params: { food: 1 } },
    ] }
    const action = { ...registry.getRequired('forest'), flow, canBeExecutedByPlayer: () => true }
    registry.register(action)
    Object.assign(session.state.actionSpaces.find(space => space.id === 'forest')!, action)
    session.withCtx(() => requireActiveCardRegistry('space-use-rule-probe').registerListener({
      id: 'test-rule-gain', cardIds: [ruleCard], actions: ['gain'], phases: ['after'],
      handler: context => context.sourceCard ? undefined : { sourceCard: ruleCard, flow: {
        type: 'leaf', actionId: 'special-effect', sourceCard: ruleCard,
        params: { kind: 'increment-counter', key: 'count', amount: 1 },
      } },
    }))
    let response = session.takeAction(0, 'forest')
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger'; step++) {
      response = accept(session, response)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, stone: 1, food: 12 })
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.cardStates?.[ruleCard]?.counters?.count).toBe(2)
    // Trigger logs are coalesced per transaction; the two counter effects prove both executions.
    expect(triggerCount(response, ruleCard)).toBe(1)
    const internal = make()
    installSpaceProbes(internal, { selector: 'all' })
    grant(internal, { type: 'leaf', actionId: 'gain', params: { food: 2 }, actionContext: { targetSpaceId: 'forest' } })
    const ruleOnly = internal.takeAnytimeAction(0, 'test-granted-flow')
    expect(ruleOnly.ok, ruleOnly.error).toBe(true)
    expect(spaceProbeCounts(ruleOnly)).toEqual([0, 0, 0])
    expect(ruleOnly.state.players[0]!.resources.food).toBe(12)
  })

  it('waits for the whole replacement body and does not mutate during availability queries', () => {
    const session = make(state => {
      const player = state.players[0]!
      player.minorPlayed.push('B026_AgrarianFences')
      Object.assign(player.resources, { wood: 4, grain: 1 })
      player.fields = [{ row: 0, col: 2, stacks: [] }]
    })
    installSpaceProbes(session, { selector: ['grain-utilization'] })
    const baseline = JSON.stringify(serializeSessionSnapshot(session.state, session))
    for (let index = 0; index < 2; index++) {
      session.getActionAvailability(0)
      session.getState()
    }
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session))).toBe(baseline)
    let response = session.takeAction(0, 'grain-utilization')
    const replacement = getChoiceOptions(response).find(option => option.sourceCard === 'B026_AgrarianFences')!
    expect(getChoiceOptions(response).some(option => option.labelKey === 'ui.interactionDoNotReplace')).toBe(true)
    response = choose(session, response, replacement.value)
    response = label(session, response, 'ui.interactionAgrarianFencesSowAndFence')
    response = label(session, response, 'actions.sow.name')
    expect(spaceProbeCounts(response)).toEqual([1, 0, 0])
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(spaceProbeCounts(response)).toEqual([1, 0, 0])
    label(session, response, 'actions.fencing.name')
    response = session.commitSelectionChoice(0, { edges: ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'], palisadeEdges: [], extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, stone: 1, grain: 0, food: 10 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual(['grain-utilization'])
  })

  it('runs completion phases for an existing worker moved by Straw Hat', () => {
    let workerId = ''
    const session = make(state => {
      state.round = 3
      const player = state.players[0]!
      player.minorPlayed.push('E010_StrawHat')
      player.fields = [{ row: 0, col: 2, stacks: [] }]
      workerId = player.workers[0]!.id
      state.actionSpaces.find(space => space.id === 'farmland')!.takenBy = [{ playerId: player.id, workerId }]
      recordRoundPlacement(player, 'farmland', workerId)
      state.players.forEach(other => markAllWorkersUsed(state, other))
    })
    installSpaceProbes(session)
    let response = session.performRoundEnd()
    response = label(session, response, 'actions.move-farmer-to-space.name')
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionMoveFarmerToSpace' })
    response = choose(session, response, 'forest')
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 1, stone: 1, food: 10 })
    const moved = response.state.events.filter(event => event.type === 'worker.placed' && event.viaCardId === 'E010_StrawHat')
    expect(moved).toEqual([expect.objectContaining({ workerId, spaceId: 'forest' })])
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })

  it('counts both actual spaces when Lasso places a second person', () => {
    const session = make(state => {
      const player = state.players[0]!
      player.minorPlayed.push('B024_Lasso')
      player.pastures = [{ id: 'test-sheep', tiles: [{ row: 0, col: 3 }], animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
    })
    installSpaceProbes(session, { selector: 'all' })
    let response = session.takeAction(0, 'forest')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = choose(session, response, SPACE_PROBES[2])
      response = choose(session, response, 'B024_Lasso')
    }
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    response = accept(session, response)
    if (getChoiceOptions(response).some(option => option.value === 'sheep-market')) {
      response = choose(session, response, 'sheep-market')
    }
    for (let step = 0; step < 10 && response.interaction.stateId === 'wait'; step++) {
      if (response.interaction.request.kind === 'animal-reorg') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones: [
          { id: 'test-sheep', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
        ] })
      } else if (response.interaction.request.kind === 'select-trigger') response = accept(session, response)
      else break
    }
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual([2, 2, 2])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 5, clay: 2, stone: 2, sheep: 1, food: 10 })
    expect(getRoundPersonPlacementOrder(response.state.players[0]!)).toEqual(['forest', 'sheep-market'])
    const workers = response.state.actionSpaces.filter(space => ['forest', 'sheep-market'].includes(space.id)).flatMap(space => space.takenBy)
    expect(new Set(workers.map(worker => worker.workerId)).size).toBe(2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it.each([true, false])('runs workerless Farmland phases only after accepting Steam Plow: %s', acceptPlow => {
    const session = make(state => {
      state.players.forEach(player => { player.resources.food = 20 })
      state.players[0]!.minorPlayed.push('D018_SteamPlow')
      state.players[0]!.resources.wood = 2
      state.actionSpaces.find(space => space.id === 'clay-pit')!.resources.clay = 1
      state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 1
    })
    installSpaceProbes(session, { selector: ['farmland'] })
    let response = session.getState()
    for (const space of ['grain-seeds', 'forest', 'clay-pit', 'reed-bank']) {
      if (response.interaction.stateId === 'wait') response = confirmNext(session, response)
      response = session.takeAction(response.state.currentPlayerIndex, space)
      expect(response.ok, response.error).toBe(true)
      expect(spaceProbeCounts(response)).toEqual([0, 0, 0])
    }
    response = confirmNext(session, response)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'D018_SteamPlow' })
    response = acceptPlow ? accept(session, response) : choose(session, response, '__skip__')
    if (acceptPlow) {
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
      expect(spaceProbeCounts(response)).toEqual([1, 0, 0])
      response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    }
    expect(response.ok, response.error).toBe(true)
    expect(spaceProbeCounts(response)).toEqual(acceptPlow ? [1, 1, 1] : [0, 0, 0])
    expect(response.state.players[0]!.fields).toHaveLength(acceptPlow ? 1 : 0)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: acceptPlow ? 1 : 2, clay: acceptPlow ? 2 : 1,
      stone: acceptPlow ? 1 : 0, food: acceptPlow ? 15 : 16, grain: 1 })
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(4)
    expect(response.state.events.filter(event => event.type === 'worker.placed' && event.spaceId === 'farmland')).toEqual([])
  })

  it.each([SPACE_PROBES[2], 'TEST_SpaceAfterSecond'])('lets the player order after sources, starting with %s', first => {
    const second = 'TEST_SpaceAfterSecond'
    const session = make(state => state.players[0]!.minorPlayed.push(second))
    installSpaceProbes(session)
    session.withCtx(() => requireActiveCardRegistry('space-use-second-after').registerListener({
      id: second, cardIds: [second], actionSpaces: ['forest'], phases: ['after'], mandatory: true,
      handler: () => ({ sourceCard: second, flow: probeReward(second, { reed: 1 }) }),
    }))
    let response = session.takeAction(0, 'forest')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    response = choose(session, response, first)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: first === SPACE_PROBES[2] ? 1 : 0,
      reed: first === second ? 1 : 0 })
    response = choose(session, response, first === second ? SPACE_PROBES[2] : second)
    expect(spaceProbeCounts(response)).toEqual([1, 1, 1])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, clay: 1, stone: 1, reed: 1 })
    expect(triggerCount(response, second)).toBe(1)
  })

  it.each(['player', 'opponent', 'any'] as const)('keeps the owner distinct from the actor for scope=%s', scope => {
    const before = 'TEST_OpponentSpaceBefore'
    const after = 'TEST_OpponentSpaceAfter'
    const session = make(state => {
      state.players[0]!.minorPlayed = []
      state.players[1]!.minorPlayed = [before, after]
      state.players[1]!.resources.food = 20
    })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('space-use-owner')
      registry.registerListener({ id: before, cardIds: [before], actionSpaces: ['forest'], phases: ['before'], scope, mandatory: true,
        handler: context => ({ sourceCard: before, flow: { type: 'xor', targetPlayerId: context.ownerPlayer!.id,
          children: [probeReward(before, { food: 1 }), probeReward(before, { clay: 1 })] } }),
      })
      registry.registerListener({ id: after, cardIds: [after], actionSpaces: ['forest'], phases: ['after'], scope, mandatory: true,
        handler: context => ({ sourceCard: after, flow: { ...probeReward(after, { stone: 1 }), targetPlayerId: context.ownerPlayer!.id } }),
      })
    })
    const baseline = session.getState().scores
    let response = session.takeAction(0, 'forest')
    if (scope !== 'player') {
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
        response = choose(session, response, 'confirm')
      }
      expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, sourceCard: before })
      assertRejectedUnchanged(session, () => session.resolveChoice(0, getChoiceOptions(response)[0]!.value))
      response = accept(session, response)
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
        response = choose(session, response, 'confirm')
      }
    }
    const count = scope === 'player' ? 0 : 1
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 10, stone: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 0, food: 20 + count, stone: count })
    for (const card of [before, after]) {
      expect(response.state.players[1]!.cardStates?.[card]?.counters?.count ?? 0).toBe(count)
      expect(response.state.players[0]!.cardStates?.[card]).toBeUndefined()
      expect(triggerCount(response, card)).toBe(count)
    }
    expect(response.scores).toEqual(baseline)
  })
})
