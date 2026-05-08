import { Occupation } from '../types'
import { isSpaceOccupied } from '../../domain/space'
import { jumpLeaf } from '../helpers/jump-leaf'
import type { CardImpl } from '../registry'

const CARD_ID = 'A151_Minstrel'

/**
 * A151 Minstrel:
 * At the start of each returning home phase, if only one stage-1 action space
 * card on round space 1 to 4 is unoccupied, you can use that action space.
 *
 * BGA A151_Minstrel.php uses useActionSpaceNode against the unoccupied stage-1
 * space. We mirror this with viaCardJump worker-less mode (jumpLeaf without
 * workerId): the engine expands the target space's full flow, accumulation
 * resources auto-clear via the action's execute, third-party listeners on the
 * second space fire, ReplaceHook / computeCosts / isDoable run identically to
 * a direct placement.
 *
 * Stage-1 actions: sheep-market, grain-utilization, fencing, major-improvement.
 */
const STAGE_1_ACTIONS = [
  'sheep-market',
  'grain-utilization',
  'fencing',
  'major-improvement',
] as const

export const A151_Minstrel = new Occupation({
  id: CARD_ID,
  name: 'Minstrel',
  deck: 'A',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the start of each returning home phase, if only one action space card on round space 1 to 4 is unoccupied, you can use that action space.'],
  cost: {},
  players: '4+',
  newSet: true,
})

export const A151_Minstrel_impl = {
  effect: {
    id: CARD_ID,
    onStartReturnHome: (state, _player) => {
      const unoccupied: string[] = []
      for (const actionId of STAGE_1_ACTIONS) {
        const space = state.actionSpaces.find((s) => s.id === actionId)
        if (!space) continue
        const roundOrder = state.roundActionOrder
        const posIndex = roundOrder.indexOf(actionId)
        if (posIndex < 0 || posIndex + 1 > state.round) continue
        if (!isSpaceOccupied(space)) unoccupied.push(actionId)
      }

      if (unoccupied.length !== 1) return

      const targetSpaceId = unoccupied[0]!

      return {
        type: 'seq',
        optional: true,
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            targetSpaceId,
            // workerId omitted — worker-less mode (no farmer in hand during
            // return-home phase).
          }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
