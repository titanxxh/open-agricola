import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { configuredPrereleaseTarget } from './prerelease-authority.ts'

function imageBoundary(): string | undefined {
  try {
    return readFileSync(new URL('../formal-identity-boundary', import.meta.url), 'utf8').trimEnd()
  } catch {
    return undefined
  }
}
const marker = imageBoundary()

/** Only the formal image producer supplies this marker. Bind it to the running image and public target configuration. */
export function formalIdentityPolicy(buildId: string): { identityBoundary?: string } {
  if (!marker || process.env.RELEASE_CHANNEL !== 'stable') return {}
  const match = /^([a-f0-9]{40}) ([a-f0-9]{64})$/.exec(marker)
  const target = configuredPrereleaseTarget()
  if (match?.[1] !== buildId || !target?.entryEnabled) return {}
  return { identityBoundary: createHash('sha256').update(JSON.stringify([match[2], target.sourceOrigin, target.targetOrigin])).digest('hex') }
}
