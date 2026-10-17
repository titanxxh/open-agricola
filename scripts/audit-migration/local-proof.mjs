import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readJson } from './control.mjs'
import { assertCommittedSource } from './committed-source.mjs'

const fail = message => { throw new Error(message) }
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const command = (cwd, file, args) => execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 })
const git = (cwd, ...args) => command(cwd, 'git', args).trim()

/** Current-host prepush plus immutable RAW and live source bytes; never a review grant. */
export function localProof(request) {
  const { head, worktree, raw, prepush } = request
  if (!/^[a-f0-9]{40}$/.test(head) || ![worktree, raw, prepush].every(file => typeof file === 'string' && path.isAbsolute(file))) fail('local proof requires exact head and absolute worktree/raw/prepush paths')
  const { tree } = assertCommittedSource({ worktree, head })
  const pre = readJson(prepush)
  if (pre.mode !== 'prepush' || pre.status !== 'passed' || JSON.stringify(pre.steps?.map(step => step.name)) !== JSON.stringify(['test-services', 'fast', 'lint']) || pre.steps.some(step => step.status !== 'passed' || step.exitCode !== 0)) fail('prepush is not passed')
  if (git(worktree, 'rev-parse', `${pre.head}^{tree}`) !== tree) fail('prepush source tree differs')
  if (JSON.stringify(readJson(path.join(worktree, 'output/verification/prepush.json'))) !== JSON.stringify(pre)) fail('current prepush differs from saved record')
  if (!command(worktree, 'pnpm', ['verify', 'status']).includes('[verify] prepush: current / passed')) fail('prepush fingerprint is stale')
  const summary = readJson(path.join(raw, 'summary.json'))
  const assembly = readJson(path.join(raw, 'assembly.json'))
  const zeros = ['typesExit', 'fileInventoryExit', 'behaviorExit', 'failed', 'pending', 'todo', 'unresolvedSourceCases']
  if (summary.rawMode !== 'strict-expected' || zeros.some(key => summary[key] !== 0) || !Array.isArray(summary.missingTypeRoots) || summary.missingTypeRoots.length || !(summary.includedTypeRoots > 0) || summary.coveredSourceCases !== 3252 || summary.tests !== summary.passed || !(summary.passed > 0)) fail('RAW coverage or strict proof is incomplete')
  if (git(worktree, 'rev-parse', `${assembly.candidateCommit}^{tree}`) !== tree) fail('RAW source tree differs')
  const paths = command(worktree, 'git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(file => file && fs.existsSync(path.join(worktree, file)) && fs.statSync(path.join(worktree, file)).isFile()).sort()
  const files = paths.map(file => [file, hash(fs.readFileSync(path.join(worktree, file)))])
  const fingerprint = hash(JSON.stringify(files))
  if (JSON.stringify(files) !== JSON.stringify(assembly.candidateFiles) || fingerprint !== assembly.candidateFingerprint) fail('RAW candidate bytes or inventory differ')
  return { head, tree, sourceFingerprint: pre.fingerprint, rawCandidateFingerprint: fingerprint, rawCandidateFiles: files.length }
}
