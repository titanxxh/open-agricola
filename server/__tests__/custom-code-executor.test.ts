import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards, registerCustomCard, type CustomCardData } from '../../shared/cards/custom-registry.ts'
import { executeCardListener, getMatchingListeners } from '../../shared/cards/card-listeners.ts'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects.ts'
import { computeAnimalZones } from '../../shared/domain/animal-zones.ts'
import { createInitialState } from '../../shared/session/state-bootstrap.ts'
import { CardRegistry } from '../../shared/cards/registry.ts'
import {
  validateAndCompileCustomCode,
  invokeCustomCodeEffect,
  invokeCustomCodeListener,
} from '../custom-code/engine.ts'
import { registerExecutorBackedCustomCard } from '../custom-code/runtime.ts'
import { GameSession } from '../game/authoritative-session.ts'
import { workshopCardJsonFromDefinition } from '../workshop-draft-validation.ts'
import { compileCardCode } from '../../shared/custom-code/compiler.ts'
import { serializeSessionSnapshot } from '../../shared/session/serialization.ts'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands.ts'
import { getOwnOrdinaryFenceReserveCount, getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { getActiveCardRegistry } from '../../shared/cards/active-registry'
import { rehydrateState } from '../../shared/session/serialization'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { Scoring } from '../../shared/domain'
import type { ActionFlow } from '../../shared/contract/types'

const makeCardData = (compiledCode: string, codeManifest: CustomCardData['codeManifest']): CustomCardData => ({
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_ExecutorCard',
    name: 'Executor Card',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Executor backed'],
  },
  compiledCode,
  codeManifest,
})

afterEach(() => {
  clearCustomCards()
})

describe('custom code executor', () => {
  it.each(['native', 'sandbox'].flatMap(mode => ['selection', 'pay'].map(kind => ({ mode, kind }))))(
    'uses a source-owned quantity and current-step window through $mode / $kind, including restoration', ({ mode, kind }) => {
    const flow: ActionFlow = { type: 'leaf', actionId: kind, sourceCard: 'CUSTOM_ExecutorCard', optional: true,
      promptKey: 'ui.interactionOptionalAction', anytimeWindow: { allowed: true },
      ...(kind === 'pay'
        ? { params: { cost: { fees: [{ food: 1 }, { wood: 1 }] } } }
        : { actionContext: { selectionKind: 'farm-position', selectableTiles: [{ row: 0, col: 1 }], minSelections: 1, maxSelections: 1 } }) }
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = { effect: { id: CARD_ID,
  getRuleContributions: (player) => ({ unusedSpaceReduction: player.cardStates[CARD_ID].extraData.quantity }),
  onBeforeEndGame: () => (${JSON.stringify(flow)})
} }
    `, 'CUSTOM_ExecutorCard')
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const cards = mode === 'sandbox' ? [makeCardData(compiled.compiledCode, compiled.manifest)] : undefined
    const session = new GameSession(42, cards, { playerCount: 2 })
    const installNative = (target: GameSession) => {
      if (mode === 'native') target.withCtx(() => getActiveCardRegistry()!.loadImpl('CUSTOM_ExecutorCard', { effect: {
        id: 'CUSTOM_ExecutorCard', getRuleContributions: (player) => ({ unusedSpaceReduction: player.cardStates.CUSTOM_ExecutorCard!.extraData!.quantity as number }),
        onBeforeEndGame: () => structuredClone(flow),
      } }))
    }
    installNative(session)
    session.state.round = 14
    for (const player of session.state.players) {
      player.minorHand = ['__test_placeholder__']; player.occupationHand = ['__test_placeholder__']
      markAllWorkersUsed(session.state, player); setActiveWorkerCount(player, 0)
      player.resources.food = 0
    }
    const player = session.state.players[0]!
    player.minorPlayed = ['CUSTOM_ExecutorCard']
    player.improvements = ['Major_Fireplace1']; player.resources.sheep = 1
    player.resources.wood = 1; player.resources.grain = 1
    player.houseAnimalType = 'sheep'; player.houseAnimalCount = 1
    if (kind === 'pay') {
      player.resources.sheep = 2
      player.houseAnimalType = null; player.houseAnimalCount = 0
      player.pastures = [{ id: 'payment-sheep', size: 1, tiles: [{ row: 0, col: 2 }],
        stables: 0, animalType: 'sheep', animalCount: 2 }]
    }
    player.cardStates.CUSTOM_ExecutorCard = { extraData: { quantity: 1.9 } }
    session.loadState(session.state)
    let response = session.invokeAfterRoundEnd()
    expect(response.interaction.request?.kind).toBe('choice')
    expect(response.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(saved), cards)
    installNative(restored)
    expect(restored.getState().interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
    for (const target of [session, restored]) {
      response = target.takeAnytimeAction(0, 'exchange')
      expect(response.ok).toBe(true)
      response = target.resolveChoice(0, 'bulk:0=1')
      expect(response.state.players[0]!.resources.food).toBe(2)
      expect(response.interaction.promptKey).toBe('ui.interactionOptionalAction')
      response = target.resolveChoice(0, response.interaction.request!.options!.find((option) => option.value !== '__skip__')!.value)
      expect(response.interaction.request?.kind).toBe(kind === 'pay' ? 'choice' : 'selection')
      expect(response.interaction.request?.anytimeWindow?.allowed).not.toBe(true)
      expect(response.interaction.anytimeActions).toEqual([])
      const closedSnapshot = target.withCtx(() => serializeSessionSnapshot(target.state, target))
      const closedRestored = new GameSession(rehydrateState(closedSnapshot), cards)
      installNative(closedRestored)
      expect(closedRestored.getState().interaction.anytimeActions).toEqual([])
      expect(closedRestored.getState().interaction.request?.anytimeWindow?.allowed).not.toBe(true)
      const before = JSON.stringify(target.state)
      expect(target.takeAnytimeAction(0, 'exchange').ok).toBe(false)
      expect(JSON.stringify(target.state)).toBe(before)
      if (kind === 'pay') {
        expect(response.interaction.promptKey).toBe('prompt.selectPayment')
        expect(response.interaction.request!.options!.length).toBe(2)
        const food = response.interaction.request!.options!.find(option =>
          (option.labelParams?.resourcesPaid as Record<string, number> | undefined)?.food === 1)
        expect(food).toBeDefined()
        response = target.resolveChoice(0, food!.value)
        expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1, grain: 1 })
        expect(response.state.events).toContainEqual(expect.objectContaining({
          type: 'resource.paid', sourceCardId: 'CUSTOM_ExecutorCard', resources: { food: 1 },
        }))
      } else response = target.commitSelectionChoice(0, { positions: ['0-1'] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.gameOver).toBe(true)
      expect(target.withCtx(() => Scoring.breakdown(response.state, 0)).categories.find((category) => category.key === 'empty'))
        .toMatchObject({ quantity: kind === 'pay' ? 11 : 12, total: kind === 'pay' ? -11 : -12 })
    }
  })
  it.each(['native', 'sandbox'])('records detached, explicitly public presentation through the %s query', (mode) => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = { effect: { id: CARD_ID, getStatePresentation: (player) => {
  const data = player.cardStates[CARD_ID].extraData
  data.internal = 'QUERY_WRITE'
  return { counters: { publicCount: data.publicCount }, resourceGroups: data.groups,
    animalMarkers: [{ animal: 'horse', count: 1.9, pose: 'lying' }, { animal: 'horse', count: -1 }],
    extraData: data }
} } }
    `, 'CUSTOM_ExecutorCard')
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const session = new GameSession(42, mode === 'sandbox' ? [makeCardData(compiled.compiledCode, compiled.manifest)] : undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    if (mode === 'native') session.withCtx(() => getActiveCardRegistry()!.loadImpl('CUSTOM_ExecutorCard', { effect: {
      id: 'CUSTOM_ExecutorCard',
      getStatePresentation: (player) => {
        const data = player.cardStates.CUSTOM_ExecutorCard!.extraData!
        data.internal = 'QUERY_WRITE'
        return { counters: { publicCount: data.publicCount as number }, resourceGroups: data.groups as { wood: number }[],
          animalMarkers: [{ animal: 'horse', count: 1.9, pose: 'lying' }, { animal: 'horse', count: -1 }], extraData: data }
      },
    } }))
    const player = session.state.players[0]!
    player.minorPlayed = ['CUSTOM_ExecutorCard']
    player.cardStates.CUSTOM_ExecutorCard = { extraData: { publicCount: 2, internal: 'AUTH_INTERNAL', groups: [{ wood: 1, clay: 1 }] } }
    const before = JSON.stringify(session.state)
    for (const viewer of [player.id, session.state.players[1]!.id, null]) {
      const facts = session.buildSyncPayload(session.getState(), viewer).state.players[0]!.cardStatePresentation.CUSTOM_ExecutorCard!
      expect(facts).toEqual({ counters: { publicCount: 2 }, resourceGroups: [{ wood: 1, clay: 1 }],
        animalMarkers: [{ animal: 'horse', count: 1, pose: 'lying' }] })
      facts.resourceGroups![0]!.wood = 99
    }
    expect(JSON.stringify(session.state)).toBe(before)
  })
  it('aggregates sandbox source component reservations through the same rule queries', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = { effect: { id: CARD_ID, getRuleContributions: (player) => ({
  reservedSupply: { fence: player.cardStates[CARD_ID].extraData.pieces, stable: 2 },
}) } }
    `, 'CUSTOM_ExecutorCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) throw new Error(compiled.errors.join('\n'))
    const session = new GameSession(42, [makeCardData(compiled.compiledCode, compiled.manifest)], { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const player = session.state.players[0]!
    player.minorPlayed = ['CUSTOM_ExecutorCard']
    player.cardStates.CUSTOM_ExecutorCard = { extraData: { pieces: 3 } }
    const before = JSON.stringify(session.state)
    session.withCtx(() => {
      expect(getOwnOrdinaryFenceReserveCount(player)).toBe(12)
      expect(getAvailableStableSupplyCount(session.state, player)).toBe(2)
    })
    expect(JSON.stringify(session.state)).toBe(before)
  })
  it('extracts the validated CARD_DEF metadata', () => {
    const result = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_MetadataCard'
const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: CARD_ID,
    name: 'Metadata Card',
    desc: ['Generated metadata.'],
    cost: { wood: 2 },
    vp: 1,
    locales: {
      zh: { name: '元数据卡', desc: ['生成的元数据。'] },
    },
  },
}
const CARD_IMPL = {}
    `, 'CUSTOM_MetadataCard')

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.cardDefinition).toEqual({
      cardType: 'minor',
      meta: {
        id: 'CUSTOM_MetadataCard',
        name: 'Metadata Card',
        desc: ['Generated metadata.'],
        cost: { wood: 2 },
        vp: 1,
        locales: {
          zh: { name: '元数据卡', desc: ['生成的元数据。'] },
        },
      },
    })
  })

  it('validates code and extracts effect/listener manifest', () => {
    const result = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: (_state: any, player: any) => {
      if (!player.minorPlayed.includes(CARD_ID)) return
      return { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID }
    },
  },
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['collect'],
    phases: ['after'],
    handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID } }),
  }],
}
    `, 'CUSTOM_ExecutorCard')

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.cardDefinition).toEqual({
      cardType: 'minor',
      meta: {
        id: 'CUSTOM_ExecutorCard',
        name: 'Executor Card',
      },
    })
    expect(workshopCardJsonFromDefinition(result.cardDefinition)).toMatchObject({
      id: 'CUSTOM_ExecutorCard',
      name: 'Executor Card',
      card_type: 'minor',
    })
    expect(result.manifest.effectHooks).toContain('onReturnHome')
    expect(result.manifest.listeners).toHaveLength(1)
    expect(result.manifest.listeners[0]?.actions).toEqual(['collect'])
  })

  it('extracts before-end metadata for executor-backed custom cards', () => {
    const result = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    handHooks: ['onBeforeStartOfTurn'],
    onBeforeStartOfTurn: () => undefined,
    beforeEndGameScope: 'allPlayers',
    beforeEndGameMandatory: true,
    onBeforeEndGame: (_state: any, _player: any) => {
      return { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID }
    },
  },
}
    `, 'CUSTOM_ExecutorCard')

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect((result.manifest as any).effectMetadata).toEqual({
      handHooks: ['onBeforeStartOfTurn'],
      beforeEndGameScope: 'allPlayers',
      beforeEndGameMandatory: true,
    })

    const cardData = makeCardData(result.compiledCode, result.manifest)
    registerCustomCard(cardData, { allowGlobal: true })
    registerExecutorBackedCustomCard(cardData)

    expect(getCardEffect('CUSTOM_ExecutorCard')).toMatchObject({
      handHooks: ['onBeforeStartOfTurn'],
      beforeEndGameScope: 'allPlayers',
      beforeEndGameMandatory: true,
    })
  })

  it('dispatches a supported custom hand hook through a real session stage', () => {
    const result = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    handHooks: ['onBeforeStartOfTurn'],
    onBeforeStartOfTurn: () => gainLeaf(CARD_ID, { food: 1 }),
  },
}
    `, 'CUSTOM_ExecutorCard')
    expect(result.valid).toBe(true)
    if (!result.valid) return

    const session = new GameSession(undefined, [makeCardData(result.compiledCode, result.manifest)], { playerCount: 2 })
    const state = session.getState().state
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    state.players[0]!.minorHand = ['CUSTOM_ExecutorCard']
    state.players[0]!.resources.food = 0
    state.round = 1
    state.roundPhase = 'preparation'
    session.loadState(state)

    const response = session.withCtx(() => (
      session as unknown as { continueBeforeStartOfTurn: () => ReturnType<GameSession['takeAction']> }
    ).continueBeforeStartOfTurn())

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('accepts serializable shared animal zone hooks with complete arguments', () => {
    const result = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onComputeSharedAnimalZones: () => [],
  },
}
    `, 'CUSTOM_ExecutorCard')

    expect(result.valid).toBe(true)
  })

  it('rejects forbidden globals during validation', () => {
    const result = validateAndCompileCustomCode('process.exit(1)', 'CUSTOM_BadCard')
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errors.join('\n')).toContain('process')
  })

  it('rejects dynamically constructed costs without attribution at runtime', () => {
    const source = `
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['construct'],
    phases: ['computeCosts'],
    handler: () => Object.fromEntries([['costs', { wood: -2 }]]),
  }],
}
    `

    expect(invokeCustomCodeListener({
      compiledCode: compileCardCode(source),
      cardId: 'CUSTOM_ExecutorCard',
      registrationId: 'CUSTOM_ExecutorCard:listener:0',
      context: {phase:'computeCosts',actionId:'construct',state:createInitialState(42)} as never,
    })).toEqual({ ok: false, error: expect.stringContaining('costAttribution') })
  })

  it('rejects invalid results from a normally registered custom listener', () => {
    const state = createInitialState(42)
    const player = state.players[0]!
    const space = state.actionSpaces[0]!
    const registry = new CardRegistry()
    registry.loadImpl('CUSTOM_ExecutorCard', {
      listeners: [{
        id: 'opaque-listener-id',
        handler: () => Object.fromEntries([['costs', { wood: -2 }]]),
      }],
    })

    expect(() => executeCardListener(registry.getAllListeners()[0]!, {
      state,
      player,
      space,
      actionId: 'construct',
      phase: 'computeCosts',
    })).toThrow('costAttribution')
  })

  it('rejects inherited costs from a normally registered custom listener', () => {
    const state = createInitialState(42)
    const registry = new CardRegistry()
    registry.loadImpl('CUSTOM_ExecutorCard', {
      listeners: [{
        id: 'opaque-listener-id',
        handler: () => ({
          __proto__: Object.fromEntries([['costs', { wood: -2 }]]),
        }),
      }],
    })

    expect(() => executeCardListener(registry.getAllListeners()[0]!, {
      state,
      player: state.players[0]!,
      space: state.actionSpaces[0]!,
      actionId: 'construct',
      phase: 'computeCosts',
    })).toThrow('plain object')
  })

  it('rejects cost attribution without costs from a custom listener', () => {
    const state = createInitialState(42)
    const registry = new CardRegistry()
    registry.loadImpl('CUSTOM_ExecutorCard', {
      listeners: [{
        id: 'opaque-listener-id',
        handler: () => ({
          costAttribution: [{ sourceCard: 'CUSTOM_ExecutorCard', costs: { wood: -2 } }],
        } as never),
      }],
    })

    expect(() => executeCardListener(registry.getAllListeners()[0]!, {
      state,
      player: state.players[0]!,
      space: state.actionSpaces[0]!,
      actionId: 'construct',
      phase: 'computeCosts',
    })).toThrow('costAttribution')
  })

  it('executes registered effect and listener through runtime proxies', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: (_state: any, player: any) => {
      if (!player.minorPlayed.includes(CARD_ID)) return
      return { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: CARD_ID }
    },
  },
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['collect'],
    phases: ['after'],
    handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID } }),
  }],
}
    `, 'CUSTOM_ExecutorCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const cardData = makeCardData(compiled.compiledCode, compiled.manifest)
    registerCustomCard(cardData, { allowGlobal: true })
    registerExecutorBackedCustomCard(cardData)

    const state = createInitialState(42)
    state.players[0]!.minorPlayed.push('CUSTOM_ExecutorCard')

    const effectResult = runCardEffectHook(state, state.players[0]!, 'CUSTOM_ExecutorCard', 'onReturnHome')
    expect(effectResult).toEqual({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 2 },
      sourceCard: 'CUSTOM_ExecutorCard',
    })

    const listenerContext = {
      state,
      player: state.players[0]!,
      space: state.actionSpaces.find((space) => space.id === 'forest') ?? state.actionSpaces[0]!,
      actionId: 'collect',
      phase: 'after' as const,
    }
    const matched = getMatchingListeners(listenerContext)
    expect(matched).toHaveLength(1)
    const listenerResult = executeCardListener(matched[0]!.registration, listenerContext, { ownerPlayerId: matched[0]!.ownerPlayerId })
    expect(listenerResult).toEqual({
      flow: {
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 1 },
        sourceCard: 'CUSTOM_ExecutorCard',
      },
    })
  })

  it('records runtime proxy failures on the active sandbox session', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: () => {
      throw new Error('sandbox boom')
    },
  },
}
    `, 'CUSTOM_ExecutorCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const session = new GameSession(
      42,
      [makeCardData(compiled.compiledCode, compiled.manifest)],
    )
    const state = session.withCtx(() => session.getState()).state
    const result = session.withCtx(() =>
      runCardEffectHook(
        state,
        state.players[0]!,
        'CUSTOM_ExecutorCard',
        'onReturnHome',
      ),
    )

    expect(result).toBeNull()
    expect(session.cardWarnings).toEqual([
      expect.stringContaining('sandbox boom'),
    ])
    session.dispose()
  })

  it('times out runaway effect execution', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: () => {
      while (true) {}
    },
  },
}
    `, 'CUSTOM_ExecutorCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    state.players[0]!.minorPlayed.push('CUSTOM_ExecutorCard')
    const result = invokeCustomCodeEffect({
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ExecutorCard',
      hook: 'onReturnHome',
      args: [state, state.players[0]!],
    })
    expect(result.ok).toBe(false)
  })

  it('makes helper functions available in sandbox', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_HelperCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Helper Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: (_state: any, _player: any) => {
      return gainLeaf(CARD_ID, { food: 3 })
    },
  },
}
    `, 'CUSTOM_HelperCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const result = invokeCustomCodeEffect({
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_HelperCard',
      hook: 'onReturnHome',
      args: [state, state.players[0]!],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.result).toEqual({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 3 },
      sourceCard: 'CUSTOM_HelperCard',
    })
  })

  it('uses row and col in positionKey', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_HelperCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Helper Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: () => ({
      type: 'leaf',
      actionId: 'special-effect',
      params: { kind: 'set-infobox', text: positionKey({ row: 1, col: 2 }) },
      sourceCard: CARD_ID,
    }),
  },
}
    `, 'CUSTOM_HelperCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const result = invokeCustomCodeEffect({
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_HelperCard',
      hook: 'onReturnHome',
      args: [state, state.players[0]!],
    })
    expect(result).toEqual({
      ok: true,
      result: {
        type: 'leaf',
        actionId: 'special-effect',
        params: { kind: 'set-infobox', text: '1-2' },
        sourceCard: 'CUSTOM_HelperCard',
      },
    })
  })

  it('adds only incremental animal zones through the real zone collector', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player: any, _zones: any[], state: any) => [{
      id: 'custom-zone',
      zoneType: 'card',
      ownerPlayerId: player.id,
      capacity: state.round,
    }],
  },
}
    `, 'CUSTOM_ExecutorCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const session = new GameSession(undefined, [makeCardData(compiled.compiledCode, compiled.manifest)], { playerCount: 2 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('CUSTOM_ExecutorCard')

    const zones = session.withCtx(() => computeAnimalZones(player, state))

    expect(zones.filter((zone) => zone.id === 'house')).toHaveLength(1)
    expect(zones.filter((zone) => zone.id === 'custom-zone')).toEqual([expect.objectContaining({
      ownerPlayerId: player.id,
      capacity: state.round,
      cardId: 'CUSTOM_ExecutorCard',
    })])
  })

  it('preserves an animal-zone display warning without exposing sandbox mutations', () => {
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player: any) => {
      player.resources.food = 999
      throw new Error('zone display failed')
    },
  },
}
    `, 'CUSTOM_ExecutorCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const session = new GameSession(42, [makeCardData(compiled.compiledCode, compiled.manifest)], { playerCount: 2 })
    try {
      stabilizeRandomHands(session.state.players)
      session.state.players[0]!.minorPlayed = ['CUSTOM_ExecutorCard']
      const before = JSON.stringify(session.state)

      const snapshot = serializeSessionSnapshot(session.state, session)

      expect(snapshot.frame.players[0]!.playedCardAnimalZones).toEqual([])
      expect(JSON.stringify(session.state)).toBe(before)
      expect(session.cardWarnings).toEqual([expect.stringContaining('zone display failed')])
    } finally {
      session.dispose()
    }
  })
})
