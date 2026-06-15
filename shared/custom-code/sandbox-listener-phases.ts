import type { ActionHookPhase } from '../actions/hooks'

export const sandboxListenerPhases = [
  'before',
  'during',
  'immediatelyAfter',
  'after',
  'computeCosts',
  'computeArgs',
  'computeChoiceCandidates',
  'computeReplace',
  'isDoable',
  'anytime',
] as const satisfies readonly ActionHookPhase[]

export type SandboxListenerPhase = typeof sandboxListenerPhases[number]

export const isSandboxListenerPhase = (value: unknown): value is SandboxListenerPhase =>
  typeof value === 'string' && (sandboxListenerPhases as readonly string[]).includes(value)
