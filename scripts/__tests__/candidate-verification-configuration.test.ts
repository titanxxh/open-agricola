import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verificationConfiguration } from '../ci/verification-tasks'

const required = [
  '.github/workflows/candidate-verification.yml', 'scripts/ci/verification-tasks.ts',
  'scripts/ci/candidate-verification.ts', 'package.json', 'pnpm-lock.yaml',
]
const roots: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'verification-configuration-'))
  roots.push(cwd)
  const files: Record<string, string | Uint8Array> = {
    ...Object.fromEntries(required.map(file => [file, `${file}\n`])),
    'scripts/ci/empty.ts': '',
    'scripts/ci/unicode.ts': '支付\n动物\0计分',
    'scripts/ci/invalid-utf8.ts': Buffer.from([0x61, 0xc3, 0x28, 0x00, 0xff]),
    'scripts/verification-extra.ts': 'export const configuration = true',
    'scripts/verify-extra.ts': 'verify\n',
    'scripts/verify-extra.sh': '#!/bin/sh\n',
    'scripts/test-project-globs.ts': 'projects\n',
    'scripts/release/requirements.json': '{}\n',
    'vitest.config.ts': 'vitest\n',
    'playwright.config.ts': 'playwright\n',
    'vite.config.ts': 'vite\n',
    'tsconfig.json': '{}\n',
    'tsconfig.verification-tools.json': '{}\n',
  }
  const write = (file: string, content: string | Uint8Array) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    writeFileSync(join(cwd, file), content)
  }
  for (const [file, content] of Object.entries(files)) write(file, content)
  write('scripts/__tests__/unrelated.test.ts', 'ignored test\n')
  write('.github/workflows/unrelated.yml', 'ignored workflow\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main')
  git('config', 'user.name', 'Configuration Test')
  git('config', 'user.email', 'configuration@example.test')
  const commit = () => {
    git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**')
    git('commit', '-m', 'configuration fixture')
    return git('rev-parse', 'HEAD')
  }
  const sha = commit()
  const legacyHash = (candidate: string) => {
    const hash = createHash('sha256').update('open-agricola-full-verification-v1\0')
    for (const file of Object.keys(files).sort()) {
      hash.update(file + '\0').update(execFileSync('git', ['show', `${candidate}:${file}`], { cwd, encoding: 'utf8' })).update('\0')
    }
    return hash.digest('hex')
  }
  const proxyGit = (output?: Buffer) => {
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    const bin = mkdtempSync(join(tmpdir(), 'verification-configuration-bin-'))
    roots.push(bin)
    const log = join(bin, 'calls.jsonl')
    const response = output === undefined ? null : join(bin, 'response')
    if (response) writeFileSync(response, output ?? '')
    writeFileSync(join(bin, 'git'), `#!${process.execPath}
const fs = require('node:fs'); const cp = require('node:child_process'); const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + '\\n');
if (args[0] === 'cat-file' && ${JSON.stringify(response)} !== null) {
  fs.writeFileSync(1, fs.readFileSync(${JSON.stringify(response)})); process.exit(0);
}
const result = cp.spawnSync(${JSON.stringify(realGit)}, args, { stdio: 'inherit' }); process.exit(result.status ?? 1);
`)
    chmodSync(join(bin, 'git'), 0o755)
    vi.stubEnv('PATH', bin + delimiter + process.env.PATH)
    return () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  }
  return { cwd, sha, write, commit, git, legacyHash, proxyGit }
}

describe('candidate verification configuration object reads', () => {
  it('preserves the legacy file selection, ordering, delimiters, and UTF8 decoding with two Git commands', () => {
    const value = fixture()
    const expected = value.legacyHash(value.sha)
    const calls = value.proxyGit()

    expect(verificationConfiguration(value.cwd, value.sha)).toBe(expected)
    expect(calls()).toEqual([['ls-tree', '-r', '--name-only', value.sha], ['cat-file', '--batch']])
  })

  it('reads each requested immutable SHA after HEAD and the working tree have changed', () => {
    const value = fixture()
    const first = value.legacyHash(value.sha)
    value.write('scripts/ci/unicode.ts', 'changed committed configuration\n')
    const nextSha = value.commit()
    const second = value.legacyHash(nextSha)
    value.write('scripts/ci/unicode.ts', 'uncommitted configuration\n')

    expect(first).not.toBe(second)
    expect(verificationConfiguration(value.cwd, value.sha)).toBe(first)
    expect(verificationConfiguration(value.cwd, nextSha)).toBe(second)
    expect(verificationConfiguration(value.cwd, value.sha)).toBe(first)
  })

  it('accepts aggregate output larger than one serial Git command buffer', () => {
    const value = fixture()
    value.write('scripts/ci/empty.ts', 'a'.repeat(700_000))
    value.write('scripts/ci/unicode.ts', 'b'.repeat(700_000))
    const sha = value.commit()

    expect(verificationConfiguration(value.cwd, sha)).toBe(value.legacyHash(sha))
  })

  it.each(required)('refuses a candidate missing required %s before reading any blobs', file => {
    const value = fixture()
    rmSync(join(value.cwd, file))
    const sha = value.commit()
    const calls = value.proxyGit()

    expect(() => verificationConfiguration(value.cwd, sha)).toThrow(`Candidate lacks complete verification configuration: ${file}`)
    expect(calls()).toEqual([['ls-tree', '-r', '--name-only', sha]])
  })

  it.each([
    ['missing object', Buffer.from('candidate:path missing\n')],
    ['unterminated header', Buffer.from('a'.repeat(40) + ' blob 0')],
    ['non-blob object', Buffer.from('a'.repeat(40) + ' tree 0\n\n')],
    ['invalid size', Buffer.from('a'.repeat(40) + ' blob -1\n\n')],
    ['unsafe size', Buffer.from('a'.repeat(40) + ' blob 9007199254740992\n\n')],
    ['truncated content', Buffer.from('a'.repeat(40) + ' blob 5\nabc\n')],
    ['missing separator', Buffer.from('a'.repeat(40) + ' blob 3\nabc')],
    ['wrong separator', Buffer.from('a'.repeat(40) + ' blob 3\nabcx')],
  ])('refuses %s in a successful Git batch response', (_name, output) => {
    const value = fixture()
    value.proxyGit(output)

    expect(() => verificationConfiguration(value.cwd, value.sha)).toThrow(/verification configuration blob/)
  })

  it('refuses unexpected trailing output after all requested blobs', () => {
    const value = fixture()
    const files = value.git('ls-tree', '-r', '--name-only', value.sha).split('\n')
      .filter(file => !file.includes('unrelated')).sort()
    const output = execFileSync('git', ['cat-file', '--batch'], { cwd: value.cwd, input: files.map(file => `${value.sha}:${file}\n`).join('') })
    value.proxyGit(Buffer.concat([output, Buffer.from('unexpected\n')]))

    expect(() => verificationConfiguration(value.cwd, value.sha)).toThrow('Unexpected verification configuration blob output')
  })
})
