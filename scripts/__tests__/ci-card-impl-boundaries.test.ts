import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('CI card implementation boundary guard', () => {
  it('runs the card implementation boundary guard in the verify job', () => {
    const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8')

    expect(workflow).toContain('pnpm run check:card-impl-boundaries')
  })
})
