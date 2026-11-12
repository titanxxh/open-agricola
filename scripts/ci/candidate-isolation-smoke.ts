// This file is copied from the trusted producer into a root-owned directory before execution.
import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { connect, createServer as createTcpServer } from 'node:net'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const image = 'postgres:18-bookworm@sha256:3725f4e2499eef5134592b3b4ab79a543ed7f8e533b05b5b637af926630f6650'
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
assert(process.getuid?.() === 61000 && process.getgid?.() === 61000 && process.getgroups?.().every(group => group === 61000), 'Candidate identity or groups are unsafe')
assert(/^NoNewPrivs:\s+1$/m.test(readFileSync('/proc/self/status', 'utf8')), 'Candidate payload needs NoNewPrivileges')
assert(spawnSync('/usr/bin/sudo', ['-n', '/usr/bin/true'], { stdio: 'ignore' }).status !== 0, 'Candidate has host sudo')
for (const path of ['/run/oa-ci-isolation/protected-marker', JSON.parse(readFileSync('/run/oa-ci-isolation/context.json', 'utf8')).privateDirectory + '/inert-marker']) {
  let denied = false
  try { writeFileSync(path, 'candidate inert bytes', { flag: 'a' }) } catch { denied = true }
  assert(denied, 'Candidate can write trusted files')
}
await new Promise<void>((done, reject) => {
  const socket = connect('/var/run/docker.sock')
  socket.once('connect', () => { socket.destroy(); reject(new Error('Candidate can access rootful Docker')) })
  socket.once('error', () => done())
})
const security: unknown = JSON.parse(execFileSync('docker', ['info', '--format', '{{json .SecurityOptions}}'], { encoding: 'utf8' }))
assert(Array.isArray(security) && security.includes('name=rootless'), 'Docker is not rootless')
assert(execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' }).trim() === '29.9.3', 'Unexpected rootless Docker version')
const directory = mkdtempSync('/home/oa-candidate/bind-'); chmodSync(directory, 0o700)
await run('docker', ['run', '--rm', '--user', '0:0', '--mount', `type=bind,source=${directory},target=/marker`, image, 'bash', '-c', 'printf "native bind bytes\\n" > /marker/result'])
assert(readFileSync(join(directory, 'result'), 'utf8') === 'native bind bytes\n', 'Rootless bind UID mapping failed')
const server = createServer((_, response) => response.end('host loopback marker'))
await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
const address = server.address(); assert(address && typeof address === 'object', 'Missing loopback address')
try {
  const result = await run('docker', ['run', '--rm', '--network', 'host', image, 'bash', '-c', `exec 3<>/dev/tcp/127.0.0.1/${address.port}; printf 'GET / HTTP/1.0\\r\\n\\r\\n' >&3; cat <&3`])
  assert(result.stdout.includes('host loopback marker'), 'Container cannot reach host loopback')
} finally { server.close() }
const listener = createTcpServer(); await new Promise<void>(done => listener.listen(0, '127.0.0.1', done))
const allocated = listener.address(); assert(allocated && typeof allocated === 'object', 'Missing PostgreSQL address')
await new Promise<void>(done => listener.close(() => done()))
const name = 'oa-isolation-native-postgres'
try {
  await run('docker', ['run', '--rm', '-d', '--name', name, '--network', 'host', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image, '-p', String(allocated.port)])
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await run('docker', ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-p', String(allocated.port)]); ready = true; break }
    catch { await new Promise(done => setTimeout(done, 500)) }
  }
  assert(ready, 'Native PostgreSQL startup failed')
  await new Promise<void>((done, reject) => { const socket = connect(allocated.port, '127.0.0.1', () => { socket.destroy(); done() }); socket.once('error', reject) })
} finally { await run('docker', ['rm', '-f', name]) }
// Keep one genuine subuid container alive for the final recursive cgroup teardown proof.
await run('docker', ['run', '-d', '--name', 'oa-isolation-lifecycle', '--network', 'none', '--user', '65534:65534', image, 'sleep', '3600'])
console.log('Distinct UID, protected files, NNP client, rootless bind and bidirectional native loopback passed')
