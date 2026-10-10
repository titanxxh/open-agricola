/**
 * Browser-local custom-card registrar — counterpart of
 * `server/custom-code/runtime.ts` with the isolated-vm executor calls
 * replaced by direct in-thread invocation (`browser-executor.ts`).
 * Injected into `GameCore` via `registerCustomCardImpl`.
 */
import { type CardEffect } from '../../shared/cards/card-effects.ts'
import type { PaymentInfo } from '../../shared/cards/card-effects.ts'
import type { CardListenerContext } from '../../shared/cards/card-listeners.ts'
import type { GameState, PlayerState } from '../../shared/contract/types.ts'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry.ts'
import { getCurrentSessionContext, type CustomCardData } from '../../shared/cards/session-card-context.ts'
import { setCardListenerSource } from '../../shared/cards/card-listener-source.ts'
import { boundListenerFilters, neutralEffectResult } from '../../shared/custom-code/contract-admission.ts'
import { assertSandboxListenerPhases } from '../../shared/custom-code/sandbox-listener-phases.ts'
import { invokeCustomCodeEffectLocal, invokeCustomCodeListenerLocal } from './browser-executor.ts'

export const registerBrowserBackedCustomCard = (cardData: CustomCardData): void => {
  const { cardJson, compiledCode, codeManifest } = cardData
  if (!compiledCode || !codeManifest) return
  assertSandboxListenerPhases(cardJson.id, codeManifest)

  const cardId = cardJson.id
  const sessionCtx = getCurrentSessionContext()
  const effect: CardEffect = { id: cardId }
  for (const hook of codeManifest.effectHooks) {
    ;(effect as Record<string, unknown>)[hook] = (
      state: GameState,
      player: PlayerState,
      paymentInfo?: PaymentInfo,
    ) => {
      const response = invokeCustomCodeEffectLocal({
        compiledCode,
        cardId,
        hook,
        state,
        player,
        paymentInfo,
      })
      if (!response.ok) {
        const warning = `Custom card ${cardId} hook "${hook}" failed: ${response.error}`
        console.warn(`[local-sandbox-runtime] ${warning}`)
        sessionCtx?.reportWarning(warning)
        return neutralEffectResult(hook)
      }
      return response.result ?? neutralEffectResult(hook)
    }
  }
  if (codeManifest.effectMetadata) {
    Object.assign(effect, codeManifest.effectMetadata)
  }

  if (codeManifest.effectHooks.length > 0) {
    if (sessionCtx) {
      sessionCtx.registerEffect(effect)
    } else {
      requireActiveCardRegistry('registerBrowserBackedCustomCard').setEffect(effect)
    }
  }

  for (const listener of codeManifest.listeners) {
    const reg = {
      id: listener.registrationId,
      // Bound here as well, so a manifest saved before ADR 0025 follows the same contract.
      cardIds: [cardId],
      ...boundListenerFilters(listener),
      scope: listener.scope,
      handler: (context: CardListenerContext) => {
        const response = invokeCustomCodeListenerLocal({
          compiledCode,
          cardId,
          registrationId: listener.registrationId,
          context,
        })
        if (!response.ok) {
          const warning = `Custom card ${cardId} listener "${listener.registrationId}" failed: ${response.error}`
          console.warn(`[local-sandbox-runtime] ${warning}`)
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
      requireActiveCardRegistry('registerBrowserBackedCustomCard').registerListener(reg)
    }
  }
}
