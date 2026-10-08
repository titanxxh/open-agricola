import { SANDBOX_ALLOWED_ACTION_IDS } from './sandbox-action-ids.ts'

export const sandboxListenerActions = [
  // Dispatcher query identities; these are listener events, never leaf actions.
  'anytime',
  'compute-exchanges',
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
  'wish-children',
  'family-growth',
  'bake-bread',
  'breed',
  'reap',
  ...SANDBOX_ALLOWED_ACTION_IDS.filter(id => ![
    'gain', 'plow', 'sow', 'construct', 'renovate-house', 'fence', 'stables',
    'improvement', 'occupation', 'family-growth', 'bake-bread', 'breed', 'reap',
  ].includes(id)),
] as const

export type SandboxListenerAction = typeof sandboxListenerActions[number]

export const isSandboxListenerAction = (value: unknown): value is SandboxListenerAction =>
  typeof value === 'string' && (sandboxListenerActions as readonly string[]).includes(value)
