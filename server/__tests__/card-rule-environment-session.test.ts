import { beforeEach, describe, expect, it } from 'vitest'
import { getActiveCardRegistry, setActiveCardRegistry, withActiveRegistry } from '../../shared/cards/active-registry'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getListenerById, getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import { getCardModifiers } from '../../shared/cards/card-modifiers'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { CardRegistry } from '../../shared/cards/registry'
import { getMinorImprovementEffectiveCost, getPrintedImprovementCostCandidates } from '../../shared/actions/helpers/improvement-helpers'
import { getCardDefinition } from '../../shared/cards/catalog'
import { getCurrentSessionContext, type CustomCardData } from '../../shared/cards/session-card-context'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { validateAndCompileCustomCode } from '../custom-code/engine'
import { createIsolatedGameSession } from '../game/custom-session-executor'
import { handleLocalSandboxRequest, LocalSandboxCore } from '../../client/local-sandbox/worker-core'
import { LOCAL_SANDBOX_SCHEMA_VERSION } from '../../client/local-sandbox/protocol'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD_ID = 'CUSTOM_SessionRuleEnvironment'
const customCard = (discount: number, reward: number): CustomCardData => {
  const source = `
const CARD_ID = '${CARD_ID}'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Session Rule Environment' })
const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
  handler: () => ({ flow: { type: 'seq', children: [
    { type: 'leaf', actionId: 'occupation', sourceCard: CARD_ID, params: { exactCost: { food: 3 } } },
    gainLeaf(CARD_ID, { grain: ${reward} }),
  ] } }) }] }
`
  const compiled = validateAndCompileCustomCode(source, CARD_ID)
  if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
  return {
    cardType: 'minor',
    cardJson: { id: CARD_ID, name: 'Session Rule Environment', deck: 'CUSTOM', number: 0, desc: [],
      modifier: { type: 'bonus', cardId: CARD_ID, appliesTo: ['occupation'], discount: { food: discount } } },
    compiledCode: compiled.compiledCode,
    codeManifest: compiled.manifest,
    effectCode: source,
  }
}

const configuredSession = (card: CustomCardData) => createWorkSession({
  customCards: [card],
  configure: state => {
    state.players[0]!.minorPlayed = [CARD_ID]
    state.players[0]!.occupationHand = ['A102_Grocer', 'A118_Treegardener']
    Object.assign(state.players[0]!.resources, { food: 10, grain: 0, wood: 0 })
    state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
  },
})

// These tests deliberately have no ambient rule environment. Session commands
// must bind their own registry; unrelated Sessions cannot supply a default.
beforeEach(() => setActiveCardRegistry(null))

describe('Session card rule environment', () => {
  it('creates and queries two-player games without publishing their card rules', async () => {
    const first = createWorkSession({ seed: 42 })
    expect(first.getState().state.players).toHaveLength(2)
    expect(getActiveCardRegistry()).toBeNull()
    expect(() => getCardEffect('B038_FutureBuildingSite')).toThrow('no active CardRegistry')

    const second = createWorkSession({ seed: 43 })
    expect(second.getAvailableActions(0)).not.toHaveLength(0)
    await Promise.resolve()
    expect(getActiveCardRegistry()).toBeNull()
    expect(() => getCardEffect('B038_FutureBuildingSite')).toThrow('no active CardRegistry')
    first.dispose()
    second.dispose()
  })

  it('distinguishes missing rule environments from valid empty registries and metadata', () => {
    const session = createWorkSession({ seed: 42 })
    const state = session.getState().state
    const player = state.players[0]!
    const card = { id: 'TEST_NoEffect', name: 'No effect', deck: 'test', number: 1, desc: [], cost: { wood: 2 } }
    const lookups = [
      () => getCardEffect(card.id),
      () => getRegisteredCardListeners(),
      () => getListenerById('missing-listener'),
      () => getCardModifiers(card.id),
      () => meetsCardPrerequisites(player, card, state.round, state),
      () => getPrintedImprovementCostCandidates(state, player, card.id),
      () => getMinorImprovementEffectiveCost(state, player, card),
    ]
    for (const lookup of lookups) expect(lookup).toThrow('no active CardRegistry')

    const registry = new CardRegistry()
    registry.loadImpl(card.id, { prerequisiteCheck: () => true })
    withActiveRegistry(registry, () => {
      expect(getCardEffect(card.id)).toBeNull()
      expect(getRegisteredCardListeners()).toEqual([])
      expect(getListenerById('missing-listener')).toBeUndefined()
      expect(getCardModifiers(card.id)).toEqual([])
      expect(meetsCardPrerequisites(player, card, state.round, state)).toBe(true)
      expect(getMinorImprovementEffectiveCost(state, player, card)).toEqual({ wood: 2 })
      expect(getPrintedImprovementCostCandidates(state, player, 'Major_Fireplace1')).toEqual([{ clay: 2 }])
    })
    expect(getCardDefinition('B038_FutureBuildingSite')?.name).toBeDefined()
    expect(getActiveCardRegistry()).toBeNull()
    session.dispose()
  })

  it('rehydrates before rebuilding a custom card modifier in its restored Session', () => {
    const card = customCard(1, 2)
    const source = configuredSession(card)
    const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(source.state, source)))
    source.dispose()
    const restored = new GameSession(rehydrateState(snapshot), [card])
    expect(getActiveCardRegistry()).toBeNull()
    const offered = restored.takeAction(0, 'forest')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    const response = restored.resolveChoice(0, 'A102_Grocer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
    expect(restored.cardWarnings).toEqual([])
    restored.dispose()
  })

  it.each([false, true])('isolates matching custom IDs through payment, undo and load, reversed=%s', reversed => {
    const cards = [customCard(1, 2), customCard(2, 4)]
    const creationOrder = reversed ? [1, 0] : [0, 1]
    const sessions = new Map(creationOrder.map(index => [index, configuredSession(cards[index]!)]))
    const first = sessions.get(0)!, second = sessions.get(1)!
    try {
      const initial = JSON.parse(JSON.stringify(serializeSessionSnapshot(first.state, first)))
      const beforeQueries = JSON.stringify([first.state, second.state])
      for (const session of [first, second, first]) {
        expect(session.getAvailableActions(0).map(action => action.spaceId)).toContain('forest')
        session.getActionAvailability(0)
      }
      expect(JSON.stringify([first.state, second.state])).toBe(beforeQueries)

      for (const session of [first, second]) {
        const pending = session.takeAction(0, 'forest')
        expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
      }
      const firstPaid = first.resolveChoice(0, 'A102_Grocer')
      expect(firstPaid.ok, firstPaid.error).toBe(true)
      expect(firstPaid.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
      const secondPaid = second.resolveChoice(0, 'A102_Grocer')
      expect(secondPaid.ok, secondPaid.error).toBe(true)
      expect(secondPaid.state.players[0]!.resources).toMatchObject({ food: 9, grain: 4, wood: 3 })

      second.dispose()
      const undone = first.undoAction()
      expect(undone.ok, undone.error).toBe(true)
      expect(undone.state.players[0]!.resources).toMatchObject({ food: 10, grain: 0, wood: 0 })
      expect(first.takeAction(0, 'forest').ok).toBe(true)
      expect(first.resolveChoice(0, 'A102_Grocer').state.players[0]!.resources)
        .toMatchObject({ food: 8, grain: 2, wood: 3 })

      expect(first.loadState(rehydrateState(initial)).ok).toBe(true)
      expect(first.takeAction(0, 'forest').ok).toBe(true)
      expect(first.resolveChoice(0, 'A102_Grocer').state.players[0]!.resources)
        .toMatchObject({ food: 8, grain: 2, wood: 3 })
      expect(first.cardWarnings).toEqual([])
      expect(getActiveCardRegistry()).toBeNull()
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('restores a Workshop pending choice and settles payment and reward only once', () => {
    const card = customCard(1, 2)
    const original = configuredSession(card)
    const pending = original.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(
      serializeSessionSnapshot(pending.state, original),
    ))), [card])
    try {
      expect(restored.getState().interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
      const completed = restored.resolveChoice(0, 'A102_Grocer')
      expect(completed.ok, completed.error).toBe(true)
      expect(completed.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
      expect(completed.state.events.filter(event => event.type === 'resource.moved' && event.resources.grain === 2))
        .toHaveLength(1)
      const duplicate = restored.resolveChoice(0, 'A102_Grocer')
      expect(duplicate.ok).toBe(false)
      expect(duplicate.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
      expect(original.getState().state.players[0]!.resources).toMatchObject({ food: 10, grain: 0, wood: 3 })
      expect(getActiveCardRegistry()).toBeNull()
    } finally {
      original.dispose()
      restored.dispose()
    }
  })

  it('restores both rule registries and Workshop overlays after nesting and exceptions', () => {
    const first = configuredSession(customCard(1, 2)), second = configuredSession(customCard(2, 4))
    try {
      first.withCtx(() => {
        const firstOverlay = getCurrentSessionContext()
        expect(getCardModifiers(CARD_ID)[0]).toMatchObject({ discount: { food: 1 } })
        expect(() => second.withCtx(() => {
          expect(getCurrentSessionContext()).not.toBe(firstOverlay)
          expect(getCardModifiers(CARD_ID)[0]).toMatchObject({ discount: { food: 2 } })
          throw new Error('inner rule failure')
        })).toThrow('inner rule failure')
        expect(getCurrentSessionContext()).toBe(firstOverlay)
        expect(getCardModifiers(CARD_ID)[0]).toMatchObject({ discount: { food: 1 } })
      })
      expect(getCurrentSessionContext()).toBeNull()
      expect(getActiveCardRegistry()).toBeNull()
      expect(first.takeAction(0, 'forest').ok).toBe(true)
      expect(first.resolveChoice(0, 'A102_Grocer').state.players[0]!.resources)
        .toMatchObject({ food: 8, grain: 2, wood: 3 })
    } finally {
      first.dispose()
      second.dispose()
    }
  })

  it('rebuilds a server worker from retained rules and completes its pending payment', async () => {
    const card = customCard(1, 2)
    const original = configuredSession(card)
    expect(original.takeAction(0, 'forest').ok).toBe(true)
    const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))
    original.dispose()
    const worker = createIsolatedGameSession(rehydrateState(snapshot), [card])
    if (!worker.executor) throw new Error('Expected an executable Session worker')
    try {
      const completed = await worker.executor.execute('resolveChoice', [0, 'A102_Grocer'])
      expect(completed.ok, completed.error).toBe(true)
      expect(completed.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
      expect(completed.state.events.filter(event => event.type === 'resource.moved' && event.resources.grain === 2))
        .toHaveLength(1)
      const duplicate = await worker.executor.execute('resolveChoice', [0, 'A102_Grocer'])
      expect(duplicate.ok).toBe(false)
      expect(duplicate.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
      expect(getActiveCardRegistry()).toBeNull()
    } finally {
      worker.executor.dispose()
      worker.session.dispose()
    }
  })

  it('restores the browser sandbox protocol without borrowing server card rules', () => {
    const card = customCard(1, 2)
    const original = configuredSession(card)
    expect(original.takeAction(0, 'forest').ok).toBe(true)
    const serializedState = JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))
    original.dispose()
    const browser = new LocalSandboxCore()
    const viewer = { viewerPlayerId: null, mode: 'debug' } satisfies import('../../client/local-sandbox/protocol').ViewerSpec
    const restored = handleLocalSandboxRequest(browser, {
      kind: 'restore', id: 1, viewer,
      persisted: { schemaVersion: LOCAL_SANDBOX_SCHEMA_VERSION, serializedState,
        config: { playerCount: 2, seed: 42, cards: [{ cardType: card.cardType, cardJson: card.cardJson, source: card.effectCode ?? null }] } },
    })
    if (restored.kind !== 'result' || !restored.ok || !('payload' in restored)) {
      throw new Error(`Browser restore failed: ${JSON.stringify(restored)}`)
    }
    expect(restored.payload.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    const completed = handleLocalSandboxRequest(browser, {
      kind: 'call', id: 2, viewer, method: 'resolveChoice', args: [0, 'A102_Grocer'],
    })
    if (completed.kind !== 'result' || !completed.ok || !('payload' in completed)) {
      throw new Error(`Browser settlement failed: ${JSON.stringify(completed)}`)
    }
    expect(completed.payload.ok, completed.payload.error).toBe(true)
    expect(completed.payload.state.players[0]!.resources).toMatchObject({ food: 8, grain: 2, wood: 3 })
    expect(completed.payload.cardWarnings ?? []).toEqual([])
    expect(getCurrentSessionContext()).toBeNull()
    expect(getActiveCardRegistry()).toBeNull()
  })

  it('reconstructs known rule spaces while preserving live caller definitions and saved occupancy', () => {
    const original = createWorkSession({ options: { enableThroughTheSeasons: true }, configure: state => {
      state.players[0]!.minorPlayed = ['B042_ForestInn']
      const forest = state.actionSpaces.find(space => space.id === 'forest')!
      forest.resources = { wood: 7 }
      forest.takenBy = [{ playerId: 'p2', workerId: '1' }]
      state.actionSpaces.push({ ...forest, id: '__test_live_space', takenBy: [] })
    } })
    try {
      const cardSpace = original.state.actionSpaces.find(space => space.id === 'B042_ForestInn')!
      cardSpace.resources = { food: 4 }
      cardSpace.takenBy = [{ playerId: 'p1', workerId: '1' }]
      const initialIds = original.state.actionSpaces.map(space => space.id).filter(id => id !== '__test_live_space')
      expect(original.getAvailableActions(0).map(action => action.spaceId)).toContain('__test_live_space')
      original.restoreStateSnapshot(original.state)
      expect(original.getAvailableActions(0).map(action => action.spaceId)).toContain('__test_live_space')
      expect(original.takeAction(0, '__test_live_space').ok).toBe(true)
      expect(original.undoAction().ok).toBe(true)
      expect(original.getAvailableActions(0).map(action => action.spaceId)).toContain('__test_live_space')

      const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))))
      try {
        expect(restored.state.actionSpaces.map(space => space.id)).toEqual(initialIds)
        expect(restored.state.actionSpaces.find(space => space.id === 'forest'))
          .toMatchObject({ resources: { wood: 7 }, takenBy: [{ playerId: 'p2', workerId: '1' }] })
        expect(restored.state.actionSpaces.find(space => space.id === 'B042_ForestInn'))
          .toMatchObject({ resources: { food: 4 }, takenBy: [{ playerId: 'p1', workerId: '1' }] })
        expect(restored.getAvailableActions(0).map(action => action.spaceId)).not.toContain('forest')
        expect(getActiveCardRegistry()).toBeNull()
      } finally {
        restored.dispose()
      }
    } finally {
      original.dispose()
    }
  })
})
