/**
 * Browser-local custom-card executor — the browser counterpart of
 * `server/custom-code/engine.ts`.
 *
 * Runs compiled card code via `new Function` instead of an isolated-vm
 * isolate: in the local sandbox the code is the author's own and runs in
 * their own browser, so the only risk is an accidental infinite loop —
 * handled by the worker-level timeout + terminate (see T3), not here.
 *
 * Semantics kept identical to the server executor:
 * - the whole compiled module re-runs on every invocation (no state carries over)
 * - inputs are JSON-deep-copied before injection
 * - results round-trip through JSON (functions stripped)
 * - same injected environment: console shim, MinorImprovement/Occupation
 *   metadata constructors with shared prerequisite normalization, HELPERS_INJECTION_SOURCE
 */
import { validateCardCode } from '../../shared/custom-code/ast-validator.ts'
import { compileCardCode } from '../../shared/custom-code/compiler.ts'
import { HELPERS_INJECTION_SOURCE } from '../../shared/custom-code/injected-helpers.ts'
import type { CardEffectField } from '../../shared/cards/card-effects.ts'
import { MANIFEST_EXTRACTION_SOURCE, normalizeCustomManifest, CARD_DEFINITION_NORMALIZATION_SOURCE } from '../../shared/custom-code/sandbox-declarations.ts'
import { assertCustomCardDefinition, validateCustomEffectResult } from '../../shared/custom-code/runtime-capabilities.ts'
import { validateCustomListenerResult } from '../../shared/custom-code/listener-result-validator.ts'
import type {
  CustomCodeEffectMetadata,
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerManifest,
  CustomCodeListenerResult,
  CustomCodeManifest,
  CustomCodeValidateResult,
} from '../../shared/custom-code/types.ts'

// Defence-in-depth for the browser executor (which is NOT a hard isolate):
// shadow the dangerous worker/DOM globals as `undefined` parameters so card
// code can't reach them lexically even if the AST deny-list is ever bypassed,
// and run under `'use strict'` with a null-prototype `this` so the classic
// `const root = this; root.fetch(...)` escape (non-strict top-level `this`
// binds to WorkerGlobalScope) resolves to a frozen empty object instead.
// The AST validator remains the first line; the real security boundary for
// third-party published cards is the server isolated-vm executor.
// NOTE: `eval` and `arguments` can't appear here — strict-mode functions forbid
// them as parameter names. Both are already blocked by the AST deny-list.
const SHADOWED_GLOBALS = [
  'self', 'globalThis', 'window', 'top', 'parent', 'frames', 'WorkerGlobalScope',
  'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage',
  'indexedDB', 'localStorage', 'sessionStorage', 'caches', 'navigator',
  'Function',
]
const HARMLESS_THIS = Object.freeze(Object.create(null))

// Matches EXECUTION_TIMEOUT_MS in server/custom-code/engine.ts.
const SERVER_EXECUTION_BUDGET_MS = 100

function runCardCode(
  compiledCode: string,
  cardId: string,
  postlude: string,
  inputs: Record<string, unknown>,
): unknown {
  const inputNames = Object.keys(inputs)
  const inputValues = inputNames.map((key) =>
    JSON.parse(JSON.stringify(inputs[key] ?? null)),
  )

  const wrappedCode = `'use strict';
    var console = {
      log: function() { var args = Array.prototype.slice.call(arguments); __log.apply(undefined, args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); })); },
      warn: function() { var args = Array.prototype.slice.call(arguments); __warn.apply(undefined, args.map(function(a) { return typeof a === 'object' ? JSON.stringify(a) : String(a); })); },
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
    return JSON.stringify(__result);
  `

  const fn = new Function('__log', '__warn', ...SHADOWED_GLOBALS, ...inputNames, wrappedCode)
  const start = performance.now()
  const resultJson = fn.call(
    HARMLESS_THIS,
    (...args: unknown[]) => { console.log(`[local-executor:${cardId}]`, ...args) },
    (...args: unknown[]) => { console.warn(`[local-executor:${cardId}]`, ...args) },
    ...SHADOWED_GLOBALS.map(() => undefined),
    ...inputValues,
  ) as string | undefined
  // Synchronous card code can't be interrupted mid-run, so the browser dry-run
  // can't hard-enforce the server's per-invocation budget; warn instead so a
  // card that would time out in multiplayer (server engine.ts caps at 100 ms)
  // is flagged during playtesting rather than silently "passing" locally.
  const elapsed = performance.now() - start
  if (elapsed > SERVER_EXECUTION_BUDGET_MS) {
    console.warn(`[local-executor:${cardId}] execution took ${Math.round(elapsed)}ms, over the server ${SERVER_EXECUTION_BUDGET_MS}ms budget — this card may time out in multiplayer`)
  }
  return resultJson ? JSON.parse(resultJson) : null
}

function runManifestExtraction(compiledCode: string, cardId: string): {
  manifest: CustomCodeManifest
  cardDefinition: Record<string, unknown> | null
} {
  const wrappedCode = `'use strict';
    var console = { log: function() {}, warn: function() {} };
    var __cardDefinitionType = null;
    function MinorImprovement(def) { __cardDefinitionType = 'minor'; return __normalizeCardPrerequisite(def); }
    function Occupation(def) { __cardDefinitionType = 'occupation'; return __normalizeCardPrerequisite(def); }
    ${HELPERS_INJECTION_SOURCE}
      ${CARD_DEFINITION_NORMALIZATION_SOURCE}
    var __captured = (function() {
      ${compiledCode}
      return {
        CARD_DEF: typeof CARD_DEF !== 'undefined' ? CARD_DEF : null,
        CARD_IMPL: typeof CARD_IMPL !== 'undefined' ? CARD_IMPL : null,
      };
    })();
    var __sandbox_card_id = ${JSON.stringify(cardId)};
    ${MANIFEST_EXTRACTION_SOURCE}
    return JSON.stringify({
      effectKeys: __effectKeys,
      effectMetadata: __effectMetadata,
      listeners: __listeners,
      cardDefinition: __captured.CARD_DEF,
      cardDefinitionType: __cardDefinitionType,
    });
  `

  const fn = new Function(...SHADOWED_GLOBALS, wrappedCode)
  const resultJson = fn.call(HARMLESS_THIS, ...SHADOWED_GLOBALS.map(() => undefined)) as string | undefined
  const parsed = resultJson ? JSON.parse(resultJson) as {
    effectKeys: string[]
    effectMetadata?: CustomCodeEffectMetadata
    listeners: CustomCodeListenerManifest[]
    cardDefinition: Record<string, unknown> | null
    cardDefinitionType: 'minor' | 'occupation' | null
  } : {
    effectKeys: [],
    effectMetadata: {},
    listeners: [],
    cardDefinition: null,
    cardDefinitionType: null,
  }

  const manifest = normalizeCustomManifest({ effectHooks: parsed.effectKeys as CardEffectField[], effectMetadata: parsed.effectMetadata, listeners: parsed.listeners }, cardId)
  if (parsed.cardDefinition) assertCustomCardDefinition(parsed.cardDefinition, cardId)
  return {
    manifest,
    cardDefinition: parsed.cardDefinition && parsed.cardDefinitionType
      ? {
          cardType: parsed.cardDefinitionType,
          meta: parsed.cardDefinition,
        }
      : parsed.cardDefinition,
  }
}

export const validateAndCompileCustomCodeLocal = (
  source: string,
  cardId: string,
): CustomCodeValidateResult => {
  const validation = validateCardCode(source, cardId)
  if (!validation.valid) {
    return validation
  }

  try {
    const compiledCode = compileCardCode(source)
    const { manifest, cardDefinition } = runManifestExtraction(compiledCode, cardId)
    return {
      valid: true,
      compiledCode,
      manifest,
      cardDefinition,
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`Compilation failed: ${error instanceof Error ? error.message : String(error)}`],
    }
  }
}

export const invokeCustomCodeEffectLocal = (
  request: CustomCodeEffectInvocation,
): CustomCodeEffectResult => {
  try {
    const postlude = `
var __eff = __captured.CARD_IMPL && __captured.CARD_IMPL.effect;
var __handler = __eff && __eff[${JSON.stringify(request.hook)}];
__result = typeof __handler === 'function'
  ? __handler.apply(null, __input_args)
  : null;
    `
    const result = runCardCode(
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

export const invokeCustomCodeListenerLocal = (
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
    const result = runCardCode(
      request.compiledCode,
      request.cardId,
      postlude,
      {
        __input_context: request.context,
      },
    )
    return { ok: true, result: validateCustomListenerResult(result, request.cardId, request.context) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
