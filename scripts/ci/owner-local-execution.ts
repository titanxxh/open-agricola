import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { browserSpecWeights, browserSpecWeightsAt, fullSha, taskCommands, verificationTask, type FullTaskId, type VerificationCommand } from './verification-tasks.ts'

// The owner-local execution plan: the exact commands an owner-local run executes and its receipt must record.

const git = (cwd: string, args: string[]): Buffer => execFileSync('git', args, {
  cwd, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
})

/**
 * The complete plan for `sha`. With `producerSha` the chromium selections follow that producer's catalog (its weight
 * table, or the earlier index-modulo assignment), so a receipt carried from an earlier producer keeps its own plan.
 */
export function canonicalOwnerLocalCommands(cwd: string, sha: string, channel: 'stable' | 'prerelease' = 'stable', producerSha?: string): Record<FullTaskId, VerificationCommand[]> {
  const weights = producerSha === undefined ? browserSpecWeights() : browserSpecWeightsAt(cwd, producerSha)
  const root = mkdtempSync(join(tmpdir(), 'oa-local-plan-'))
  try {
    const archive = git(cwd, ['archive', fullSha(sha), 'package.json', 'e2e-tests'])
    execFileSync('tar', ['-x', '-C', root], { input: archive, stdio: ['pipe', 'ignore', 'pipe'] })
    const commands = (id: FullTaskId): VerificationCommand[] => [
      ...(verificationTask(id).services ? [{ command: 'node', args: ['scripts/local-services.mjs', '--test'] }] : []),
      ...taskCommands(root, id, weights).map(command => channel === 'prerelease' && id === 'build' && command.command === 'pnpm'
        && command.args.length === 2 && command.args[0] === 'run' && command.args[1] === 'build' ? { command: 'pnpm', args: ['run', 'build:hosted-frontend'] } : command),
    ]
    return { quality: commands('quality'), fast: commands('fast'), slow: commands('slow'), build: commands('build'),
      'chromium-1': commands('chromium-1'), 'chromium-2': commands('chromium-2'), 'chromium-3': commands('chromium-3'), 'chromium-4': commands('chromium-4'),
      'browser-sandbox': commands('browser-sandbox'), webkit: commands('webkit') }
  } finally { rmSync(root, { recursive: true, force: true }) }
}
