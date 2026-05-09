import type { ActionDefinition, ActionFlow, Resource } from '../../contract/types'
import { fieldTopStack, fieldTotalRemaining } from '../../domain/field'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'E73_Scythe'

const HARVEST_ACTION_ID = 'card_E73_Scythe_harvest-field'

/**
 * E73 Scythe — BGA: during the field phase of each harvest, select exactly
 * one of your fields and harvest *all* the crops planted in it (every stack).
 *
 * Trigger condition mirrors BGA `getFields()`: only fields with **at least 2
 * crops total** (across all stacks) qualify. Single-crop fields don't —
 * those are reaped normally by the main reap path with no benefit.
 *
 * Implementation note: instead of BGA's `setScytheField` token + special-case
 * in the main reap loop, we keep the rule card-local — the chosen field is
 * fully drained here, then the main reap path's `fieldTopStack(field)` check
 * naturally skips it (empty field → no top stack). This avoids touching
 * `shared/actions/effects/reap.ts`.
 */
const scytheHarvestFieldAction: ActionDefinition = {
  id: HARVEST_ACTION_ID,
  nameKey: 'actions.scythe-harvest-field.name',
  descriptionKey: 'actions.scythe-harvest-field.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const fieldIndex = params?.fieldIndex as number | undefined
    if (fieldIndex === undefined) return { type: 'fail', logKey: 'log.actionFail' }
    const field = player.fields[fieldIndex]
    if (!field || field.stacks.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
    // Reap the entire field — every stack — in one go.
    const gained: Partial<Resource> = {}
    for (const stack of field.stacks) {
      const amount = stack.remaining
      if (amount <= 0) continue
      const crop = stack.kind
      player.resources[crop] = (player.resources[crop] ?? 0) + amount
      gained[crop] = (gained[crop] ?? 0) + amount
    }
    field.stacks = []
    return {
      type: 'ok',
      resourcesGained: gained,
      logKey: 'log.cardEffectGain',
      logParams: { gain: gained, cardId: sourceCard },
    }
  },
}

registerAdHocAction(scytheHarvestFieldAction)

export const E73_Scythe_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    // BGA `getFields()` filter: count(crops) >= 2 (multi-crop fields).
    const harvestable = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => fieldTotalRemaining(field) >= 2)
    if (harvestable.length === 0) return
    const children: ActionFlow[] = harvestable.map(({ field, index }) => {
      const top = fieldTopStack(field)
      const total = fieldTotalRemaining(field)
      return {
        type: 'leaf' as const,
        actionId: HARVEST_ACTION_ID,
        params: { fieldIndex: index },
        sourceCard: CARD_ID,
        choiceLabelKey: 'ui.interactionScytheField',
        choiceLabelParams: { crop: top?.kind ?? null, amount: total },
      }
    })
    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
