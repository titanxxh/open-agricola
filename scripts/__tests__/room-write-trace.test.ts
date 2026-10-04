import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directories: string[] = []
const parser = fileURLToPath(new URL('../bench/room-write-trace.ts', import.meta.url))
const parse = (trace: string): unknown => {
  const directory = mkdtempSync(join(tmpdir(), 'oa-write-trace-'))
  directories.push(directory)
  const input = join(directory, 'writes.trace')
  const output = join(directory, 'report.json')
  writeFileSync(input, trace)
  execFileSync(process.execPath, ['--import', 'tsx', parser, input, output], { stdio: 'pipe' })
  return JSON.parse(readFileSync(output, 'utf8'))
}
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('workload DB/WAL syscall evidence', () => {
  it('counts completed writes, including resumed calls, and separates temporary files from DB/WAL', () => {
    expect(parse(`100 pwrite64(3</tmp/probe.db>, "preparation", 11, 0) = 11
100 write(2</tmp/stdout>, "OA_TRACE_BEGIN 2", 16) = 16
100 pwrite64(3</tmp/probe.db>, "1234567", 7, 0) = 7
100 pwrite64(4</tmp/probe.db-wal>, "123456789012", 12, 0 <unfinished ...>
200 write(5</tmp/unrelated>, "other", 5) = 5
100 <... pwrite64 resumed>) = 12
100 write(6</tmp/etilqs_temp>, "temporary", 9) = 9
100 write(2</tmp/stdout>, "OA_TRACE_END 2", 14) = 14
100 write(2</tmp/stdout>, "OA_TRACE_BEGIN 4", 16) = 16
100 pwrite64(3</tmp/probe.db>, "12345", 5, 0) = 5
100 write(2</tmp/stdout>, "OA_TRACE_END 4", 14) = 14
100 pwrite64(3</tmp/probe.db>, "close", 5, 0) = 5
`)).toEqual({
      2: { db: 7, wal: 12, sqliteTemp: 9, calls: 3 },
      4: { db: 5, wal: 0, sqliteTemp: 0, calls: 1 },
    })
  })

  it.each([
    ['truncated workload', 'OA_TRACE_BEGIN 2\nOA_TRACE_END 2\nOA_TRACE_BEGIN 4\n'],
    ['repeated workload', 'OA_TRACE_BEGIN 2\nOA_TRACE_END 2\nOA_TRACE_BEGIN 2\nOA_TRACE_END 2\nOA_TRACE_BEGIN 4\nOA_TRACE_END 4\n'],
    ['mismatched end', 'OA_TRACE_BEGIN 2\nOA_TRACE_END 4\nOA_TRACE_BEGIN 4\nOA_TRACE_END 4\n'],
    ['unfinished write', '100 OA_TRACE_BEGIN 2\n100 pwrite64(3</tmp/probe.db>, "x", 1, 0 <unfinished ...>\n100 OA_TRACE_END 2\n100 OA_TRACE_BEGIN 4\n100 OA_TRACE_END 4\n'],
  ])('rejects %s rather than reporting incomplete cumulative bytes', (_description, trace) => {
    expect(() => parse(trace)).toThrow()
  })
})
