import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { typescriptLoaderArgs } from '../typescript-loader'

const repository = resolve(import.meta.dirname, '../..')
const preload = join(repository, 'scripts/typescript-runtime.mjs')
const tsxPreflight = '/deps/tsx/dist/preflight.cjs'
const tsxLoader = 'file:///deps/tsx/dist/loader.mjs'
const temporary: string[] = []
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }) })

const runNode = (args: string[], cwd = repository) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 60_000 })

describe('typescriptLoaderArgs', () => {
  it('passes only the tsx loader pairs to children, not eval code or inspectors', () => {
    expect(typescriptLoaderArgs(['--require', tsxPreflight, '--import', tsxLoader, '--inspect=0', '--eval', 'run()'], '/work'))
      .toEqual(['--require', tsxPreflight, '--import', tsxLoader])
  })

  it('keeps the native preload absolute so children may change directory', () => {
    expect(typescriptLoaderArgs(['--import', './scripts/typescript-runtime.mjs'], '/app'))
      .toEqual(['--import', pathToFileURL('/app/scripts/typescript-runtime.mjs').href])
    expect(typescriptLoaderArgs(['--import=./scripts/typescript-runtime.mjs', '-r', tsxPreflight], '/app'))
      .toEqual(['--import', pathToFileURL('/app/scripts/typescript-runtime.mjs').href, '--require', tsxPreflight])
  })

  it('falls back to tsx when the parent has no TypeScript loader', () => {
    expect(typescriptLoaderArgs(['--conditions', 'development', '--import', 'file:///deps/telemetry.mjs'], '/work'))
      .toEqual(['--import', 'tsx'])
    expect(typescriptLoaderArgs([], '/work')).toEqual(['--import', 'tsx'])
  })
})

describe('native TypeScript preload', () => {
  it('resolves extensionless relative files and directory indexes while leaving explicit specifiers alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-typescript-runtime-'))
    temporary.push(root)
    mkdirSync(join(root, 'nested'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
    writeFileSync(join(root, 'value.ts'), 'export const value: number = 1\n')
    writeFileSync(join(root, 'explicit.ts'), 'export const explicit: string = "explicit"\n')
    writeFileSync(join(root, 'nested/index.ts'), 'import type { Name } from "../types"\nexport const nested: Name = "nested"\n')
    writeFileSync(join(root, 'types.ts'), 'export type Name = string\n')
    writeFileSync(join(root, 'main.ts'), [
      'import { value } from "./value"',
      'import { nested } from "./nested"',
      'import { explicit } from "./explicit.ts"',
      'import { join } from "node:path"',
      'console.log(JSON.stringify({ value, nested, explicit, joined: join("a", "b") }))',
    ].join('\n'))

    const result = runNode(['--import', preload, 'main.ts'], root)

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ value: 1, nested: 'nested', explicit: 'explicit', joined: join('a', 'b') })
  })

  it('reports a missing module instead of guessing beyond .ts and index.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'oa-typescript-runtime-'))
    temporary.push(root)
    writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
    writeFileSync(join(root, 'legacy.js'), 'export const legacy = true\n')
    writeFileSync(join(root, 'main.ts'), 'import { legacy } from "./legacy"\nconsole.log(legacy)\n')

    const result = runNode(['--import', preload, 'main.ts'], root)

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND')
  })

  it('loads the production entries’ module graph and a custom session worker without tsx', () => {
    // Modules the production entries import; the entries themselves start services.
    const entries = ['server/index.ts', 'scripts/container-entry.ts', 'scripts/local-backend.ts']
    const modules = entries.flatMap(entry => [...readFileSync(join(repository, entry), 'utf8')
      .matchAll(/^(?:import|export)\s[^'"]*?from\s+'(\.{1,2}\/[^']+)'|^import\s+'(\.{1,2}\/[^']+)'/gm)]
      .map(match => resolve(repository, entry, '..', match[1] ?? match[2])))
      // Language packs are build outputs; container-entry hands off to local-backend.
      .filter(path => !/language-packs$|scripts\/local-backend$/.test(path))
      .map(path => [path, `${path}.ts`, join(path, 'index.ts')].find(file => file.endsWith('.ts') && existsSync(file))!)
    expect(modules.length).toBeGreaterThan(40)
    const probe = `
      import { Worker } from 'node:worker_threads'
      for (const path of ${JSON.stringify(modules)}) await import(path)
      const worker = new Worker(${JSON.stringify(join(repository, 'server/game/custom-session-worker-entry.mjs'))})
      const reply = await new Promise((done, fail) => { worker.once('message', done); worker.once('error', fail); worker.postMessage({ id: 7, method: 'getState', args: [] }) })
      console.log(JSON.stringify(reply))
      process.exit(0)
    `

    // A file entry: workers inherit execArgv, which may not carry --input-type.
    const root = mkdtempSync(join(tmpdir(), 'oa-typescript-runtime-'))
    temporary.push(root)
    writeFileSync(join(root, 'probe.mjs'), probe)
    // Every thread inherits this guard, so a silent tsx fallback fails the probe.
    writeFileSync(join(root, 'forbid-tsx.mjs'), `import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'tsx' || specifier.startsWith('tsx/')) throw new Error('tsx loaded under the native runtime: ' + specifier)
  return next(specifier, context)
} })
`)
    const result = runNode(['--import', preload, '--import', join(root, 'forbid-tsx.mjs'), join(root, 'probe.mjs')])

    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({ id: 7, ok: false, error: 'custom session worker is not initialized' })
  }, 90_000)

  it('keeps the custom session worker working under the tsx development fallback', () => {
    const probe = `
      import { Worker } from 'node:worker_threads'
      const worker = new Worker(${JSON.stringify(join(repository, 'server/game/custom-session-worker-entry.mjs'))}, { execArgv: [] })
      const reply = await new Promise((done, fail) => { worker.once('message', done); worker.once('error', fail); worker.postMessage({ id: 8, method: 'getState', args: [] }) })
      console.log(JSON.stringify(reply))
      process.exit(0)
    `

    const result = runNode(['--input-type=module', '--eval', probe])

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({ id: 8, ok: false, error: 'custom session worker is not initialized' })
  }, 90_000)
})
