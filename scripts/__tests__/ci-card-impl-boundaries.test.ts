import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../..')
const workflows = ['ci.yml', 'ci-full.yml']
const architectureChecks = [
  'pnpm run lint',
  'pnpm run check:test-project-coverage',
  'pnpm run check:direct-session-log',
  'pnpm run check:effects-file-list',
  'pnpm run check:generated-cards-sync',
  'pnpm run check:no-dsl -- --strict',
  'pnpm run check:catalog-types',
  'pnpm run check:card-impl-boundaries',
]

describe('canonical architecture verification wiring', () => {
  it('defines the exact architecture checks in one package script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(pkg.scripts['check:architecture']?.split(' && ')).toEqual(architectureChecks)
    expect(pkg.scripts['check:reaches']).toBeUndefined()
  })

  it.each(workflows)('%s is manual-only and calls the canonical check once', (name) => {
    const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows', name), 'utf8')

    expect(workflow).toMatch(/on:\s*\n\s+workflow_dispatch:/)
    expect(workflow).not.toMatch(/^\s+(?:push|pull_request):/m)
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/)
    expect(workflow.match(/pnpm run check:architecture/g)).toHaveLength(1)
    expect(workflow).not.toContain('pnpm run check:reaches')
    expect(workflow).not.toContain('pnpm run check:card-impl-boundaries')
  })
})
