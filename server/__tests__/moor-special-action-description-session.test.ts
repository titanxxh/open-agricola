import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { Engine, ActionRegistry, HookDispatcher, LogStore } from '../../shared/engine'
import { createInternalActionDefinitions } from '../../shared/actions/internal-actions'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview, GameState } from '../../shared/contract/types'
import type { MoorSpecialActionId } from '../../shared/moor/types'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const source = '__test_MoorMenu__'
const setup = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 78020, options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
    const player = state.players[0]!
    player.roomTiles = [{ row: 2, col: 3 }, { row: 2, col: 4 }]
    player.minorPlayed = [source]
    player.farmTerrain = [{ row: 0, col: 0, kind: 'moor', covered: 'forest' }, { row: 1, col: 0, kind: 'moor' }, { row: 0, col: 1, kind: 'forest' }, { row: 1, col: 2, kind: 'forest' }, { row: 0, col: 2, kind: 'forest', covered: 'moor' }]
    Object.assign(player.resources, { food: 10, wood: 0, clay: 0, reed: 0, stone: 0, fuel: 5, horse: 0 })
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
const effects = (description?: ChoiceDescriptionPreview): ChoiceEffectPreview[] => {
  if (!description) return []
  if (description.kind === 'conditional') return effects(description.body)
  if (description.kind === 'group') return description.parts.flatMap(effects)
  return description.effectPreview?.kind === 'rule' ? effects(description.effectPreview.description) : description.effectPreview ? [description.effectPreview] : []
}
const describeApply = (session: ReturnType<typeof createWorkSession>, actionId: MoorSpecialActionId, cardId: string, tile?: { row: number; col: number }) => session.withCtx(() => {
  const state = session.state
  const registry = new ActionRegistry()
  for (const definition of [...state.actionSpaces, ...createInternalActionDefinitions(id => registry.get(id))]) registry.register(definition)
  return Engine.fromFlow({ type: 'leaf', actionId: 'moor-special-action-apply', params: { cardId, actionId, payload: tile ? { tile } : {} } }, { registry, hooks: new HookDispatcher(), log: new LogStore() }, state.players[0]!.id)
    .describe({ state, player: state.players[0]!, space: state.actionSpaces[0]! })
})
const cardFor = (session: ReturnType<typeof createWorkSession>, actionId: MoorSpecialActionId) => {
  const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes(actionId))
  if (!card) throw new Error(`No official 2-player card for ${actionId}`)
  return card
}
const menu = (session: ReturnType<typeof createWorkSession>, actionId: MoorSpecialActionId) => {
  session.withCtx(() => requireActiveCardRegistry('Moor action description').registerListener({
    id: 'test-moor-card-action-menu', cardIds: [source], actions: ['place-farmer'], phases: ['before'], mandatory: true,
    handler: context => context.space.id === 'grain-seeds' ? { flow: { type: 'leaf', actionId: 'moor-special-action-choice', sourceCard: source, actionContext: { mode: 'take-card-action', actionIds: [actionId] } } } : undefined,
  }))
  const response = session.takeAction(0, 'grain-seeds')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error(`Missing native Moor card-action menu: ${JSON.stringify(response.interaction)} ${JSON.stringify(response.state.players[0]!.resources)}`)
  return response
}

describe('Moor special action descriptions use the actual plan', () => {
  it('Cut Peat menu shows current bonus gains and removes only the visible covered layer', () => {
    const session = setup(state => {
      state.players[0]!.minorPlayed.push('M116_MoorBirchTrees')
      state.players[0]!.rooms = 3
      state.players[0]!.roomTiles.push({ row: 2, col: 2 })
    })
    const card = cardFor(session, 'cut-peat')
    const before = JSON.stringify(session.state)
    for (let attempt = 0; attempt < 3; attempt++) expect(effects(describeApply(session, 'cut-peat', card.id, { row: 0, col: 0 }))).toContainEqual(expect.objectContaining({ kind: 'terrainOperation', operation: 'remove', from: 'moor', visibleLayerOnly: true, gainPerSelection: { fuel: 3, wood: 2 } }))
    expect(JSON.stringify(session.state)).toBe(before)
    const opening = menu(session, 'cut-peat')
    const selected = opening.interaction.request.options.find(option => option.value === `card-action:${card.id}:action:cut-peat:0:0`)!
    expect(effects(selected.descriptionPreview)).toContainEqual(expect.objectContaining({ kind: 'terrainOperation', minSelections: 1, maxSelections: 1, gainPerSelection: { fuel: 3, wood: 2 } }))
    const response = session.resolveChoice(0, selected.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 8, wood: 2, food: 10 })
    expect(response.state.players[0]!.farmTerrain).toContainEqual({ row: 0, col: 0, kind: 'forest' })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(candidate => candidate.id === card.id)!.location).toEqual({ kind: 'playerFaceUp', playerId: session.state.players[0]!.id })
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceActionId === 'cut-peat' && event.resources.fuel === 3 && event.resources.wood === 2)).toBe(true)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toBeDefined()
  })
  it('Fell Trees describes and gains base wood plus the actual declared reed bonus', () => {
    const session = setup(state => state.players[0]!.minorPlayed.push('M122_WillowBank'))
    const card = cardFor(session, 'fell-trees')
    expect(effects(describeApply(session, 'fell-trees', card.id, { row: 0, col: 1 }))).toContainEqual(expect.objectContaining({ kind: 'terrainOperation', from: 'forest', gainPerSelection: { wood: 2, reed: 1 } }))
    const response = session.takeSpecialAction(0, card.id, 'fell-trees', { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, reed: 1 })
    expect(response.state.players[0]!.farmTerrain?.some(tile => tile.row === 0 && tile.col === 1)).toBe(false)
  })
  it('Slash and Burn exposes its uncovered/adjacent field conditions and performs the selected replacement', () => {
    const session = setup(state => { state.players[0]!.fields = [{ row: 1, col: 1, stacks: [] }] })
    const card = cardFor(session, 'slash-and-burn')
    const description = describeApply(session, 'slash-and-burn', card.id, { row: 0, col: 1 })
    expect(effects(description)).toContainEqual(expect.objectContaining({ kind: 'terrainOperation', operation: 'replace-with-field', from: 'forest', to: 'field', requiresUncovered: true, adjacentFieldRequiredWhenPresent: true }))
    const opening = menu(session, 'slash-and-burn')
    expect(opening.interaction.request.options.some(option => option.value.endsWith(':0:2'))).toBe(false)
    const selected = opening.interaction.request.options.find(option => option.value === `card-action:${card.id}:action:slash-and-burn:0:1`)!
    const response = session.resolveChoice(0, selected.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual({ row: 0, col: 1, stacks: [] })
    expect(response.state.players[0]!.farmTerrain?.some(tile => tile.row === 0 && tile.col === 1)).toBe(false)
    expect(response.state.events.some(event => event.type === 'farm.fieldPlowed' && event.sourceActionId === 'slash-and-burn')).toBe(true)
  })
  it('a borrowed Cut Peat option declares and actually pays two food', () => {
    const session = setup()
    const card = cardFor(session, 'cut-peat')
    card.location = { kind: 'playerFaceUp', playerId: session.state.players[1]!.id }
    const opening = menu(session, 'cut-peat')
    const selected = opening.interaction.request.options.find(option => option.value === `card-action:${card.id}:action:cut-peat:0:0`)!
    expect(effects(selected.descriptionPreview)).toContainEqual({ kind: 'payment', resourcesPaid: { food: 2 } })
    const response = session.resolveChoice(0, selected.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 8, fuel: 8 })
    expect(response.state.farmersOfTheMoor!.specialActionCards.find(candidate => candidate.id === card.id)!.location).toEqual({ kind: 'playerFaceDown', playerId: session.state.players[0]!.id })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.food === 2 && event.sourceActionId === 'cut-peat')).toBe(true)
  })
  it('borrowing with insufficient food neither offers the card nor changes terrain or resources', () => {
    const session = setup(state => { state.players[0]!.resources.food = 1 })
    const card = cardFor(session, 'cut-peat')
    card.location = { kind: 'playerFaceUp', playerId: session.state.players[1]!.id }
    const before = JSON.stringify(session.state)
    const response = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: { row: 0, col: 0 } })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(session.state)).toBe(before)
  })
  it('covered or nonadjacent Slash and Burn targets cannot execute', () => {
    const session = setup(state => { state.players[0]!.fields = [{ row: 2, col: 0, stacks: [] }] })
    const card = cardFor(session, 'slash-and-burn')
    const before = JSON.stringify(session.state)
    expect(session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: { row: 0, col: 2 } }).ok).toBe(false)
    expect(session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: { row: 0, col: 1 } }).ok).toBe(false)
    expect(JSON.stringify(session.state)).toBe(before)
  })
  it('borrowing Horse Market displays its combined three-food fee and gives the actual horse', () => {
    const session = setup(state => {
      state.players[0]!.pastures = [{ id: 'horse-pasture', size: 1, tiles: [{ row: 1, col: 3 }], animalType: null, animalCount: 0, stables: 0 }]
    })
    const card = cardFor(session, 'horse-market')
    card.location = { kind: 'playerFaceUp', playerId: session.state.players[1]!.id }
    const description = describeApply(session, 'horse-market', card.id)
    expect(effects(description)).toEqual([{ kind: 'payment', resourcesPaid: { food: 3 } }, { kind: 'resourceExchange', resourcesGained: { horse: 1 } }])
    const response = session.takeSpecialAction(0, card.id, 'horse-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, horse: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceActionId === 'horse-market').map(event => event.resources.food)).toEqual([1, 2])
  })
  it('Hiring Fair describes and gives its one-food two-player reward', () => {
    const session = setup()
    const card = cardFor(session, 'hiring-fair')
    expect(effects(describeApply(session, 'hiring-fair', card.id))).toEqual([{ kind: 'resourceExchange', resourcesGained: { food: 1 } }])
    const response = session.takeSpecialAction(0, card.id, 'hiring-fair')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.resources.food === 1 && event.sourceActionId === 'hiring-fair')).toBe(true)
  })
  it('Black Market describes the entry fuel plus the actual minor cost, then pays both', () => {
    const session = setup(state => {
      state.players[0]!.minorHand = ['A019_Handplow']
      state.players[0]!.resources.wood = 2
    })
    const card = cardFor(session, 'black-market')
    const description = describeApply(session, 'black-market', card.id)
    expect(effects(description)).toContainEqual({ kind: 'payment', resourcesPaid: { fuel: 1 } })
    expect(effects(description)).toContainEqual(expect.objectContaining({ kind: 'payment', resourcesPaid: expect.objectContaining({ wood: 1 }) }))
    expect(JSON.stringify(description)).toContain('minorImprovements.A019_Handplow.name')
    const response = session.takeSpecialAction(0, card.id, 'black-market')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('A019_Handplow')
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 4, wood: 1 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.fuel === 1 && event.sourceActionId === 'black-market')).toBe(true)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.wood === 1 && event.sourceCardId === 'A019_Handplow')).toBe(true)
  })
  it('Illicit Work describes food/fuel entry and the chosen actual major price', () => {
    const session = setup(state => { state.players[0]!.resources.clay = 2 })
    const card = cardFor(session, 'illicit-work')
    const description = describeApply(session, 'illicit-work', card.id)
    expect(effects(description)).toContainEqual({ kind: 'payment', resourcesPaid: { food: 1, fuel: 1 } })
    expect(JSON.stringify(description)).toContain('improvements.Major_Fireplace1.name')
    let response = session.takeSpecialAction(0, card.id, 'illicit-work')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const fireplace = response.interaction.request.options.find(option => option.value === 'Major_Fireplace1')
      if (fireplace) response = session.resolveChoice(0, fireplace.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 9, fuel: 4, clay: 0 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.food === 1 && event.resources.fuel === 1)).toBe(true)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.clay === 2)).toBe(true)
  })
})
