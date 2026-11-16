import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parsePrereleaseTarget } from '../prerelease/config'
import { backupEnvironment, toolEnvironment } from '../prerelease/docker'
import type { RuntimeRecord } from '../prerelease/runtime'

const target = parsePrereleaseTarget(JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')))
const record = { mode: 'open', buildId: 'a'.repeat(40), generation: '00000000-0000-4000-8000-000000000001', installed: null, operation: null, acceptance: null } as unknown as RuntimeRecord

// uutils timeout (Ubuntu 26.04) resolves its command only through an exported PATH; GNU timeout fell back to /bin:/usr/bin.
it.each([
  ['backup', () => backupEnvironment(target, record)],
  ['scoped tool', () => toolEnvironment({ BACKUP_ENVIRONMENT: target.targetId })],
])('exports PATH to programs started from the %s environment', (_name, environment) => {
  const result = spawnSync('/bin/bash', ['-c', 'printenv PATH'], { env: environment(), encoding: 'utf8' })
  expect(result.status).toBe(0)
  expect(result.stdout.trim().split(':')).toContain('/usr/bin')
})

it('keeps the tool environment otherwise minimal', () => {
  expect(Object.keys(toolEnvironment({ BACKUP_ENVIRONMENT: 'prerelease-main' })).sort()).toEqual(['BACKUP_ENVIRONMENT', 'PATH'])
})
