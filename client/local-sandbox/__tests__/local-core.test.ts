import { describe, expect, it, vi } from 'vitest'
import { handleLocalSandboxRequest, LocalSandboxCore } from '../worker-core.ts'
import { LOCAL_SANDBOX_SCHEMA_VERSION, type LocalCardInput, type LocalGameConfig, type ViewerSpec } from '../protocol.ts'
import '../../../shared/cards/B/B178_TagAlong'
import { withClassicCardDefinitions } from '../../../shared/cards/classic-catalog'
import { classicFixtureCards } from '../../../shared/cards/__tests__/__fixtures__/classic-definitions'

const DEBUG_VIEWER: ViewerSpec = { visiblePlayerIds: [], mode: 'debug' }

const LOCAL_CARD_SOURCE = `import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'CUSTOM_LocalCard'

export const CUSTOM_LocalCard = defineMinorCard({
  meta: { id: CARD_ID, name: 'Local Card', deck: 'community', number: 0, desc: ['Local sandbox card'] },
  impl: {
    effect: {
      id: CARD_ID,
      onReturnHome: (_state, player) => {
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
  },
})
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
  it('admits a classic browser game only when enabled and restores it after the switch is off', () => {
    const config: LocalGameConfig = {
      cardEdition: 'classic', classicDeckIds: [' ce ', 'CI', 'CZ'],
      cards: [localCard], playerCount: 2, seed: 42, enableSnakeOpening: true,
    }
    const request = { id: 1, kind: 'init', config, viewer: DEBUG_VIEWER } as const
    const disabled = new LocalSandboxCore(false)
    expect(handleLocalSandboxRequest(disabled, request)).toMatchObject({ ok: false, code: 'classic_edition_disabled' })

    const enabled = new LocalSandboxCore(true)
    expect(handleLocalSandboxRequest(enabled, {
      ...request, config: { ...config, enableThroughTheSeasons: true },
    })).toMatchObject({ ok: false, code: 'classic_edition_incompatible' })
    withClassicCardDefinitions(classicFixtureCards('CI', 'minor', 1), () => {
      expect(handleLocalSandboxRequest(enabled, request)).toMatchObject({
        ok: false, code: 'classic_pool_insufficient', shortfall: { playerCount: 2, needed: { occupation: 14, minor: 14 } },
      })
    })

    const fixtures = [...classicFixtureCards('CE', 'occupation', 14), ...classicFixtureCards('CI', 'minor', 14)]
    withClassicCardDefinitions(fixtures, () => {
      const { payload, persist } = enabled.init(config, DEBUG_VIEWER)
      expect(payload.state).toMatchObject({ cardEdition: 'classic', classicDeckIds: ['CE', 'CI'], enableSnakeOpening: true })
      expect(payload.customCardDefs?.map(({ cardJson }) => cardJson.id)).toContain(localCard.cardJson.id)
      expect(disabled.restore(persist, DEBUG_VIEWER).payload.state).toEqual(payload.state)
      expect(handleLocalSandboxRequest(disabled, {
        id: 2, kind: 'call', method: 'newGame', args: [], viewer: DEBUG_VIEWER,
      })).toMatchObject({ ok: false, code: 'classic_edition_disabled' })
      expect(disabled.call('getState', [], DEBUG_VIEWER).payload.state).toEqual(payload.state)
    })
  })

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

  it('rejects a card in the retired CARD_DEF / CARD_IMPL format and asks for regeneration', () => {
    const legacyCard: LocalCardInput = {
      ...localCard,
      source: "const CARD_ID = 'CUSTOM_LocalCard'\nconst CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Local Card' })\nconst CARD_IMPL = {}",
    }
    expect(() => new LocalSandboxCore().init({ cards: [legacyCard], playerCount: 2, seed: 42 }, DEBUG_VIEWER))
      .toThrow(/retired CARD_DEF \/ CARD_IMPL sandbox format.*Regenerate/s)
  })

  it('dispatches dev commands and keeps persist in sync', () => {
    const core = new LocalSandboxCore()
    core.init({ cards: [], playerCount: 2, seed: 42 }, DEBUG_VIEWER)

    const { payload, persist } = core.call('devSetResources', [0, { food: 9 }], DEBUG_VIEWER)
    expect(payload.ok).toBe(true)
    expect(payload.state.players[0]?.resources.food).toBe(9)
    expect(persist.serializedState.state.players[0]?.resources.food).toBe(9)
  })

  it('confirms a returning player switch from the outgoing responder', () => {
    const core = new LocalSandboxCore()
    const initialized = core.init({ cards: [], playerCount: 5, seed: 42 }, DEBUG_VIEWER)
    const state = initialized.payload.state
    state.currentPlayerIndex = 1
    state.round = 1
    state.players[0]!.occupationPlayed.push('B178_TagAlong')
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    core.call('loadGame', [state], DEBUG_VIEWER)

    core.call('takeAction', [1, 'resource-market-56'], DEBUG_VIEWER)
    const prompted = core.call('confirmPlayerSwitch', [], DEBUG_VIEWER)
    if (prompted.payload.interaction.stateId !== 'wait') throw new Error('expected Tag-Along choice')
    const accept = prompted.payload.interaction.request.options.find(
      (option) => option.value !== '__skip__',
    )
    const returning = core.call('resolveChoice', [0, accept!.value], DEBUG_VIEWER)
    expect(returning.payload.state.currentPlayerIndex).toBe(1)
    expect(returning.payload.interaction.stateId === 'wait'
      ? returning.payload.interaction.request
      : undefined).toMatchObject({
      kind: 'confirm-player-switch',
      fromPlayerIndex: 0,
      toPlayerIndex: 1,
    })

    const confirmed = core.call('confirmPlayerSwitch', [], DEBUG_VIEWER)
    expect(confirmed.payload.ok).toBe(true)
    expect(confirmed.payload.interaction.stateId === 'wait'
      ? confirmed.payload.interaction.request.kind
      : confirmed.payload.interaction.stateId).not.toBe('confirm-player-switch')
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

  it('restores an in-flight interaction from the private cursor', () => {
    const first = new LocalSandboxCore()
    first.init({ cards: [], playerCount: 2, seed: 42 }, DEBUG_VIEWER)
    const action = first.call('takeAction', [0, 'forest'], DEBUG_VIEWER)
    expect(action.payload.interaction.stateId).toBe('wait')

    const restored = new LocalSandboxCore().restore(action.persist, DEBUG_VIEWER)
    expect(restored.payload.interaction).toEqual(action.payload.interaction)
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
