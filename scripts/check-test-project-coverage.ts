#!/usr/bin/env tsx
import { globSync } from 'glob'
import {
  FAST_EXCLUDE,
  FAST_PROJECT_GLOBS,
  LEGACY_FAST_INCLUDE,
} from './test-project-globs'

const cwd = process.cwd()

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

const legacy = new Set(expand(LEGACY_FAST_INCLUDE, FAST_EXCLUDE))
const byProject = new Map<string, string[]>()
const union = new Set<string>()

for (const project of FAST_PROJECT_GLOBS) {
  for (const file of expand(project.include, project.exclude)) {
    union.add(file)
    byProject.set(file, [...(byProject.get(file) ?? []), project.name])
  }
}

const missing = [...legacy].filter((file) => !union.has(file)).sort()
const extra = [...union].filter((file) => !legacy.has(file)).sort()
const duplicates = [...byProject.entries()]
  .filter(([, projects]) => projects.length > 1)
  .sort(([a], [b]) => a.localeCompare(b))

if (missing.length === 0 && extra.length === 0 && duplicates.length === 0) {
  console.log(`[check:test-project-coverage] ok (${legacy.size} fast test files)`)
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
