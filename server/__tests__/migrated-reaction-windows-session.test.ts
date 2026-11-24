import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, InteractionState } from '../../shared/contract/types'
import type { CardImpl } from '../../shared/cards/registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { scheduleNextHarvestSkip } from '../../shared/cards/helpers/harvest-skip'
import { createWorkSession } from './_helpers/session-fixtures'
import { orderReactionsManually } from './_helpers/trigger-select'
import { testCardImpl } from './_helpers/test-card-impl'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'

// #2039 PR2: the work-end, field-phase, before-Harvest and before-end-game windows
// use the frozen-order reaction window of the start of the Harvest.
const APPLE_TREE = 'CWM058_AppleTree'
const WOOD_HARVESTER = 'A104_WoodHarvester'
const BEER_TABLE = 'C029_BeerTable'
const HOME_BREWER = 'C110_HomeBrewer'
const LUNCHTIME_BEER = 'E058_LunchtimeBeer'
const DRUDGERY_REEVE = 'A136_DrudgeryReeve'
const PERMACULTURIST = 'CWM040_Permaculturist'
const LOVE_FOR_AGRICULTURE = 'B072_LoveforAgriculture'
const NO_TILL_FARMING = 'M111_NoTillFarming'
// End-of-work sources whose conditions always hold; the printed ones need a Family Growth or two seed spaces.
const WORK_END_FOOD = 'TEST_WorkEndFood'
const WORK_END_CLAY = 'TEST_WorkEndClay'
const WORK_END_REED = 'TEST_WorkEndReed'
const workEndCards: Record<string, CardImpl> = {
  [WORK_END_FOOD]: testCardImpl(WORK_END_FOOD, '{ effect: { id: CARD_ID, onAllWorkersPlaced: () => gainLeaf(CARD_ID, { food: 1 }) } }'),
  [WORK_END_CLAY]: testCardImpl(WORK_END_CLAY, "{ effect: { id: CARD_ID, onAllWorkersPlaced: () => ({ ...gainLeaf(CARD_ID, { clay: 1 }), optional: true }) } }"),
  [WORK_END_REED]: testCardImpl(WORK_END_REED, "{ effect: { id: CARD_ID, onAllWorkersPlaced: () => ({ ...gainLeaf(CARD_ID, { reed: 1 }), optional: true }) } }"),
}

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const roundEnd = (round: number, configure: (state: GameState) => void, options: Parameters<typeof createWorkSession>[0] = {}) => {
  const session = createWorkSession({ seed: 2039, ...options, configure: state => {
    state.round = round
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      player.fields = []
      Object.assign(player.resources, { food: 10, grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0 })
    }
    for (const space of state.actionSpaces) if ((space.gainPerRound.wood ?? 0) > 0) space.resources.wood = 0
    configure(state)
  } })
  sessions.push(session)
  return session
}
const startPlayer = (state: GameState, seat: number) => state.players.forEach((player, index) => { player.startPlayer = index === seat })

type Wait = Extract<InteractionState, { stateId: 'wait' }>
const waiting = (response: SessionResponse): Wait => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error(`expected a waiting interaction, got ${response.interaction.stateId}`)
  return response.interaction
}
const values = (response: SessionResponse) => waiting(response).request.options?.map(option => option.value) ?? []
const isSelector = (response: SessionResponse) => waiting(response).request.kind === 'select-trigger'
const passDisabled = (response: SessionResponse) =>
  waiting(response).request.options?.find(option => option.value === '__pass__')?.disabled === true
const choose = (session: GameSession, response: SessionResponse, value: string) => {
  const interaction = waiting(response)
  expect(values(response), JSON.stringify(interaction)).toContain(value)
  const next = session.resolveChoice(interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
/** Settles feeding, animals, confirmations and the post-reap anytime window until `stop` holds. */
const advanceUntil = (session: GameSession, response: SessionResponse, stop: (response: SessionResponse) => boolean) => {
  for (let step = 0; step < 40; step += 1) {
    if (stop(response)) return response
    const interaction = waiting(response)
    if (interaction.request.kind === 'feed') response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
    else if (interaction.request.kind === 'animal-reorg') response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones: interaction.request.zones })
    else if (interaction.request.kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') response = session.resolveChoice(interaction.playerIndex, '__skip__')
    else throw new Error(`unexpected interaction: ${JSON.stringify(interaction)}`)
    expect(response.ok, response.error).toBe(true)
  }
  throw new Error('did not reach the expected step')
}
const inWindow = (hook: string) => (response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.spaceId === `__stage:${hook}`
const afterFieldPhase = (response: SessionResponse) =>
  response.state.roundPhase !== 'field' && response.state.roundPhase !== 'harvest-start'
const paid = (response: SessionResponse, card: string) => response.state.events
  .filter(event => event.type === 'resource.paid' && event.sourceCardId === card)
  .map(event => event.type === 'resource.paid' ? event.resources : null)
const gained = (response: SessionResponse, card: string, round: number) => response.state.events
  .filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.round === round)
  .map(event => event.type === 'resource.moved' ? { player: event.actorPlayerId, resources: event.resources } : null)

describe('end of the work phase', () => {
  it.each([0, 1])('asks the start player first (start player = P%i)', first => {
    const session = roundEnd(5, state => {
      startPlayer(state, first)
      orderReactionsManually(state)
      for (const player of state.players) player.minorPlayed = [WORK_END_FOOD, WORK_END_CLAY]
    }, { cardImpls: workEndCards })
    let response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: first, spaceId: '__stage:onAllWorkersPlaced', request: { kind: 'select-trigger' } })
    expect(values(response)).toEqual([WORK_END_FOOD, WORK_END_CLAY, '__pass__'])
    response = choose(session, response, WORK_END_CLAY)
    // The food source is the last mandatory one and runs without asking; then the window hands over.
    expect(response.state.players[first]!.resources).toMatchObject({ food: 11, clay: 1 })
    expect(waiting(response).request).toEqual({ kind: 'confirm-player-switch', fromPlayerIndex: first, toPlayerIndex: 1 - first })
    response = confirmPlayerSwitch(session)
    expect(waiting(response)).toMatchObject({ playerIndex: 1 - first, request: { kind: 'select-trigger' } })
    expect(response.state.players[1 - first]!.resources).toMatchObject({ food: 10, clay: 0 })
  })

  it('undoStep restores the same selector after the first choice', () => {
    const session = roundEnd(5, state => {
      orderReactionsManually(state)
      state.players[0]!.minorPlayed = [WORK_END_FOOD, WORK_END_CLAY, WORK_END_REED]
    }, { cardImpls: workEndCards })
    let response = session.performRoundEnd()
    const selector = structuredClone(response.interaction)
    response = choose(session, response, WORK_END_CLAY)
    expect(values(response)).toEqual([WORK_END_FOOD, WORK_END_REED, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(selector)
    expect(undone.state.players[0]!.resources.clay).toBe(0)
  })

  it('lets optional sources be passed together', () => {
    const session = roundEnd(5, state => {
      state.players[0]!.minorPlayed = [WORK_END_CLAY, WORK_END_REED]
    }, { cardImpls: workEndCards })
    let response = session.performRoundEnd()
    expect(values(response)).toEqual([WORK_END_CLAY, WORK_END_REED, '__pass__'])
    expect(passDisabled(response)).toBe(false)
    const before = structuredClone(response.state.players[0]!)
    response = choose(session, response, '__pass__')
    expect(response.state.players[0]!.resources).toEqual(before.resources)
    expect(gained(response, WORK_END_CLAY, 5)).toEqual([])
    expect(gained(response, WORK_END_REED, 5)).toEqual([])
  })

  it('runs a sole source as its own flow, without a [card, Pass] selector', () => {
    const session = roundEnd(5, state => {
      const owner = state.players[0]!
      owner.minorPlayed = ['E020_IronHoe']
      for (const id of ['grain-seeds', 'vegetable-seeds']) {
        const space = state.actionSpaces.find(entry => entry.id === id)
        if (!space) throw new Error(`missing ${id}`)
        space.takenBy = [{ playerId: owner.id, workerId: owner.workers[0]!.id }]
      }
    })
    const response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: 0, sourceCard: 'E020_IronHoe' })
    expect(isSelector(response)).toBe(false)
    expect(values(response)).not.toContain('__pass__')
  })
})

describe('field phase', () => {
  const orchard = (configure?: (state: GameState) => void) => roundEnd(4, state => {
    state.players[0]!.minorPlayed = [APPLE_TREE]
    state.players[0]!.occupationPlayed = [WOOD_HARVESTER]
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure?.(state)
  })

  it('auto-resolve on (default): two independent gains settle without a selector', () => {
    const session = orchard()
    const response = advanceUntil(session, session.performRoundEnd(), afterFieldPhase)
    expect(gained(response, APPLE_TREE, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
    expect(gained(response, WOOD_HARVESTER, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
  })

  it.each([
    [APPLE_TREE, WOOD_HARVESTER],
    [WOOD_HARVESTER, APPLE_TREE],
  ])('auto-resolve off: %s first, the other runs as the last mandatory source', (first, second) => {
    const session = orchard(orderReactionsManually)
    let response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: 0, spaceId: '__stage:onHarvestFieldPhase' })
    expect(values(response)).toEqual([APPLE_TREE, WOOD_HARVESTER, '__pass__'])
    expect(passDisabled(response)).toBe(true)
    response = choose(session, response, first)
    const order = response.state.events
      .filter(event => event.type === 'resource.moved' && event.round === 4 && [APPLE_TREE, WOOD_HARVESTER].includes(event.sourceCardId ?? ''))
      .map(event => event.sourceCardId)
    expect(order).toEqual([first, second])
    expect(gained(response, APPLE_TREE, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
    expect(gained(response, WOOD_HARVESTER, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
  })

  it('asks the start player first', () => {
    const session = roundEnd(4, state => {
      startPlayer(state, 1)
      orderReactionsManually(state)
      for (const player of state.players) {
        player.minorPlayed = [APPLE_TREE]
        player.occupationPlayed = [WOOD_HARVESTER]
      }
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    const response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: 1, spaceId: '__stage:onHarvestFieldPhase', request: { kind: 'select-trigger' } })
  })

  it('leaves out a player who skips the field and breeding phases; the opponent still gains', () => {
    const session = roundEnd(4, state => {
      const [owner, other] = state.players
      owner!.minorPlayed = [LUNCHTIME_BEER, APPLE_TREE]
      owner!.occupationPlayed = [WOOD_HARVESTER]
      other!.minorPlayed = [APPLE_TREE]
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    let response = session.performRoundEnd()
    // Lunchtime Beer is the owner's only start-of-Harvest source: its own optional plan is the prompt.
    expect(waiting(response)).toMatchObject({ playerIndex: 0, sourceCard: LUNCHTIME_BEER })
    const accept = waiting(response).request.options!.find(option => option.value !== '__skip__')!
    response = choose(session, response, accept.value)
    response = advanceUntil(session, response, afterFieldPhase)
    expect(gained(response, LUNCHTIME_BEER, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
    expect(gained(response, APPLE_TREE, 4)).toEqual([{ player: 'p2', resources: { food: 1 } }])
    expect(gained(response, WOOD_HARVESTER, 4)).toEqual([])
  })

  it('leaves out a player who skips the whole Harvest', () => {
    const session = orchard(state => {
      scheduleNextHarvestSkip(state.players[0]!, 'C108_Layabout')
      state.players[1]!.minorPlayed = [APPLE_TREE]
    })
    const response = advanceUntil(session, session.performRoundEnd(), afterFieldPhase)
    expect(gained(response, APPLE_TREE, 4)).toEqual([{ player: 'p2', resources: { food: 1 } }])
    expect(gained(response, WOOD_HARVESTER, 4)).toEqual([])
  })

  it('does not offer a source whose condition fails', () => {
    // With 1 wood in the forest, Wood Harvester has nothing to give; Apple Tree alone runs.
    const session = orchard(state => {
      orderReactionsManually(state)
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
    })
    const response = advanceUntil(session, session.performRoundEnd(), afterFieldPhase)
    expect(gained(response, APPLE_TREE, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
    expect(gained(response, WOOD_HARVESTER, 4)).toEqual([])
  })

  describe('end of the field phase: two grain spenders with 1 grain', () => {
    const brewery = (configure?: (state: GameState) => void) => roundEnd(4, state => {
      state.players[0]!.minorPlayed = [BEER_TABLE]
      state.players[0]!.occupationPlayed = [HOME_BREWER]
      state.players[0]!.resources.grain = 1
      configure?.(state)
    })

    it.each([false, true])('the owner orders them in either setting; Beer Table first (manual=%s)', manual => {
      const session = brewery(state => { if (manual) orderReactionsManually(state) })
      let response = session.performRoundEnd()
      expect(waiting(response)).toMatchObject({ playerIndex: 0, spaceId: '__stage:onEndHarvestFieldPhase' })
      expect(values(response)).toEqual([BEER_TABLE, HOME_BREWER, '__pass__'])
      expect(passDisabled(response)).toBe(false)
      response = choose(session, response, BEER_TABLE)
      // The grain is gone, so Home Brewer is no longer offered and the window ends.
      expect(inWindow('onEndHarvestFieldPhase')(response)).toBe(false)
      expect(paid(response, BEER_TABLE)).toEqual([{ grain: 1 }])
      expect(gained(response, BEER_TABLE, 4)).toEqual([{ player: 'p1', resources: { food: 1 } }])
      expect(paid(response, HOME_BREWER)).toEqual([])
    })

    it('Home Brewer first turns the grain into food, and Beer Table is not offered', () => {
      const session = brewery()
      let response = session.performRoundEnd()
      response = choose(session, response, HOME_BREWER)
      expect(waiting(response)).toMatchObject({ sourceCard: HOME_BREWER })
      const food = waiting(response).request.options!.find(option => option.value !== '__skip__')!
      response = choose(session, response, food.value)
      expect(inWindow('onEndHarvestFieldPhase')(response)).toBe(false)
      expect(paid(response, HOME_BREWER)).toEqual([{ grain: 1 }])
      expect(paid(response, BEER_TABLE)).toEqual([])
      expect(gained(response, BEER_TABLE, 4)).toEqual([])
    })

    it('one Pass declines both', () => {
      const session = brewery()
      let response = session.performRoundEnd()
      response = choose(session, response, '__pass__')
      expect(inWindow('onEndHarvestFieldPhase')(response)).toBe(false)
      expect(paid(response, BEER_TABLE)).toEqual([])
      expect(paid(response, HOME_BREWER)).toEqual([])
    })
  })
})

describe('field-phase harvests through standard leaves', () => {
  it('Love for Agriculture harvests each sown pasture with a gain and keeps the rest on the card', () => {
    const session = roundEnd(4, state => {
      const owner = state.players[0]!
      owner.minorPlayed = [LOVE_FOR_AGRICULTURE]
      owner.cardStates[LOVE_FOR_AGRICULTURE] = { extraData: { pastureCrops: [
        { pastureId: 'a', tiles: [{ row: 0, col: 3 }], crop: 'grain', remaining: 3 },
        { pastureId: 'b', tiles: [{ row: 0, col: 4 }], crop: 'vegetable', remaining: 1 },
      ] } }
    })
    const response = advanceUntil(session, session.performRoundEnd(), afterFieldPhase)
    expect(gained(response, LOVE_FOR_AGRICULTURE, 4)).toEqual([{ player: 'p1', resources: { grain: 1, vegetable: 1 } }])
    expect(response.state.players[0]!.cardStates[LOVE_FOR_AGRICULTURE]?.extraData?.pastureCrops).toEqual([
      { pastureId: 'a', tiles: [{ row: 0, col: 3 }], crop: 'grain', remaining: 2 },
    ])
  })

  it('No-Till Farming harvests its planted spaces with a gain and clears an emptied space', () => {
    const session = roundEnd(4, state => {
      const owner = state.players[0]!
      owner.minorPlayed = [NO_TILL_FARMING]
      owner.farmyardSpaceStates = [
        { spaceKey: '0-3', sourceCardId: NO_TILL_FARMING, kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 2 } },
        { spaceKey: '0-4', sourceCardId: NO_TILL_FARMING, kind: 'non-field-crop-space', crop: { kind: 'vegetable', remaining: 1 } },
      ]
    }, { options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
    const response = advanceUntil(session, session.performRoundEnd(), afterFieldPhase)
    expect(gained(response, NO_TILL_FARMING, 4)).toEqual([{ player: 'p1', resources: { grain: 1, vegetable: 1 } }])
    expect(response.state.players[0]!.farmyardSpaceStates).toEqual([
      { spaceKey: '0-3', sourceCardId: NO_TILL_FARMING, kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 1 } },
    ])
  })

  it('Permaculturist harvests its grain spaces in the field phase and clears them before scoring', () => {
    const session = roundEnd(14, state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [PERMACULTURIST]
      owner.farmyardSpaceStates = [
        { spaceKey: '0-3', sourceCardId: PERMACULTURIST, kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 3 } },
      ]
    })
    let response = advanceUntil(session, session.performRoundEnd(), afterFieldPhase)
    expect(gained(response, PERMACULTURIST, 14)).toEqual([{ player: 'p1', resources: { grain: 1 } }])
    expect(response.state.players[0]!.farmyardSpaceStates).toEqual([
      { spaceKey: '0-3', sourceCardId: PERMACULTURIST, kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 2 } },
    ])
    response = advanceUntil(session, response, current => current.state.gameOver)
    expect(response.state.players[0]!.farmyardSpaceStates ?? []).toEqual([])
  })
})

describe('before the Harvest', () => {
  it('runs a sole source as its own flow', () => {
    const session = roundEnd(4, state => { state.players[0]!.occupationPlayed = ['A166_Haydryer'] })
    const response = session.performRoundEnd()
    expect(waiting(response)).toMatchObject({ playerIndex: 0, sourceCard: 'A166_Haydryer', spaceId: '__stage:onBeforeHarvest' })
    expect(isSelector(response)).toBe(false)
  })
})

describe('before the end of the game', () => {
  const endGame = (first: number) => roundEnd(14, state => {
    startPlayer(state, first)
    state.players[0]!.occupationPlayed = [DRUDGERY_REEVE]
    for (const player of state.players) Object.assign(player.resources, { wood: 1, clay: 1, reed: 1, stone: 1 })
  })

  it.each([0, 1])('offers an all-players card to every seat, start player first (start player = P%i)', first => {
    const session = endGame(first)
    let response = advanceUntil(session, session.performRoundEnd(), inWindow('onBeforeEndGame'))
    // The owner's card is the sole source of each seat, so its own scoring choice opens.
    expect(waiting(response)).toMatchObject({ playerIndex: first, sourceCard: DRUDGERY_REEVE })
    expect(isSelector(response)).toBe(false)
    const keep = (current: SessionResponse) => waiting(current).request.options!.find(option => option.value.endsWith(':sets:1'))!
    response = choose(session, response, keep(response).value)
    response = advanceUntil(session, response, inWindow('onBeforeEndGame'))
    expect(waiting(response)).toMatchObject({ playerIndex: 1 - first, sourceCard: DRUDGERY_REEVE })
    response = choose(session, response, keep(response).value)
    response = advanceUntil(session, response, current => current.state.gameOver || current.interaction.stateId !== 'wait'
      || current.interaction.spaceId !== '__stage:onBeforeEndGame')
    const bonus = (seat: number) => response.scores?.find(score => score.playerId === response.state.players[seat]!.id)
    expect(bonus(0)).toBeDefined()
    expect(bonus(1)).toBeDefined()
  })
})
