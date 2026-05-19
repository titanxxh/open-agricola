import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  GameState,
  PlayerState,
} from '../../contract/types'
import { getOccupation } from '../../cards/registry-display'
import { getCardModifiers } from '../../cards/card-modifiers'
import { activateCard } from './activate-card'
import { incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import {
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../cards/card-listeners'
import { createEventQuery } from '../../events/query'
import type { ActionHookPhase } from '../hooks'

export type ApplyOccupationPlayParams = {
  occupationId: string
}

const isApplyOccupationPlayParams = (
  raw: unknown,
): raw is ApplyOccupationPlayParams => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return typeof r.occupationId === 'string' && r.occupationId.length > 0
}

const applyOccupation = (
  state: GameState,
  player: PlayerState,
  occupationId: string,
) => {
  player.occupationHand = player.occupationHand.filter(
    (id) => id !== occupationId,
  )
  if (!player.occupationPlayed.includes(occupationId)) {
    player.occupationPlayed.push(occupationId)
  }
  incOccupationBuilt(player)
  recordDraftPlayed(player, occupationId, state.round)
  getCardModifiers(occupationId).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
}

/**
 * Finalize leaf for the occupation flow. Mirrors apply-improvement: pay leaf
 * runs first inside `seq:[pay, apply-occupation-play]`, then apply-* mutates
 * occupation state. The pay leaf stashes paymentInfo via the seq-shared
 * `_pendingImprovementPaymentInfo` field; we don't read it here today but
 * the C116 listener (see C116_FurnitureMaker) reads `extraData.resourcesPaid`
 * straight off the pay leaf event, which is more accurate than the legacy
 * "reconstruct lessons cost" branch in occupation.ts.
 */
export const applyOccupationPlayAction: ActionDefinition = {
  id: 'apply-occupation-play',
  // Inherit the play-occupation label so the leaf-action-detail flush emits
  // log.actionDetail with the wrapper's name (matches B107 / FurnitureMaker
  // log assertions that look for "play-occupation" in the action key).
  nameKey: 'actions.lessons.name',
  descriptionKey: 'actions.apply-occupation-play.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, state, sourceCard, eventSink }): ActionExecutionResult => {
    if (!isApplyOccupationPlayParams(params)) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    const { occupationId } = params
    const occupation = getOccupation(occupationId)
    if (!occupation) {
      return { type: 'fail', errorKey: 'log.occupationFail' }
    }
    // Pop the seq-shared stash that the pay leaf wrote so we can echo
    // `resourcesPaid` back into log.playOccupation. Apply-occupation-play
    // doesn't currently pass it onwards (no occupation onBuy keys on
    // returnedCardId today), but pop here regardless so it doesn't leak
    // into the next pay leaf.
    delete player._pendingImprovementPaymentInfo
    void sourceCard
    applyOccupation(state, player, occupationId)
    eventSink?.emit<'card.played'>({
      type: 'card.played',
      cardId: occupationId,
      cardType: 'occupation',
    })

    // Combine effect.onBuy (from card definitions) with the just-played
    // card's own 'after play-occupation' listener. The outer engine collects
    // 'after' listeners BEFORE the seq flow runs, so its scope check sees
    // the pre-mutate occupationPlayed list and misses self-trigger cards
    // (B155 ArtTeacher, E89 Stallwright, E101 Blighter etc.). We fire those
    // listeners here, after mutate, mirroring BGA's onPlayerAfterPlayOccupation
    // semantics on the just-played card.
    const activation = activateCard(state, player, occupationId, 'onBuy')
    const selfFlows: ActionFlow[] = []
    const baseListenerCtx: CardListenerContext = {
      state,
      player,
      space: { id: '' } as never,
      actionId: 'play-occupation',
      phase: 'after' as ActionHookPhase,
      transactionEvents: [],
      eventQuery: createEventQuery([]),
      choice: occupationId,
    }
    for (const reg of getRegisteredCardListeners()) {
      if (!reg.cardIds || !reg.cardIds.includes(occupationId)) continue
      if (reg.actions && !reg.actions.includes('play-occupation')) continue
      if (reg.phases && !reg.phases.includes('after' as ActionHookPhase)) continue
      const result = reg.handler(baseListenerCtx)
      if (result?.flow) {
        selfFlows.push(result.flow)
      }
    }
    let combinedFlow: ActionFlow | null = null
    if (activation.type === 'flow' && selfFlows.length > 0) {
      combinedFlow = {
        type: 'seq',
        children: [activation.flow, ...selfFlows],
      }
    } else if (activation.type === 'flow') {
      combinedFlow = activation.flow
    } else if (selfFlows.length === 1) {
      combinedFlow = selfFlows[0]!
    } else if (selfFlows.length > 1) {
      combinedFlow = { type: 'seq', children: selfFlows }
    }
    if (combinedFlow) {
      return {
        type: 'flow',
        flow: combinedFlow,
      }
    }
    return { type: 'ok' }
  },
}
