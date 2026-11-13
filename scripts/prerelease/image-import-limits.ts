import { assertNativeImageIntake, imageIntakeProperties } from '../image-intake.ts'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { targetFingerprint, type PrereleaseTarget } from './config'

function unitName(target: PrereleaseTarget, operationId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)) throw new Error('Invalid image intake operation')
  return `oa-image-intake-${targetFingerprint(target).slice(0, 16)}-${operationId}.service`
}

export function assertImageIntakeLimits(target: PrereleaseTarget, operationId: string): void {
  assertNativeImageIntake(unitName(target, operationId), target.budgets.import.intake)
}

export function runBoundedImageImport(target: PrereleaseTarget, operationId: string, envelope: string) {
  const budget = target.budgets.import.intake
  const environment = ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
    .flatMap(name => process.env[name] === undefined ? [] : [`--setenv=${name}=${process.env[name]}`])
  return spawnSync('systemd-run', ['--user', '--quiet', '--wait', '--pipe', '--collect', '--service-type=exec',
    `--unit=${unitName(target, operationId)}`, `--working-directory=${target.policyDirectory}`,
    ...imageIntakeProperties(budget),
    `--setenv=PRERELEASE_LOCK_SCOPE=${targetFingerprint(target)}`, ...environment,
    '--', 'setsid', '--wait', 'flock', '-w', '60', join(target.directory, 'control/.operation.lock'),
    process.execPath, '--import', 'tsx', join(target.policyDirectory, 'scripts/prerelease/operations.ts'), '_locked'],
  { cwd: target.policyDirectory, input: envelope, encoding: 'utf8', timeout: 21 * 60_000 })
}
