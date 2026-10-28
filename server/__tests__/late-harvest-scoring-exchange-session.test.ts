import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { emptyResources } from '../../shared/contract/state-constants'
import type { FeedExchangeCatalogEntry, GameState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'

const FURNITURE = 'B101_FurnitureCarpenter'
const CHURCH = 'Major_Moor_VillageChurch'
type Scenario = 'furniture' | 'church'
const sessions: GameSession[] = []

const createSession = (scenario: Scenario, configure?: (state: GameState) => void) => {
  const session = createWorkSession({
    seed: scenario === 'furniture' ? 429023 : 429024,
    options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
    configure: state => {
      state.round = 4
      state.currentPlayerIndex = 0
      for (const player of state.players) {
        player.resources = { ...emptyResources, food: 4, fuel: 2 }
        player.rooms = 2
        player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.fields = []
        player.farmTerrain = []
        player.pastures = []
        player.stableTiles = []
        player.cardStates = {}
      }
      const player = state.players[0]!
      if (scenario === 'furniture') {
        player.occupationPlayed = [FURNITURE]
        player.improvements = ['Major_Fireplace1']
        player.resources.food = 0
        player.fields = [0, 1, 2].map(col => ({ row: 0, col, stacks: [{ kind: 'vegetable', remaining: 2 }] }))
        state.players[1]!.improvements = ['Major_Joinery']
      } else {
        player.improvements = [CHURCH]
        player.resources.fuel = 0
        player.resources.wood = 3
      }
      setWorkersAtHome(state, player, 1)
      markAllWorkersUsed(state, state.players[1]!)
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const cardIdOf = (scenario: Scenario) => scenario === 'furniture' ? FURNITURE : CHURCH
const bonus = (response: SessionResponse, cardId: string) => response.scores?.[0]?.categories
  .find(category => category.key === 'cardBonusVp')?.entries
  .find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const advance = (session: GameSession, response: SessionResponse, stop: (response: SessionResponse) => boolean = () => false,
  acceptEarly?: string) => {
  for (let step = 0; step < 50; step++) {
    expect(response.ok, response.error).toBe(true)
    if (stop(response) || response.interaction.stateId !== 'wait') return response
    const { request, playerIndex } = response.interaction
    if (request.kind === 'confirm-next-player') response = session.resolveChoice(request.nextPlayerIndex, 'confirm')
    else if (request.kind === 'confirm-player-switch') response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
    else if (request.kind === 'feed') response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'heating') response = session.resolveChoice(playerIndex, 'confirm', { fuelUsed: request.required, selections: [] })
    else if (request.kind === 'choice' && request.options.some(option => option.value === '__skip__')) {
      const accept = acceptEarly ? request.options.find(option => option.value !== '__skip__'
        && (option.sourceCard === acceptEarly || response.interaction.stateId === 'wait' && response.interaction.sourceCard === acceptEarly)) : undefined
      response = session.resolveChoice(playerIndex, accept?.value ?? '__skip__')
    } else if (request.kind === 'select-trigger' && acceptEarly) {
      const accept = request.options.find(option => option.sourceCard === acceptEarly)
        ?? request.options.find(option => option.value === '__pass__')
      if (!accept) throw new Error(`Unexpected Harvest trigger: ${JSON.stringify(request)}`)
      response = session.resolveChoice(playerIndex, accept.value)
    } else throw new Error(`Unexpected Harvest interaction: ${JSON.stringify(response.interaction)}`)
  }
  throw new Error('Harvest did not settle')
}

const reachFeed = (session: GameSession) => {
  const response = advance(session, session.takeAction(0, 'grain-seeds'), current => current.interaction.stateId === 'wait'
    && current.interaction.playerIndex === 0 && current.interaction.request.kind === 'feed')
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
  return response
}

const recipe = (response: SessionResponse, sourceId: string, from: FeedExchangeCatalogEntry['from']) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'feed') throw new Error('Expected feeding')
  const entry = response.interaction.request.exchangeCatalog?.find(candidate => candidate.sourceId === sourceId
    && JSON.stringify(candidate.from) === JSON.stringify(from))
  expect(entry, `Missing ${sourceId} ${JSON.stringify(from)}`).toBeDefined()
  return entry!
}

const selectionsFor = (scenario: Scenario, pending: SessionResponse, buyPoint = true) => {
  const convert = recipe(pending, scenario === 'furniture' ? 'Major_Fireplace1' : '__basic__',
    scenario === 'furniture' ? { vegetable: 1 } : { wood: 1 })
  const selections = [{ sourceId: convert.sourceId, exchangeIndex: convert.exchangeIndex,
    count: scenario === 'church' && !buyPoint ? 2 : 3 }]
  if (buyPoint) {
    const point = recipe(pending, cardIdOf(scenario), scenario === 'furniture' ? { food: 2 } : { fuel: 1 })
    selections.push({ sourceId: point.sourceId, exchangeIndex: point.exchangeIndex, count: 1 })
  }
  return selections
}

const snapshot = (session: GameSession) => session.withCtx(() => serializeSessionSnapshot(session.state, session))
const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot(session)))))
  sessions.push(restored)
  const original = session.getState(), recovered = restored.getState()
  expect(recovered.interaction).toEqual(original.interaction)
  expect(recovered.scores).toEqual(original.scores)
  expect(JSON.parse(JSON.stringify(recovered.state.players))).toEqual(JSON.parse(JSON.stringify(original.state.players)))
  expect(recovered.state.events).toEqual(original.state.events)
  return restored
}

const reject = (session: GameSession, action: () => SessionResponse) => {
  const before = snapshot(session)
  const response = assertRejectedUnchanged(session, action)
  expect(snapshot(session)).toEqual(before)
  return response
}

afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

describe('Harvest scoring exchanges after resources arrive', () => {
  it('cooks the newly reaped vegetables, then pays Furniture Carpenter before feeding', () => {
    const session = createSession('furniture')
    const pending = reachFeed(session)
    expect(pending.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 3, grain: 1, fuel: 2 })
    expect(pending.state.players[0]!.fields.map(field => field.stacks[0]?.remaining)).toEqual([1, 1, 1])
    const cook = recipe(pending, 'Major_Fireplace1', { vegetable: 1 })
    const buyPoint = recipe(pending, FURNITURE, { food: 2 })
    const paid = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: cook.sourceId, exchangeIndex: cook.exchangeIndex, count: 3 },
      { sourceId: buyPoint.sourceId, exchangeIndex: buyPoint.exchangeIndex, count: 1 },
    ] })
    const finished = advance(session, paid)
    expect(finished.state).toMatchObject({ round: 5, roundPhase: 'work' })
    expect(finished.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 0, grain: 1, fuel: 0, begging: 0 })
    expect(bonus(finished, FURNITURE)).toBe(1)
    expect(finished.state.players[0]!.cardStates[FURNITURE]?.extraData?.harvestExchangeUsage).toEqual({ round: 4, count: 1 })
  })

  it('converts wood to fuel before buying the Church point and keeps the remaining fuel for heating', () => {
    const session = createSession('church')
    const pending = reachFeed(session)
    expect(pending.interaction).toMatchObject({ request: { kind: 'feed', foodUsed: 4, remaining: 0 } })
    expect(pending.state.players[0]!.resources).toMatchObject({ food: 0, wood: 3, fuel: 0, grain: 1 })
    const convert = recipe(pending, '__basic__', { wood: 1 })
    const buyPoint = recipe(pending, CHURCH, { fuel: 1 })
    const paid = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: convert.sourceId, exchangeIndex: convert.exchangeIndex, count: 3 },
      { sourceId: buyPoint.sourceId, exchangeIndex: buyPoint.exchangeIndex, count: 1 },
    ] })
    const finished = advance(session, paid)
    expect(finished.state).toMatchObject({ round: 5, roundPhase: 'work' })
    expect(finished.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, fuel: 0, grain: 1, begging: 0 })
    expect(finished.state.players[0]!.sickWorkerIds).toEqual([])
    expect(bonus(finished, CHURCH)).toBe(1)
    expect(finished.state.players[0]!.cardStates[CHURCH]?.extraData?.harvestExchangeUsage).toEqual({ round: 4, count: 1 })
  })

  it.each(['furniture', 'church'] as const)('can decline the late %s point and keep the unspent cost', scenario => {
    const session = createSession(scenario)
    const pending = reachFeed(session)
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, pending, false) }))
    expect(bonus(finished, cardIdOf(scenario))).toBe(0)
    expect(finished.state.players[0]!.resources).toMatchObject(scenario === 'furniture'
      ? { food: 2, vegetable: 0, grain: 1, fuel: 0, begging: 0 }
      : { food: 0, wood: 1, grain: 1, fuel: 0, begging: 0 })
    expect(finished.state.players[0]!.cardStates[cardIdOf(scenario)]?.extraData?.harvestExchangeUsage).toBeUndefined()
  })

  it.each(['furniture', 'church'] as const)('rejects invalid %s batches atomically and permits a valid retry', scenario => {
    const session = createSession(scenario)
    const pending = reachFeed(session)
    const selections = selectionsFor(scenario, pending)
    const [convert, point] = selections
    expect(convert).toBeDefined()
    expect(point).toBeDefined()
    for (const invalid of [
      [point!, convert!],
      [convert!, { ...point!, count: 2 }],
      [convert!, point!, point!],
      [convert!, { ...point!, exchangeIndex: 999 }],
    ]) reject(session, () => session.resolveChoice(0, 'confirm', { selections: invalid }))
    reject(session, () => session.resolveChoice(1, 'confirm', { selections }))
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections }))
    expect(bonus(finished, cardIdOf(scenario))).toBe(1)
    const events = finished.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === cardIdOf(scenario))
    expect(events).toEqual([expect.objectContaining({
      type: 'resource.exchanged', paid: scenario === 'furniture' ? { food: 2 } : { fuel: 1 }, gained: {}, times: 1,
    })])
    expect(finished.state.events.filter(event => event.type === 'harvest.feedConverted' && event.source === cardIdOf(scenario)))
      .toEqual([expect.objectContaining({ cost: scenario === 'furniture' ? { food: 2 } : { fuel: 1 }, food: {} })])
    expect(finished.state.log.filter(entry => entry.key === 'log.harvestFeedConvert' && entry.params?.source === cardIdOf(scenario)))
      .toEqual([expect.objectContaining({ params: expect.objectContaining({
        source: cardIdOf(scenario), cost: scenario === 'furniture' ? { food: 2 } : { fuel: 1 }, food: {},
      }) })])
    expect(finished.state.events.filter(event => event.type === 'harvest.heated' && event.playerId === finished.state.players[0]!.id))
      .toEqual([expect.objectContaining({ required: 2, fuelUsed: 2, sickWorkerIds: [] })])
  })

  it.each(['furniture', 'church'] as const)('preserves %s payment and usage through pending recovery and undo', scenario => {
    let session = createSession(scenario)
    let pending = reachFeed(session)
    session = restore(session)
    let response = session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, pending) })
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating' } })
    expect(bonus(response, cardIdOf(scenario))).toBe(1)
    session = restore(session)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    expect(response.state.players[0]!.resources).toMatchObject(scenario === 'furniture'
      ? { food: 0, vegetable: 3, grain: 1, fuel: 2 }
      : { food: 0, wood: 3, grain: 1, fuel: 0 })
    expect(bonus(response, cardIdOf(scenario))).toBe(0)
    expect(response.state.players[0]!.cardStates[cardIdOf(scenario)]?.extraData?.harvestExchangeUsage).toBeUndefined()
    session = restore(session)
    pending = session.getState()
    const beforeRead = snapshot(session)
    session.getState()
    session.getState()
    expect(snapshot(session)).toEqual(beforeRead)
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, pending) }))
    expect(bonus(finished, cardIdOf(scenario))).toBe(1)
    expect(finished.state.players[0]!.cardStates[cardIdOf(scenario)]?.extraData?.harvestExchangeUsage).toEqual({ round: 4, count: 1 })
    expect(finished.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === cardIdOf(scenario))).toHaveLength(1)
  })

  it.each(['furniture', 'church'] as const)('undoes the last placement before the %s Harvest confirmation and preserves the confirmed boundary', scenario => {
    const session = createSession(scenario)
    const placed = session.takeAction(0, 'grain-seeds')
    expect(placed.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state).toMatchObject({ round: 4, roundPhase: 'work' })
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.players[0]!.resources).toMatchObject(scenario === 'furniture'
      ? { food: 0, vegetable: 0, grain: 0, fuel: 2 }
      : { food: 4, wood: 3, grain: 0, fuel: 0 })
    expect(undone.state.players[0]!.fields.map(field => field.stacks[0]?.remaining)).toEqual(scenario === 'furniture' ? [2, 2, 2] : [])
    expect(bonus(undone, cardIdOf(scenario))).toBe(0)
    expect(undone.state.events.some(event => event.type === 'resource.exchanged' && event.exchangeSource === cardIdOf(scenario))).toBe(false)
    const replay = reachFeed(session)
    const paid = session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, replay) })
    expect(paid.ok, paid.error).toBe(true)
    const rejected = reject(session, () => session.undoAction())
    expect(rejected.error).toBe('no action snapshot')
    const finished = advance(session, paid)
    expect(bonus(finished, cardIdOf(scenario))).toBe(1)
  })

  it.each(['none', 'stall', 'hand'] as const)('does not offer Furniture Carpenter with %s eligibility', mode => {
    const session = createSession('furniture', state => {
      state.players[1]!.improvements = mode === 'stall' ? ['Major_Moor_FurnitureStall'] : []
      if (mode === 'hand') {
        state.players[1]!.improvements = ['Major_Joinery']
        state.players[0]!.occupationPlayed = []
        state.players[0]!.occupationHand = [FURNITURE]
      }
    })
    const pending = reachFeed(session)
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'feed') throw new Error('Expected feeding')
    expect(pending.interaction.request.exchangeCatalog?.some(entry => entry.sourceId === FURNITURE)).toBe(false)
    reject(session, () => session.resolveChoice(0, 'confirm', { selections: [{ sourceId: FURNITURE, exchangeIndex: 0, count: 1 }] }))
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections: selectionsFor('furniture', pending, false) }))
    expect(bonus(finished, FURNITURE)).toBe(0)
  })

  it.each(['furniture', 'church'] as const)('excludes the %s Harvest recipe from ordinary work exchanges', scenario => {
    const session = createSession(scenario)
    const trades = session.withCtx(() => getExchangesInWindow(session.state.players[0]!, 'anytime', session.state, session.actionHooks))
    expect(trades.some(trade => trade.sourceId === cardIdOf(scenario))).toBe(false)
    reject(session, () => session.resolveChoice(0, 'confirm', { selections: [{ sourceId: cardIdOf(scenario), exchangeIndex: 0, count: 1 }] }))
    expect(bonus(session.getState(), cardIdOf(scenario))).toBe(0)
  })

  it.each(['furniture', 'church'] as const)('shares the %s early-offer and late-recipe limit', scenario => {
    const cardId = cardIdOf(scenario)
    const session = createSession(scenario, state => {
      if (scenario === 'furniture') state.players[0]!.resources.food = 2
      else {
        state.players[0]!.resources.fuel = 1
        state.players[0]!.resources.vegetable = 1
        state.players[0]!.improvements.push('Major_Fireplace1')
      }
    })
    const pending = advance(session, session.takeAction(0, 'grain-seeds'), response => response.interaction.stateId === 'wait'
      && response.interaction.playerIndex === 0 && response.interaction.request.kind === 'feed', cardId)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'feed' } })
    expect(bonus(pending, cardId)).toBe(1)
    expect(pending.state.players[0]!.cardStates[cardId]?.extraData?.harvestExchangeUsage).toEqual({ round: 4, count: 1 })
    reject(session, () => session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, pending) }))
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, pending, false) }))
    expect(bonus(finished, cardId)).toBe(1)
    expect(finished.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === cardId)).toHaveLength(1)
  })

  it.each(['furniture', 'church'] as const)('does not consume the %s limit when an affordable early offer is declined', scenario => {
    const session = createSession(scenario, state => {
      if (scenario === 'furniture') state.players[0]!.resources.food = 2
      else state.players[0]!.resources.fuel = 1
    })
    const pending = reachFeed(session)
    expect(bonus(pending, cardIdOf(scenario))).toBe(0)
    expect(pending.state.players[0]!.cardStates[cardIdOf(scenario)]?.extraData?.harvestExchangeUsage).toBeUndefined()
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections: selectionsFor(scenario, pending) }))
    expect(bonus(finished, cardIdOf(scenario))).toBe(1)
    expect(finished.state.players[0]!.resources).toMatchObject(scenario === 'furniture'
      ? { food: 2, fuel: 0, begging: 0 } : { food: 0, wood: 0, fuel: 1, begging: 0 })
  })

  it.each([false, true])('does not keep the Village Church recipe after removal, upgraded Church=%s', upgraded => {
    const session = createSession('church', state => {
      state.players[0]!.improvements = ['Major_Fireplace1']
      state.players[0]!.minorPlayed = upgraded ? ['M068_Church'] : []
      state.players[0]!.resources.vegetable = 1
    })
    const pending = reachFeed(session)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'feed') throw new Error('Expected feeding')
    expect(pending.interaction.request.exchangeCatalog?.some(entry => entry.sourceId === CHURCH)).toBe(false)
    reject(session, () => session.resolveChoice(0, 'confirm', { selections: [{ sourceId: CHURCH, exchangeIndex: 0, count: 1 }] }))
    const finished = advance(session, session.resolveChoice(0, 'confirm', { selections: selectionsFor('church', pending, false) }))
    expect(bonus(finished, CHURCH)).toBe(0)
    expect(bonus(finished, 'M068_Church')).toBe(0)
  })

  it.each(['furniture', 'church'] as const)('allows %s again in the next naturally reached Harvest', scenario => {
    const cardId = cardIdOf(scenario)
    const session = createSession(scenario, state => {
      for (const space of state.actionSpaces) space.takenBy = []
      for (const player of state.players) {
        player.fields = []
        player.resources = { ...emptyResources, food: 8, fuel: 4 }
      }
      state.players[0]!.resources = { ...emptyResources,
        food: scenario === 'furniture' ? 20 : 8, fuel: scenario === 'furniture' ? 4 : 6 }
    })
    let response = session.getState()
    for (const round of [4, 5, 6, 7]) {
      expect(response.state.round).toBe(round)
      for (const [index, action] of ['grain-seeds', 'reed-bank', 'forest', 'clay-pit'].entries()) {
        response = session.takeAction(index % 2, action)
        response = advance(session, response, () => false, cardId)
      }
      expect(response.state.round).toBe(round + 1)
      expect(bonus(response, cardId)).toBe(round === 7 ? 2 : 1)
      if (round === 5 || round === 6) {
        expect(session.withCtx(() => getExchangesInWindow(session.state.players[0]!, 'anytime', session.state, session.actionHooks))
          .some(trade => trade.sourceId === cardId)).toBe(false)
      }
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: scenario === 'furniture' ? 8 : 0, fuel: 0, begging: 0 })
    expect(response.state.players[0]!.sickWorkerIds).toEqual([])
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.harvestExchangeUsage).toEqual({ round: 7, count: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === cardId)).toHaveLength(2)
  })
})
