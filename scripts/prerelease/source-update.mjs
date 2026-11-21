// One owner command pins the candidate before any transfer or change to admission.
// The OS lock releases on exit. The private journal survives exit and a lost SSH reply.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { commitRef, ownerMachine, RELEASE_REPOSITORY } from '../ci/release-github.ts'
import { candidateSha } from '../release/candidate.ts'
import { parsePrereleaseTarget, targetFingerprint } from './config.ts'
import { parseSourceBudget } from './source-budget.ts'
import { readSourceProof } from './source-verification.ts'
import { loadAccounts, privateDirectory, privateJson } from './live-acceptance/context.mjs'
import { liveFormalBuild, previousTeamRoom, runWindow, writePrivateJson } from './live-acceptance/window.mjs'

const root = resolve(import.meta.dirname, '../..')
const sha = /^[0-9a-f]{40}$/
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const options = argv => {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]
    if (!['--config', '--sha', '--confirm-step'].includes(key) || !argv[i + 1] || Object.hasOwn(parsed, key)) throw new Error('Usage: deploy-prerelease.sh update [--config file] [--sha full-SHA] [--confirm-step accounts|deletion]')
    parsed[key] = argv[i + 1]
  }
  if (parsed['--sha'] && !sha.test(parsed['--sha'])) throw new Error('Expected a full candidate SHA')
  if (parsed['--confirm-step'] && !['accounts', 'deletion'].includes(parsed['--confirm-step'])) throw new Error('Invalid recovery step')
  return parsed
}

function dir(path) {
  mkdirSync(path, { mode: 0o700, recursive: true })
  return privateDirectory(path, 'Owner update state')
}

function command(program, args) {
  return execFileSync(program, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 }).trim()
}

export function updateConfig(path) {
  const config = privateJson(path, 'Source update config')
  if (config.format !== 1 || !['stateDirectory', 'exchangeRoot', 'acceptanceConfig', 'routineAccounts'].every(key => typeof config[key] === 'string' && isAbsolute(config[key])) ||
    !/^\/[a-zA-Z0-9._/-]+$/.test(config.exchangeRoot) || config.exchangeRoot.split('/').includes('..') || !uuid.test(config.acceptanceRoom ?? '')) {
    throw new Error('Source update needs absolute owner state, exchange and acceptance config paths and a participating room UUID')
  }
  if (config.sourcePreparation !== undefined) config.sourcePreparation = parseSourceBudget(config.sourcePreparation)
  return config
}

export function selectAttempt({ active, requested, latest, status, producer, fingerprint, id = randomUUID }) {
  if (active) {
    if (!uuid.test(active.id) || !uuid.test(active.generation) || !sha.test(active.from) || !sha.test(active.to) || active.fingerprint !== fingerprint || active.producer !== producer || requested && requested !== active.to) {
      throw new Error('An unfinished update belongs to another candidate, policy or target. Resume using its recorded configuration')
    }
    return active
  }
  if (status.mode !== 'open' || status.operation || !sha.test(status.installed?.buildId) || !uuid.test(status.generation)) throw new Error('A new source update needs an open installed prerelease with no pending operation')
  const to = requested ?? latest()
  if (!sha.test(to ?? '')) throw new Error('The protected prerelease ref did not resolve to a full SHA')
  if (to === status.installed.buildId && status.installed.runtimeDigest) return null
  if (to === status.installed.buildId) throw new Error('Select the source revision containing the approved runtime pin to migrate the image installation')
  return { id: id(), from: status.installed.buildId, to, generation: status.generation, producer, fingerprint, bootstrap: !status.installed.runtimeDigest }
}

const ownerServices = { command, candidateSha, commitRef, liveFormalBuild, runWindow }

export async function runSourceUpdate(config, args, services = ownerServices) {
  const { command, candidateSha, commitRef, liveFormalBuild, runWindow } = services
  const template = privateJson(config.acceptanceConfig, 'Source acceptance template')
  const target = parsePrereleaseTarget(privateJson(template.targetConfig, 'Target config'))
  if (!/^[a-zA-Z0-9][a-zA-Z0-9@_.-]*$/.test(template.ssh)) throw new Error('Invalid owner SSH host')
  if (command('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Run from a clean trusted policy checkout')
  const host = ['--config', template.targetConfig, '--ssh', template.ssh]
  const deploy = (action, args = []) => JSON.parse(command('./deploy-prerelease.sh', [action, ...host, ...args]))
  const state = privateDirectory(config.stateDirectory, 'Owner state directory')
  const pointer = join(state, 'active.json')
  let active = existsSync(pointer) ? privateJson(pointer, 'Pending update') : null
  const status = deploy('status')
  if (active && args['--sha'] && args['--sha'] !== active.to && uuid.test(active.id) &&
    active.fingerprint === targetFingerprint(target) && status.mode === 'open' && !status.operation &&
    active.from === status.installed?.buildId && active.generation === status.generation) {
    const old = join(state, active.id), windowState = join(old, 'window/state.json')
    if (!existsSync(windowState) || !privateJson(windowState, 'Pending window').steps.reverify) {
      writePrivateJson(join(old, 'outcome.json'), { result: 'superseded-before-cutover', candidate: active.to, replacement: args['--sha'] })
      rmSync(pointer)
      active = null
    }
  }
  const job = selectAttempt({ active, requested: args['--sha'], latest: () => commitRef(RELEASE_REPOSITORY, 'heads/prerelease'), status,
    producer: command('git', ['rev-parse', 'HEAD']), fingerprint: targetFingerprint(target) })
  if (!job) return { result: 'already-open', buildId: status.installed.buildId }
  const attempt = dir(join(state, job.id)), output = dir(join(attempt, 'browser')), windowDirectory = dir(join(attempt, 'window'))
  if (!active) writePrivateJson(pointer, job)
  const complete = join(attempt, 'outcome.json')
  const finish = result => { writePrivateJson(complete, result); rmSync(pointer, { force: true }); return result }
  if (existsSync(complete)) return finish(privateJson(complete, 'Completed update'))
  const proofPath = join(attempt, 'source-proof.json'), configPath = join(attempt, 'acceptance.json'), windowPath = join(attempt, 'window.json')
  if (!existsSync(proofPath)) {
    for (const commit of [job.from, job.to]) candidateSha(root, RELEASE_REPOSITORY, commit)
    deploy('authorize-source', ['--sha', job.to, '--expected-current', job.from, '--output', proofPath, ...(job.bootstrap ? ['--force-full', 'true'] : [])])
  }
  const proof = readSourceProof(privateJson(proofPath, 'Source verification'))
  if (proof.from !== job.from || proof.sha !== job.to || proof.producer !== job.producer || job.bootstrap && proof.scope !== 'full') throw new Error('Source verification differs from the journal')
  if (!existsSync(windowPath)) {
    const formal = await liveFormalBuild({ fetch }, { formalApp: target.formal.appOrigin, formalApi: target.formal.apiOrigin })
    if (!formal.healthy || !sha.test(formal.policy) || formal.pages !== formal.policy) throw new Error('Formal API and Pages must be healthy and agree on the active build')
    const acceptance = { ...template, sourceProof: proofPath, candidate: job.to, formalBuild: formal.policy, outputRoot: output }
    delete acceptance.candidateReceipt
    let previousRun = output
    const participant = loadAccounts(config.routineAccounts, ['A'])[0]
    const disposable = [template.accounts, ...Object.values(template.engineAccounts ?? {})].flatMap(file => loadAccounts(file, ['A', 'B', 'C']).slice(0, 2))
    if (disposable.some(account => account.id === participant.id)) throw new Error('The routine participant must survive full acceptance account cleanup')
    if (proof.scope === 'full') {
      const prior = join(state, 'last-full.json')
      previousRun = existsSync(prior) ? privateJson(prior, 'Last full acceptance').run : config.previousRun
      if (!previousRun) throw new Error('Set previousRun to the prior full browser run for retained-room continuity')
      previousTeamRoom(privateDirectory(previousRun, 'Previous full acceptance run'))
      // D/E are created by this attempt. A private copy avoids overwriting the template during account cleanup.
      const team = privateJson(template.teamAccounts, 'Team account template')
      acceptance.teamAccounts = join(attempt, 'team-accounts.json')
      writePrivateJson(acceptance.teamAccounts, team)
    } else {
      delete acceptance.teamAccounts
      delete acceptance.engineAccounts
      acceptance.accounts = config.routineAccounts
    }
    writePrivateJson(configPath, acceptance)
    writePrivateJson(windowPath, { format: 1, windowId: job.id.replaceAll('-', ''), generation: job.generation, formalFrom: formal.policy, formalBuild: formal.policy,
      formalIdentityBoundary: formal.identityBoundary, sourcePreparation: config.sourcePreparation, previousRun, run: output, windowDirectory, exchangeDirectory: join(config.exchangeRoot, job.id), ownerNotes: config.ownerNotes,
      acceptanceRoom: config.acceptanceRoom, install: { from: job.from, to: job.to, sourceProof: proofPath } })
  }
  const windowState = join(windowDirectory, 'state.json')
  if (active && status.mode === 'open' && !status.operation && status.installed?.buildId === job.from) {
    // A preparation that hit a cgroup limit can be retried with the owner's newly measured staging budget.
    const saved = privateJson(windowPath, 'Source window')
    if (JSON.stringify(saved.sourcePreparation) !== JSON.stringify(config.sourcePreparation))
      writePrivateJson(windowPath, { ...saved, sourcePreparation: config.sourcePreparation })
  }
  if (!existsSync(windowState)) command(process.execPath, ['--import', 'tsx', 'scripts/prerelease/source-runtime-transfer.ts', ...host, '--sha', job.to, ...(config.authFile ? ['--auth-file', config.authFile] : [])])
  if (active && proof.scope === 'routine' && (status.operation?.kind === 'rollback' || existsSync(join(config.exchangeRoot, job.id, 'source-recovery')))) {
    const { recoverSourceUpdate } = await import('./live-acceptance/source-recovery.mjs')
    if (await recoverSourceUpdate({ configPath, windowPath }) === true) return finish({ result: 'rolled-back', buildId: job.from, candidate: job.to, attempt })
  }
  try {
    await runWindow({ configPath, windowPath, resume: existsSync(windowState), confirmStep: args['--confirm-step'] })
  } catch (error) {
    if (proof.scope === 'routine' && existsSync(windowState)) {
      const { recoverSourceUpdate } = await import('./live-acceptance/source-recovery.mjs')
      const recovered = await recoverSourceUpdate({ configPath, windowPath })
      if (recovered === true) return finish({ result: 'rolled-back', buildId: job.from, candidate: job.to, cause: error.message, attempt })
    }
    throw error
  }
  if (proof.scope === 'full') writePrivateJson(join(state, 'last-full.json'), { run: output, generation: job.generation })
  const closed = privateJson(join(config.exchangeRoot, job.id, 'source-closed.json'), 'Cutover time').closedAt
  const opened = privateJson(windowState, 'Window state').steps['final-open'].finishedAt
  return finish({ result: 'open', buildId: job.to, scope: proof.scope, closeToOpenMs: opened - closed, attempt })
}

async function main(argv) {
  ownerMachine()
  process.umask(0o077)
  const locked = argv[0] === '_locked'
  const args = options(locked ? argv.slice(1) : argv)
  const config = updateConfig(args['--config'] ?? process.env.OA_PRE_UPDATE_CONFIG ?? join(homedir(), '.config/open-agricola/pre-update.json'))
  // flock holds the owner-state lock until the child exits.
  const lock = join(dir(config.stateDirectory), '.update.lock')
  if (!locked) {
    const child = spawnSync('flock', ['-n', '-E', '75', lock, process.execPath, '--import', 'tsx', fileURLToPath(import.meta.url), '_locked', ...argv], { cwd: root, stdio: 'inherit' })
    if (child.error) throw child.error
    if (child.status === 75) throw new Error('Another prerelease update is running')
    process.exitCode = child.status ?? 1
    return
  }
  const result = await runSourceUpdate(config, args)
  process.stdout.write(JSON.stringify(result) + '\n')
  if (result.result === 'rolled-back') process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)) } catch (error) { console.error(error.message); for (const next of error.next ?? []) console.error(next); process.exitCode = 1 }
}
