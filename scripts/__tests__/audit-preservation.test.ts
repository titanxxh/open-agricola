import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { checkPreservation, preserveAssertions } from '../audit-migration/preservation.mjs'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })))

const original = `import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
describe('food reward', () => {
  it('excludes held, self and unrelated triggers', () => {
    for (const mode of ['held', 'self', 'unrelated']) {
      const session = setup(mode, [1, 2, 3])
      const response = session.takeAction(1, 'grove', { payment: 2 })
      assert.equal(response.ok, true)
      assert.equal(response.state.players[0].resources.food, 0)
    }
  })
})`

describe('assertions-only preservation', () => {
  it('retains original assertions and commands while adding a bystander expectation', () => {
    const candidate = original.replace('assert.equal(response.ok, true)',
      'assert.deepEqual(response.state.players.map(p => p.resources.food), [0, 0, 0, 0])\n      assert.equal(response.ok, true)')
    expect(preserveAssertions(original, candidate)).toMatchObject({ retainedAssertions: 2, addedAssertions: 1 })
  })

  it.each([
    ['one negative input', "['held', 'self', 'unrelated']", "['held', 'unrelated']"],
    ['one loop value', '[1, 2, 3]', '[1, 2, 4]'],
    ['driver parameters', "takeAction(1, 'grove', { payment: 2 })", "takeAction(2, 'grove', { payment: 2 })"],
    ['original assertion', 'assert.equal(response.ok, true)', ''],
    ['original expected value', 'resources.food, 0', 'resources.food, 1'],
    ['test title', 'excludes held, self and unrelated triggers', 'allows payment'],
  ])('rejects removing or altering %s', (_label, before, after) => {
    expect(() => preserveAssertions(original, original.replace(before, after))).toThrow()
  })

  it('rejects moving an original assertion across the command it observes', () => {
    const candidate = original.replace('      assert.equal(response.ok, true)\n', '')
      .replace("      const response = session.takeAction", "      assert.equal(response.ok, true)\n      const response = session.takeAction")
    expect(() => preserveAssertions(original, candidate)).toThrow('moved across a command/branch')
  })

  it('handles aliased assertion imports without certifying shadowed bindings', () => {
    const baseline = original.replace("import assert from", "import check from").replaceAll('assert.', 'check.')
    const candidate = baseline.replace('check.equal(response.ok, true)', 'check.equal(response.ok, true)\n      check.equal(response.state.players[3].resources.food, 0)')
    expect(preserveAssertions(baseline, candidate).addedAssertions).toBe(1)
    const shadowed = candidate.replace('const response =', 'const check = customAssertion\n      const response =')
    expect(() => preserveAssertions(shadowed, shadowed)).toThrow('shadowed')
  })

  it.each([
    "assert.equal(session.takeAction(2, 'forest').ok, true)",
    'assert.equal(response.state.players[0].resources.food++, 0)',
    'assert.equal(runUnknownHelper(), 0)',
    'assert.equal(response.ok as any, true)',
  ])('rejects an uncertified execution inside a new assertion: %s', addition => {
    const candidate = original.replace('assert.equal(response.ok, true)', `${addition}\n      assert.equal(response.ok, true)`)
    expect(() => preserveAssertions(original, candidate)).toThrow()
  })

  it('preserves string contents rather than deleting whitespace from literals', () => {
    expect(() => preserveAssertions(original, original.replace("'grove'", "'g rove'"))).toThrow('Non-assertion syntax')
  })

  it('rejects expectation configuration that can replace original matchers', () => {
    const before = "import { expect, it } from 'vitest'; it('reward', () => { expect(1).toBe(1) })"
    const after = before.replace('expect(1).toBe(1)', "expect.extend({ toBe: () => ({ pass: true, message: () => '' }) }); expect(1).toBe(1)")
    expect(() => preserveAssertions(before, after)).toThrow('Non-assertion syntax')
  })

  it('rejects a tagged-template invocation added inside an assertion', () => {
    const before = original.replace('const session = setup', "const step = () => session.takeAction(2, 'forest')\n      const session = setup")
    const after = before.replace('assert.equal(response.ok, true)', 'assert.equal(step`ignored`.ok, true); assert.equal(response.ok, true)')
    expect(() => preserveAssertions(before, after)).toThrow('mutation or execution boundary')
  })

  it('refuses a locally shadowed conversion function', () => {
    const before = original.replace('const session = setup', "const Number = () => session.takeAction(2, 'forest')\n      const session = setup")
    expect(() => preserveAssertions(before, before)).toThrow('Query global is shadowed')
  })

  it('rejects class static initialization inside an added assertion', () => {
    const before = original.replace('const session = setup', "const step = () => session.takeAction(2, 'forest')\n      const session = setup")
    const after = before.replace('assert.equal(response.ok, true)', 'assert.ok(class Number { static isInteger = step; static result = Number.isInteger() }); assert.equal(response.ok, true)')
    expect(() => preserveAssertions(before, after)).toThrow('shadowed')
  })

  it('rejects unsupported assertion bindings and syntax instead of guessing', () => {
    expect(() => preserveAssertions('const assert = custom; assert(true)', 'const assert = custom; assert(true)')).toThrow('No supported assertion import')
    expect(() => preserveAssertions(original, original + '\nconst =')).toThrow('invalid TypeScript')
  })

  it('supports chained Vitest expectations inside a fixed block', () => {
    const before = "import { expect as verify, it } from 'vitest'; it('reward', () => { verify(1).toBe(1) })"
    const after = before.replace('verify(1).toBe(1)', 'verify(1).toBe(1); verify([0, 0]).toEqual([0, 0])')
    expect(preserveAssertions(before, after)).toMatchObject({ retainedAssertions: 1, addedAssertions: 1 })
  })

  it('refuses to certify a diff with an omitted changed input file', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assertion-preservation-'))
    temporary.push(root)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
    git('init', '--quiet')
    fs.writeFileSync(path.join(root, 'one.test.ts'), original)
    fs.writeFileSync(path.join(root, 'two.test.ts'), original)
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'base')
    const base = git('rev-parse', 'HEAD')
    fs.writeFileSync(path.join(root, 'two.test.ts'), original.replace("['held', 'self', 'unrelated']", "['held']"))
    git('add', '.')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'drop negative input')
    const files = path.join(root, 'scope.json')
    fs.writeFileSync(files, JSON.stringify(['one.test.ts']))
    expect(() => checkPreservation(root, new Map([['base', base], ['head', 'HEAD'], ['files', files]]))).toThrow('undeclared files: two.test.ts')
  })
})
