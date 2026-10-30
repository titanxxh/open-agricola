import { validateCardCode } from './ast-validator.ts'
import { compileCardCode } from './compiler.ts'
import { normalizeCustomManifest, type RawCustomManifest } from './contract-admission.ts'
import { sandboxEffectMetadataKeys, sandboxListenerDataFields } from './sandbox-declarations.ts'
import { HELPERS_INJECTION_SOURCE } from './injected-helpers.ts'
import type { CustomCodeValidateResult } from './types.ts'

export function validateAndCompileCard(
  source: string,
  cardId: string,
  runExtraction: (script: string) => unknown,
): CustomCodeValidateResult {
  const validation = validateCardCode(source, cardId)
  if (!validation.valid) return validation
  try {
    const compiledCode = compileCardCode(source)
    const extractionSource = `(function() {
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
        var __metadataKeys = ${JSON.stringify(sandboxEffectMetadataKeys)};
        for (var m = 0; m < __metadataKeys.length; m++) {
          if (Object.prototype.hasOwnProperty.call(eff, __metadataKeys[m])) {
            __effectMetadata[__metadataKeys[m]] = eff[__metadataKeys[m]];
          }
        }
      }
      if (__captured.CARD_IMPL && Array.isArray(__captured.CARD_IMPL.listeners)) {
        for (var i = 0; i < __captured.CARD_IMPL.listeners.length; i++) {
          var listener = __captured.CARD_IMPL.listeners[i];
          var registrationId = ${JSON.stringify(cardId)} + ':listener:' + i;
          var __entry = {
            registrationId: registrationId,
            cardIds: Array.isArray(listener.cardIds) ? listener.cardIds : undefined,
            actions: Array.isArray(listener.actions) ? listener.actions : undefined,
            phases: Array.isArray(listener.phases) ? listener.phases : undefined,
            scope: listener.scope,
          };
          var __dataFields = ${JSON.stringify(sandboxListenerDataFields)};
          for (var d = 0; d < __dataFields.length; d++) {
            // JSON would drop a function and hide the declaration from admission.
            var __value = listener[__dataFields[d]];
            __entry[__dataFields[d]] = typeof __value === 'function' ? '[function]' : __value;
          }
          __listeners.push(__entry);
        }
      }
      return JSON.stringify({
        effectKeys: __effectKeys,
        effectMetadata: __effectMetadata,
        listeners: __listeners,
        cardDefinition: __captured.CARD_DEF,
        cardDefinitionType: __cardDefinitionType,
      });
    })()`

    const resultJson = runExtraction(extractionSource)
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
      valid: true,
      compiledCode,
      manifest: normalizeCustomManifest(parsed, cardId),
      cardDefinition: parsed.cardDefinition && parsed.cardDefinitionType
        ? {
            cardType: parsed.cardDefinitionType,
            meta: parsed.cardDefinition,
          }
        : parsed.cardDefinition,
    }
  } catch (error) {
    return { valid: false, errors: [`Compilation failed: ${error instanceof Error ? error.message : String(error)}`] }
  }
}
