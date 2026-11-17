import { createServer } from 'node:net'

// Linux hands out listen(0) ports from 32768–60999 and macOS from 49152–65535.
// An isolated app binds its ports only after dependencies and builds are ready,
// so pick them below both ranges: a parallel test's listen(0) cannot take one
// in the meantime.
const FIRST_PORT = 20_000
const LAST_PORT = 32_767

/**
 * TEST_PORT_RANGE=<first>-<last> narrows allocation to a sub-range of 20000–32767. Concurrent verification tasks on one
 * machine (owner-local verification runs several at once) get disjoint ranges, so two of them never pick the same port
 * between allocation and bind.
 */
export function testPortRange(env: NodeJS.ProcessEnv = process.env): [number, number] {
  const value = env.TEST_PORT_RANGE
  if (!value) return [FIRST_PORT, LAST_PORT]
  const match = /^(\d+)-(\d+)$/.exec(value)
  const first = Number(match?.[1]), last = Number(match?.[2])
  if (!match || first < FIRST_PORT || last > LAST_PORT || last - first < 63) throw new Error(`TEST_PORT_RANGE must be first-last within ${FIRST_PORT}-${LAST_PORT}, at least 64 ports`)
  return [first, last]
}

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
  const [low, high] = testPortRange()
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const first = low + Math.floor(Math.random() * (high - low + 2 - span))
    const ports = Array.from({ length: span }, (_, offset) => first + offset)
    if (ports.some(port => excluded.has(port))) continue
    if ((await Promise.all(ports.map(canBind))).every(Boolean)) return first
  }
  throw new Error(`No free test port range between ${low} and ${high}`)
}
