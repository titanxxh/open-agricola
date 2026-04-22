import { describe, it, expect } from 'vitest'
import { generateSmokeTest } from '../code-gen'

describe('generateSmokeTest', () => {
  it('generates a vitest file referencing the card', () => {
    const out = generateSmokeTest({ card_id: 'CUSTOM_Foo' })
    expect(out).toContain(`from 'vitest'`)
    expect(out).toContain(
      `import { CUSTOM_Foo, CUSTOM_Foo_impl } from '../CUSTOM_Foo'`,
    )
    expect(out).toContain(`expect(CUSTOM_Foo.id).toBe('CUSTOM_Foo')`)
    expect(out).toContain(`expect(CUSTOM_Foo.deck).toBe('community')`)
  })
})
