import { readFileSync, statSync } from 'node:fs'
import { freemem } from 'node:os'
import { join } from 'node:path'
import type { PrereleaseTarget } from './config'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid application memory identity')
  return Object.fromEntries(Object.entries(value))
}
const integer = (value: string): number => {
  const parsed = Number(value)
  if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(parsed)) throw new Error('Invalid application memory readback')
  return parsed
}

export function readApplicationMemory({ target, appId, images, docker }: {
  target: PrereleaseTarget; appId: string; images: readonly (string | null | undefined)[]; docker: (args: string[]) => string
}): { anonymousBytes: number; availableBytes: number } {
  if (!/^[a-f0-9]{64}$/.test(appId)) throw new Error('Cannot identify one running prerelease application')
  const context = process.env.DOCKER_CONTEXT
  const endpoint: unknown = !context && process.env.DOCKER_HOST ? process.env.DOCKER_HOST
    : object(JSON.parse(docker(['context', 'inspect', '--format', '{{json .Endpoints.docker}}', ...(context ? [context] : [])]))).Host
  if (typeof endpoint !== 'string' || !/^unix:\/\/\/[^\s\0?#]+$/.test(endpoint)) throw new Error('Application memory admission requires a local Unix Docker daemon')
  const localDocker = (args: string[]) => docker(['--host', endpoint, ...args])
  const info = object(JSON.parse(localDocker(['info', '--format', '{{json .}}'])))
  if (info.OSType !== 'linux' || info.CgroupVersion !== '2') throw new Error('Application memory admission requires native Linux cgroup v2')
  const inspect = () => {
    const app = object(JSON.parse(localDocker(['inspect', '--format', '{{json .}}', appId])))
    const labels = object(object(app.Config).Labels), limits = object(app.HostConfig), state = object(app.State)
    if (app.Id !== appId || labels['com.docker.compose.project'] !== target.project || labels['com.docker.compose.service'] !== 'app'
      || state.Running !== true || typeof state.Pid !== 'number' || !Number.isSafeInteger(state.Pid) || state.Pid < 1
      || typeof state.StartedAt !== 'string' || !Number.isFinite(Date.parse(state.StartedAt))
      || typeof app.Image !== 'string' || !images.includes(app.Image)
      || typeof limits.Memory !== 'number' || !Number.isSafeInteger(limits.Memory) || limits.Memory <= 0
      || limits.Memory > target.budgets.app.memoryMiB * 1024 * 1024 || limits.MemorySwap !== limits.Memory) {
      throw new Error('Running prerelease application identity or memory limit differs from the target')
    }
    return { pid: state.Pid, startedAt: state.StartedAt, memoryBytes: limits.Memory, image: app.Image }
  }
  const before = inspect()
  const native = () => {
    const membership = readFileSync(`/proc/${before.pid}/cgroup`, 'utf8').trim().split('\n')
    const relative = membership.length === 1 && membership[0].startsWith('0::/') ? membership[0].slice(3) : ''
    const leaf = relative.split('/').at(-1)
    if (relative.split('/').includes('..') || leaf !== appId && leaf !== `docker-${appId}.scope`) throw new Error('Application PID is outside its native Docker cgroup')
    const root = join('/sys/fs/cgroup', relative), stat = statSync(root)
    if (!stat.isDirectory()) throw new Error('Application cgroup is missing')
    const read = (name: string) => readFileSync(join(root, name), 'utf8').trim()
    if (read('memory.max') !== String(before.memoryBytes) || read('memory.swap.max') !== '0' || read('memory.swap.current') !== '0') {
      throw new Error('Native application memory or swap limits differ from the target')
    }
    const rows = read('memory.stat').split('\n').filter(line => line.startsWith('anon '))
    if (rows.length !== 1) throw new Error('Anonymous application memory is missing or duplicated')
    const anonymousBytes = integer(rows[0].slice(5))
    if (anonymousBytes > before.memoryBytes) throw new Error('Anonymous application memory exceeds its native limit')
    const processStat = readFileSync(`/proc/${before.pid}/stat`, 'utf8')
    const end = processStat.lastIndexOf(') '), fields = processStat.slice(end + 2).trim().split(/\s+/)
    if (!processStat.startsWith(`${before.pid} (`) || end < 0 || !fields[19] || integer(fields[19]) < 1) throw new Error('Application process start time is missing')
    return { relative, device: stat.dev, inode: stat.ino, startTicks: fields[19], anonymousBytes }
  }
  const first = native(), availableBefore = freemem(), second = native(), after = inspect(), availableAfter = freemem()
  if (JSON.stringify(before) !== JSON.stringify(after) || first.relative !== second.relative || first.device !== second.device
    || first.inode !== second.inode || first.startTicks !== second.startTicks) throw new Error('Application identity changed during memory admission')
  if (![availableBefore, availableAfter].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Host available memory is invalid')
  return { anonymousBytes: Math.min(first.anonymousBytes, second.anonymousBytes), availableBytes: Math.min(availableBefore, availableAfter) }
}
