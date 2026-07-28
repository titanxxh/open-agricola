import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  CompletedGameContextDescriptor,
  GameContextError,
  GameContextResponse,
  RemovedGameContextDescriptor,
} from '../../shared/contract/protocol/game-context'
import type {
  ReportedEvidenceResponse,
  ReportedEvidenceViewerDataMessage,
  ReportedEvidenceViewerReadyMessage,
} from '../../shared/contract/protocol/replay'
import { API_BASE } from '../config'
import { useLocale } from '../contexts/LocaleContext'
import { BrandMark } from '../components/common/BrandMark'
import { GameLoadScreen } from '../components/common/GameLoadScreen'
import { BugReportBar } from './BugReportBar'
import {
  ReplayFrame,
  ReplayShell,
} from './ReplayShell'
import { verifyReplayViewerBuild } from './replay-viewer-build'

export const GAME_CONTEXT_CHANGED_EVENT = 'open-agricola:game-context-changed'

const finishBugReportOAuth = (result: 'connected' | 'error'): void => {
  const url = new URL(window.location.href)
  url.hash = ''
  url.searchParams.set('bugReportConnection', result)
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

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

function ReportedEvidenceContext({
  roomId,
  stepNo,
  frameHash,
  fallback,
}: {
  roomId: string
  stepNo: number
  frameHash: string
  fallback: ReactNode
}) {
  const { locale, t } = useLocale()
  const evidenceKey = `${roomId}:${stepNo}:${frameHash}`
  const [resolution, setResolution] = useState<{
    key: string
    evidence: ReportedEvidenceResponse
  } | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const evidenceRef = useRef<ReportedEvidenceResponse | null>(null)
  const setIframe = useCallback((node: HTMLIFrameElement | null) => {
    iframeRef.current = node
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void fetch(
      `${API_BASE}/api/v1/game-contexts/${encodeURIComponent(roomId)}`
        + `/evidence/${stepNo}?frame=${frameHash}`,
      { credentials: 'include', signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json() as ReportedEvidenceResponse
        if (response.status === 401) {
          const url = new URL(window.location.href)
          url.searchParams.set('page', 'login')
          window.history.replaceState(null, '', url)
          window.dispatchEvent(new PopStateEvent('popstate'))
          return
        }
        if (body.ok) {
          await verifyReplayViewerBuild(body.viewerBuildId, controller.signal)
        }
        setResolution({ key: evidenceKey, evidence: body })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setResolution({
          key: evidenceKey,
          evidence: {
            ok: false,
            code: 'viewer_unavailable',
            message: 'Reported evidence is unavailable',
          },
        })
      })
    return () => controller.abort()
  }, [evidenceKey, frameHash, roomId, stepNo])

  const evidence = resolution?.key === evidenceKey
    ? resolution.evidence
    : null
  useLayoutEffect(() => {
    evidenceRef.current = evidence
  }, [evidence])
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const message = event.data as Partial<ReportedEvidenceViewerReadyMessage>
      if (message.type !== 'open-agricola-reported-evidence-ready') return
      const currentEvidence = evidenceRef.current
      if (!currentEvidence?.ok) return
      iframeRef.current?.contentWindow?.postMessage({
        type: 'open-agricola-reported-evidence',
        evidence: currentEvidence,
      } satisfies ReportedEvidenceViewerDataMessage, '*')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (!evidence) {
    return <GameLoadScreen percent={10} label={t('platform.loading')} />
  }
  if (!evidence.ok) return fallback
  return (
    <main className="reported-evidence">
      <header className="reported-evidence__header">
        <p>{t('platform.gameContext.room', { id: roomId })}</p>
        <h1>{t('platform.gameContext.reportedEvidenceTitle')}</h1>
        <p>{t('platform.gameContext.reportedEvidenceBody')}</p>
        <dl>
          <div>
            <dt>{t('platform.bugReport.step')}</dt>
            <dd>{evidence.stepNo}</dd>
          </div>
          <div>
            <dt>{t('platform.bugReport.frameHash')}</dt>
            <dd><code>{evidence.frameHash}</code></dd>
          </div>
        </dl>
      </header>
      <ReplayFrame
        key={`${roomId}:${evidence.viewerBuildId}:${locale}`}
        roomId={roomId}
        viewerBuildId={evidence.viewerBuildId}
        locale={locale}
        initialLocation={{
          perspective: evidence.perspective,
          layout: 'board',
          step: evidence.stepNo,
        }}
        setFrame={setIframe}
        title={t('platform.gameContext.replayFrameTitle')}
        mode="reported-evidence"
      />
      {new URLSearchParams(window.location.search).has('bugReport')
        ? <BugReportBar roomId={roomId} />
        : null}
    </main>
  )
}

function CompletedContext({
  context,
}: {
  context: CompletedGameContextDescriptor
}) {
  const { t } = useLocale()
  if (context.replayStatus === 'available') {
    return <ReplayShell context={context} />
  }
  return statusPage(
    t('platform.gameContext.room', { id: context.roomId }),
    t('platform.gameContext.completedTitle'),
    t('platform.gameContext.legacyNoReplay'),
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
    const expired = statusPage(
      t('platform.gameContext.room', { id: response.roomId }),
      t('platform.gameContext.expiredTitle'),
      t('platform.gameContext.expiredBody'),
      new URLSearchParams(window.location.search).has('bugReport')
        ? <BugReportBar roomId={response.roomId} />
        : undefined,
    )
    const params = new URLSearchParams(window.location.search)
    const rawStep = params.get('step') ?? ''
    const frameHash = params.get('frame') ?? ''
    if (/^(0|[1-9]\d*)$/.test(rawStep) && /^[a-f0-9]{64}$/.test(frameHash)) {
      return (
        <ReportedEvidenceContext
          roomId={response.roomId}
          stepNo={Number(rawStep)}
          frameHash={frameHash}
          fallback={expired}
        />
      )
    }
    return expired
  }
  if (response.ok && response.lifecycle === 'removed') {
    return statusPage(
      t('platform.gameContext.room', { id: response.roomId }),
      t('platform.gameContext.removedTitle'),
      t(removedBodyKey(response.reason)),
      new URLSearchParams(window.location.search).has('bugReport')
        ? <BugReportBar roomId={response.roomId} />
        : undefined,
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
  const hasContext = params.has('context') && params.get('page') !== 'login'
  const roomId = params.get('context') ?? ''
  const resolutionKey = `${locationVersion}:${roomId}`
  const [resolution, setResolution] = useState<{
    key: string
    response: GameContextResponse
  } | null>(null)

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const state = fragment.get('bugReportOAuthState')
    const code = fragment.get('bugReportOAuthCode')
    if (!state || !code) return
    const url = new URL(window.location.href)
    url.hash = ''
    window.history.replaceState(null, '', url)
    void fetch(
      `${API_BASE}/api/v1/issue-submission-connection/github/complete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, code }),
        credentials: 'include',
      },
    )
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { ok?: boolean }
        if (!response.ok || body.ok !== true) throw new Error('request_failed')
        finishBugReportOAuth('connected')
      })
      .catch(() => finishBugReportOAuth('error'))
  }, [])

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
