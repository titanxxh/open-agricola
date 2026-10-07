import { describe, expect, it } from 'vitest'
import { isPendingChoiceValueAllowed } from '../pending-validation'
import type { PendingEnvelope } from '../types'

const envelope = (minSelections = 1): PendingEnvelope => ({
  hostNodeId: 'bounded-choice',
  request: {
    kind: 'choice',
    options: [
      { value: 'a', labelKey: 'test.a' },
      { value: 'b', labelKey: 'test.b' },
      { value: 'c', labelKey: 'test.c' },
      { value: 'disabled', labelKey: 'test.disabled', disabled: true },
    ],
    multiSelect: { valuePrefix: 'subset:', minSelections, maxSelections: 2 },
    structuredChoicePrefixes: ['subset:'],
  },
})

describe('bounded choice subset validation', () => {
  it.each(['subset:a', 'subset:a,b', 'subset:b,a'])('accepts available unique subsets: %s', (value) => {
    expect(isPendingChoiceValueAllowed(envelope(), value)).toBe(true)
  })

  it.each(['subset:', 'subset:a,b,c', 'subset:a,a', 'subset:unknown', 'subset:disabled',
    'subset:a,', 'subset:,a', 'a', 'wrong:a'])('rejects invalid subsets before structured prefix fallback: %s', (value) => {
    expect(isPendingChoiceValueAllowed(envelope(), value)).toBe(false)
  })

  it('allows an empty subset only when the minimum permits it', () => {
    expect(isPendingChoiceValueAllowed(envelope(0), 'subset:')).toBe(true)
  })
})
