// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { GameEndProposal } from '../../../shared/contract/protocol/game-termination'
import { t } from '../../../shared/i18n'
import type { WsGameTransport } from '../../services/gameTransport'
import { GameEndControls } from '../GameEndControls'

const proposal: GameEndProposal = {
  id: 'proposal-1',
  proposerIndex: 0,
  createdAt: 1,
  playerIndices: [0, 1],
  agreements: [{ playerIndex: 0, agreedAt: 1 }],
  intent: 'end',
}

function fakeTransport() {
  let onEvent: (event: { type: string; roomId?: string; proposal?: GameEndProposal | null; error?: string }) => void = () => {}
  const sendRoomCommand = vi.fn()
  const transport = {
    roomId: 'room-1',
    playerIndex: 1,
    sendRoomCommand,
    onEvent: (handler: typeof onEvent) => { onEvent = handler; return () => {} },
    onConnectionStatus: () => () => {},
    onSnapshot: () => () => {},
  }
  return {
    transport: transport as unknown as WsGameTransport,
    sendRoomCommand,
    emit: (event: Parameters<typeof onEvent>[0]) => onEvent(event),
  }
}

function PendingProbe({ transport }: { transport: WsGameTransport }) {
  const [pending, setPending] = useState(false)
  return (
    <>
      <p>pending:{String(pending)}</p>
      <GameEndControls transport={transport} locale="en" playerNames={['Ada', 'Bea']} onProposalChange={setPending} />
    </>
  )
}

describe('GameEndControls', () => {
  it('keeps propose actions disabled until the room can accept them', () => {
    const { transport } = fakeTransport()
    render(<GameEndControls transport={transport} locale="en" playerNames={['Ada', 'Bea']} disabled />)
    expect(screen.getByRole('button', { name: t('en', 'platform.gameEnd.propose') })).toBeDisabled()
    expect(screen.getByRole('button', { name: t('en', 'platform.gameEnd.proposeRematch') })).toBeDisabled()
  })

  it('reports a pending proposal and still confirms before sending', async () => {
    const user = userEvent.setup()
    const { transport, sendRoomCommand, emit } = fakeTransport()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<PendingProbe transport={transport} />)
    expect(screen.getByText('pending:false')).toBeVisible()

    emit({ type: 'gameEndProposal', roomId: 'room-1', proposal })
    await waitFor(() => expect(screen.getByText('pending:true')).toBeVisible())
    expect(screen.getByRole('button', { name: t('en', 'platform.gameEnd.agree') })).toBeEnabled()
    expect(screen.queryByRole('button', { name: t('en', 'platform.gameEnd.withdraw') })).toBeNull()

    emit({ type: 'gameEndProposal', roomId: 'room-1', proposal: null })
    await waitFor(() => expect(screen.getByText('pending:false')).toBeVisible())
    await user.click(screen.getByRole('button', { name: t('en', 'platform.gameEnd.propose') }))
    expect(confirm).toHaveBeenCalled()
    expect(sendRoomCommand).not.toHaveBeenCalledWith('proposeGameEnd', { intent: 'end' })

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: t('en', 'platform.gameEnd.proposeRematch') }))
    expect(sendRoomCommand).toHaveBeenCalledWith('proposeGameEnd', { intent: 'rematch' })
  })
})
