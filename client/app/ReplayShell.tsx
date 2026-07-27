import { useEffect, useMemo, useRef, useState } from 'react'
import type { CompletedGameContextDescriptor } from '../../shared/contract/protocol/game-context'
import type {
  ReplayAnchorResponse,
  ReplayManifest,
  ReplayManifestResponse,
} from '../../shared/contract/protocol/replay'
import { API_BASE } from '../config'
import { useLocale } from '../contexts/LocaleContext'
import '../styles/pages/replay.css'

type Perspective = 'open' | `p${number}`
type Layout = 'timeline' | 'board'

type ViewerManifest = {
  entrypoint: 'index.html'
  files: Record<string, string>
}

const sha256 = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const responseHash = async (response: Response, bytes: ArrayBuffer): Promise<string> =>
  crypto.subtle
    ? sha256(bytes)
    : response.headers.get('etag')?.replaceAll('"', '') ?? ''

const parseViewerManifest = (bytes: ArrayBuffer): ViewerManifest | null => {
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ViewerManifest>
    if (
      value.entrypoint !== 'index.html'
      || !value.files
      || typeof value.files !== 'object'
      || Array.isArray(value.files)
      || !('index.html' in value.files)
      || !Object.values(value.files).every(
        (hash) => typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash),
      )
    ) return null
    return value as ViewerManifest
  } catch {
    return null
  }
}

const readLocation = (manifest: ReplayManifest | null): {
  perspective: Perspective | null
  layout: Layout | null
  step: number | null
} => {
  const params = new URLSearchParams(window.location.search)
  const rawPerspective = params.get('perspective')
  const perspective = rawPerspective === 'open'
    ? rawPerspective
    : /^p[1-9]\d*$/.test(rawPerspective ?? '')
      && manifest?.participants.some(
        (player) => `p${player.playerIndex + 1}` === rawPerspective,
      )
      ? rawPerspective as Perspective
      : null
  const rawLayout = params.get('layout')
  const layout = rawLayout === 'timeline' || rawLayout === 'board'
    ? rawLayout
    : null
  const rawStep = Number(params.get('step'))
  const step = Number.isSafeInteger(rawStep)
    && manifest?.steps.some((candidate) => candidate.stepNo === rawStep)
    ? rawStep
    : null
  return { perspective, layout, step }
}

const updateLocation = (
  perspective: Perspective,
  layout: Layout | null,
  step: number | null,
) => {
  const url = new URL(window.location.href)
  const previousStep = url.searchParams.get('step')
  url.searchParams.set('perspective', perspective)
  if (layout) url.searchParams.set('layout', layout)
  else url.searchParams.delete('layout')
  if (step !== null) url.searchParams.set('step', String(step))
  else url.searchParams.delete('step')
  if (step === null || previousStep !== String(step)) url.searchParams.delete('frame')
  window.history.replaceState(null, '', url)
}

export function ReplayShell({
  context,
}: {
  context: CompletedGameContextDescriptor
}) {
  const { locale, t } = useLocale()
  const [manifest, setManifest] = useState<ReplayManifest | null>(null)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [location, setLocation] = useState(() => readLocation(null))
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const replay = context.replay

  useEffect(() => {
    if (!replay) return
    const controller = new AbortController()
    const verify = async () => {
      const replayResponse = await fetch(
        `${API_BASE}/api/v1/replays/${encodeURIComponent(context.roomId)}/manifest`,
        { credentials: 'omit', signal: controller.signal },
      )
      const replayManifest = await replayResponse.json() as ReplayManifestResponse
      if (
        !replayManifest.ok
        || replayManifest.roomId !== context.roomId
        || replayManifest.schemaVersion !== replay.schemaVersion
        || replayManifest.viewerBuildId !== replay.viewerBuildId
      ) throw new Error('replay_manifest_mismatch')

      const params = new URLSearchParams(window.location.search)
      const rawAnchorStep = params.get('step')
      const frameHash = params.get('frame')
      if ((rawAnchorStep === null) !== (frameHash === null)) {
        throw new Error('incomplete_replay_anchor')
      }
      if (rawAnchorStep !== null && frameHash !== null) {
        if (!/^(0|[1-9]\d*)$/.test(rawAnchorStep) || !/^[a-f0-9]{64}$/.test(frameHash)) {
          throw new Error('invalid_replay_anchor')
        }
        const anchorStep = Number(rawAnchorStep)
        const anchorResponse = await fetch(
          `${API_BASE}/api/v1/replays/${encodeURIComponent(context.roomId)}/anchors/${anchorStep}?frame=${frameHash}`,
          { credentials: 'omit', signal: controller.signal },
        )
        const anchor = await anchorResponse.json() as ReplayAnchorResponse
        if (
          !anchor.ok
          || anchor.roomId !== context.roomId
          || anchor.schemaVersion !== replay.schemaVersion
          || anchor.viewerBuildId !== replay.viewerBuildId
          || anchor.anchor.stepNo !== anchorStep
          || anchor.anchor.frameHash !== frameHash
        ) throw new Error('replay_anchor_mismatch')
      }

      const viewerResponse = await fetch(
        `${API_BASE}/replay-viewers/${replay.viewerBuildId}/manifest.json`,
        { credentials: 'omit', signal: controller.signal },
      )
      const bytes = await viewerResponse.arrayBuffer()
      if (
        !viewerResponse.ok
        || await responseHash(viewerResponse, bytes) !== replay.viewerBuildId
        || !parseViewerManifest(bytes)
      ) throw new Error('viewer_manifest_mismatch')

      setManifest(replayManifest)
      setLocation(readLocation(replayManifest))
      setVerified(true)
    }
    void verify().catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(t('platform.gameContext.viewerUnavailable'))
    })
    return () => controller.abort()
  }, [context.roomId, replay, t])

  useEffect(() => {
    const sync = () => setLocation(readLocation(manifest))
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [manifest])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return
      const data = event.data as Record<string, unknown>
      if (
        data.type !== 'open-agricola-replay-location'
        || (data.layout !== 'timeline' && data.layout !== 'board')
        || (data.perspective !== 'open' && !/^p[1-9]\d*$/.test(String(data.perspective)))
        || !Number.isSafeInteger(data.step)
      ) return
      const perspective = data.perspective as Perspective
      if (
        perspective !== 'open'
        && !manifest?.participants.some(
          (player) => `p${player.playerIndex + 1}` === perspective,
        )
      ) return
      const next = {
        perspective,
        layout: data.layout as Layout,
        step: data.step as number,
      }
      setLocation(next)
      updateLocation(next.perspective, next.layout, next.step)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [manifest])

  const iframeSrc = useMemo(() => {
    if (!verified || !replay || !location.perspective) return null
    const params = new URLSearchParams({
      room: context.roomId,
      perspective: location.perspective,
      locale,
      api: API_BASE || window.location.origin,
    })
    if (location.layout) params.set('layout', location.layout)
    if (location.step !== null) params.set('step', String(location.step))
    return `${API_BASE}/replay-viewers/${replay.viewerBuildId}/index.html?${params}`
  }, [context.roomId, locale, location, replay, verified])

  const choosePerspective = (perspective: Perspective) => {
    const next = {
      perspective,
      layout: location.layout,
      step: location.step ?? manifest?.firstStepNo ?? null,
    }
    setLocation(next)
    updateLocation(next.perspective, next.layout, next.step)
  }

  const displayError = replay ? error : t('platform.gameContext.viewerUnavailable')
  if (displayError) {
    return (
      <main className="replay-shell replay-shell--status">
        <h1>{t('platform.gameContext.completedTitle')}</h1>
        <p role="alert">{displayError}</p>
        <ol className="replay-results">
          {context.result.players.map((player) => (
            <li key={player.playerIndex}>
              <span>{player.displayName}</span>
              <strong>{t('platform.gameContext.score', { score: player.score })}</strong>
            </li>
          ))}
        </ol>
      </main>
    )
  }
  if (!verified || !manifest) {
    return (
      <main className="replay-shell replay-shell--status">
        <p>{t('platform.gameContext.verifyingReplay')}</p>
      </main>
    )
  }
  if (!location.perspective) {
    return (
      <main className="replay-shell replay-shell--chooser">
        <header>
          <p>{t('platform.gameContext.room', { id: context.roomId })}</p>
          <h1>{t('platform.gameContext.completedTitle')}</h1>
          <p>{t('platform.gameContext.choosePerspective')}</p>
        </header>
        <ol className="replay-results">
          {context.result.players.map((player) => (
            <li key={player.playerIndex}>
              <span>{player.displayName}</span>
              <strong>{t('platform.gameContext.score', { score: player.score })}</strong>
              <button
                type="button"
                onClick={() => choosePerspective(`p${player.playerIndex + 1}`)}
              >
                {t('platform.gameContext.watchAs', { player: player.displayName })}
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="replay-open-button"
          onClick={() => choosePerspective('open')}
        >
          {t('platform.gameContext.watchOpen')}
        </button>
      </main>
    )
  }

  return (
    <main className="replay-shell replay-shell--viewer">
      <iframe
        ref={(node) => {
          iframeRef.current = node
          node?.setAttribute('credentialless', '')
        }}
        src={iframeSrc ?? undefined}
        title={t('platform.gameContext.replayFrameTitle')}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
      />
    </main>
  )
}
