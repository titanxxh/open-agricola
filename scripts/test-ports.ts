import { createServer } from 'node:net'

// Linux hands out listen(0) ports from 32768–60999 and macOS from 49152–65535.
// An isolated app binds its ports only after dependencies and builds are ready,
// so pick them below both ranges: a parallel test's listen(0) cannot take one
// in the meantime.
const FIRST_PORT = 20_000
const LAST_PORT = 32_767

const canBind = (port: number) => new Promise<boolean>(resolve => {
  const server = createServer()
  server.once('error', () => resolve(false))
  server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
})

/**
 * A loopback port outside the ephemeral ranges whose `span` consecutive ports
 * are currently free and not in `taken`.
 */
export async function allocateTestPort({ span = 1, taken = [] }: { span?: number; taken?: Iterable<number> } = {}): Promise<number> {
  const excluded = new Set(taken)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const first = FIRST_PORT + Math.floor(Math.random() * (LAST_PORT - FIRST_PORT + 2 - span))
    const ports = Array.from({ length: span }, (_, offset) => first + offset)
    if (ports.some(port => excluded.has(port))) continue
    if ((await Promise.all(ports.map(canBind))).every(Boolean)) return first
  }
  throw new Error(`No free test port range between ${FIRST_PORT} and ${LAST_PORT}`)
}
