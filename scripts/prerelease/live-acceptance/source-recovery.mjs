// Recovery has its own browser run and acceptance file. Evidence for the failed revision cannot reopen its predecessor.
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadAcceptanceConfig, privateDirectory, privateJson } from './context.mjs'
import { acceptanceRecord } from './evidence.mjs'
import { LIMITS, assertWithin, auditChain, hashFile, hostTools, openBinding, parseWindowConfig, processIo,
  sourceSmokeEvidence, storageCycle, writePrivateJson } from './window.mjs'

export async function recoverSourceUpdate({ configPath, windowPath, io = processIo() }) {
  const win = parseWindowConfig(privateJson(windowPath, 'Window config'))
  if (!win.install?.sourceProof) return 'not-applicable'
  const proof = privateJson(win.install.sourceProof, 'Source update proof')
  if (proof.scope !== 'routine') return 'not-applicable'
  const { from, to } = win.install
  if (proof.kind !== 'prerelease-source' || proof.from !== from || proof.sha !== to) throw new Error('Recovery proof belongs to a different source change')
  const statePath = join(privateDirectory(win.windowDirectory, 'Window directory'), 'state.json')
  if (!existsSync(statePath)) return 'not-applicable'
  const state = privateJson(statePath, 'Window state'), id = state.ops?.reverify
  if (!id || state.windowId !== win.windowId) return 'not-applicable'
  const ctx = loadAcceptanceConfig(configPath)
  const inspect = hostTools(io, ctx, 'installed')
  const live = inspect.deploy('status')
  if (live.generation !== win.generation) return 'not-applicable'
  const directory = join(win.exchangeDirectory, 'source-recovery'), accepted = join(directory, 'acceptance.json')
  const proofPath = join(directory, 'formal-browser.json')
  const openedHere = value => existsSync(accepted) && existsSync(proofPath) && openBinding(value, {
    candidate: from, generation: win.generation, formalBuild: privateJson(proofPath, 'Recovery formal proof').deployment.buildId, reverifyOperationId: id,
    acceptance: { ...privateJson(accepted, 'Recovery acceptance'), sha256: hashFile(accepted) },
  }) === 'ours'
  if (live.mode === 'open') return openedHere(live) ? true : 'not-applicable'
  const op = live.operation
  if (live.mode !== 'maintenance' || op?.id !== id || !['startup', 'acceptance'].includes(op.stage)) return 'not-applicable'
  const candidate = op.kind === 'deploy' && op.rollbackCompatible === true && op.buildId === to && op.sourceBuildId === from
  const restoring = op.kind === 'rollback' && op.buildId === from && op.sourceBuildId === to
  if (!candidate && !restoring) return 'not-applicable'
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  privateDirectory(directory, 'Source recovery directory')
  const tools = hostTools(io, ctx, from)
  tools.ssh(`mkdir -p -m 700 '${directory}'`, undefined, 'host recovery directory')
  tools.authority('close', win.generation, randomUUID(), ['--output', join(directory, 'close.json')])
  const status = tools.deploy('rollback-source', ['--operation-id', id])
  if (status.mode !== 'maintenance' || status.installed?.buildId !== from || status.operation?.kind !== 'rollback'
    || status.operation.stage !== 'acceptance' || status.operation.id !== id || status.generation !== win.generation) {
    throw new Error('Rollback did not start the previous installation in acceptance maintenance')
  }
  const config = join(directory, 'acceptance-config.json')
  writePrivateJson(config, { ...ctx.config, sourceProof: win.install.sourceProof, sourceRecovery: true, candidate: from })
  const run = join(directory, 'run')
  mkdirSync(run, { recursive: true, mode: 0o700 })
  const recovery = { ...win, exchangeDirectory: directory }
  await auditChain(io, tools, recovery, 'initial')
  const smoke = sourceSmokeEvidence(tools, config, run, win.acceptanceRoom, from, id, directory)
  const formalBrowser = tools.deploy('verify-formal-browser')
  writePrivateJson(proofPath, formalBrowser)
  writePrivateJson(accepted, acceptanceRecord({ targetId: ctx.target.targetId, status, healthyCycle: storageCycle(tools, ctx),
    index: { 'source-smoke': smoke }, formalBrowser }))
  tools.toHost([smoke.path, accepted], directory)
  const chain = await auditChain(io, tools, recovery, 'final')
  assertWithin('activate → open', Date.now() - chain.activatedAt, LIMITS.activateToOpenMs)
  const opened = tools.deploy('open-rollback-source', ['--sha', from, '--operation-id', id, '--source-proof', win.install.sourceProof,
    '--authority-receipt', chain.files.activate, '--audit', chain.files.audit, '--verification', chain.files['identity-verified'], '--acceptance', accepted])
  if (!openedHere(opened)) throw new Error('Restored installation has no matching public acceptance')
  return true
}
