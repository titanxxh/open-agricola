#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'
import { globSync } from 'glob'
import {
  BASE_EXCLUDE,
  SLOW_INCLUDE,
  SHARED_EXCLUDE,
  LLM_INCLUDE,
  FAST_PROJECT_GLOBS,
} from './test-project-globs'

const cwd = process.cwd()
for (const root of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) {
  if (!fs.statSync(path.join(cwd, root)).isDirectory()) throw new Error('missing test discovery root: ' + root)
}

const expand = (include: string[], exclude: string[]): string[] => {
  const files = new Set<string>()
  for (const pattern of include) {
    for (const file of globSync(pattern, {
      cwd,
      ignore: exclude,
      nodir: true,
      posix: true,
    })) {
      files.add(file)
    }
  }
  return [...files].sort()
}

const discovered = new Set(expand(['**/*.{test,spec}.{ts,tsx,js,jsx,mts,mjs,cts,cjs}'], [...BASE_EXCLUDE, 'e2e-tests/**', 'scripts/test-actions.spec.ts', 'scripts/__tests__/fixtures/**']))
const byProject = new Map<string, string[]>()
const union = new Set<string>()

for (const project of [...FAST_PROJECT_GLOBS, { name: 'slow', include: SLOW_INCLUDE, exclude: SHARED_EXCLUDE }, { name: 'llm', include: LLM_INCLUDE, exclude: BASE_EXCLUDE }]) {
  for (const file of expand(project.include, project.exclude)) {
    union.add(file)
    byProject.set(file, [...(byProject.get(file) ?? []), project.name])
  }
}

const missing = [...discovered].filter((file) => !union.has(file)).sort()
const extra = [...union].filter((file) => !discovered.has(file)).sort()
const duplicates = [...byProject.entries()]
  .filter(([, projects]) => projects.length > 1)
  .sort(([a], [b]) => a.localeCompare(b))

if (missing.length === 0 && extra.length === 0 && duplicates.length === 0) {
  console.log(`[check:test-project-coverage] ok (${discovered.size} test files across fast, slow and llm)`)
  process.exit(0)
}

if (missing.length > 0) {
  console.error('[check:test-project-coverage] missing files:')
  for (const file of missing) console.error(`  - ${file}`)
}
if (extra.length > 0) {
  console.error('[check:test-project-coverage] unexpected extra files:')
  for (const file of extra) console.error(`  - ${file}`)
}
if (duplicates.length > 0) {
  console.error('[check:test-project-coverage] duplicate files:')
  for (const [file, projects] of duplicates) {
    console.error(`  - ${file}: ${projects.join(', ')}`)
  }
}
process.exit(1)
