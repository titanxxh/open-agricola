import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertScopedPaths, loadPrereleaseEnvironment, type PrereleaseTarget, targetFingerprint } from './config'
import { atomicJson, controlDirectory, readRuntime, recordPath, writeRuntime, type RuntimeRecord } from './runtime'
import { archiveTool, assertCapacity, backupEnvironment, backupRoot, buildImage, candidateTool, command, compose, inspectImage, policyTool, stopWriters, verifyPermissions, verifyRunning } from './docker'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import { extractPairedPrereleaseBackup, readPairedPrereleaseBackup } from './backup'
import { compareIdentityRefs } from './identity-manifest'

export type OperationRequest = { action: string; expectedCurrent: string; buildId?: string; generation?: string; nextGeneration?: string;
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

function capture(target: PrereleaseTarget, record: RuntimeRecord, stem: string, destination: string): void {
  if (!record.installed) throw new Error('There is no source build to capture')
  const report = join(backupRoot(target), `${stem}.manifest.json`)
  const env = backupEnvironment(target, record)
  if (!existsSync(report)) command('bash', [join(target.policyDirectory, 'scripts/backup-storage.sh'), stem, '--already-stopped'], { env, timeout: 30 * 60 * 1000 })
  verifyBackup(target, stem, record.installed.buildId, destination)
  command('bash', [join(target.policyDirectory, 'backup-offsite.sh'), 'sync-only'], { env, timeout: 30 * 60 * 1000 })
}

/** Only admission opens here; health alone never creates an acceptance receipt. */
export function runPrereleaseOperation(target: PrereleaseTarget, request: OperationRequest) {
  assertScopedPaths(target)
  if (request.action !== 'retention') loadPrereleaseEnvironment(target)
  let record = readRuntime(target)
  if (request.expectedCurrent !== (record.buildId ?? 'empty')
    && (!record.operation || request.expectedCurrent !== (record.operation.sourceBuildId ?? 'empty'))) throw new Error('Prerelease expected-current lease changed')
  if (record.mode === 'closed' && !['status', 'retention', 'reinitialize', 'finish-close'].includes(request.action)) throw new Error('Retired targets require fresh resources and a new generation')
  if (request.action === 'status') return record
  if (request.action === 'retention') {
    command('node', [join(target.policyDirectory, 'scripts/backup-files.mjs'), 'prune', backupRoot(target), '7', '1000000'], { env: { BACKUP_RETENTION_DAYS: '7' } })
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
  if (request.action === 'maintain') {
    authorityReceipt(target, record, request.authorityFile, 'close')
    return maintenance(target, record)
  }
  if (request.action === 'backup') {
    if (!record.installed || record.operation) throw new Error('Online backup requires a complete installed deployment')
    assertCapacity(target)
    verifyRunning(target, record)
    verifyPermissions(target)
    writeRuntime(target, record)
    command('bash', [join(target.policyDirectory, 'backup-offsite.sh')], { env: backupEnvironment(target, record), timeout: 30 * 60 * 1000 })
    return { channel: 'prerelease', targetId: target.targetId, mode: 'online', generation: record.generation }
  }
  if (request.action === 'budget-check') {
    try {
      const usage = JSON.parse(policyTool(target, 'budget')) as unknown
      if (!usage || typeof usage !== 'object' || !('databaseBytes' in usage) || typeof usage.databaseBytes !== 'number'
        || !('objectBytes' in usage) || typeof usage.objectBytes !== 'number') throw new Error('Invalid measured storage usage')
      const local = Number(command('du', ['-sx', '--block-size=1', target.directory]).split(/\s/)[0])
      if (local + usage.databaseBytes + usage.objectBytes > target.budgets.diskMiB * 1024 * 1024) throw new Error('Prerelease storage budget exceeded')
      assertCapacity(target)
      return { ...usage, localBytes: local }
    } catch (error) {
      writeRuntime(target, { ...record, mode: 'maintenance', acceptance: null })
      throw error
    }
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
      generation: record.generation, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 })
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
    candidateTool(target, 'migrate', ['scripts/prerelease/identity-audit.ts', 'apply', `/backup/identity-associations-${record.generation}.json`])
    const manifest = jsonText(policyTool(target, 'identities'))
    if (canonicalJson(manifest.refs) !== canonicalJson(unique)) throw new Error('Real cleanup/remap did not produce the exact retained active identity set')
    compose(target, ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'app'])
    verifyRunning(target, record)
    const artifact = join(controlDirectory(target), `identity-verified-${record.generation}.json`)
    atomicJson(artifact, { format: 1, targetFingerprint: targetFingerprint(target), generationId: record.generation,
      buildId: record.buildId, operationId: record.operation?.id, identityManifestSha256: manifest.identityManifestSha256, identityCount: manifest.identityCount,
      sourcePacketSha256: hash(request.associationsFile), verifiedAt: Date.now() })
    return { path: artifact, verificationReceiptSha256: hash(artifact), identityManifestSha256: manifest.identityManifestSha256, identityCount: manifest.identityCount }
  }
  if (request.action === 'open') {
    if (request.buildId !== record.buildId) throw new Error('Opening requires the installed candidate SHA receipt')
    if (!record.installed || !record.operation || record.operation.kind === 'reset' || record.operation.stage !== 'acceptance' || !request.acceptanceFile) throw new Error('Complete target acceptance is required before opening')
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
    const acceptance = json(request.acceptanceFile)
    if (acceptance.format !== 1 || acceptance.channel !== 'prerelease' || acceptance.targetId !== target.targetId
      || acceptance.targetFingerprint !== targetFingerprint(target) || acceptance.buildId !== record.buildId
      || acceptance.image !== record.installed.image || acceptance.generation !== record.generation || acceptance.operationId !== record.operation.id
      || typeof acceptance.acceptedAt !== 'number' || acceptance.acceptedAt > Date.now() || Date.now() - acceptance.acceptedAt > 30 * 60_000
      || !acceptance.evidence || typeof acceptance.evidence !== 'object') throw new Error('Acceptance belongs to a different target, operation, build or generation')
    const required = ['identity', 'beta-access', 'http-ws', 'public-cards', 'viewer', 'retained-data', 'deletion-audit', 'capacity', 'formal-unaffected']
    for (const name of required) {
      if (!(name in acceptance.evidence)) throw new Error(`Missing owner acceptance evidence: ${name}`)
      const entry: unknown = Reflect.get(acceptance.evidence, name)
      if (!entry || typeof entry !== 'object' || !('path' in entry) || typeof entry.path !== 'string'
        || !('sha256' in entry) || entry.sha256 !== hash(entry.path) || statSync(entry.path).size === 0) throw new Error(`Acceptance artifact failed verification: ${name}`)
    }
    verifyRunning(target, record)
    const opened: RuntimeRecord = { ...record, mode: 'open', operation: null, acceptance: { acceptedAt: acceptance.acceptedAt, sha256: hash(request.acceptanceFile) } }
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
  if (request.action === 'restore') {
    const source = request.sourceTarget
    if (!source || !request.backupStem || !request.backupGeneration) throw new Error('Restore requires an explicit paired point and fresh isolated replacement target')
    loadPrereleaseEnvironment(source)
    const previous = readRuntime(source)
    const sourceRoles = new Set([source.database.appRole, source.database.backupRole, source.validationDatabase.role])
    const sharedRoles = [target.database.appRole, target.database.backupRole, target.validationDatabase.role].some(role => sourceRoles.has(role))
    const sourceKeys = new Set([source.objects.appKeyId, source.objects.backupKeyId])
    if (sharedRoles || [target.objects.appKeyId, target.objects.backupKeyId].some(key => sourceKeys.has(key)) || source.network === target.network
      || source.directory === target.directory || source.database.name === target.database.name || source.validationDatabase.name === target.validationDatabase.name
      || source.objects.bucket === target.objects.bucket || source.project === target.project || source.origin !== target.origin || source.port !== target.port) throw new Error('Restore must preserve the source and use separate replacement resources behind the fixed origin')
    if (previous.mode !== 'maintenance' || previous.buildId !== request.expectedSourceCurrent || request.acceptLoss !== previous.generation) throw new Error('Source maintenance/current-version and recovery-point loss acceptance are required')
    authorityReceipt(source, previous, request.authorityFile, 'close')
    const point = readPairedPrereleaseBackup(source, request.backupStem, generation(request.backupGeneration))
    const buildId = build(request.buildId), next = generation(request.generation), id = generation(request.operationId)
    if (next === previous.generation) throw new Error('Restoration requires a fresh data/authority generation')
    if (record.operation && (record.operation.id !== id || record.operation.kind !== 'restore' || record.operation.buildId !== buildId
      || record.operation.backupStem !== request.backupStem || record.generation !== next)) throw new Error('Resume the exact replacement restoration operation')
    if (!record.operation && (record.installed || record.buildId)) throw new Error('Restore requires fresh replacement resources')
    assertCapacity(target)
    const image = record.operation?.image ?? buildImage(target, buildId)
    inspectImage(image, buildId)
    const operation: NonNullable<RuntimeRecord['operation']> = record.operation ?? { id, kind: 'restore', buildId, image,
      sourceBuildId: null, stage: 'backup', backupStem: request.backupStem, generation: next }
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
      rmSync(root, { recursive: true, force: true })
      extractPairedPrereleaseBackup(target, point.archive, point.archiveSha256, root)
      archiveTool(target, 'migrate', ['ledger-merge', '/backup/replay-removals.latest.json'])
      archiveTool(target, 'tools', ['validate', `/backup/restore-${id}`])
      record.operation = { ...operation, stage: 'migration' }
      writeRuntime(target, record, image)
    }
    if (record.operation?.stage === 'migration') {
      // Only this unaccepted replacement is reset on retry; the source is never changed.
      policyTool(target, 'reset', { APPLICATIONS_STOPPED: '1', CURRENT_ERASURE_LEDGER: '/backup/replay-removals.latest.json',
        PRERELEASE_OLD_GENERATION: next, PRERELEASE_OPERATION_ID: id, PRERELEASE_SOURCE_BUILD_ID: buildId })
      archiveTool(target, 'migrate', ['restore', `/backup/restore-${id}`, '--applications-stopped'], [
        '-e', 'CURRENT_ERASURE_LEDGER=/backup/replay-removals.latest.json',
      ])
      record = { ...record, buildId, installed: { buildId, image, installedAt: Date.now() }, operation: { ...operation, stage: 'startup' } }
      writeRuntime(target, record, image)
    }
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
    if (previous.mode !== 'closed' || previous.buildId !== request.expectedSourceCurrent || source.origin !== target.origin || source.port !== target.port) throw new Error('Purge and retire the old target before switching the fixed maintenance entry')
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
    const operation = record.operation ?? { id, kind: 'reset', buildId: record.buildId, image, sourceBuildId: record.buildId, stage: 'backup', backupStem: `pre-${id}`, generation: record.generation }
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
  if (request.action !== 'deploy') throw new Error('Unknown prerelease operation')
  const buildId = build(request.buildId)
  if (!record.installed) record.generation = generation(request.generation)
  authorityReceipt(target, record, request.authorityFile, 'close')
  const operationId = request.operationId ?? randomUUID()
  if (record.operation && (record.operation.id !== operationId || record.operation.buildId !== buildId || record.operation.kind !== request.action)) throw new Error('A pending operation must resume the same fixed SHA, kind and operation ID')
  const image = record.operation?.image ?? buildImage(target, buildId)
  inspectImage(image, buildId)
  if (!record.operation) {
    record.operation = { id: generation(operationId), kind: request.action, buildId, image, sourceBuildId: record.buildId, stage: 'backup', backupStem: null,
      generation: record.generation }
  }
  const operation = record.operation
  mkdirSync(backupRoot(target), { recursive: true, mode: 0o700 })
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
  if (operation.stage === 'migration') {
    archiveTool(target, 'migrate', ['check-live', buildId, '--applications-stopped'])
    record = { ...record, buildId, installed: { buildId, image, installedAt: Date.now() }, operation: { ...operation, stage: 'startup' } }
    writeRuntime(target, record, image)
  }
  compose(target, ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'app'])
  verifyRunning(target, record)
  record.operation = { ...operation, stage: 'acceptance' }
  writeRuntime(target, record, image)
  return record
}
