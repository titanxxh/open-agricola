import { afterEach, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameState } from '../../shared/contract/types'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'

// #1145 approved Session seam: real two-player placements finish round 6,
// then observe the next round's reveal, preparation, start and work windows.
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(configure: (state: GameState) => void): GameSession {
  const session = createWorkSession({ seed: 4242, configure(state) {
    state.round = 6
    state.roundActionOrder[6] = 'western-quarry'
    for (const player of state.players) Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0 })
    configure(state)
  } })
  sessions.push(session)
  return session
}

function choose(session: GameSession, response: SessionResponse, value: string): SessionResponse {
  const interaction = response.interaction
  if (interaction.stateId !== 'wait') throw new Error('Expected a stage interaction')
  const actor = interaction.request.kind === 'confirm-next-player' ? interaction.request.fromPlayerIndex : interaction.playerIndex
  const result = session.resolveChoice(actor, value)
  expect(result.ok, result.error).toBe(true)
  return result
}

function nextRound(session: GameSession): SessionResponse {
  let response = session.getState()
  for (const [actor, spaceId] of [[0, 'grain-seeds'], [1, 'day-laborer'], [0, 'forest'], [1, 'clay-pit']] as const) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = choose(session, response, 'confirm')
    }
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(actor, spaceId)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
    response = choose(session, response, 'confirm')
  }
  return response
}

function finishStages(session: GameSession, response: SessionResponse): SessionResponse {
  for (let steps = 0; steps < 12 && response.interaction.stateId === 'wait'; steps += 1) {
    const request = response.interaction.request
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error(`Unexpected stage request ${request.kind}`)
    const option = request.options.find(option => !option.disabled
      && option.labelKey !== 'actions.exchange.name'
      && !['__skip__', '__pass__', '__done__'].includes(option.value))
      ?? request.options.find(option => !option.disabled && option.value === '__pass__')
      ?? request.options.find(option => !option.disabled && option.labelKey !== 'actions.exchange.name')
    if (!option) throw new Error('No stage option')
    response = choose(session, response, option.value)
  }
  expect(response.state.round).toBe(7)
  expect(response.state.roundPhase).toBe('work')
  expect(response.interaction.stateId).toBe('idle')
  return response
}

it('Tree Inspector discards old wood at the real Quarry reveal and then accumulates one new wood', () => {
  const cardId = 'D116_TreeInspector'
  const session = setup(state => {
    state.players[0]!.occupationPlayed = [cardId]
    state.actionSpaces.push(...createPlayerActionSpaces(state))
    const card = state.actionSpaces.find(space => space.id === cardId)
    if (!card) throw new Error('Tree Inspector space missing')
    card.resources.wood = 4
  })
  const response = finishStages(session, nextRound(session))
  expect(response.state.actionSpaces.find(space => space.id === cardId)?.resources.wood).toBe(1)
  const discarded = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === cardId && event.reason === 'discard')
  expect(discarded).toMatchObject({ resources: { wood: 4 }, from: { kind: 'actionSpace', spaceId: cardId }, to: { kind: 'supply' } })
  const accumulated = response.state.events.find(event => event.type === 'action.accumulated' && event.round === 7 && event.spaceId === cardId)
  expect(accumulated).toBeDefined()
  expect(discarded && accumulated && discarded.seq < accumulated.seq).toBe(true)
})

it.each([0, 2])('Nest Site and Shoreforester inspect %i reed before preparation adds its new reed', reed => {
  const session = setup(state => {
    state.players[0]!.occupationPlayed = ['B116_Shoreforester']
    state.players[0]!.minorPlayed = ['A049_NestSite']
    const reedBank = state.actionSpaces.find(space => space.id === 'reed-bank')
    if (!reedBank) throw new Error('Reed Bank missing')
    reedBank.resources.reed = reed
  })
  const response = finishStages(session, nextRound(session))
  expect(response.state.players[0]!.resources).toMatchObject({ wood: reed === 0 ? 4 : 3, food: reed === 0 ? 40 : 41 })
  expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')?.resources.reed).toBe(reed + 1)
  const rewardedCard = reed === 0 ? 'B116_Shoreforester' : 'A049_NestSite'
  const reward = response.state.events.find(event => event.type === 'resource.moved' && event.round === 7 && event.sourceCardId === rewardedCard)
  const accumulated = response.state.events.find(event => event.type === 'action.accumulated' && event.round === 7 && event.spaceId === 'reed-bank' && !event.sourceCardId)
  expect(reward && accumulated && reward.seq < accumulated.seq).toBe(true)
})

it.each([6, 7])('Small Animal Breeder compares %i food with upcoming round seven before the round counter changes', food => {
  const session = setup(state => {
    state.players[0]!.occupationPlayed = ['C111_SmallAnimalBreeder']
    state.players[0]!.resources.food = food
  })
  const response = finishStages(session, nextRound(session))
  expect(response.state.players[0]!.resources.food).toBe(food === 6 ? 6 : 8)
  const reward = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === 'C111_SmallAnimalBreeder')
  if (food === 7) expect(reward?.round).toBe(6)
  else expect(reward).toBeUndefined()
})

it('Moral Crusader includes goods promised on the nearest remaining round space', () => {
  const session = setup(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = ['B106_MoralCrusader']
    state.futureMeeples.push({ id: 'due-seven', cardId: 'well', playerId: owner.id, round: 7, resources: { food: 2 }, actionId: 'receive' })
  })
  const response = finishStages(session, nextRound(session))
  expect(response.state.players[0]!.resources.food).toBe(43)
  const reward = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === 'B106_MoralCrusader')
  expect(reward?.round).toBe(6)
  expect(response.state.futureMeeples).toEqual([])
})

it('Pavior sees stone collected in StartOfTurn and pays before work begins', () => {
  const session = setup(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = ['B110_Pavior']
    state.futureMeeples.push({ id: 'stone-seven', cardId: 'test-stone', playerId: owner.id, round: 7, resources: { stone: 1 }, actionId: 'receive' })
  })
  const response = finishStages(session, nextRound(session))
  expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, food: 41 })
  const receive = response.state.events.find(event => event.type === 'resource.moved' && event.reason === 'receive' && event.sourceCardId === 'test-stone')
  const reward = response.state.events.find(event => event.type === 'resource.moved' && event.sourceCardId === 'B110_Pavior')
  const work = response.state.events.find(event => event.type === 'work.started' && event.round === 7)
  expect(receive && reward && work && receive.seq < reward.seq && reward.seq < work.seq).toBe(true)
})

it('Plow Driver remains a stage source with no food and can plow after scheduled food arrives', () => {
  const session = setup(state => {
    const owner = state.players[0]!
    owner.occupationPlayed = ['A090_PlowDriver']
    owner.houseType = 'stone'
    owner.resources.food = 0
    state.futureMeeples.push({ id: 'food-seven', cardId: 'well', playerId: owner.id, round: 7, resources: { food: 1 }, actionId: 'receive' })
  })
  let response = nextRound(session)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') throw new Error('Expected source ordering')
  const receive = response.interaction.request.options.find(option => !option.disabled && option.value !== 'A090_PlowDriver' && option.value !== '__pass__')
  if (!receive) throw new Error('Scheduled food is not offered')
  response = choose(session, response, receive.value)
  expect(response.state.players[0]!.resources.food).toBe(1)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected Plow Driver offer')
  if (response.interaction.request.kind === 'select-trigger') response = choose(session, response, 'A090_PlowDriver')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected optional plow acceptance')
  if (response.interaction.request.kind === 'choice') {
    const accept = response.interaction.request.options.find(option => !option.disabled && !['__skip__', '__pass__', '__done__'].includes(option.value))
    if (!accept) throw new Error('Plow Driver cannot be accepted after food receipt')
    response = choose(session, response, accept.value)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.food).toBe(0)
  expect(response.state.players[0]!.fields).toContainEqual(expect.objectContaining({ row: 0, col: 2 }))
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
  response = choose(session, response, '__pass__')
  expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
  expect(response.state.roundPhase).toBe('work')
})
