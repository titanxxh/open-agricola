import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { backendImageRequestBinding, type BackendImageRequest } from './backend-image-receiver.ts'

export const BACKEND_RESUME_WORK_MS = 10 * 60_000
const BACKEND_RESUME_CLOCK_SKEW_MS = 60_000
export type BackendProgress = {
  format: 1; operationId: string; bindingSha256: string;
  phase: 'validating' | 'starting' | 'accepted';
  liveStartedAt: number; updatedAt: number; validatorExitCode: 0 | null;
  composeSha256: string; imageSha256: string; storageSha256: string; sourceSha256: string | null; validationSha256: string;
}

export const backendEvidenceHash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')

export function privateBackendEvidence(path: string, maxBytes = 256 * 1024): Buffer {
  const info = lstatSync(path)
  if (resolve(path) !== path || realpathSync(path) !== path || !info.isFile() || info.nlink !== 1
    || info.uid !== process.getuid?.() || info.mode & 0o077 || info.size > maxBytes) throw new Error('Expected owner-private backend evidence')
  return readFileSync(path)
}

export function readBackendProgress(request: BackendImageRequest): BackendProgress {
  const value: unknown = JSON.parse(privateBackendEvidence(join(request.stage, 'maintenance-progress.json')).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backend progress evidence')
  const input = Object.fromEntries(Object.entries(value))
  if (Object.keys(input).sort().join(',') !== 'bindingSha256,composeSha256,format,imageSha256,liveStartedAt,operationId,phase,sourceSha256,storageSha256,updatedAt,validationSha256,validatorExitCode'
    || input.format !== 1 || input.operationId !== request.operationId || input.bindingSha256 !== backendImageRequestBinding(request)
    || !['validating', 'starting', 'accepted'].includes(String(input.phase))
    || typeof input.liveStartedAt !== 'number' || !Number.isSafeInteger(input.liveStartedAt) || input.liveStartedAt <= 0
    || typeof input.updatedAt !== 'number' || !Number.isSafeInteger(input.updatedAt) || input.updatedAt < input.liveStartedAt
    || input.validatorExitCode !== null && input.validatorExitCode !== 0
    || ['composeSha256', 'imageSha256', 'storageSha256', 'validationSha256'].some(key => typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(String(input[key])))
    || input.sourceSha256 !== null && (typeof input.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.sourceSha256))) throw new Error('Backend progress differs from the admitted operation')
  return { format: 1, operationId: request.operationId, bindingSha256: backendImageRequestBinding(request), phase: input.phase === 'accepted' ? 'accepted' : input.phase === 'starting' ? 'starting' : 'validating',
    liveStartedAt: input.liveStartedAt, updatedAt: input.updatedAt, validatorExitCode: input.validatorExitCode,
    composeSha256: String(input.composeSha256), imageSha256: String(input.imageSha256), storageSha256: String(input.storageSha256), validationSha256: String(input.validationSha256), sourceSha256: input.sourceSha256 }
}

export function writeBackendProgress(request: BackendImageRequest, progress: BackendProgress): void {
  const path = join(request.stage, 'maintenance-progress.json'), temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(progress) + '\n', { flag: 'wx', mode: 0o600, flush: true })
    renameSync(temporary, path)
    const directory = openSync(dirname(path), 'r')
    try { fsyncSync(directory) } finally { closeSync(directory) }
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}

export function validateBackendResumeAuthorization(path: string, request: BackendImageRequest): number {
  const value: unknown = JSON.parse(privateBackendEvidence(path).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid backend continuation authorization')
  const input = Object.fromEntries(Object.entries(value)), now = Date.now()
  if (Object.keys(input).sort().join(',') !== 'authorizedAt,bindingSha256,expiresAt,format,nonce,operationId,workMs'
    || input.format !== 1 || input.operationId !== request.operationId || input.bindingSha256 !== backendImageRequestBinding(request)
    || typeof input.nonce !== 'string' || !/^[a-f0-9-]{36}$/.test(input.nonce) || path !== join(request.stage, `resume-${input.nonce}.json`)
    || typeof input.authorizedAt !== 'number' || !Number.isSafeInteger(input.authorizedAt) || input.authorizedAt <= 0 || input.authorizedAt > now + BACKEND_RESUME_CLOCK_SKEW_MS
    || typeof input.expiresAt !== 'number' || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now
    || input.expiresAt > now + BACKEND_RESUME_WORK_MS + BACKEND_RESUME_CLOCK_SKEW_MS
    || input.expiresAt <= input.authorizedAt || input.expiresAt - input.authorizedAt > BACKEND_RESUME_WORK_MS
    || input.workMs !== BACKEND_RESUME_WORK_MS) throw new Error('Backend continuation authorization expired or belongs to another operation')
  return Math.min(input.workMs, input.expiresAt - now)
}
