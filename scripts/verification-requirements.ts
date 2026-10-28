import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, posix, resolve } from 'node:path'

export type CaseIdentity = {
  file: string
  titlePath: string[]
  project: string
  browser: 'chromium' | 'firefox' | 'webkit'
}
export type Requirements = { schemaVersion: 1; cases: CaseIdentity[] }
export type RequirementsBinding = { path: string; sha256: string }
export type CaseStatus = 'passed' | 'failed' | 'skipped' | 'not-run'
export type CaseEvidence = { identity: CaseIdentity; status: CaseStatus }
export type BrowserRunRequest = {
  schemaVersion: 1
  runId: string
  cwd: string
  head: string
  fingerprint: string
  requirements: RequirementsBinding | null
}
export type BrowserRunResult = {
  schemaVersion: 1
  runId: string
  fingerprint: string
  requirementsSha256: string | null
  status: 'passed' | 'failed' | 'timedout' | 'interrupted'
  cases: CaseEvidence[]
}
export type BrowserRunSelection = { schemaVersion: 1; runId: string; fingerprint: string; cases: CaseIdentity[] }
export type BrowserRunCompletion = {
  schemaVersion: 1
  runId: string
  status: 'passed' | 'failed' | 'stale'
}

const recordDirectory = 'output/verification/e2e-runs'
export const reporterContextEnvironment = 'OPEN_AGRICOLA_VERIFICATION_RUN'
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const fail = (message: string): never => { throw new Error(message) }
const string = (value: unknown, field: string): string => typeof value === 'string' ? value : fail(`Invalid ${field}`)
const hash = (value: unknown): string => {
  const result = string(value, 'fingerprint/hash')
  return /^[a-f0-9]{64}$/.test(result) ? result : fail('Invalid fingerprint/hash')
}
const browser = (value: unknown): CaseIdentity['browser'] =>
  value === 'chromium' || value === 'firefox' || value === 'webkit' ? value : fail('Invalid browser')
const caseStatus = (value: unknown): CaseStatus =>
  value === 'passed' || value === 'failed' || value === 'skipped' || value === 'not-run' ? value : fail('Invalid case status')
const readUnknown = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

function identity(value: unknown, requireSpec = false): CaseIdentity {
  if (!object(value)) return fail('A case must declare file, titlePath, project and browser')
  const file = string(value.file, 'case file')
  if (!file || isAbsolute(file) || file.includes('\\') || posix.normalize(file) !== file || file.startsWith('../')
    || (requireSpec && !file.endsWith('.spec.ts'))) return fail('Case file must be a repository-relative .spec.ts path')
  const titles = value.titlePath
  if (!Array.isArray(titles) || !titles.length) return fail('A case must declare its complete titlePath')
  const titlePath = titles.map(title => {
    const text = string(title, 'case titlePath')
    return text.length ? text : fail('Case titles cannot be empty')
  })
  return { file, titlePath, project: string(value.project, 'case project'), browser: browser(value.browser) }
}

export const caseKey = (value: CaseIdentity): string => JSON.stringify([value.file, value.titlePath, value.project, value.browser])

export function parseRequirements(value: unknown): Requirements {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.cases) || !value.cases.length) {
    return fail('Requirements must contain schemaVersion: 1 and a nonempty explicit cases list')
  }
  const cases = value.cases.map(entry => identity(entry, true))
  if (new Set(cases.map(caseKey)).size !== cases.length) return fail('Duplicate required case identity')
  return { schemaVersion: 1, cases }
}

export function loadRequirements(cwd: string, path: string) {
  const absolutePath = resolve(cwd, path)
  const bytes = readFileSync(absolutePath)
  const requirements = parseRequirements(JSON.parse(bytes.toString()))
  return { requirements, binding: { path: absolutePath, sha256: createHash('sha256').update(bytes).digest('hex') } }
}

export function requirementsArgument(args: string[]): { args: string[]; path: string | null } {
  const remaining: string[] = []
  let path: string | null = null
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--requirements' || arg.startsWith('--requirements=')) {
      if (path !== null) return fail('Specify --requirements only once')
      const value = arg === '--requirements' ? args[++index] : arg.slice('--requirements='.length)
      if (!value || value.startsWith('--')) return fail('--requirements needs a JSON file')
      path = value
    } else remaining.push(arg)
  }
  return { args: remaining, path }
}

export function writeImmutableJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}

export function createBrowserRun(cwd: string, request: Omit<BrowserRunRequest, 'schemaVersion' | 'runId' | 'cwd'>) {
  const directory = join(cwd, recordDirectory)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  for (;;) {
    const last = readdirSync(directory).filter(name => /^\d{12}$/.test(name)).sort().at(-1)
    const runId = String(Number(last ?? 0) + 1).padStart(12, '0')
    const runDirectory = join(directory, runId)
    try { mkdirSync(runDirectory, { mode: 0o700 }) }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') continue
      throw error
    }
    const value: BrowserRunRequest = { schemaVersion: 1, runId, cwd: resolve(cwd), ...request }
    const path = join(runDirectory, 'request.json')
    writeImmutableJson(path, value)
    return { directory: runDirectory, path, request: value }
  }
}

export function readBrowserRunRequest(path: string): BrowserRunRequest {
  const value = readUnknown(path)
  if (!object(value) || value.schemaVersion !== 1) return fail('Invalid browser run request')
  const runId = string(value.runId, 'runId')
  if (!/^\d{12}$/.test(runId)) return fail('Invalid browser runId')
  let requirements: RequirementsBinding | null = null
  if (value.requirements !== null) {
    if (!object(value.requirements)) return fail('Invalid requirements binding')
    requirements = { path: string(value.requirements.path, 'requirements path'), sha256: hash(value.requirements.sha256) }
  }
  return { schemaVersion: 1, runId, cwd: string(value.cwd, 'run cwd'), head: string(value.head, 'run head'), fingerprint: hash(value.fingerprint), requirements }
}

export function readBrowserRunResult(path: string): BrowserRunResult {
  const value = readUnknown(path)
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.cases)) return fail('Invalid browser run results')
  const status = value.status
  if (status !== 'passed' && status !== 'failed' && status !== 'timedout' && status !== 'interrupted') return fail('Invalid browser run status')
  const cases = value.cases.map(entry => {
    if (!object(entry)) return fail('Invalid browser case evidence')
    return { identity: identity(entry.identity), status: caseStatus(entry.status) }
  })
  if (new Set(cases.map(entry => caseKey(entry.identity))).size !== cases.length) return fail('Duplicate browser evidence identity')
  return { schemaVersion: 1, runId: string(value.runId, 'runId'), fingerprint: hash(value.fingerprint),
    requirementsSha256: value.requirementsSha256 === null ? null : hash(value.requirementsSha256), status, cases }
}

function readBrowserRunSelection(path: string): BrowserRunSelection {
  const value = readUnknown(path)
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.cases)) return fail('Invalid browser run selection')
  return { schemaVersion: 1, runId: string(value.runId, 'runId'), fingerprint: hash(value.fingerprint), cases: value.cases.map(entry => identity(entry)) }
}

function completionStatus(path: string, runId: string): BrowserRunCompletion['status'] | 'incomplete' {
  if (!existsSync(path)) return 'incomplete'
  const value = readUnknown(path)
  if (!object(value) || value.schemaVersion !== 1 || value.runId !== runId) return fail('Invalid browser run completion')
  return value.status === 'passed' || value.status === 'failed' || value.status === 'stale' ? value.status : fail('Invalid browser run completion status')
}

export function requiredCasesStatus(cwd: string, requirementsPath: string, fingerprint: string) {
  const { requirements, binding } = loadRequirements(cwd, requirementsPath)
  const latest = new Map<string, { status: CaseStatus | 'incomplete'; runId: string }>()
  const directory = join(cwd, recordDirectory)
  for (const runId of existsSync(directory) ? readdirSync(directory).filter(name => /^\d{12}$/.test(name)).sort() : []) {
    const runDirectory = join(directory, runId)
    const request = readBrowserRunRequest(join(runDirectory, 'request.json'))
    if (request.runId !== runId || request.cwd !== resolve(cwd)) return fail('Browser evidence directory does not match its request')
    if (request.fingerprint !== fingerprint) continue
    const matchingRequirements = request.requirements?.sha256 === binding.sha256
    const completed = completionStatus(join(runDirectory, 'completion.json'), runId)
    const resultPath = join(runDirectory, 'results.json')
    if (!existsSync(resultPath) || completed === 'incomplete' || completed === 'stale') {
      const selectionPath = join(runDirectory, 'selection.json')
      if (existsSync(selectionPath)) {
        const selection = readBrowserRunSelection(selectionPath)
        if (selection.runId !== runId || selection.fingerprint !== fingerprint) return fail('Browser selection does not match its run binding')
        for (const entry of selection.cases) latest.set(caseKey(entry), { status: 'incomplete', runId })
      } else if (matchingRequirements) {
        for (const entry of requirements.cases) latest.set(caseKey(entry), { status: 'incomplete', runId })
      }
      continue
    }
    const results = readBrowserRunResult(resultPath)
    if (results.runId !== runId || results.fingerprint !== fingerprint || results.requirementsSha256 !== (request.requirements?.sha256 ?? null)) return fail('Browser results do not match their run binding')
    if (completed !== 'passed' || results.status !== 'passed') {
      if (!results.cases.length && matchingRequirements) for (const entry of requirements.cases) latest.set(caseKey(entry), { status: 'failed', runId })
      else for (const entry of results.cases) latest.set(caseKey(entry.identity), { status: 'failed', runId })
    } else for (const entry of results.cases) {
      if (entry.status !== 'passed' || matchingRequirements) latest.set(caseKey(entry.identity), { status: entry.status, runId })
    }
  }
  const cases = requirements.cases.map(entry => ({ identity: entry, ...latest.get(caseKey(entry)), status: latest.get(caseKey(entry))?.status ?? 'missing' }))
  return { requirementsSha256: binding.sha256, cases, passed: cases.every(entry => entry.status === 'passed') }
}
