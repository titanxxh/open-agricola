import { createServer } from 'node:http'
import { once } from 'node:events'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { nativeStorageGuard, parseStorageGuardConfig } from '../prerelease/storage-guard-native'
import { provisionedObjectPolicies } from './fixtures/prerelease-object-policies'

it.each(['normal', 'postgres-failure', 'foreign-container', 'control-unwritable', 'guard-lock-unwritable',
  'policy-reordered', 'policy-null-fields', 'policy-app-grant-change', 'policy-backup-resource-change'])('checks storage admission and scoped stops for %s', async fault => {
  const root = mkdtempSync(join(tmpdir(), 'oa-native-guard-')), calls: string[] = [], status = new Map<string, string>()
  const policyResponse = (role: 'app' | 'backup') => {
    const policy = provisionedObjectPolicies[role].document
    if (fault === 'policy-reordered') return { ...policy, Statement: [...policy.Statement].reverse().map(statement => ({
      ...statement, Action: [...statement.Action].reverse(), Resource: statement.Resource ? [...statement.Resource].reverse() : undefined,
      Condition: statement.Condition ? { StringLike: { 's3:prefix': Array.isArray(statement.Condition.StringLike['s3:prefix'])
        ? [...statement.Condition.StringLike['s3:prefix']].reverse() : statement.Condition.StringLike['s3:prefix'] } } : undefined,
    })) }
    if (fault === 'policy-null-fields') return { ...policy, Id: null, Statement: policy.Statement.map(statement => ({
      ...statement, NotAction: null, Condition: statement.Condition ?? null,
    })) }
    if (fault === 'policy-app-grant-change' && role === 'app') return { ...policy, Statement: policy.Statement.map(statement =>
      statement.Sid === 'DenyAdmin' ? { ...statement, Effect: 'Allow' } : statement) }
    if (fault === 'policy-backup-resource-change' && role === 'backup') return { ...policy, Statement: policy.Statement.map(statement =>
      statement.Sid === 'ScratchObjects' ? { ...statement, Resource: ['arn:aws:s3:::oa-prerelease-main/*'] } : statement) }
    return policy
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture'); calls.push(`${req.method} ${url.pathname}${url.search}`)
    expect(req.headers.authorization).toContain('Credential=root/')
    if (url.pathname.includes('/user-info')) res.end(JSON.stringify({ policyName: url.searchParams.get('accessKey') === target.objects.appKeyId ? 'app' : 'backup', status: status.get(url.searchParams.get('accessKey') ?? '') ?? 'enabled', memberOf: [] }))
    else if (url.pathname.includes('/info-canned-policy')) res.end(JSON.stringify({ policy: policyResponse(url.searchParams.get('name') === 'app' ? 'app' : 'backup') }))
    else if (url.pathname.includes('/get-bucket-quota')) res.end(JSON.stringify({ quota: 1000 }))
    else if (url.pathname.includes('/set-user-status')) { status.set(url.searchParams.get('accessKey') ?? '', url.searchParams.get('status') ?? ''); res.end('{}') }
    else if (url.searchParams.has('versioning')) res.end('<VersioningConfiguration/>')
    else if (url.searchParams.has('uploadId')) res.end('<ListPartsResult><IsTruncated>false</IsTruncated><Part><PartNumber>1</PartNumber><Size>13</Size></Part></ListPartsResult>')
    else if (url.searchParams.has('uploads')) res.end('<ListMultipartUploadsResult><IsTruncated>false</IsTruncated><Upload><Key>test/incomplete</Key><UploadId>upload1</UploadId></Upload></ListMultipartUploadsResult>')
    else res.end('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>live/game</Key><Size>5</Size></Contents><Contents><Key>test/archive</Key><Size>7</Size></Contents></ListBucketResult>')
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  const target = parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')), directory: join(root, 'open-agricola-prerelease-main') })
  mkdirSync(target.directory); mkdirSync(join(root, 'bin'))
  const roles = [target.database.appRole, target.database.backupRole, target.validationDatabase.role], operationId = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  const privateFile = (name: string, value: unknown) => { const path = join(root, name); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), { mode: 0o600 }); return path }
  const input = { format: 1, fingerprint: targetFingerprint(target), leaseMs: 60_000, intervalMs: 5000, probeTimeoutMs: 10_000,
    databaseJournal: privateFile('database.json', { format: 1, operationId, systemIdentifier: '123', targetDirectory: target.directory, passwords: Object.fromEntries(roles.map(role => [role, 'private'])) }),
    objectJournal: privateFile('objects.json', { format: 1, bucket: target.objects.bucket, prefix: 'live/', ownedUsers: { app: true, backup: true },
      app: { accessKey: target.objects.appKeyId }, backup: { accessKey: target.objects.backupKeyId }, policyHashes: { app: provisionedObjectPolicies.app.sha256, backup: provisionedObjectPolicies.backup.sha256 } }),
    rootEnvironmentFile: privateFile('root.env', 'LOCAL_S3_ACCESS_KEY=root\nLOCAL_S3_SECRET_KEY=fixture-private\n'),
    objectEndpoint: `http://127.0.0.1:${address.port}`, postgresContainer: 'a'.repeat(64), postgresAdmin: 'owner', tempFileLimitBytes: 1024,
    filesystems: [root, target.directory], limits: { sourceDatabaseBytes: 1000, validationDatabaseBytes: 1000, bucketBytes: 1000, multipartBytes: 1000,
      localBytes: 1_000_000, offsiteBytes: 1000, hostFreeBytes: 1, hostFreeInodes: 1, offsiteFreeBytes: 1, offsiteFreeInodes: 1, operationReserveBytes: 1 } }
  const nativeCalls = join(root, 'calls'), stateFile = join(root, 'stopped'), failureFile = join(root, 'fail-postgres')
  const databases = [{ name: target.database.name, owner: target.database.appRole, marker: `oa-1662-db-bootstrap:${operationId}`, bytes: '101' },
    { name: target.validationDatabase.name, owner: target.validationDatabase.role, marker: `oa-1662-db-bootstrap:${operationId}`, bytes: '202' }]
  writeFileSync(join(root, 'bin/docker'), `#!${process.execPath}
const fs=require('node:fs'),args=process.argv.slice(2),query=args[0]==='exec'?fs.readFileSync(0,'utf8'):'';
fs.appendFileSync(${JSON.stringify(nativeCalls)},JSON.stringify({args,query})+'\\n');
if(query.includes('pg_control_system')&&fs.existsSync(${JSON.stringify(failureFile)}))process.exit(42);
if(query.includes('pg_control_system'))process.stdout.write(JSON.stringify({systemIdentifier:'123',roles:${JSON.stringify(roles)}.map(name=>({name,marker:${JSON.stringify(`oa-1662-db-bootstrap:${operationId}`)},elevated:false,formal:false,canSetTemp:false,login:!fs.existsSync(${JSON.stringify(stateFile)}),tempBytes:'1024'})),databases:${JSON.stringify(databases)}}));
else if(query.includes('ALTER ROLE'))fs.writeFileSync(${JSON.stringify(stateFile)},'stopped');
else if(query.includes('count(*)'))process.stdout.write('0');
else if(args[0]==='ps'&&args.join(' ').includes('com.docker.compose.project'))process.stdout.write('b'.repeat(64));
else if(args[0]==='inspect'&&args.includes('{{json .}}'))process.stdout.write(JSON.stringify({Config:{Labels:{'com.docker.compose.project':${JSON.stringify(fault === 'foreign-container' ? 'open-agricola' : target.project)},'com.docker.compose.service':'app','org.open-agricola.environment':${JSON.stringify(target.targetId)}}}}));
else if(args[0]==='inspect')process.stdout.write('false');
`, { mode: 0o700 })
  writeFileSync(join(root, 'bin/ssh'), '#!/bin/sh\ncat >/dev/null\nprintf "17 /exclusive/pre\\n100 4096 500\\n"\n', { mode: 0o700 })
  vi.stubEnv('PATH', `${join(root, 'bin')}:${process.env.PATH}`)
  try {
    const native = nativeStorageGuard(target, parseStorageGuardConfig(target, input))
    if (fault === 'policy-app-grant-change' || fault === 'policy-backup-resource-change') {
      await expect(native.observe()).rejects.toThrow('Guard object policy differs from private ownership journal')
      expect(calls.some(call => call.startsWith('PUT'))).toBe(false)
      expect(readFileSync(nativeCalls, 'utf8')).not.toContain('ALTER ROLE')
      return
    }
    const measured = await native.observe()
    expect(measured).toMatchObject({ sourceDatabaseBytes: 101, validationDatabaseBytes: 202, bucketBytes: 12, multipartBytes: 13,
      offsiteBytes: 17, offsiteFreeBytes: 409600, offsiteFreeInodes: 500 })
    if (fault === 'postgres-failure') writeFileSync(failureFile, 'failed')
    if (fault === 'control-unwritable' || fault === 'guard-lock-unwritable') {
      const { storageGuard } = await import('../prerelease/storage-guard-cli')
      const targetFile = privateFile('target.json', target), guardFile = privateFile('guard.json', input)
      const control = join(target.directory, 'control'); mkdirSync(control); chmodSync(control, 0o500)
      const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
      try {
        if (fault === 'control-unwritable') {
          vi.stubEnv('PRERELEASE_GUARD_LOCK', targetFingerprint(target))
          await storageGuard(['_trip', targetFile, guardFile])
        } else await expect(storageGuard(['trip', targetFile, guardFile])).rejects.toThrow('independent stops were attempted')
        const receipt = JSON.parse(String(output.mock.calls[0][0]))
        expect(receipt).toMatchObject({ status: 'latched', failures: [] })
        expect(receipt.persistenceFailures).toEqual(fault === 'control-unwritable' ? ['latch', 'stop-receipt'] : ['guard-lock'])
      } finally { output.mockRestore(); chmodSync(control, 0o700) }
    } else expect(await native.stop()).toEqual(fault === 'postgres-failure' ? ['postgres-roles'] : fault === 'foreign-container' ? ['target-containers'] : [])
    expect([...status.values()]).toEqual(['disabled', 'disabled'])
    if (fault !== 'postgres-failure') {
      await expect(native.observe()).rejects.toThrow('login/temp-file')
      expect(await native.observe('diagnostic')).toMatchObject({ sourceDatabaseBytes: 101, bucketBytes: 12, multipartBytes: 13 })
    }
    const requests = readFileSync(nativeCalls, 'utf8')
    if (fault !== 'postgres-failure') {
      expect(requests).toContain('pg_terminate_backend(pid,5000)')
      expect(requests).toContain('NOLOGIN')
    }
    if (fault === 'foreign-container') expect(requests).not.toContain('["stop"')
    expect(requests).not.toMatch(/ALTER ROLE \\"agricola|stop.*[a]{64}|restart|system prune/)
    expect(calls.filter(call => call.startsWith('PUT'))).toHaveLength(2)
    expect(calls.some(call => /\/agricola(?:\?|$)/.test(call))).toBe(false)
  } finally {
    vi.unstubAllEnvs(); await new Promise<void>(done => server.close(() => done())); rmSync(root, { recursive: true, force: true })
  }
})
