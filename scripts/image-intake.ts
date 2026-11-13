import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected resource budget object')
  return Object.fromEntries(Object.entries(value))
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid resource budget')
  return value
}

export function parseRuntimeLimits(value: unknown) {
  const limits = object(value)
  if (typeof limits.cpus !== 'number' || !Number.isFinite(limits.cpus) || limits.cpus < 0.1 || limits.cpus > 32) throw new Error('Invalid CPU budget')
  return { memoryMiB: integer(limits.memoryMiB, 32, 131072), cpus: limits.cpus, pids: integer(limits.pids, 32, 65536) }
}

export function parseImageImportBudget(value: unknown) {
  const input = object(value), importing = object(input.import)
  const result = {
    import: { maxArchiveMiB: integer(importing.maxArchiveMiB, 1, 131072),
      memoryHeadroomMiB: integer(importing.memoryHeadroomMiB, 32, 131072), intake: parseRuntimeLimits(importing.intake) },
    diskMiB: integer(input.diskMiB, 256, 4_194_304), reserveMemoryMiB: integer(input.reserveMemoryMiB, 128, 1_048_576),
  }
  if (result.import.memoryHeadroomMiB < result.import.intake.memoryMiB) throw new Error('Image intake cap exceeds import admission headroom')
  return result
}

export function imageIntakeProperties(budget: ReturnType<typeof parseRuntimeLimits>): string[] {
  return ['--property=MemoryAccounting=yes', `--property=MemoryMax=${budget.memoryMiB * 1024 * 1024}`, '--property=MemorySwapMax=0',
    '--property=CPUAccounting=yes', `--property=CPUQuota=${budget.cpus * 100}%`, `--property=TasksMax=${budget.pids}`,
    '--property=RuntimeMaxSec=1200', '--property=TimeoutStopSec=5', '--property=KillMode=control-group']
}

export function assertNativeImageIntake(unit: string, budget: ReturnType<typeof parseRuntimeLimits>): void {
  const relative = readFileSync('/proc/self/cgroup', 'utf8').split('\n').find(line => line.startsWith('0::'))?.slice(3)
  if (!relative?.startsWith('/') || relative.split('/').includes('..') || relative.split('/').at(-1) !== unit) throw new Error('Image import requires its dedicated cgroup v2 intake unit')
  const root = join('/sys/fs/cgroup', relative), limit = (name: string) => readFileSync(join(root, name), 'utf8').trim()
  const [quota, period] = limit('cpu.max').split(' ').map(Number)
  if (limit('memory.max') !== String(budget.memoryMiB * 1024 * 1024) || limit('memory.swap.max') !== '0'
    || limit('pids.max') !== String(budget.pids) || !Number.isSafeInteger(quota) || quota < 1
    || !Number.isSafeInteger(period) || period < 1 || quota / period > budget.cpus + 1e-9) throw new Error('Native image intake limits differ from the target budget')
}
