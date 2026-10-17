import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { publishExisting } from '../audit-migration/publish.mjs'
import { applyControl } from '../audit-migration/control.mjs'

const temporary: string[] = []
afterEach(() => { vi.unstubAllEnvs(); temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })) })
const digest = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex')
const json = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
const git = (root: string, ...args: string[]) => execFileSync(realGit, args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const operations = ['publication:push', 'publication:update-pr', 'publication:request-review']
type RecordedCall = { tool: string; argv: string[]; mutation: boolean; payload?: { body: string; title?: string } }
type FixtureOptions = { afterPush?: string; afterPatch?: string; interrupted?: string }

async function fixture(options: FixtureOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-publication-test-'))
  temporary.push(directory)
  const root = path.join(directory, 'repo')
  const raw = path.join(directory, 'raw')
  const bin = path.join(directory, 'bin')
  const workspace = path.join(directory, 'control')
  for (const folder of [root, raw, bin]) fs.mkdirSync(folder)
  git(root, 'init', '--quiet')
  git(root, 'config', 'user.name', 'Publication fixture')
  git(root, 'config', 'user.email', 'publication@example.invalid')
  fs.writeFileSync(path.join(root, '.gitignore'), 'output/\n')
  fs.writeFileSync(path.join(root, 'base.txt'), 'base')
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'main fixture')
  const base = git(root, 'rev-parse', 'HEAD')
  const branch = 'workflow-publication-fixture'
  git(root, 'switch', '--quiet', '-c', branch)
  fs.mkdirSync(path.join(root, 'server/__tests__'), { recursive: true })
  fs.writeFileSync(path.join(root, 'server/__tests__/native.test.ts'), "it('keeps payment behavior', () => expect(1).toBe(1))\n")
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'native fixture')
  const head = git(root, 'rev-parse', 'HEAD')
  const tree = git(root, 'rev-parse', 'HEAD^{tree}')
  git(root, 'update-ref', 'refs/remotes/origin/main', base)
  const divergent = git(root, 'commit-tree', `${base}^{tree}`, '-p', base, '-m', 'divergent main fixture')
  const prepush = path.join(directory, 'prepush.json')
  const pre = { mode: 'prepush', head, fingerprint: 'fixture-host-fingerprint', status: 'passed', steps: ['test-services', 'fast', 'lint'].map(name => ({ name, status: 'passed', exitCode: 0 })) }
  json(prepush, pre)
  json(path.join(root, 'output/verification/prepush.json'), pre)
  const files = git(root, 'ls-files', '-z').split('\0').filter(Boolean).sort().map(file => [file, digest(fs.readFileSync(path.join(root, file)))])
  json(path.join(raw, 'assembly.json'), { candidateCommit: head, candidateFiles: files, candidateFingerprint: digest(JSON.stringify(files)) })
  const summary = { rawMode: 'strict-expected', typesExit: 0, fileInventoryExit: 0, behaviorExit: 0, failed: 0, pending: 0, todo: 0, unresolvedSourceCases: 0, missingTypeRoots: [], includedTypeRoots: 1, coveredSourceCases: 3252, tests: 1, passed: 1 }
  json(path.join(raw, 'summary.json'), summary)
  const bodyFile = path.join(directory, 'body.md')
  const body = `验证 head ${head}\n\n保留换行与字面量 $HOME。\n`
  fs.writeFileSync(bodyFile, body)
  const log = path.join(directory, 'calls.jsonl')
  const stateFile = path.join(directory, 'github.json')
  const repository = 'titanxxh/open-agricola'
  const state = { main: base, head, divergent, root, raw, prepush, comments: [], ...options, pr: { number: 1272, state: 'open', draft: false, head: { sha: base, ref: branch, repo: { full_name: repository } }, base: { ref: 'main', repo: { full_name: repository } }, body: 'old body', title: 'old title' } }
  json(stateFile, state)
  const programPrelude = `const fs=require('node:fs'),cp=require('node:child_process');const a=process.argv.slice(2);const file=${JSON.stringify(stateFile)},log=${JSON.stringify(log)},realGit=${JSON.stringify(realGit)};const s=JSON.parse(fs.readFileSync(file,'utf8'));const save=()=>fs.writeFileSync(file,JSON.stringify(s));const record=(tool,mutation,payload)=>fs.appendFileSync(log,JSON.stringify({tool,argv:a,mutation,payload})+'\\n');const interrupt=kind=>{if(s.interrupted===kind&&!s.interruptionConsumed){s.interruptionConsumed=true;save();process.exit(88)}};`
  fs.writeFileSync(path.join(bin, 'git'), `#!/usr/bin/env node
${programPrelude}
if(a[0]==='push'){
 record('git',true);s.pr.head.sha=s.head;
 if(s.afterPush==='invalidate-raw'){const p=s.raw+'/summary.json';const raw=JSON.parse(fs.readFileSync(p,'utf8'));raw.rawMode='observation';fs.writeFileSync(p,JSON.stringify(raw));}
 if(s.afterPush==='advance-main'){s.main=s.divergent;cp.execFileSync(realGit,['update-ref','refs/remotes/origin/main',s.main],{cwd:s.root});}
 save();interrupt('push');process.stdout.write('fake push accepted');
}else{record('git',false);const r=cp.spawnSync(realGit,a,{cwd:process.cwd(),env:process.env,encoding:'utf8'});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');process.exit(r.status??1);}
`, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
${programPrelude}
const endpoint=a.find(x=>x.startsWith('repos/'))||a[1];const method=a.includes('-X')?a[a.indexOf('-X')+1]:'GET';const payload=a.includes('--input')?JSON.parse(fs.readFileSync(a[a.indexOf('--input')+1],'utf8')):undefined;record('gh',method!=='GET',payload);let result;
if(endpoint.endsWith('/branches/main'))result={commit:{sha:s.main}};
else if(endpoint.endsWith('/pulls/1272')){
 if(method==='PATCH'){Object.assign(s.pr,payload);if(s.afterPatch==='invalidate-prepush'){const p=s.root+'/output/verification/prepush.json';const pre=JSON.parse(fs.readFileSync(p,'utf8'));pre.fingerprint='changed';fs.writeFileSync(p,JSON.stringify(pre));}if(s.afterPatch==='advance-main'){s.main=s.divergent;cp.execFileSync(realGit,['update-ref','refs/remotes/origin/main',s.main],{cwd:s.root});}save();interrupt('update-pr');}
 result=s.pr;
}else if(endpoint.includes('/issues/1272/comments')){
 if(method==='POST'){const c={id:s.comments.length+1,body:payload.body,html_url:'https://example.invalid/comment/'+(s.comments.length+1)};s.comments.push(c);save();interrupt('request-review');result=c;}else result=s.comments;
}else if(endpoint.includes('/issues/1272/reactions'))result=[];
else if(endpoint==='graphql')result={data:{repository:{pullRequest:{reviewThreads:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}}}};
else{process.stderr.write('Unexpected fake GitHub endpoint '+endpoint);process.exit(91);}
process.stdout.write(JSON.stringify(result));
`, { mode: 0o755 })
  fs.writeFileSync(path.join(bin, 'pnpm'), `#!/usr/bin/env node
${programPrelude}
record('pnpm',false);if(JSON.stringify(a)!==JSON.stringify(['verify','status']))process.exit(92);process.stdout.write('[verify] prepush: current / passed\\n');
`, { mode: 0o755 })
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`)
  await applyControl({ root, workspace, request: { kind: 'pause', authority: 'fixture permits only the existing exact PR', finishOnly: [{ issue: 1222, pr: 1272, head }] } })
  const claim = async (id: string) => {
    const result = await applyControl({ root, workspace, request: { kind: 'grant', authority: 'fixture publication only', assignment: { id, worker: 'publisher', issue: 1222, pr: 1272, head, operations } } })
    if (!('file' in result)) throw new Error('fixture claim missing')
    return result.file
  }
  const assignment = await claim('first')
  const request = { assignment, issue: 1222, pr: 1272, head, worktree: root, raw, prepush, branch, bodyFile, expectedRemoteHead: base }
  const calls = (): RecordedCall[] => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  fs.writeFileSync(log, '')
  return { directory, root, raw, workspace, bin, tree, head, base, divergent, prepush, stateFile, body, request, claim, calls, summary, state }
}

it.each(['missing-assignment', 'paused', 'stale', 'wrong-pr', 'wrong-head'])('rejects %s without any GitHub or Git write', async fault => {
  const f = await fixture()
  let request: unknown = f.request
  if (fault === 'missing-assignment') { const { assignment: _assignment, ...rest } = f.request; request = rest }
  if (fault === 'paused' || fault === 'stale') {
    await applyControl({ root: f.root, workspace: f.workspace, request: { kind: 'pause', authority: 'fixture revokes publication', finishOnly: [] } })
    if (fault === 'paused') {
      const control = JSON.parse(fs.readFileSync(path.join(f.workspace, 'control.json'), 'utf8'))
      const claim = JSON.parse(fs.readFileSync(f.request.assignment, 'utf8'))
      json(f.request.assignment, { ...claim, epoch: control.epoch })
    }
  }
  if (fault === 'wrong-pr') request = { ...f.request, pr: 1271 }
  if (fault === 'wrong-head') request = { ...f.request, head: f.base }
  await expect(publishExisting({ root: f.root, workspace: f.workspace, request })).rejects.toThrow()
  expect(f.calls().filter(call => call.mutation)).toEqual([])
  expect(f.calls().filter(call => call.tool === 'gh')).toEqual([])
})

it.each(['code', 'security'])('publishes exactly the assigned PR/head and requests %s review with an exact marker', async review => {
  const f = await fixture()
  const result = await publishExisting({ root: f.root, workspace: f.workspace, request: { ...f.request, review } })
  expect(result).toMatchObject({ mode: 'publication', head: f.head, reviewsWaived: false, results: [{ operation: 'push', state: 'published' }, { operation: 'update-pr', state: 'updated' }, { operation: 'request-review', state: 'requested', kind: review }] })
  const writes = f.calls().filter(call => call.mutation)
  expect(writes.map(call => ({ tool: call.tool, argv: call.argv.slice(0, 4) }))).toEqual([
    { tool: 'git', argv: ['push', `--force-with-lease=refs/heads/${f.request.branch}:${f.base}`, 'origin', `HEAD:refs/heads/${f.request.branch}`] },
    { tool: 'gh', argv: ['api', '-X', 'PATCH', 'repos/titanxxh/open-agricola/pulls/1272'] },
    { tool: 'gh', argv: ['api', '-X', 'POST', 'repos/titanxxh/open-agricola/issues/1272/comments'] },
  ])
  expect(writes[1].payload).toEqual({ body: f.body })
  expect(writes[2].payload).toEqual({ body: `${review === 'security' ? '@codex security review' : '@codex review'}\n\n<!-- oa-audit-review-request:${review}:${f.head} -->` })
  expect(f.calls().filter(call => call.tool === 'pnpm')).toHaveLength(3)
  expect(f.calls().filter(call => call.tool === 'git' && call.argv[0] === 'merge-base').map(call => call.argv)).toEqual(Array.from({ length: 3 }, () => ['merge-base', '--is-ancestor', f.base, f.head]))
})

it.each(['stale-origin', 'main-not-ancestor', 'raw-incomplete', 'prepush-stale', 'source-drift'])('keeps %s as a prepublication blocker', async fault => {
  const f = await fixture()
  if (fault === 'stale-origin') git(f.root, 'update-ref', 'refs/remotes/origin/main', f.head)
  if (fault === 'main-not-ancestor') {
    git(f.root, 'update-ref', 'refs/remotes/origin/main', f.divergent)
    json(f.stateFile, { ...f.state, main: f.divergent })
  }
  if (fault === 'raw-incomplete') json(path.join(f.raw, 'summary.json'), { ...f.summary, coveredSourceCases: 3251 })
  if (fault === 'prepush-stale') {
    const file = path.join(f.root, 'output/verification/prepush.json')
    const pre = JSON.parse(fs.readFileSync(file, 'utf8'))
    json(file, { ...pre, fingerprint: 'changed-current-record' })
  }
  if (fault === 'source-drift') fs.appendFileSync(path.join(f.root, 'server/__tests__/native.test.ts'), 'drift')
  await expect(publishExisting({ root: f.root, workspace: f.workspace, request: f.request })).rejects.toThrow()
  expect(f.calls().filter(call => call.mutation)).toEqual([])
})

it.each(['raw-after-push', 'main-after-push', 'prepush-after-patch', 'main-after-patch'])('rechecks source and main before later writes when %s changes', async fault => {
  const afterPush = fault === 'raw-after-push' ? 'invalidate-raw' : fault === 'main-after-push' ? 'advance-main' : undefined
  const afterPatch = fault === 'prepush-after-patch' ? 'invalidate-prepush' : fault === 'main-after-patch' ? 'advance-main' : undefined
  const f = await fixture({ afterPush, afterPatch })
  await expect(publishExisting({ root: f.root, workspace: f.workspace, request: { ...f.request, review: 'code' } })).rejects.toThrow()
  expect(f.calls().filter(call => call.mutation).map(call => call.tool)).toEqual(afterPush ? ['git'] : ['git', 'gh'])
})

it.each(['complete', 'push', 'update-pr', 'request-review'])('a new claim after %s avoids duplicate remote operations', async interrupted => {
  const f = await fixture({ interrupted: interrupted === 'complete' ? undefined : interrupted })
  const publish = (assignment: string) => publishExisting({ root: f.root, workspace: f.workspace, request: { ...f.request, assignment, review: 'code' } })
  if (interrupted === 'complete') await publish(f.request.assignment)
  else await expect(publish(f.request.assignment)).rejects.toThrow()
  const next = await f.claim('restart')
  const result = await publish(next)
  expect(result.results[0]).toMatchObject({ operation: 'push', state: 'already-current' })
  if (interrupted !== 'push') expect(result.results[1]).toMatchObject({ operation: 'update-pr', state: 'already-current' })
  if (interrupted === 'complete' || interrupted === 'request-review') expect(result.results[2]).toMatchObject({ operation: 'request-review', state: 'already-requested' })
  const writes = f.calls().filter(call => call.mutation)
  expect(writes.filter(call => call.tool === 'git')).toHaveLength(1)
  expect(writes.filter(call => call.tool === 'gh' && call.argv.includes('PATCH'))).toHaveLength(1)
  expect(writes.filter(call => call.tool === 'gh' && call.argv.includes('POST'))).toHaveLength(1)
})

function frozenReceipt(f: Awaited<ReturnType<typeof fixture>>) {
  const assembly = JSON.parse(fs.readFileSync(path.join(f.raw, 'assembly.json'), 'utf8'))
  return { version: 1, head: f.head, tree: f.tree, batch: 'M01', targets: ['server/__tests__/native.test.ts'], status: 'passed', steps: [
    { name: 'frozen-native', status: 'passed', result: { tests: 1, passed: 1, targets: 1, sourceResponsibilitiesActualPassed: 1 } },
    { name: 'frozen-strict', status: 'passed', result: { roots: 1, actualFiles: 1, diagnostics: 0, missingRoots: [] } },
    { name: 'frozen-check-native', status: 'passed', result: { nativeFiles: ['server/__tests__/native.test.ts'], typesExit: 0, fileInventoryExit: 0, missingTypeRoots: [] } },
    { name: 'raw-prepare', status: 'passed', result: { raw: f.raw, candidateCommit: f.head, candidateFingerprint: assembly.candidateFingerprint } },
    { name: 'raw-verify', status: 'passed', result: { summary: f.summary, sourceResponsibilitiesActualPassed: 1 } },
    { name: 'prepush', status: 'passed', result: { head: f.head, status: 'passed', fingerprint: 'fixture-host-fingerprint' } },
    { name: 'local-proof', status: 'passed', result: { head: f.head, tree: f.tree, raw: f.raw, prepush: f.prepush, rawCandidateFingerprint: assembly.candidateFingerprint, remoteChecked: false } },
  ] }
}

function legacyConfiguration(f: Awaited<ReturnType<typeof fixture>>, frozen = false) {
  const normal = path.join(f.directory, 'normal', frozen ? 'final.json' : 'normal.json')
  json(normal, frozen ? frozenReceipt(f) : { status: 'passed', tree: f.tree, sourceResponsibilitiesActualPassed: 1, focus: { numPassedTests: 1 }, targets: ['server/__tests__/native.test.ts'], strict: { actualFiles: 1 } })
  json(path.join(path.dirname(normal), 'strict-inputs.json'), [{ file: path.join(f.root, 'server/__tests__/native.test.ts') }])
  const reviewReport = path.join(f.directory, 'review.md')
  const prepushLog = path.join(f.directory, 'prepush.log')
  const bodyTemplate = path.join(f.directory, 'template.md')
  fs.writeFileSync(reviewReport, 'Independent fixture review')
  fs.writeFileSync(prepushLog, 'Test Files 1 passed (1)\nTests 1 passed (1)\n')
  fs.writeFileSync(bodyTemplate, 'Head $HEAD\nNative $NORMAL_TESTS\nRAW $RAW_TESTS\n')
  const config = path.join(f.directory, 'legacy.json')
  json(config, { ...f.request, assignment: undefined, validatedHead: f.head, normal, sourceCases: 1, reviewReports: [reviewReport], prepushLog, bodyTemplate })
  return { config, normal }
}

it.each(['historical normal', 'new frozen run'])('accepts %s receipts through the same guarded existing-PR path', async format => {
  const f = await fixture()
  const { config } = legacyConfiguration(f, format === 'new frozen run')
  const result = await publishExisting({ root: f.root, workspace: f.workspace, request: { config, assignment: f.request.assignment } })
  expect(result.results.map(item => item.state)).toEqual(['published', 'updated', 'requested'])
  const writes = f.calls().filter(call => call.mutation)
  expect(writes[1].payload).toEqual({ body: `Head ${f.head}\nNative 1\nRAW 1\n` })
  expect(writes[2].payload?.body).toContain(`oa-audit-review-request:security:${f.head}`)
})

it.each(['missing-stage', 'failed-stage', 'duplicate-stage', 'wrong-head', 'wrong-tree', 'missing-native-count', 'missing-strict-roots', 'strict-diagnostics'])('rejects new frozen receipts with %s before any write', async fault => {
  const f = await fixture()
  const { config, normal } = legacyConfiguration(f, true)
  const receipt = JSON.parse(fs.readFileSync(normal, 'utf8'))
  if (fault === 'missing-stage') receipt.steps.splice(4, 1)
  if (fault === 'failed-stage') receipt.steps[4].status = 'failed'
  if (fault === 'duplicate-stage') receipt.steps[4] = receipt.steps[3]
  if (fault === 'wrong-head') receipt.head = f.base
  if (fault === 'wrong-tree') receipt.tree = 'a'.repeat(40)
  if (fault === 'missing-native-count') delete receipt.steps[0].result.tests
  if (fault === 'missing-strict-roots') delete receipt.steps[1].result.roots
  if (fault === 'strict-diagnostics') receipt.steps[1].result.diagnostics = 1
  json(normal, receipt)
  await expect(publishExisting({ root: f.root, workspace: f.workspace, request: { config, assignment: f.request.assignment } })).rejects.toThrow(/normal|native|frozen|strict|stage/i)
  expect(f.calls().filter(call => call.mutation)).toEqual([])
})
