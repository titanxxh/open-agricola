import { describe, expect, it } from 'vitest'

import { zh } from '../zh'

describe('zh platform translations', () => {
  it('uses drafting terminology for draft game setup', () => {
    expect(zh.platform.draftModeSimultaneous).toBe('轮抽')
    expect(zh.platform.draftPoolSizeLabel).toBe('轮抽池大小')
  })
})
