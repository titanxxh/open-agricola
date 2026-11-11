export type ClientCapability = never
export const GAME_CLIENT_CAPABILITIES: readonly ClientCapability[] = []
export const CLIENT_CAPABILITIES_HEADER = 'X-Open-Agricola-Client-Capabilities'
export const CLIENT_REFRESH_MESSAGE = 'Please refresh this page to continue.'

export const parseClientCapabilities = (_input: unknown): ReadonlySet<ClientCapability> => new Set()
