/**
 * Compile validated TypeScript card code to JS and execute in a VM sandbox.
 *
 * The AST validator (ast-validator.ts) must pass BEFORE calling these functions.
 * The VM sandbox provides: console, MinorImprovement, Occupation stubs,
 * and helper functions (gainLeaf, payLeaf, etc.).
 *
 * User code defines top-level `const CARD_DEF` and `const CARD_IMPL` which
 * are captured by the IIFE wrapper and registered into the active registry.
 */
import ts from 'typescript'
import vm from 'node:vm'
import { type CardEffect } from '../../shared/cards/card-effects.ts'
import { type CardListenerRegistration } from '../../shared/cards/card-listeners.ts'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry.ts'
import { HELPERS_INJECTION_SOURCE } from './injected-helpers.ts'

const VM_TIMEOUT_MS = 100

/**
 * Transpile TypeScript source to JavaScript.
 * Assumes AST validation has already passed.
 */
export function compileCardCode(source: string): string {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: false,
      esModuleInterop: true,
      removeComments: true,
    },
  })
  return result.outputText
}

/**
 * Execute pre-compiled JS card code in a sandboxed VM context.
 *
 * The code defines CARD_DEF and CARD_IMPL top-level consts.
 * CARD_IMPL.effect and CARD_IMPL.listeners are extracted and
 * registered into the active card registry.
 *
 * Throws on timeout (100ms) or runtime error.
 */
export function executeCardCode(compiledJs: string, cardId: string): void {
  const sandbox = {
    console: {
      log: (...args: unknown[]) => console.log(`[card:${cardId}]`, ...args),
      warn: (...args: unknown[]) => console.warn(`[card:${cardId}]`, ...args),
    },
    // Card class stubs (card definition is parsed by frontend, not executed here)
    MinorImprovement: function (def: unknown) { return def },
    Occupation: function (def: unknown) { return def },
    // Safe built-ins
    Math,
    Number,
    String,
    Array,
    Object,
    Boolean,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  }

  // Inject helper functions into the sandbox
  vm.runInNewContext(HELPERS_INJECTION_SOURCE, sandbox, {
    timeout: VM_TIMEOUT_MS,
    filename: `${cardId}-helpers.js`,
  })

  // Wrap user code in IIFE to capture CARD_DEF/CARD_IMPL from const scope
  const wrappedCode = `
    (function() {
      ${compiledJs}
      return {
        CARD_DEF: typeof CARD_DEF !== 'undefined' ? CARD_DEF : null,
        CARD_IMPL: typeof CARD_IMPL !== 'undefined' ? CARD_IMPL : null,
      };
    })()
  `

  const captured = vm.runInNewContext(wrappedCode, sandbox, {
    timeout: VM_TIMEOUT_MS,
    filename: `${cardId}.js`,
  }) as { CARD_DEF: unknown; CARD_IMPL: { effect?: CardEffect; listeners?: CardListenerRegistration[] } | null }

  // Commit registrations to the active registry
  const registry = requireActiveCardRegistry('executeCardCode')

  if (captured.CARD_IMPL?.effect) {
    registry.setEffect({ ...captured.CARD_IMPL.effect, id: cardId })
  }

  if (captured.CARD_IMPL?.listeners) {
    for (const listener of captured.CARD_IMPL.listeners) {
      registry.registerListener({ ...listener, id: cardId })
    }
  }
}
