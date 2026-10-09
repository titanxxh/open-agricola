/**
 * Isolated-vm worker execution with shared capability admission.
 *
 * This module is loaded by the Worker Thread. It deliberately avoids
 * importing the card registry or engine. Its shared imports are pure data and
 * admission functions, keeping the worker independent of session context.
 *
 * The host performs native listener cost attribution validation as well.
 */
import ivm from 'isolated-vm'
import { validateCustomEffectResult, assertCustomListenerCapabilities } from '../../shared/custom-code/runtime-capabilities.ts'
import { HELPERS_INJECTION_SOURCE } from '../../shared/custom-code/injected-helpers.ts'
import { CARD_DEFINITION_NORMALIZATION_SOURCE } from '../../shared/custom-code/sandbox-declarations.ts'

import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../../shared/custom-code/runtime-limits.ts'

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

    jail.setSync('global', jail.derefInto())
    for (const [key, value] of Object.entries(inputs)) {
      const jsonSafe = JSON.parse(JSON.stringify(value ?? null))
      jail.setSync(key, new ivm.ExternalCopy(jsonSafe).copyInto())
    }

    jail.setSync('__log', new ivm.Reference((...args: unknown[]) => {
      console.log(`[executor:${cardId}]`, ...args)
    }))
    jail.setSync('__warn', new ivm.Reference((...args: unknown[]) => {
      console.warn(`[executor:${cardId}]`, ...args)
    }))

    const wrappedCode = `
      var console = {
        log: function() { var args = Array.prototype.slice.call(arguments); __log.applySync(undefined, args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); })); },
        warn: function() { var args = Array.prototype.slice.call(arguments); __warn.applySync(undefined, args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); })); },
      };
      function MinorImprovement(def) { return __normalizeCardPrerequisite(def); }
      function Occupation(def) { return __normalizeCardPrerequisite(def); }
      ${HELPERS_INJECTION_SOURCE}
      ${CARD_DEFINITION_NORMALIZATION_SOURCE}
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

export interface EffectRequest {
  compiledCode: string
  cardId: string
  hook: string
  args: unknown[]
}

export interface ListenerRequest {
  compiledCode: string
  cardId: string
  registrationId: string
  context: unknown
}

export interface InvokeResult {
  ok: boolean
  result?: unknown
  error?: string
}

export function invokeEffect(request: EffectRequest): InvokeResult {
  try {
    const postlude = `
var __eff = __captured.CARD_IMPL && __captured.CARD_IMPL.effect;
var __handler = __eff && __eff[${JSON.stringify(request.hook)}];
__result = typeof __handler === 'function'
  ? __handler.apply(null, __input_args)
  : null;
    `
    const result = runInIsolate(
      request.compiledCode,
      request.cardId,
      postlude,
      {
        __input_args: request.args,
      },
    )
    return { ok: true, result: validateCustomEffectResult(result, request.cardId, request.hook, request.args) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function invokeListener(request: ListenerRequest): InvokeResult {
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
    assertCustomListenerCapabilities(result, request.cardId, request.context as import('../../shared/cards/card-listeners.ts').CardListenerContext)
    return { ok: true, result: result ?? null }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
