import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { GameSession } from '../game/authoritative-session'
import { isOccupationCardId } from '../../shared/cards/helpers/card-type'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { Engine, ActionRegistry, HookDispatcher, LogStore } from '../../shared/engine'
import { getAllAdHocActions } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { createInternalActionDefinitions } from '../../shared/actions/internal-actions'
import { rehydrateState, serializeSessionSnapshot, serializeState } from '../../shared/session/serialization'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview, GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/A/A039_Chapel'
import '../../shared/cards/B/B042_ForestInn'
import '../../shared/cards/C/C039_StudioBoat'
import '../../shared/cards/C/C104_Collector'
import '../../shared/cards/C/C162_ForestOwner'
import '../../shared/cards/D/D023_PioneeringSpirit'
import '../../shared/cards/D/D170_FoldBuilder'
import '../../shared/cards/A/A162_ForestTallyman'
import '../../shared/cards/D/D051_Archway'
import '../../shared/cards/D/D116_TreeInspector'
import '../../shared/cards/E/E081_AlchemistsLab'
import '../../shared/cards/E/E161_ElderBaker'
import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/E/E118_KindlingGatherer'
import '../../shared/cards/C/C042_RavenousHunger'

const actionHooks = new ActionHookRegistry()

import { ActionHookRegistry } from '../../shared/actions/hooks'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (card: string, actorIndex = 0, round = 6, configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 9216 + actorIndex, configure: state => {
    state.round = round
    state.currentPlayerIndex = actorIndex
    if (isOccupationCardId(card)) state.players[0]!.occupationPlayed = [card]
    else state.players[0]!.minorPlayed = [card]
    state.players.forEach(player => { player.resources.food = 0 })
    state.actionSpaces.push(...createPlayerActionSpaces(state))
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
const preview = (session: GameSession, card: string, actorIndex: number): ChoiceDescriptionPreview | undefined => {
  const registry = new ActionRegistry()
  for (const action of [...session.state.actionSpaces, ...createInternalActionDefinitions(id => registry.get(id)), ...getAllAdHocActions()]) registry.register(action)
  const space = session.state.actionSpaces.find(candidate => candidate.id === card)!
  const player = session.state.players[actorIndex]!
  return Engine.fromAction(card, { registry, hooks: new HookDispatcher(actionHooks), log: new LogStore() }, player.id)
    .describe({ state: session.state, player, space })
}
const effects = (description: ChoiceDescriptionPreview | undefined): ChoiceEffectPreview[] => {
  if (!description) return []
  if (description.kind === 'conditional') return effects(description.body)
  if (description.kind === 'group') return description.parts.flatMap(effects)
  return description.effectPreview?.kind === 'rule' ? effects(description.effectPreview.description)
    : description.effectPreview ? [description.effectPreview] : []
}
const describedActions = (description: ChoiceDescriptionPreview | undefined): Extract<ChoiceDescriptionPreview, { kind: 'action' }>[] => {
  if (!description) return []
  if (description.kind === 'conditional') return describedActions(description.body)
  if (description.kind === 'group') return description.parts.flatMap(describedActions)
  return [description, ...(description.effectPreview?.kind === 'rule' ? describedActions(description.effectPreview.description) : [])]
}

describe('player action spaces share runtime plans with full previews', () => {
  it.each([
    { card: 'A162_ForestTallyman', gain: { clay: 2, wood: 3 } },
    { card: 'D051_Archway', gain: { food: 1 } },
    { card: 'D023_PioneeringSpirit', gain: { vegetable: 1 } },
    { card: 'E081_AlchemistsLab', gain: { wood: 1 } },
    { card: 'E161_ElderBaker', gain: { grain: 3 } },
  ])('attributes $card native rewards to its actual action space and board statistics', ({ card, gain }) => {
    const session = setup(card, 0, 6, state => {
      if (card === 'A162_ForestTallyman') {
        for (const id of ['forest', 'clay-pit']) state.actionSpaces.find(space => space.id === id)!.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
      }
      if (card === 'E081_AlchemistsLab') state.players[0]!.resources.wood = 1
    })
    const before = { ...session.state.players[0]!.resources }
    let response = session.takeAction(0, card)
    expect(response.ok, response.error).toBe(true)
    if (card === 'D023_PioneeringSpirit') {
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') return
      const choice = response.interaction.request.options?.find(option => option.labelKey === 'resources.vegetable')
      expect(choice).toBeDefined()
      response = session.resolveChoice(0, choice!.value)
    }
    expect(response.ok, response.error).toBe(true)
    for (const [resource, amount] of Object.entries(gain)) {
      expect(response.state.players[0]!.resources[resource as keyof typeof before] - before[resource as keyof typeof before]).toBe(amount)
    }
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', from: { kind: 'actionSpace', spaceId: card },
      to: { kind: 'player', playerId: session.state.players[0]!.id }, resources: gain, reason: 'gain', sourceCardId: card,
    }))
    expect(response.state.players[0]!.stats?.resourcesFromBoard).toMatchObject(gain)
    expect(response.state.players[0]!.stats?.resourcesFromCards).toEqual({})
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  })
  it.each(['A162_ForestTallyman', 'E081_AlchemistsLab'])('queues Syrup Tap exactly once for wood obtained from $0', card => {
    const session = setup(card, 0, 6, state => {
      state.players[0]!.minorPlayed.push('E047_SyrupTap')
      state.players[0]!.resources.wood = 1
      for (const id of ['forest', 'clay-pit']) state.actionSpaces.find(space => space.id === id)!.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
    })
    const response = session.takeAction(0, card)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples.filter(entry => entry.cardId === 'E047_SyrupTap')).toEqual([
      expect.objectContaining({ playerId: response.state.players[0]!.id, round: 7, resources: { food: 1 } }),
    ])
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === 'E047_SyrupTap')).toHaveLength(1)
    expect(response.scores).toHaveLength(2)
  })
  it('runs Kindling Gatherer once for the Archway native food, keeping the bonus a card reward', () => {
    const session = setup('D051_Archway', 0, 6, state => { state.players[0]!.occupationPlayed.push('E118_KindlingGatherer') })
    const response = session.takeAction(0, 'D051_Archway')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1 })
    expect(response.state.players[0]!.stats?.resourcesFromBoard).toEqual({ food: 1 })
    expect(response.state.players[0]!.stats?.resourcesFromCards).toEqual({ wood: 1 })
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === 'E118_KindlingGatherer')).toHaveLength(1)
    expect(response.scores).toHaveLength(2)
  })
  it.each([0, 1])('Forest Owner actor %s triggers Syrup Tap once, while the supply reward never triggers the owner', actorIndex => {
    const session = setup('C162_ForestOwner', actorIndex, 6, state => {
      state.players.forEach(player => { player.minorPlayed.push('E047_SyrupTap') })
    })
    const response = session.takeAction(actorIndex, 'C162_ForestOwner')
    expect(response.ok, response.error).toBe(true)
    const actor = response.state.players[actorIndex]!
    expect(actor.resources.wood).toBe(actorIndex === 0 ? 4 : 3)
    expect(actor.stats?.resourcesFromBoard).toEqual({ wood: actorIndex === 0 ? 4 : 3 })
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', from: { kind: 'actionSpace', spaceId: 'C162_ForestOwner' },
      to: { kind: 'player', playerId: actor.id }, reason: 'gain',
    }))
    if (actorIndex === 1) {
      const owner = response.state.players[0]!
      expect(owner.resources.wood).toBe(1)
      expect(owner.stats?.resourcesFromCards).toEqual({ wood: 1 })
      expect(owner.stats?.resourcesFromBoard).toEqual({})
      expect(readCardResourceStats(owner, 'C162_ForestOwner')?.gained).toEqual({ wood: 1 })
      expect(readCardResourceStats(actor, 'C162_ForestOwner')?.gained ?? {}).toEqual({})
      expect(response.state.events).toContainEqual(expect.objectContaining({
        type: 'resource.moved', from: { kind: 'supply' }, to: { kind: 'player', playerId: owner.id }, resources: { wood: 1 },
      }))
    }
    expect(response.state.futureMeeples.filter(entry => entry.cardId === 'E047_SyrupTap')).toEqual([
      expect.objectContaining({ playerId: actor.id, round: 7, resources: { food: 1 } }),
    ])
    expect(response.scores).toHaveLength(2)
  })
  it.each([
    { card: 'D116_TreeInspector', resource: 'wood' as const, pile: 2 },
    { card: 'C039_StudioBoat', resource: 'food' as const, pile: 3 },
  ])('collects the $card pile through the real Ravenous Hunger nested placement', ({ card, resource, pile }) => {
    const session = setup(card, 0, 14, state => {
      state.players[0]!.minorPlayed.push('C042_RavenousHunger')
      state.actionSpaces.forEach(space => { space.roundAvailable = 1 })
      state.actionSpaces.find(space => space.id === card)!.resources[resource] = pile
    })
    let response = session.takeAction(0, 'vegetable-seeds')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = session.resolveChoice(0, 'C042_RavenousHunger')
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find(option => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.map(option => option.value)).toContain(card)
    response = session.resolveChoice(0, card)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = session.resolveChoice(0, 'C042_RavenousHunger')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, [resource]: pile + 1 })
    expect(response.state.actionSpaces.find(space => space.id === card)?.resources[resource]).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === card)?.takenBy).toEqual([
      { playerId: response.state.players[0]!.id, workerId: '2' },
    ])
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', from: { kind: 'actionSpace', spaceId: card }, resources: { [resource]: pile }, reason: 'collect',
    }))
    expect(response.state.players[0]!.stats?.resourcesFromBoard?.[resource]).toBe(pile)
    expect(response.state.players[0]!.stats?.resourcesFromCards?.[resource]).toBe(1)
    if (card === 'C039_StudioBoat') expect(response.state.players[0]!.cardStates[card]?.counters?.bonusVp).toBe(1)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  })
  it('accumulates Studio Boat once through the actual next-round transition', () => {
    const session = setup('C039_StudioBoat', 0, 1)
    session.state.actionSpaces.find(space => space.id === 'C039_StudioBoat')!.resources.food = 3
    session.state.players.forEach(player => { markAllWorkersUsed(session.state, player) })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.state.actionSpaces.find(space => space.id === 'C039_StudioBoat')?.resources.food).toBe(4)
    expect(response.state.events.filter(event => event.type === 'action.accumulated' && event.spaceId === 'C039_StudioBoat')).toEqual([
      expect.objectContaining({ resources: { food: 1 } }),
    ])
    expect(response.scores).toHaveLength(2)
  })
  it('keeps the four-player Studio Boat boundary and accumulates only the global Traveling Players pile', () => {
    const session = createWorkSession({ seed: 9239, options: { playerCount: 4 }, configure: state => {
      state.round = 1
      state.players[0]!.minorPlayed = ['C039_StudioBoat']
      state.actionSpaces.push(...createPlayerActionSpaces(state))
      state.actionSpaces.find(space => space.id === 'traveling-players')!.resources.food = 3
    } })
    sessions.push(session)
    expect(session.state.players).toHaveLength(4)
    expect(session.state.actionSpaces.some(space => space.id === 'C039_StudioBoat')).toBe(false)
    session.state.players.forEach(player => { markAllWorkersUsed(session.state, player) })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.state.actionSpaces.some(space => space.id === 'C039_StudioBoat')).toBe(false)
    expect(response.state.actionSpaces.find(space => space.id === 'traveling-players')?.resources.food).toBe(4)
    expect(response.state.events.filter(event => event.type === 'action.accumulated' && event.spaceId === 'traveling-players')).toEqual([
      expect.objectContaining({ resources: { food: 1 } }),
    ])
    expect(response.state.events.some(event => event.type === 'action.accumulated' && event.spaceId === 'C039_StudioBoat')).toBe(false)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(4)
  })
  it('describes and performs the Chapel guest payment to its owner and three bonus points', () => {
    const session = setup('A039_Chapel', 1)
    session.state.players[1]!.resources.grain = 2
    const before = JSON.stringify(session.state)
    expect(effects(preview(session, 'A039_Chapel', 1))).toContainEqual(expect.objectContaining({
      kind: 'resourceTransfer', resources: { grain: 1 }, payer: expect.objectContaining({ playerId: session.state.players[1]!.id }),
      recipients: [expect.objectContaining({ playerId: session.state.players[0]!.id })],
    }))
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.takeAction(1, 'A039_Chapel')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.cardStates.A039_Chapel?.counters?.bonusVp).toBe(3)
    expect(response.scores).toHaveLength(2)
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === 'A039_Chapel')).toBe(true)
  })
  it('keeps Forest Inn guest payment and all exchange branches, then performs the selected actual exchange', () => {
    const session = setup('B042_ForestInn', 1)
    session.state.players[1]!.resources.food = 2
    session.state.players[1]!.resources.wood = 9
    const before = JSON.stringify(session.state)
    const description = JSON.stringify(preview(session, 'B042_ForestInn', 1))
    expect(description).toContain('"wood":5')
    expect(description).toContain('"wood":7')
    expect(description).toContain('"wood":9')
    expect(JSON.stringify(session.state)).toBe(before)
    const started = session.takeAction(1, 'B042_ForestInn')
    expect(started.ok, started.error).toBe(true)
    expect(started.interaction.stateId).toBe('wait')
    if (started.interaction.stateId !== 'wait') return
    const choice = started.interaction.request.options?.find(option => effects(option.descriptionPreview).some(effect => (effect.kind === 'resourceExchange' || effect.kind === 'payment') && effect.resourcesPaid?.wood === 5))
    expect(choice, JSON.stringify(started.interaction)).toBeDefined()
    const finished = session.resolveChoice(1, choice!.value)
    expect(finished.ok, finished.error).toBe(true)
    expect(finished.state.players[1]!.resources).toMatchObject({ wood: 12, food: 3 })
    expect(finished.state.players[0]!.resources.food).toBe(1)
  })
  it('shows exact Collector distinct-choice count and begging from the same selection plan, without consuming on preview or invalid input', () => {
    const session = setup('C104_Collector')
    session.state.players[0]!.cardStates.C104_Collector = { extraData: { used: 1 } }
    const before = JSON.stringify(session.state)
    expect(effects(preview(session, 'C104_Collector', 0))).toContainEqual({
      kind: 'resourceSetSelection', choices: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'],
      minDistinct: 7, maxDistinct: 7, resourcesPerChoice: 1, extraGain: { begging: 1 },
    })
    const base = serializeState(session.state, {}).actionSpaces.find(space => space.id === 'C104_Collector')?.baseDescriptionPreview
    expect(effects(base)).toContainEqual({
      kind: 'resourceSetSelection', choices: ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'],
      minDistinct: 6, maxDistinct: 9, quantitiesByUse: [6, 7, 8, 9], resourcesPerChoice: 1, extraGain: { begging: 1 },
    })
    expect(JSON.stringify(session.state)).toBe(before)
    const started = session.takeAction(0, 'C104_Collector')
    expect(started.ok, started.error).toBe(true)
    expect(started.interaction).toMatchObject({ stateId: 'wait', promptParams: { needed: 7 } })
    const invalid = session.resolveChoice(0, 'wood,clay,wood')
    expect(invalid.ok, invalid.error).toBe(true)
    expect(invalid.state.players[0]!.cardStates.C104_Collector?.extraData?.used).toBe(1)
    expect(invalid.state.players[0]!.resources.begging).toBe(0)
    const saved = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
    sessions.push(restored)
    expect(restored.getState().interaction).toMatchObject({ stateId: 'wait', promptParams: { needed: 7 } })
    const finished = restored.resolveChoice(0, 'wood,clay,reed,stone,food,grain,vegetable')
    expect(finished.ok, finished.error).toBe(true)
    expect(finished.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, reed: 1, stone: 1, food: 1, grain: 1, vegetable: 1, begging: 1 })
    expect(finished.state.players[0]!.cardStates.C104_Collector?.extraData?.used).toBe(2)
    expect(finished.scores).toHaveLength(2)
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.cardStates.C104_Collector?.extraData?.used).toBe(1)
    expect(undone.state.players[0]!.resources.begging).toBe(0)
    expect(undone.state.actionSpaces.find(space => space.id === 'C104_Collector')?.takenBy).toEqual([])
  })
  it('uses actual Pioneering Spirit round branches and resolves the generated public resource choices', () => {
    const session = setup('D023_PioneeringSpirit')
    const description = JSON.stringify(preview(session, 'D023_PioneeringSpirit', 0))
    expect(description).toContain('"vegetable":1')
    expect(description).toContain('"boar":1')
    expect(description).toContain('"cattle":1')
    expect(description).not.toContain('renovate-house')
    const base = serializeState(session.state, {}).actionSpaces.find(space => space.id === 'D023_PioneeringSpirit')?.baseDescriptionPreview
    expect(JSON.stringify(base)).toContain('ui.ruleRoundRange')
    expect(JSON.stringify(base)).toContain('"start":3,"end":5')
    expect(JSON.stringify(base)).toContain('"start":6,"end":8')
    const started = session.takeAction(0, 'D023_PioneeringSpirit')
    expect(started.ok, started.error).toBe(true)
    expect(started.interaction.stateId).toBe('wait')
    if (started.interaction.stateId !== 'wait') return
    const choice = started.interaction.request.options?.find(option => option.labelKey === 'resources.vegetable')
    expect(choice?.sourceCard).toBe('D023_PioneeringSpirit')
    const finished = session.resolveChoice(0, choice!.value)
    expect(finished.ok, finished.error).toBe(true)
    expect(finished.state.players[0]!.resources.vegetable).toBe(1)
  })
  it('derives the Fold Builder guest fee and fence target from its execution plan, then fences and receives the sheep', () => {
    const session = setup('D170_FoldBuilder', 1)
    session.state.players[1]!.resources.food = 2
    session.state.players[1]!.resources.wood = 4
    const before = JSON.stringify(session.state)
    const plan = effects(preview(session, 'D170_FoldBuilder', 1))
    expect(plan).toContainEqual(expect.objectContaining({ kind: 'resourceTransfer', resources: { food: 1 },
      payer: expect.objectContaining({ playerId: session.state.players[1]!.id }),
      recipients: [expect.objectContaining({ playerId: session.state.players[0]!.id })],
    }))
    expect(plan).toContainEqual(expect.objectContaining({ kind: 'fencePlan' }))
    expect(plan).toContainEqual(expect.objectContaining({ kind: 'resourceExchange', resourcesGained: { sheep: 1 } }))
    expect(JSON.stringify(session.state)).toBe(before)
    const offered = session.takeAction(1, 'D170_FoldBuilder')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.stateId).toBe('wait')
    expect(offered.state.players[0]!.resources.food).toBe(1)
    expect(offered.state.players[1]!.resources.food).toBe(1)
    const fenced = session.commitSelectionChoice(1, { edges: ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'], extraWood: 0 })
    expect(fenced.ok, fenced.error).toBe(true)
    expect(fenced.state.players[1]!.pastures).toHaveLength(1)
    expect(fenced.state.players[1]!.resources).toMatchObject({ wood: 0, sheep: 1, food: 1 })
    expect(fenced.state.players[0]!.resources.food).toBe(1)
    expect(fenced.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === 'D170_FoldBuilder')).toBe(true)
  })
  it('keeps Studio Boat collection and owner bonus together, and Forest Owner rewards attributed to each actual player', () => {
    const studio = setup('C039_StudioBoat')
    studio.state.actionSpaces.find(space => space.id === 'C039_StudioBoat')!.resources.food = 3
    expect(JSON.stringify(preview(studio, 'C039_StudioBoat', 0))).toContain('"food":3')
    expect(JSON.stringify(preview(studio, 'C039_StudioBoat', 0))).toContain('"bonusVp":1')
    const collected = studio.takeAction(0, 'C039_StudioBoat')
    expect(collected.ok, collected.error).toBe(true)
    expect(collected.state.players[0]!.resources.food).toBe(3)
    expect(collected.state.players[0]!.cardStates.C039_StudioBoat?.counters?.bonusVp).toBe(1)
    expect(collected.state.actionSpaces.find(space => space.id === 'C039_StudioBoat')?.resources.food).toBe(0)
    const forest = setup('C162_ForestOwner', 1)
    expect(describedActions(preview(forest, 'C162_ForestOwner', 1))).toContainEqual(expect.objectContaining({
      kind: 'action', actor: expect.objectContaining({ playerId: forest.state.players[0]!.id, index: 0 }),
      effectPreview: { kind: 'resourceExchange', resourcesGained: { wood: 1 } },
    }))
    const reward = forest.takeAction(1, 'C162_ForestOwner')
    expect(reward.ok, reward.error).toBe(true)
    expect(reward.state.players[1]!.resources.wood).toBe(3)
    expect(reward.state.players[0]!.resources.wood).toBe(1)
  })
})
