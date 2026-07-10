import type { CardListenerScope } from '../cards/card-listeners'

export const sandboxListenerScopes = [
  'player',
  'opponent',
  'any',
] as const satisfies readonly CardListenerScope[]

export type SandboxListenerScope = typeof sandboxListenerScopes[number]

export const isSandboxListenerScope = (value: unknown): value is SandboxListenerScope =>
  typeof value === 'string' && (sandboxListenerScopes as readonly string[]).includes(value)
