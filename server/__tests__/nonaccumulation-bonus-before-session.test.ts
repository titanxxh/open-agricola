import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

type Example = {
  card: string
  space: string
  reward: Partial<Resource>
  total: Partial<Resource>
  players?: number
  occupation?: boolean
  occupied?: string
}

const examples: Example[] = [
  { card: 'A067_CornScoop', space: 'grain-seeds', reward: { grain: 1 }, total: { grain: 2 } },
  { card: 'A114_SeasonalWorker', occupation: true, space: 'day-laborer', reward: { grain: 1 }, total: { grain: 1, food: 2 } },
  { card: 'A163_BuildingExpert', occupation: true, players: 4, space: 'resource-market-4', reward: { wood: 1 }, total: { wood: 1, reed: 1, stone: 1, food: 1 } },
  { card: 'B056_Brook', space: 'forest', reward: { food: 1 }, total: { food: 1, wood: 1 } },
  { card: 'B062_Pitchfork', space: 'grain-seeds', occupied: 'farmland', reward: { food: 3 }, total: { grain: 1, food: 3 } },
  { card: 'B077_LoamPit', space: 'day-laborer', reward: { clay: 3 }, total: { food: 2, clay: 3 } },
  { card: 'B142_Greengrocer', occupation: true, players: 3, space: 'grain-seeds', reward: { vegetable: 1 }, total: { vegetable: 1, grain: 1 } },
  { card: 'D141_SeedSeller', occupation: true, players: 3, space: 'grain-seeds', reward: { grain: 1 }, total: { grain: 2 } },
  { card: 'D156_RetailDealer', occupation: true, players: 4, space: 'resource-market-4', reward: { grain: 1, food: 1 }, total: { grain: 1, reed: 1, stone: 1, food: 2 } },
]

function setup(example: Example, configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 1323, options: { playerCount: example.players ?? 2 }, configure: state => {
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      player.cardStates = {}
      setWorkersAtHome(state, player, 2)
    }
    for (const space of state.actionSpaces) space.takenBy = []
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 1
    state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 1
    const player = state.players[0]!
    if (example.occupation) player.occupationPlayed = [example.card]
    else player.minorPlayed = [example.card]
    if (example.occupied) {
      const opponent = state.players[1]!
      state.actionSpaces.find(space => space.id === example.occupied)!.takenBy = [{ playerId: opponent.id, workerId: opponent.workers[0]!.id }]
    }
    if (example.card === 'D156_RetailDealer') player.cardStates[example.card] = { extraData: { remaining: 3 } }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function assertBefore(response: SessionResponse, example: Example) {
  expect(response.ok, response.error).toBe(true)
  const gains = response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === example.card)
  expect(gains).toHaveLength(1)
  const gain = gains[0]!
  expect(gain.type === 'resource.moved' && gain.resources).toEqual(example.reward)
  const host = response.state.events.find(event => event.type === 'resource.moved' && !event.sourceCardId)
  expect(host).toBeDefined()
  expect(gain.seq).toBeLessThan(host!.seq)
  expect(response.state.players[0]!.resources).toMatchObject(example.total)
  for (const [resource, scoreKey] of [['grain', 'grains'], ['vegetable', 'vegetables']] as const) {
    expect(response.scores[0]!.categories.find(category => category.key === scoreKey)?.quantity).toBe(example.total[resource] ?? 0)
  }
  if (example.card === 'D156_RetailDealer') expect(response.state.players[0]!.cardStates[example.card]?.extraData?.remaining).toBe(2)
  expect(response.state.events.filter(event => event.type === 'card.triggered' && event.cardId === example.card)).toHaveLength(1)
  expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === example.card)).toHaveLength(1)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
}

describe('nonaccumulation-space bonuses before the host', () => {
  it.each(examples)('$card grants its bonus before $space', example => {
    const session = setup(example)
    assertBefore(session.takeAction(0, example.space), example)
  })

  it('B064 pays its food before the host sow selection', () => {
    const example: Example = { card: 'B064_MillWheel', space: 'grain-utilization', occupied: 'fishing', reward: { food: 2 }, total: { food: 2, grain: 0 } }
    const session = setup(example, state => {
      state.round = 10
      state.players[0]!.resources.grain = 1
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    })
    const pending = session.takeAction(0, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    expect(pending.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1 })
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(example.total)
    const reward = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === example.card)
    const sow = response.state.events.find(event => event.type === 'farm.sown')
    expect(reward!.seq).toBeLessThan(sow!.seq)
  })

  it.each(['clay', 'grain'] as const)('B156 chooses %s before the Resource Market grants goods', resource => {
    const example: Example = { card: 'B156_StorehouseKeeper', occupation: true, players: 4, space: 'resource-market-4', reward: { [resource]: 1 }, total: { [resource]: 1, reed: 1, stone: 1, food: 1 } }
    const session = setup(example)
    const pending = session.takeAction(0, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0, food: 0 })
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected Storehouse Keeper choice')
    const option = pending.interaction.request.options?.find(option =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.[resource] === 1)
    expect(option, JSON.stringify(pending.interaction)).toBeDefined()
    assertBefore(session.resolveChoice(0, option!.value), example)
  })

  it.each([true, false])('C142 offers its exchange before the host grain, accepted=%s', accept => {
    const example: Example = { card: 'C142_MarketCrier', occupation: true, players: 3, space: 'grain-seeds', reward: { grain: 1, vegetable: 1 }, total: { grain: 2, vegetable: 1 } }
    const session = setup(example)
    const pending = session.takeAction(0, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources.grain).toBe(0)
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected Market Crier choice')
    const option = pending.interaction.request.options?.find(option => accept ? option.value !== '__skip__' : option.value === '__skip__')
    expect(option).toBeDefined()
    const response = session.resolveChoice(0, option!.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(accept ? example.total : { grain: 1, vegetable: 0 })
    for (const opponent of response.state.players.slice(1)) expect(opponent.resources.grain).toBe(accept ? 1 : 0)
    const gains = response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === example.card)
    expect(gains).toHaveLength(accept ? 3 : 0)
    const host = response.state.events.find(event => event.type === 'resource.moved' && !event.sourceCardId)
    for (const gain of gains) expect(gain.seq).toBeLessThan(host!.seq)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('A114 chooses a vegetable from round six before the host food', () => {
    const example: Example = { card: 'A114_SeasonalWorker', occupation: true, space: 'day-laborer', reward: { vegetable: 1 }, total: { vegetable: 1, food: 2 } }
    const session = setup(example, state => { state.round = 6 })
    const pending = session.takeAction(0, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources.food).toBe(0)
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected Seasonal Worker choice')
    const option = pending.interaction.request.options?.find(option =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.vegetable === 1)
    expect(option).toBeDefined()
    assertBefore(session.resolveChoice(0, option!.value), example)
  })

  const quietExamples: Example[] = [
    ...examples,
    { card: 'B064_MillWheel', space: 'grain-utilization', reward: {}, total: {} },
    { card: 'B156_StorehouseKeeper', occupation: true, players: 4, space: 'resource-market-4', reward: {}, total: {} },
    { card: 'C142_MarketCrier', occupation: true, players: 3, space: 'grain-seeds', reward: {}, total: {} },
  ]

  it.each(quietExamples)('$card does not reward an unrelated Fishing use', example => {
    const session = setup({ ...example, occupied: undefined })
    const response = session.takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.sourceCardId === example.card)).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0, food: 1, wood: 0, clay: 0 })
    expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === example.card)).toEqual([])
  })

  it('B062 gives no food while Farmland is empty', () => {
    const example: Example = { card: 'B062_Pitchfork', space: 'grain-seeds', reward: {}, total: {} }
    const response = setup(example).takeAction(0, example.space)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.events.filter(event => event.sourceCardId === example.card)).toEqual([])
  })

  it('B064 gives no food while Fishing is empty', () => {
    const example: Example = { card: 'B064_MillWheel', space: 'grain-utilization', reward: {}, total: {} }
    const session = setup(example, state => {
      state.round = 10
      state.players[0]!.resources.grain = 1
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    })
    const pending = session.takeAction(0, example.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources.food).toBe(0)
    expect(pending.state.events.filter(event => event.sourceCardId === example.card)).toEqual([])
  })

  it('D156 gives nothing once all three pairs have been taken', () => {
    const example: Example = { card: 'D156_RetailDealer', occupation: true, players: 4, space: 'resource-market-4', reward: {}, total: {} }
    const response = setup(example, state => { state.players[0]!.cardStates[example.card] = { extraData: { remaining: 0 } } }).takeAction(0, example.space)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 1, reed: 1, stone: 1 })
    expect(response.state.players[0]!.cardStates[example.card]?.extraData?.remaining).toBe(0)
    expect(response.state.events.filter(event => event.sourceCardId === example.card)).toEqual([])
  })
})
