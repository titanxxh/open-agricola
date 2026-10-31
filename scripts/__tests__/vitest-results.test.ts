import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertVitestResults } from '../ci/vitest-results'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
const cwd = '/repository'
const file = 'shared/__tests__/payment.test.ts'
const moduleResult = (name = join(cwd, file)) => ({
  name, status: 'passed', assertionResults: [{ status: 'passed' }],
})
const report = (testResults: unknown[] = [moduleResult()]) => ({
  success: true, numFailedTests: 0, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults,
})
function verify(value: unknown, files = [file]) {
  const directory = mkdtempSync(join(tmpdir(), 'vitest-results-'))
  directories.push(directory)
  const path = join(directory, 'report.json')
  writeFileSync(path, JSON.stringify(value))
  return assertVitestResults({ cwd, report: path, files })
}

describe('Vitest complete-file results', () => {
  it('accepts every selected file exactly once, independently of reporter order and intentional skips', () => {
    expect(verify(report([
      { ...moduleResult('/repository/server/__tests__/payment.test.ts'), assertionResults: [{ status: 'skipped' }, { status: 'todo' }] },
      moduleResult(),
    ]), [file, 'server/__tests__/payment.test.ts'])).toEqual([
      'server/__tests__/payment.test.ts', 'shared/__tests__/payment.test.ts',
    ])
  })

  it.each([
    { name: 'missing file', value: report(), files: [file, 'server/missing.test.ts'] },
    { name: 'extra substring match', value: report([moduleResult(), moduleResult('/repository/copy/shared/__tests__/payment.test.ts')]) },
    { name: 'duplicate file', value: report([moduleResult(), moduleResult()]) },
    { name: 'zero modules', value: report([]) },
    { name: 'failed summary', value: { ...report(), success: false } },
    { name: 'failed test count', value: { ...report(), numFailedTests: 1 } },
    { name: 'failed suite count', value: { ...report(), numFailedTestSuites: 1 } },
    { name: 'unfinished suite', value: { ...report(), numPendingTestSuites: 1 } },
    { name: 'failed module', value: report([{ ...moduleResult(), status: 'failed' }]) },
    { name: 'failed assertion despite successful summary', value: report([{ ...moduleResult(), assertionResults: [{ status: 'failed' }] }]) },
    { name: 'unfinished assertion', value: report([{ ...moduleResult(), assertionResults: [{ status: 'pending' }] }]) },
    { name: 'missing assertions', value: report([{ name: join(cwd, file), status: 'passed' }]) },
    { name: 'relative reporter path', value: report([moduleResult(file)]) },
    { name: 'invalid root', value: null },
  ])('rejects $name', ({ value, files }) => {
    expect(() => verify(value, files)).toThrow()
  })

  it('rejects absent and invalid JSON evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'vitest-results-'))
    directories.push(directory)
    const path = join(directory, 'report.json')
    expect(() => assertVitestResults({ cwd, report: path, files: [file] })).toThrow()
    writeFileSync(path, '{incomplete')
    expect(() => assertVitestResults({ cwd, report: path, files: [file] })).toThrow()
  })
})
