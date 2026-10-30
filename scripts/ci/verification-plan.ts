import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import { BASE_EXCLUDE, FAST_PROJECT_GLOBS, SLOW_INCLUDE } from '../test-project-globs'
import { parseSource, sourceExtensions } from '../source-files'

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

const scopeReasons = {
  documentation: 'Ordinary documentation requires documentation constraints.',
  frontend: 'Frontend changes require the owning module and its browser consumers.',
  card: 'Card behavior requires explicit direct, Session, and cross-card test associations.',
  server: 'Server changes require their complete backend and multiplayer groups.',
  rules: 'Shared rule mechanisms require complete affected rule groups.',
  contract: 'Protocol and projection changes require both producers and consumers.',
  workshop: 'Workshop contracts and runtime-readable documentation require sandbox verification.',
  browser: 'Browser test changes require the corresponding browser scenarios.',
  global: 'Shared verification configuration or fixtures require full verification.',
  unknown: 'Unclassified ownership requires full verification.',
}

export type VerificationScope = keyof typeof scopeReasons

export type ScopeSelection = {
  scope: VerificationScope
  paths: string[]
  reason: string
}

function scopeFor(file: string): VerificationScope {
  if (/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|(?:tsconfig|vite|vitest|playwright|eslint)[^/]*|AGENTS\.md|CLAUDE\.md|CONTEXT\.md|\.env[^/]*)$/.test(file)
    || file.startsWith('.github/') || file.startsWith('scripts/') || file.startsWith('tests/')
    || /(?:^|\/)(?:_helpers|fixtures|__fixtures__)\//.test(file)) return 'global'
  if (/^docs\/(?:CUSTOM_CARD_SANDBOX|CARD_TEST_TEMPLATE|ARCHITECTURE|card_implementation_status|community-card-examples)(?:_zh)?\.md$/.test(file)
    || /^docs\/(?:architecture|test)\//.test(file)
    || /^client\/(?:local-sandbox|sandbox|app\/workshop|services\/(?:llm|workshop))\//.test(file)
    || /^server\/(?:custom-code|workshop|workshop-pr)(?:\/|\.)/.test(file)
    || /^shared\/(?:custom-code|projections\/workshop)/.test(file)) return 'workshop'
  if (/^shared\/(?:contract|projections)\//.test(file)) return 'contract'
  if (/^shared\/cards\/(?:[A-Z]+|major|community)\//.test(file)
    || /^shared\/cards\/__tests__\/[A-Z]\d/.test(file)
    || /^server\/__tests__\/[A-Z]\d.*-session\.test\.ts$/.test(file)) return 'card'
  if (file === 'server/game/authoritative-session.ts' || file.startsWith('shared/')) return 'rules'
  if (file.startsWith('server/')) return 'server'
  if (file.startsWith('client/') || file.startsWith('replay-viewer/')) return 'frontend'
  if (file.startsWith('e2e-tests/')) return 'browser'
  if (/^(?:README(?:_[a-z]+)?\.md|LICENSE|NOTICE|docs\/.+\.md)$/.test(file)) return 'documentation'
  return 'unknown'
}

export type VerificationPlan = {
  schemaVersion: 1
  mode: 'scoped' | 'full'
  identity: VerificationIdentity
  changes: ChangedPath[]
  inventory: TestInventory
  selections: ScopeSelection[]
  expansionReasons: string[]
  checks: PlannedCheck[]
}

export function planVerification(input: {
  identity: VerificationIdentity
  changes: ChangedPath[]
  inventory: TestInventory
  fullTaskIds: readonly string[]
}): VerificationPlan {
  if (!input.fullTaskIds.length || new Set(input.fullTaskIds).size !== input.fullTaskIds.length) {
    throw new Error('A nonempty, unique canonical full task catalog is required')
  }
  const grouped = new Map<VerificationScope, Set<string>>()
  for (const change of input.changes) {
    for (const file of change.status === 'R' ? [change.previousPath, change.path] : [change.path]) {
      const scope = scopeFor(file)
      const paths = grouped.get(scope) ?? new Set<string>()
      paths.add(file)
      grouped.set(scope, paths)
    }
  }
  const selections = [...grouped].map(([scope, paths]) => ({ scope, paths: [...paths].sort(), reason: scopeReasons[scope] }))
  const documentationTests = input.inventory.vitest.filter(test => test.file === 'scripts/__tests__/docs-budget.test.ts')
  const expansionReasons = selections.filter(selection => selection.scope !== 'documentation')
    .map(selection => `${selection.reason} Full verification is selected for ${selection.paths.join(', ')}.`)
  if (!input.changes.length) expansionReasons.push('No changes were established; full verification is required.')
  if (selections.some(selection => selection.scope === 'documentation') && !documentationTests.length) {
    expansionReasons.push('Documentation constraint tests are missing; full verification is required.')
  }
  const full = expansionReasons.length > 0
  return {
    schemaVersion: 1,
    mode: full ? 'full' : 'scoped',
    identity: input.identity,
    changes: input.changes,
    inventory: input.inventory,
    selections,
    expansionReasons,
    checks: full ? input.fullTaskIds.map(taskId => ({ kind: 'catalog', taskId })) : [{
      kind: 'vitest', project: 'fast-scripts',
      files: documentationTests.map(test => test.file),
    }],
  }
}
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
    parseSource(join(cwd, file))
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

export function createRepositoryPlan(input: {
  cwd: string
  base: string
  head?: string
  fullTaskIds: readonly string[]
}): VerificationPlan {
  const head = input.head ?? 'HEAD'
  const identity: VerificationIdentity = {
    baseRef: input.base, headRef: head,
    baseSha: commitSha(input.cwd, input.base), headSha: commitSha(input.cwd, head),
    mergeBaseSha: '', testedSha: commitSha(input.cwd, 'HEAD'), sourceFingerprint: sourceContentFingerprint(input.cwd),
  }
  identity.mergeBaseSha = git(input.cwd, ['merge-base', identity.baseSha, identity.headSha])
  const inventory = readTestInventory(input.cwd)
  const changes = [
    ...readChanges(input.cwd, [identity.mergeBaseSha, identity.headSha]),
    ...readChanges(input.cwd, ['HEAD']),
    ...git(input.cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
      .map(path => ({ status: 'A', path } satisfies ChangedPath)),
  ]
  const uniqueChanges = [...new Map(changes.map(change => [JSON.stringify(change), change])).values()]
  for (const change of uniqueChanges) {
    const file = join(input.cwd, change.path)
    const stat = lstatSync(file, { throwIfNoEntry: false })
    if (stat && sourceExtensions.test(change.path)) {
      if (!stat.isFile()) throw new Error(`Source must be a regular file: ${change.path}`)
      parseSource(file)
    }
  }
  const plan = planVerification({ identity, changes: uniqueChanges, inventory, fullTaskIds: input.fullTaskIds })
  assertPlanCurrent(input.cwd, plan)
  return plan
}

export function assertPlanCurrent(cwd: string, plan: VerificationPlan): void {
  if (commitSha(cwd, 'HEAD') !== plan.identity.testedSha) throw new Error('Checked-out commit changed; regenerate the verification plan')
  if (commitSha(cwd, plan.identity.baseRef) !== plan.identity.baseSha) throw new Error('Base reference changed; regenerate the verification plan')
  if (commitSha(cwd, plan.identity.headRef) !== plan.identity.headSha) throw new Error('Head reference changed; regenerate the verification plan')
  if (sourceContentFingerprint(cwd) !== plan.identity.sourceFingerprint) throw new Error('Source contents changed; regenerate the verification plan')
}
