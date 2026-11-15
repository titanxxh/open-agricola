import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { atomicJson } from './runtime'
import { targetFingerprint, type PrereleaseTarget } from './config'

function processIdentity(pid: number) {
  const raw = readFileSync(`/proc/${pid}/stat`, 'utf8'), fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ')
  return { state: fields[0], group: Number(fields[2]), started: fields[19] }
}

function activeOperationIdentity(pid: number) {
  try {
    const identity = processIdentity(pid)
    return ['Z', 'X', 'x'].includes(identity.state) ? null : identity
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/** The owner CLI runs in a dedicated session; only that session can be stopped by the guard. */
export function registerStorageOperation(target: PrereleaseTarget): () => void {
  const fingerprint = targetFingerprint(target), self = processIdentity(process.pid), leader = processIdentity(self.group)
  if (self.group <= 1 || self.group === processIdentity(process.ppid).group && process.env.PRERELEASE_LOCK_SCOPE !== fingerprint
    || !readFileSync(`/proc/${self.group}/environ`, 'utf8').split('\0').includes(`PRERELEASE_LOCK_SCOPE=${fingerprint}`)
    || !readFileSync(`/proc/${self.group}/cmdline`, 'utf8').split('\0').includes(join(target.directory, 'control/.operation.lock'))) throw new Error('Storage operation requires the isolated owner command session')
  const path = join(target.directory, 'control/storage-operation.json')
  atomicJson(path, { fingerprint, pid: process.pid, group: self.group, started: self.started, leaderStarted: leader.started })
  return () => rmSync(path, { force: true })
}

export async function stopStorageOperation(target: PrereleaseTarget): Promise<void> {
  const path = join(target.directory, 'control/storage-operation.json')
  if (!existsSync(path)) return
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!value || typeof value !== 'object' || !('fingerprint' in value) || value.fingerprint !== targetFingerprint(target)
    || !('pid' in value) || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid <= 1
    || !('group' in value) || typeof value.group !== 'number' || !Number.isSafeInteger(value.group) || value.group <= 1
    || !('started' in value) || typeof value.started !== 'string' || !('leaderStarted' in value) || typeof value.leaderStarted !== 'string') throw new Error('Invalid owner storage operation identity')
  const processState = activeOperationIdentity(value.pid)
  if (!processState || processState.started !== value.started || processState.group !== value.group) return
  const ownGroup = processIdentity(process.pid).group
  try {
    const leader = processIdentity(value.group)
    if (leader.started !== value.leaderStarted) return
    if (value.group === ownGroup
      || !readFileSync(`/proc/${value.group}/environ`, 'utf8').split('\0').includes(`PRERELEASE_LOCK_SCOPE=${value.fingerprint}`)
      || !readFileSync(`/proc/${value.group}/cmdline`, 'utf8').split('\0').includes(join(target.directory, 'control/.operation.lock'))) throw new Error('Owner storage process group ownership changed')
  } catch (error) {
    // A missing leader is harmless only if the registered operation also ended.
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT' && !activeOperationIdentity(value.pid)) return
    throw error
  }
  process.kill(-value.group, 'SIGTERM')
  await new Promise(done => setTimeout(done, 1000))
  try { process.kill(-value.group, 0); process.kill(-value.group, 'SIGKILL') }
  catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH')) throw error }
}
