/**
 * CI check: enforce that catalog arrays contain the expected card kinds.
 */
// Force module load order so catalog's TDZ resolves.
import '../server/game/authoritative-session'
import '../shared/cards/register-all'
import { minorImprovementCards, occupationCards } from '../shared/cards/catalog'

const misInOcc = occupationCards.filter((c) => c.kind !== 'occupation')
const misInMinor = minorImprovementCards.filter(
  (c) => c.kind !== 'minor' && c.kind !== 'playerAction',
)

let failed = false

if (misInOcc.length > 0) {
  console.error(
    `[check-catalog-types] ${misInOcc.length} MinorImprovement(s) found in occupationCards:`,
  )
  for (const card of misInOcc) {
    console.error(`  - ${card.id}`)
  }
  failed = true
}

if (misInMinor.length > 0) {
  console.error(
    `[check-catalog-types] ${misInMinor.length} Occupation(s) found in minorImprovementCards:`,
  )
  for (const card of misInMinor) {
    console.error(`  - ${card.id}`)
  }
  failed = true
}

if (failed) {
  console.error(
    '\nSee issue #10 for background. Move each card to its correct catalog array.',
  )
  process.exit(1)
}

console.log(
  `[check-catalog-types] ok — minor: ${minorImprovementCards.length}, occupation: ${occupationCards.length}`,
)
