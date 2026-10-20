import { describe, expect, it } from 'vitest'
import { validateAndCompileCustomCode } from '../../server/custom-code/engine'
import { validateAndCompileCustomCodeLocal } from '../../client/local-sandbox/browser-executor'

const source = `
const CARD_ID = 'CUSTOM_Gate'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Gate' })
const CARD_IMPL = { listeners: [{ actions: ['collect'], phases: ['after'], handler: () => {} }] }
`

describe.each([
  ['server', validateAndCompileCustomCode],
  ['browser', validateAndCompileCustomCodeLocal],
] as const)('%s Workshop listener admission', (_name, compile) => {
  it('rejects an unopened native selector while preserving legal rule-action source', () => {
    const valid = compile(source, 'CUSTOM_Gate')
    expect(valid).toMatchObject({ valid: true, manifest: { listeners: [{ actions: ['collect'], phases: ['after'] }] } })
    for (const value of ["['fishing']", "'all'", 'undefined', '() => [\'fishing\']']) {
      const invalid = compile(source.replace("actions: ['collect']", `actionSpaces: ${value}, actions: ['collect']`), 'CUSTOM_Gate')
      expect(invalid).toEqual({ valid: false, errors: [expect.stringContaining("unsupported listener field 'actionSpaces'")] })
    }
  })
})
