import { type CardEffect } from '../../shared/cards/card-effects.ts'
import type { CardListenerContext } from '../../shared/cards/card-listeners.ts'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry.ts'
import { getCurrentSessionContext, type CustomCardData } from '../../shared/cards/session-card-context.ts'
import { normalizeCustomManifest } from '../../shared/custom-code/sandbox-declarations.ts'
import { customEffectFallback } from '../../shared/custom-code/runtime-capabilities.ts'
import { setCardListenerSource } from '../../shared/cards/card-listener-source.ts'
import { invokeCustomCodeEffectSync, invokeCustomCodeListenerSync } from './client.ts'

export const registerExecutorBackedCustomCard = (cardData: CustomCardData): void => {
  const { cardJson, compiledCode } = cardData
  const codeManifest = cardData.codeManifest && normalizeCustomManifest(cardData.codeManifest, cardJson.id)
  if (!compiledCode || !codeManifest) return

  const cardId = cardJson.id
  const sessionCtx = getCurrentSessionContext()
  const effect: CardEffect = { id: cardId }
  for (const hook of codeManifest.effectHooks) {
    ;(effect as Record<string, unknown>)[hook] = (
      ...args: unknown[]
    ) => {
      const response = invokeCustomCodeEffectSync({
        compiledCode,
        cardId,
        hook,
        args,
      })
      if (!response.ok) {
        const warning = `Custom card ${cardId} hook "${hook}" failed: ${response.error}`
        console.warn(`[custom-code-runtime] ${warning}`)
        sessionCtx?.reportWarning(warning)
        return customEffectFallback(hook)
      }
      return response.result ?? customEffectFallback(hook)
    }
  }
  if (codeManifest.effectMetadata) {
    Object.assign(effect, codeManifest.effectMetadata)
  }

  // Register into session context when one is active; otherwise write
  // directly to the active CardRegistry (test-only path).
  if (codeManifest.effectHooks.length > 0 || codeManifest.effectMetadata) {
    if (sessionCtx) {
      sessionCtx.registerEffect(effect)
    } else {
      requireActiveCardRegistry('registerExecutorBackedCustomCard').setEffect(effect)
    }
  }

  for (const listener of codeManifest.listeners) {
    const { registrationId, ...declaration } = listener
    const reg = {
      ...declaration,
      id: registrationId,
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
          const warning = `Custom card ${cardId} listener "${listener.registrationId}" failed: ${response.error}`
          console.warn(`[custom-code-runtime] ${warning}`)
          sessionCtx?.reportWarning(warning)
          return undefined
        }
        return response.result ?? undefined
      },
    }
    setCardListenerSource(reg, cardId)
    if (sessionCtx) {
      sessionCtx.registerListener(reg)
    } else {
      requireActiveCardRegistry('registerExecutorBackedCustomCard').registerListener(reg)
    }
  }
}
