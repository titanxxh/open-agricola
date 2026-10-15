import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { createInternalActionDefinitions } from '../../shared/actions/internal-actions'
import type { SeasonId } from '../../shared/seasons/types'
import type { SessionResponse } from '../game/authoritative-session'
import { familySize } from '../../shared/domain/player'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const actions = {
  winter: 'season-winter-romantic-evening', spring: 'season-spring-animal-and-fruit',
  summer: 'season-summer-farmers-market', autumn: 'season-autumn-thanksgiving',
} satisfies Record<SeasonId, string>
const setup = (season: SeasonId) => {
  const session = createWorkSession({ seed: 4352, options: { enableThroughTheSeasons: true }, configure: state => {
    state.round = 6
    state.throughTheSeasons = { startSeason: season, currentSeason: season }
    for (const player of state.players) Object.assign(player.resources, { food: 20, wood: 10, grain: 0, vegetable: 0 })
  } })
  sessions.push(session)
  return session
}
const choose = (session: ReturnType<typeof createWorkSession>, response: SessionResponse, label: string) => {
  if (response.interaction.stateId !== 'wait') throw new Error(`Missing seasonal choice ${label}`)
  const option = response.interaction.request.options?.find(candidate => candidate.labelKey === label)
  if (!option) throw new Error(`Missing seasonal branch ${label}`)
  return session.resolveChoice(0, option.value)
}

describe('explicit seasonal action planning', () => {
  it.each(['winter', 'spring', 'summer', 'autumn'] as const)('%s base/current plans are pure and base retains every potential branch', season => {
    const session = setup(season)
    const state = session.state
    const player = state.players[0]!
    const space = state.actionSpaces.find(candidate => candidate.id === actions[season])!
    if (!space.flowFactory) throw new Error('Missing seasonal executable factory')
    const before = JSON.stringify(state)
    for (let attempt = 0; attempt < 3; attempt++) {
      const base = session.withCtx(() => space.flowFactory?.({ actionHooks: session.actionHooks, state, player, space, previewMode: 'base' }))
      const current = session.withCtx(() => space.flowFactory?.({ actionHooks: session.actionHooks, state, player, space }))
      if (season === 'winter') expect(base).toMatchObject({ type: 'seq', children: [
        { actionId: 'pay', params: { wood: 2, food: 5 } },
        { actionId: 'family-growth', actionContext: { skipRoomCheck: true } },
      ] })
      if (season === 'spring') {
        expect(base).toMatchObject({ type: 'xor', children: [
          { actionId: 'breed' }, { actionId: 'sow' },
          { type: 'seq', children: [{ actionId: 'breed' }, { actionId: 'sow' }] },
          { type: 'seq', children: [{ actionId: 'sow' }, { actionId: 'breed' }] },
        ] })
        expect(current).toBeUndefined()
      }
      if (season === 'summer') expect(base).toMatchObject({ type: 'or', children: [{ actionId: 'plow' }, { actionId: 'season-summer-bread-or-sell' }] })
      if (season === 'autumn') {
        expect(base).toMatchObject({ type: 'or', children: [{ actionId: 'reap', actionContext: { trigger: { phase: 'private-field-phase' } } }, { actionId: 'gain', params: { vegetable: 1 } }] })
        expect(current).toMatchObject({ type: 'or', children: [{ actionId: 'gain', params: { vegetable: 1 } }] })
      }
    }
    expect(JSON.stringify(state)).toBe(before)
  })
  it('Winter pays two wood and five food for a newborn even with no empty room', () => {
    const session = setup('winter')
    const response = session.takeAction(0, actions.winter)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 15, wood: 8 })
    expect(response.state.players[0]!.rooms).toBe(2)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.food === 5 && event.resources.wood === 2)).toBe(true)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toBeDefined()
  })
  it('an unaffordable Winter plan does not spend resources or grow the family', () => {
    const session = setup('winter')
    const state = session.getState().state
    state.players[0]!.resources.food = 4
    session.loadState(state)
    const response = session.takeAction(0, actions.winter)
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, wood: 10 })
    expect(familySize(response.state.players[0]!)).toBe(2)
  })
  it('Spring uses its only available Sow branch through the real farm interaction', () => {
    const session = setup('spring')
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    state.players[0]!.resources.grain = 1
    session.loadState(state)
    let response = session.takeAction(0, actions.spring)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = choose(session, response, 'actions.sow.name')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing Sow interaction')
    expect(response.interaction.playerIndex).toBe(0)
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.sown')).toBe(true)
  })
  it('Summer sale derives its exact one-grain/four-food leaves from its actual factory', () => {
    const session = setup('summer')
    const state = session.getState().state
    state.players[0]!.resources.grain = 1
    session.loadState(state)
    const sale = createInternalActionDefinitions(() => undefined).find(action => action.id === 'season-summer-sell-grain')
    if (!sale?.flowFactory) throw new Error('Missing executable grain-sale factory')
    expect(sale.flowFactory({ actionHooks: session.actionHooks, state: session.state, player: session.state.players[0]!, space: session.state.actionSpaces[0]! })).toMatchObject({
      type: 'seq', children: [{ actionId: 'pay', params: { cost: { grain: 1 } } }, { actionId: 'gain', params: { food: 4 } }],
    })
    const response = choose(session, session.takeAction(0, actions.summer), 'actions.season-summer-farmers-market.option-sell-grain')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 24 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.grain === 1)).toBe(true)
    expect(response.state.log.length).toBeGreaterThan(0)
  })
  it('Autumn reaps privately then takes a vegetable without changing the other farm', () => {
    const session = setup('autumn')
    const state = session.getState().state
    for (const player of state.players) player.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]
    session.loadState(state)
    let response = choose(session, session.takeAction(0, actions.autumn), 'actions.reap.name')
    expect(response.ok, response.error).toBe(true)
    response = choose(session, response, 'actions.season-autumn-thanksgiving.option-vegetable')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 1 }])
    expect(response.state.players[1]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 2 }])
    expect(response.state.harvestBreedSummary).toBeUndefined()
    expect(response.state.events.some(event => event.type === 'farm.animalBred')).toBe(false)
    expect(response.state.log.length).toBeGreaterThan(0)
  })
})
