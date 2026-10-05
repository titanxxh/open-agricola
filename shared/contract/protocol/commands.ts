/** Stable across transports; requestId is only a single-connection correlation. */
export type CommandIdentity = { scopeId: string; commandId: string }
export type CommandScope = { scopeId: string; expiresAt: number }
export type CommandInput = { expectedVersion: number; inputWindowId?: string }
export type CommandOutcome = {
  ok: boolean
  roomId?: string
  roomVersion?: number
  stepNo?: number
  frameHash?: string
  playerIndex?: number
  error?: string
  code?: string
}
export type CommandReceipt = CommandIdentity & { outcome: CommandOutcome }
export type CommandErrorCode = 'command_identity_required' | 'command_scope_expired' | 'command_content_conflict' | 'command_input_stale' | 'command_pending'
/** The opaque window changes on each draft round/parent phase and every undo. */
export type InputWindow = { id: string; kind: 'draft' | 'parent' }
