import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import { BASE_EXCLUDE, FAST_PROJECT_GLOBS, SLOW_INCLUDE } from '../test-project-globs'
import { planRoutineVerification, type RoutineVerificationPlan } from './routine-verification-plan'

export type VerificationIdentity = {
  baseRef: string
  headRef: string
  baseSha: string
  mergeBaseSha: string
  headSha: string
  testedSha: string
  sourceFingerprint: string
}

export type ChangedPath =
  | { status: 'A' | 'M' | 'D'; path: string }
  | { status: 'R'; path: string; previousPath: string }

export type TestInventory = {
  vitest: Array<{ file: string; project: string }>
  browser: string[]
}

export type PlannedCheck =
  | { kind: 'catalog'; taskId: string }
  | { kind: 'vitest'; project: string; files: string[] }
  | { kind: 'browser'; browser: 'chromium' | 'webkit'; files: string[]; grep: string | null }

function normalizeChecks(checks: PlannedCheck[], fullTaskIds: readonly string[]): PlannedCheck[] {
  const projects = new Map<string, Set<string>>()
  const browsers = new Map<string, Extract<PlannedCheck, { kind: 'browser' }>>()
  const tasks = new Set<string>()
  for (const check of checks) {
    if (check.kind === 'catalog') tasks.add(check.taskId)
    else if (check.kind === 'vitest') {
      const files = projects.get(check.project) ?? new Set<string>()
      for (const file of check.files) files.add(file)
      projects.set(check.project, files)
    } else {
      const key = JSON.stringify([check.browser, check.grep])
      const selected = browsers.get(key) ?? { ...check, files: [] }
      selected.files = [...new Set([...selected.files, ...check.files])].sort()
      browsers.set(key, selected)
    }
  }
  const projectOrder = [...FAST_PROJECT_GLOBS.map(project => project.name), 'slow']
  const orderedProjects = [...projects].sort(([left], [right]) =>
    projectOrder.indexOf(left) - projectOrder.indexOf(right) || left.localeCompare(right))
  const browserChecks = [...browsers.values()].flatMap(check => {
    const fullFiles = browsers.get(JSON.stringify([check.browser, null]))?.files ?? []
    const files = check.grep === null ? check.files : check.files.filter(file => !fullFiles.includes(file))
    return files.length ? [{ ...check, files }] : []
  })
  return [
    ...orderedProjects.map(([project, files]): PlannedCheck => ({ kind: 'vitest', project, files: [...files].sort() })),
    ...fullTaskIds.filter(taskId => tasks.has(taskId)).map((taskId): PlannedCheck => ({ kind: 'catalog', taskId })),
    ...browserChecks.sort((left, right) =>
      left.browser.localeCompare(right.browser) || (left.grep ?? '').localeCompare(right.grep ?? '')),
  ]
}

export type VerificationScope =
  | 'documentation' | 'frontend' | 'card' | 'server' | 'recovery' | 'rules' | 'contract'
  | 'workshop' | 'browser' | 'test-support' | 'operations' | 'global' | 'unknown'

export type ScopeSelection = {
  scope: VerificationScope
  paths: string[]
  reason: string
}

export type VerificationPlan = {
  schemaVersion: 1
  status: 'planned'
  mode: 'scoped' | 'full'
  identity: VerificationIdentity
  changes: ChangedPath[]
  inventory: TestInventory
  selections: ScopeSelection[]
  expansionReasons: string[]
  wideningReasons: string[]
  checks: PlannedCheck[]
  selectionReasons?: string[]
}

function routineChecks(routine: RoutineVerificationPlan, inventory: TestInventory): PlannedCheck[] {
  const projects = new Map<string, string[]>()
  for (const file of routine.vitestFiles) {
    const project = inventory.vitest.find(test => test.file === file)?.project
    if (!project) throw new Error(`Selected test is not in the inventory: ${file}`)
    const files = projects.get(project) ?? []
    files.push(file)
    projects.set(project, files)
  }
  return [
    ...[...projects].map(([project, files]): PlannedCheck => ({ kind: 'vitest', project, files })),
    ...routine.catalogTasks.map((taskId): PlannedCheck => ({ kind: 'catalog', taskId })),
    ...routine.browserFiles.map((entry): PlannedCheck => ({
      kind: 'browser',
      browser: entry.grep === '@webkit' ? 'webkit' : 'chromium',
      files: [entry.file],
      grep: entry.grep,
    })),
  ]
}

const inventoryCache = new Map<string, TestInventory>()
const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd()
const gitFiles = (cwd: string) => [...new Set(git(cwd, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort()
const commitSha = (cwd: string, ref: string) => git(cwd, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])

export function sourceContentFingerprint(cwd: string): string {
  const digest = createHash('sha256')
  for (const file of gitFiles(cwd)) {
    const target = join(cwd, file)
    const stat = lstatSync(target, { throwIfNoEntry: false })
    digest.update(`${file}\0`)
    if (!stat) digest.update('deleted\0')
    else if (stat.isSymbolicLink()) digest.update(`symlink:${readlinkSync(target)}\0`)
    else if (stat.isFile()) {
      digest.update(`file:${stat.mode & 0o111}\0`)
      digest.update(readFileSync(target))
      digest.update('\0')
    } else throw new Error(`Unsupported source entry: ${file}`)
  }
  return digest.digest('hex')
}

export function readTestInventory(cwd: string): TestInventory {
  for (const root of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) {
    const stat = lstatSync(join(cwd, root), { throwIfNoEntry: false })
    if (!stat?.isDirectory()) throw new Error(`Missing test discovery root: ${root}`)
  }
  const projects = [...FAST_PROJECT_GLOBS, { name: 'slow', include: SLOW_INCLUDE, exclude: BASE_EXCLUDE }]
    .map(project => ({
      name: project.name,
      files: new Set(globSync(project.include, { cwd, ignore: project.exclude, nodir: true, posix: true })),
    }))
  const inventory: TestInventory = { vitest: [], browser: [] }
  for (const file of gitFiles(cwd)) {
    if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
      || file.startsWith('scripts/__tests__/fixtures/') || file === 'scripts/test-actions.spec.ts') continue
    const stat = lstatSync(join(cwd, file), { throwIfNoEntry: false })
    if (!stat) continue
    if (!stat.isFile()) throw new Error(`Test sources must be regular files: ${file}`)
    if (/^e2e-tests\/.+\.spec\.[cm]?[jt]sx?$/.test(file)) {
      inventory.browser.push(file)
      continue
    }
    const owners = projects.filter(project => project.files.has(file))
    if (owners.length !== 1) throw new Error(`Test must belong to exactly one project: ${file} (${owners.map(owner => owner.name).join(', ') || 'unclassified'})`)
    const owner = owners[0]
    if (!owner) throw new Error(`Missing test owner: ${file}`)
    inventory.vitest.push({ file, project: owner.name })
  }
  if (!inventory.vitest.length || !inventory.browser.length) throw new Error('Test discovery is empty; verification scope cannot be proven')
  return inventory
}

function readChanges(cwd: string, args: string[]): ChangedPath[] {
  const fields = git(cwd, ['diff', '--name-status', '-z', '--find-renames', ...args, '--']).split('\0').filter(Boolean)
  const changes: ChangedPath[] = []
  for (let index = 0; index < fields.length;) {
    const status = fields[index++]
    const file = fields[index++]
    if (!status || !file) throw new Error('Malformed Git change list')
    if (status.startsWith('R')) {
      const target = fields[index++]
      if (!target) throw new Error('Malformed Git rename')
      changes.push({ status: 'R', previousPath: file, path: target })
    } else if (status === 'A' || status === 'M' || status === 'D') changes.push({ status, path: file })
    else if (status === 'T') changes.push({ status: 'M', path: file })
    else throw new Error(`Unsupported Git change status: ${status}`)
  }
  return changes
}

function inventoryFor(cwd: string, fingerprint: string): TestInventory {
  const cached = inventoryCache.get(fingerprint)
  if (cached) return cached
  const inventory = readTestInventory(cwd)
  inventoryCache.set(fingerprint, inventory)
  return inventory
}

export function createRepositoryPlan(input: {
  cwd: string
  base: string
  head?: string
  fullTaskIds: readonly string[]
  changes?: ChangedPath[]
}): VerificationPlan {
  if (!input.fullTaskIds.length || new Set(input.fullTaskIds).size !== input.fullTaskIds.length) {
    throw new Error('A nonempty, unique canonical full task catalog is required')
  }
  const head = input.head ?? 'HEAD'
  const identity: VerificationIdentity = {
    baseRef: input.base, headRef: head,
    baseSha: commitSha(input.cwd, input.base), headSha: commitSha(input.cwd, head),
    mergeBaseSha: '', testedSha: commitSha(input.cwd, 'HEAD'), sourceFingerprint: sourceContentFingerprint(input.cwd),
  }
  identity.mergeBaseSha = git(input.cwd, ['merge-base', identity.baseSha, identity.headSha])
  const inventory = inventoryFor(input.cwd, identity.sourceFingerprint)
  const discovered = [
    ...readChanges(input.cwd, [identity.mergeBaseSha, identity.headSha]),
    ...readChanges(input.cwd, [identity.headSha, identity.testedSha]),
    ...readChanges(input.cwd, ['HEAD']),
    ...git(input.cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
      .map(path => ({ status: 'A', path } satisfies ChangedPath)),
  ]
  const changes = input.changes ?? [...new Map(discovered.map(change => [JSON.stringify(change), change])).values()]
  const routine = planRoutineVerification({ root: input.cwd, changes, sourceFingerprint: identity.sourceFingerprint })
  const full = routine.fullTrigger
  const plan: VerificationPlan = {
    schemaVersion: 1,
    status: 'planned',
    mode: full ? 'full' : 'scoped',
    identity,
    changes,
    inventory,
    selections: [],
    selectionReasons: routine.selectionReasons ?? [],
    expansionReasons: full ? [...routine.warnings] : [],
    wideningReasons: full ? [] : [...routine.warnings],
    checks: full
      ? input.fullTaskIds.map(taskId => ({ kind: 'catalog', taskId }))
      : normalizeChecks(routineChecks(routine, inventory), input.fullTaskIds),
  }
  assertPlanCurrent(input.cwd, plan)
  return plan
}

export function assertPlanCurrent(cwd: string, plan: VerificationPlan): void {
  if (commitSha(cwd, 'HEAD') !== plan.identity.testedSha) throw new Error('Checked-out commit changed; regenerate the verification plan')
  if (commitSha(cwd, plan.identity.baseRef) !== plan.identity.baseSha) throw new Error('Base reference changed; regenerate the verification plan')
  if (commitSha(cwd, plan.identity.headRef) !== plan.identity.headSha) throw new Error('Head reference changed; regenerate the verification plan')
  if (sourceContentFingerprint(cwd) !== plan.identity.sourceFingerprint) throw new Error('Source contents changed; regenerate the verification plan')
}

export function formatPlanSummary(plan: VerificationPlan): string {
  const code = (value: string) => `\`${JSON.stringify(value).slice(1, -1).replaceAll('`', '\\`')}\``
  const paths = (files: string[]) => files.slice(0, 20).map(code).join(', ')
    + (files.length > 20 ? `, and ${files.length - 20} more in the plan artifact` : '')
  return [
    '# Verification scope plan', '',
    'This plan is not verification evidence.', '',
    `Mode: **${plan.mode}**`, '',
    `Base: ${code(plan.identity.baseSha)}`,
    `Merge base: ${code(plan.identity.mergeBaseSha)}`,
    `Head: ${code(plan.identity.headSha)}`,
    `Checked-out commit: ${code(plan.identity.testedSha)}`, '',
    `Discovered tests: ${plan.inventory.vitest.length} Vitest files and ${plan.inventory.browser.length} browser files.`, '',
    ...(plan.selectionReasons?.length ? ['## Selection evidence', '', ...plan.selectionReasons.map(reason => `- ${reason}`), ''] : []),
    ...(plan.selections.length ? ['## Selected scopes', '', ...plan.selections.map(selection => `- **${selection.scope}**: ${selection.reason} ${paths(selection.paths)}`), ''] : []),
    ...(plan.expansionReasons.length ? ['## Why verification expands', '', ...plan.expansionReasons.map(reason => `- ${reason}`), ''] : []),
    ...(plan.wideningReasons.length ? ['## Warnings', '', ...plan.wideningReasons.map(reason => `- ${reason}`), ''] : []),
    '## Planned checks', '',
    ...plan.checks.map(check => {
      switch (check.kind) {
        case 'catalog': return `- Complete task ${code(check.taskId)}`
        case 'vitest': return `- ${code(check.project)}: ${paths(check.files)}`
        case 'browser': return `- Browser ${code(check.browser)}: ${paths(check.files)}${check.grep ? `; titles ${code(check.grep)}` : ''}`
      }
    }), '',
  ].join('\n')
}
