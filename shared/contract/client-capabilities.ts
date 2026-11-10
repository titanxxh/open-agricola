import type { TeamConfiguration } from './team'

export const TEAM_COOPERATION_CAPABILITY = 'team-cooperation-v1'
export type ClientCapability = typeof TEAM_COOPERATION_CAPABILITY
export const GAME_CLIENT_CAPABILITIES: readonly ClientCapability[] = [TEAM_COOPERATION_CAPABILITY]
export const CLIENT_CAPABILITIES_HEADER = 'X-Open-Agricola-Client-Capabilities'
export const CLIENT_REFRESH_MESSAGE = 'Please refresh this page to use official cooperation rules.'

export const parseClientCapabilities = (input: unknown): ReadonlySet<ClientCapability> =>
  new Set(Array.isArray(input) ? input.filter((value): value is ClientCapability => value === TEAM_COOPERATION_CAPABILITY) : [])

export const requiresCooperationCapability = (configuration: Pick<TeamConfiguration, 'cooperationRules'> | undefined): boolean =>
  configuration?.cooperationRules === true
