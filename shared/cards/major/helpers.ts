export const scoreByResourceTiers = (
  quantity: number,
  tiers: readonly { min: number; max?: number; score: number }[],
) => {
  for (const tier of tiers) {
    if (quantity >= tier.min && (tier.max === undefined || quantity <= tier.max)) {
      return tier.score
    }
  }
  return 0
}
