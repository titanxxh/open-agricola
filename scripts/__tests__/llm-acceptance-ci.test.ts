import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

it.each([false, true])('rejects the retired DeepSeek alias before loading configuration or credentials (diagnostic=%s)', diagnostic => {
  const result = spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), 'scripts/llm-acceptance.ts',
    '--live', '--model', 'deepseek-v4-flash', '--runtime-env', join(tmpdir(), `${randomUUID()}.env`),
    ...(diagnostic ? ['--diagnose', 'M2-per-action-bonus'] : []),
  ], { cwd: root, encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH } })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Only --model deepseek-flash is approved for paid acceptance')
  expect(result.stderr).not.toContain('ENOENT')
})

it.each(['CI', 'GITHUB_ACTIONS'])('rejects paid acceptance under %s before loading local configuration', (flag) => {
  const result = spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), 'scripts/llm-acceptance.ts',
    '--live', '--model', 'deepseek-flash', '--runtime-env', join(tmpdir(), `${randomUUID()}.env`),
  ], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, [flag]: 'true' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Paid LLM acceptance is owner-local only and cannot run in CI')
  expect(result.stderr).not.toContain('ENOENT')
})

it('allows synthetic acceptance to reach its normal configuration checks in CI', () => {
  const result = spawnSync(process.execPath, [
    '--import', import.meta.resolve('tsx'), 'scripts/llm-acceptance.ts',
    '--dry-run', '--runtime-env', join(tmpdir(), `${randomUUID()}.env`),
  ], {
    cwd: root, encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, CI: 'true', GITHUB_ACTIONS: 'true' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('ENOENT')
  expect(result.stderr).not.toContain('Paid LLM acceptance is owner-local only')
})
