import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { ESLint } from 'eslint'

const eslint = new ESLint()
const clientProbePath = path.join(process.cwd(), 'client/app/BoundaryProbe.ts')

async function lintErrors(source: string) {
  const [result] = await eslint.lintText(source, { filePath: clientProbePath })
  return result.messages.filter((message) => message.severity === 2)
}

describe('main client import boundary', () => {
  it.each([
    '../../shared/cards/catalog',
    '../../shared/cards/catalog.ts',
    '../../shared/cards/catalog.js',
    '../../shared/cards/install-catalog-lookups',
    '../../shared/cards/install-catalog-lookups.ts',
    '../../shared/cards/install-catalog-lookups.js',
    '../../shared/cards/register-all',
    '../../shared/cards/register-all.ts',
    '../../shared/cards/register-all.js',
    '../../shared/cards/registry-runtime',
    '../../shared/cards/registry-runtime.ts',
    '../../shared/cards/registry-runtime.js',
    '../../shared/cards/A/A001_Test',
    '../../shared/cards/E/E001_Test',
    '../../shared/cards/community/C001_Test',
    '../../shared/cards/major/Major_Test',
    '../../shared/cards/__stubs__/STUB_Test',
  ])('reports forbidden static import %s', async (importPath) => {
    const errors = await lintErrors(`
      import '${importPath}'
      export const probe = 1
    `)

    expect(errors.map((error) => error.ruleId)).toEqual([
      '@typescript-eslint/no-restricted-imports',
    ])
  })

  it.each([
    '../../shared/session/game',
    '../../shared/engine/node',
    '../../shared/cards/catalog',
    '../../shared/cards/catalog.ts',
    '../../shared/cards/catalog.js',
    '../../shared/cards/install-catalog-lookups',
    '../../shared/cards/install-catalog-lookups.ts',
    '../../shared/cards/install-catalog-lookups.js',
    '../../shared/cards/register-all',
    '../../shared/cards/register-all.ts',
    '../../shared/cards/register-all.js',
    '../../shared/cards/registry-runtime',
    '../../shared/cards/registry-runtime.ts',
    '../../shared/cards/registry-runtime.js',
    '../../shared/cards/A/A001_Test',
    '../../shared/cards/E/E001_Test',
    '../../shared/cards/community/C001_Test',
    '../../shared/cards/major/Major_Test',
    '../../shared/cards/__stubs__/STUB_Test',
  ])('reports forbidden dynamic import %s', async (importPath) => {
    const errors = await lintErrors(`
      export async function probe() {
        return import('${importPath}')
      }
    `)

    expect(errors.map((error) => error.ruleId)).toEqual([
      'no-restricted-syntax',
    ])
  })

  it.each([
    '../../shared/cards/basic-conversion',
    '../../shared/cards/custom-registry',
    '../../shared/cards/helpers/costs',
  ])('allows safe static and dynamic import %s', async (importPath) => {
    const errors = await lintErrors(`
      import '${importPath}'
      export async function probe() {
        return import('${importPath}')
      }
    `)

    expect(errors).toEqual([])
  })
})
