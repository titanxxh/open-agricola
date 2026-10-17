import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import { execFileSync, spawnSync } from 'node:child_process'

const stages = new Set(['frozen-native', 'frozen-strict', 'frozen-check-native', 'raw-prepare', 'raw-verify', 'prepush', 'local-proof'])
const remoteOperations = new Set(['delivery:merge', 'publication:push', 'publication:update-pr', 'publication:request-review'])
const sha = /^[a-f0-9]{40}$/
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/
const fail = message => { throw new Error(message) }
const stable = value => JSON.stringify(value)

function processIdentity(pid = process.pid) {
  let processStart = null, bootId = null
  try { processStart = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[19] } catch { /* Other platforms retain unknown process identity. */ }
  try { bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() } catch { /* Other platforms retain unknown boot identity. */ }
  return { pid, host: os.hostname(), bootId, processStart }
}

export function readJson(file) {
  if (fs.lstatSync(file).isSymbolicLink()) fail('workflow JSON must not be a symlink')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function parentDirectory(file) {
  const parent = path.dirname(file)
  fs.mkdirSync(parent, { recursive: true })
  if (fs.realpathSync(parent) !== path.resolve(parent)) fail('workflow output parent traverses a symlink')
}

export function atomicJson(file, value) {
  parentDirectory(file)
  const temporary = `${file}.${crypto.randomUUID()}.tmp`
  const descriptor = fs.openSync(temporary, 'wx', 0o600)
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
  fs.renameSync(temporary, file)
  const directory = fs.openSync(path.dirname(file), 'r')
  try { fs.fsyncSync(directory) } finally { fs.closeSync(directory) }
}

function immutableJson(file, value) {
  parentDirectory(file)
  const descriptor = fs.openSync(file, 'wx', 0o600)
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor) } finally { fs.closeSync(descriptor) }
}

export function workflowDirectory(root, workspace) {
  if (typeof workspace !== 'string' || !path.isAbsolute(workspace)) fail('workflow workspace must be an absolute directory outside Git')
  const resolved = path.resolve(workspace)
  let ancestor = resolved
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const actual = path.join(fs.realpathSync(ancestor), path.relative(ancestor, resolved))
  const repo = fs.realpathSync(root)
  const common = fs.realpathSync(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim())
  const repository = path.basename(common) === '.git' ? path.dirname(common) : common
  const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain', '-z'], { cwd: repo, encoding: 'utf8' }).split('\0')
    .filter(line => line.startsWith('worktree ')).map(line => fs.realpathSync(line.slice(9)))
  if ([repo, repository, common, ...worktrees].some(directory => actual === directory || actual.startsWith(`${directory}${path.sep}`))) fail('workflow workspace must be outside every checkout and the common repository')
  if (actual !== resolved) fail('workflow workspace must not traverse symlinks')
  if (!fs.statSync(ancestor).isDirectory() || spawnSync('git', ['rev-parse', '--git-dir'], { cwd: ancestor, stdio: 'ignore' }).status === 0) fail('workflow workspace must be outside Git repositories')
  return resolved
}

export async function withControlLock(workspace, callback) {
  fs.mkdirSync(workspace, { recursive: true })
  const file = path.join(workspace, '.control.lock')
  let descriptor
  const deadline = Date.now() + 200000
  let incompleteOwnerSince = null
  while (descriptor === undefined) {
    try { descriptor = fs.openSync(file, 'wx', 0o600) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      let owner
      try { owner = readJson(file) } catch {
        incompleteOwnerSince ??= Date.now()
        if (Date.now() - incompleteOwnerSince > 1000) fail('workflow lock ownership is unknown; reconcile without deleting the lock')
        await new Promise(resolve => setTimeout(resolve, 20))
        continue
      }
      if (owner.host !== os.hostname() || !Number.isSafeInteger(owner.pid)) fail('workflow lock owner is unknown; do not recover from elapsed time')
      const actual = processIdentity(owner.pid)
      if (!actual.processStart || owner.processStart !== actual.processStart || owner.bootId !== actual.bootId) fail('workflow lock process identity is not confirmed; explicit recovery is required')
      try { process.kill(owner.pid, 0) } catch { fail('workflow lock owner is not confirmed live; explicit recovery is required') }
      if (Date.now() >= deadline) fail('workflow control lock wait exceeded bound; lock was not removed')
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }
  try {
    fs.writeFileSync(descriptor, stable({ ...processIdentity(), acquiredAt: new Date().toISOString() }))
    fs.fsyncSync(descriptor)
    return await callback()
  } finally { fs.closeSync(descriptor); fs.unlinkSync(file) }
}

function target(value) {
  if (value?.kind === 'tooling' && sha.test(value.head)) return { kind: 'tooling', head: value.head }
  if (value?.kind !== undefined) fail('unknown workflow target kind')
  if (!value || !Number.isSafeInteger(value.issue) || value.issue < 1 || !Number.isSafeInteger(value.pr) || value.pr < 1 || !sha.test(value.head)) fail('target requires positive issue/pr and an exact 40-character head')
  return { issue: value.issue, pr: value.pr, head: value.head }
}

function operationAllowed(operation) {
  return remoteOperations.has(operation) || (operation.startsWith('local-validation:') && stages.has(operation.slice(17)))
}

export function readControl(workspace) {
  const file = path.join(workspace, 'control.json')
  if (!fs.existsSync(file)) return { version: 1, epoch: 0, mode: 'paused', authority: 'No control authority recorded', finishOnly: [], waivers: [] }
  const value = readJson(file)
  if (value.version !== 1 || !Number.isSafeInteger(value.epoch) || value.epoch < 1 || !['paused', 'active'].includes(value.mode) || !Array.isArray(value.finishOnly) || !Array.isArray(value.waivers) || typeof value.authority !== 'string' || !value.authority.trim()) fail('invalid workflow control authority')
  value.finishOnly.forEach(target)
  for (const waiver of value.waivers) {
    target(waiver)
    if (!identifier.test(waiver.id) || typeof waiver.authority !== 'string' || !waiver.authority.trim() || !Array.isArray(waiver.gates) || waiver.gates.length !== 1 || waiver.gates[0] !== 'remoteCi') fail('only an explicit exact-target remoteCi policy is supported')
  }
  return value
}

function admitted(control, assignment, operation) {
  if (assignment.epoch !== control.epoch) fail('stale assignment epoch; acquire a new claim after control changes')
  if (!assignment.operations.includes(operation) || !operationAllowed(operation)) fail(`operation is not granted: ${operation}`)
  if (assignment.kind === 'tooling' && remoteOperations.has(operation)) fail('tooling assignments cannot perform remote mutations')
  if (control.mode === 'paused' && !control.finishOnly.some(scope => stable(target(scope)) === stable(target(assignment)))) fail('workflow is paused; target has no explicit finish-only scope')
}

export async function applyControl({ root, workspace, request }) {
  if (root) workspace = workflowDirectory(root, workspace)
  if (!request || typeof request.authority !== 'string' || !request.authority.trim()) fail('control request requires an explicit authority reference')
  return withControlLock(workspace, () => {
    const previous = readControl(workspace)
    if (request.kind === 'pause' || request.kind === 'resume') {
      const finishOnly = (request.finishOnly ?? []).map(target)
      if (request.kind === 'resume' && finishOnly.length) fail('resume cannot contain a finish-only exception')
      const next = { version: 1, epoch: previous.epoch + 1, mode: request.kind === 'pause' ? 'paused' : 'active', authority: request.authority, finishOnly, waivers: previous.waivers, changedAt: new Date().toISOString() }
      atomicJson(path.join(workspace, 'control.json'), next)
      return next
    }
    if (request.kind === 'grant') {
      const input = request.assignment
      const scope = target(input)
      if (!identifier.test(input.id) || !identifier.test(input.worker) || !Array.isArray(input.operations) || !input.operations.length || new Set(input.operations).size !== input.operations.length || input.operations.some(operation => typeof operation !== 'string' || !operationAllowed(operation))) fail('invalid assignment id, worker or fixed operations')
      const claim = { version: 1, id: input.id, worker: input.worker, epoch: previous.epoch, ...scope, operations: input.operations, authority: request.authority }
      for (const operation of claim.operations) admitted(previous, claim, operation)
      const file = path.join(workspace, 'claims', `${claim.id}.json`)
      immutableJson(file, claim)
      return { claim, file }
    }
    if (request.kind === 'remote-ci-policy') {
      const scope = target({ issue: request.issue, pr: request.pr, head: request.head })
      if (!identifier.test(request.id)) fail('remote CI policy requires an id')
      const waiver = { id: request.id, ...scope, gates: ['remoteCi'], authority: request.authority }
      const next = { ...previous, epoch: previous.epoch + 1, waivers: [...previous.waivers, waiver] }
      atomicJson(path.join(workspace, 'control.json'), next)
      return next
    }
    fail(`unsupported control request: ${request.kind}`)
  })
}

function loadClaim(workspace, assignment) {
  const supplied = typeof assignment === 'string' ? readJson(assignment) : assignment
  if (!supplied || supplied.version !== 1 || !identifier.test(supplied.id) || !identifier.test(supplied.worker) || !Array.isArray(supplied.operations)) fail('assignment must be an immutable coordinator claim')
  target(supplied)
  const recorded = readJson(path.join(workspace, 'claims', `${supplied.id}.json`))
  if (stable(recorded) !== stable(supplied)) fail('assignment differs from the recorded immutable claim')
  return recorded
}

export async function withOwnedOperation({ root, workspace, assignment, operation }, callback) {
  workspace = workflowDirectory(root, workspace)
  if (typeof operation !== 'string' || !operationAllowed(operation)) fail(`unsupported fixed operation: ${operation}`)
  const claim = loadClaim(workspace, assignment)
  const receipt = path.join(workspace, 'results', claim.worker, claim.id, `${operation.replaceAll(':', '-')}.json`)
  const register = () => immutableJson(`${receipt}.started`, { claim: claim.id, epoch: claim.epoch, operation, ...processIdentity(), admittedAt: new Date().toISOString() })
  const execute = async () => {
    admitted(readControl(workspace), claim, operation)
    if (fs.existsSync(receipt)) fail('operation already has an immutable result; use a new claim')
    try {
      const result = await callback(claim)
      admitted(readControl(workspace), claim, operation)
      immutableJson(receipt, { version: 1, claim: claim.id, epoch: claim.epoch, operation, status: 'passed', result: result ?? null })
      return result
    } catch (error) {
      if (!fs.existsSync(receipt)) immutableJson(receipt, { version: 1, claim: claim.id, epoch: claim.epoch, operation, status: 'unknown', error: error.message })
      throw error
    }
  }
  if (remoteOperations.has(operation)) return withControlLock(workspace, () => {
    admitted(readControl(workspace), claim, operation)
    register()
    return execute()
  })
  // Admission is serialized; local work does not block a later pause.
  await withControlLock(workspace, () => {
    admitted(readControl(workspace), claim, operation)
    register()
  })
  return execute()
}
