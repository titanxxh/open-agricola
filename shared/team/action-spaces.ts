import type { ActionSpace } from '../contract/types'
import type { TeamConfiguration } from '../contract/team'
import { emptyResources } from '../contract/state-constants'
import { marketplaceAction } from '../actions/effects/marketplace'

export const createTeamActionSpaces = (configuration: TeamConfiguration | undefined, playerCount: number): ActionSpace[] =>
  configuration?.cooperationRules && [4, 6].includes(playerCount)
    ? [{ ...marketplaceAction, resources: { ...emptyResources }, takenBy: [], blockedBy: [] }]
    : []
