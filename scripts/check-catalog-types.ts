/**
 * CI check: enforce that `minorImprovementCards` contains only MinorImprovement
 * (or PlayerActionCard) instances, and `occupationCards` contains only
 * Occupation instances. Prevents regression of issue #10.
 */
// Force module load order so catalog's TDZ resolves.
import '../server/game/authoritative-session'
import '../shared/cards/register-all'
import { minorImprovementCards, occupationCards } from '../shared/cards/catalog'
import {
  MinorImprovement,
  Occupation,
  PlayerActionCard,
} from '../shared/cards-display/types'

const misInOcc = occupationCards.filter(
  (c) => c instanceof MinorImprovement || c instanceof PlayerActionCard,
)
const misInMinor = minorImprovementCards.filter((c) => c instanceof Occupation)

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
