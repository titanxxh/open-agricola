import { describe, expect, it } from 'vitest'
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
    actions: ['meeting-place'],
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
})
