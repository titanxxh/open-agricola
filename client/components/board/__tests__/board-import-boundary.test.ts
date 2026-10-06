import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const boardDir = new URL('..', import.meta.url).pathname

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.(ts|tsx)$/.test(entry) ? [path] : []
  })

describe('board import boundary', () => {
  it('keeps board components from importing shared card implementations', () => {
    const offenders = filesUnder(boardDir)
      .filter((path) => !path.includes('/__tests__/'))
      .filter((path) => readFileSync(path, 'utf8').includes(`shared/${'cards'}/`))
      .map((path) => relative(boardDir, path))

    expect(offenders).toEqual([])
  })
})
