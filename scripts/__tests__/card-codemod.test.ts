import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { transformCardFile } from '../card-codemod'

const fixturesDir = path.resolve(__dirname, 'fixtures/codemod-samples')

function loadPair(name: string): { before: string; after: string } {
  return {
    before: fs.readFileSync(path.join(fixturesDir, `before_${name}.ts`), 'utf8'),
    after: fs.readFileSync(path.join(fixturesDir, `after_${name}.ts`), 'utf8'),
  }
}

describe('card-codemod transformCardFile', () => {
  it('removes top-level registerCardListener and appends _impl export (identifier arg)', () => {
    const { before, after } = loadPair('A107_Catcher')
    const result = transformCardFile(before, 'A107_Catcher.ts')
    expect(result.output.trim()).toBe(after.trim())
    expect(result.cardId).toBe('A107_Catcher')
    expect(result.collected.listeners).toHaveLength(1)
  })

  it('leaves cards without register* calls unchanged', () => {
    const { before } = loadPair('A123_FrameBuilder')
    const result = transformCardFile(before, 'A123_FrameBuilder.ts')
    expect(result.output).toBe(before)
  })

  it('handles inline object-literal registration', () => {
    const { before, after } = loadPair('inline_listener')
    const result = transformCardFile(before, 'TEST_1.ts')
    expect(result.output.trim()).toBe(after.trim())
  })

  it('reports cardId extracted from new Occupation literal when no CARD_ID const', () => {
    // TEST_1 fixture has no CARD_ID const — id is inline in `new Occupation({id: 'TEST_1', ...})`
    const { before } = loadPair('inline_listener')
    const result = transformCardFile(before, 'TEST_1.ts')
    expect(result.cardId).toBe('TEST_1')
  })

  it('idempotent: running on already-transformed output is a no-op', () => {
    const { after } = loadPair('A107_Catcher')
    const result = transformCardFile(after, 'A107_Catcher.ts')
    expect(result.output.trim()).toBe(after.trim())
  })
})
