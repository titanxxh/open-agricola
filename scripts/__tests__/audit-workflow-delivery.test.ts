import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deliver, localProof, reconcileDelivery, workflowStatus } from '../audit-migration/delivery.mjs'
import { applyControl } from '../audit-migration/control.mjs'

const temporary: string[] = []
afterEach(() => { vi.unstubAllEnvs(); temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })) })
const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex')
const json = (file: string, value: unknown) => fs.writeFileSync(file, JSON.stringify(value))

function proofFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-delivery-proof-'))
  temporary.push(directory)
  const root = path.join(directory, 'repo')
  const raw = path.join(directory, 'raw')
  const workspace = path.join(directory, 'run')
  const bin = path.join(directory, 'bin')
  for (const file of [root, raw, bin]) fs.mkdirSync(file)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  git('init', '--quiet')
  fs.writeFileSync(path.join(root, '.gitignore'), 'output/\n')
  fs.writeFileSync(path.join(root, 'native.test.ts'), "it('keeps behavior', () => expect(1).toBe(1))\n")
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--no-gpg-sign', '-m', 'fixture')
  const head = git('rev-parse', 'HEAD')
  const tree = git('rev-parse', 'HEAD^{tree}')
  const prepush = path.join(directory, 'prepush.json')
  const pre = { mode: 'prepush', head, fingerprint: 'current-fingerprint', status: 'passed', steps: ['test-services', 'fast', 'lint'].map(name => ({ name, status: 'passed', exitCode: 0 })) }
  fs.mkdirSync(path.join(root, 'output/verification'), { recursive: true })
  json(prepush, pre); json(path.join(root, 'output/verification/prepush.json'), pre)
  json(path.join(raw, 'summary.json'), { rawMode: 'strict-expected', typesExit: 0, fileInventoryExit: 0, behaviorExit: 0, failed: 0, pending: 0, todo: 0, unresolvedSourceCases: 0, missingTypeRoots: [], includedTypeRoots: 1, coveredSourceCases: 3252, tests: 1, passed: 1 })
  const files = ['.gitignore', 'native.test.ts'].map(file => [file, hash(fs.readFileSync(path.join(root, file)))])
  const assembly = { candidateCommit: head, candidateFiles: files, candidateFingerprint: hash(JSON.stringify(files)) }
  json(path.join(raw, 'assembly.json'), assembly)
  fs.writeFileSync(path.join(bin, 'pnpm'), '#!/bin/sh\necho "[verify] prepush: current / passed"\n', { mode: 0o755 })
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`)
  return { directory, root, raw, workspace, bin, tree, head, prepush, assembly, request: { assignment: '', issue: 1222, pr: 1272, head, worktree: root, raw, prepush } }
}

describe('delivery source and interrupted-merge recovery', () => {
  it('retains strict RAW, current prepush and complete exact source byte inventory gates', () => {
    const fixture = proofFixture()
    expect(localProof(fixture.request)).toMatchObject({ head: fixture.head, tree: fixture.tree, rawCandidateFiles: 2 })
    json(path.join(fixture.raw, 'assembly.json'), { ...fixture.assembly, candidateFiles: [fixture.assembly.candidateFiles[0]] })
    expect(() => localProof(fixture.request)).toThrow('bytes or inventory')
    json(path.join(fixture.raw, 'assembly.json'), fixture.assembly)
    json(path.join(fixture.raw, 'summary.json'), { rawMode: 'observation' })
    expect(() => localProof(fixture.request)).toThrow('RAW')
  })

  it('reconciles an already merged exact-head PR and keeps status non-authorizing when every review passes', async () => {
    const fixture = proofFixture()
    const { root, workspace, head, tree, bin, directory } = fixture
    const mergeCommit = 'b'.repeat(40)
    const machine = { commit_sha: head, status: 'completed', has_any_findings: false, has_unresolved_findings: false }
    const body = `<!-- codex-pull-request-review-summary -->\n**Code Review** Completed \`${head}\` <time datetime="2026-10-17T01:00:00Z">done</time>\n**Security Review** Completed \`${head}\` <time datetime="2026-10-17T01:01:00Z">done</time>\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: machine, security_review: machine })} -->\n<!-- codex-security-review:v1 ${JSON.stringify({ headSha: head, status: 'completed' })} -->`
    const pull = { number: 1272, head: { sha: head, repo: { full_name: 'titanxxh/open-agricola' } }, state: 'closed', draft: false, base: { ref: 'main', repo: { full_name: 'titanxxh/open-agricola' } }, merged: true, merge_commit_sha: mergeCommit }
    const log = path.join(directory, 'gh.jsonl')
    fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');const endpoint=args[1];let response;
if(endpoint.endsWith('/pulls/1272'))response=${JSON.stringify(pull)};
else if(endpoint.includes('/git/commits/'))response={tree:{sha:${JSON.stringify(tree)}}};
else if(endpoint.includes('/comments?'))response=[{id:1,user:{login:'chatgpt-codex-connector[bot]'},body:${JSON.stringify(body)},updated_at:'2026-10-17T01:01:00Z',html_url:'https://example.invalid/summary'}];
else if(endpoint.includes('/reactions?'))response=[{id:2,user:{login:'chatgpt-codex-connector[bot]'},content:'+1',created_at:'2026-10-17T01:02:00Z'}];
else if(endpoint.includes('/actions/runs?'))response={workflow_runs:['CI','CI Full','E2E'].map((name,index)=>({id:index+1,name,head_sha:${JSON.stringify(mergeCommit)},event:'push',status:'completed',conclusion:'success',html_url:'https://example.invalid/run'}))};
else if(endpoint==='graphql')response={data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}};
else process.exit(91);process.stdout.write(JSON.stringify(response));
`, { mode: 0o755 })
    expect(reconcileDelivery({ root, workspace, request: { ...fixture.request, reconcile: true } })).toMatchObject({ phase: 'complete', head, mergeCommit, remoteWrites: false })
    expect(fs.existsSync(path.join(workspace, 'control.json'))).toBe(false)
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(calls.every(args => args[0] === 'api')).toBe(true)
    expect(fs.readFileSync(log, 'utf8')).not.toContain('"merge"')
    for (const changed of [
      { ...pull, number: 1273 },
      { ...pull, base: { ...pull.base, ref: 'release' } },
      { ...pull, base: { ...pull.base, repo: { full_name: 'other/project' } } },
      { ...pull, head: { ...pull.head, sha: 'c'.repeat(40) } },
    ]) {
      const fake = fs.readFileSync(path.join(bin, 'gh'), 'utf8')
      fs.writeFileSync(path.join(bin, 'gh'), fake.replace(JSON.stringify(pull), JSON.stringify(changed)))
      expect(() => reconcileDelivery({ root, workspace, request: { ...fixture.request, reconcile: true } })).toThrow('identity differs')
      fs.writeFileSync(path.join(bin, 'gh'), fake)
    }
    const fake = fs.readFileSync(path.join(bin, 'gh'), 'utf8')
    fs.writeFileSync(path.join(bin, 'gh'), fake.replace(JSON.stringify(pull), JSON.stringify({ ...pull, state: 'open', merged: false })))
    await applyControl({ workspace, request: { kind: 'pause', authority: 'finish this exact target', finishOnly: [{ issue: 1222, pr: 1272, head }] } })
    await applyControl({ workspace, request: { kind: 'remote-ci-policy', authority: 'explicit local-only CI policy', id: 'local-only-ci', issue: 1222, pr: 1272, head } })
    expect(workflowStatus(root, workspace, fixture.request)).toMatchObject({
      identity: { state: 'pass' }, codeReview: { state: 'pass' }, securityReview: { state: 'pass' }, physicalThumb: { state: 'pass' }, threads: { state: 'pass' },
      source: { state: 'pass' }, permission: { state: 'unknown' }, remoteCiRequirement: { state: 'not-required' },
      mergePermitted: false, blockers: ['a matching current-epoch assignment is required for execution'],
    })
  })

  it('rejects another repository before reading GitHub or admitting a delivery operation', async () => {
    const fixture = proofFixture()
    fs.writeFileSync(path.join(fixture.bin, 'gh'), '#!/bin/sh\nexit 99\n', { mode: 0o755 })
    const request = { ...fixture.request, repository: 'other/project' }
    expect(() => reconcileDelivery({ root: fixture.root, workspace: fixture.workspace, request })).toThrow('repository must be')
    await expect(deliver({ root: fixture.root, workspace: fixture.workspace, request })).rejects.toThrow('repository must be')
    expect(() => workflowStatus(fixture.root, fixture.workspace, request)).toThrow('repository must be')
  })

  it('keeps status non-authorizing and applies a CI policy only to its exact PR/head', async () => {
    const fixture = proofFixture()
    const { root, workspace, head, bin } = fixture
    fs.writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\nprintf "{}"\n', { mode: 0o755 })
    await applyControl({ workspace, request: { kind: 'pause', authority: 'exact target only', finishOnly: [{ issue: 1222, pr: 1272, head }] } })
    await applyControl({ workspace, request: { kind: 'remote-ci-policy', authority: 'exact-head remote CI exemption', id: 'remote-ci-exemption', issue: 1222, pr: 1272, head } })
    const exact = workflowStatus(root, workspace, fixture.request)
    expect(exact).toMatchObject({ mergePermitted: false, permission: { state: 'unknown' }, remoteCiRequirement: { state: 'not-required', permission: 'remote-ci-exemption' }, remoteCi: { state: 'unknown' } })
    expect(exact).toHaveProperty('blockers', expect.arrayContaining(['a matching current-epoch assignment is required for execution']))
    expect(workflowStatus(root, workspace, { ...fixture.request, head: 'c'.repeat(40) })).toMatchObject({ mergePermitted: false, permission: { state: 'fail' }, remoteCiRequirement: { state: 'required' } })
    expect(workflowStatus(root, workspace, { ...fixture.request, pr: 1273 })).toMatchObject({ mergePermitted: false, remoteCiRequirement: { state: 'required' } })
  })
})
