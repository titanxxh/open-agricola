import { afterEach, describe, expect, it } from 'vitest'
import type { Resource } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext } from './_helpers/session-assertions'

type Price = Partial<Resource>
type Scenario = {
  minor?: string[]
  occupations?: string[]
  material?: 'wood' | 'clay' | 'stone'
  round?: number
  count?: number
  prices: Price[]
}
const sessions: GameSession[] = []
const positions = [{ row: 1, col: 1 }, { row: 2, col: 1 }]
const options = (response: SessionResponse) => response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice'
  ? response.interaction.request.options : []
const normalized = (price: Price) => Object.fromEntries(Object.entries(price).filter(([, amount]) => amount !== 0).sort(([left], [right]) => left.localeCompare(right)))
const priceKeys = (prices: Price[]) => prices.map(price => JSON.stringify(normalized(price))).sort()

function prepare(scenario: Scenario, resources: Price = { wood: 99, clay: 99, stone: 99, reed: 99, food: 99 }) {
  const material = scenario.material ?? 'wood'
  const session = createWorkSession({
    seed: 1636,
    options: {
      playerCount: 2,
      enableFarmersOfTheMoor: scenario.minor?.includes('M036_PeatMoss') ?? false,
    },
    configure(state) {
      state.round = scenario.round ?? 8
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        player.cardStates = {}
        player.farmTerrain = []
      }
      const payer = state.players[0]!
      Object.assign(payer.resources, { wood: 0, clay: 0, stone: 0, reed: 0, food: 0, ...resources })
      payer.minorPlayed = scenario.minor ?? []
      payer.occupationPlayed = scenario.occupations ?? []
      payer.houseType = material
    },
  })
  sessions.push(session)
  expect(session.state.players).toHaveLength(2)
  return session
}

function open(session: GameSession) {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  const branch = options(response).find(option => option.labelKey === 'actions.construct.name')
  if (branch) response = session.resolveChoice(0, branch.value)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'room' } } })
  return response
}

function finish(session: GameSession, response: SessionResponse) {
  const done = options(response).find(option => option.value === '__done__' || option.value === '__skip__')
  if (done) response = session.resolveChoice(0, done.value)
  return response
}

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('complete room prices', () => {
  const cases: Array<Scenario & { name: string }> = [
    { name: 'Parlor and Carpenter choose one price', minor: ['B013_CarpentersParlor'], occupations: ['B126_Carpenter'], prices: [{ wood: 2, reed: 2 }] },
    { name: 'both rooms use the full Parlor price', minor: ['B013_CarpentersParlor'], occupations: ['B126_Carpenter'], count: 2, prices: [{ wood: 4, reed: 4 }] },
    { name: 'Carpenter and Plasterer do not combine clay discounts', occupations: ['B126_Carpenter', 'D121_ClayPlasterer'], material: 'clay', prices: [{ clay: 3, reed: 2 }] },
    { name: 'Parlor and Extender retain incomparable prices', minor: ['B013_CarpentersParlor'], occupations: ['C128_WoodenHutExtender'], prices: [{ wood: 2, reed: 2 }, { wood: 3, reed: 1 }] },
    { name: 'Parlor and Peat Moss retain incomparable prices', minor: ['B013_CarpentersParlor', 'M036_PeatMoss'], prices: [{ wood: 2, reed: 2 }, { wood: 3, reed: 1 }] },
    { name: 'Peat Moss and Extender use one complete price', minor: ['M036_PeatMoss'], occupations: ['C128_WoodenHutExtender'], prices: [{ wood: 3, reed: 1 }] },
    { name: 'Carpenter and Supports retain the clay in each alternative', minor: ['D015_ClaySupports'], occupations: ['B126_Carpenter'], material: 'clay', prices: [{ clay: 3, reed: 2 }, { clay: 2, wood: 1, reed: 1 }] },
    { name: 'Plasterer and Supports retain the clay in each alternative', minor: ['D015_ClaySupports'], occupations: ['D121_ClayPlasterer'], material: 'clay', prices: [{ clay: 3, reed: 2 }, { clay: 2, wood: 1, reed: 1 }] },
    { name: 'genuine wood discounts still apply to Parlor', minor: ['B013_CarpentersParlor'], occupations: ['C088_CarpentersApprentice'], prices: [{ reed: 2 }] },
    { name: 'Stonecutter discounts the selected Carpenter price', occupations: ['B126_Carpenter', 'A143_Stonecutter'], material: 'stone', prices: [{ stone: 2, reed: 2 }] },
    { name: 'Bricklayer discounts every clay room', occupations: ['C122_Bricklayer'], material: 'clay', count: 2, prices: [{ clay: 6, reed: 4 }] },
    { name: 'Bricklayer discounts each Carpenter room', occupations: ['B126_Carpenter', 'C122_Bricklayer'], material: 'clay', count: 2, prices: [{ clay: 2, reed: 4 }] },
  ]

  it.each(cases)('$name', scenario => {
    const session = prepare(scenario)
    const count = scenario.count ?? 1
    const ownerIndex = 0
    const before = session.getState()
    const beforeResources = { ...before.state.players[0]!.resources }
    const beforeScore = before.scores[ownerIndex]!.total
    const beforeLogs = before.state.log.length
    open(session)
    let response = session.commitSelectionChoice(0, { rooms: positions.slice(0, count) })
    expect(response.ok, response.error).toBe(true)
    const paymentOptions = options(response).filter(option => option.effectPreview?.kind === 'payment')
    const quoted = paymentOptions.map(option => {
      if (option.effectPreview?.kind !== 'payment') throw new Error('Expected payment preview')
      return option.effectPreview.resourcesPaid
    })
    if (paymentOptions.length > 0) response = session.resolveChoice(0, paymentOptions[0]!.value)
    expect(response.ok, response.error).toBe(true)
    const paid = Object.fromEntries(Object.entries(beforeResources).map(([key, value]) => [key, value - response.state.players[0]!.resources[key as keyof Resource]]))
    expect(priceKeys(quoted.length > 0 ? quoted : [paid])).toEqual(priceKeys(scenario.prices))
    expect(response.state.players[ownerIndex]!.rooms).toBe(2 + count)
    expect(response.state.players[ownerIndex]!.roomTiles).toEqual(expect.arrayContaining(positions.slice(0, count)))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', actorPlayerId: 'p1', resources: normalized(paid) }))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'farm.roomBuilt', actorPlayerId: 'p1', targetPlayerId: 'p1' }))
    expect(response.state.log.length).toBeGreaterThan(beforeLogs)
    const housePoints = scenario.material === 'stone' ? 2 : scenario.material === 'clay' ? 1 : 0
    expect(response.scores[ownerIndex]!.total).toBe(beforeScore + count * (1 + housePoints))
    response = finish(session, response)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
    expect(confirmNext(session, response).state.currentPlayerIndex).toBe(1)
  })

  it('does not admit a room with only the reeds when both fixed prices are present', () => {
    const session = prepare(cases[0]!, { reed: 2 })
    const response = session.takeAction(0, 'farm-expansion')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!).toMatchObject({ rooms: 2, resources: { wood: 0, reed: 2 } })
    expect(response.state.events.some(event => event.type === 'farm.roomBuilt')).toBe(false)
  })

  it('rejects an unaffordable two-room selection and permits a one-room retry', () => {
    const session = prepare(cases[0]!, { wood: 3, reed: 4 })
    open(session)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { rooms: positions }))
    const response = session.commitSelectionChoice(0, { rooms: positions.slice(0, 1) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 1, reed: 2 } })
  })

  it.each([
    { round: 5, prices: [{ wood: 5, reed: 1 }] },
    { round: 6, prices: [{ wood: 4, reed: 1 }] },
    { round: 7, prices: [{ wood: 4, reed: 1 }] },
    { round: 8, prices: [{ wood: 3, reed: 1 }] },
  ])('keeps Extender prices at round $round', scenario => {
    const session = prepare({ ...scenario, occupations: ['C128_WoodenHutExtender'] }, scenario.prices[0])
    open(session)
    const response = session.commitSelectionChoice(0, { rooms: positions.slice(0, 1) })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
  })
})
