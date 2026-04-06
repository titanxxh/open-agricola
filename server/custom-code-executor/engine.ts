import ivm from 'isolated-vm'
import type { ActionHookPhase } from '../../shared/actions/hooks.ts'
import { validateCardCode } from '../ast-validator.ts'
import { compileCardCode } from '../card-compiler.ts'
import { cardEffectHooks, type CardEffectHook } from '../../shared/cards/card-effects.ts'
import type { CardListenerScope } from '../../shared/cards/card-listeners.ts'
import type { ActionFlow } from '../../shared/game/types.ts'
import type { ActionHookResult } from '../../shared/actions/hooks.ts'
import type {
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerManifest,
  CustomCodeListenerResult,
  CustomCodeManifest,
  CustomCodeValidateResult,
} from '../../shared/cards/custom-code-types.ts'

const EXECUTION_TIMEOUT_MS = 100
const ISOLATE_MEMORY_LIMIT_MB = 8

const isActionHookPhase = (value: unknown): value is ActionHookPhase =>
  typeof value === 'string' && [
    'before',
    'during',
    'immediatelyAfter',
    'after',
    'computeCosts',
    'computeArgs',
    'computeReplace',
    'isDoable',
    'canUseOccupied',
    'computeCardCosts',
  ].includes(value)

const isCardListenerScope = (value: unknown): value is CardListenerScope =>
  value === 'player' || value === 'opponent' || value === 'any'

/**
 * Run compiled card code in a true V8 isolate (via isolated-vm).
 *
 * Unlike node:vm, this provides real security:
 * - Separate V8 heap — no prototype chain escapes
 * - Memory limit enforcement
 * - CPU timeout enforcement
 * - No access to Node.js APIs whatsoever
 */
function runInIsolate(
  compiledCode: string,
  cardId: string,
  postlude: string,
  inputs: Record<string, unknown>,
): unknown {
  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT_MB })
  try {
    const context = isolate.createContextSync()
    const jail = context.global

    // Provide safe built-in stubs (console, Math, etc.)
    jail.setSync('global', jail.derefInto())
    // JSON-serialize inputs to strip functions before passing into isolate
    for (const [key, value] of Object.entries(inputs)) {
      const jsonSafe = JSON.parse(JSON.stringify(value ?? null))
      jail.setSync(key, new ivm.ExternalCopy(jsonSafe).copyInto())
    }

    // Inject a minimal console stub
    jail.setSync('__log', new ivm.Reference((...args: unknown[]) => {
      console.log(`[executor:${cardId}]`, ...args)
    }))
    jail.setSync('__warn', new ivm.Reference((...args: unknown[]) => {
      console.warn(`[executor:${cardId}]`, ...args)
    }))

    // The script:
    // 1. Define stubs for console, registerCardEffect, registerCardListener
    // 2. Run the compiled card code
    // 3. Run the postlude to invoke specific hooks/listeners
    // 4. Copy the result out as JSON
    const wrappedCode = `
      const console = {
        log: (...args) => __log.applySync(undefined, args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a))),
        warn: (...args) => __warn.applySync(undefined, args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a))),
      };
      const __capture = { effect: null, listeners: [] };
      function registerCardEffect(effect) {
        __capture.effect = { ...(__capture.effect || {}), ...effect, id: ${JSON.stringify(cardId)} };
      }
      function registerCardListener(listener) {
        const registrationId = ${JSON.stringify(cardId)} + ':listener:' + __capture.listeners.length;
        __capture.listeners.push({
          registrationId,
          cardIds: Array.isArray(listener.cardIds) ? listener.cardIds.filter(i => typeof i === 'string') : undefined,
          actions: Array.isArray(listener.actions) ? listener.actions.filter(i => typeof i === 'string') : undefined,
          phases: Array.isArray(listener.phases) ? listener.phases : undefined,
          order: typeof listener.order === 'number' ? listener.order : undefined,
          scope: typeof listener.scope === 'string' ? listener.scope : undefined,
          handler: typeof listener.handler === 'function' ? listener.handler : () => undefined,
        });
      }
      function MinorImprovement(def) { return def; }
      function Occupation(def) { return def; }
      let __result = null;
      ${compiledCode}
      ${postlude}
      JSON.stringify(__result);
    `

    const script = isolate.compileScriptSync(wrappedCode)
    const resultJson = script.runSync(context, { timeout: EXECUTION_TIMEOUT_MS })
    return resultJson ? JSON.parse(resultJson as string) : null
  } finally {
    isolate.dispose()
  }
}

/**
 * Run compiled code to extract the manifest (effect hooks + listener registrations).
 * This uses a lighter execution — just runs the top-level code to capture registrations.
 */
function runManifestExtraction(compiledCode: string, cardId: string): {
  effectHooks: CardEffectHook[]
  listeners: CustomCodeListenerManifest[]
} {
  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT_MB })
  try {
    const context = isolate.createContextSync()
    const jail = context.global
    jail.setSync('global', jail.derefInto())

    const wrappedCode = `
      const console = { log: () => {}, warn: () => {} };
      function MinorImprovement(def) { return def; }
      function Occupation(def) { return def; }
      const __capture = { effect: null, listeners: [] };
      function registerCardEffect(effect) {
        __capture.effect = { ...(__capture.effect || {}), ...effect, id: ${JSON.stringify(cardId)} };
      }
      function registerCardListener(listener) {
        const registrationId = ${JSON.stringify(cardId)} + ':listener:' + __capture.listeners.length;
        __capture.listeners.push({
          registrationId,
          cardIds: Array.isArray(listener.cardIds) ? listener.cardIds.filter(i => typeof i === 'string') : undefined,
          actions: Array.isArray(listener.actions) ? listener.actions.filter(i => typeof i === 'string') : undefined,
          phases: Array.isArray(listener.phases) ? listener.phases : undefined,
          order: typeof listener.order === 'number' ? listener.order : undefined,
          scope: typeof listener.scope === 'string' ? listener.scope : undefined,
          handler: typeof listener.handler === 'function' ? listener.handler : () => undefined,
        });
      }
      ${compiledCode}
      JSON.stringify({
        effectKeys: __capture.effect ? Object.keys(__capture.effect).filter(k => typeof __capture.effect[k] === 'function') : [],
        listeners: __capture.listeners.map(({ handler, ...rest }) => rest),
      });
    `

    const script = isolate.compileScriptSync(wrappedCode)
    const resultJson = script.runSync(context, { timeout: EXECUTION_TIMEOUT_MS })
    const parsed = resultJson ? JSON.parse(resultJson as string) as {
      effectKeys: string[]
      listeners: CustomCodeListenerManifest[]
    } : { effectKeys: [], listeners: [] }

    const effectHooks = parsed.effectKeys.filter((hook): hook is CardEffectHook =>
      cardEffectHooks.includes(hook as CardEffectHook),
    )
    const listeners = parsed.listeners.map((l) => ({
      ...l,
      phases: l.phases?.filter(isActionHookPhase),
      scope: isCardListenerScope(l.scope) ? l.scope : undefined,
    }))

    return { effectHooks, listeners }
  } finally {
    isolate.dispose()
  }
}

export const validateAndCompileCustomCode = (
  source: string,
  cardId: string,
): CustomCodeValidateResult => {
  const validation = validateCardCode(source)
  if (!validation.valid) {
    return validation
  }

  try {
    const compiledCode = compileCardCode(source)
    const manifest = extractManifestFromCompiledCode(compiledCode, cardId)
    return {
      valid: true,
      compiledCode,
      manifest,
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`Compilation failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

export const extractManifestFromCompiledCode = (
  compiledCode: string,
  cardId: string,
): CustomCodeManifest => {
  return runManifestExtraction(compiledCode, cardId)
}

export const invokeCustomCodeEffect = (
  request: CustomCodeEffectInvocation,
): CustomCodeEffectResult => {
  try {
    const postlude = `
const __handler = __capture.effect?.[${JSON.stringify(request.hook)}]
__result = typeof __handler === 'function'
  ? __handler(__input_state, __input_player, __input_paymentInfo)
  : null
    `
    const result = runInIsolate(
      request.compiledCode,
      request.cardId,
      postlude,
      {
        __input_state: request.state,
        __input_player: request.player,
        __input_paymentInfo: request.paymentInfo ?? null,
      },
    )
    return { ok: true, result: (result ?? null) as ActionFlow | null }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const invokeCustomCodeListener = (
  request: CustomCodeListenerInvocation,
): CustomCodeListenerResult => {
  try {
    const postlude = `
const __listener = __capture.listeners.find((entry) => entry.registrationId === ${JSON.stringify(request.registrationId)})
__result = __listener && typeof __listener.handler === 'function'
  ? __listener.handler(__input_context)
  : null
    `
    const result = runInIsolate(
      request.compiledCode,
      request.cardId,
      postlude,
      {
        __input_context: request.context,
      },
    )
    return { ok: true, result: (result ?? null) as ActionHookResult | null }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const parseEffectHook = (value: string): CardEffectHook | null =>
  cardEffectHooks.includes(value as CardEffectHook)
    ? value as CardEffectHook
    : null
