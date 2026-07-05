import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = process.cwd()

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') return []
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(fullPath)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })

const importsPaymentInternal = (source: string): boolean =>
  /from\s+['"][^'"]*payment\/internal(?:\/|['"])/.test(source)

const isPaymentFile = (path: string): boolean =>
  path.split(sep).join('/').includes('/shared/actions/payment/')

describe('payment import boundary', () => {
  it('keeps production and non-payment tests off payment/internal', () => {
    const offenders = sourceFiles(root)
      .filter((file) => !isPaymentFile(file))
      .filter((file) => importsPaymentInternal(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).split(sep).join('/'))
      .sort()

    expect(offenders).toEqual([])
  })
})
