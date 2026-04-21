/**
 * Compile validated TypeScript card code to JS and execute in a VM sandbox.
 *
 * The AST validator (ast-validator.ts) must pass BEFORE calling these functions.
 * The VM sandbox provides only: registerCardEffect, registerCardListener, console.
 */
import ts from 'typescript'
import vm from 'node:vm'
import { type CardEffect } from '../../shared/cards/card-effects.ts'
import { registerCardEffect } from '../../shared/cards/registry-ops.ts'
import { type CardListenerRegistration } from '../../shared/cards/card-listeners.ts'
import { registerCardListener } from '../../shared/cards/registry-ops.ts'

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
 * The code can call registerCardEffect() and registerCardListener() which
 * are injected into the sandbox and delegate to the real registration functions.
 *
 * Throws on timeout (100ms) or runtime error.
 */
export function executeCardCode(compiledJs: string, cardId: string): void {
  const registeredEffects: CardEffect[] = []
  const registeredListeners: CardListenerRegistration[] = []

  const sandbox = {
    registerCardEffect: (effect: CardEffect) => {
      // Force the card ID to match
      registeredEffects.push({ ...effect, id: cardId })
    },
    registerCardListener: (listener: CardListenerRegistration) => {
      registeredListeners.push({ ...listener, id: cardId })
    },
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

  vm.runInNewContext(compiledJs, sandbox, {
    timeout: VM_TIMEOUT_MS,
    filename: `${cardId}.js`,
  })

  // Commit registrations to the real registries
  for (const effect of registeredEffects) {
    registerCardEffect(effect)
  }
  for (const listener of registeredListeners) {
    registerCardListener(listener)
  }
}
