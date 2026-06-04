import { describe, it, expect } from 'vitest'
import { patchCatalogGenerated, patchRegisterAll } from '../code-gen'

describe('patchRegisterAll', () => {
  const baseExisting = `// GENERATED ...
import './catalog'

import { A100_Curator } from './A/A100_Curator'
import { CUSTOM_ExistingA } from './community/CUSTOM_ExistingA'
import { CUSTOM_ExistingZ } from './community/CUSTOM_ExistingZ'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'A100_Curator': A100_Curator.impl,
  'CUSTOM_ExistingA': CUSTOM_ExistingA.impl,
  'CUSTOM_ExistingZ': CUSTOM_ExistingZ.impl,
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
      /CUSTOM_ExistingA.*\n.*CUSTOM_ExistingM.*\n.*CUSTOM_ExistingZ/s,
    )
    // entry order: same
    expect(patched).toMatch(
      /'CUSTOM_ExistingA'.*\n.*'CUSTOM_ExistingM': CUSTOM_ExistingM\.impl,\n.*'CUSTOM_ExistingZ'/s,
    )
  })

  it('appends when no existing CUSTOM_ imports', () => {
    const existing = `// GENERATED ...
import './catalog'

import { A100_Curator } from './A/A100_Curator'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'A100_Curator': A100_Curator.impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`
    const patched = patchRegisterAll(existing, { card_id: 'CUSTOM_First' })
    expect(patched).toContain(
      `import { CUSTOM_First } from './community/CUSTOM_First'`,
    )
    expect(patched).toContain(`'CUSTOM_First': CUSTOM_First.impl,`)
  })

  it('inserts CUSTOM imports before later deck ids in generated global order', () => {
    const existing = `// GENERATED ...
import './catalog'

import { C99_Source } from './C/C99_Source'
import { D1_Source } from './D/D1_Source'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'C99_Source': C99_Source.impl,
  'D1_Source': D1_Source.impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`
    const patched = patchRegisterAll(existing, { card_id: 'CUSTOM_First' })
    expect(patched).toMatch(/C99_Source.*\n.*CUSTOM_First.*\n.*D1_Source/s)
    expect(patched).toMatch(/'C99_Source'.*\n.*'CUSTOM_First': CUSTOM_First\.impl,\n.*'D1_Source'/s)
  })

  it('is idempotent when card already present', () => {
    const existing = `// GENERATED ...
import { CUSTOM_X } from './community/CUSTOM_X'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'CUSTOM_X': CUSTOM_X.impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`
    expect(patchRegisterAll(existing, { card_id: 'CUSTOM_X' })).toBe(existing)
  })
})

describe('patchCatalogGenerated', () => {
  const baseCatalog = `// generated
export const catalogCardDefinitions = [
  {
    "id": "C99_Source",
    "name": "C",
    "deck": "C",
    "number": 99,
    "desc": [],
    "kind": "minor"
  },
  {
    "id": "D1_Source",
    "name": "D",
    "deck": "D",
    "number": 1,
    "desc": [],
    "kind": "minor"
  },
]
`

  it('inserts new Card Source metadata in id order', () => {
    const cardContent = `
import { defineMinorCard } from '../card-source'
const CARD_ID = 'CUSTOM_First'
export const CUSTOM_First = defineMinorCard({
  meta: { id: CARD_ID, name: 'First', deck: 'community', number: 0, desc: [], cost: {}, vp: 1 },
  impl: { effect: { id: CARD_ID } },
})
`.trim()
    const patched = patchCatalogGenerated(baseCatalog, {
      card_id: 'CUSTOM_First',
      card_type: 'minor',
      card_content: cardContent,
    })
    expect(patched).toMatch(/"id": "C99_Source"[\s\S]*"id": "CUSTOM_First"[\s\S]*"id": "D1_Source"/)
    expect(patched).toContain(`"kind": "minor"`)
    expect(patched).toContain(`"vp": 1`)
  })

  it('is idempotent when catalog already contains the card', () => {
    expect(patchCatalogGenerated(baseCatalog, {
      card_id: 'C99_Source',
      card_type: 'minor',
      card_content: '',
    })).toBe(baseCatalog)
  })
})
