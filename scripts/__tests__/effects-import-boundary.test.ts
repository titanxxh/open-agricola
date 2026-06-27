import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED_EFFECT_FILES } from '../check-effects-file-list'

const topLevelHelperFiles = [
  'exchange-resources.ts',
  'exchange-to-trade.ts',
  'trade-applied-listener.ts',
]

const walkTsFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walkTsFiles(full))
    if (stat.isFile() && entry.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('effects import boundary', () => {
  it('keeps pure trade helpers out of the top-level effects allow-list', () => {
    expect(ALLOWED_EFFECT_FILES).not.toEqual(expect.arrayContaining(topLevelHelperFiles))
  })

  it('keeps payment internals from importing top-level effects helpers', () => {
    const paymentInternalDir = path.join(process.cwd(), 'shared/actions/payment/internal')
    const offenders = walkTsFiles(paymentInternalDir)
      .filter((file) =>
        /from ['"]\.\.\/\.\.\/effects\/(?:exchange-resources|exchange-to-trade|trade-applied-listener)['"]/.test(
          readFileSync(file, 'utf8'),
        ))
      .map((file) => path.relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })
})
