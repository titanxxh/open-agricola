import { registerCardEffect, type CardEffect } from '../shared/cards/card-effects.ts'
import { registerCardListener } from '../shared/cards/card-listeners.ts'
import type { PaymentInfo } from '../shared/cards/card-effects.ts'
import type { CardListenerContext } from '../shared/cards/card-listeners.ts'
import type { GameState, PlayerState } from '../shared/game/types.ts'
import { getCurrentSessionContext, type CustomCardData } from '../shared/cards/session-card-context.ts'
import { invokeCustomCodeEffectSync, invokeCustomCodeListenerSync } from './custom-code-executor/client.ts'

export const registerExecutorBackedCustomCard = (cardData: CustomCardData): void => {
  const { cardJson, compiledCode, codeManifest } = cardData
  if (!compiledCode || !codeManifest) return

  const cardId = cardJson.id
  const effect: CardEffect = { id: cardId }
  for (const hook of codeManifest.effectHooks) {
    ;(effect as Record<string, unknown>)[hook] = (
      state: GameState,
      player: PlayerState,
      paymentInfo?: PaymentInfo,
    ) => {
      const response = invokeCustomCodeEffectSync({
        compiledCode,
        cardId,
        hook,
        state,
        player,
        paymentInfo,
      })
      if (!response.ok) {
        console.warn(`[custom-code-runtime] custom card ${cardId} hook "${hook}" failed:`, response.error)
        return undefined
      }
      return response.result ?? undefined
    }
  }

  // Register into session context if active, otherwise global (for tests)
  const sessionCtx = getCurrentSessionContext()
  if (codeManifest.effectHooks.length > 0) {
    if (sessionCtx) {
      sessionCtx.registerEffect(effect)
    } else {
      registerCardEffect(effect)
    }
  }

  for (const listener of codeManifest.listeners) {
    const reg = {
      id: listener.registrationId,
      cardIds: listener.cardIds,
      actions: listener.actions,
      phases: listener.phases,
      order: listener.order,
      scope: listener.scope,
      handler: (context: CardListenerContext) => {
        const response = invokeCustomCodeListenerSync({
          compiledCode,
          cardId,
          registrationId: listener.registrationId,
          context,
        })
        if (!response.ok) {
          console.warn(`[custom-code-runtime] custom card ${cardId} listener "${listener.registrationId}" failed:`, response.error)
          return undefined
        }
        return response.result ?? undefined
      },
    }
    if (sessionCtx) {
      sessionCtx.registerListener(reg)
    } else {
      registerCardListener(reg)
    }
  }
}
