import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'
import { BASE_EXCLUDE, FAST_PROJECT_GLOBS, SLOW_INCLUDE } from '../test-project-globs'
import { parseSource, sourceExtensions } from '../source-files'
import { frontendVerification } from './frontend-verification'
import { businessScopeFor, businessVerification } from './business-verification'
import { cardVerification, readCardAssociationIndex, type CardAssociationIndex } from './card-verification'

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

const scopeReasons = {
  documentation: 'Ordinary documentation requires documentation constraints.',
  frontend: 'Frontend changes require the complete client group, quality and builds, and the declared module browser consumers.',
  card: 'Card behavior selects complete literal/import/helper-associated tests and generic card-safety consumers, with quality, builds and browser checks.',
  server: 'Server changes require their complete backend and multiplayer groups.',
  recovery: 'Persistence and recovery changes require complete storage, serialization, transport and Replay consumers.',
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
    || /(?:^|\/)(?:tsconfig[^/]*\.json|(?:vite|vitest|playwright|eslint)\.config\.[^/]+)$/.test(file)
    || /^docs\/(?:operations\/|agents\/|adr\/|(?:PLATFORM_DESIGN|DEPLOY_PLAN|HOW_TO_DEPLOY)(?:_zh)?\.md$)/.test(file)
    || file.startsWith('.github/') || file.startsWith('scripts/') || file.startsWith('tests/')
    || file === 'shared/cards/__tests__/card-environment.ts'
    || /(?:^|\/)(?:_helpers|fixtures|__fixtures__)(?:\/|\.)/.test(file)
    || /(?:^|\/)setup(?:[-.][^/]*)?\.[cm]?[jt]sx?$/.test(file)) return 'global'
  const businessScope = businessScopeFor(file)
  if (businessScope) return businessScope
  if (/^docs\/(?:CUSTOM_CARD_SANDBOX|CARD_TEST_TEMPLATE|ARCHITECTURE|card_implementation_status|community-card-examples)(?:_zh)?\.md$/.test(file)
    || /^docs\/(?:prompts|examples)\//.test(file)
    || /^docs\/(?:architecture|test)\//.test(file)
    || /^client\/(?:local-sandbox|sandbox|app\/workshop|services\/(?:llm|workshop))(?:\/|[-.])/.test(file)
    || /^server\/(?:custom-code|workshop)(?:\/|[-.])/.test(file)
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
  status: 'planned'
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
  cardAssociations?: CardAssociationIndex
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
  const scopedChecks: PlannedCheck[] = []
  const expansionReasons: string[] = []
  for (const selection of selections) {
    if (selection.scope === 'documentation') {
      scopedChecks.push(...[...new Set(documentationTests.map(test => test.project))].map(project => ({
        kind: 'vitest' as const, project, files: documentationTests.filter(test => test.project === project).map(test => test.file),
      })))
    } else if (selection.scope === 'frontend') {
      const mapping = frontendVerification(selection.paths, input.inventory)
      scopedChecks.push(...mapping.checks)
      expansionReasons.push(...mapping.expansionReasons)
    } else if (selection.scope === 'card') {
      const mapping = cardVerification(selection.paths, input.inventory, input.cardAssociations, input.changes)
      scopedChecks.push(...mapping.checks)
      expansionReasons.push(...mapping.expansionReasons)
    } else if (['server', 'recovery', 'rules', 'contract', 'workshop'].includes(selection.scope)) {
      const mapping = businessVerification(selection.paths, input.inventory)
      scopedChecks.push(...mapping.checks)
      expansionReasons.push(...mapping.expansionReasons)
    } else expansionReasons.push(`${selection.reason} Full verification is selected for ${selection.paths.length} affected paths.`)
  }
  if (scopedChecks.some(check => check.kind === 'catalog' && !input.fullTaskIds.includes(check.taskId))) {
    expansionReasons.push('The canonical catalog cannot execute the selected scope; full verification is required.')
  }
  if (!input.changes.length) expansionReasons.push('No changes were established; full verification is required.')
  if (selections.some(selection => selection.scope === 'documentation') && !documentationTests.length) {
    expansionReasons.push('Documentation constraint tests are missing; full verification is required.')
  }
  const full = expansionReasons.length > 0
  return {
    schemaVersion: 1,
    status: 'planned',
    mode: full ? 'full' : 'scoped',
    identity: input.identity,
    changes: input.changes,
    inventory: input.inventory,
    selections,
    expansionReasons,
    checks: full ? input.fullTaskIds.map(taskId => ({ kind: 'catalog', taskId }))
      : normalizeChecks(scopedChecks, input.fullTaskIds),
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
    ...readChanges(input.cwd, [identity.headSha, identity.testedSha]),
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
  const cardAssociations = uniqueChanges.some(change => scopeFor(change.path) === 'card' || (change.status === 'R' && scopeFor(change.previousPath) === 'card'))
    ? readCardAssociationIndex(input.cwd, inventory) : undefined
  const plan = planVerification({ identity, changes: uniqueChanges, inventory, fullTaskIds: input.fullTaskIds, cardAssociations })
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
    `Test ownership: ${plan.inventory.vitest.length} Vitest files and ${plan.inventory.browser.length} browser files.`, '',
    '## Selected scopes', '',
    ...plan.selections.map(selection => `- **${selection.scope}**: ${selection.reason} ${paths(selection.paths)}`), '',
    ...(plan.expansionReasons.length ? ['## Why verification expands', '', ...plan.expansionReasons.map(reason => `- ${reason}`), ''] : []),
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
