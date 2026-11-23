import type { PlayerPreferences, PlayerState } from '../contract/types'

export const DEFAULT_PLAYER_PREFERENCES: Readonly<PlayerPreferences> = { autoResolveIndependentReactions: true }

export const playerPreferences = (player: Pick<PlayerState, 'preferences'> | undefined): PlayerPreferences => ({
  ...DEFAULT_PLAYER_PREFERENCES,
  ...player?.preferences,
})

/** Validates untrusted input (a command payload or an account request); null when malformed. */
export const parsePlayerPreferences = (value: unknown): PlayerPreferences | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (entries.length !== 1) return null
  const auto = (value as Record<string, unknown>).autoResolveIndependentReactions
  return typeof auto === 'boolean' ? { autoResolveIndependentReactions: auto } : null
}
