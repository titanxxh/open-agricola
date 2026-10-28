import { dirname, join, relative, sep } from 'node:path'
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter'
import {
  caseKey, readBrowserRunRequest, reporterContextEnvironment, writeImmutableJson,
  type BrowserRunRequest, type BrowserRunResult, type BrowserRunSelection, type CaseEvidence,
} from './verification-requirements'

function testEvidence(test: TestCase, request: BrowserRunRequest): CaseEvidence {
  const titlePath = [test.title]
  for (let suite: Suite | undefined = test.parent; suite; suite = suite.parent) {
    if (suite.type === 'describe' && suite.title) titlePath.unshift(suite.title)
  }
  const project = test.parent.project()
  const browser = project?.use.browserName ?? 'chromium'
  const identity = { file: relative(request.cwd, test.location.file).split(sep).join('/'), titlePath, project: project?.name ?? '', browser }
  const status = !test.results.length ? 'not-run'
    : test.results.every(result => result.status === 'skipped') ? 'skipped'
      : test.expectedStatus === 'passed' && test.outcome() === 'expected' && test.results.every(result => result.status === 'passed') ? 'passed' : 'failed'
  return { identity, status }
}

export default class VerificationReporter implements Reporter {
  private readonly contextPath: string
  private readonly request: BrowserRunRequest
  private suite: Suite | undefined

  constructor() {
    const path = process.env[reporterContextEnvironment]
    if (!path) throw new Error('Verification reporter requires a run context')
    this.contextPath = path
    this.request = readBrowserRunRequest(path)
  }

  printsToStdio(): boolean { return false }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.suite = suite
    const cases = new Map(suite.allTests().map(test => {
      const identity = testEvidence(test, this.request).identity
      return [caseKey(identity), identity]
    }))
    const selection: BrowserRunSelection = { schemaVersion: 1, runId: this.request.runId,
      fingerprint: this.request.fingerprint, cases: [...cases.values()] }
    writeImmutableJson(join(dirname(this.contextPath), 'selection.json'), selection)
  }

  onEnd(result: FullResult): void {
    const cases = new Map<string, CaseEvidence>()
    for (const test of this.suite?.allTests() ?? []) {
      const entry = testEvidence(test, this.request)
      const previous = cases.get(caseKey(entry.identity))
      cases.set(caseKey(entry.identity), previous && previous.status !== 'passed' ? previous : entry)
    }
    const value: BrowserRunResult = { schemaVersion: 1, runId: this.request.runId, fingerprint: this.request.fingerprint,
      requirementsSha256: this.request.requirements?.sha256 ?? null, status: result.status, cases: [...cases.values()] }
    writeImmutableJson(join(dirname(this.contextPath), 'results.json'), value)
  }
}
