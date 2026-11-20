import { assertStorageAdmission } from './storage-guard-state'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertScopedPaths, loadPrereleaseEnvironment, type PrereleaseTarget, targetFingerprint } from './config'
import { atomicJson, controlDirectory, readRuntime, recordPath, writeRuntime, type RuntimeRecord } from './runtime'
import { archiveTool, assertCapacity, backupEnvironment, backupRoot, importedImage, trustedArchiveImage, candidateTool, command, compose, policyTool, stopWriters, toolEnvironment, verifyPermissions, verifyRunning } from './docker'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import { inspectPairedPrereleaseBackup, prepareRestoreStaging, readPairedPrereleaseBackup, removeRestoreStaging } from './backup'
import { compareIdentityRefs } from './identity-manifest'
import { readFormalBrowserDeployment, verifyFormalBrowserAcceptance } from './browser-policy'
import { executeImageCleanup, planImageCleanup } from './image-cleanup'
import { readPreparedPrereleaseSource } from './source-preparation'

export type OperationRequest = { action: string; expectedCurrent: string; rollbackCompatible?: boolean; buildId?: string; generation?: string; nextGeneration?: string;
  acceptLoss?: string; operationId?: string; acceptanceFile?: string; authorityFile?: string; retirementFile?: string; backupStem?: string; sourceTarget?: PrereleaseTarget;
  associationsFile?: string; auditFile?: string; verificationFile?: string; backupGeneration?: string; expectedSourceCurrent?: string }

const hash = (path: string) => {
  const result = command('sha256sum', [path]).split(/\s/)[0]
  if (!/^[a-f0-9]{64}$/.test(result)) throw new Error('Owner artifact hashing failed')
  return result
}
const jsonText = (text: string): Record<string, unknown> => {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an owner operation artifact')
  return Object.fromEntries(Object.entries(value))
}
const json = (path: string): Record<string, unknown> => jsonText(readFileSync(path, 'utf8'))
const generation = (value: string | undefined): string => {
  if (!value || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new Error('An explicit authority/data generation UUID is required')
  return value
}
const build = (value: string | undefined): string => {
  if (!value || !/^[a-f0-9]{40}$/.test(value)) throw new Error('A fixed full candidate SHA is required')
  return value
}

function authorityReceipt(target: PrereleaseTarget, record: RuntimeRecord, path: string | undefined, action: 'close' | 'activate' | 'retire'): void {
  if (!path) throw new Error(`An owner authority ${action} receipt is required`)
  const body = json(path)
  const receipt = 'receipt' in body && body.receipt && typeof body.receipt === 'object' ? body.receipt : body
  if (!('action' in receipt) || receipt.action !== action || !('generationId' in receipt) || receipt.generationId !== record.generation
    || !('targetOrigin' in receipt) || receipt.targetOrigin !== target.origin || !('targetId' in receipt) || receipt.targetId !== target.targetId
    || !('completedAt' in receipt) || typeof receipt.completedAt !== 'number' || receipt.completedAt > Date.now()
    || action !== 'retire' && Date.now() - receipt.completedAt > (action === 'activate' ? 30_000 : 10 * 60_000)) throw new Error('Authority receipt does not match the current prerelease generation')
  if (action === 'retire') {
    const artifact = record.operation && join(backupRoot(target), `purge-${record.operation.id}.json`)
    if (!artifact || !('purgeReceiptSha256' in receipt) || receipt.purgeReceiptSha256 !== hash(artifact)) throw new Error('Retirement does not attest this exact verified purge')
  }
}

function verifyBackup(target: PrereleaseTarget, stem: string, source: string, destination: string): void {
  const point = readPairedPrereleaseBackup(target, stem, readRuntime(target).generation)
  if (point.sourceBuildId !== source || point.targetBuildId !== destination) throw new Error('Backup did not validate this exact source/candidate pair')
}

function maintenance(target: PrereleaseTarget, record: RuntimeRecord, candidateImage?: string) {
  rmSync(join(controlDirectory(target), 'verification.json'), { force: true })
  rmSync(join(controlDirectory(target), 'verification.token'), { force: true })
  const stopped: RuntimeRecord = { ...record, mode: 'maintenance', acceptance: null }
  writeRuntime(target, stopped, candidateImage)
  compose(target, ['up', '-d', '--no-build', 'gateway'])
  stopWriters(target, stopped)
  return stopped
}

function capture(target: PrereleaseTarget, record: RuntimeRecord, stem: string, destination: string, online = false): void {
  if (!record.installed) throw new Error('There is no source build to capture')
  const report = join(backupRoot(target), `${stem}.manifest.json`)
  const env = backupEnvironment(target, record)
  if (!existsSync(report)) command('bash', [join(target.policyDirectory, 'scripts/backup-storage.sh'), stem, ...(online ? [] : ['--already-stopped'])], { env, timeout: 30 * 60 * 1000 })
  verifyBackup(target, stem, record.installed.buildId, destination)
  command('bash', [join(target.policyDirectory, 'backup-offsite.sh'), 'sync-only'], { env, timeout: 30 * 60 * 1000 })
}

function deploymentImage(target: PrereleaseTarget, source: boolean, buildId: string, operation: RuntimeRecord['operation']) {
  if (source) {
    const { image, runtimeDigest } = readPreparedPrereleaseSource(target, buildId)
    if (operation && (operation.image !== image || operation.runtimeDigest !== runtimeDigest)) {
      throw new Error('Prepared source differs from the pending installation')
    }
    return { image, runtimeDigest }
  }
  if (operation?.runtimeDigest) throw new Error('Resume the prepared source deployment')
  return { image: importedImage(target, 'candidate', buildId, operation?.image) }
}

function rollbackSource(target: PrereleaseTarget, record: RuntimeRecord, operationId: string) {
  const op = record.operation
  if (!op || op.id !== operationId || record.mode !== 'maintenance') throw new Error('Rollback requires the exact pending operation in maintenance')
  if (op.kind === 'deploy') {
    if (!op.rollbackCompatible || !op.runtimeDigest || !op.sourceBuildId || !op.sourceImage
      || (op.stage !== 'startup' && op.stage !== 'acceptance')) {
      throw new Error(`Source rollback is incompatible with this deployment; inspect recovery point ${op.backupStem ?? 'unavailable'}`)
    }
    if (op.sourceRuntimeDigest) {
      const previous = readPreparedPrereleaseSource(target, op.sourceBuildId)
      if (previous.image !== op.sourceImage || previous.runtimeDigest !== op.sourceRuntimeDigest) throw new Error('Previous source installation changed')
    }
    // Revoke private access before draining the failed candidate. The gateway stays in maintenance.
    maintenance(target, record)
    const source = op.sourceRuntimeDigest ? { runtimeDigest: op.sourceRuntimeDigest } : {}
    record = { ...record, buildId: op.sourceBuildId, acceptance: null,
      installed: { buildId: op.sourceBuildId, image: op.sourceImage, installedAt: Date.now(), ...source },
      operation: { id: op.id, kind: 'rollback', stage: 'startup', buildId: op.sourceBuildId, image: op.sourceImage, ...source,
        sourceBuildId: op.buildId, sourceImage: op.image, sourceRuntimeDigest: op.runtimeDigest,
        generation: op.generation, backupStem: op.backupStem } }
  } else if (op.kind !== 'rollback' || (op.stage !== 'startup' && op.stage !== 'acceptance')) {
    throw new Error('Only an unaccepted source deployment can roll back')
  }
  if (record.operation?.stage === 'startup') {
    writeRuntime(target, record)
    assertCapacity(target, 'app')
    compose(target, ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'app'])
    verifyRunning(target, record)
    record.operation.stage = 'acceptance'
    writeRuntime(target, record)
  }
  return record
}

/** Only admission opens here; health alone never creates an acceptance receipt. */
export async function runPrereleaseOperation(target: PrereleaseTarget, request: OperationRequest) {
  assertScopedPaths(target)
  if (request.action !== 'retention') loadPrereleaseEnvironment(target)
  let record = readRuntime(target)
  if (request.expectedCurrent !== (record.buildId ?? 'empty')
    && (!record.operation || request.expectedCurrent !== (record.operation.sourceBuildId ?? 'empty'))) throw new Error('Prerelease expected-current lease changed')
  if (record.mode === 'closed' && !['status', 'retention', 'reinitialize', 'finish-close'].includes(request.action)) throw new Error('Retired targets require fresh resources and a new generation')
  if (request.action === 'status') return record
  if (request.action === 'retention') {
    command('node', [join(target.policyDirectory, 'scripts/backup-files.mjs'), 'prune', backupRoot(target), '7', '1000000'], { env: toolEnvironment({
      BACKUP_RETENTION_DAYS: '7', BACKUP_ENVIRONMENT: target.targetId, BACKUP_TARGET_FINGERPRINT: targetFingerprint(target),
    }) })
    command('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', target.offsite.host, 'bash', '-s', '--', target.offsite.directory, '7'],
      { input: readFileSync(join(target.policyDirectory, 'deploy/offsite-retention.sh')), timeout: 60_000 })
    return { targetId: target.targetId, retentionDays: 7, mode: record.mode }
  }
  if (request.action === 'initialize') {
    const requested = generation(request.generation)
    if (record.installed || record.operation || record.buildId || existsSync(recordPath(target)) && (record.mode !== 'maintenance' || record.generation !== requested)) throw new Error('Prerelease target is already initialized with different state')
    record.generation = requested
    writeRuntime(target, record)
    compose(target, ['up', '-d', '--no-build', 'gateway'])
    return record
  }
  // Removing unused imported images only frees space, so it does not need storage admission.
  if (request.action === 'image-cleanup-plan') return { mode: 'plan', ...planImageCleanup(target, record) }
  if (request.action === 'image-cleanup') return executeImageCleanup(target, record)
  if (!['maintain', 'reverify', 'finish-close', 'budget-check'].includes(request.action)) assertStorageAdmission(target, targetFingerprint(target), 'operation')
  if (request.action === 'rollback-source') return rollbackSource(target, record, generation(request.operationId))
  if (request.action === 'maintain') {
    authorityReceipt(target, record, request.authorityFile, 'close')
    return maintenance(target, record)
  }
  if (request.action === 'reverify') {
    if (!record.installed || !record.buildId) throw new Error('Reverification requires an installed prerelease build')
    const id = generation(request.operationId)
    authorityReceipt(target, record, request.authorityFile, 'close')
    if (record.operation && (record.operation.kind !== 'reverify' || record.operation.id !== id)) throw new Error('Resume the pending prerelease operation first')
    const pending: RuntimeRecord = { ...record, mode: 'maintenance', acceptance: null, operation: {
      id, kind: 'reverify', stage: 'acceptance', buildId: record.buildId, image: record.installed.image,
      sourceBuildId: record.buildId, sourceImage: record.installed.image, backupStem: null, generation: record.generation,
      ...(record.installed.runtimeDigest ? { runtimeDigest: record.installed.runtimeDigest, sourceRuntimeDigest: record.installed.runtimeDigest } : {}),
    } }
    rmSync(join(controlDirectory(target), 'verification.json'), { force: true })
    rmSync(join(controlDirectory(target), 'verification.token'), { force: true })
    writeRuntime(target, pending)
    compose(target, ['up', '-d', '--no-build', 'gateway'])
    return pending
  }
  if (request.action === 'backup') {
    if (!record.installed || record.operation) throw new Error('Online backup requires a complete installed deployment')
    verifyRunning(target, record)
    verifyPermissions(target)
    trustedArchiveImage(target)
    writeRuntime(target, record)
    command('bash', [join(target.policyDirectory, 'backup-offsite.sh')], { env: backupEnvironment(target, record), timeout: 30 * 60 * 1000 })
    return { channel: 'prerelease', targetId: target.targetId, mode: 'online', generation: record.generation }
  }
  if (request.action === 'budget-check') {
    assertStorageAdmission(target, targetFingerprint(target))
    return json(join(controlDirectory(target), 'storage-guard.json'))
  }
  if (request.action === 'identities') {
    if (record.mode !== 'maintenance' || !record.installed) throw new Error('Identity audit requires an installed maintenance target')
    const manifest = jsonText(policyTool(target, 'identities'))
    const artifact = join(controlDirectory(target), `identities-${record.generation}.json`)
    atomicJson(artifact, { ...manifest, generationId: record.generation, targetFingerprint: targetFingerprint(target), targetId: target.targetId, targetOrigin: target.origin })
    return { path: artifact, identityCount: manifest.identityCount, sha256: hash(artifact) }
  }
  if (request.action === 'verify-access') {
    if (!record.installed || record.mode !== 'maintenance' || !record.operation || record.operation.stage !== 'acceptance') throw new Error('Private verification requires the installed maintenance candidate')
    verifyRunning(target, record)
    const token = randomBytes(32).toString('base64url')
    atomicJson(join(controlDirectory(target), 'verification.json'), { format: 1, targetId: target.targetId, buildId: record.buildId,
      generation: record.generation, healthyCycle: assertStorageAdmission(target, targetFingerprint(target)).healthyCycle, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 })
    const path = join(controlDirectory(target), 'verification.token')
    writeFileSync(path, token + '\n', { mode: 0o600 })
    return { tokenFile: path, expiresInSeconds: 600, targetOrigin: target.origin, mode: 'maintenance' }
  }
  if (request.action === 'apply-identities') {
    if (!record.installed || record.mode !== 'maintenance' || !record.operation || record.operation.stage !== 'acceptance' || !request.associationsFile) throw new Error('Apply audited identities only to an installed maintenance candidate')
    const packet = json(request.associationsFile)
    if (packet.generationId !== record.generation || packet.targetFingerprint !== targetFingerprint(target) || packet.targetId !== target.targetId
      || packet.targetOrigin !== target.origin || !Array.isArray(packet.associations) || !Array.isArray(packet.receipts)) throw new Error('Source identity audit binding mismatch')
    for (const value of packet.receipts) {
      const receipt = jsonText(canonicalJson(value))
      if (receipt.action !== 'associate' || receipt.generationId !== record.generation || receipt.targetOrigin !== target.origin || receipt.targetId !== target.targetId) throw new Error('Source association receipt mismatch')
    }
    const expected: Array<{ userId: string; sourceGrantId: string }> = []
    for (const value of packet.associations) {
      const row = jsonText(canonicalJson(value)), account = jsonText(canonicalJson(row.account))
      if (typeof row.userId !== 'string' || typeof row.associationId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(row.associationId)
        || typeof row.sourceGrantId !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(row.sourceGrantId) || !['active', 'deleted'].includes(String(account.kind))) throw new Error('Unbound source identity association')
      if (account.kind === 'active') expected.push({ userId: row.userId, sourceGrantId: row.associationId })
    }
    const unique = [...new Map(expected.map(ref => [`${ref.userId}:${ref.sourceGrantId}`, ref])).values()]
      .sort(compareIdentityRefs)
    record = maintenance(target, record)
    mkdirSync(backupRoot(target), { recursive: true, mode: 0o700 })
    const input = join(backupRoot(target), `identity-associations-${record.generation}.json`)
    atomicJson(input, packet)
    const packetPath = `/backup/identity-associations-${record.generation}.json`
    candidateTool(target, 'migrate', ['scripts/prerelease/identity-audit.ts', 'apply', packetPath], {
      inputs: [{ source: join(backupRoot(target), `identity-associations-${record.generation}.json`), destination: packetPath }],
    })
    const manifest = jsonText(policyTool(target, 'identities'))
    if (canonicalJson(manifest.refs) !== canonicalJson(unique)) throw new Error('Real cleanup/remap did not produce the exact retained active identity set')
    assertCapacity(target, 'app')
    compose(target, ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'app'])
    verifyRunning(target, record)
    const artifact = join(controlDirectory(target), `identity-verified-${record.generation}.json`)
    atomicJson(artifact, { format: 1, targetFingerprint: targetFingerprint(target), generationId: record.generation,
      buildId: record.buildId, operationId: record.operation?.id, identityManifestSha256: manifest.identityManifestSha256, identityCount: manifest.identityCount,
      sourcePacketSha256: hash(request.associationsFile), verifiedAt: Date.now() })
    return { path: artifact, verificationReceiptSha256: hash(artifact), identityManifestSha256: manifest.identityManifestSha256, identityCount: manifest.identityCount }
  }
  if (request.action === 'verify-formal-browser') {
    if (!record.installed || record.mode !== 'maintenance' || !record.operation || record.operation.stage !== 'acceptance') throw new Error('Formal browser verification requires the installed maintenance candidate')
    const deployment = await readFormalBrowserDeployment(target.formal)
    const path = join(controlDirectory(target), `formal-browser-policy-${record.operation.id}.json`)
    atomicJson(path, { format: 1, targetId: target.targetId, targetFingerprint: targetFingerprint(target), origin: target.origin,
      buildId: record.buildId, generation: record.generation, operationId: record.operation.id, observedAt: Date.now(), deployment })
    return { path, sha256: hash(path), deployment }
  }
  if (request.action === 'open') {
    if (request.buildId !== record.buildId) throw new Error('Opening requires the installed candidate SHA receipt')
    if (!record.installed || !record.operation || record.operation.kind === 'reset' || record.operation.stage !== 'acceptance' || !request.acceptanceFile) throw new Error('Complete target acceptance is required before opening')
    const acceptance = json(request.acceptanceFile)
    const { healthyCycle } = assertStorageAdmission(target, targetFingerprint(target))
    if (acceptance.healthyCycle !== healthyCycle) throw new Error('Acceptance belongs to a different storage cycle; repeat owner verification')
    const authorityFile = request.authorityFile
    if (!authorityFile) throw new Error('A fresh authority activation receipt is required')
    authorityReceipt(target, record, authorityFile, 'activate')
    if (!request.auditFile || !request.verificationFile) throw new Error('A fresh authority audit completion and native verification are required')
    const source = jsonText(canonicalJson(json(request.auditFile).receipt)), verification = json(request.verificationFile)
    const live = jsonText(policyTool(target, 'identities'))
    const activated = jsonText(canonicalJson(json(authorityFile).receipt))
    if (source.action !== 'audit-complete' || source.generationId !== record.generation || source.targetOrigin !== target.origin || source.targetId !== target.targetId
      || source.identityManifestSha256 !== live.identityManifestSha256 || source.identityCount !== live.identityCount
      || source.verificationReceiptSha256 !== hash(request.verificationFile) || activated.auditOperationId !== source.operationId
      || verification.generationId !== record.generation || verification.targetFingerprint !== targetFingerprint(target)
      || verification.buildId !== record.buildId || verification.operationId !== record.operation.id
      || verification.identityManifestSha256 !== live.identityManifestSha256 || verification.identityCount !== live.identityCount) throw new Error('Authority/native identity audit does not match the live restored target')
    if (acceptance.format !== 1 || acceptance.channel !== 'prerelease' || acceptance.targetId !== target.targetId
      || acceptance.targetFingerprint !== targetFingerprint(target) || acceptance.buildId !== record.buildId
      || acceptance.image !== record.installed.image || acceptance.generation !== record.generation || acceptance.operationId !== record.operation.id
      || typeof acceptance.acceptedAt !== 'number' || acceptance.acceptedAt > Date.now() || Date.now() - acceptance.acceptedAt > 30 * 60_000
      || !acceptance.evidence || typeof acceptance.evidence !== 'object') throw new Error('Acceptance belongs to a different target, operation, build or generation')
    const routineSource = record.operation.kind === 'rollback' || record.operation.kind === 'deploy' && record.operation.runtimeDigest && record.operation.rollbackCompatible === true
    const required = routineSource ? ['source-smoke', 'formal-browser-policy'] : ['identity', 'beta-access', 'http-ws', 'viewer', 'retained-data', 'deletion-audit', 'capacity', 'formal-unaffected', 'browser-boundary', 'formal-browser-policy']
    let formalProof: Record<string, unknown> | undefined
    for (const name of required) {
      if (!(name in acceptance.evidence)) throw new Error(`Missing owner acceptance evidence: ${name}`)
      const entry: unknown = Reflect.get(acceptance.evidence, name)
      if (!entry || typeof entry !== 'object' || !('path' in entry) || typeof entry.path !== 'string'
        || !('sha256' in entry) || entry.sha256 !== hash(entry.path) || statSync(entry.path).size === 0) throw new Error(`Acceptance artifact failed verification: ${name}`)
      if (name === 'source-smoke') {
        const proof = json(entry.path)
        if (proof.suite !== 'source-smoke' || proof.engine !== 'chromium' || proof.passed !== true || proof.mode !== 'maintenance'
          || proof.publicStill503 !== true || proof.candidate !== record.buildId || proof.operationId !== record.operation.id
          || proof.healthyCycle !== healthyCycle || proof.generation !== record.generation || !Array.isArray(proof.results)
          || proof.results.length !== 1 || proof.results[0]?.case !== 'source-smoke' || proof.results[0]?.passed !== true
          || proof.results[0]?.participant !== 'A' || proof.results[0]?.buildId !== record.buildId || proof.results[0]?.backendBuildId !== record.buildId || !Number.isSafeInteger(proof.results[0]?.version)) throw new Error('Source update did not prove a fresh participant reconnect')
      }
      if (name === 'formal-browser-policy') formalProof = json(entry.path)
    }
    const formalDeployment = await verifyFormalBrowserAcceptance(target.formal, formalProof, {
      targetId: target.targetId, origin: target.origin, targetFingerprint: targetFingerprint(target),
      buildId: record.installed.buildId, generation: record.generation, operationId: record.operation.id,
    })
    verifyRunning(target, record)
    if (assertStorageAdmission(target, targetFingerprint(target)).healthyCycle !== healthyCycle) throw new Error('Storage cycle changed during acceptance; repeat owner verification')
    const opened: RuntimeRecord = { ...record, mode: 'open', operation: null, acceptance: { acceptedAt: acceptance.acceptedAt, sha256: hash(request.acceptanceFile), formalBuildId: formalDeployment.buildId, identityBoundary: formalDeployment.identityBoundary, healthyCycle } }
    writeRuntime(target, opened)
    return opened
  }
  if (request.action === 'finish-close') {
    authorityReceipt(target, record, request.authorityFile, 'retire')
    if (!record.operation || record.operation.kind !== 'reset' || record.operation.stage !== 'acceptance') throw new Error('A verified generation purge is required before retirement')
    compose(target, ['stop', '--timeout', '30', 'gateway'])
    const closed: RuntimeRecord = { ...record, mode: 'closed', acceptance: null }
    writeRuntime(target, closed)
    return closed
  }
  if (request.action === 'reinitialize') {
    if (record.installed || !record.operation || record.operation.kind !== 'reset' || record.operation.stage !== 'acceptance') throw new Error('A purged generation is required before reinitialization')
    authorityReceipt(target, record, request.retirementFile, 'retire')
    const next = generation(request.generation)
    const prepared = { ...record, generation: next }
    if (next === record.generation || !request.authorityFile) throw new Error('A newly prepared authority generation is required')
    const receipt = json(request.authorityFile)
    const value = receipt.receipt && typeof receipt.receipt === 'object' ? receipt.receipt : receipt
    if (!('action' in value) || value.action !== 'prepare' || !('generationId' in value) || value.generationId !== next
      || !('targetOrigin' in value) || value.targetOrigin !== target.origin || !('targetId' in value) || value.targetId !== target.targetId) throw new Error('Authority prepare receipt does not match the new runtime generation')
    atomicJson(join(target.directory, 'control', `retired-${record.generation}.json`), record)
    const empty: RuntimeRecord = { ...prepared, buildId: null, installed: null, operation: null, acceptance: null, mode: 'maintenance' }
    writeRuntime(target, empty)
    return empty
  }
  if (request.action === 'restore' || request.action === 'restore-source') {
    const source = request.sourceTarget
    if (!source || !request.backupStem || !request.backupGeneration) throw new Error('Restore requires an explicit paired point and fresh isolated replacement target')
    loadPrereleaseEnvironment(source)
    const previous = readRuntime(source)
    const sourceRoles = new Set([source.database.appRole, source.database.backupRole, source.validationDatabase.role])
    const sharedRoles = [target.database.appRole, target.database.backupRole, target.validationDatabase.role].some(role => sourceRoles.has(role))
    const sourceKeys = new Set([source.objects.appKeyId, source.objects.backupKeyId])
    if (sharedRoles || [target.objects.appKeyId, target.objects.backupKeyId].some(key => sourceKeys.has(key)) || source.network === target.network
      || source.directory === target.directory || source.database.name === target.database.name || source.validationDatabase.name === target.validationDatabase.name
      || source.objects.bucket === target.objects.bucket || source.project === target.project || source.origin !== target.origin || source.port !== target.port
      || source.proxyNetwork !== target.proxyNetwork) throw new Error('Restore must preserve the source and use separate replacement resources behind the fixed origin')
    if (previous.mode !== 'maintenance' || previous.buildId !== request.expectedSourceCurrent || request.acceptLoss !== previous.generation) throw new Error('Source maintenance/current-version and recovery-point loss acceptance are required')
    authorityReceipt(source, previous, request.authorityFile, 'close')
    const point = readPairedPrereleaseBackup(source, request.backupStem, generation(request.backupGeneration))
    const buildId = build(request.buildId), next = generation(request.generation), id = generation(request.operationId)
    if (next === previous.generation) throw new Error('Restoration requires a fresh data/authority generation')
    if (record.operation && (record.operation.id !== id || record.operation.kind !== 'restore' || record.operation.buildId !== buildId
      || record.operation.backupStem !== request.backupStem || record.generation !== next)) throw new Error('Resume the exact replacement restoration operation')
    if (!record.operation && (record.installed || record.buildId)) throw new Error('Restore requires fresh replacement resources')
    const installation = deploymentImage(target, request.action === 'restore-source', buildId, record.operation)
    const { image } = installation
    trustedArchiveImage(target)
    trustedArchiveImage(source)
    const operation: NonNullable<RuntimeRecord['operation']> = record.operation ?? { id, kind: 'restore', buildId, ...installation,
      sourceBuildId: null, sourceImage: null, stage: 'backup', backupStem: request.backupStem, generation: next }
    record = { ...record, generation: next, operation }
    // The replacement gateway must remain stopped until the old generation has been purged and retired.
    writeRuntime(target, record, image)
    mkdirSync(backupRoot(target), { recursive: true, mode: 0o700 })
    const root = join(backupRoot(target), `restore-${id}`)
    if (operation.stage === 'backup') {
      verifyPermissions(target)
      policyTool(target, 'empty')
      command('bash', [join(source.policyDirectory, 'backup-offsite.sh'), 'ledger-only'], { env: backupEnvironment(source, previous), timeout: 1800_000 })
      archiveTool(source, 'capture', ['ledger-export', '/backup/replay-removals.latest.json'])
      command('cp', ['--', join(backupRoot(source), 'replay-removals.latest.json'), join(backupRoot(target), 'replay-removals.latest.json')])
      prepareRestoreStaging(target, point, id, next)
      archiveTool(target, 'migrate', ['ledger-merge', '/backup/replay-removals.latest.json'])
      archiveTool(target, 'tools', ['validate', `/backup/restore-${id}`])
      record.operation = { ...operation, stage: 'migration' }
      writeRuntime(target, record, image)
    }
    if (record.operation?.stage === 'migration') {
      if (!existsSync(root) || !existsSync(`${root}.retention.json`)) prepareRestoreStaging(target, point, id, next)
      // Only this unaccepted replacement is reset on retry; the source is never changed.
      policyTool(target, 'reset', { APPLICATIONS_STOPPED: '1', CURRENT_ERASURE_LEDGER: '/backup/replay-removals.latest.json',
        PRERELEASE_OLD_GENERATION: next, PRERELEASE_OPERATION_ID: id, PRERELEASE_SOURCE_BUILD_ID: buildId })
      archiveTool(target, 'migrate', ['restore', `/backup/restore-${id}`, '--applications-stopped'], {
        CURRENT_ERASURE_LEDGER: '/backup/replay-removals.latest.json',
      })
      record = { ...record, buildId, installed: { buildId, ...installation, installedAt: Date.now() }, operation: { ...operation, stage: 'startup' } }
      writeRuntime(target, record, image)
    }
    removeRestoreStaging(target, id)
    assertCapacity(target, 'app')
    compose(target, ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'app'])
    verifyRunning(target, record)
    record.operation = { ...operation, stage: 'acceptance' }
    writeRuntime(target, record, image)
    return record
  }
  if (request.action === 'activate-recovery') {
    const source = request.sourceTarget
    if (!source || !record.installed || record.operation?.kind !== 'restore' || record.operation.stage !== 'acceptance') throw new Error('A validated isolated restoration is required')
    const previous = readRuntime(source)
    if (previous.mode !== 'closed' || previous.buildId !== request.expectedSourceCurrent || source.origin !== target.origin || source.port !== target.port
      || source.proxyNetwork !== target.proxyNetwork) throw new Error('Purge and retire the old target before switching the fixed maintenance entry')
    authorityReceipt(source, previous, request.retirementFile, 'retire')
    compose(source, ['stop', '--timeout', '30', 'gateway'])
    compose(target, ['up', '-d', '--no-build', 'gateway'])
    return record
  }
  if (request.action === 'reset') {
    if (request.acceptLoss !== record.generation || !record.installed && record.operation?.kind !== 'reset') throw new Error('Reset requires explicit current-generation loss acceptance and a source build')
    authorityReceipt(target, record, request.authorityFile, 'close')
    const id = generation(request.operationId)
    if (record.operation && (record.operation.id !== id || record.operation.kind !== 'reset')) throw new Error('Resume the existing reset operation ID')
    const image = record.installed?.image ?? record.operation?.image
    if (!image || !record.buildId) throw new Error('Reset source identity is missing')
    const source = record.installed?.runtimeDigest ? { runtimeDigest: record.installed.runtimeDigest, sourceRuntimeDigest: record.installed.runtimeDigest } : {}
    const operation = record.operation ?? { id, kind: 'reset', buildId: record.buildId, image, ...source, sourceBuildId: record.buildId, sourceImage: image, stage: 'backup', backupStem: `pre-${id}`, generation: record.generation }
    if (operation.stage === 'acceptance') return record
    record.operation = operation
    record = maintenance(target, record, image)
    verifyPermissions(target)
    capture(target, record, operation.backupStem ?? `pre-${id}`, operation.buildId)
    operation.stage = 'migration'
    writeRuntime(target, record, image)
    archiveTool(target, 'capture', ['ledger-export', '/backup/replay-removals.latest.json'])
    const purge: unknown = JSON.parse(policyTool(target, 'reset', { APPLICATIONS_STOPPED: '1', CURRENT_ERASURE_LEDGER: '/backup/replay-removals.latest.json',
      PRERELEASE_OLD_GENERATION: record.generation, PRERELEASE_OPERATION_ID: id, PRERELEASE_SOURCE_BUILD_ID: operation.buildId }))
    const artifact = join(backupRoot(target), `purge-${id}.json`)
    atomicJson(artifact, purge)
    const purged: RuntimeRecord = { ...record, installed: null, operation: { ...operation, stage: 'acceptance' } }
    writeRuntime(target, purged, image)
    return { ...purged, purgeReceipt: { path: artifact, sha256: hash(artifact) } }
  }
  const source = request.action === 'deploy-source' || request.action === 'backup-source'
  if (!source && request.action !== 'deploy') throw new Error('Unknown prerelease operation')
  const buildId = build(request.buildId)
  if (!record.installed) record.generation = generation(request.generation)
  if (request.action !== 'backup-source') authorityReceipt(target, record, request.authorityFile, 'close')
  const operationId = request.operationId ?? randomUUID()
  if (record.operation && (record.operation.id !== operationId || record.operation.buildId !== buildId || record.operation.kind !== 'deploy')) throw new Error('A pending operation must resume the same fixed SHA, kind and operation ID')
  const installation = deploymentImage(target, source, buildId, record.operation)
  const { image } = installation
  trustedArchiveImage(target)
  if (!record.operation) {
    record.operation = { id: generation(operationId), kind: 'deploy', buildId, ...installation,
      sourceBuildId: record.buildId, sourceImage: record.installed?.image ?? null, stage: 'backup', backupStem: null, generation: record.generation,
      ...(record.installed?.runtimeDigest ? { sourceRuntimeDigest: record.installed.runtimeDigest } : {}),
      ...(source ? { rollbackCompatible: request.rollbackCompatible === true } : {}) }
  }
  const operation = record.operation
  if (source && operation.rollbackCompatible !== (request.rollbackCompatible === true)) throw new Error('Source deployment compatibility proof changed')
  mkdirSync(backupRoot(target), { recursive: true, mode: 0o700 })
  if (request.action === 'backup-source') {
    if (!operation.rollbackCompatible || !record.installed) throw new Error('An online deployment backup requires a compatible installed source')
    if (operation.stage === 'prepared' && operation.backupStem) {
      try {
        const point = inspectPairedPrereleaseBackup(target, operation.backupStem, record.generation)
        if (point.sourceBuildId === operation.sourceBuildId && point.targetBuildId === buildId) return record
      } catch { /* Retention may have removed the pair while the owner window was interrupted. */ }
      operation.stage = 'backup'
      operation.backupStem = `pre-${operation.id}-${randomUUID()}`
    }
    if (operation.stage !== 'backup') return record
    if (record.buildId !== operation.sourceBuildId || record.mode !== 'open' || !record.acceptance) throw new Error('Online backup requires the accepted open source installation')
    verifyRunning(target, record)
    operation.backupStem ??= `pre-${operation.id}`
    writeRuntime(target, record, image)
    verifyPermissions(target)
    capture(target, record, operation.backupStem, buildId, true)
    operation.stage = 'prepared'
    writeRuntime(target, record, image)
    return record
  }
  if (source && operation.stage === 'acceptance') return record
  if (operation.stage === 'prepared') {
    if (!operation.backupStem) throw new Error('Prepared deployment lost its backup')
    const point = inspectPairedPrereleaseBackup(target, operation.backupStem, record.generation)
    if (point.sourceBuildId !== operation.sourceBuildId || point.targetBuildId !== buildId) throw new Error('Prepared backup belongs to another source change')
  }
  if (operation.rollbackCompatible && record.installed && operation.stage === 'backup') throw new Error('Prepare the online backup before closing prerelease')
  record = maintenance(target, record, image)
  verifyPermissions(target)
  if (operation.stage === 'backup') {
    if (record.installed) {
      operation.backupStem ??= `pre-${operation.id}`
      capture(target, record, operation.backupStem, buildId)
    } else policyTool(target, 'empty')
    operation.stage = 'migration'
    record.operation = operation
    writeRuntime(target, record, image)
  }
  if (operation.stage === 'migration' || operation.stage === 'prepared') {
    if (operation.stage === 'migration') archiveTool(target, 'migrate', ['check-live', buildId, '--applications-stopped'])
    record = { ...record, buildId, installed: { buildId, ...installation, installedAt: Date.now() }, operation: { ...operation, stage: 'startup' } }
    writeRuntime(target, record, image)
  }
  try {
    assertCapacity(target, 'app')
    compose(target, ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'app'])
    verifyRunning(target, record)
  } catch (error) {
    if (!source) throw error
    const failure = error instanceof Error ? error.message : 'Source startup failed'
    if (!operation.rollbackCompatible || !operation.sourceBuildId) {
      throw new Error(`${failure}; maintenance remains active. Recovery point: ${operation.backupStem ?? 'initial installation'}`, { cause: error })
    }
    try { rollbackSource(target, record, operationId) }
    catch (rollback) {
      throw new Error(`${failure}; source rollback failed: ${rollback instanceof Error ? rollback.message : rollback}. Recovery point: ${operation.backupStem}`, { cause: rollback })
    }
    throw new Error(`${failure}; restored ${operation.sourceBuildId} in maintenance; verify and reopen that installation`, { cause: error })
  }
  record.operation = { ...operation, stage: 'acceptance' }
  writeRuntime(target, record, image)
  return record
}
