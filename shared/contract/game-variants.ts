/** Balance rules are a creation choice scoped to Farmers of the Moor. */
export const isMoorBalanceRulesEnabled = (configuration?: {
  enableFarmersOfTheMoor?: unknown
  enableMoorBalanceRules?: unknown
}): boolean => configuration?.enableFarmersOfTheMoor === true
  && configuration.enableMoorBalanceRules === true
