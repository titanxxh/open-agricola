import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import type { WorkshopSandboxContract } from '../shared/contract/workshop-generation.ts'
import { cardEffectHooks } from '../shared/projections/card-effect-hooks.ts'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../shared/custom-code/sandbox-action-ids.ts'
import { sandboxListenerActions } from '../shared/custom-code/sandbox-listener-actions.ts'
import { sandboxListenerPhases } from '../shared/custom-code/sandbox-listener-phases.ts'
import { sandboxListenerScopes } from '../shared/custom-code/sandbox-listener-scopes.ts'
import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../shared/custom-code/runtime-limits.ts'
import type { CardListenerContext } from '../shared/cards/card-listeners.ts'

let cached: WorkshopSandboxContract | undefined

/** Hash deployed source, not GitHub main or an optional build environment label.
 * Production ships these source directories and runs them with tsx (Dockerfile).
 * Including shared rule code also invalidates the contract when action semantics
 * change without a corresponding hook name change. The shipped lockfile also
 * binds resolved validation/executor dependencies. No source corpus is served.
 */
function runtimeDigest(): string {
  const hash = createHash('sha256')
  const visit = (directory: URL, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '__tests__' || entry.name === '__stubs__') continue
      const path = `${prefix}${entry.name}`
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) visit(url, `${path}/`)
      else if (entry.isFile() && entry.name.endsWith('.ts')) hash.update(path).update('\0').update(readFileSync(url)).update('\0')
    }
  }
  visit(new URL('../shared/', import.meta.url), 'shared/')
  visit(new URL('./custom-code/', import.meta.url), 'server/custom-code/')
  hash.update(readFileSync(import.meta.filename))
  hash.update(readFileSync(new URL('../package.json', import.meta.url)))
  hash.update(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url)))
  hash.update(process.versions.node).update(process.versions.v8)
  return hash.digest('hex')
}

export function getWorkshopSandboxContract(): WorkshopSandboxContract {
  return cached ??= {
    format: 2,
    id: `sandbox-v1:${runtimeDigest()}`,
    runtime: 'server-isolated-vm',
    limits: { executionTimeoutMs: EXECUTION_TIMEOUT_MS, memoryLimitMb: ISOLATE_MEMORY_LIMIT_MB },
    effects: cardEffectHooks,
    listeners: {
      actions: sandboxListenerActions, phases: sandboxListenerPhases, scopes: sandboxListenerScopes,
      players: { actor: 'player', owner: 'ownerPlayer', effectRecipient: 'effectPlayer' } satisfies Record<string, keyof CardListenerContext>,
    },
    actions: SANDBOX_ALLOWED_ACTION_IDS,
  }
}
