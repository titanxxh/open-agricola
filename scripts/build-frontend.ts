#!/usr/bin/env tsx
import { execFileSync, spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HOSTED_APP_PATH, type FrontendBuild } from '../shared/contract/protocol/app-location.ts'

const repoRoot = resolve(import.meta.dirname, '..')
const mode = process.argv[2]
if (mode !== 'hosted' && mode !== 'pages') throw new Error('Expected frontend mode: hosted or pages')
const basePath = mode === 'hosted' ? HOSTED_APP_PATH : '/'
const outputDirectory = mode === 'hosted' ? 'dist' : 'dist-pages'
if (mode === 'pages' && !process.env.VITE_API_BASE) throw new Error('Pages frontend requires VITE_API_BASE')
const gameBuildId = process.env.GAME_BUILD_ID?.trim()
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
if (!gameBuildId) throw new Error('Hosted frontend requires a game build identity')

const build = spawnSync('pnpm', ['run', 'build', '--outDir', outputDirectory], {
  cwd: repoRoot,
  env: {
    ...process.env,
    GAME_BUILD_ID: gameBuildId,
    VITE_BASE_PATH: basePath,
    VITE_API_BASE: mode === 'hosted' ? '' : process.env.VITE_API_BASE,
    VITE_WS_BASE: mode === 'hosted' ? '' : process.env.VITE_WS_BASE,
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
  basePath,
} satisfies FrontendBuild
writeFileSync(resolve(repoRoot, outputDirectory, 'frontend-build.json'), JSON.stringify(frontendBuild) + '\n')
