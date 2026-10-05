import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as pause } from 'node:timers/promises'
import { createPublicIngress } from '../server/ingress'
import { RoomDirectory } from '../server/game/room-directory'
import { initializeDatabase, getDb } from '../server/db'
import { installShutdownHandlers } from '../server/shutdown'

const count = Number(process.env.APP_INSTANCES ?? 1)
const port = Number(process.env.BACKEND_PORT ?? 5175)
const privatePort = Number(process.env.APP_BASE_PORT ?? port + 100)
if (!Number.isSafeInteger(count) || count < 1 || count > 2) throw new Error('Local APP_INSTANCES must be 1 or 2')
await initializeDatabase()
const directory = new RoomDirectory(getDb())
const ingress = createPublicIngress(directory, process.env.PUBLIC_API_BASE?.startsWith('https:') === true)
const children = new Set<ChildProcess>()
let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  // Applications finish accepted commands and release leases before the shared
  // public entry and its pool disappear. SIGTERM is also safe for their group.
  await Promise.all([...children].map(child => new Promise<void>(done => {
    if (child.exitCode !== null || child.signalCode !== null) { done(); return }
    child.once('exit', () => done()); child.kill('SIGTERM')
  })))
  await ingress.shutdown()
  await getDb().close()
}
installShutdownHandlers(shutdown)
async function start(index: number): Promise<void> {
  const childPort = privatePort + index
  const internalUrl = `http://127.0.0.1:${childPort}`
  const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    // Private children receive one normalized client IP from this ingress.
    env: { ...process.env, REPLAY_TRUST_PROXY: 'true', BACKEND_HOST: '127.0.0.1', BACKEND_PORT: String(childPort), INSTANCE_INTERNAL_URL: internalUrl },
    stdio: 'inherit',
  })
  children.add(child)
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      console.error(`[local-backend] Instance ${index + 1} exited (${code ?? signal}); restarting`)
      void pause(1000).then(() => stopping ? undefined : start(index)).catch(error => { console.error(error); process.exitCode = 1; void shutdown() })
    }
  })
  for (let attempt = 0; attempt < 120 && !stopping; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Instance ${index + 1} failed during startup`)
    try {
      const response = await fetch(`${internalUrl}/api/health`, { signal: AbortSignal.timeout(1500) })
      if (response.ok) { console.log(`[local-backend] Instance ${index + 1} ready on private port ${childPort}`); return }
    } catch { /* Startup has not bound its port yet. */ }
    await pause(500)
  }
  if (!stopping) throw new Error(`Instance ${index + 1} did not become ready`)
}
try {
  // Start sequentially so a cold database's restored Rooms and fixed dev Rooms
  // are claimed before the next instance accepts new allocations.
  for (let index = 0; index < count; index++) await start(index)
  if (!stopping) await new Promise<void>((done, reject) => {
    ingress.server.once('error', reject)
    ingress.server.listen(port, process.env.BACKEND_HOST ?? '127.0.0.1', done)
  })
  if (!stopping) console.log(`[local-backend] ${count} application instance(s), public entry on ${port}`)
} catch (error) { console.error(error); process.exitCode = 1; await shutdown() }
