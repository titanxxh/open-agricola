import { afterEach, describe, expect, it } from 'vitest'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import type { GameState } from '../../shared/contract/types'
import type { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'

const BAKER = 'CWM004_BargainingBakerr'
const OVEN = 'Major_ClayOven'
const FIREPLACE = 'Major_Fireplace1'
const HEATING_OVEN = 'Major_Moor_HeatingOven'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(configure?: (state: GameState) => void, moor = false) {
  const session = createWorkSession({ seed: 904, options: {
    enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: moor,
  }, configure: state => {
    state.round = 5
    const index = state.roundActionOrder.indexOf('major-improvement')
    const first = state.roundActionOrder[0]!
    state.roundActionOrder[0] = 'major-improvement'
    state.roundActionOrder[index] = first
    const player = state.players[0]!
    player.occupationPlayed = [BAKER]
    Object.assign(player.resources, { food: 0, grain: 0, clay: 3, stone: 1 })
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function chooseMajor(session: GameSession, id: string) {
  const offered = session.takeAction(0, 'major-improvement')
  expect(sessionOptions(offered).map(option => option.value)).toContain(id)
  const response = session.resolveChoice(0, id)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('classic Bargaining Baker', () => {
  it.each([2, 3])('chooses a single discount, spends %i clay, and bakes its new grain on purchase', clay => {
    const session = setup()
    let response = chooseMajor(session, OVEN)
    const options = sessionOptions(response)
    const costs = options.flatMap(option => option.effectPreview?.kind === 'payment'
      ? [option.effectPreview.resourcesPaid] : [])
    expect(costs).toHaveLength(2)
    expect(costs).toEqual(expect.arrayContaining([
      expect.objectContaining({ clay: 3, stone: 0 }), expect.objectContaining({ clay: 2, stone: 1 }),
    ]))
    const selected = options.find(option => option.effectPreview?.kind === 'payment'
      && option.effectPreview.resourcesPaid.clay === clay)!
    response = session.resolveChoice(0, selected.value)
    expect(response.state.players[0]!.improvements).toContain(OVEN)
    const bake = sessionOptions(response).find(option => option.effectPreview?.kind === 'bakeRecipes')!
    response = session.resolveChoice(0, bake.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 5, clay: 3 - clay, stone: clay - 2 })
    const events = response.state.events
    const granted = events.filter(event => event.type === 'resource.moved' && event.sourceCardId === BAKER)
    expect(granted).toHaveLength(1)
    expect(granted[0]).toMatchObject({ resources: { grain: 1 } })
    const paid = events.find(event => event.type === 'resource.paid' && event.sourceCardId === OVEN)!
    const exchange = events.find(event => event.type === 'resource.exchanged' && event.sourceCardId === OVEN)!
    expect(granted[0]!.seq).toBeLessThan(paid.seq)
    expect(paid.seq).toBeLessThan(exchange.seq)
  })

  it('admits the oven when the discount is needed, and keeps its grain if the bake is declined', () => {
    const session = setup(state => { state.players[0]!.resources.clay = 2 })
    const purchased = chooseMajor(session, OVEN)
    expect(sessionOptions(purchased).map(option => option.value)).toContain('__skip__')
    const declined = session.resolveChoice(0, '__skip__')
    expect(declined.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0, clay: 0, stone: 0 })
  })

  it('gives grain for a Fireplace without discounting its clay', () => {
    const purchased = chooseMajor(setup(), FIREPLACE)
    expect(purchased.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 1, stone: 1 })
  })

  it('gives grain for a free minor baking improvement', () => {
    const course = 'D064_BakingCourse'
    const session = setup(state => { state.players[0]!.minorHand = [course] })
    const response = playMinor(session, course)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(course)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('pays full price for a Heating Oven without a baking symbol', () => {
    const session = setup(state => {
      takeMajorImprovementFromSupply(state, OVEN)
      state.players[1]!.improvements = [OVEN]
    }, true)
    const bought = chooseMajor(session, HEATING_OVEN)
    expect(bought.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 0, grain: 0 })
  })
})
