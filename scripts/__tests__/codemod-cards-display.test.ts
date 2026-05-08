import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { splitCardFile } from '../codemod-cards-display'

const fixturesDir = resolve(__dirname, 'fixtures/cards-display-codemod')

const readFixture = (relPath: string): string =>
  readFileSync(resolve(fixturesDir, relPath), 'utf8')

const FIXTURES_SPLIT = [
  'A/A1_Shelter',
  'B/B30_WoodPalisades',
  'C/C146_WorkshopAssistant',
  'D/D139_Chairman',
]

describe('codemod-cards-display: splitCardFile', () => {
  for (const id of FIXTURES_SPLIT) {
    it(`${id} — splits cleanly`, () => {
      const input = readFixture(`${id}.ts`)
      const expectedDisplay = readFixture(`${id}.expected.display.ts`)
      const expectedImpl = readFixture(`${id}.expected.impl.ts`)
      const result = splitCardFile({
        sourcePath: `shared/cards/${id}.ts`,
        sourceText: input,
      })
      expect(result.kind).toBe('split')
      if (result.kind !== 'split') return
      expect(result.displayText.trim()).toBe(expectedDisplay.trim())
      expect(result.implText.trim()).toBe(expectedImpl.trim())
    })
  }

  it('E149_MidnightFencer — display-only (no _impl)', () => {
    const input = readFixture('E/E149_MidnightFencer.ts')
    const result = splitCardFile({
      sourcePath: 'shared/cards/E/E149_MidnightFencer.ts',
      sourceText: input,
    })
    expect(result.kind).toBe('display-only')
  })

  it('major/joinery — display-only (MajorCardData type annotation)', () => {
    const input = readFixture('major/joinery.ts')
    const result = splitCardFile({
      sourcePath: 'shared/cards/major/joinery.ts',
      sourceText: input,
    })
    expect(result.kind).toBe('display-only')
    if (result.kind !== 'display-only') return
    // Major files are emitted verbatim — display-only path returns sourceText unchanged.
    expect(result.displayText).toBe(input)
  })
})
