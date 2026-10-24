import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { emptyResources } from '../../shared/session/state-bootstrap'
import type { GameState } from '../../shared/contract/types'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { descriptionEffects } from './_helpers/choice-description'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/A/A088_HedgeKeeper'
import '../../shared/cards/E/E074_AshTrees'
import '../../shared/cards/E/E149_MidnightFencer'

const sevenFences = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-1', 'V-0-2']
const fourFences = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const sessions: ReturnType<typeof createWorkSession>[] = []

afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })

const springSession = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({
    seed: 353,
    options: { enableThroughTheSeasons: true },
    configure: state => {
      state.round = 7
      state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
      state.players.forEach(player => {
        player.resources = { ...emptyResources, wood: 10 }
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
      })
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const restore = (session: GameSession) => {
  const snapshot = serializeSessionSnapshot(session.state, session)
  const recovered = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(recovered)
  expect(recovered.getState().interaction).toEqual(session.getState().interaction)
  expect(recovered.state.events).toEqual(session.state.events)
  expect(recovered.state.log).toEqual(session.state.log)
  expect(recovered.getState().scores).toEqual(session.getState().scores)
  return recovered
}

describe('spring fence payment explanation', () => {
  it('records the actual spring saving beside the five wood paid for seven fences', () => {
    const session = springSession()
    const other = structuredClone(session.state.players[1])
    const start = session.takeAction(0, 'fencing')
    expect(start.ok, start.error).toBe(true)
    expect(start.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })

    const done = session.commitSelectionChoice(0, { edges: sevenFences, extraWood: 0 })
    expect(done.ok, done.error).toBe(true)
    expect(done.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(done.state.players[0]!.fenceSegments).toHaveLength(7)
    expect(done.state.players[0]!.resources.wood).toBe(5)
    expect(done.state.players[1]).toEqual(other)
    expect(done.state.events.filter(event => event.type === 'resource.paid')).toEqual([
      expect.objectContaining({
        paymentFor: 'fencing', resources: { wood: 5 },
        seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }],
      }),
    ])
    const fence = done.state.events.find(event => event.type === 'farm.fenceBuilt')
    const payment = done.state.events.find(event => event.type === 'resource.paid')
    expect(fence?.type === 'farm.fenceBuilt' && fence.paymentId).toEqual(expect.any(String))
    expect(payment?.paymentId).toBe(fence?.type === 'farm.fenceBuilt' && fence.paymentId)
    expect(done.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail',
      params: expect.objectContaining({ detailParts: {
        costs: { wood: 5 },
        effects: { fencing: 7 },
        seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }],
      } }),
    }))
    expect(done.state.log.filter(entry => entry.key === 'log.actionDetail')).toHaveLength(1)
    expect(Object.keys(done.state.players[0]!.cardStates)).not.toContain('through-the-seasons:spring')
    expect(done.scores).toEqual(session.getState().scores)
  })

  it.each([
    { reserve: 2, saved: 1 },
    { reserve: 3, saved: 0 },
    { reserve: 4, saved: 0 },
  ])('records only $saved wood of spring saving after $reserve reserved fences', ({ reserve, saved }) => {
    const session = springSession(state => {
      state.players[0]!.minorPlayed = ['E074_AshTrees']
      state.players[0]!.cardStates.E074_AshTrees = { counters: { fences: reserve } }
    })
    const offered = session.takeAction(0, 'fencing')
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait') throw new Error('expected reserve choice')
    const useReserve = offered.interaction.request.options.find(option =>
      descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'fenceReserve' && effect.amount === reserve),
    )
    if (!useReserve) throw new Error('missing reserve choice')
    expect(session.resolveChoice(0, useReserve.value).ok).toBe(true)
    const done = session.commitSelectionChoice(0, { edges: fourFences, extraWood: 0 })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.wood).toBe(10 - (4 - reserve - saved))
    expect(done.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences).toBe(0)
    expect(done.state.players[0]!.fenceSegments).toHaveLength(4)
    const paid = done.state.events.filter(event => event.type === 'resource.paid')
    expect(paid).toHaveLength(1)
    expect(paid[0]!.seasonalAdjustments).toEqual(saved ? [{ season: 'spring', resources: { wood: -saved } }] : undefined)
    expect(Object.keys(done.state.players[0]!.cardStates).some(id => id.startsWith('through-the-seasons:'))).toBe(false)
  })

  it.each(['summer', 'disabled'] as const)('does not attribute a spring saving when %s', mode => {
    const session = springSession(state => {
      if (mode === 'summer') state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'summer' }
      else state.enableThroughTheSeasons = false
    })
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { edges: fourFences, extraWood: 0 })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.wood).toBe(6)
    expect(done.state.events.filter(event => event.type === 'resource.paid'))
      .toEqual([expect.objectContaining({ resources: { wood: 4 } })])
    expect(done.state.events.find(event => event.type === 'resource.paid')?.seasonalAdjustments).toBeUndefined()
  })

  it('preserves the cost saving when a card trade covers the remaining fee', () => {
    const session = springSession(state => { state.players[0]!.occupationPlayed = ['A088_HedgeKeeper'] })
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { edges: fourFences, extraWood: 0 })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.wood).toBe(10)
    expect(done.state.events.filter(event => event.type === 'resource.paid')).toEqual([
      expect.objectContaining({ resources: {}, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }] }),
    ])
    expect(done.state.events.filter(event => event.type === 'resource.moved')).toHaveLength(0)
    expect(done.state.log.filter(entry => entry.key === 'log.actionDetail')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ detailParts: expect.objectContaining({
        costs: {}, effects: { fencing: 4 }, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }],
      }) }) }),
    ])
    expect(done.state.players.every(player => !Object.keys(player.cardStates).some(id => id.startsWith('through-the-seasons:')))).toBe(true)
  })

  it('preserves pending and committed explanations through recovery, rejects invalid input, and undoes before one retry', () => {
    let session = springSession()
    const before = undoRuleSnapshot(session.getState())
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    session = restore(session)
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { edges: sevenFences, extraWood: 0 }))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { edges: ['H-0-0'], extraWood: 0 }))
    expect(session.commitSelectionChoice(0, { edges: sevenFences, extraWood: 0 }).ok).toBe(true)
    session = restore(session)
    assertUndoRestored(before, session.undoAction())
    expect(session.state.events.filter(event => event.type === 'resource.paid')).toHaveLength(0)
    expect(session.takeAction(0, 'fencing').ok).toBe(true)
    const done = session.commitSelectionChoice(0, { edges: sevenFences, extraWood: 0 })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.events.filter(event => event.type === 'resource.paid')).toEqual([
      expect.objectContaining({ resources: { wood: 5 }, seasonalAdjustments: [{ season: 'spring', resources: { wood: -2 } }] }),
    ])
  })

  it('does not attribute free borrowed fences to spring', () => {
    const session = springSession(state => {
      state.round = 14
      state.players.forEach(player => { player.resources.food = 20; markAllWorkersUsed(state, player) })
      const owner = state.players[0]!
      owner.occupationPlayed = ['E149_MidnightFencer']
      owner.fenceSegments = fourFences.slice(0, 2).map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
    })
    const offered = session.performRoundEnd()
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait') throw new Error('expected borrowed fence offer')
    const accept = offered.interaction.request.options.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('missing accept option')
    expect(session.resolveChoice(0, accept.value).ok).toBe(true)
    const done = session.commitSelectionChoice(0, { edges: fourFences.slice(2), extraWood: 0,
      fenceSources: { 'V-0-0': 'p2', 'V-0-1': 'p2' } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(done.state.players[0]!.resources.wood).toBe(10)
    expect(done.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'fencing'))
      .toHaveLength(0)
  })
})
