import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream, lstatSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { ownerMachine } from './candidate.ts'
import { assertVerifiedContainerImageReceipt, parseContainerImageReceipt, type ContainerImageTransfer, type VerifiedContainerImageReceipt } from './container-images.ts'
import { inspectLoadedContainerImage, validateContainerImageArchive } from './container-images-archive.ts'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner image input')
  return Object.fromEntries(Object.entries(value))
}
function ownerPath(path: string, directory: boolean): void {
  if (resolve(path) !== path) throw new Error('Expected an absolute owner image path')
  for (let current = path; ; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error('Owner image path contains a symlink')
    if (dirname(current) === current) break
  }
  const info = lstatSync(path)
  if (info.uid !== process.getuid?.() || info.mode & 0o077 || (directory ? !info.isDirectory() : !info.isFile())) throw new Error('Image files and credentials must be owner-private')
}

export async function prepareContainerImageArchive({ receipt: verified, authFile, directory, maxBytes }: {
  receipt: VerifiedContainerImageReceipt; authFile: string; directory: string; maxBytes: number
}): Promise<{ archivePath: string; transfer: ContainerImageTransfer }> {
  ownerMachine(); assertVerifiedContainerImageReceipt(verified)
  const receipt = parseContainerImageReceipt(verified)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('An explicit owner archive byte limit is required')
  mkdirSync(directory, { recursive: true, mode: 0o700 }); ownerPath(directory, true); ownerPath(authFile, false)
  let username: string, token: string
  try {
    if (lstatSync(authFile).size > 8192) throw new Error()
    const auth = object(JSON.parse(readFileSync(authFile, 'utf8')))
    if (Object.keys(auth).sort().join(',') !== 'token,username' || typeof auth.username !== 'string' || !/^[A-Za-z0-9-]+$/.test(auth.username)
      || typeof auth.token !== 'string' || !auth.token || /[\s\0]/.test(auth.token)) throw new Error()
    username = auth.username; token = auth.token
  } catch { throw new Error('Invalid private registry credential file; expected username and token') }
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) if (process.env[key]) env[key] = process.env[key]
  const invoke = (args: string[], input?: string, timeout = 30_000): string => {
    try { return execFileSync('docker', args, { env, input, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim() }
    catch { throw new Error('Owner registry/image command failed; no credential was forwarded to the target') }
  }
  const context: unknown = JSON.parse(invoke(['context', 'inspect']))
  if (!Array.isArray(context) || context.length !== 1) throw new Error('Expected one local owner Docker context')
  const socket = object(object(object(context[0]).Endpoints).docker).Host
  if (typeof socket !== 'string' || !/^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(socket)
    || process.env.DOCKER_HOST && process.env.DOCKER_HOST !== socket) throw new Error('Registry authentication requires a local Unix-socket Docker daemon')
  delete env.DOCKER_HOST; delete env.DOCKER_CONTEXT; delete env.DOCKER_CONFIG
  const operation = mkdtempSync(join(directory, 'image-')), authDirectory = mkdtempSync(join(operation, 'docker-auth-'))
  const prefix = ['--config', authDirectory, '--host', socket], reference = `${receipt.registryRepository}@${receipt.manifestDigest}`
  const partial = join(operation, 'image.tar.partial'), archivePath = join(operation, 'image.tar')
  try {
    invoke([...prefix, 'login', 'ghcr.io', '--username', username, '--password-stdin'], token + '\n')
    invoke([...prefix, 'pull', '--platform', 'linux/amd64', reference], undefined, 15 * 60_000)
    const pulled: unknown = JSON.parse(invoke([...prefix, 'image', 'inspect', reference]))
    if (!Array.isArray(pulled) || pulled.length !== 1) throw new Error('Expected one pulled image')
    const image = object(pulled[0]), digests = image.RepoDigests
    if (image.Id !== receipt.imageId || !Array.isArray(digests) || !digests.includes(reference)) throw new Error('Pulled registry manifest does not match the verified image ID')
    inspectLoadedContainerImage({ imageId: receipt.imageId, expected: receipt }, args => invoke([...prefix, ...args]))
    const child = spawn('docker', [...prefix, 'image', 'save', '--platform', 'linux/amd64', receipt.imageId], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stderr.resume()
    const completed = new Promise<boolean>(resolve => { child.once('error', () => resolve(false)); child.once('close', code => resolve(code === 0)) })
    const timer = setTimeout(() => child.kill('SIGKILL'), 15 * 60_000); timer.unref()
    let bytes = 0
    try {
      await pipeline(child.stdout, new Transform({ transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length
        callback(bytes > maxBytes ? new Error('Owner image export exceeded its byte limit') : null, bytes > maxBytes ? undefined : chunk)
      } }), createWriteStream(partial, { flags: 'wx', mode: 0o600 }))
      if (!await completed) throw new Error('Owner image export was interrupted')
    } catch (error) { child.kill('SIGKILL'); await completed; throw error }
    finally { clearTimeout(timer) }
    const archive = validateContainerImageArchive({ archivePath: partial, imageId: receipt.imageId, sourceSha: receipt.sourceSha, channel: receipt.channel, maxBytes })
    renameSync(partial, archivePath)
    const transfer: ContainerImageTransfer = { format: 1, receipt, archive }
    writeFileSync(join(operation, 'transfer.json'), JSON.stringify(transfer) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    return { archivePath, transfer }
  } finally { rmSync(authDirectory, { recursive: true, force: true }) }
}
