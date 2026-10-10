/**
 * Parity tests: the browser-local custom-card executor
 * (`client/local-sandbox/browser-executor.ts`) must behave identically to the
 * server executor for the same card source — same manifest
 * (`server/custom-code/engine.ts`), same invocation results and error handling
 * through the worker client that rooms use (`server/custom-code/client.ts`).
 */
import { afterEach, describe, expect, it } from 'vitest'
import { clearCustomCards } from '../../shared/cards/custom-registry.ts'
import { getCardEffect, runCardEffectHook } from '../../shared/cards/card-effects.ts'
import { createInitialState } from '../../shared/session/state-bootstrap.ts'
import { GameCore } from '../../shared/session/session-core.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import { validateFarmChoice } from '../../shared/session/farm-choice-validation.ts'
import { validateAndCompileCustomCode } from '../custom-code/engine.ts'
import { GameSession } from '../game/authoritative-session.ts'
import { invokeCustomCodeEffectSync, invokeCustomCodeListenerSync } from '../custom-code/client.ts'
import {
  invokeCustomCodeEffectLocal,
  invokeCustomCodeListenerLocal,
  validateAndCompileCustomCodeLocal,
} from '../../client/local-sandbox/browser-executor.ts'
import { registerBrowserBackedCustomCard } from '../../client/local-sandbox/browser-runtime.ts'

const CARD_SOURCE = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    handHooks: ['onReturnHome'],
    onReturnHome: (_state: any, player: any) => {
      if (!player.minorPlayed.includes(CARD_ID)) return
      player.minorPlayed.push('MUTATION_MUST_NOT_LEAK')
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

const THROWING_SOURCE = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onReturnHome: () => {
      throw new Error('parity boom')
    },
  },
}
`

const cardDataFrom = (compiledCode: string, manifest: CustomCardData['codeManifest']): CustomCardData => ({
  cardType: 'minor',
  cardJson: {
    id: 'CUSTOM_ParityCard',
    name: 'Parity Card',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Parity'],
  },
  compiledCode,
  codeManifest: manifest,
})

afterEach(() => {
  clearCustomCards()
})

describe('browser executor parity with server executor', () => {
  it('produces an identical validate/compile result', () => {
    const server = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    const local = validateAndCompileCustomCodeLocal(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(local).toEqual(server)
    expect(server.valid).toBe(true)
    if (!server.valid) return
    expect(server.manifest.effectMetadata).toEqual({ handHooks: ['onReturnHome'] })
  })

  it('rejects forbidden globals identically', () => {
    const server = validateAndCompileCustomCode('process.exit(1)', 'CUSTOM_BadCard')
    const local = validateAndCompileCustomCodeLocal('process.exit(1)', 'CUSTOM_BadCard')
    expect(local).toEqual(server)
    expect(server.valid).toBe(false)
  })

  it('rejects worker-global escapes (self / importScripts) identically', () => {
    for (const src of ['self.fetch("/x")', 'importScripts("/x")', 'self.indexedDB.open("x")']) {
      const server = validateAndCompileCustomCode(src, 'CUSTOM_BadCard')
      const local = validateAndCompileCustomCodeLocal(src, 'CUSTOM_BadCard')
      expect(local).toEqual(server)
      expect(server.valid, `${src} should be rejected`).toBe(false)
    }
  })

  it('invokes effect hooks with identical results and input isolation', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    state.players[0]!.minorPlayed.push('CUSTOM_ParityCard')

    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      hook: 'onReturnHome' as const,
      state,
      player: state.players[0]!,
    }
    const server = invokeCustomCodeEffectSync(request)
    const local = invokeCustomCodeEffectLocal(request)

    expect(local).toEqual(server)
    expect(server).toEqual({
      ok: true,
      result: { type: 'leaf', actionId: 'gain', params: { food: 2 }, sourceCard: 'CUSTOM_ParityCard' },
    })
    expect(state.players[0]!.minorPlayed).not.toContain('MUTATION_MUST_NOT_LEAK')
  })

  it('returns null identically for a hook the card does not define', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      hook: 'onBeforeEndGame' as const,
      state,
      player: state.players[0]!,
    }
    expect(invokeCustomCodeEffectLocal(request)).toEqual(invokeCustomCodeEffectSync(request))
    expect(invokeCustomCodeEffectLocal(request)).toEqual({ ok: true, result: null })
  })

  it('invokes listeners with identical results', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      registrationId: 'CUSTOM_ParityCard:listener:0',
      context: {
        state,
        player: state.players[0]!,
        space: state.actionSpaces[0]!,
        actionId: 'collect',
        phase: 'after' as const,
      },
    }
    const server = invokeCustomCodeListenerSync(request as never)
    const local = invokeCustomCodeListenerLocal(request as never)
    expect(local).toEqual(server)
    expect(server.ok).toBe(true)
  })

  it('rejects results outside the Workshop Capability Contract identically on every execution path', () => {
    // Leaves are assembled at runtime so that source validation cannot see them.
    const source = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = {
  effect: { id: CARD_ID, onRoundStart: () => ({ type: 'leaf', actionId: ['place', 'farmer'].join('-'), sourceCard: CARD_ID }) },
  listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'],
    handler: () => ({ flow: { type: 'seq', children: [{ type: 'leaf', actionId: ['col', 'lect'].join(''), sourceCard: CARD_ID }] } }) }],
}
`
    const compiled = validateAndCompileCustomCode(source, 'CUSTOM_ParityCard')
    expect(validateAndCompileCustomCodeLocal(source, 'CUSTOM_ParityCard')).toEqual(compiled)
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const base = { compiledCode: compiled.compiledCode, cardId: 'CUSTOM_ParityCard' }
    const effect = { ...base, hook: 'onRoundStart' as const, state, player: state.players[0]! }
    const listener = { ...base, registrationId: 'CUSTOM_ParityCard:listener:0',
      context: { state, player: state.players[0]!, space: state.actionSpaces[0]!, actionId: 'collect', phase: 'after' as const } }

    const effectRejection = { ok: false, error: "onRoundStart: actionId 'place-farmer' is not in the Workshop Capability Contract" }
    expect(invokeCustomCodeEffectSync(effect)).toEqual(effectRejection)
    expect(invokeCustomCodeEffectLocal(effect)).toEqual(effectRejection)

    const listenerRejection = { ok: false, error: "flow.children[0]: actionId 'collect' is not in the Workshop Capability Contract" }
    expect(invokeCustomCodeListenerSync(listener as never)).toEqual(listenerRejection)
    expect(invokeCustomCodeListenerLocal(listener as never)).toEqual(listenerRejection)
  })

  it.each([
    [`effect: { id: CARD_ID, beforeEndGameMandatory: 'false', onBeforeEndGame: () => undefined }`, 'effect beforeEndGameMandatory must be a boolean'],
    [`listeners: [{ phases: ['anytime'], replacesTurn: 1, handler: () => undefined }]`, 'listener replacesTurn must be a boolean'],
    // A function would vanish in serialization and leave the listener optional.
    [`listeners: [{ actions: ['collect'], phases: ['before'], mandatory: () => true, handler: () => undefined }]`, 'listener mandatory must be a boolean'],
  ])('rejects a declaration of the wrong type identically when saving: %s', (impl, message) => {
    const source = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = { ${impl} }
`
    const rejection = { valid: false, errors: [`Compilation failed: ${message}`] }
    expect(validateAndCompileCustomCode(source, 'CUSTOM_ParityCard')).toEqual(rejection)
    expect(validateAndCompileCustomCodeLocal(source, 'CUSTOM_ParityCard')).toEqual(rejection)
  })

  it.each(['NaN', 'Infinity', '-Infinity'])('rejects a hook returning %s identically, before serialization hides it', (value) => {
    const source = `
const CARD_ID = 'CUSTOM_ParityCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Parity Card' })
const CARD_IMPL = { effect: { id: CARD_ID, computeBonusScore: () => ${value} } }
`
    const compiled = validateAndCompileCustomCode(source, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const state = createInitialState(42)
    const request = { compiledCode: compiled.compiledCode, cardId: 'CUSTOM_ParityCard', hook: 'computeBonusScore' as const, state, player: state.players[0]! }

    const rejection = { ok: false, error: 'returned a non-finite number' }
    expect(invokeCustomCodeEffectSync(request)).toEqual(rejection)
    expect(invokeCustomCodeEffectLocal(request)).toEqual(rejection)
  })

  it('reports throwing card code identically as ok:false', () => {
    const compiled = validateAndCompileCustomCode(THROWING_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return

    const state = createInitialState(42)
    const request = {
      compiledCode: compiled.compiledCode,
      cardId: 'CUSTOM_ParityCard',
      hook: 'onReturnHome' as const,
      state,
      player: state.players[0]!,
    }
    const server = invokeCustomCodeEffectSync(request)
    const local = invokeCustomCodeEffectLocal(request)
    expect(server).toEqual({ ok: false, error: expect.stringContaining('parity boom') })
    expect(local).toEqual({ ok: false, error: expect.stringContaining('parity boom') })
  })

  it('registers only the open, well-typed metadata of an already saved manifest on both registrars', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const savedMetadata = { handHooks: ['onReturnHome', 'onBuy'], beforeEndGameScope: 'allPlayers', beforeEndGameMandatory: 'false', paymentPaths: [] }
    const cardData = cardDataFrom(compiled.compiledCode, { ...compiled.manifest, effectMetadata: savedMetadata as never })

    const serverSession = new GameSession(42, [cardData])
    const serverEffect = serverSession.withCtx(() => getCardEffect('CUSTOM_ParityCard'))
    serverSession.dispose()
    const localCore = new GameCore({
      stateOrSeed: 42,
      customCards: [cardData],
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    })
    const localEffect = localCore.withCtx(() => getCardEffect('CUSTOM_ParityCard'))
    localCore.dispose()

    for (const effect of [serverEffect, localEffect]) {
      expect(effect?.handHooks).toEqual(['onReturnHome'])
      expect(effect?.beforeEndGameScope).toBe('allPlayers')
      expect(effect).not.toHaveProperty('beforeEndGameMandatory')
      expect(effect).not.toHaveProperty('paymentPaths')
    }
  })

  it('surfaces runtime failures as cardWarnings on both registrars', () => {
    const compiled = validateAndCompileCustomCode(THROWING_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const cardData = cardDataFrom(compiled.compiledCode, compiled.manifest)

    const serverSession = new GameSession(42, [cardData])
    const serverState = serverSession.withCtx(() => serverSession.getState()).state
    serverSession.withCtx(() =>
      runCardEffectHook(serverState, serverState.players[0]!, 'CUSTOM_ParityCard', 'onReturnHome'),
    )
    expect(serverSession.cardWarnings).toEqual([expect.stringContaining('parity boom')])
    serverSession.dispose()

    const localCore = new GameCore({
      stateOrSeed: 42,
      customCards: [cardData],
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    })
    const localState = localCore.withCtx(() => localCore.getState()).state
    localCore.withCtx(() =>
      runCardEffectHook(localState, localState.players[0]!, 'CUSTOM_ParityCard', 'onReturnHome'),
    )
    expect(localCore.cardWarnings).toEqual([expect.stringContaining('parity boom')])
    localCore.dispose()
  })

  it('runs the same effect through GameCore with the browser registrar as the server session', () => {
    const compiled = validateAndCompileCustomCode(CARD_SOURCE, 'CUSTOM_ParityCard')
    expect(compiled.valid).toBe(true)
    if (!compiled.valid) return
    const cardData = cardDataFrom(compiled.compiledCode, compiled.manifest)

    const run = (core: GameCore) => {
      const state = core.withCtx(() => core.getState()).state
      state.players[0]!.minorPlayed.push('CUSTOM_ParityCard')
      const result = core.withCtx(() =>
        runCardEffectHook(state, state.players[0]!, 'CUSTOM_ParityCard', 'onReturnHome'),
      )
      core.dispose()
      return result
    }

    const serverResult = run(new GameSession(42, [cardData]))
    const localResult = run(new GameCore({
      stateOrSeed: 42,
      customCards: [cardData],
      registerCustomCardImpl: registerBrowserBackedCustomCard,
    }))
    expect(localResult).toEqual(serverResult)
    expect(serverResult).toEqual({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 2 },
      sourceCard: 'CUSTOM_ParityCard',
    })
  })
})

describe('validateFarmChoice request-level errors', () => {
  it('flags missing player / unknown type so the endpoint can return 400', () => {
    const state = createInitialState(42)
    const playerId = state.players[0]!.id
    expect(validateFarmChoice(state, 'room', 'nobody', {}).requestError).toBe(true)
    expect(validateFarmChoice(state, 'bogus' as never, playerId, {}).requestError).toBe(true)
    // An ordinary invalid placement is a well-formed 200 response, not a 400.
    expect(validateFarmChoice(state, 'sow', playerId, {}).requestError).toBeUndefined()
  })
})
