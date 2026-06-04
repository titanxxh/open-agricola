import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('card sprite CSS', () => {
  it('keeps alternative cost slash separators visible', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).not.toContain('.card-cost-alt .card-cost-separator {\n  display: none;')
    expect(css).toContain('.card-cost-alt .card-cost-separator {\n  display: inline-block;')
  })
})
