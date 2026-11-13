import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it, vi } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { nativeStorageGuard, parseStorageGuardConfig } from '../prerelease/storage-guard-native'

it.each(['normal', 'postgres-failure', 'foreign-container'])('measures complete storage and stops only owned identities despite %s', async fault => {
  const root = mkdtempSync(join(tmpdir(), 'oa-native-guard-')), calls: string[] = [], status = new Map<string, string>()
  const policy = { Statement: [], Version: '2012-10-17' }, policyHash = createHash('sha256').update(JSON.stringify(policy)).digest('hex')
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture'); calls.push(`${req.method} ${url.pathname}${url.search}`)
    expect(req.headers.authorization).toContain('Credential=root/')
    if (url.pathname.includes('/user-info')) res.end(JSON.stringify({ policyName: 'owned-policy', status: status.get(url.searchParams.get('accessKey') ?? '') ?? 'enabled', memberOf: [] }))
    else if (url.pathname.includes('/info-canned-policy')) res.end(JSON.stringify({ policy }))
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
      app: { accessKey: target.objects.appKeyId }, backup: { accessKey: target.objects.backupKeyId }, policyHashes: { app: policyHash, backup: policyHash } }),
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
  writeFileSync(join(root, 'bin/ssh'), '#!/bin/sh\nprintf "17 /exclusive/pre\\n100 4096 500\\n"\n', { mode: 0o700 })
  vi.stubEnv('PATH', `${join(root, 'bin')}:${process.env.PATH}`)
  try {
    const native = nativeStorageGuard(target, parseStorageGuardConfig(target, input))
    const measured = await native.observe()
    expect(measured).toMatchObject({ sourceDatabaseBytes: 101, validationDatabaseBytes: 202, bucketBytes: 12, multipartBytes: 13,
      offsiteBytes: 17, offsiteFreeBytes: 409600, offsiteFreeInodes: 500 })
    if (fault === 'postgres-failure') writeFileSync(failureFile, 'failed')
    expect(await native.stop()).toEqual(fault === 'normal' ? [] : [fault === 'postgres-failure' ? 'postgres-roles' : 'target-containers'])
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
