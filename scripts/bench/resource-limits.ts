import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type ResourceLimits = { cgroupCpuCores: number | null; cgroupMemoryBytes: number | null }

const readText = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8').trim()
  } catch {
    return null
  }
}

const cgroupPath = (): string => {
  const entry = readText('/proc/self/cgroup')
    ?.split('\n')
    .find((line) => line.startsWith('0::'))
  return entry ? join('/sys/fs/cgroup', entry.slice(3)) : '/sys/fs/cgroup'
}

export const readCgroupLimits = (): ResourceLimits => {
  const root = cgroupPath()
  const cpuRaw = readText(join(root, 'cpu.max'))
  const memoryRaw = readText(join(root, 'memory.max'))
  if (cpuRaw) {
    const [quota, period] = cpuRaw.split(/\s+/)
    return {
      cgroupCpuCores: quota !== 'max' && Number(period) > 0
        ? Number(quota) / Number(period)
        : null,
      cgroupMemoryBytes: memoryRaw && memoryRaw !== 'max' ? Number(memoryRaw) : null,
    }
  }
  const quota = Number(
    readText('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_quota_us') ??
    readText('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'),
  )
  const period = Number(
    readText('/sys/fs/cgroup/cpu,cpuacct/cpu.cfs_period_us') ??
    readText('/sys/fs/cgroup/cpu/cpu.cfs_period_us'),
  )
  const memory = Number(readText('/sys/fs/cgroup/memory/memory.limit_in_bytes'))
  return {
    cgroupCpuCores: quota > 0 && period > 0 ? quota / period : null,
    cgroupMemoryBytes: memory > 0 ? memory : null,
  }
}

export const assertResourceLimits = (
  limits: ResourceLimits,
  allowUnconstrained: boolean,
): void => {
  if (allowUnconstrained) return
  if (
    limits.cgroupCpuCores === null ||
    limits.cgroupCpuCores > 2.01 ||
    limits.cgroupMemoryBytes === null ||
    limits.cgroupMemoryBytes > 2 * 1024 ** 3
  ) {
    throw new Error('probe must run inside a cgroup limited to 2 CPU and 2 GiB; use --allow-unconstrained only for smoke checks')
  }
}

