import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import { ActionHookRegistry } from '../../shared/actions/hooks'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

const game = (season?: 'winter' | 'summer') => {
  const session = createWorkSession({ options: { enableThroughTheSeasons: season !== undefined }, configure: state => {
    state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 3
    if (season) state.throughTheSeasons = { startSeason: season, currentSeason: season }
  } })
  sessions.push(session)
  return session
}

describe('per-session action rules', () => {
  it('requires the query dependency while allowing an explicitly empty registry', () => {
    const session = game()
    const player = session.state.players[0]!
    expect(() => session.withCtx(() => computeAllowedPlacementSpaces(session.state, player)))
      .toThrow('ActionHookRegistry is required')
    const placements = session.withCtx(() => computeAllowedPlacementSpaces(session.state, player, { actionHooks: new ActionHookRegistry() }))
    expect(placements.map(entry => entry.spaceId)).toContain('fishing')
    session.actionHooks.clear()
    const food = player.resources.food
    const response = session.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(food + 3)
  })

  it('keeps a session veto when another two-player game is created', () => {
    const a = game()
    a.actionHooks.register({ id: 'test:fishing', actions: ['fishing'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    expect(a.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    const b = game()
    expect(a.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    expect(b.getAvailableActions(0).map(entry => entry.spaceId)).toContain('fishing')
    expect(a.takeAction(0, 'fishing').ok).toBe(false)
    const food = b.state.players[0]!.resources.food
    const response = b.takeAction(0, 'fishing')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(food + 3)
  })

  it('charges the owning session through real construction and grants its follow-up exactly once', () => {
    const a = game()
    a.state.players[0]!.resources.wood = 10
    a.state.players[0]!.resources.reed = 2
    a.actionHooks.register({ id: 'test:price', actions: ['construct'], phases: ['computeCosts'], handler: () => ({ costs: { wood: 1 } }) })
    a.actionHooks.register({ id: 'test:reward', actions: ['construct'], phases: ['after'], handler: () => ({ flow: { type: 'leaf', actionId: 'bonus-grain' } }) })
    const b = game()
    b.state.players[0]!.resources.wood = 10
    b.state.players[0]!.resources.reed = 2
    const buildRoom = (session: typeof a) => {
      let response = session.takeAction(0, 'farm-expansion')
      expect(response.ok).toBe(true)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected construction choice')
      const option = response.interaction.request.options?.find(option => option.value.includes('construct'))
      expect(option).toBeDefined()
      response = session.resolveChoice(0, option!.value)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected room selection')
      response = session.loadState(rehydrateState(serializeSessionSnapshot(response.state, session)))
      expect(response.ok).toBe(true)
      expect(response.interaction.stateId).toBe('wait')
      return session.commitSelectionChoice(0, { rooms: [response.interaction.request.farm.selectableTiles[0]!] })
    }
    const ra = buildRoom(a)
    const rb = buildRoom(b)
    expect(ra.ok).toBe(true)
    expect(rb.ok).toBe(true)
    expect(ra.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 4, reed: 0, grain: 1 } })
    expect(rb.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 5, reed: 0, grain: 0 } })
    expect(ra.state.log).toContainEqual(expect.objectContaining({ key: 'log.actionDetail', params: expect.objectContaining({ detailParts: expect.objectContaining({ costs: { wood: 6, reed: 2 } }) }) }))
    expect(ra.state.events.filter(event => event.sourceActionId === 'bonus-grain' && event.type === 'resource.moved')).toHaveLength(1)
  })

  it('isolates equal IDs, clearing and disposal while retaining rules through load and undo', () => {
    const a = game()
    const b = game()
    for (const session of [a, b]) session.actionHooks.register({ id: 'same-id', actions: ['fishing'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    a.actionHooks.unregister('same-id')
    expect(a.getAvailableActions(0).map(entry => entry.spaceId)).toContain('fishing')
    expect(b.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    a.actionHooks.clear()
    a.dispose()
    expect(b.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    b.actionHooks.register({ id: 'test:forest-reward', actions: ['collect'], phases: ['after'], handler: context => context.space.id === 'forest' ? { flow: { type: 'leaf', actionId: 'bonus-grain' } } : undefined })
    const snapshot = serializeSessionSnapshot(b.state, b)
    expect(JSON.stringify(snapshot)).not.toContain('same-id')
    expect(b.loadState(rehydrateState(snapshot)).ok).toBe(true)
    expect(b.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    const before = b.state.players[0]!.resources.grain
    expect(b.takeAction(0, 'forest').ok).toBe(true)
    expect(b.state.players[0]!.resources.grain).toBe(before + 1)
    expect(b.undoAction().ok).toBe(true)
    expect(b.state.players[0]!.resources.grain).toBe(before)
    expect(b.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    expect(b.takeAction(0, 'forest').ok).toBe(true)
    expect(b.state.players[0]!.resources.grain).toBe(before + 1)
    const rebuilt = new GameSession(rehydrateState(snapshot))
    sessions.push(rebuilt)
    expect(rebuilt.getAvailableActions(0).map(entry => entry.spaceId)).toContain('fishing')
  })

  it.each([true, false])('isolates winter and summer definitions in either creation order (variant first=%s)', variantFirst => {
    const pair = (season: 'winter' | 'summer') => {
      const first = game(variantFirst ? season : undefined)
      const second = game(variantFirst ? undefined : season)
      return variantFirst ? [first, second] : [second, first]
    }
    const [winter, plain] = pair('winter')
    expect(winter!.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('fishing')
    expect(plain!.getAvailableActions(0).map(entry => entry.spaceId)).toContain('fishing')
    for (const [session, foodCost] of [[winter!, 1], [plain!, 0]] as const) {
      session.state.players[0]!.resources.food = 3
      const response = session.takeAction(0, 'farmland')
      expect(response.ok).toBe(true)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected plow selection')
      const done = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0] })
      expect(done.ok).toBe(true)
      expect(done.state.players[0]!.resources.food).toBe(3 - foodCost)
      expect(done.state.players[0]!.fields).toHaveLength(1)
    }
    const [summer, ordinary] = pair('summer')
    for (const [session, grain] of [[summer!, 1], [ordinary!, 0]] as const) {
      const before = session.state.players[0]!.resources.grain
      const response = session.takeAction(0, 'day-laborer')
      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources.grain).toBe(before + grain)
      expect(response.state.events.filter(event => event.sourceActionId === 'bonus-grain' && event.type === 'resource.moved')).toHaveLength(grain)
    }
  })

})
