import vm from 'node:vm'
import { validateCardCode } from '../ast-validator.ts'
import { compileCardCode } from '../card-compiler.ts'
import { cardEffectHooks, type CardEffectHook } from '../../shared/cards/card-effects.ts'
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

type CapturedListener = CustomCodeListenerManifest & {
  handler: (context: unknown) => unknown
}

type ExecutionCapture = {
  effect: Record<string, unknown> | null
  listeners: CapturedListener[]
}

const createBaseSandbox = (cardId: string) => ({
  console: {
    log: (...args: unknown[]) => console.log(`[executor:${cardId}]`, ...args),
    warn: (...args: unknown[]) => console.warn(`[executor:${cardId}]`, ...args),
  },
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
  Date,
  exports: {},
  module: { exports: {} },
})

const sanitizeSerializable = <T>(value: T): T => {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

const executeWithCapture = (
  compiledCode: string,
  cardId: string,
  postlude = '',
  inputs: Record<string, unknown> = {},
): {
  capture: ExecutionCapture
  result?: unknown
} => {
  const capture: ExecutionCapture = {
    effect: null,
    listeners: [],
  }

  const sandbox = {
    ...createBaseSandbox(cardId),
    __capture: capture,
    ...inputs,
    registerCardEffect: (effect: Record<string, unknown>) => {
      capture.effect = {
        ...(capture.effect ?? {}),
        ...effect,
        id: cardId,
      }
    },
    registerCardListener: (listener: Record<string, unknown>) => {
      const registrationId = `${cardId}:listener:${capture.listeners.length}`
      capture.listeners.push({
        registrationId,
        cardIds: Array.isArray(listener.cardIds)
          ? listener.cardIds.filter((item): item is string => typeof item === 'string')
          : undefined,
        actions: Array.isArray(listener.actions)
          ? listener.actions.filter((item): item is string => typeof item === 'string')
          : undefined,
        phases: Array.isArray(listener.phases)
          ? listener.phases.filter((item): item is string => typeof item === 'string')
          : undefined,
        order: typeof listener.order === 'number' ? listener.order : undefined,
        scope: typeof listener.scope === 'string' ? listener.scope : undefined,
        handler: typeof listener.handler === 'function'
          ? listener.handler as (context: unknown) => unknown
          : () => undefined,
      })
    },
    __result: null as unknown,
  }

  vm.runInNewContext(
    `${compiledCode}\n${postlude}`,
    sandbox,
    {
      timeout: EXECUTION_TIMEOUT_MS,
      filename: `${cardId}.js`,
    },
  )

  return {
    capture,
    result: sanitizeSerializable(sandbox.__result),
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
  const { capture } = executeWithCapture(compiledCode, cardId)
  const effectHooks = cardEffectHooks.filter((hook) => typeof capture.effect?.[hook] === 'function')
  return {
    effectHooks,
    listeners: capture.listeners.map(({ handler: _handler, ...listener }) => listener),
  }
}

export const invokeCustomCodeEffect = (
  request: CustomCodeEffectInvocation,
): CustomCodeEffectResult => {
  try {
    const { result } = executeWithCapture(
      request.compiledCode,
      request.cardId,
      `
const __handler = __capture.effect?.[${JSON.stringify(request.hook)}]
__result = typeof __handler === 'function'
  ? __handler(__input_state, __input_player, __input_paymentInfo)
  : null
      `,
      {
        __input_state: request.state,
        __input_player: request.player,
        __input_paymentInfo: request.paymentInfo ?? null,
      },
    )
    return { ok: true, result: (result ?? null) as CustomCodeEffectResult['result'] }
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
    const { result } = executeWithCapture(
      request.compiledCode,
      request.cardId,
      `
const __listener = __capture.listeners.find((entry) => entry.registrationId === ${JSON.stringify(request.registrationId)})
__result = __listener && typeof __listener.handler === 'function'
  ? __listener.handler(__input_context)
  : null
      `,
      {
        __input_context: request.context,
      },
    )
    return { ok: true, result: (result ?? null) as CustomCodeListenerResult['result'] }
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
