import { afterEach, describe, expect, it } from 'vitest'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { GameSession } from '../game/authoritative-session'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { collectPublicEventFeedback } from '../../shared/events/public-event-presentation'
import { eventsToLogEntries } from '../../shared/events/log-mapper'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { emptyResources } from '../../shared/session/state-bootstrap'
import type { SeasonId } from '../../shared/seasons/types'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setupPreparation = (season: SeasonId, options: { round?: number; enabled?: boolean; configure?: (state: GameState) => void } = {}) => {
  const previous: Record<SeasonId, SeasonId> = { winter: 'autumn', spring: 'winter', summer: 'spring', autumn: 'summer' }
  const session = createWorkSession({ seed: 1377, options: { playerCount: 2, enableThroughTheSeasons: options.enabled ?? true }, configure: state => {
    state.round = (options.round ?? 11) - 1
    state.throughTheSeasons = { startSeason: previous[season], currentSeason: previous[season] }
    state.roundActionOrder = ['major-improvement', 'grain-utilization', 'sheep-market', 'fencing', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment']
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources = { ...emptyResources, food: 50 }
      markAllWorkersUsed(state, player)
    }
    for (const space of state.actionSpaces) {
      space.resources = { ...emptyResources }
      space.gainPerRound = { ...space.gainPerRound }
    }
    options.configure?.(state)
  } })
  sessions.push(session)
  return session
}

describe('seasonal preparation accumulation logs', () => {
  it.each([
    ['winter', 'clay-pit', 'clay', 1, -1, 0],
    ['winter', 'reed-bank', 'reed', 1, -1, 0],
    ['spring', 'forest', 'wood', 3, -1, 2],
    ['spring', 'western-quarry', 'stone', 1, 1, 2],
    ['spring', 'eastern-quarry', 'stone', 1, 1, 2],
    ['summer', 'clay-pit', 'clay', 1, 1, 2],
    ['summer', 'western-quarry', 'stone', 1, -1, 0],
    ['summer', 'eastern-quarry', 'stone', 1, -1, 0],
    ['summer', 'fishing', 'food', 1, 1, 2],
    ['autumn', 'forest', 'wood', 3, 1, 4],
    ['autumn', 'reed-bank', 'reed', 1, 1, 2],
  ] as const)('%s explains %s normal and actual seasonal accumulation', (season, spaceId, resource, normal, adjustment, net) => {
    const session = setupPreparation(season, { configure: state => {
      const space = state.actionSpaces.find(entry => entry.id === spaceId)
      if (!space) throw new Error(`Missing ${spaceId}`)
      space.resources[resource] = 3
    } })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    const event = response.state.events.find(entry => entry.type === 'action.accumulated' && entry.round === 11 && entry.spaceId === spaceId)
    expect(event).toMatchObject({ resources: net ? { [resource]: net } : {}, normalResources: { [resource]: normal }, seasonalAdjustments: [{ season, resources: { [resource]: adjustment } }] })
    expect(response.state.actionSpaces.find(space => space.id === spaceId)?.resources[resource]).toBe(3 + net)
    if (!event) throw new Error('Missing accumulation event')
    const logs = eventsToLogEntries([event], { playerNames: {}, actionNames: { [spaceId]: `actions.${spaceId}.name` } })
    expect(logs).toHaveLength(1)
    expect(response.state.log.filter(entry => entry.sourceEvent?.occurrenceId === event.occurrenceId)).toEqual(logs)
    const feedback = collectPublicEventFeedback([event], 'en')
    expect(feedback.notifications).toHaveLength(net ? 1 : 0)
    expect(feedback.resourceAnimations).toHaveLength(net ? 1 : 0)
    if (net) expect(feedback.resourceAnimations[0]?.resources).toEqual({ [resource]: net })
    expect(response.state.players.map(player => player.resources)).toEqual([{ ...emptyResources, food: 50 }, { ...emptyResources, food: 50 }])
    expect(response.scores).toHaveLength(2)
  })

  it.each([2, 6, 7, 10, 11] as const)('only adjusts open quarries at round %i', round => {
    const session = setupPreparation('spring', { round })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    const quarryEvents = response.state.events.filter(event => event.type === 'action.accumulated' && event.round === round && ['western-quarry', 'eastern-quarry'].includes(event.spaceId))
    expect(quarryEvents.map(event => event.type === 'action.accumulated' ? event.spaceId : '')).toEqual(round < 7 ? [] : round < 11 ? ['western-quarry'] : ['western-quarry', 'eastern-quarry'])
    expect(response.state.actionSpaces.find(space => space.id === 'eastern-quarry')?.resources.stone).toBe(round < 11 ? 0 : 2)
  })

  it('records the clamped actual seasonal difference and leaves unaffected resources without explanations', () => {
    const session = setupPreparation('winter', { configure: state => {
      const reed = state.actionSpaces.find(space => space.id === 'reed-bank')
      if (!reed) throw new Error('Missing reed bank')
      reed.gainPerRound.reed = 0.5
    } })
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.find(event => event.type === 'action.accumulated' && event.spaceId === 'reed-bank')).toMatchObject({ resources: {}, normalResources: { reed: 0.5 }, seasonalAdjustments: [{ season: 'winter', resources: { reed: -0.5 } }] })
    const forest = response.state.events.find(event => event.type === 'action.accumulated' && event.spaceId === 'forest')
    expect(forest).toMatchObject({ resources: { wood: 3 } })
    expect(forest).not.toHaveProperty('seasonalAdjustments')
  })

  it('does not invent seasonal adjustments when the variant is disabled or the affected growth is zero', () => {
    for (const enabled of [true, false]) {
      const session = setupPreparation('winter', { enabled, configure: state => {
        const reed = state.actionSpaces.find(space => space.id === 'reed-bank')
        if (!reed) throw new Error('Missing reed bank')
        reed.gainPerRound.reed = 0
      } })
      const response = session.performRoundEnd()
      expect(response.ok, response.error).toBe(true)
      expect(response.state.events.filter(event => event.type === 'action.accumulated' && event.spaceId === 'reed-bank')).toEqual([])
      if (!enabled) expect(response.state.events.filter(event => event.type === 'action.accumulated').every(event => !('seasonalAdjustments' in event))).toBe(true)
    }
  })

  it('records first-round seasonal facts and preserves them through authoritative snapshot recovery', () => {
    const session = createOpeningSession({ seed: 2, options: { playerCount: 2, deckIds: ['A'], enableThroughTheSeasons: true }, expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } } })
    sessions.push(session)
    expect(session.state.throughTheSeasons?.currentSeason).toBe('winter')
    const event = session.state.events.find(event => event.type === 'action.accumulated' && event.spaceId === 'reed-bank')
    expect(event).toMatchObject({ round: 1, resources: {}, normalResources: { reed: 1 }, seasonalAdjustments: [{ season: 'winter', resources: { reed: -1 } }] })
    const saved = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
    const restored = new GameSession(1377, undefined, { playerCount: 2 })
    sessions.push(restored)
    const response = restored.loadState(rehydrateState(saved))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events).toEqual(session.state.events)
    expect(response.state.log).toEqual(session.state.log)
    expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')?.resources.reed).toBe(0)
    expect(response.scores).toEqual(session.getState().scores)
  })

  it('keeps settled accumulation once when the next action is undone, retried and restored', () => {
    const session = setupPreparation('summer')
    const prepared = session.performRoundEnd()
    expect(prepared.ok, prepared.error).toBe(true)
    const settled = structuredClone(prepared.state.events.filter(event => event.type === 'action.accumulated'))
    const log = structuredClone(prepared.state.log.filter(entry => entry.key === 'log.actionAccumulated'))
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.events.filter(event => event.type === 'action.accumulated')).toEqual(settled)
    expect(undone.state.log.filter(entry => entry.key === 'log.actionAccumulated')).toEqual(log)
    expect(session.takeAction(0, 'day-laborer').ok).toBe(true)
    const restored = new GameSession(1377, undefined, { playerCount: 2 })
    sessions.push(restored)
    const saved = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
    const response = restored.loadState(rehydrateState(saved))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.events.filter(event => event.type === 'action.accumulated')).toEqual(settled)
    expect(response.state.log.filter(entry => entry.key === 'log.actionAccumulated')).toEqual(log)
    expect(response.state.actionSpaces.find(space => space.id === 'western-quarry')?.resources.stone).toBe(0)
  })

  it('keeps winter reed accumulation as one explained zero-result settlement', () => {
    const session = setupPreparation('winter')
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(11)
    expect(response.state.roundPhase).toBe('work')
    expect(response.state.throughTheSeasons?.currentSeason).toBe('winter')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')?.resources.reed).toBe(0)
    const events = response.state.events.filter(event => event.type === 'action.accumulated' && event.round === 11 && event.spaceId === 'reed-bank')
    expect(events).toEqual([expect.objectContaining({ resources: {}, normalResources: { reed: 1 }, seasonalAdjustments: [{ season: 'winter', resources: { reed: -1 } }] })])
    expect(response.state.log.filter(entry => entry.key === 'log.actionAccumulated' && entry.params?.action === 'actions.reed-bank.name')).toEqual([
      expect.objectContaining({ params: { action: 'actions.reed-bank.name', resources: {}, normalResources: { reed: 1 }, seasonalAdjustments: [{ season: 'winter', resources: { reed: -1 } }] } }),
    ])
    expect(response.state.players.map(player => player.resources)).toEqual([{ ...emptyResources, food: 50 }, { ...emptyResources, food: 50 }])
    expect(response.scores).toHaveLength(2)
  })
})
