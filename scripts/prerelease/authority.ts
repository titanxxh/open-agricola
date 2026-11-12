import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { request } from 'node:https'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicJson } from './runtime'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import { ownerMachine } from '../release/candidate'
import { assertOwnerPath, parsePrereleaseTarget, targetFingerprint, type PrereleaseTarget } from './config'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid authority response')
  return Object.fromEntries(Object.entries(value))
}
const uuid = (value: string | undefined): string => {
  if (!value || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new Error('Explicit canonical lifecycle UUID required')
  return value
}
const file = (path: string) => object(JSON.parse(readFileSync(path, 'utf8')))

/** Formal admin credentials remain on the owner machine, outside every candidate mount. */
export async function requestAuthorityLifecycle(target: PrereleaseTarget, cookieFile: string, body: Record<string, unknown>, ca?: Buffer): Promise<Record<string, unknown>> {
  ownerMachine()
  const path = resolve(cookieFile)
  assertOwnerPath(path)
  if (path === target.directory || path.startsWith(`${target.directory}${sep}`) || statSync(path).mode & 0o077) throw new Error('Formal owner cookie must stay private and outside the prerelease target')
  const cookie = readFileSync(path, 'utf8').trim()
  if (!/^__Host-oa-session=[A-Za-z0-9._~-]+$/.test(cookie)) throw new Error('Invalid formal owner cookie file')
  if (body.targetOrigin !== undefined && body.targetOrigin !== target.origin) throw new Error('Wrong authority lifecycle target')
  const input = JSON.stringify({ ...body, protocolVersion: 1, channel: 'prerelease', targetOrigin: target.origin })
  return new Promise((done, reject) => {
    const outgoing = request(new URL('/api/admin/prerelease-identity/lifecycle', target.formal.apiOrigin), {
      method: 'POST', ca, timeout: 15000, headers: { Origin: target.formal.appOrigin, Cookie: cookie, [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION), 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input) },
    }, response => {
      let text = ''
      response.on('data', chunk => {
        text += chunk.toString()
        if (Buffer.byteLength(text) > 256 * 1024) outgoing.destroy(new Error('Authority response is too large'))
      })
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error(`Formal lifecycle request failed (${response.statusCode ?? 0})`)
          const result = object(JSON.parse(text)), receipt = object(result.receipt)
          if (result.ok !== true || receipt.action !== body.action || receipt.generationId !== body.generationId || receipt.operationId !== body.operationId
            || receipt.targetOrigin !== target.origin || receipt.targetId !== target.targetId) throw new Error('Authority lifecycle receipt binding mismatch')
          done(result)
        } catch (error) { reject(error) }
      })
      response.on('error', reject)
    })
    outgoing.on('timeout', () => outgoing.destroy(new Error('Formal lifecycle request timed out')))
    outgoing.on('error', () => reject(new Error('Formal lifecycle connection failed')))
    outgoing.end(input)
  })
}

const batchId = (operationId: string, index: number): string => {
  const bytes = createHash('sha256').update(`${operationId}:${index}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128
  const value = bytes.toString('hex')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

export async function authorityCommand(args: string[]): Promise<void> {
  const flags = new Map<string, string>()
  const names = ['--config', '--cookie-file', '--generation', '--operation-id', '--previous-generation', '--manifest', '--verification', '--audit', '--purge', '--output']
  for (let index = 1; index < args.length; index += 2) {
    if (!names.includes(args[index]) || !args[index + 1] || flags.has(args[index])) throw new Error('Unknown or incomplete authority option')
    flags.set(args[index], args[index + 1])
  }
  const required = (key: string) => {
    const value = flags.get(key)
    if (!value) throw new Error(`Missing ${key}`)
    return value
  }
  const target = parsePrereleaseTarget(file(required('--config')))
  const cookie = required('--cookie-file'), generationId = uuid(required('--generation')), operationId = uuid(required('--operation-id'))
  const common = { action: args[0], generationId, operationId }
  let result: Record<string, unknown>
  if (args[0] === 'associate') {
    const manifest = file(required('--manifest'))
    if (manifest.targetFingerprint !== targetFingerprint(target) || manifest.generationId !== generationId || !Array.isArray(manifest.refs)
      || manifest.identityManifestSha256 !== createHash('sha256').update(canonicalJson(manifest.refs)).digest('hex')) throw new Error('Native identity manifest binding mismatch')
    const receipts: unknown[] = [], associations: unknown[] = []
    for (let index = 0; index < manifest.refs.length; index += 100) {
      const response = await requestAuthorityLifecycle(target, cookie, { ...common, operationId: batchId(operationId, index), refs: manifest.refs.slice(index, index + 100) })
      if (!Array.isArray(response.associations)) throw new Error('Authority omitted audited associations')
      receipts.push(response.receipt); associations.push(...response.associations)
    }
    result = { format: 1, generationId, targetOrigin: target.origin, targetId: target.targetId, targetFingerprint: targetFingerprint(target), operationId, receipts, associations }
  } else {
    const body: Record<string, unknown> = { ...common }
    if (args[0] === 'prepare') {
      body.targetId = target.targetId
      const previous = required('--previous-generation')
      body.expectedPreviousGenerationId = previous === 'null' ? null : uuid(previous)
    } else if (args[0] === 'retire') {
      const path = required('--purge'), purge = file(path)
      if (purge.targetFingerprint !== targetFingerprint(target) || purge.targetOrigin !== target.origin || purge.targetId !== target.targetId
        || purge.generationId !== generationId || purge.operationId !== operationId) throw new Error('Purge artifact does not match this retirement')
      body.purgeReceiptSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    } else if (args[0] === 'audit-complete') {
      const path = required('--verification'), verification = file(path)
      if (verification.targetFingerprint !== targetFingerprint(target) || verification.generationId !== generationId
        || typeof verification.identityManifestSha256 !== 'string' || typeof verification.identityCount !== 'number') throw new Error('Native verification artifact binding mismatch')
      body.identityManifestSha256 = verification.identityManifestSha256
      body.identityCount = verification.identityCount
      body.verificationReceiptSha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
    } else if (args[0] === 'activate') {
      const audit = object(file(required('--audit')).receipt)
      if (audit.action !== 'audit-complete' || audit.generationId !== generationId || audit.targetOrigin !== target.origin || audit.targetId !== target.targetId) throw new Error('Wrong source audit completion')
      body.auditOperationId = audit.operationId
    } else if (args[0] !== 'close') throw new Error('Unknown authority lifecycle action')
    result = await requestAuthorityLifecycle(target, cookie, body)
  }
  atomicJson(resolve(required('--output')), result)
  process.stdout.write(JSON.stringify({ action: args[0], generationId, output: required('--output') }) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await authorityCommand(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Formal authority operation failed'); process.exitCode = 1 }
}
