import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards, registerCustomCard, type CustomCardData } from '../../shared/cards/custom-registry.ts'
import { executeCardListener, getMatchingListeners } from '../../shared/cards/card-listeners.ts'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects.ts'
import { createInitialState } from '../../shared/session/state-bootstrap.ts'
import { validateAndCompileCustomCode, invokeCustomCodeEffect } from '../custom-code/engine.ts'
import { registerExecutorBackedCustomCard } from '../custom-code/runtime.ts'

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
    actions: ['meeting-place'],
    phases: ['after'],
    handler: () => ({ flow: { type: 'leaf', actionId: 'gain', params: { wood: 1 }, sourceCard: CARD_ID } }),
  }],
}
    `, 'CUSTOM_ExecutorCard')

    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.manifest.effectHooks).toContain('onReturnHome')
    expect(result.manifest.listeners).toHaveLength(1)
    expect(result.manifest.listeners[0]?.actions).toEqual(['meeting-place'])
  })

  it('extracts before-end dispatch metadata for executor-backed custom cards', () => {
    const result = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_ExecutorCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Executor Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    beforeEndGameScope: 'allPlayers',
    beforeEndGameDispatchMode: 'select',
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
      beforeEndGameScope: 'allPlayers',
      beforeEndGameDispatchMode: 'select',
      beforeEndGameMandatory: true,
    })

    const cardData = makeCardData(result.compiledCode, result.manifest)
    registerCustomCard(cardData, { allowGlobal: true })
    registerExecutorBackedCustomCard(cardData)

    expect(getCardEffect('CUSTOM_ExecutorCard')).toMatchObject({
      beforeEndGameScope: 'allPlayers',
      beforeEndGameDispatchMode: 'select',
      beforeEndGameMandatory: true,
    })
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
    actions: ['meeting-place'],
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
      space: state.actionSpaces.find((space) => space.id === 'meeting-place') ?? state.actionSpaces[0]!,
      actionId: 'meeting-place',
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
})
