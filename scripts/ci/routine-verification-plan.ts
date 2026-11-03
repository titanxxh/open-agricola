import { readFileSync } from 'node:fs'
import { join, matchesGlob, relative } from 'node:path'
import { globSync } from 'glob'
import { CARD_REGISTRIES, readImportGraph, type ImportGraph } from './import-graph'
import { FULL_TASK_IDS } from './verification-tasks'
import { sourceExtensions, walkSourceFiles } from '../source-files'
import { BASE_EXCLUDE, FAST_PROJECT_GLOBS, SLOW_INCLUDE } from '../test-project-globs'

export type RoutineChange =
  | { status: 'A' | 'M' | 'D'; path: string }
  | { status: 'R'; path: string; previousPath: string }

export type RoutineBrowserEntry = { file: string; grep: string | null }

export type RoutineVerificationPlan = {
  vitestFiles: string[]
  catalogTasks: string[]
  browserFiles: RoutineBrowserEntry[]
  warnings: string[]
  fullTrigger: boolean
}

export const ROUTINE_BROWSER_SMOKE_SET: readonly RoutineBrowserEntry[] = [
  { file: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', grep: '@viewport' },
  { file: 'e2e-tests/frontend-browser-scenario-matrix.spec.ts', grep: '@webkit' },
  { file: 'e2e-tests/hosted-password-login.spec.ts', grep: 'password session' },
  { file: 'e2e-tests/ws-dual-player.spec.ts', grep: 'create room' },
]

const MAIN_ENTRY = 'client/main.tsx'
const REPLAY_ENTRY = 'replay-viewer/src/main.tsx'
const SANDBOX_APP = 'client/sandbox/SandboxApp.tsx'
const REPLAY_BROWSER_SPECS: readonly RoutineBrowserEntry[] = [
  { file: 'e2e-tests/replay-viewer-csp.spec.ts', grep: null },
  { file: 'e2e-tests/replay-viewer.spec.ts', grep: null },
]

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

function isGlobLiteral(value: string): boolean {
  return /[*?[]/.test(value)
}

function globMatchesTarget(literal: string, target: string, targetIsDirectory: boolean): boolean {
  if (matchesGlob(target, literal)) return true
  if (!targetIsDirectory) return false
  if (matchesGlob(`${target}/file.json`, literal) || matchesGlob(`${target}/nested/file.json`, literal)) return true
  const meta = literal.search(/[*?[]/)
  if (meta <= 0) return false
  const prefix = literal.slice(0, meta).replace(/\/$/, '')
  if (!prefix) return false
  if (prefix === target || prefix.startsWith(`${target}/`)) return true
  return target.startsWith(`${prefix}/`) && literal.includes('**')
}

function literalMatches(literal: string, target: string, targetIsDirectory = false): boolean {
  if (isGlobLiteral(literal)) return globMatchesTarget(literal, target, targetIsDirectory)
  if (literal === target) return true
  if (target.startsWith(`${literal}/`)) return true
  return targetIsDirectory && literal.startsWith(`${target}/`)
}

function readSelection(graph: ImportGraph, path: string, tests: ReadonlySet<string>, targetIsDirectory = false): Set<string> {
  const selected = new Set<string>()
  for (const [file, literals] of graph.reads) {
    if (![...literals].some(literal => literalMatches(literal, path, targetIsDirectory))) continue
    if (tests.has(file)) {
      selected.add(file)
      continue
    }
    for (const importer of graph.dependents.get(file) ?? []) {
      if (tests.has(importer)) selected.add(importer)
    }
  }
  return selected
}

const CARD_SOURCE = /^shared\/cards\/(?:A|B|C|D|E|M|major|community|__stubs__)\/[^/]+\.ts$/

function isCardSource(path: string): boolean {
  return CARD_SOURCE.test(path) && !path.endsWith('.test.ts')
}

function generatedOutputs(path: string): { path: string; directory: boolean }[] {
  if (path === 'i18n.ref') return [{ path: 'public/i18n', directory: true }]
  if (!isCardSource(path)) return []
  return [
    { path: 'public/cards-manifest.json', directory: false },
    { path: 'public/card-encyclopedia', directory: true },
    { path: 'public/action-references.json', directory: false },
  ]
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

function widenIncomplete(
  graph: ImportGraph,
  inventory: ReadonlyMap<string, string>,
  selected: Set<string>,
  relevant: ReadonlySet<string>,
): { warnings: string[]; browserFiles: RoutineBrowserEntry[] } {
  const warnings: string[] = []
  let smoke = false
  for (const evidence of graph.incomplete) {
    if (!relevant.has(evidence.file)) continue
    const projectsForEvidence = affectedProjects(evidence.file, graph, inventory)
    if (projectsForEvidence.length === 0) {
      smoke = true
      warnings.push(`${evidence.file}: ${evidence.reason}; widened to the routine browser smoke set`)
      continue
    }
    for (const [file, project] of inventory) {
      if (projectsForEvidence.includes(project)) selected.add(file)
    }
    warnings.push(`${evidence.file}: ${evidence.reason}; widened to ${projectsForEvidence.join(', ')}`)
  }
  return {
    warnings: warnings.sort(),
    browserFiles: smoke ? [...ROUTINE_BROWSER_SMOKE_SET] : [],
  }
}

const normalize = (file: string) => file.split(/[\\/]/).join('/')

function isSpec(file: string): boolean {
  return /\.spec\.[cm]?[jt]sx?$/.test(file)
}

function prefixMatches(prefix: string, path: string): boolean {
  if (path === prefix) return true
  const directory = prefix.endsWith('/') ? prefix : `${prefix}/`
  return path.startsWith(directory)
}

function exceedsThird(matched: number, total: number): boolean {
  return matched * 3 > total
}

function coverPrefixes(text: string): string[] {
  const prefixes: string[] = []
  let inBlock = false
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false
      continue
    }
    if (trimmed === '') continue
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true
      continue
    }
    if (!trimmed.startsWith('//')) break
    const match = trimmed.match(/^\/\/\s*@covers\b(.*)$/)
    if (match?.[1]) prefixes.push(...match[1].trim().split(/\s+/).filter(Boolean))
  }
  return prefixes
}

function sourcePaths(root: string): string[] {
  return walkSourceFiles(root, sourceExtensions, true, 'skip-non-source').map(file => normalize(relative(root, file)))
}

function repositoryFiles(root: string): string[] {
  return globSync('**/*', {
    cwd: root,
    nodir: true,
    posix: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.build/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  })
}

function readCoverIndex(root: string, specs: readonly string[], files: readonly string[]): { declarations: Map<string, string[]>; warnings: string[] } {
  const declarations = new Map<string, string[]>()
  const warnings: string[] = []
  for (const file of specs) {
    const prefixes = coverPrefixes(readFileSync(join(root, file), 'utf8'))
    const valid: string[] = []
    for (const prefix of prefixes) {
      if (files.some(candidate => prefixMatches(prefix, candidate))) valid.push(prefix)
      else warnings.push(`${file}: @covers prefix '${prefix}' matches no file`)
    }
    if (valid.length) declarations.set(file, valid)
  }
  return { declarations, warnings }
}

function sortBrowsers(entries: readonly RoutineBrowserEntry[]): RoutineBrowserEntry[] {
  const seen = new Set<string>()
  const unique: RoutineBrowserEntry[] = []
  for (const entry of entries) {
    const key = `${entry.file}\0${entry.grep ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
  }
  return unique.sort((left, right) => left.file.localeCompare(right.file)
    || (left.grep ?? '').localeCompare(right.grep ?? ''))
}

function walkImporters(
  graph: ImportGraph,
  declarations: ReadonlyMap<string, string[]>,
  start: string,
): { main: boolean; replay: boolean; specs: Set<string> } {
  const state = { main: false, replay: false, specs: new Set<string>() }
  const seen = new Set<string>()
  const visit = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    if (file === MAIN_ENTRY) {
      state.main = true
      return
    }
    if (file === REPLAY_ENTRY) {
      state.replay = true
      return
    }
    if (file === SANDBOX_APP) {
      for (const importer of graph.dependents.get(file) ?? []) visit(importer)
      return
    }
    if (declarations.has(file)) {
      if (isSpec(file)) state.specs.add(file)
      return
    }
    for (const importer of graph.dependents.get(file) ?? []) visit(importer)
  }
  if (start === MAIN_ENTRY) state.main = true
  else if (start === REPLAY_ENTRY) state.replay = true
  else for (const importer of graph.dependents.get(start) ?? []) visit(importer)
  return state
}

function browserSelectionForPath(
  path: string,
  graph: ImportGraph,
  declarations: ReadonlyMap<string, string[]>,
  specCount: number,
  unparseable: ReadonlySet<string>,
): RoutineBrowserEntry[] {
  const self = isSpec(path) && !unparseable.has(path) ? [{ file: path, grep: null }] : []
  const direct = [...(graph.dependents.get(path) ?? [])]
    .filter(file => isSpec(file) && !declarations.has(file))
    .map(file => ({ file, grep: null }))
  const covered = [...declarations]
    .filter(([, prefixes]) => prefixes.some(prefix => prefixMatches(prefix, path)))
    .map(([file]) => file)
  if (covered.length > 0) {
    if (exceedsThird(covered.length, specCount)) return [...ROUTINE_BROWSER_SMOKE_SET, ...direct, ...self]
    return [...covered.map(file => ({ file, grep: null })), ...direct, ...self]
  }
  const walked = walkImporters(graph, declarations, path)
  const replay = walked.replay ? [...REPLAY_BROWSER_SPECS] : []
  if (walked.main) return [...ROUTINE_BROWSER_SMOKE_SET, ...replay, ...direct, ...self]
  const declared = [...walked.specs].map(file => ({ file, grep: null }))
  if (exceedsThird(declared.length, specCount)) return [...ROUTINE_BROWSER_SMOKE_SET, ...replay, ...direct, ...self]
  return [...declared, ...replay, ...direct, ...self]
}

function completeCatalog(warnings: string[] = []): RoutineVerificationPlan {
  return {
    vitestFiles: [],
    catalogTasks: [...FULL_TASK_IDS],
    browserFiles: [],
    warnings,
    fullTrigger: true,
  }
}

function fullTriggerWarnings(changes: readonly RoutineChange[]): string[] {
  return [...new Set(changes.flatMap(changedPaths).filter(isFullTrigger))].sort()
    .map(path => `The complete catalog is selected by ${path}`)
}

const preparedByRoot = new Map<string, {
  graph: ImportGraph
  inventory: ReadonlyMap<string, string>
  files: string[]
  covers: ReturnType<typeof readCoverIndex>
}>()

function prepare(root: string) {
  const cached = preparedByRoot.get(root)
  if (cached) return cached
  const graph = readImportGraph(root)
  const inventory = vitestInventory(root)
  const files = sourcePaths(root)
  const covers = readCoverIndex(root, files.filter(isSpec), repositoryFiles(root))
  const prepared = { graph, inventory, files, covers }
  preparedByRoot.set(root, prepared)
  return prepared
}

export function planRoutineVerification(input: {
  root: string
  changes: readonly RoutineChange[]
}): RoutineVerificationPlan {
  try {
    const triggers = fullTriggerWarnings(input.changes)
    if (triggers.length) return completeCatalog(triggers)
    const { graph, inventory, files, covers } = prepare(input.root)
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
        for (const file of readSelection(graph, path, tests)) selected.add(file)
        for (const output of generatedOutputs(path)) {
          for (const file of readSelection(graph, output.path, tests, output.directory)) selected.add(file)
        }
      }
    }
    const widened = widenIncomplete(graph, inventory, selected, relevant)
    const unparseable = new Set(graph.incomplete.filter(item => item.reason === 'source file cannot be parsed').map(item => item.file))
    const specCount = files.filter(isSpec).length
    const browsers = input.changes.flatMap(change => changedPaths(change).flatMap(path =>
      browserSelectionForPath(path, graph, covers.declarations, specCount, unparseable)))
    return {
      vitestFiles: [...selected].sort(),
      catalogTasks: documentationOnly(input.changes) ? [] : ['quality', 'build'],
      browserFiles: sortBrowsers([...browsers, ...widened.browserFiles]),
      warnings: [...widened.warnings, ...covers.warnings].sort(),
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
