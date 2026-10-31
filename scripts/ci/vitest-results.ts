import { readFileSync } from 'node:fs'
import { isAbsolute, relative, sep } from 'node:path'

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function assertVitestResults(input: { cwd: string; report: string; files: readonly string[] }): string[] {
  const value: unknown = JSON.parse(readFileSync(input.report, 'utf8'))
  if (!object(value) || value.success !== true || value.numFailedTests !== 0
    || value.numFailedTestSuites !== 0 || value.numPendingTestSuites !== 0
    || !Array.isArray(value.testResults) || !value.testResults.length) {
    throw new Error('Vitest report is missing complete successful module results')
  }
  const files = value.testResults.map((module: unknown) => {
    if (!object(module) || typeof module.name !== 'string' || !isAbsolute(module.name)
      || module.status !== 'passed' || !Array.isArray(module.assertionResults)
      || module.assertionResults.some((assertion: unknown) => !object(assertion)
        || typeof assertion.status !== 'string' || !['passed', 'skipped', 'todo'].includes(assertion.status))) {
      throw new Error('Vitest report contains a failed or incomplete module')
    }
    return relative(input.cwd, module.name).split(sep).join('/')
  }).sort()
  if (new Set(files).size !== files.length) throw new Error('Vitest report contains duplicate modules')
  const expected = [...input.files].sort()
  if (files.length !== expected.length || files.some((file, index) => file !== expected[index])) {
    throw new Error('Vitest reported modules do not match the selected complete files')
  }
  return files
}
