import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import type { WorkshopSandboxContract } from '../shared/contract/workshop-generation.ts'

let cached: WorkshopSandboxContract | undefined

/** Hash deployed source, not GitHub main or an optional build environment label.
 * Production ships these source directories (Dockerfile). Workshop code runs
 * against the shared engine in the author's browser (ADR 0052), so the id
 * changes whenever that engine, this file or the resolved dependencies change.
 * A validation result is bound to the id it was issued under. No source corpus
 * is served.
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
  hash.update(readFileSync(import.meta.filename))
  hash.update(readFileSync(new URL('../package.json', import.meta.url)))
  hash.update(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url)))
  return hash.digest('hex')
}

export function getWorkshopSandboxContract(): WorkshopSandboxContract {
  return cached ??= {
    format: 2,
    id: `sandbox-v1:${runtimeDigest()}`,
    runtime: 'browser-card-source',
  }
}
