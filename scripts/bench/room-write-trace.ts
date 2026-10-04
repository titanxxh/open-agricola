import { createReadStream, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

type WriteKind = 'db' | 'wal' | 'sqliteTemp'
type WriteTotals = Record<WriteKind, number> & { calls: number }
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('usage: room-write-trace.ts <strace.log> <report.json>')

// Count completed bytes only within the frozen harness workload markers.
// strace -f may split a syscall around another thread's output; retain its
// original workload and file kind until that thread resumes the same syscall.
const totals: Record<string, WriteTotals> = {}
const pending = new Map<string, { workload: string; kind: WriteKind }>()
let active: string | undefined
const lines = createInterface({ input: createReadStream(input), crlfDelay: Infinity })
for await (const line of lines) {
  const pid = line.split(' ', 1)[0]!
  const resumed = /<\.\.\. (pwrite64|write|writev) resumed>/.exec(line)
  const pendingKey = `${pid}:${resumed?.[1]}`
  const saved = resumed ? pending.get(pendingKey) : undefined
  if (saved) pending.delete(pendingKey)
  const marker = /OA_TRACE_(BEGIN|END) ([24])/.exec(line)
  if (marker) {
    active = marker[1] === 'BEGIN' ? marker[2] : undefined
    if (active) totals[active] ??= { db: 0, wal: 0, sqliteTemp: 0, calls: 0 }
    continue
  }
  const database = /(pwrite64|write|writev)\(\d+<[^>]+\/probe\.db(-wal)?>/.exec(line)
  const temporary = /(pwrite64|write|writev)\(\d+<[^>]+\/etilqs_[^>]+>/.exec(line)
  let write = saved
  if (!write && active && (database || temporary)) {
    write = { workload: active, kind: temporary ? 'sqliteTemp' : database?.[2] ? 'wal' : 'db' }
    if (line.includes('<unfinished ...>')) {
      pending.set(`${pid}:${(temporary ?? database)![1]}`, write)
      continue
    }
  }
  if (!write) continue
  const bytes = /= (\d+)\s*$/.exec(line)
  if (!bytes) throw new Error(`Cannot parse completed database write: ${line}`)
  totals[write.workload]![write.kind] += Number(bytes[1])
  totals[write.workload]!.calls++
}
if (pending.size) throw new Error('Trace ended with unfinished database writes')
if (Object.keys(totals).sort().join(',') !== '2,4') throw new Error('Expected both workload markers')
writeFileSync(output, `${JSON.stringify(totals, null, 2)}\n`)
