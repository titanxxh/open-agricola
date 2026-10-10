import ivm from 'isolated-vm'
import { validateCardCode } from '../../shared/custom-code/ast-validator.ts'
import { compileCardCode } from '../../shared/custom-code/compiler.ts'
import { normalizeCustomManifest, type RawCustomManifest } from '../../shared/custom-code/contract-admission.ts'
import type { CustomCodeManifest, CustomCodeValidateResult } from '../../shared/custom-code/types.ts'
import { HELPERS_INJECTION_SOURCE } from '../../shared/custom-code/injected-helpers.ts'

import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../../shared/custom-code/runtime-limits.ts'

/**
 * Run compiled code to extract the manifest (effect hooks + listener registrations).
 * This uses a lighter execution — just runs the top-level code to capture CARD_IMPL.
 */
function runManifestExtraction(compiledCode: string, cardId: string): {
  manifest: CustomCodeManifest
  cardDefinition: Record<string, unknown> | null
} {
  const isolate = new ivm.Isolate({ memoryLimit: ISOLATE_MEMORY_LIMIT_MB })
  try {
    const context = isolate.createContextSync()
    const jail = context.global
    jail.setSync('global', jail.derefInto())

    const wrappedCode = `
      var console = { log: function() {}, warn: function() {} };
      var __cardDefinitionType = null;
      function MinorImprovement(def) { __cardDefinitionType = 'minor'; return def; }
      function Occupation(def) { __cardDefinitionType = 'occupation'; return def; }
      ${HELPERS_INJECTION_SOURCE}
      var __captured = (function() {
        ${compiledCode}
        return {
          CARD_DEF: typeof CARD_DEF !== 'undefined' ? CARD_DEF : null,
          CARD_IMPL: typeof CARD_IMPL !== 'undefined' ? CARD_IMPL : null,
        };
      })();
      var __effectKeys = [];
      var __effectMetadata = {};
      var __listeners = [];
      if (__captured.CARD_IMPL && __captured.CARD_IMPL.effect) {
        var eff = __captured.CARD_IMPL.effect;
        for (var k in eff) {
          if (Object.prototype.hasOwnProperty.call(eff, k) && typeof eff[k] === 'function') {
            __effectKeys.push(k);
          }
        }
        if (Array.isArray(eff.handHooks)) {
          __effectMetadata.handHooks = eff.handHooks;
        }
      }
      if (__captured.CARD_IMPL && Array.isArray(__captured.CARD_IMPL.listeners)) {
        for (var i = 0; i < __captured.CARD_IMPL.listeners.length; i++) {
          var listener = __captured.CARD_IMPL.listeners[i];
          var registrationId = ${JSON.stringify(cardId)} + ':listener:' + i;
          __listeners.push({
            registrationId: registrationId,
            cardIds: Array.isArray(listener.cardIds) ? listener.cardIds : undefined,
            actions: Array.isArray(listener.actions) ? listener.actions : undefined,
            phases: Array.isArray(listener.phases) ? listener.phases : undefined,
            scope: listener.scope,
          });
        }
      }
      JSON.stringify({
        effectKeys: __effectKeys,
        effectMetadata: __effectMetadata,
        listeners: __listeners,
        cardDefinition: __captured.CARD_DEF,
        cardDefinitionType: __cardDefinitionType,
      });
    `

    const script = isolate.compileScriptSync(wrappedCode)
    const resultJson = script.runSync(context, { timeout: EXECUTION_TIMEOUT_MS })
    const parsed = resultJson ? JSON.parse(resultJson as string) as RawCustomManifest & {
      cardDefinition: Record<string, unknown> | null
      cardDefinitionType: 'minor' | 'occupation' | null
    } : {
      effectKeys: [],
      effectMetadata: {},
      listeners: [],
      cardDefinition: null,
      cardDefinitionType: null,
    }

    return {
      manifest: normalizeCustomManifest(parsed, cardId),
      cardDefinition: parsed.cardDefinition && parsed.cardDefinitionType
        ? {
            cardType: parsed.cardDefinitionType,
            meta: parsed.cardDefinition,
          }
        : parsed.cardDefinition,
    }
  } finally {
    isolate.dispose()
  }
}

export const validateAndCompileCustomCode = (
  source: string,
  cardId: string,
): CustomCodeValidateResult => {
  const validation = validateCardCode(source, cardId)
  if (!validation.valid) {
    return validation
  }

  try {
    const compiledCode = compileCardCode(source)
    const { manifest, cardDefinition } = extractManifestFromCompiledCode(compiledCode, cardId)
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

const extractManifestFromCompiledCode = (
  compiledCode: string,
  cardId: string,
): {
  manifest: CustomCodeManifest
  cardDefinition: Record<string, unknown> | null
} => {
  return runManifestExtraction(compiledCode, cardId)
}
