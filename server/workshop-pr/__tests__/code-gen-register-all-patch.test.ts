import { describe, it, expect } from 'vitest'
import { patchRegisterAll } from '../code-gen'

describe('patchRegisterAll', () => {
  const baseExisting = `// GENERATED ...
import './catalog'

import { A100_Curator_impl } from './A/A100_Curator'
import { CUSTOM_ExistingA_impl } from './community/CUSTOM_ExistingA'
import { CUSTOM_ExistingZ_impl } from './community/CUSTOM_ExistingZ'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'A100_Curator': A100_Curator_impl,
  'CUSTOM_ExistingA': CUSTOM_ExistingA_impl,
  'CUSTOM_ExistingZ': CUSTOM_ExistingZ_impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`

  it('inserts new import and entry in alphabetical order within community section', () => {
    // Use CUSTOM_ExistingM so it sorts between CUSTOM_ExistingA and CUSTOM_ExistingZ.
    const patched = patchRegisterAll(baseExisting, {
      card_id: 'CUSTOM_ExistingM',
    })
    // import order: ExistingA < ExistingM < ExistingZ
    expect(patched).toMatch(
      /CUSTOM_ExistingA_impl.*\n.*CUSTOM_ExistingM_impl.*\n.*CUSTOM_ExistingZ_impl/s,
    )
    // entry order: same
    expect(patched).toMatch(
      /'CUSTOM_ExistingA'.*\n.*'CUSTOM_ExistingM': CUSTOM_ExistingM_impl,\n.*'CUSTOM_ExistingZ'/s,
    )
  })

  it('appends when no existing CUSTOM_ imports', () => {
    const existing = `// GENERATED ...
import './catalog'

import { A100_Curator_impl } from './A/A100_Curator'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'A100_Curator': A100_Curator_impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`
    const patched = patchRegisterAll(existing, { card_id: 'CUSTOM_First' })
    expect(patched).toContain(
      `import { CUSTOM_First_impl } from './community/CUSTOM_First'`,
    )
    expect(patched).toContain(`'CUSTOM_First': CUSTOM_First_impl,`)
  })

  it('is idempotent when card already present', () => {
    const existing = `// GENERATED ...
import { CUSTOM_X_impl } from './community/CUSTOM_X'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'CUSTOM_X': CUSTOM_X_impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`
    expect(patchRegisterAll(existing, { card_id: 'CUSTOM_X' })).toBe(existing)
  })
})
