import { join } from 'node:path'
import type { PrereleaseTarget } from './config'

/** The trusted prepare step installs exactly one immutable directory per fixed commit. */
export function sourceReleaseDirectory(target: PrereleaseTarget, buildId: string): string {
  if (!/^[a-f0-9]{40}$/.test(buildId)) throw new Error('A source installation requires a fixed commit SHA')
  return join(target.directory, 'source-releases', buildId, 'app')
}
