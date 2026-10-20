export const sandboxListenerActions = [
  'collect',
  'gain',
  'receive',
  'plow',
  'sow',
  'construct',
  'renovate-house',
  'fence',
  'stables',
  'improvement',
  'occupation',
  'place-farmer',
  'family-growth',
  'bake-bread',
  'breed',
  'reap',
  'anytime',
  'compute-exchanges',
] as const

export type SandboxListenerAction = typeof sandboxListenerActions[number]

export const isSandboxListenerAction = (value: unknown): value is SandboxListenerAction =>
  typeof value === 'string' && (sandboxListenerActions as readonly string[]).includes(value)
