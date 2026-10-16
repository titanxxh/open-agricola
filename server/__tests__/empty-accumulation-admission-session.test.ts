import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import type { GameState, Resource } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeState } from '../../shared/session/serialization'

/**
 * Issue 1201: new seed-42 work games use fixed hands, round 10, two workers at
 * home and zero goods except 20 food. Card cases own exactly the named card;
 * animal cases have one empty pasture. All spaces start unoccupied. Tests use
 * Session queries and commands to check atomic rejection, real collection,
 * bonus scheduling, replacement choices, and placement/movement validation.
 * D138/A137 use their printed three-player minimum; Riverbank Forest uses five.
 * The synthetic listener tests the shared replacement contract, not a card rule.
 */
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = ({ card, players = 2, actor = 0, configure }: {
  card?: string
  players?: 2 | 3 | 5
  actor?: number
  configure?: (state: GameState) => void
} = {}) => {
  const session = createWorkSession({ seed: 42, options: { playerCount: players }, configure(state) {
    state.round = 10
    state.currentPlayerIndex = actor
    for (const player of state.players) {
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    }
    const owner = state.players[0]!
    if (card) {
      if (card === 'D116_TreeInspector' || card === 'D138_PetLover' || card === 'A137_RiverineShepherd') owner.occupationPlayed = [card]
      else owner.minorPlayed = [card]
      state.actionSpaces.push(...createPlayerActionSpaces(state))
    }
    owner.pastures = [{ id: 'audit-pasture', tiles: [{ row: 0, col: 3 }], animalType: null, animalCount: 0 }]
    for (const space of state.actionSpaces) {
      space.takenBy = []
      for (const resource of Object.keys(space.resources)) {
        Object.assign(space.resources, { [resource]: 0 })
      }
    }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const spaceOf = (session: GameSession, id: string) => {
  const space = session.state.actionSpaces.find(space => space.id === id)
  if (!space) throw new Error(`Missing action space ${id}`)
  return space
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

const finish = (session: GameSession, initial: SessionResponse, preferredCard?: string) => {
  let response = initial
  for (let step = 0; step < 12; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind === 'confirm-next-player') return response
    if (response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', {
        zones: [{ id: 'audit-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }],
      })
      continue
    }
    const option = optionsOf(response).find(option => option.sourceCard === preferredCard
      && option.value !== '__skip__' && option.value !== '__pass__')
      ?? optionsOf(response).find(option => option.value === '__pass__')
    if (!option) throw new Error(`Unexpected interaction ${JSON.stringify(response.interaction)}`)
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  throw new Error('Unfinished action')
}

const assertRejected = (session: GameSession, id: string, actor = 0) => {
  const before = JSON.stringify(session.getState().state)
  const beforeInteraction = JSON.stringify(session.getState().interaction)
  expect(session.getActionAvailability(actor)[id]).toBe(false)
  expect(session.getAvailableActions(actor).map(action => action.spaceId)).not.toContain(id)
  const response = session.takeAction(actor, id)
  expect(response.ok).toBe(false)
  expect(response.error).toBe('space unavailable')
  expect(JSON.stringify(response.state)).toBe(before)
  expect(JSON.stringify(response.interaction)).toBe(beforeInteraction)
  return response
}

const bonusCases = [
  { card: 'A042_ForestLakeHut', space: 'forest', resource: 'wood', gain: { wood: 1, food: 21 } },
  { card: 'A042_ForestLakeHut', space: 'fishing', resource: 'food', gain: { wood: 1, food: 21 } },
  { card: 'A046_ClawKnife', space: 'sheep-market', resource: 'sheep', gain: { sheep: 1, food: 20 } },
  { card: 'A051_DriftNetBoat', space: 'fishing', resource: 'food', gain: { food: 23 } },
  { card: 'A052_ThrowingAxe', space: 'forest', resource: 'wood', gain: { wood: 1, food: 22 } },
] satisfies Array<{ card: string; space: string; resource: keyof Resource; gain: Partial<Resource> }>

describe('empty accumulation admission', () => {
  it.each(['western-quarry', 'forest', 'fishing'])('rejects empty %s without placing or changing state', id => {
    assertRejected(setup(), id)
  })

  it.each(bonusCases)('$card cannot authorize empty $space', ({ card, space }) => {
    const session = setup({ card })
    spaceOf(session, 'pig-market').resources.boar = 1
    assertRejected(session, space)
  })

  it.each(['before-placement', 'doability-override'])('%s cannot reopen empty collection', mode => {
    const session = setup()
    const listener: CardListenerRegistration = {
      id: '__empty_collection_bonus__', cardIds: ['__empty_collection_bonus__'],
      actions: mode === 'before-placement' ? ['place-farmer'] : ['collect'],
      phases: mode === 'before-placement' ? ['before'] : ['isDoable'],
      handler: () => mode === 'before-placement'
        ? { flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } } }
        : { doable: true },
    }
    session.state.players[0]!.occupationPlayed.push('__empty_collection_bonus__')
    session.withCtx(() => requireActiveCardRegistry('empty collection bonus test').registerListener(listener))
    assertRejected(session, 'forest')
  })

  it.each(bonusCases)('$card keeps its normal bonus on stocked $space', ({ card, space, resource, gain }) => {
    const session = setup({ card })
    spaceOf(session, space).resources[resource] = 1
    spaceOf(session, 'pig-market').resources.boar = 1
    expect(session.getActionAvailability(0)[space]).toBe(true)
    const response = finish(session, session.takeAction(0, space), card)
    expect(response.state.players[0]!.resources).toMatchObject(gain)
    expect(response.state.actionSpaces.find(candidate => candidate.id === space)!.resources[resource]).toBe(0)
    if (card === 'A046_ClawKnife') {
      expect(response.state.futureMeeples.filter(entry => entry.cardId === card)
        .map(entry => ({ round: entry.round, food: entry.resources.food })))
        .toEqual([{ round: 11, food: 1 }, { round: 12, food: 1 }])
    }
  })

  it('collects actual stone from a Forest with no wood', () => {
    const session = setup()
    spaceOf(session, 'forest').resources.stone = 1
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
    expect(spaceOf(session, 'forest').resources.stone).toBe(0)
  })

  it.each(['C039_StudioBoat', 'D116_TreeInspector'])('rejects empty personal accumulation %s', card => {
    assertRejected(setup({ card }), card)
  })

  it.each(['C039_StudioBoat', 'D116_TreeInspector'])('collects from stocked personal accumulation %s', card => {
    const session = setup({ card })
    const resource = card === 'C039_StudioBoat' ? 'food' : 'wood'
    spaceOf(session, card).resources[resource] = 1
    const response = finish(session, session.takeAction(0, card))
    expect(response.state.players[0]!.resources[resource]).toBe(resource === 'food' ? 21 : 1)
    if (card === 'C039_StudioBoat') expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp).toBe(1)
  })

  it('preserves Tree Inspector owner-only admission for a real non-owner turn', () => {
    const session = setup({ card: 'D116_TreeInspector', actor: 1 })
    spaceOf(session, 'D116_TreeInspector').resources.wood = 1
    assertRejected(session, 'D116_TreeInspector', 1)
  })

  it('restores empty accumulation admission after a serialized snapshot', () => {
    const original = setup({ card: 'C039_StudioBoat' })
    const snapshot = original.withCtx(() => serializeState(original.state, {}))
    const restored = new GameSession(rehydrateState(snapshot))
    sessions.push(restored)
    assertRejected(restored, 'forest')
    assertRejected(restored, 'C039_StudioBoat')
  })

  it('forbids empty Riverbank Forest despite its fixed reed gain', () => {
    assertRejected(setup({ players: 5 }), 'riverbank-forest-56')
    const session = setup({ players: 5 })
    spaceOf(session, 'riverbank-forest-56').resources.wood = 1
    const response = session.takeAction(0, 'riverbank-forest-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, reed: 1 })
  })

  it.each(['forest', 'C039_StudioBoat', 'D116_TreeInspector', 'riverbank-forest-56'])('allows an explicitly authorized replacement of empty %s', spaceId => {
    const session = setup({ card: spaceId.startsWith('C039') || spaceId.startsWith('D116') ? spaceId : undefined, players: spaceId === 'riverbank-forest-56' ? 5 : 2 })
    const listener: CardListenerRegistration = {
      id: '__empty_collect_replacement__', cardIds: ['__empty_collect_replacement__'],
      actions: ['collect'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { grain: 1 } } }),
    }
    session.state.players[0]!.occupationPlayed.push('__empty_collect_replacement__')
    session.withCtx(() => requireActiveCardRegistry('empty collection test').registerListener(listener))
    expect(session.getActionAvailability(0)[spaceId]).toBe(true)
    const offered = session.takeAction(0, spaceId)
    const original = optionsOf(offered).find(option => option.labelKey === 'ui.interactionDoNotReplace')
    expect(original).toBeUndefined()
    expect(optionsOf(offered)).toHaveLength(1)
    const replacement = optionsOf(offered).find(option => option.sourceCard === '__empty_collect_replacement__')
    if (!replacement) throw new Error('Missing authorized replacement')
    const response = finish(session, session.resolveChoice(0, replacement.value))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, wood: 0, food: 20, reed: spaceId === 'riverbank-forest-56' ? 1 : 0 })
  })

  it('does not let a collect replacement bypass the personal accumulation owner', () => {
    const session = setup({ card: 'D116_TreeInspector', actor: 1 })
    const listener: CardListenerRegistration = {
      id: '__non_owner_collect_replacement__', cardIds: ['__non_owner_collect_replacement__'],
      actions: ['collect'], phases: ['computeReplace'],
      handler: () => ({ decline: true, alternativeFlow: { type: 'leaf', actionId: 'gain', params: { grain: 1 } } }),
    }
    session.state.players[1]!.occupationPlayed.push('__non_owner_collect_replacement__')
    session.withCtx(() => requireActiveCardRegistry('personal accumulation owner test').registerListener(listener))
    assertRejected(session, 'D116_TreeInspector', 1)
  })

  it('preserves Pet Lover replacement and Riverine Shepherd targeted partial collection', () => {
    const pet = setup({ card: 'D138_PetLover', players: 3 })
    spaceOf(pet, 'sheep-market').resources.sheep = 1
    const petResponse = finish(pet, pet.takeAction(0, 'sheep-market'), 'D138_PetLover')
    expect(petResponse.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 23, grain: 1 })
    expect(spaceOf(pet, 'sheep-market').resources.sheep).toBe(1)

    const riverine = setup({ card: 'A137_RiverineShepherd', players: 3 })
    spaceOf(riverine, 'sheep-market').resources.sheep = 1
    spaceOf(riverine, 'reed-bank').resources.reed = 2
    const partial = finish(riverine, riverine.takeAction(0, 'sheep-market'), 'A137_RiverineShepherd')
    expect(partial.state.players[0]!.resources).toMatchObject({ sheep: 1, reed: 1 })
    expect(spaceOf(riverine, 'reed-bank').resources.reed).toBe(1)
    expect(partial.state.events.some(event => event.type === 'resource.moved'
      && event.sourceCardId === 'A137_RiverineShepherd' && event.from.kind === 'actionSpace'
      && event.from.spaceId === 'reed-bank' && event.resources.reed === 1)).toBe(true)
  })

  it.each([
    { name: 'one available reed', context: { spaceId: 'reed-bank', resource: 'reed', amount: 1 }, allowed: true },
    { name: 'more reed than available', context: { spaceId: 'reed-bank', resource: 'reed', amount: 2 }, allowed: false },
    { name: 'the stocked reed subset', context: { spaceId: 'reed-bank', resourceTypes: ['reed'] }, allowed: true },
    { name: 'an empty food subset despite other goods', context: { spaceId: 'reed-bank', resourceTypes: ['food'] }, allowed: false },
    { name: 'a missing target', context: { spaceId: '__missing__', resource: 'reed', amount: 1 }, allowed: false },
  ])('partial collection checks $name instead of its empty host', ({ context, allowed }) => {
    const session = setup({ configure(state) {
      const forest = state.actionSpaces.find(space => space.id === 'forest')!
      state.actionSpaces.push({
        ...forest, id: '__partial_collect_test__', canBeExecutedByPlayer: () => false,
        resources: { ...forest.resources }, takenBy: [],
        flow: { type: 'seq', children: [{ type: 'leaf', actionId: 'collect', actionContext: context }] },
      })
      const target = state.actionSpaces.find(space => space.id === 'reed-bank')!
      target.resources.reed = 1
      target.resources.clay = 2
    } })
    if (!allowed) {
      assertRejected(session, '__partial_collect_test__')
      return
    }
    const response = session.takeAction(0, '__partial_collect_test__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, clay: 0 })
    expect(spaceOf(session, 'reed-bank').resources).toMatchObject({ reed: 0, clay: 2 })
    expect(spaceOf(session, '__partial_collect_test__').resources.reed).toBe(0)
    expect(response.state.events.some(event => event.type === 'resource.moved'
      && event.from.kind === 'actionSpace' && event.from.spaceId === 'reed-bank'
      && event.resources.reed === 1)).toBe(true)
  })

  it('does not offer an empty Forest for Lasso and rejects a forged extra-placement choice', () => {
    const session = setup({ card: 'B024_Lasso' })
    spaceOf(session, 'sheep-market').resources.sheep = 1
    let response = session.takeAction(0, 'sheep-market')
    for (let step = 0; step < 6 && !optionsOf(response).some(option => option.value === 'grain-seeds'); step++) {
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait') throw new Error('Missing Lasso interaction')
      if (response.interaction.request.kind === 'animal-reorg') {
        response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'audit-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 }] })
      } else {
        const use = optionsOf(response).find(option => option.sourceCard === 'B024_Lasso'
          && option.value !== '__skip__' && option.value !== '__pass__')
        if (!use) throw new Error('Missing Lasso choice')
        response = session.resolveChoice(0, use.value)
      }
    }
    expect(optionsOf(response).map(option => option.value)).toContain('grain-seeds')
    expect(optionsOf(response).map(option => option.value)).not.toContain('forest')
    const before = JSON.stringify(response.state)
    const pendingBefore = JSON.stringify(response.interaction)
    const rejected = session.resolveChoice(0, 'forest')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(JSON.stringify(rejected.interaction)).toBe(pendingBefore)
  })

  it('does not offer an empty Forest for Archway movement at returning home', () => {
    const session = setup({ card: 'D051_Archway', configure(state) {
      state.players.forEach(player => markAllWorkersUsed(state, player))
      const sink = state.actionSpaces.find(space => space.id === '__test-worker-sink__')!
      const worker = sink.takenBy.find(worker => worker.playerId === state.players[0]!.id)!
      sink.takenBy = sink.takenBy.filter(candidate => candidate !== worker)
      state.actionSpaces.find(space => space.id === 'D051_Archway')!.takenBy = [worker]
    } })
    let response = session.performRoundEnd()
    for (let step = 0; step < 6 && !optionsOf(response).some(option => option.value === 'grain-seeds'); step++) {
      expect(response.ok, response.error).toBe(true)
      const use = optionsOf(response).find(option => option.sourceCard === 'D051_Archway'
        && option.value !== '__skip__' && option.value !== '__pass__')
      if (!use) throw new Error(`Missing Archway choice ${JSON.stringify(response.interaction)}`)
      response = session.resolveChoice(0, use.value)
    }
    expect(optionsOf(response).map(option => option.value)).toContain('grain-seeds')
    expect(optionsOf(response).map(option => option.value)).not.toContain('forest')
    const before = JSON.stringify(response.state)
    const pendingBefore = JSON.stringify(response.interaction)
    const rejected = session.resolveChoice(0, 'forest')
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(JSON.stringify(rejected.interaction)).toBe(pendingBefore)
  })
})
