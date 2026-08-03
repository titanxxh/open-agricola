import { describe, expect, it, vi } from 'vitest'
import { LocalSandboxCore } from '../worker-core.ts'
import { LOCAL_SANDBOX_SCHEMA_VERSION, type LocalCardInput, type ViewerSpec } from '../protocol.ts'
import {
  invokeCustomCodeEffectLocal,
  validateAndCompileCustomCodeLocal,
} from '../browser-executor.ts'

const DEBUG_VIEWER: ViewerSpec = { viewerPlayerId: null, mode: 'debug' }

const LOCAL_CARD_SOURCE = `
const CARD_ID = 'CUSTOM_LocalCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Local Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: (_state: any, player: any) => {
      if (!player.minorPlayed.includes(CARD_ID)) return
      return gainLeaf(CARD_ID, { food: 2 })
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
`

const localCard: LocalCardInput = {
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_LocalCard',
    name: 'Local Card',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Local sandbox card'],
  },
  source: LOCAL_CARD_SOURCE,
}

describe('LocalSandboxCore', () => {
  it('inits a 2-player game with a locally compiled custom card', () => {
    const core = new LocalSandboxCore()
    const { payload, persist } = core.init(
      { cards: [localCard], playerCount: 2, seed: 42 },
      DEBUG_VIEWER,
    )

    expect(payload.ok).toBe(true)
    expect(payload.state.players).toHaveLength(2)
    expect(payload.customCardDefs?.some((def) => def.cardJson.id === 'CUSTOM_LocalCard')).toBe(true)
    expect(persist.schemaVersion).toBe(LOCAL_SANDBOX_SCHEMA_VERSION)
    expect(persist.config.playerCount).toBe(2)
  })

  it('rejects init when a card fails to compile', () => {
    const badCard: LocalCardInput = {
      ...localCard,
      source: 'process.exit(1)',
    }
    const core = new LocalSandboxCore()
    expect(() => core.init({ cards: [badCard], playerCount: 2, seed: 42 }, DEBUG_VIEWER))
      .toThrow(/failed to compile/)
  })

  it('dispatches dev commands and keeps persist in sync', () => {
    const core = new LocalSandboxCore()
    core.init({ cards: [], playerCount: 2, seed: 42 }, DEBUG_VIEWER)

    const { payload, persist } = core.call('devSetResources', [0, { food: 9 }], DEBUG_VIEWER)
    expect(payload.ok).toBe(true)
    expect(payload.state.players[0]?.resources.food).toBe(9)
    expect(persist.serializedState.players[0]?.resources.food).toBe(9)
  })

  it('dispatches commands inside the session card context', () => {
    // Custom-card effects/hooks resolve from SessionCardContext only while a
    // withCtx scope is active; every dispatch must run inside one (like the
    // server router's session.withCtx), not just methods that self-wrap.
    const core = new LocalSandboxCore()
    core.init({ cards: [localCard], playerCount: 2, seed: 42 }, DEBUG_VIEWER)
    const internalCore = (core as unknown as { core: { withCtx: (fn: () => unknown) => unknown } }).core
    const spy = vi.spyOn(internalCore, 'withCtx')
    core.call('devSetResources', [0, { food: 1 }], DEBUG_VIEWER)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('throws on unknown dispatch methods and before init', () => {
    const core = new LocalSandboxCore()
    expect(() => core.call('getState', [], DEBUG_VIEWER)).toThrow(/not initialized/)
    core.init({ cards: [], playerCount: 2, seed: 42 }, DEBUG_VIEWER)
    expect(() => core.call('sendRoomCommand', [], DEBUG_VIEWER)).toThrow(/Unknown local-sandbox method/)
  })

  it('restores a persisted game with state and custom cards intact', () => {
    const first = new LocalSandboxCore()
    first.init({ cards: [localCard], playerCount: 2, seed: 42 }, DEBUG_VIEWER)
    const { persist } = first.call('devSetResources', [0, { food: 7, wood: 4 }], DEBUG_VIEWER)

    const second = new LocalSandboxCore()
    const { payload } = second.restore(persist, DEBUG_VIEWER)
    expect(payload.ok).toBe(true)
    expect(payload.state.players[0]?.resources.food).toBe(7)
    expect(payload.state.players[0]?.resources.wood).toBe(4)
    expect(payload.customCardDefs?.some((def) => def.cardJson.id === 'CUSTOM_LocalCard')).toBe(true)
  })

  it('rejects persisted games from another schema version', () => {
    const core = new LocalSandboxCore()
    const { persist } = core.init({ cards: [], playerCount: 2, seed: 42 }, DEBUG_VIEWER)
    expect(() => new LocalSandboxCore().restore(
      { ...persist, schemaVersion: LOCAL_SANDBOX_SCHEMA_VERSION + 1 },
      DEBUG_VIEWER,
    )).toThrow(/schema/)
  })

  it('starts a fresh game via newGame while keeping the config', () => {
    const core = new LocalSandboxCore()
    core.init({ cards: [localCard], playerCount: 2, seed: 42 }, DEBUG_VIEWER)
    core.call('devSetResources', [0, { food: 9 }], DEBUG_VIEWER)

    const { payload } = core.call('newGame', [7], DEBUG_VIEWER)
    expect(payload.ok).toBe(true)
    expect(payload.state.players[0]?.resources.food ?? 0).toBeLessThan(9)
    expect(payload.customCardDefs?.some((def) => def.cardJson.id === 'CUSTOM_LocalCard')).toBe(true)
  })
})

describe('browser executor error handling', () => {
  it('returns ok:false when card code throws instead of propagating', () => {
    const compiled = validateAndCompileCustomCodeLocal(`
const CARD_ID = 'CUSTOM_BoomCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Boom Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: () => {
      throw new Error('local boom')
    },
  },
}
    `, 'CUSTOM_BoomCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const result = invokeCustomCodeEffectLocal({
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_BoomCard',
      hook: 'onReturnHome',
      state: { players: [] } as never,
      player: { minorPlayed: [] } as never,
    })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('local boom') })
  })

  it('runs card code under strict mode so `this` cannot reach worker globals', () => {
    // `this.fetch` passes the AST validator (property access, not an identifier)
    // but must resolve to nothing: strict mode makes the handler `this`
    // undefined instead of binding it to the global scope.
    const compiled = validateAndCompileCustomCodeLocal(`
const CARD_ID = 'CUSTOM_ThisEscape'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'This Escape' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: function () {
      const g = this
      return gainLeaf(CARD_ID, { food: (g && g.fetch) ? 999 : 1 })
    },
  },
}
    `, 'CUSTOM_ThisEscape')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const result = invokeCustomCodeEffectLocal({
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ThisEscape',
      hook: 'onReturnHome',
      state: {} as never,
      player: {} as never,
    })
    expect(result).toEqual({
      ok: true,
      result: { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'CUSTOM_ThisEscape' },
    })
  })

  it('warns when a hook runs over the server 100ms budget', () => {
    const compiled = validateAndCompileCustomCodeLocal(`
const CARD_ID = 'CUSTOM_SlowCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Slow Card' })
const CARD_IMPL = { effect: { id: CARD_ID, onReturnHome: () => gainLeaf(CARD_ID, { food: 1 }) } }
    `, 'CUSTOM_SlowCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    // Fake the clock so the invocation looks like it took 200ms.
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValueOnce(200)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = invokeCustomCodeEffectLocal({
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_SlowCard',
      hook: 'onReturnHome',
      state: {} as never,
      player: {} as never,
    })

    expect(result).toEqual({
      ok: true,
      result: { type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: 'CUSTOM_SlowCard' },
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('over the server 100ms budget'))

    nowSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
