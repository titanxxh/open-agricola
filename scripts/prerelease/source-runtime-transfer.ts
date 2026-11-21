import { createHash, randomUUID } from 'node:crypto'
import { closeSync, createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statfsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { ownerMachine } from '../ci/release-github.ts'
import { assertOwnerPath, assertScopedPaths, parsePrereleaseTarget, type PrereleaseTarget } from './config.ts'
import { assertImageIntakeLimits, imageIntakeCommand } from './image-import-limits.ts'
import { controlDirectory } from './runtime.ts'
import { assertCapacity, command } from './docker.ts'
import { approvedRuntimePin, installedRuntime } from './source-runtime.ts'
import { exportRuntimeArchive } from './source-runtime-archive.ts'

const entry = 'scripts/prerelease/source-runtime-transfer.ts'
const producerRoot = resolve(import.meta.dirname, '../..')
const maxTime = 30 * 60_000
const safeSha = (s: string | undefined) => {
  if (!s || !/^[a-f0-9]{40}$/.test(s)) throw new Error('A fixed source commit is required')
  return s
}

function receiveArgs(args: string[]) {
  const [config, source, policy] = args
  if (!config || config.length > 128 * 1024) throw new Error('Missing owner runtime target')
  const target = parsePrereleaseTarget(JSON.parse(Buffer.from(config, 'base64url').toString()))
  const buildId = safeSha(source)
  if (command('git', ['rev-parse','HEAD'], {cwd: target.policyDirectory}) !== safeSha(policy)) throw new Error('Owner and target policies differ')
  assertScopedPaths(target)
  return {target, buildId}
}

function resolveHostPin(target: PrereleaseTarget, buildId: string) {
  try { command('git', ['--no-replace-objects', 'cat-file', '-e', buildId + '^{commit}'], {cwd:target.policyDirectory}) }
  catch {
    command('git', ['-c', 'core.hooksPath=/dev/null', 'fetch', '--no-tags', '--no-write-fetch-head', 'https://github.com/titanxxh/open-agricola.git', buildId], {cwd:target.policyDirectory, timeout:180000})
  }
  return approvedRuntimePin(target.policyDirectory, buildId)
}

async function receive(args: string[]) {
  const [action, ...fields] = args
  const {target, buildId} = receiveArgs(fields)
  const pin = resolveHostPin(target, buildId)
  const docker = (args: string[]) => command('docker', args)
  if (action === 'probe') { console.log(JSON.stringify(installedRuntime(pin, docker))); return }
  if (action === 'load') {
    mkdirSync(controlDirectory(target), { recursive:true,mode:0o700 })
    const operationId = randomUUID()
    execFileSync('systemd-run', imageIntakeCommand(target, operationId, [entry, 'receive', 'load-locked', ...fields, operationId]), {
      cwd: target.policyDirectory, stdio: 'inherit', timeout: maxTime,
    })
    return
  }
  if (action !== 'load-locked') throw new Error('Unknown owner runtime transfer action')
  assertImageIntakeLimits(target, fields[5])
  for (const row of readdirSync(target.directory, { withFileTypes: true })) {
    if (row.isDirectory() && /^\.runtime-transfer-[A-Za-z0-9]{6}$/.test(row.name)) rmSync(join(target.directory, row.name), { recursive: true })
  }
  const bytes = Number(fields[3]), expectedSha = fields[4]
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > target.budgets.import.maxArchiveMiB * 1048576 || !/^[a-f0-9]{64}$/.test(expectedSha ?? '')) throw new Error('Runtime transfer exceeds configured import limit')
  assertCapacity(target, 'import')
  for (const path of [target.directory, command('docker',['info','--format','{{.DockerRootDir}}'])]) {
    assertOwnerPath(path)
    const fs = statfsSync(path)
    if (fs.bavail * fs.bsize < target.budgets.diskMiB * 1048576 + 4 * bytes) throw new Error('Insufficient free space for runtime image import')
  }
  const scratch = mkdtempSync(join(target.directory,'.runtime-transfer-'))
  try {
    const archive = join(scratch,'runtime.tar')
    let n = 0
    const hash = createHash('sha256')
    await pipeline(process.stdin, new Transform({transform(chunk: Buffer,_encoding,callback) {
      n += chunk.length; hash.update(chunk); callback(n > bytes ? new Error('Runtime transfer exceeds expected size') : null, chunk)
    }}),createWriteStream(archive,{flags:'wx',mode:0o600}))
    if (n !== bytes || hash.digest('hex') !== expectedSha) throw new Error('Incomplete owner runtime transfer')
    command('docker',['load','--platform','linux/amd64','--input',archive],{timeout:maxTime})
    const loaded = installedRuntime(pin,docker)
    if (!loaded.available) throw new Error('Loaded archive did not supply the approved native runtime')
    console.log(JSON.stringify(loaded))
  } finally {rmSync(scratch,{recursive:true,force:true})}
}

function ownerCredential(path: string) {
  assertOwnerPath(path)
  const info = lstatSync(path)
  if (!info.isFile() || info.mode & 0o077 || info.uid !== process.getuid?.() || info.size>8192) throw new Error('Registry credentials must be an owner-private file')
  const raw: unknown = JSON.parse(readFileSync(path,'utf8'))
  if (!raw || typeof raw !== 'object' || !('username' in raw) || typeof raw.username!=='string' || !('token' in raw) || typeof raw.token!=='string' || !raw.token) throw new Error('Expected owner registry username and token')
  return {username:raw.username,token:raw.token}
}

async function transfer(args: string[]) {
  ownerMachine()
  if (args[0]==='receive') {await receive(args.slice(1)); return}
  const {values} = parseArgs({args,options:{config:{type:'string'},sha:{type:'string'},ssh:{type:'string'},'auth-file':{type:'string'}}})
  if (!values.config) throw new Error('--config is required')
  const target = parsePrereleaseTarget(JSON.parse(readFileSync(values.config,'utf8')))
  const buildId = safeSha(values.sha)
  const pin = approvedRuntimePin(producerRoot,buildId)
  const policy = command('git',['rev-parse','HEAD'],{cwd:producerRoot})
  const fields = [Buffer.from(JSON.stringify(target)).toString('base64url'),buildId,policy]
  const host = values.ssh
  if (host && !/^[a-zA-Z0-9][a-zA-Z0-9@_.-]*$/.test(host)) throw new Error('Invalid owner SSH target')
  const call = (actionArgs: string[], stdin?: number) => {
    const words = ['node','--import','./scripts/typescript-runtime.mjs',entry,'receive',actionArgs[0],...fields,...actionArgs.slice(1)]
    return execFileSync(host?'ssh':'node',host?['-o','BatchMode=yes','--',host,'cd '+target.policyDirectory+' && exec '+words.join(' ')]:words.slice(1),
      {cwd:host?producerRoot:target.policyDirectory,encoding:'utf8',stdio:[stdin??'ignore','pipe','inherit'],timeout:maxTime}).trim()
  }
  const probe: unknown = JSON.parse(call(['probe']))
  if (probe && typeof probe==='object' && 'available' in probe && probe.available===true) return
  const auth = values['auth-file']
  if (!auth || !existsSync(auth)) throw new Error('The runtime is absent. Supply the owner-only GHCR --auth-file for the first transfer.')
  const scratch = mkdtempSync(join(tmpdir(),'oa-pre-runtime-'))
  try {
    const archive = await exportRuntimeArchive(pin,ownerCredential(resolve(auth)),scratch,target.budgets.import.maxArchiveMiB * 1048576)
    const hash = createHash('sha256')
    for await (const part of createReadStream(archive)) hash.update(part)
    const fd = openSync(archive,'r')
    try {call(['load',String(lstatSync(archive).size),hash.digest('hex')],fd)} finally {closeSync(fd)}
  } finally {rmSync(scratch,{recursive:true,force:true})}
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  transfer(process.argv.slice(2)).catch(error=>{console.error(error instanceof Error?error.message:'Runtime transfer failed'); process.exitCode=1})
}
