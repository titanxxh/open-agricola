import { globSync } from 'glob'
import { CARD_REGISTRIES, readImportGraph, type ImportGraph } from './import-graph'
import { FULL_TASK_IDS } from './verification-tasks'
import { BASE_EXCLUDE, FAST_PROJECT_GLOBS, SLOW_INCLUDE } from '../test-project-globs'

export type RoutineChange =
  | { status: 'A' | 'M' | 'D'; path: string }
  | { status: 'R'; path: string; previousPath: string }

export type RoutineVerificationPlan = {
  vitestFiles: string[]
  catalogTasks: string[]
  browserFiles: string[]
  warnings: string[]
  fullTrigger: boolean
}

/** Placeholder. Concrete routine browser smoke entries are chosen later. */
export const ROUTINE_BROWSER_SMOKE_SET: readonly { file: string; grep: string | null }[] = []

const projects = [...FAST_PROJECT_GLOBS, { name: 'slow', include: SLOW_INCLUDE, exclude: BASE_EXCLUDE }]

function vitestInventory(root: string): Map<string, string> {
  const discovered = projects.map(project => ({
    name: project.name,
    files: globSync(project.include, { cwd: root, ignore: project.exclude, nodir: true, posix: true }),
  }))
  const files = new Map<string, string>()
  for (const file of new Set(discovered.flatMap(project => project.files))) {
    const owners = discovered.filter(project => project.files.includes(file))
    const owner = owners[0]
    if (owners.length === 1 && owner) files.set(file, owner.name)
  }
  return files
}

const registryPaths = new Set<string>(CARD_REGISTRIES)

function reachableDependents(graph: ImportGraph, start: string): Set<string> {
  const seen = new Set<string>()
  const stack = [start]
  while (stack.length) {
    const current = stack.pop()
    if (!current || seen.has(current)) continue
    seen.add(current)
    if (registryPaths.has(current) && current !== start) continue
    for (const importer of graph.dependents.get(current) ?? []) {
      if (registryPaths.has(current)) {
        seen.add(importer)
        continue
      }
      stack.push(importer)
    }
  }
  return seen
}

function cardSideSelection(graph: ImportGraph, path: string, tests: ReadonlySet<string>): Set<string> {
  const selected = new Set<string>()
  const importedByRegistry = CARD_REGISTRIES.some(registry => graph.imports.get(registry)?.has(path))
  if (!importedByRegistry) return selected
  const keys = graph.keysByModule.get(path) ?? new Set<string>()
  for (const test of tests) {
    const imported = graph.imports.get(test)
    if (imported && CARD_REGISTRIES.some(registry => imported.has(registry))) selected.add(test)
    const literals = graph.literals.get(test)
    if (literals && [...keys].some(key => literals.has(key))) selected.add(test)
  }
  return selected
}

function changedPaths(change: RoutineChange): string[] {
  return change.status === 'R' ? [change.previousPath, change.path] : [change.path]
}

function isDocumentation(file: string): boolean {
  return file.endsWith('.md') || file === 'LICENSE' || file === 'NOTICE'
}

function documentationOnly(changes: readonly RoutineChange[]): boolean {
  return changes.every(change => changedPaths(change).every(isDocumentation))
}

const ROOT_MANIFESTS = new Set(['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
const PLANNER_OR_GATE = new Set([
  'scripts/verify.ts',
  'scripts/verify-parallel.mjs',
  'scripts/test-project-globs.ts',
  'scripts/verification-plan.ts',
  'scripts/verification-requirements.ts',
])

function isFullTrigger(file: string): boolean {
  if (ROOT_MANIFESTS.has(file)) return true
  if (/^(?:vitest|vite|playwright|eslint)\.config\.[cm]?[jt]s$/.test(file)) return true
  if (/^tsconfig(?:\.[^/]+)?\.json$/.test(file)) return true
  if (file.startsWith('.github/workflows/')) return true
  if (file.startsWith('scripts/ci/')) return true
  return PLANNER_OR_GATE.has(file)
}

function affectedProjects(file: string, graph: ImportGraph, inventory: ReadonlyMap<string, string>): string[] {
  const found = new Set<string>()
  const own = inventory.get(file)
  if (own) found.add(own)
  for (const dependent of reachableDependents(graph, file)) {
    const project = inventory.get(dependent)
    if (project) found.add(project)
  }
  return [...found].sort()
}

function isBrowserEvidence(file: string): boolean {
  return file.startsWith('e2e-tests/') || /\.spec\.[cm]?[jt]sx?$/.test(file)
}

function widenIncomplete(
  graph: ImportGraph,
  inventory: ReadonlyMap<string, string>,
  selected: Set<string>,
  relevant: ReadonlySet<string>,
): { warnings: string[]; browserFiles: string[] } {
  const warnings: string[] = []
  let smoke = false
  for (const evidence of graph.incomplete) {
    if (!relevant.has(evidence.file)) continue
    const projectsForEvidence = affectedProjects(evidence.file, graph, inventory)
    if (projectsForEvidence.length === 0 && isBrowserEvidence(evidence.file)) {
      smoke = true
      warnings.push(`${evidence.file}: ${evidence.reason}; widened to the routine browser smoke set`)
      continue
    }
    if (projectsForEvidence.length === 0) {
      warnings.push(`${evidence.file}: ${evidence.reason}`)
      continue
    }
    for (const [file, project] of inventory) {
      if (projectsForEvidence.includes(project)) selected.add(file)
    }
    warnings.push(`${evidence.file}: ${evidence.reason}; widened to ${projectsForEvidence.join(', ')}`)
  }
  return {
    warnings: warnings.sort(),
    browserFiles: smoke ? ROUTINE_BROWSER_SMOKE_SET.map(entry => entry.file) : [],
  }
}

function completeCatalog(): RoutineVerificationPlan {
  return {
    vitestFiles: [],
    catalogTasks: [...FULL_TASK_IDS],
    browserFiles: [],
    warnings: [],
    fullTrigger: true,
  }
}

export function planRoutineVerification(input: {
  root: string
  changes: readonly RoutineChange[]
}): RoutineVerificationPlan {
  try {
    if (input.changes.flatMap(changedPaths).some(isFullTrigger)) return completeCatalog()
    const graph = readImportGraph(input.root)
    const inventory = vitestInventory(input.root)
    const tests = new Set(inventory.keys())
    const selected = new Set<string>()
    const relevant = new Set<string>()
    for (const change of input.changes) {
      for (const path of changedPaths(change)) {
        for (const file of reachableDependents(graph, path)) {
          relevant.add(file)
          if (tests.has(file)) selected.add(file)
        }
        for (const file of cardSideSelection(graph, path, tests)) selected.add(file)
      }
    }
    const widened = widenIncomplete(graph, inventory, selected, relevant)
    return {
      vitestFiles: [...selected].sort(),
      catalogTasks: documentationOnly(input.changes) ? [] : ['quality', 'build'],
      browserFiles: widened.browserFiles,
      warnings: widened.warnings,
      fullTrigger: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      vitestFiles: [],
      catalogTasks: [...FULL_TASK_IDS],
      browserFiles: [],
      warnings: [`Planner exception: ${message}`],
      fullTrigger: true,
    }
  }
}
