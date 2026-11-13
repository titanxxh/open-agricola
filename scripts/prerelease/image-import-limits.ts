import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { targetFingerprint, type PrereleaseTarget } from './config'

function unitName(target: PrereleaseTarget, operationId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)) throw new Error('Invalid image intake operation')
  return `oa-image-intake-${targetFingerprint(target).slice(0, 16)}-${operationId}.service`
}

export function assertImageIntakeLimits(target: PrereleaseTarget, operationId: string): void {
  const relative = readFileSync('/proc/self/cgroup', 'utf8').split('\n').find(line => line.startsWith('0::'))?.slice(3)
  if (!relative?.startsWith('/') || relative.split('/').includes('..') || relative.split('/').at(-1) !== unitName(target, operationId)) throw new Error('Image import requires its dedicated cgroup v2 intake unit')
  const root = join('/sys/fs/cgroup', relative), limit = (name: string) => readFileSync(join(root, name), 'utf8').trim()
  const budget = target.budgets.import.intake, [quota, period] = limit('cpu.max').split(' ').map(Number)
  if (limit('memory.max') !== String(budget.memoryMiB * 1024 * 1024) || limit('memory.swap.max') !== '0'
    || limit('pids.max') !== String(budget.pids) || !Number.isSafeInteger(quota) || quota < 1
    || !Number.isSafeInteger(period) || period < 1 || quota / period > budget.cpus + 1e-9) throw new Error('Native image intake limits differ from the target budget')
}

export function runBoundedImageImport(target: PrereleaseTarget, operationId: string, envelope: string) {
  const budget = target.budgets.import.intake
  const environment = ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
    .flatMap(name => process.env[name] === undefined ? [] : [`--setenv=${name}=${process.env[name]}`])
  return spawnSync('systemd-run', ['--user', '--quiet', '--wait', '--pipe', '--collect', '--service-type=exec',
    `--unit=${unitName(target, operationId)}`, `--working-directory=${target.policyDirectory}`,
    '--property=MemoryAccounting=yes', `--property=MemoryMax=${budget.memoryMiB * 1024 * 1024}`, '--property=MemorySwapMax=0',
    '--property=CPUAccounting=yes', `--property=CPUQuota=${budget.cpus * 100}%`, `--property=TasksMax=${budget.pids}`,
    '--property=RuntimeMaxSec=1200', '--property=TimeoutStopSec=5', '--property=KillMode=control-group',
    `--setenv=PRERELEASE_LOCK_SCOPE=${targetFingerprint(target)}`, ...environment,
    '--', 'setsid', '--wait', 'flock', '-w', '60', join(target.directory, 'control/.operation.lock'),
    process.execPath, '--import', 'tsx', join(target.policyDirectory, 'scripts/prerelease/operations.ts'), '_locked'],
  { cwd: target.policyDirectory, input: envelope, encoding: 'utf8', timeout: 21 * 60_000 })
}
