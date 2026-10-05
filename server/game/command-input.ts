import { randomUUID } from 'node:crypto'
import type { GameState } from '../../shared/contract/types'
import type { CommandInput, InputWindow } from '../../shared/contract/protocol/commands'
import { CommandError } from './command-store'

export type RoomInputWindow = InputWindow & { source: string }
export function nextInputWindow(previous: RoomInputWindow | null | undefined, state: Pick<GameState, 'phase' | 'draft' | 'parentSelection'>, commandType: string): RoomInputWindow | null {
  const kind = state.phase === 'draft' && state.draft ? 'draft'
    : state.phase === 'parent-selection' && state.parentSelection ? 'parent' : null
  if (!kind) return null
  const source = kind === 'draft' ? `draft:${state.draft!.stageIndex ?? 0}:${state.draft!.stage ?? 'standard'}:${state.draft!.round}` : 'parent'
  const rebranch = ['initial', 'undoStep', 'undoAction', 'loadGame'].includes(commandType)
  if (!rebranch && previous?.kind === kind && previous.source === source) return previous
  return { id: randomUUID(), kind, source }
}

/** Call only AFTER looking up a previously completed command receipt. */
export function assertCommandInput(type: string, input: Partial<CommandInput>, version: number, window: RoomInputWindow | null | undefined): void {
  const simultaneous = type === 'draftSubmit' ? 'draft' : type === 'parentSubmit' ? 'parent' : null
  if (simultaneous && window?.kind === simultaneous && input.inputWindowId === window.id) return
  if (!simultaneous && Number.isSafeInteger(input.expectedVersion) && input.expectedVersion === version) return
  throw new CommandError('command_input_stale', 'The input changed; refresh the game and choose again')
}
