import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyControl, readControl, withOwnedOperation, workflowDirectory } from '../audit-migration/control.mjs'
import { adoptLegacy } from '../audit-migration/legacy.mjs'
import { deriveReview, inspectCi, inspectMergeProtection, inspectReviews } from '../audit-migration/review.mjs'

const directories: string[] = []
afterEach(() => { vi.unstubAllEnvs(); directories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })) })
const head = 'a'.repeat(40)
const scope = { issue: 1222, pr: 1272, head }
const local = 'local-validation:prepush'

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-workflow-'))
  directories.push(directory)
  const root = path.join(directory, 'repo')
  const workspace = path.join(directory, 'run')
  fs.mkdirSync(root)
  execFileSync('git', ['init', '--quiet', root])
  return { directory, root, workspace }
}

async function claim(workspace: string, id: string, operations = [local]) {
  const result = await applyControl({ workspace, request: { kind: 'grant', authority: 'test instruction', assignment: { ...scope, id, worker: 'worker-a', operations } } })
  if (!('claim' in result)) throw new Error('expected a claim')
  return result.claim
}

describe('persisted workflow admission', () => {
  it('rejects state inside an external linked worktree without writing a control file', async () => {
    const { directory, root } = fixture()
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '--allow-empty', '-m', 'fixture'], { cwd: root })
    const linked = path.join(directory, 'external-linked')
    execFileSync('git', ['worktree', 'add', '--quiet', '--detach', linked], { cwd: root })
    const workspace = path.join(linked, 'workflow-state')
    expect(() => workflowDirectory(root, workspace)).toThrow(/outside/)
    await expect(applyControl({ root, workspace, request: { kind: 'pause', authority: 'fixture scope' } })).rejects.toThrow(/outside/)
    expect(fs.existsSync(workspace)).toBe(false)
  })

  it('rejects state inside an unrelated Git checkout or bare repository', () => {
    const { directory, root } = fixture()
    for (const bare of [false, true]) {
      const other = path.join(directory, bare ? 'other-bare' : 'other-checkout')
      execFileSync('git', ['init', '--quiet', ...(bare ? ['--bare'] : []), other])
      expect(() => workflowDirectory(root, path.join(other, 'workflow-state'))).toThrow(/outside/)
      expect(fs.existsSync(path.join(other, 'workflow-state'))).toBe(false)
    }
  })

  it('denies absent authority and unrelated targets, then rejects claims after a pause epoch change', async () => {
    const { root, workspace } = fixture()
    expect(readControl(workspace).mode).toBe('paused')
    await expect(claim(workspace, 'absent')).rejects.toThrow('paused')
    await applyControl({ workspace, request: { kind: 'pause', authority: 'finish exact target only', finishOnly: [scope] } })
    const assignment = await claim(workspace, 'first')
    let called = false
    await applyControl({ workspace, request: { kind: 'pause', authority: 'pause again', finishOnly: [scope] } })
    await expect(withOwnedOperation({ root, workspace, assignment, operation: local }, () => { called = true })).rejects.toThrow('stale')
    expect(called).toBe(false)
    await expect(applyControl({ workspace, request: { kind: 'grant', authority: 'unrelated', assignment: { ...scope, pr: 1273, id: 'other', worker: 'worker-b', operations: [local] } } })).rejects.toThrow('paused')
  })

  it('pauses during admitted local work and blocks its completion and the next stage', async () => {
    const { root, workspace } = fixture()
    await applyControl({ workspace, request: { kind: 'pause', authority: 'scope', finishOnly: [scope] } })
    const assignment = await claim(workspace, 'local', [local, 'local-validation:raw-verify'])
    await expect(withOwnedOperation({ root, workspace, assignment, operation: local }, async () => {
      await applyControl({ workspace, request: { kind: 'pause', authority: 'stop all' } })
      return 'already admitted local stage finished'
    })).rejects.toThrow('stale')
    await expect(withOwnedOperation({ root, workspace, assignment, operation: 'local-validation:raw-verify' }, () => 'bad')).rejects.toThrow('stale')
    const result = JSON.parse(fs.readFileSync(path.join(workspace, 'results/worker-a/local/local-validation-prepush.json'), 'utf8'))
    expect(result.status).toBe('unknown')
  })

  it('holds remote admission until the bounded mutation and immutable result finish', async () => {
    const { root, workspace } = fixture()
    await applyControl({ workspace, request: { kind: 'pause', authority: 'scope', finishOnly: [scope] } })
    const assignment = await claim(workspace, 'remote', ['delivery:merge'])
    let pause: ReturnType<typeof applyControl> | undefined
    const result = await withOwnedOperation({ root, workspace, assignment, operation: 'delivery:merge' }, async () => {
      pause = applyControl({ workspace, request: { kind: 'pause', authority: 'stop after admitted write' } })
      await new Promise(resolve => setTimeout(resolve, 30))
      expect(readControl(workspace).epoch).toBe(assignment.epoch)
      return 'one admitted write'
    })
    await pause
    expect(result).toBe('one admitted write')
    expect(readControl(workspace).epoch).toBe(assignment.epoch + 1)
  })

  it('admits a separately authorized tooling scope and prevents tooling remote grants', async () => {
    const { root, workspace } = fixture()
    const tooling = { kind: 'tooling' as const, head }
    await applyControl({ workspace, request: { kind: 'pause', authority: 'tool implementation only', finishOnly: [tooling] } })
    const granted = await applyControl({ workspace, request: { kind: 'grant', authority: 'validate tooling', assignment: { ...tooling, id: 'tools', worker: 'tools', operations: [local] } } })
    if (!('claim' in granted)) throw new Error('claim absent')
    expect(await withOwnedOperation({ root, workspace, assignment: granted.claim, operation: local }, () => 7)).toBe(7)
    await expect(applyControl({ workspace, request: { kind: 'grant', authority: 'invalid', assignment: { ...tooling, id: 'bad', worker: 'tools', operations: ['delivery:merge'] } } })).rejects.toThrow('tooling')
    expect(() => workflowDirectory(root, path.join(root, 'output/run'))).toThrow('outside')
  })

  it('rejects copied or edited claims and a duplicate fixed stage', async () => {
    const { root, workspace } = fixture()
    await applyControl({ workspace, request: { kind: 'pause', authority: 'scope', finishOnly: [scope] } })
    const assignment = await claim(workspace, 'immutable')
    await expect(withOwnedOperation({ root, workspace, assignment: { ...assignment, worker: 'forged' }, operation: local }, () => 1)).rejects.toThrow('differs')
    expect(await withOwnedOperation({ root, workspace, assignment, operation: local }, () => 1)).toBe(1)
    await expect(withOwnedOperation({ root, workspace, assignment, operation: local }, () => 2)).rejects.toThrow()
  })

  it('records an explicit remote-CI policy for one exact target and invalidates old claims', async () => {
    const { root, workspace } = fixture()
    await applyControl({ workspace, request: { kind: 'pause', authority: 'scope', finishOnly: [scope] } })
    const assignment = await claim(workspace, 'before-policy')
    const updated = await applyControl({ workspace, request: { kind: 'remote-ci-policy', authority: 'explicit local-CI-only instruction', id: 'local-ci-policy', ...scope } })
    expect(updated).toMatchObject({ mode: 'paused', epoch: assignment.epoch + 1, waivers: [{ id: 'local-ci-policy', ...scope, gates: ['remoteCi'], authority: 'explicit local-CI-only instruction' }] })
    await expect(withOwnedOperation({ root, workspace, assignment, operation: local }, () => 'bad')).rejects.toThrow('stale')
    const fresh = await claim(workspace, 'after-policy')
    expect(await withOwnedOperation({ root, workspace, assignment: fresh, operation: local }, () => 'fresh local proof')).toBe('fresh local proof')
  })
})

describe('trusted CI workflow identities', () => {
  it.each(['failed-legitimate', 'missing-legitimate', 'trusted-renamed', 'missing-default-workflow'])('checks default-branch path and workflow id for %s', fault => {
    const { directory, root } = fixture()
    const bin = path.join(directory, 'bin')
    fs.mkdirSync(bin)
    const log = path.join(directory, 'ci-calls.jsonl')
    const trusted = { id: 10, workflow_id: 11, name: fault === 'trusted-renamed' ? 'Display name changed' : 'CI', path: '.github/workflows/ci.yml', repository: { full_name: 'titanxxh/open-agricola' }, head_sha: head, event: 'pull_request', status: 'completed', conclusion: fault === 'failed-legitimate' ? 'failure' : 'success', html_url: 'https://example.invalid/trusted-run' }
    const spoof = { ...trusted, id: 100, workflow_id: 99, name: 'CI', path: '.github/workflows/imposter.yml', conclusion: 'success', html_url: 'https://example.invalid/spoof-run' }
    const runs = fault === 'missing-legitimate' ? [spoof] : [trusted, ...(fault === 'trusted-renamed' ? [] : [spoof])]
    fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2),e=a[1];fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');let r;
if(e==='repos/titanxxh/open-agricola')r={full_name:'titanxxh/open-agricola',default_branch:'main'};
else if(e.includes('/contents/.github/workflows/ci.yml?ref=main'))r=${fault === 'missing-default-workflow' ? "{message:'Not Found'}" : "{type:'file',path:'.github/workflows/ci.yml',sha:'cccccccccccccccccccccccccccccccccccccccc'}"};
else if(e.endsWith('/actions/workflows/ci.yml'))r={id:11,path:'.github/workflows/ci.yml',state:'active'};
else if(e.includes('/actions/runs?'))r={workflow_runs:${JSON.stringify(runs)}};
else process.exit(91);process.stdout.write(JSON.stringify(r));
`, { mode: 0o755 })
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`)
    expect(inspectCi({ root, head, event: 'pull_request', names: ['CI'] })).toMatchObject({ state: fault === 'failed-legitimate' ? 'fail' : fault === 'trusted-renamed' ? 'pass' : 'unknown' })
    expect(fs.readFileSync(log, 'utf8')).not.toMatch(/"-X"|"POST"|"PATCH"/)
  })
})

describe('server-enforced base protection', () => {
  it.each(['classic', 'ruleset', 'queue', 'unknown-queue', 'bypass', 'missing-bypass', 'no-required-checks', 'loose', 'classic-admin-bypass', 'classic-review-bypass', 'classic-api-error', 'rules-api-error', 'missing-classic-fields', 'queue-rule'])('projects %s protection without modifying repository settings', fault => {
    const { directory, root } = fixture()
    const bin = path.join(directory, 'bin')
    fs.mkdirSync(bin)
    const log = path.join(directory, 'protection-calls.jsonl')
    const classic = { required_status_checks: { strict: true, checks: [{ context: 'verify', app_id: 15368 }] }, enforce_admins: { enabled: fault !== 'classic-admin-bypass' }, required_pull_request_reviews: { bypass_pull_request_allowances: { users: fault === 'classic-review-bypass' ? [{ login: 'owner' }] : [], teams: [], apps: [] } } }
    const parameters = { strict_required_status_checks_policy: fault !== 'loose', required_status_checks: fault === 'no-required-checks' ? [] : [{ context: 'verify', integration_id: 15368 }] }
    const rule = { type: fault === 'queue-rule' ? 'merge_queue' : 'required_status_checks', ruleset_id: 7, parameters }
    const details = { id: 7, enforcement: 'active', target: 'branch', bypass_actors: fault === 'missing-bypass' ? undefined : fault === 'bypass' ? [{ actor_type: 'RepositoryRole', actor_id: 5, bypass_mode: 'always' }] : [], rules: [rule] }
    const hasClassic = ['classic', 'classic-admin-bypass', 'classic-review-bypass', 'missing-classic-fields', 'classic-api-error'].includes(fault)
    fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs=require('node:fs'),a=process.argv.slice(2),e=a[1];fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(a)+'\\n');let r;
if(e==='graphql')r={data:{repository:{nameWithOwner:'titanxxh/open-agricola',${fault === 'unknown-queue' ? '' : `mergeQueue:${fault === 'queue' ? "{id:'queue'}" : 'null'}`}}}};
else if(e.includes('/rules/branches/main')){${fault === 'rules-api-error' ? 'process.exit(92);' : ''}r=${JSON.stringify(hasClassic ? [] : [rule])};}
else if(e.includes('/rulesets/7?'))r=${JSON.stringify(details)};
else if(e.endsWith('/branches/main/protection')){${fault === 'classic-api-error' ? "process.stderr.write('gh: Server error (HTTP 500)');process.exit(1);" : hasClassic ? `r=${JSON.stringify(fault === 'missing-classic-fields' ? {} : classic)};` : "process.stderr.write('gh: Branch not protected (HTTP 404)');process.exit(1);"}}
else process.exit(91);process.stdout.write(JSON.stringify(r));
`, { mode: 0o755 })
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`)
    const unknown = ['unknown-queue', 'missing-bypass', 'classic-api-error', 'rules-api-error', 'missing-classic-fields'].includes(fault)
    expect(inspectMergeProtection({ root })).toMatchObject({ state: ['classic', 'ruleset'].includes(fault) ? 'pass' : unknown ? 'unknown' : 'fail' })
    expect(fs.readFileSync(log, 'utf8')).not.toMatch(/"-X"|"POST"|"PATCH"|"PUT"|"DELETE"/)
  })
})

describe('independent exact-head review facts', () => {
  function observations(findings = false) {
    const machine = { commit_sha: head, status: 'completed', has_any_findings: findings, has_unresolved_findings: findings }
    const body = `<!-- codex-pull-request-review-summary -->\n**Code Review** Completed \`${head}\` <time datetime="2026-10-17T01:00:00Z">done</time>\n**Security Review** Completed \`${head}\` <time datetime="2026-10-17T01:01:00Z">done</time>\nNo major issues.\n<!-- codex-review-state:v1 ${JSON.stringify({ code_review: machine, security_review: machine })} -->\n<!-- codex-security-review:v1 ${JSON.stringify({ headSha: head, status: 'completed' })} -->`
    return { pr: { number: 1272, head: { sha: head, repo: { full_name: 'titanxxh/open-agricola' } }, state: 'open', draft: false, base: { ref: 'main', repo: { full_name: 'titanxxh/open-agricola' } } }, expectedHead: head, comments: [{ id: 1, user: { login: 'chatgpt-codex-connector[bot]' }, body, updated_at: '2026-10-17T01:01:00Z', html_url: 'https://example.invalid/summary' }], reactions: [{ id: 2, user: { login: 'chatgpt-codex-connector[bot]' }, content: '+1', created_at: '2026-10-17T01:02:00Z' }], threads: [{ id: 'thread', isResolved: true }] }
  }

  it('preserves prose/machine conflict even when threads and a physical thumb pass', () => {
    expect(deriveReview(observations(true))).toMatchObject({ codeReview: { state: 'conflict' }, securityReview: { state: 'conflict' }, threads: { state: 'pass' }, physicalThumb: { state: 'pass' } })
  })

  it('does not infer a physical thumb from a clean summary or all resolved threads', () => {
    expect(deriveReview({ ...observations(), reactions: [] })).toMatchObject({ codeReview: { state: 'pass' }, securityReview: { state: 'pass' }, physicalThumb: { state: 'fail' } })
    expect(deriveReview({ ...observations(), expectedHead: 'b'.repeat(40) }).identity.state).toBe('fail')
  })

  it('reads later comment/reaction/thread pages and nested thread comment pages', () => {
    const { directory, root } = fixture()
    const bin = path.join(directory, 'bin')
    fs.mkdirSync(bin)
    const log = path.join(directory, 'requests.jsonl')
    const observed = observations(true)
    fs.writeFileSync(path.join(bin, 'gh'), `#!/usr/bin/env node
const fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');const endpoint=args[1];let response;
if(endpoint.endsWith('/pulls/1272'))response=${JSON.stringify(observed.pr)};
else if(endpoint.includes('/comments?'))response=endpoint.includes('page=2')?${JSON.stringify(observed.comments)}:Array.from({length:100},(_,id)=>({id,user:{login:'other'},body:'old',updated_at:'2020-01-01'}));
else if(endpoint.includes('/reactions?'))response=endpoint.includes('page=2')?${JSON.stringify(observed.reactions)}:Array.from({length:100},(_,id)=>({id,user:{login:'other'},content:'heart',created_at:'2020-01-01'}));
else if(endpoint==='graphql'){
 const query=args.find(x=>x.startsWith('query='));
 if(query.includes('node(id:'))response={data:{node:{comments:{nodes:[{databaseId:999}],pageInfo:{hasNextPage:false,endCursor:null}}}}};
 else if(args.includes('cursor=threads-next'))response={data:{repository:{pullRequest:{reviewThreads:{nodes:[{id:'later-unresolved',isResolved:false,comments:{nodes:[],pageInfo:{hasNextPage:false,endCursor:null}}}],pageInfo:{hasNextPage:false,endCursor:null}}}}}};
 else response={data:{repository:{pullRequest:{reviewThreads:{nodes:[{id:'first-thread',isResolved:true,comments:{nodes:[],pageInfo:{hasNextPage:true,endCursor:'comments-next'}}}],pageInfo:{hasNextPage:true,endCursor:'threads-next'}}}}}};
}else process.exit(91);process.stdout.write(JSON.stringify(response));
`, { mode: 0o755 })
    vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH}`)
    expect(inspectReviews({ root, pr: 1272, head })).toMatchObject({ codeReview: { state: 'conflict' }, physicalThumb: { state: 'pass' }, threads: { state: 'fail' } })
    const calls = fs.readFileSync(log, 'utf8')
    expect(calls).toContain('page=2')
    expect(calls).toContain('cursor=comments-next')
    expect(calls).toContain('cursor=threads-next')
    expect(calls).not.toMatch(/"-X"|"merge"|"POST"|"PATCH"/)
  })
})

describe('legacy mutation retirement', () => {
  it('upgrades a trusted earlier delegate in place and preserves both inert backup generations', async () => {
    const { directory, root, workspace } = fixture()
    const legacy = path.join(directory, 'legacy')
    fs.mkdirSync(legacy)
    const names = ['watch-published-batch.py', 'deliver-pr.py', 'publish-validated-batch.py', 'review-status.py', 'run-frozen-batch-final.py', 'run-expanded-batch-proof.py', 'refresh-validated-prefix.py', 'finalize-current-issue-pause.py']
    for (const name of names) fs.writeFileSync(path.join(legacy, name), '# Original legacy fixture\n')
    await applyControl({ workspace, request: { kind: 'pause', authority: 'upgrade paused delegates' } })
    const installed = await adoptLegacy({ root, workspace, request: { directory: legacy } })
    const entry = installed.entries[0]
    if (!entry.backup) throw new Error('original backup missing')
    const current = fs.readFileSync(entry.file, 'utf8')
    const old = current.replace('# Open Agricola workflow delegate v1\n', '# Open Agricola workflow delegate v1\n# Trusted earlier template fixture\n')
    fs.writeFileSync(entry.file, old)
    const previous = { ...installed, entries: installed.entries.map(item => item.file === entry.file ? { ...item, delegateSha256: crypto.createHash('sha256').update(old).digest('hex') } : item) }
    fs.writeFileSync(path.join(workspace, 'legacy-adoption.json'), JSON.stringify(previous))
    const upgraded = await adoptLegacy({ root, workspace, request: { directory: legacy } })
    expect(fs.readFileSync(entry.file, 'utf8')).toBe(current)
    expect(fs.readFileSync(entry.backup, 'utf8')).toBe('# Original legacy fixture\n')
    const oldBackup = path.join(legacy, '.workflow-retired', `${names[0]}.${previous.entries[0].delegateSha256}.txt`)
    expect(fs.readFileSync(oldBackup, 'utf8')).toBe(old)
    expect(upgraded.entries[0]).toMatchObject({ originalSha256: entry.originalSha256, delegateSha256: entry.delegateSha256, backup: entry.backup, alreadyAdopted: false })
    const saved = JSON.parse(fs.readFileSync(path.join(workspace, 'legacy-adoption.json'), 'utf8'))
    expect(JSON.parse(fs.readFileSync(saved.previousReceipt, 'utf8'))).toEqual(previous)
    expect(saved.entries[0].backups).toEqual(expect.arrayContaining([entry.backup, oldBackup]))
    expect((await adoptLegacy({ root, workspace, request: { directory: legacy } })).entries.every(item => item.alreadyAdopted)).toBe(true)
  })

  it.each(['digest-mismatch', 'removed-marker', 'other-root', 'other-workspace', 'other-file'])('rejects delegate upgrades with %s before replacing any wrapper', async fault => {
    const { directory, root, workspace } = fixture()
    const legacy = path.join(directory, 'legacy')
    fs.mkdirSync(legacy)
    const names = ['watch-published-batch.py', 'deliver-pr.py', 'publish-validated-batch.py', 'review-status.py', 'run-frozen-batch-final.py', 'run-expanded-batch-proof.py', 'refresh-validated-prefix.py', 'finalize-current-issue-pause.py']
    for (const name of names) fs.writeFileSync(path.join(legacy, name), '# Original legacy fixture\n')
    await applyControl({ workspace, request: { kind: 'pause', authority: 'paused fixture' } })
    const installed = await adoptLegacy({ root, workspace, request: { directory: legacy } })
    const entry = installed.entries[0]
    const untouched = fs.readFileSync(installed.entries[1].file)
    const current = fs.readFileSync(entry.file, 'utf8')
    const old = fault === 'removed-marker' ? '# Manually replaced delegate\n' : `${current}\n# Older template fixture\n`
    fs.writeFileSync(entry.file, old)
    const prior = JSON.parse(fs.readFileSync(path.join(workspace, 'legacy-adoption.json'), 'utf8'))
    if (fault === 'other-root') prior.root = path.join(directory, 'other-root')
    if (fault === 'other-workspace') prior.workspace = path.join(directory, 'other-workspace')
    if (fault === 'other-file') prior.entries[0].file = path.join(directory, 'other-file.py')
    fs.writeFileSync(path.join(workspace, 'legacy-adoption.json'), JSON.stringify(prior))
    await expect(adoptLegacy({ root, workspace, request: { directory: legacy } })).rejects.toThrow(/receipt|digest|binding|location/i)
    expect(fs.readFileSync(entry.file, 'utf8')).toBe(old)
    expect(fs.readFileSync(installed.entries[1].file)).toEqual(untouched)
  })

  it('runs the original watcher/delivery/publish invocations against paused authority with zero gh or remote git calls', async () => {
    const { directory, root, workspace } = fixture()
    const legacy = path.join(directory, 'legacy')
    const bin = path.join(directory, 'bin')
    fs.mkdirSync(legacy); fs.mkdirSync(bin); fs.mkdirSync(path.join(root, 'scripts'))
    const implementation = fileURLToPath(new URL('../audit-migration/delivery.mjs', import.meta.url))
    const runner = fileURLToPath(new URL('../audit-migration/run.mjs', import.meta.url))
    fs.writeFileSync(path.join(root, 'scripts/audit-migration.mjs'), `import {workflowCommand} from ${JSON.stringify(implementation)}; import {runValidation} from ${JSON.stringify(runner)}; const [action,...args]=process.argv.slice(2);const options=new Map();for(let i=0;i<args.length;i+=2)options.set(args[i].slice(2),args[i+1]);try{if(action==='run')await runValidation(${JSON.stringify(root)},options);else await workflowCommand(${JSON.stringify(root)},action,options)}catch(e){process.stderr.write(e.message);process.exitCode=1}`)
    const names = ['watch-published-batch.py', 'deliver-pr.py', 'publish-validated-batch.py', 'review-status.py', 'run-frozen-batch-final.py', 'run-expanded-batch-proof.py', 'refresh-validated-prefix.py', 'finalize-current-issue-pause.py']
    for (const name of names) fs.writeFileSync(path.join(legacy, name), "import subprocess\nsubprocess.run(['gh', 'pr', 'merge', '1272', '--admin'])\n")
    const remoteLog = path.join(directory, 'remote.log')
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho gh >> '${remoteLog}'\nexit 99\n`, { mode: 0o755 })
    fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ncase "$1" in push|fetch) echo git >> '${remoteLog}'; exit 99;; esac\nexec '${realGit}' "$@"\n`, { mode: 0o755 })
    await applyControl({ workspace, request: { kind: 'pause', authority: 'pipeline paused' } })
    const adopted = await adoptLegacy({ root, workspace, request: { directory: legacy } })
    expect(adopted.entries).toHaveLength(8)
    for (const entry of adopted.entries) expect(fs.readFileSync(entry.file, 'utf8')).not.toContain("subprocess.run(['gh'")
    const publication = path.join(directory, 'publication.json')
    fs.writeFileSync(publication, JSON.stringify({ ...scope, worktree: root, raw: directory, prepush: path.join(directory, 'prepush.json'), noRemoteCiWait: true }))
    const output = path.join(directory, 'output')
    const invocations = [
      ['watch-published-batch.py', '--publication', publication, '--output', output],
      ['deliver-pr.py', '--pr', '1272', '--head', head, '--worktree', root, '--raw', directory, '--prepush', path.join(directory, 'prepush.json'), '--output', output, '--skip-remote-ci', '--watch', '--merge'],
      ['publish-validated-batch.py', '--config', publication],
      ['run-frozen-batch-final.py', '--config', publication],
      ['run-expanded-batch-proof.py', '--worktree', root, '--head', head, '--batch', 'M11', '--output', output, '--strict-config', publication],
      ['refresh-validated-prefix.py', '--worktree', root, '--head', head, '--batch', 'M11', '--output', output, '--raw', directory],
      ['finalize-current-issue-pause.py'],
    ]
    for (const [name, ...args] of invocations) {
      const child = spawnSync('python3', [path.join(legacy, name), ...args], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, OA_AUDIT_ASSIGNMENT: '', OA_AUDIT_CLOSURE_REQUEST: '' } })
      expect(child.status, child.stderr).toBe(name === 'finalize-current-issue-pause.py' ? 2 : 1)
    }
    expect(fs.existsSync(remoteLog)).toBe(false)
    expect(readControl(workspace).mode).toBe('paused')
    expect((await adoptLegacy({ root, workspace, request: { directory: legacy } })).entries.every(entry => entry.alreadyAdopted)).toBe(true)
  })
})
