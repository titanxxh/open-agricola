import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { splitCardFile } from '../codemod-cards-display'

const fixturesDir = resolve(__dirname, 'fixtures/cards-display-codemod')

const readFixture = (relPath: string): string =>
  readFileSync(resolve(fixturesDir, relPath), 'utf8')

describe('codemod-cards-display: splitCardFile', () => {
  it('A1_Shelter — splits MinorImprovement display + _impl', () => {
    const input = readFixture('A/A1_Shelter.ts')
    const expectedDisplay = readFixture('A/A1_Shelter.expected.display.ts')
    const expectedImpl = readFixture('A/A1_Shelter.expected.impl.ts')

    const result = splitCardFile({
      sourcePath: 'shared/cards/A/A1_Shelter.ts',
      sourceText: input,
    })

    expect(result.kind).toBe('split')
    if (result.kind !== 'split') return
    expect(result.displayText.trim()).toBe(expectedDisplay.trim())
    expect(result.implText.trim()).toBe(expectedImpl.trim())
  })
})
