import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
const source = readFileSync('restart-local.sh', 'utf8')
const policy = source.slice(source.indexOf('# Isolated prerelease rehearsals retain explicit HTTPS origins.'), source.indexOf('echo "Stopping existing processes..."'))
const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })
it('retains explicit HTTPS app/API/browser identity for an isolated prerelease rehearsal', () => {
  const output = execFileSync('bash', ['-c', `${policy}\nnode -e 'process.stdout.write(JSON.stringify([process.env.PUBLIC_APP_ORIGIN,process.env.PUBLIC_API_BASE,process.env.CORS_ORIGIN]))'`], {
    encoding: 'utf8', env: { ...process.env, RELEASE_CHANNEL: 'prerelease', PUBLIC_APP_ORIGIN: 'https://localhost:45678/open-agricola/', PUBLIC_API_BASE: 'https://localhost:45678', CORS_ORIGIN: 'https://localhost:45678' },
  })
  expect(JSON.parse(output)).toEqual(['https://localhost:45678/open-agricola/', 'https://localhost:45678', 'https://localhost:45678'])
})
it('rejects an HTTP prerelease identity instead of weakening runtime TLS admission', () => {
  const result = spawnSync('bash', ['-ec', policy], { encoding: 'utf8', env: { ...process.env, RELEASE_CHANNEL: 'prerelease', PUBLIC_APP_ORIGIN: 'http://127.0.0.1:5173', PUBLIC_API_BASE: 'http://127.0.0.1:5175', CORS_ORIGIN: 'http://127.0.0.1:5173' } })
  expect(result.status).not.toBe(0)
})

it.each([0, 1])('passes the resolved build to every backend/frontend child in preview mode %s', preview => {
  const directory = mkdtempSync(join(tmpdir(), 'oa-prerelease-build-env-'))
  directories.push(directory)
  const capture = join(directory, 'capture.mjs'), output = join(directory, 'children.jsonl')
  writeFileSync(capture, `#!${process.execPath}\nimport { appendFileSync } from 'node:fs'; appendFileSync(process.env.BUILD_CAPTURE, JSON.stringify({ args: process.argv.slice(2), build: process.env.GAME_BUILD_ID ?? null }) + '\\n');\n`)
  chmodSync(capture, 0o755)
  const identityStart = source.indexOf('GAME_BUILD_ID=')
  const identity = source.slice(source.lastIndexOf('\n', identityStart) + 1, source.indexOf('\nenv REPLAY_VIEWER_ROOT=', identityStart))
  const build = source.slice(source.indexOf('if [ "$PREVIEW_ENABLED" -eq 1 ]; then\n  echo "Building frontend preview bundle..."'), source.indexOf('\necho "Starting backend (port'))
  const backend = source.slice(source.indexOf('start_and_wait "backend"'), source.indexOf('\nif [[ "${OBSERVABILITY_ENABLED'))
  const frontendStart = source.indexOf('if [ "$PREVIEW_ENABLED" -eq 1 ]; then\n  echo "Starting frontend preview')
  const frontend = source.slice(frontendStart, source.indexOf('\nrecord_owned_processes', frontendStart))
  const environment: NodeJS.ProcessEnv = { ...process.env, RELEASE_CHANNEL: 'prerelease', SCRIPT_DIR: process.cwd(), PNPM_BIN: capture, BACKEND_BIN: capture, FRONTEND_BIN: capture, BUILD_CAPTURE: output }
  delete environment.GAME_BUILD_ID
  execFileSync('bash', ['-ec', `
    unset GAME_BUILD_ID
    PREVIEW_ENABLED=$1
    BIND_IP=127.0.0.1
    BACKEND_PORT=5175
    FRONTEND_PORT=5173
    PARENTS_ENABLED=0; DRAFT_ENABLED=0; SEASONS_ENABLED=0; MOOR_ENABLED=0; SNAKE_ENABLED=0
    BACKEND_IDENTITY_ENV=()
    start_and_wait() { shift 3; "$@"; }
    ${identity}
    ${build}
    ${backend}
    ${frontend}
  `, 'prerelease-build-child-test', String(preview)], { env: environment, stdio: 'pipe' })
  const expectedBuild = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const children: Array<{ args: string[]; build: string | null }> = readFileSync(output, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  expect(children).toHaveLength(preview ? 3 : 2)
  expect(children.map(child => child.build)).toEqual(Array.from({ length: preview ? 3 : 2 }, () => expectedBuild))
  expect(children.some(child => child.args.includes('preview'))).toBe(Boolean(preview))
  expect(children.some(child => child.args.join(' ') === 'run build')).toBe(Boolean(preview))
})
