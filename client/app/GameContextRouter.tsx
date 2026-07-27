import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type {
  CompletedGameContextDescriptor,
  GameContextError,
  GameContextResponse,
  RemovedGameContextDescriptor,
} from '../../shared/contract/protocol/game-context'
import { API_BASE } from '../config'
import { useLocale } from '../contexts/LocaleContext'
import { BrandMark } from '../components/common/BrandMark'
import { GameLoadScreen } from '../components/common/GameLoadScreen'

export const GAME_CONTEXT_CHANGED_EVENT = 'open-agricola:game-context-changed'

const statusPage = (
  roomId: string,
  title: string,
  body: string,
  children?: ReactNode,
) => (
  <main className="ws-status-screen">
    <section className="ws-status-card" aria-labelledby="game-context-title">
      <BrandMark
        title="Open Agricola"
        titleAs="h2"
        className="brand-mark-centered ws-status-brand"
        titleClassName="ws-status-title"
      />
      <p className="ws-status-text">{roomId}</p>
      <h1 id="game-context-title" className="ws-status-title">{title}</h1>
      <p className="ws-status-text">{body}</p>
      {children}
    </section>
  </main>
)

function CompletedContext({
  context,
}: {
  context: CompletedGameContextDescriptor
}) {
  const { t } = useLocale()
  return statusPage(
    t('platform.gameContext.room', { id: context.roomId }),
    t('platform.gameContext.completedTitle'),
    t(context.replayStatus === 'available'
      ? 'platform.gameContext.replayAvailable'
      : 'platform.gameContext.legacyNoReplay'),
    <div>
      <h2 className="ws-status-title">{t('platform.gameContext.players')}</h2>
      <ul>
        {context.result.players.map((player) => (
          <li key={player.playerIndex}>
            {player.displayName}: {t('platform.gameContext.score', { score: player.score })}
          </li>
        ))}
      </ul>
    </div>,
  )
}

const removedBodyKey = (
  reason: RemovedGameContextDescriptor['reason'],
): string => {
  if (reason === 'moderation') return 'platform.gameContext.removedModerationBody'
  if (reason === 'legal') return 'platform.gameContext.removedLegalBody'
  return 'platform.gameContext.removedBody'
}

function PublicContext({
  response,
}: {
  response: Exclude<GameContextResponse, { lifecycle: 'active' }>
}) {
  const { t } = useLocale()
  if (response.ok && response.lifecycle === 'completed') {
    return <CompletedContext context={response} />
  }
  if (response.ok && response.lifecycle === 'expired') {
    return statusPage(
      t('platform.gameContext.room', { id: response.roomId }),
      t('platform.gameContext.expiredTitle'),
      t('platform.gameContext.expiredBody'),
    )
  }
  if (response.ok && response.lifecycle === 'removed') {
    return statusPage(
      t('platform.gameContext.room', { id: response.roomId }),
      t('platform.gameContext.removedTitle'),
      t(removedBodyKey(response.reason)),
    )
  }
  const error = response as GameContextError
  const notParticipant = error.code === 'not_participant'
  const unknown = error.code === 'unknown_context' ||
    error.code === 'invalid_context_link'
  return statusPage(
    '',
    t(notParticipant
      ? 'platform.gameContext.notParticipantTitle'
      : unknown
        ? 'platform.gameContext.unknownTitle'
        : 'platform.gameContext.unavailableTitle'),
    t(notParticipant
      ? 'platform.gameContext.notParticipantBody'
      : unknown
        ? 'platform.gameContext.unknownBody'
        : 'platform.gameContext.unavailableBody'),
  )
}

export function GameContextRouter({ children }: { children: ReactNode }) {
  const { t } = useLocale()
  const [locationVersion, setLocationVersion] = useState(0)
  const params = new URLSearchParams(window.location.search)
  const hasContext = params.has('context')
  const roomId = params.get('context') ?? ''
  const resolutionKey = `${locationVersion}:${roomId}`
  const [resolution, setResolution] = useState<{
    key: string
    response: GameContextResponse
  } | null>(null)

  useEffect(() => {
    const refresh = () => setLocationVersion((version) => version + 1)
    window.addEventListener('popstate', refresh)
    window.addEventListener(GAME_CONTEXT_CHANGED_EVENT, refresh)
    return () => {
      window.removeEventListener('popstate', refresh)
      window.removeEventListener(GAME_CONTEXT_CHANGED_EVENT, refresh)
    }
  }, [])

  useEffect(() => {
    if (!hasContext || !roomId) return
    const controller = new AbortController()
    fetch(`${API_BASE}/api/v1/game-contexts/${encodeURIComponent(roomId)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (result) => await result.json() as GameContextResponse)
      .then((response) => setResolution({ key: resolutionKey, response }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResolution({
          key: resolutionKey,
          response: {
            ok: false,
            code: 'viewer_unavailable',
            message: 'Game context is unavailable',
          },
        })
      })
    return () => controller.abort()
  }, [hasContext, resolutionKey, roomId])

  if (!hasContext) return children
  if (!roomId) {
    return <PublicContext response={{
      ok: false,
      code: 'invalid_context_link',
      message: 'Invalid game context link',
    }} />
  }
  const response = resolution?.key === resolutionKey
    ? resolution.response
    : null
  if (!response) {
    return <GameLoadScreen percent={10} label={t('platform.loading')} />
  }
  if (
    (response.ok && response.lifecycle === 'active') ||
    (!response.ok && response.code === 'login_required' && response.lifecycle === 'active')
  ) {
    return children
  }
  return <PublicContext response={response} />
}
