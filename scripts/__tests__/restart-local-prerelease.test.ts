import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
const source = readFileSync('restart-local.sh', 'utf8')
const policy = source.slice(source.indexOf('# Isolated prerelease rehearsals retain explicit HTTPS origins.'), source.indexOf('echo "Stopping existing processes..."'))
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
