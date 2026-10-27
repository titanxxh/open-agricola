#!/usr/bin/env tsx
import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOSTED_APP_PATH, type FrontendBuild } from '../shared/contract/protocol/app-location.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const gameBuildId = process.env.GAME_BUILD_ID?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
if (!gameBuildId) throw new Error('Hosted frontend requires a game build identity')

const build = spawnSync('pnpm', ['run', 'build'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    GAME_BUILD_ID: gameBuildId,
    VITE_BASE_PATH: HOSTED_APP_PATH,
    VITE_API_BASE: '',
    VITE_WS_BASE: '',
    VITE_ENABLE_COMMUNITY_DECK: process.env.VITE_ENABLE_COMMUNITY_DECK ?? 'true',
    VITE_SANDBOX_EXECUTOR: process.env.VITE_SANDBOX_EXECUTOR ?? 'browser',
  },
  stdio: 'inherit',
})
if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)

const frontendBuild = {
  format: 1,
  gameBuildId,
  basePath: HOSTED_APP_PATH,
} satisfies FrontendBuild
writeFileSync(resolve(repoRoot, 'dist/frontend-build.json'), JSON.stringify(frontendBuild) + '\n')
