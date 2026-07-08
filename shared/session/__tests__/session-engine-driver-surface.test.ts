import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')

describe('Session Engine Driver surface', () => {
  it('keeps concrete engine nodes and internals out of session-core', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'shared/session/session-core.ts'), 'utf8')

    expect(source).not.toMatch(/\bActionNode\b/)
    expect(source).not.toMatch(/\bOrNode\b/)
    expect(source).not.toMatch(/\bXorNode\b/)
    expect(source).not.toContain('._internals(')
  })
})
