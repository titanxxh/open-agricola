// @covers scripts/build-frontend.ts
import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestPrereleaseVerification, runPrereleaseCandidateTask } from '../ci/prerelease-execution'
import { cleanupPrereleaseFixtures, prereleaseFixture } from './_helpers/prerelease-candidate'

afterEach(cleanupPrereleaseFixtures)

describe('trusted main dispatch', () => {
  it('dispatches the trusted main workflow with the immutable pre reference and only requested failed tasks', () => {
    const value = prereleaseFixture()
    requestPrereleaseVerification(value.cwd, value.repository, value.sha, 'fast,webkit')
    expect(value.calls().filter(call => call.body)).toEqual([{ args: [
      'api', `repos/${value.repository}/actions/workflows/200/dispatches`, '--method', 'POST', '--input', '-',
    ], body: { ref: 'main', inputs: { candidate_sha: value.sha, candidate_ref: value.fixedRef, tasks: 'fast,webkit' } } }])
  })
})

describe('channel-specific workflow and artifact targets', () => {
  it('runs ordinary prerelease pushes and PRs through canonical CI while isolating manual full verification', () => {
    const root = resolve(import.meta.dirname, '../..')
    const routine = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
    expect(routine.match(/branches: \[main, prerelease\]/g)).toHaveLength(2)
    expect(routine).toContain('scripts/ci/scoped-verification.ts plan')
    const workflow = readFileSync(join(root, '.github/workflows/prerelease-candidate-verification.yml'), 'utf8')
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'")
    expect(workflow).toContain('contents: read')
    expect(workflow).not.toMatch(/secrets:|contents: write|pages: write|id-token: write|self-hosted|environment:/)
    expect(workflow).toContain('persist-credentials: false')
    expect(workflow).not.toContain('  push:')
    expect(workflow).not.toContain('  pull_request:')
    expect(workflow.slice(workflow.indexOf('\n  task:'))).not.toContain('GH_TOKEN:')
    expect(workflow).toContain('run-name: prerelease / ${{ inputs.candidate_sha }} / ${{ inputs.tasks }}')
  })
})

it('builds explicit hosted artifact identity and refuses a prerelease Pages target before invoking the builder', () => {
  const value = prereleaseFixture()
  const source = resolve(import.meta.dirname, '../..')
  cpSync(join(source, 'scripts/build-frontend.ts'), join(value.cwd, 'scripts/build-frontend.ts'))
  mkdirSync(join(value.cwd, 'shared/contract/protocol'), { recursive: true })
  cpSync(join(source, 'shared/contract/protocol/app-location.ts'), join(value.cwd, 'shared/contract/protocol/app-location.ts'))
  value.git('add', '.'); value.git('commit', '-m', 'frontend tool')
  writeFileSync(join(value.bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
fs.appendFileSync('bin/build-calls.txt', 'build\\n');
`)
  chmodSync(join(value.bin, 'pnpm'), 0o755)
  const run = (mode: string, channel: string) => spawnSync(join(source, 'node_modules/.bin/tsx'), ['scripts/build-frontend.ts', mode], {
    cwd: value.cwd, env: { ...process.env, RELEASE_CHANNEL: channel, GAME_BUILD_ID: value.sha }, encoding: 'utf8',
  })
  const pre = run('hosted', 'prerelease')
  expect(pre.status, pre.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.cwd, 'dist/frontend-build.json'), 'utf8'))).toEqual({ format: 1, gameBuildId: value.sha,
    basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' })
  const rejected = run('pages', 'prerelease')
  expect(rejected.status).toBe(1)
  expect(rejected.stderr).toContain('cannot target formal Pages')
  expect(readFileSync(join(value.bin, 'build-calls.txt'), 'utf8').trim().split('\n')).toHaveLength(1)
})

it('runs baseline regressions in stable runtime and builds the pre production artifact with no formal token', () => {
  const value = prereleaseFixture()
  writeFileSync(join(value.bin, 'pnpm'), `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync('bin/task-environment.jsonl', JSON.stringify({ args: process.argv.slice(2), channel: process.env.RELEASE_CHANNEL,
  verificationChannel: process.env.VERIFICATION_CHANNEL, sha: process.env.GAME_BUILD_ID,
  hasToken: !!(process.env.GH_TOKEN || process.env.GITHUB_TOKEN) }) + '\\n');
`)
  chmodSync(join(value.bin, 'pnpm'), 0o755)
  vi.stubEnv('GITHUB_SHA', value.main)
  vi.stubEnv('RELEASE_CHANNEL', 'prerelease')
  vi.stubEnv('GH_TOKEN', 'formal-token-must-not-reach-candidate')
  vi.stubEnv('GITHUB_TOKEN', 'formal-token-must-not-reach-candidate')
  runPrereleaseCandidateTask(value.cwd, 'build', value.sha, value.main)
  runPrereleaseCandidateTask(value.cwd, 'webkit', value.sha, value.main)
  const calls = readFileSync(join(value.bin, 'task-environment.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(calls).toEqual([
    { args: ['run', 'build:hosted-frontend'], channel: 'prerelease', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
    { args: ['run', 'build:replay-viewer'], channel: 'stable', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
    { args: ['run', 'check:bundle-size'], channel: 'stable', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
    { args: ['run', 'verify:e2e:webkit'], channel: 'stable', verificationChannel: 'prerelease', sha: value.sha, hasToken: false },
  ])
})
