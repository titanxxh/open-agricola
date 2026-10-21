import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext } from './_helpers/negative-rule-audit'

/**
 * #1321: bonus goods for using an accumulation space are paid before the space's own collection
 * (reference `onPlayerPlaceFarmer`). Each case is a fresh game with the smallest legal player
 * count, all goods at zero, the card played by player 0 and only the listed spaces stocked.
 */
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

type Stock = Record<string, Partial<Resource>>

function setup(card: string, { players = 2, round = 1, stock, occupation }: {
  players?: number; round?: number; stock: Stock; occupation?: boolean
}) {
  const session = createWorkSession({ seed: 1321, options: { playerCount: players }, configure: (state: GameState) => {
    state.round = round
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
      setWorkersAtHome(state, player, 2)
    }
    for (const space of state.actionSpaces) {
      space.takenBy = []
      for (const resource of Object.keys(space.resources)) Reflect.set(space.resources, resource, 0)
      Object.assign(space.resources, stock[space.id] ?? {})
    }
    const owner = state.players[0]!
    if (occupation) owner.occupationPlayed = [card]
    else owner.minorPlayed = [card]
  } })
  sessions.push(session)
  return session
}

const cardGains = (response: SessionResponse, card: string) =>
  response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card)

const hostCollectIndex = (response: SessionResponse, spaceId: string) =>
  response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === undefined
    && event.from.kind === 'actionSpace' && event.from.spaceId === spaceId)

function use(session: GameSession, spaceId: string, actor = 0) {
  const response = session.takeAction(actor, spaceId)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind, JSON.stringify(response.interaction))
    .toBe('confirm-next-player')
  return response
}

function expectBeforeHost(response: SessionResponse, card: string, spaceId: string, reward: Partial<Resource>) {
  const gains = cardGains(response, card)
  expect(gains).toHaveLength(1)
  const gain = gains[0]!
  expect(gain.type === 'resource.moved' && gain.resources).toEqual(reward)
  const host = hostCollectIndex(response, spaceId)
  expect(host).toBeGreaterThanOrEqual(0)
  expect(response.state.events.indexOf(gain)).toBeLessThan(host)
  expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === card)).toHaveLength(1)
  expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === card)).toHaveLength(1)
}

const ZERO = { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0 }

const triggerCases = [
  { card: 'A042_ForestLakeHut', space: 'forest', stock: { forest: { wood: 3 } }, reward: { food: 1 }, total: { wood: 3, food: 1 } },
  { card: 'A042_ForestLakeHut', space: 'fishing', stock: { fishing: { food: 2 } }, reward: { wood: 1 }, total: { wood: 1, food: 2 } },
  { card: 'A051_DriftNetBoat', space: 'fishing', stock: { fishing: { food: 2 } }, reward: { food: 2 }, total: { food: 4 } },
  { card: 'A078_Canoe', space: 'fishing', stock: { fishing: { food: 2 } }, reward: { reed: 1, food: 1 }, total: { reed: 1, food: 3 } },
  { card: 'A080_StoneTongs', space: 'western-quarry', round: 5, stock: { 'western-quarry': { stone: 2 } }, reward: { stone: 1 }, total: { stone: 3 } },
  { card: 'A116_WoodCutter', occupation: true, space: 'forest', stock: { forest: { wood: 3 } }, reward: { wood: 1 }, total: { wood: 4 } },
  { card: 'A139_HollowWarden', occupation: true, players: 3, space: 'hollow', stock: { hollow: { clay: 2 } }, reward: { food: 1 }, total: { clay: 2, food: 1 } },
  { card: 'A140_ShovelBearer', occupation: true, players: 3, space: 'clay-pit', stock: { 'clay-pit': { clay: 1 }, hollow: { clay: 2 } }, reward: { food: 2 }, total: { clay: 1, food: 2 } },
  { card: 'A140_ShovelBearer', occupation: true, players: 3, space: 'hollow', stock: { 'clay-pit': { clay: 3 }, hollow: { clay: 2 } }, reward: { food: 3 }, total: { clay: 2, food: 3 } },
  { card: 'A155_Conjurer', occupation: true, players: 4, space: 'traveling-players', stock: { 'traveling-players': { food: 2 } }, reward: { wood: 1, grain: 1 }, total: { wood: 1, grain: 1, food: 2 } },
  { card: 'B040_BreweryPond', space: 'fishing', stock: { fishing: { food: 2 } }, reward: { grain: 1, wood: 1 }, total: { grain: 1, wood: 1, food: 2 } },
  { card: 'B040_BreweryPond', space: 'reed-bank', stock: { 'reed-bank': { reed: 1 } }, reward: { grain: 1, wood: 1 }, total: { grain: 1, wood: 1, reed: 1 } },
  { card: 'B121_Geologist', occupation: true, space: 'forest', stock: { forest: { wood: 3 } }, reward: { clay: 1 }, total: { wood: 3, clay: 1 } },
  { card: 'B121_Geologist', occupation: true, space: 'reed-bank', stock: { 'reed-bank': { reed: 1 } }, reward: { clay: 1 }, total: { reed: 1, clay: 1 } },
  { card: 'B121_Geologist', occupation: true, players: 3, space: 'clay-pit', stock: { 'clay-pit': { clay: 1 } }, reward: { clay: 1 }, total: { clay: 2 } },
] as Array<{
  card: string; space: string; stock: Stock; reward: Partial<Resource>; total: Partial<Resource>
  players?: number; round?: number; occupation?: boolean
}>

const quietCases = [
  { card: 'A042_ForestLakeHut', space: 'day-laborer', stock: {}, total: { food: 2 } },
  { card: 'A051_DriftNetBoat', space: 'forest', stock: { forest: { wood: 3 } }, total: { wood: 3 } },
  { card: 'A078_Canoe', space: 'forest', stock: { forest: { wood: 3 } }, total: { wood: 3 } },
  { card: 'A080_StoneTongs', space: 'clay-pit', round: 5, stock: { 'clay-pit': { clay: 1 } }, total: { clay: 1 } },
  { card: 'A116_WoodCutter', occupation: true, space: 'clay-pit', stock: { 'clay-pit': { clay: 1 } }, total: { clay: 1 } },
  { card: 'A139_HollowWarden', occupation: true, players: 3, space: 'clay-pit', stock: { 'clay-pit': { clay: 1 } }, total: { clay: 1 } },
  { card: 'A140_ShovelBearer', occupation: true, players: 3, space: 'clay-pit', stock: { 'clay-pit': { clay: 1 } }, total: { clay: 1 } },
  { card: 'A155_Conjurer', occupation: true, players: 4, space: 'fishing', stock: { fishing: { food: 2 } }, total: { food: 2 } },
  { card: 'B040_BreweryPond', space: 'forest', stock: { forest: { wood: 3 } }, total: { wood: 3 } },
  { card: 'B121_Geologist', occupation: true, space: 'clay-pit', stock: { 'clay-pit': { clay: 1 } }, total: { clay: 1 } },
] as Array<{ card: string; space: string; stock: Stock; total: Partial<Resource>; players?: number; round?: number; occupation?: boolean }>

describe('accumulation-space bonus goods before the host collection', () => {
  it.each(triggerCases)('$card pays $reward before collecting from $space', example => {
    const session = setup(example.card, example)
    const baseline = session.getState().scores
    const response = use(session, example.space)
    expectBeforeHost(response, example.card, example.space, example.reward)
    expect(response.state.players[0]!.resources).toMatchObject({ ...ZERO, ...example.total })
    expect(Object.values(response.state.actionSpaces.find(space => space.id === example.space)!.resources).every(n => n === 0)).toBe(true)
    expect(response.state.players[1]!.resources).toMatchObject(ZERO)
    // Only the owner's grain score can move (Conjurer and Brewery Pond give grain).
    const withoutGrain = (scores: typeof baseline) => scores.map(player => player.categories.filter(category => category.key !== 'grains'))
    expect(withoutGrain(response.scores)).toEqual(withoutGrain(baseline))
    expect(response.scores[0]!.categories.find(category => category.key === 'grains')?.quantity).toBe(example.total.grain ?? 0)
  })

  it.each(quietCases)('$card gives nothing on $space', example => {
    const session = setup(example.card, example)
    const response = use(session, example.space)
    expect(cardGains(response, example.card)).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ ...ZERO, ...example.total })
  })

  it.each(triggerCases)('$card gives the owner nothing when the opponent uses $space', example => {
    const session = setup(example.card, example)
    confirmNext(session, use(session, 'meeting-place'))
    const response = use(session, example.space, 1)
    expect(cardGains(response, example.card)).toEqual([])
    expect(response.state.players[1]!.resources).toMatchObject(Object.fromEntries(
      Object.entries(example.total).map(([resource, amount]) => [resource, amount - (example.reward[resource as keyof Resource] ?? 0)])))
  })
})
