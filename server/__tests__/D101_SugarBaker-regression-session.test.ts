import { afterEach, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = 'D101_SugarBaker'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make({ pileFood = 0, pileWood = 0, played = true, actor = 0 } = {}) {
  const session = createWorkSession({ configure(state) {
    state.round = 8
    state.players.forEach(player => {
      player.resources.food = 20
      player.resources.grain = 2
      player.fields = [{ row: 0, col: 0, stacks: [] }]
    })
    state.currentPlayerIndex = actor
    state.players[0]!.occupationPlayed = played ? [CARD] : []
    if (!played) state.players[0]!.occupationHand = [CARD]
    const space = state.actionSpaces.find(space => space.id === 'grain-utilization')!
    space.resources.food = pileFood
    space.resources.wood = pileWood
  } })
  sessions.push(session)
  return session
}
function finish(session: GameSession, response: SessionResponse, pay = false) {
  for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    const request = interaction.request
    if (request.kind === 'confirm-next-player') return response
    if (request.kind === 'farm-select' && request.farm.farmType === 'sow') {
      response = session.commitSelectionChoice(interaction.playerIndex, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    } else if (request.kind === 'choice' || request.kind === 'select-trigger') {
      const option = request.options.find(option => option.labelKey === 'actions.sow.name' || option.value === 'sow')
        ?? request.options.find(option => pay ? !['__skip__', '__pass__', '__done__'].includes(option.value) : ['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    } else if (request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(interaction.playerIndex, 'confirm')
    } else throw new Error(`Unexpected interaction: ${JSON.stringify(interaction)}`)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}
function next(session: GameSession, response: SessionResponse) {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'confirm-next-player') throw new Error(`Missing handoff: ${JSON.stringify(response.interaction)}`)
  const result = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
  expect(result.ok, result.error).toBe(true)
  return finish(session, result)
}
function take(session: GameSession, space: string, pay = false) {
  const response = session.takeAction(session.getState().state.currentPlayerIndex, space)
  expect(response.ok, response.error).toBe(true)
  return finish(session, response, pay)
}
function pile(response: SessionResponse) { return response.state.actionSpaces.find(space => space.id === 'grain-utilization')!.resources.food }
function bonus(response: SessionResponse) { return response.state.players[0]!.cardStates[CARD]?.counters?.bonusVp ?? 0 }
function assertPublicBonus(response: SessionResponse, playerIndex: number, score: number) {
  const summary = response.scores?.[playerIndex]
  expect(summary, 'Missing public player score').toBeDefined()
  if (!summary) throw new Error('Missing public player score')
  const category = summary.categories.find(category => category.key === 'cardBonusVp')
  expect(category?.total ?? 0).toBe(score)
  if (score === 1) expect(category!.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'bonus', cardId: CARD, score: 1 }),
  ]))
}
function assertOneOwnerPayment(response: SessionResponse) {
  const owner = response.state.players[0]!
  const paid = response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === CARD)
  expect(paid).toHaveLength(1)
  expect(paid[0]).toMatchObject({ actorPlayerId: owner.id, resources: { food: 1 } })
  const rows = response.state.log.filter(row => row.key === 'log.cardEffectPay' && row.params?.cardId === CARD)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ playerId: owner.id, params: { cardId: CARD, cost: { food: 1 } } })
}
function assertFoodVisitor(response: SessionResponse, playerIndex: number, food: number) {
  const visitor = response.state.players[playerIndex]!
  const collected = response.state.events.filter(event => event.type === 'resource.moved'
    && event.reason === 'collect' && event.from.kind === 'actionSpace' && event.from.spaceId === 'grain-utilization')
  expect(collected).toHaveLength(1)
  expect(collected[0]).toMatchObject({
    actorPlayerId: visitor.id, resources: { food },
    from: { kind: 'actionSpace', spaceId: 'grain-utilization' },
    to: { kind: 'player', playerId: visitor.id },
  })
  expect(response.state.log).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'log.actionDetail', playerId: visitor.id,
      params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { food } }) }) }),
  ]))
}


it('the next round opponent Sow visitor collects the paid food without another owner purchase', () => {
  const session = make()
  let response = take(session, 'grain-utilization', true)
  expect(pile(response)).toBe(1)
  expect(bonus(response)).toBe(1)
  expect(response.state.players[0]!.resources.food).toBe(19)
  assertPublicBonus(response, 0, 1)
  assertOneOwnerPayment(response)
  next(session, response)
  response = take(session, 'forest')
  next(session, response)
  response = take(session, 'clay-pit')
  next(session, response)
  response = take(session, 'reed-bank')
  response = next(session, response)
  expect(response.state.round).toBe(9)
  response = take(session, 'day-laborer')
  next(session, response)
  response = take(session, 'grain-utilization')
  expect(response.state.players[1]!.resources.food).toBe(21)
  expect(pile(response)).toBe(0)
  expect(bonus(response)).toBe(1)
  assertFoodVisitor(response, 1, 1)
  assertOneOwnerPayment(response)
  assertPublicBonus(response, 0, 1)
  assertPublicBonus(response, 1, 0)
})

it('an opponent collects only food while unrelated goods remain on the space', () => {
  const session = make({ pileFood: 2, pileWood: 3, actor: 1 })
  const response = take(session, 'grain-utilization')
  expect(response.state.players[1]!.resources.food).toBe(22)
  expect(response.state.players[1]!.resources.wood).toBe(0)
  expect(response.state.players[0]!.resources.food).toBe(20)
  expect(response.state.actionSpaces.find(space => space.id === 'grain-utilization')!.resources).toMatchObject({ food: 0, wood: 3 })
  expect(bonus(response)).toBe(0)
  assertFoodVisitor(response, 1, 2)
  assertPublicBonus(response, 0, 0)
  assertPublicBonus(response, 1, 0)
})

it('the owner collects earlier food before paying for one new bonus', () => {
  const response = take(make({ pileFood: 1 }), 'grain-utilization', true)
  expect(response.state.players[0]!.resources.food).toBe(20)
  expect(pile(response)).toBe(1)
  expect(bonus(response)).toBe(1)
  assertFoodVisitor(response, 0, 1)
  assertOneOwnerPayment(response)
  assertPublicBonus(response, 0, 1)
})

it('holding Sugar Baker does not collect or offer its payment', () => {
  const session = make({ pileFood: 1, played: false })
  const response = take(session, 'grain-utilization')
  expect(response.state.players[0]!.resources.food).toBe(20)
  expect(pile(response)).toBe(1)
  expect(bonus(response)).toBe(0)
  const rejected = session.resolveChoice(0, CARD)
  expect(rejected.ok).toBe(false)
  expect(pile(rejected)).toBe(1)
})

it('without earlier food a legal visitor gains no food and may decline the purchase', () => {
  const response = take(make(), 'grain-utilization')
  expect(response.state.players[0]!.resources.food).toBe(20)
  expect(pile(response)).toBe(0)
  expect(bonus(response)).toBe(0)
})
