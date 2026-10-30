import type { ActionHookPhase } from '../actions/hooks'
import type { CustomCodeManifest } from './types'
import { listenerContractError } from '../cards/listener-contract'
import { isSandboxListenerAction } from './sandbox-listener-actions'

export const sandboxListenerPhases = [
  'before',
  'immediatelyAfter',
  'after',
  'computeCosts',
  'computeArgs',
  'computeChoiceCandidates',
  'computeReplace',
  'isDoable',
  'anytime',
  'computeExchanges',
] as const satisfies readonly ActionHookPhase[]

export type SandboxListenerPhase = typeof sandboxListenerPhases[number]

export const isSandboxListenerPhase = (value: unknown): value is SandboxListenerPhase =>
  typeof value === 'string' && (sandboxListenerPhases as readonly string[]).includes(value)

export class UnsupportedSandboxListenerError extends Error {
  readonly code: 'unsupported_listener_subscription' | 'unsupported_listener_phase' = 'unsupported_listener_subscription'

  constructor(cardId: string, listenerId: string, detail: string) {
    super(`Custom card ${cardId} listener "${listenerId}": ${detail}`)
    this.name = 'UnsupportedSandboxListenerError'
  }
}

export class UnsupportedSandboxListenerPhaseError extends UnsupportedSandboxListenerError {
  override readonly code = 'unsupported_listener_phase'

  constructor(cardId: string, listenerId: string, phase: unknown) {
    super(cardId, listenerId, `unsupported listener phase '${String(phase)}'`)
    this.name = 'UnsupportedSandboxListenerPhaseError'
  }
}

/** Reject the complete saved manifest before any effects, listeners or workers are installed. */
export const assertSandboxListenerManifest = (cardId: string, manifest: CustomCodeManifest): void => {
  for (const listener of manifest.listeners) {
    for (const phase of Array.isArray(listener.phases) ? listener.phases : []) {
      if (!isSandboxListenerPhase(phase)) {
        throw new UnsupportedSandboxListenerPhaseError(cardId, listener.registrationId, phase)
      }
    }
  }
  for (const listener of manifest.listeners) {
    if ('events' in listener || 'globalQuery' in listener || 'actionSpaces' in listener) throw new UnsupportedSandboxListenerError(cardId, listener.registrationId, 'unsupported selector')
    const error = listenerContractError({ ...listener, id: listener.registrationId })
    if (error) throw new UnsupportedSandboxListenerError(cardId, listener.registrationId, error)
    if (!listener.actions?.every(isSandboxListenerAction)) throw new UnsupportedSandboxListenerError(cardId, listener.registrationId, 'unsupported listener action')
  }
}
