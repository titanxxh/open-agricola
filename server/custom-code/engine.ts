import ivm from 'isolated-vm'
import type { ActionHookPhase } from '../../shared/actions/hooks.ts'
import { validateCardCode } from '../../shared/custom-code/ast-validator.ts'
import { compileCardCode } from './compiler.ts'
import { cardEffectHooks, type CardEffectField } from '../../shared/cards/card-effects.ts'
import type { CardListenerScope } from '../../shared/cards/card-listeners.ts'
import type { ActionFlow } from '../../shared/contract/types.ts'
import type { ActionHookResult } from '../../shared/actions/hooks.ts'
import type {
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerManifest,
  CustomCodeListenerResult,
  CustomCodeManifest,
  CustomCodeValidateResult,
} from '../../shared/custom-code/types.ts'
import { HELPERS_INJECTION_SOURCE } from './injected-helpers.ts'

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
    'anytime',
    'computeChoiceCandidates',
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
    // 1. Define stubs for console, MinorImprovement, Occupation
    // 2. Inject helper functions (gainLeaf, payLeaf, etc.)
    // 3. Run the compiled card code in an IIFE to capture CARD_DEF/CARD_IMPL
    // 4. Run the postlude to invoke specific hooks/listeners
    // 5. Copy the result out as JSON
    const wrappedCode = `
      var console = {
        log: function() { var args = Array.prototype.slice.call(arguments); __log.applySync(undefined, args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); })); },
        warn: function() { var args = Array.prototype.slice.call(arguments); __warn.applySync(undefined, args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); })); },
      };
      function MinorImprovement(def) { return def; }
      function Occupation(def) { return def; }
      ${HELPERS_INJECTION_SOURCE}
      var __captured = (function() {
        ${compiledCode}
        return {
          CARD_DEF: typeof CARD_DEF !== 'undefined' ? CARD_DEF : null,
          CARD_IMPL: typeof CARD_IMPL !== 'undefined' ? CARD_IMPL : null,
        };
      })();
      var __result = null;
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
 * This uses a lighter execution — just runs the top-level code to capture CARD_IMPL.
 */
function runManifestExtraction(compiledCode: string, cardId: string): {
  effectHooks: CardEffectField[]
  listeners: CustomCodeListenerManifest[]
} {
  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT_MB })
  try {
    const context = isolate.createContextSync()
    const jail = context.global
    jail.setSync('global', jail.derefInto())

    const wrappedCode = `
      var console = { log: function() {}, warn: function() {} };
      function MinorImprovement(def) { return def; }
      function Occupation(def) { return def; }
      ${HELPERS_INJECTION_SOURCE}
      var __captured = (function() {
        ${compiledCode}
        return {
          CARD_DEF: typeof CARD_DEF !== 'undefined' ? CARD_DEF : null,
          CARD_IMPL: typeof CARD_IMPL !== 'undefined' ? CARD_IMPL : null,
        };
      })();
      var __effectKeys = [];
      var __listeners = [];
      if (__captured.CARD_IMPL && __captured.CARD_IMPL.effect) {
        var eff = __captured.CARD_IMPL.effect;
        for (var k in eff) {
          if (Object.prototype.hasOwnProperty.call(eff, k) && typeof eff[k] === 'function') {
            __effectKeys.push(k);
          }
        }
      }
      if (__captured.CARD_IMPL && Array.isArray(__captured.CARD_IMPL.listeners)) {
        for (var i = 0; i < __captured.CARD_IMPL.listeners.length; i++) {
          var listener = __captured.CARD_IMPL.listeners[i];
          var registrationId = ${JSON.stringify(cardId)} + ':listener:' + i;
          __listeners.push({
            registrationId: registrationId,
            cardIds: Array.isArray(listener.cardIds) ? listener.cardIds.filter(function(x) { return typeof x === 'string'; }) : undefined,
            actions: Array.isArray(listener.actions) ? listener.actions.filter(function(x) { return typeof x === 'string'; }) : undefined,
            phases: Array.isArray(listener.phases) ? listener.phases : undefined,
            order: typeof listener.order === 'number' ? listener.order : undefined,
            scope: typeof listener.scope === 'string' ? listener.scope : undefined,
          });
        }
      }
      JSON.stringify({
        effectKeys: __effectKeys,
        listeners: __listeners,
      });
    `

    const script = isolate.compileScriptSync(wrappedCode)
    const resultJson = script.runSync(context, { timeout: EXECUTION_TIMEOUT_MS })
    const parsed = resultJson ? JSON.parse(resultJson as string) as {
      effectKeys: string[]
      listeners: CustomCodeListenerManifest[]
    } : { effectKeys: [], listeners: [] }

    const effectHooks = parsed.effectKeys.filter((hook): hook is CardEffectField =>
      cardEffectHooks.includes(hook as CardEffectField),
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

const extractManifestFromCompiledCode = (
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
var __eff = __captured.CARD_IMPL && __captured.CARD_IMPL.effect;
var __handler = __eff && __eff[${JSON.stringify(request.hook)}];
__result = typeof __handler === 'function'
  ? __handler(__input_state, __input_player, __input_paymentInfo)
  : null;
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
var __listeners = __captured.CARD_IMPL && Array.isArray(__captured.CARD_IMPL.listeners) ? __captured.CARD_IMPL.listeners : [];
var __listenerIdx = -1;
var __regPrefix = ${JSON.stringify(request.registrationId)};
var __parts = __regPrefix.split(':listener:');
if (__parts.length === 2) { __listenerIdx = parseInt(__parts[1], 10); }
var __listener = __listenerIdx >= 0 && __listenerIdx < __listeners.length ? __listeners[__listenerIdx] : null;
__result = __listener && typeof __listener.handler === 'function'
  ? __listener.handler(__input_context)
  : null;
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

