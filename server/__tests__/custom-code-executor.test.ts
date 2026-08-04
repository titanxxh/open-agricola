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
    id: CARD_ID,
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

  it('does not expose shared animal zone hooks without executor argument plumbing', () => {
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

    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.errors.join('\n')).toContain("unknown effect hook 'onComputeSharedAnimalZones'")
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
      context: {} as never,
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
    id: CARD_ID,
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
      state,
      player: state.players[0]!,
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
      state,
      player: state.players[0]!,
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
      state,
      player: state.players[0]!,
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
})
