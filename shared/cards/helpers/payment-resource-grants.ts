import type {
  GameState,
  PlayerState,
  PaymentResourceMap,
  CostModifierType,
  PaymentResourceGrant,
  CardProvidedPaymentResourceProvider,
} from '../../contract/types'
import { getCardEffect } from '../card-effects'

export const paymentGrantSources = (player: PlayerState) =>
  [
    ...new Set([
      ...(player.occupationPlayed ?? []),
      ...(player.minorPlayed ?? []),
      ...(player.improvements ?? []),
    ]),
  ].filter((id) => getCardEffect(id)?.computePaymentResourceGrants)

/** Pure projection; settlement awards exactly the grants attached to the selected row. */
export const paymentResourceGrants = (
  state: GameState | undefined,
  player: PlayerState,
  costType: CostModifierType | undefined,
  units: number,
  resourcesPaid: PaymentResourceMap,
  providers: readonly CardProvidedPaymentResourceProvider[] = [],
): PaymentResourceGrant[] =>
  !state
    ? []
    : paymentGrantSources(player).flatMap((sourceCard) => {
        const actualPaid = { ...resourcesPaid }
        for (const provider of providers) {
          const amount = resourcesPaid[provider.key] ?? 0
          if (amount > 0 && provider.consume.type !== 'handCard') {
            const resource = provider.consume.resource
            actualPaid[resource] = (actualPaid[resource] ?? 0) + amount
          }
        }
        const resources = getCardEffect(sourceCard)!.computePaymentResourceGrants!(state, player, {
          costType,
          units,
          resourcesPaid: actualPaid,
        })
        return resources && Object.values(resources).some((n) => n > 0)
          ? [{ sourceCard, resources }]
          : []
      })

export const withPaymentGrants = (
  resources: PaymentResourceMap,
  grants: PaymentResourceGrant[],
) => {
  const result = { ...resources }
  for (const grant of grants)
    for (const [key, amount] of Object.entries(grant.resources)) {
      if (amount && amount > 0)
        result[key as keyof PaymentResourceMap] =
          (result[key as keyof PaymentResourceMap] ?? 0) + amount
    }
  return result
}
