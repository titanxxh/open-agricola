import { useEffect, useState } from 'react'
import type { GameEndProposal } from '../../shared/contract/protocol/game-termination'
import { t, type Locale } from '../../shared/i18n'
import { WsGameTransport } from '../services/gameTransport'
import { GAME_CONTEXT_CHANGED_EVENT } from './GameContextRouter'
import '../styles/components/game-end.css'

export function GameEndControls({ transport, locale, playerNames, disabled = false }: {
  transport: WsGameTransport
  locale: Locale
  playerNames: string[]
  disabled?: boolean
}) {
  const [proposal, setProposal] = useState<GameEndProposal | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const refresh = () => {
      if (transport.roomId) transport.sendRoomCommand('getGameEndProposal')
    }
    const offEvent = transport.onEvent(event => {
      if (event.type === 'gameEndProposal' && event.roomId === transport.roomId) {
        setProposal(event.proposal)
        setSending(false)
      } else if (event.type === 'gameTerminated') {
        window.dispatchEvent(new Event(GAME_CONTEXT_CHANGED_EVENT))
      } else if (event.type === 'roomJoined' || event.type === 'roomCreated') {
        setProposal(null)
        refresh()
      } else if (event.type === 'commandReceipt' || event.type === 'error') {
        setSending(false)
        if (event.type === 'error') setError(event.error)
      }
    })
    const offConnection = transport.onConnectionStatus(status => {
      if (status.phase === 'ready') refresh()
    })
    let currentRoom = transport.roomId
    const offSnapshot = transport.onSnapshot((_payload, roomId) => {
      if (roomId && roomId !== currentRoom) { currentRoom = roomId; setProposal(null); refresh() }
    })
    refresh()
    return () => { offEvent(); offConnection(); offSnapshot() }
  }, [transport])

  const send = (type: 'proposeGameEnd' | 'respondGameEnd' | 'withdrawGameEnd', options: Record<string, unknown>) => {
    setError('')
    try {
      transport.sendRoomCommand(type, options)
      setSending(true)
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }
  const propose = (intent: GameEndProposal['intent']) => {
    if (!window.confirm(t(locale, intent === 'end' ? 'platform.gameEnd.confirmEnd' : 'platform.gameEnd.confirmRematch'))) return
    send('proposeGameEnd', { intent })
  }
  const agreed = proposal?.agreements.some(vote => vote.playerIndex === transport.playerIndex)
  return (
    <section className="game-end-controls" aria-label={t(locale, 'platform.gameEnd.controls')}>
      {proposal ? (
        <>
          <p role="status">{t(locale, proposal.intent === 'end' ? 'platform.gameEnd.proposal' : 'platform.gameEnd.rematchProposal', {
            player: playerNames[proposal.proposerIndex] ?? '', agreed: proposal.agreements.length, total: proposal.playerIndices.length,
          })}</p>
          <p className="game-end-hint">{t(locale, 'platform.gameEnd.publicReplay')}</p>
          <div className="game-end-actions">
            <button type="button" className="btn-primary" disabled={disabled || sending || agreed} onClick={() => send('respondGameEnd', { proposalId: proposal.id, agree: true })}>
              {t(locale, agreed ? 'platform.gameEnd.agreed' : 'platform.gameEnd.agree')}
            </button>
            <button type="button" className="btn-secondary" disabled={disabled || sending} onClick={() => send('respondGameEnd', { proposalId: proposal.id, agree: false })}>{t(locale, 'platform.gameEnd.reject')}</button>
            {proposal.proposerIndex === transport.playerIndex ? <button type="button" className="btn-secondary" disabled={disabled || sending} onClick={() => send('withdrawGameEnd', { proposalId: proposal.id })}>{t(locale, 'platform.gameEnd.withdraw')}</button> : null}
          </div>
        </>
      ) : (
        <div className="game-end-actions">
          <button type="button" className="btn-secondary" disabled={disabled || sending} onClick={() => propose('end')}>{t(locale, 'platform.gameEnd.propose')}</button>
          <button type="button" className="btn-secondary" disabled={disabled || sending} onClick={() => propose('rematch')}>{t(locale, 'platform.gameEnd.proposeRematch')}</button>
        </div>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}
