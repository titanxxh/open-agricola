import { MinorImprovement } from '../types'
import { ensureCardState } from '../helpers/card-state'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import { familySize, newbornCount } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E30_ChildsToy'

// BGA isBuyable: countFarmers(ADULT) != 2 → false. Adults = active workers that
// are not newborns.
registerPrerequisite('Exactly 2 Adults', (player) => familySize(player) - newbornCount(player) === 2)

export const E30_ChildsToy = new MinorImprovement({
  id: CARD_ID,
  name: "Child's Toy",
  deck: 'E',
  number: 30,
  category: 'BONUS_POINTS_-_GET',
  desc: ['During the feeding phase of each harvest, your newborns require 2 <FOOD> (instead of 1).'],
  cost: { wood: 1 },
  altCosts: [{ clay: 1 }],
  vp: 2,
  prerequisite: 'Exactly 2 Adults',
})

export const E30_ChildsToy_impl = {
  effect: {
  id: CARD_ID,
  onBeforeFeed: (_state, player) => {
    // BGA: $E30tax = countFarmers(CHILD) * hasPlayedCard('E30_ChildsToy') added to harvestCost.
    // Effectively: each newborn requires 2 food instead of 1 during feeding only.
    // We snapshot the newborn ids and clear isNewborn so feedFamily/executeFeedingLogic's
    // newborn discount (Math.min(newbornCount, size)) becomes 0. onAfterFeed restores
    // the original newborn flags so post-feed listeners (e.g. A35 SwimmingClass at
    // onStartReturnHome, A92 AdoptiveParents) still observe the true newborn state.
    const cs = ensureCardState(player, CARD_ID)
    const snapshot: string[] = []
    for (const w of player.workers) {
      if (w.isActive && w.isNewborn) {
        snapshot.push(w.id)
        w.isNewborn = false
      }
    }
    cs.extraData = { ...(cs.extraData ?? {}), suppressedNewbornIds: snapshot }
  },
  onAfterFeed: (_state, player) => {
    const cs = player.cardStates?.[CARD_ID]
    const ids = cs?.extraData?.suppressedNewbornIds as string[] | undefined
    if (!ids || ids.length === 0) return
    const idSet = new Set(ids)
    for (const w of player.workers) {
      if (idSet.has(w.id) && w.isActive) w.isNewborn = true
    }
    if (cs?.extraData) {
      const next = { ...cs.extraData }
      delete next.suppressedNewbornIds
      cs.extraData = next
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
