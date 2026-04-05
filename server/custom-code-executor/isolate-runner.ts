/**
 * Pure isolated-vm execution logic — no project imports.
 *
 * This module is loaded by the Worker Thread. It deliberately avoids
 * importing any shared/ modules to keep the worker's dependency tree
 * minimal and avoid module resolution issues across thread boundaries.
 */
import ivm from 'isolated-vm'

const EXECUTION_TIMEOUT_MS = 100
const ISOLATE_MEMORY_LIMIT_MB = 8

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

export interface EffectRequest {
  compiledCode: string
  cardId: string
  hook: string
  state: unknown
  player: unknown
  paymentInfo?: unknown
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
    return { ok: true, result: result ?? null }
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
    return { ok: true, result: result ?? null }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
