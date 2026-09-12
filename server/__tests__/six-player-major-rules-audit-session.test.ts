import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

const setup = (round = 5) => {
  const session = new GameSession(5608, undefined, { playerCount: 6 })
  const state = session.getState().state
  state.round = round
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...player.resources, wood: 20, clay: 20, reed: 20, stone: 20, food: 20, grain: 0 }
    setWorkersAtHome(state, player, 2)
  }
  session.loadState(state)
  expect(session.getState().state.players).toHaveLength(6)
  return session
}

const nextPurchase = (session: GameSession) => {
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  setWorkersAtHome(state, state.players[0]!, 2)
  session.loadState(state)
  const response = session.takeAction(0, 'major-improvement')
  expect(response.ok).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const purchase = (session: GameSession, cardId: string) => {
  const offered = nextPurchase(session)
  expect(offered.interaction.request.options?.map((option) => option.value)).toContain(cardId)
  let response = session.resolveChoice(0, cardId)
  expect(response.ok).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = response.interaction.request.options.find((option) => option.value !== 'cancel')!
    response = session.resolveChoice(0, payment.value)
    expect(response.ok).toBe(true)
  }
  expect(response.state.players[0]!.improvements).toContain(cardId)
  expect(response.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes(cardId))).toBe(true)
  return response
}

const purchaseCases = [
  ['Major_Fireplace3', 'Major_Fireplace1', { clay: 3 }],
  ['Major_CookingHearth3', 'Major_CookingHearth1', { clay: 5 }],
  ['Major_Well2', 'Major_Well', { wood: 1, stone: 3 }],
  ['Major_ClayOven2', 'Major_ClayOven', { clay: 3, stone: 1 }],
  ['Major_StoneOven2', 'Major_StoneOven', { clay: 1, stone: 3 }],
  ['Major_Joinery2', 'Major_Joinery', { wood: 2, stone: 2 }],
  ['Major_Pottery2', 'Major_Pottery', { clay: 2, stone: 2 }],
  ['Major_Basket2', 'Major_Basket', { reed: 2, stone: 2 }],
] as const

describe('Six-player major printed-rule audit', () => {
  it.each(purchaseCases)('%s currently charges the copied base cost after %s is acquired', (cardId, covering, cost) => {
    const session = setup()
    const covered = nextPurchase(session)
    expect(covered.interaction.request.options?.map((option) => option.value)).not.toContain(cardId)
    const snapshot = structuredClone({ players: covered.state.players })
    const rejected = session.resolveChoice(0, cardId)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players).toEqual(snapshot.players)
    expect(rejected.interaction.stateId).toBe('wait')
    const revealed = session.resolveChoice(0, covering)
    expect(revealed.ok).toBe(true)
    expect(revealed.state.availableMajorImprovements).toContain(cardId)
    const before = structuredClone(revealed.state.players[0]!.resources)
    const bought = purchase(session, cardId)
    for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) {
      expect(before[resource] - bought.state.players[0]!.resources[resource]).toBe(
        (cost as Partial<Record<typeof resource, number>>)[resource] ?? 0,
      )
    }
    expect(bought.state.availableMajorImprovements).not.toContain(cardId)
  })

  it.each([5, 13, 14])('Major_Well2 schedules only remaining rounds when bought in round %i', (round) => {
    const session = setup(round)
    purchase(session, 'Major_Well')
    const response = purchase(session, 'Major_Well2')
    for (const cardId of ['Major_Well', 'Major_Well2']) {
      const entries = response.state.futureMeeples.filter((entry) => entry.cardId === cardId)
      expect(entries).toHaveLength(Math.min(5, 14 - round))
      expect(entries.every((entry) => entry.resources.food === 1)).toBe(true)
    }
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.total).toBe(8)
  })

  it.each([
    ['Major_ClayOven', 'Major_ClayOven2', 1, 5],
    ['Major_StoneOven', 'Major_StoneOven2', 2, 4],
  ])('%s and %s have independent baking limits and reject over-limit retries', (original, duplicate, limit, food) => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.improvements = [original, duplicate]
    state.players[0]!.resources.grain = 8
    state.players[0]!.resources.food = 0
    session.loadState(state)
    const offered = session.takeAction(0, 'grain-utilization')
    expect(offered.ok).toBe(true)
    expect(offered.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
    const rejected = session.resolveChoice(0, `bulk:${original}=${limit + 1}`)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ grain: 8, food: 0 })
    expect(rejected.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
    const baked = session.resolveChoice(0, `bulk:${original}=${limit},${duplicate}=${limit}`)
    expect(baked.ok).toBe(true)
    expect(baked.state.players[0]!.resources).toMatchObject({ grain: 8 - limit * 2, food: food * limit * 2 })
    expect(baked.state.log.filter((entry) => entry.key === 'log.bakeBread')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ count: limit, food: food * limit }) }),
      expect.objectContaining({ params: expect.objectContaining({ count: limit, food: food * limit }) }),
    ])
    expect(baked.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.exchanged', exchangeSource: duplicate,
      paid: { grain: limit }, gained: { food: food * limit },
    }))
  })

  it.each([
    ['Major_Joinery', 'Major_Joinery2', 'wood', 2, 7],
    ['Major_Pottery', 'Major_Pottery2', 'clay', 2, 7],
    ['Major_Basket', 'Major_Basket2', 'reed', 3, 5],
  ] as const)('%s and %s convert separately during a real harvest', (original, duplicate, resource, food) => {
    const session = setup(4)
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players[0]!.improvements = [original, duplicate]
    state.players[0]!.resources[resource] = 2
    state.players[0]!.resources.food = 20
    session.loadState(state)
    let response = session.performRoundEnd()
    for (let step = 0; step < 30 && response.state.round === 4; step += 1) {
      expect(response.ok).toBe(true)
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') throw new Error('harvest stopped')
      const interaction = response.interaction
      const request = interaction.request
      if (request.kind === 'choice') {
        const option = request.options.find((entry) => entry.value !== '__skip__' && entry.value !== 'cancel')!
        response = session.resolveChoice(interaction.playerIndex, option.value)
      } else if (request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
      } else if (request.kind === 'confirm-next-player') {
        response = session.resolveChoice(request.nextPlayerIndex, 'confirm')
      } else if (request.kind === 'feed') {
        response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
      } else if (request.kind === 'animal-reorg') {
        response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones: request.zones })
      } else {
        throw new Error(`unexpected harvest interaction ${request.kind}`)
      }
    }
    expect(response.ok).toBe(true)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(20 + food * 2 - 4)
  })

  it.each([
    ['Major_Joinery', 'Major_Joinery2', 'wood', 7],
    ['Major_Pottery', 'Major_Pottery2', 'clay', 7],
    ['Major_Basket', 'Major_Basket2', 'reed', 5],
  ] as const)('%s and %s currently reuse the same scoring resources', (original, duplicate, resource, amount) => {
    const session = setup(14)
    const state = session.getState().state
    state.players[0]!.improvements = [original, duplicate]
    state.players[0]!.resources[resource] = amount
    session.loadState(state)
    const response = session.getState()
    const bonus = response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')!
    expect(bonus.entries.filter((entry) => entry.type === 'bonus').map((entry) => entry.score)).toEqual([3, 3])
    expect(response.state.players[0]!.resources[resource]).toBe(amount)
  })
})
