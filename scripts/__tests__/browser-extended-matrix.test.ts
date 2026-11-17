import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ROUTINE_BROWSER_SMOKE_SET } from '../ci/routine-verification-plan'

const root = resolve(import.meta.dirname, '../..')
const specs = readdirSync(join(root, 'e2e-tests')).filter(name => name.endsWith('.spec.ts'))
  .map(name => ({ file: `e2e-tests/${name}`, lines: readFileSync(join(root, 'e2e-tests', name), 'utf8').split('\n') }))
const marked = (line: string) => line.includes('matrixVariant(')
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

describe('extended browser matrix variants', () => {
  it('leaves tagged variants out by default and runs them with E2E_EXTENDED=1', async () => {
    vi.stubEnv('E2E_EXTENDED', undefined)
    expect((await import('../../playwright.config')).default.grepInvert).toEqual(/@extended/)
    vi.resetModules()
    vi.stubEnv('E2E_EXTENDED', '1')
    expect((await import('../../playwright.config')).default.grepInvert).toBeUndefined()
    // The exclusion matches Playwright tags, which the helper is the only place to spell.
    expect(readFileSync(join(root, 'e2e-tests/helpers/extended.ts'), 'utf8')).toContain("EXTENDED_TAG = '@extended'")
    expect(specs.filter(spec => spec.lines.some(line => line.includes('@extended'))).map(spec => spec.file)).toEqual([])
  })

  // The default exclusion also applies under an explicit --grep, so a selected case must never be a tagged variant.
  it('never marks a case that a script or the routine smoke set selects with --grep', () => {
    const scripts: Record<string, string> = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts
    const selections = [...new Set([
      ...ROUTINE_BROWSER_SMOKE_SET.flatMap(entry => entry.grep ? [entry.grep] : []),
      ...Object.values(scripts).flatMap(script => [...script.matchAll(/--grep (\S+)/g)].map(match => match[1])),
    ])]
    expect(selections).toEqual(expect.arrayContaining(['@viewport', '@webkit']))
    for (const spec of specs) {
      for (const selection of selections) {
        const selected = spec.lines.filter(line => line.includes(selection))
        if (!selected.length) continue
        expect(selected.filter(marked), `${spec.file} marks a case selected by --grep ${selection}`).toEqual([])
        // A tag can sit on an enclosing describe, so a file that carries a selected tag has no variants at all.
        if (selection.startsWith('@')) expect(spec.lines.filter(marked), `${spec.file} carries ${selection}`).toEqual([])
      }
    }
  })

  it('never marks a case that a requirements file names', () => {
    for (const path of ['scripts/release/requirements.json', 'e2e-tests/encyclopedia.requirements.json']) {
      const cases: { file: string; titlePath: string[] }[] = JSON.parse(readFileSync(join(root, path), 'utf8')).cases
      for (const required of cases) {
        const spec = specs.find(candidate => candidate.file === required.file)
        if (!spec) throw new Error(`${path} names a missing spec ${required.file}`)
        const title = required.titlePath.at(-1)!
        const declared = spec.lines.filter(line => line.includes(`'${title}'`) || line.includes(`\`${title}\``))
        // A required case under a describe, or one whose title is built from a template, keeps its whole file unmarked.
        if (required.titlePath.length > 1 || !declared.length) expect(spec.lines.filter(marked), `${spec.file} holds required cases`).toEqual([])
        else expect(declared.filter(marked), `${required.file} › ${title}`).toEqual([])
      }
    }
  })
})
