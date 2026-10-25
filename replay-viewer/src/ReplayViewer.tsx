import { t as translateMessage } from '../../shared/i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getPlayerDisplayName } from '../../client/utils/player-name'
import type { Locale } from '../../shared/i18n'
import type {
  ReportedEvidence,
  ReportedEvidenceViewerDataMessage,
  ReportedEvidenceViewerReadyMessage,
  ReplayManifest,
  ReplayManifestResponse,
  ReplaySegment,
  ReplaySegmentResponse,
  ReplayUnavailableError,
} from '../../shared/contract/protocol/replay'
import { registerCustomCardMetadata } from '../../shared/cards/custom-card-metadata'
import { ScoringPad } from '../../client/components/board/ScoringPad'
import { ReplayBoard } from './ReplayBoard'
import {
  frameForPerspective,
  intentForPerspective,
  replayAssetUrl,
  resolveLayout,
  segmentForStep,
  validPerspective,
} from './model'
import type { ReplayLayout, ReplayPerspective } from './types'

const labels = (locale: string) => ({ "title": translateMessage(locale, "ui.copy.ReplayViewer.game_archive_fee7cb"), "choose": translateMessage(locale, "ui.copy.ReplayViewer.choose_a_perspective_to_open_this_replay_44c8b4"), "open": translateMessage(locale, "ui.copy.ReplayViewer.open_information_fc2521"), "timeline": translateMessage(locale, "ui.copy.ReplayViewer.timeline_first_ee2519"), "board": translateMessage(locale, "ui.copy.ReplayViewer.board_first_49810f"), "play": translateMessage(locale, "ui.copy.ReplayViewer.play_2f621d"), "pause": translateMessage(locale, "ui.copy.ReplayViewer.pause_c65f06"), "previous": translateMessage(locale, "ui.copy.ReplayViewer.previous_2c0f2a"), "next": translateMessage(locale, "ui.copy.ReplayViewer.next_b52706"), "loading": translateMessage(locale, "ui.copy.ReplayViewer.opening_archive_cbcdcf"), "missingPrefix": translateMessage(locale, "ui.copy.ReplayViewer.the_beginning_of_this_game_was_not_cdc5fa"), "unavailable": translateMessage(locale, "ui.copy.ReplayViewer.this_replay_range_is_unavailable_5ab826"), "continue": translateMessage(locale, "ui.copy.ReplayViewer.continue_at_the_next_intact_checkpoint_96ee67"), "evidence": translateMessage(locale, "ui.copy.ReplayViewer.frame_evidence_d38efd"), "actor": translateMessage(locale, "ui.copy.ReplayViewer.actor_c3823b"), "command": translateMessage(locale, "ui.copy.ReplayViewer.command_9cfdf5"), "intent": translateMessage(locale, "ui.copy.ReplayViewer.intent_6f9f82"), "round": translateMessage(locale, "ui.copy.ReplayViewer.round_a7a6c3"), "step": translateMessage(locale, "ui.copy.ReplayViewer.step_f2fb72"), "frameHash": translateMessage(locale, "ui.copy.ReplayViewer.frame_hash_4c9bf7"), "hiddenIntent": translateMessage(locale, "ui.copy.ReplayViewer.hidden_for_this_perspective_874967"), "scores": translateMessage(locale, "ui.copy.ReplayViewer.final_scores_81e002") })

type LocationMessage = {
  type: 'open-agricola-replay-location'
  perspective: ReplayPerspective
  layout: ReplayLayout
  step: number
}

const readInitialStep = (manifest: ReplayManifest): number => {
  const raw = Number(new URLSearchParams(window.location.search).get('step'))
  return manifest.steps.some((step) => step.stepNo === raw)
    ? raw
    : manifest.firstStepNo
}

function ReportedEvidenceViewer({ locale }: { locale: Locale }) {
  const params = new URLSearchParams(window.location.search)
  const roomId = params.get('room') ?? ''
  const viewerBuildId = params.get('viewer') ?? ''
  const perspective = params.get('perspective') ?? ''
  const stepNo = Number(params.get('step'))
  const apiBase = (params.get('api') ?? window.location.origin).replace(/\/$/, '')
  const text = labels(locale)
  const [evidence, setEvidence] = useState<ReportedEvidence | null>(null)
  let parentOrigin = ''
  try {
    parentOrigin = new URL(params.get('parentOrigin') ?? '').origin
  } catch {
    parentOrigin = ''
  }

  useEffect(() => {
    if (!parentOrigin) return
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== parentOrigin) return
      const message = event.data as Partial<ReportedEvidenceViewerDataMessage>
      const next = message.evidence
      if (
        message.type !== 'open-agricola-reported-evidence'
        || !next?.ok
        || next.kind !== 'reportedEvidence'
        || next.roomId !== roomId
        || next.viewerBuildId !== viewerBuildId
        || next.perspective !== perspective
        || next.stepNo !== stepNo
        || !/^[a-f0-9]{64}$/.test(next.frameHash)
        || !Array.isArray(next.customCards)
      ) return
      next.customCards.forEach((card) => registerCustomCardMetadata({
        ...card,
        artUrl: replayAssetUrl(card.artUrl, apiBase),
      }))
      setEvidence(next)
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({
      type: 'open-agricola-reported-evidence-ready',
    } satisfies ReportedEvidenceViewerReadyMessage, parentOrigin)
    return () => window.removeEventListener('message', onMessage)
  }, [apiBase, parentOrigin, perspective, roomId, stepNo, viewerBuildId])

  if (!evidence) {
    return <main className="replay-loading">{text.loading}</main>
  }
  return (
    <main className="replay-app replay-app--board">
      <section className="replay-stage">
        <ReplayBoard
          frame={evidence.frame}
          locale={locale}
          perspective={evidence.perspective}
        />
      </section>
      <aside className="replay-evidence" aria-label={text.evidence}>
        <h2>{text.evidence}</h2>
        <dl>
          <div><dt>{text.step}</dt><dd>{evidence.stepNo}</dd></div>
          <div className="replay-evidence__wide">
            <dt>{text.frameHash}</dt>
            <dd><code>{evidence.frameHash}</code></dd>
          </div>
        </dl>
      </aside>
    </main>
  )
}

function ArchiveReplayViewer({ locale }: { locale: Locale }) {
  const params = new URLSearchParams(window.location.search)
  const roomId = params.get('room') ?? ''
  const apiBase = (params.get('api') ?? window.location.origin).replace(/\/$/, '')
  const text = labels(locale)
  const [manifest, setManifest] = useState<ReplayManifest | null>(null)
  const [error, setError] = useState<ReplayUnavailableError | null>(null)
  const [segments, setSegments] = useState<Record<number, ReplaySegment>>({})
  const [perspective, setPerspective] = useState<ReplayPerspective | null>(null)
  const [layout, setLayout] = useState<ReplayLayout>(() =>
    resolveLayout(params.get('layout'), window.innerWidth),
  )
  const [stepNo, setStepNo] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showScores, setShowScores] = useState(true)
  const [segmentRetry, setSegmentRetry] = useState(0)

  useEffect(() => {
    if (!roomId) {
      setError({ ok: false, code: 'invalid_context_link', message: 'Missing room id' })
      return
    }
    const controller = new AbortController()
    fetch(`${apiBase}/api/v1/replays/${encodeURIComponent(roomId)}/manifest`, {
      credentials: 'omit',
      signal: controller.signal,
    })
      .then(async (result) => await result.json() as ReplayManifestResponse)
      .then((response) => {
        if (!response.ok) {
          setError(response)
          return
        }
        response.customCards.forEach((card) => registerCustomCardMetadata({
          ...card,
          artUrl: replayAssetUrl(card.artUrl, apiBase),
        }))
        setManifest(response)
        setPerspective(validPerspective(params.get('perspective'), response))
        setStepNo(readInitialStep(response))
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError({ ok: false, code: 'viewer_unavailable', message: 'Replay manifest is unavailable' })
      })
    return () => controller.abort()
  }, [apiBase, roomId])

  const descriptor = manifest ? segmentForStep(manifest, stepNo) : null
  useEffect(() => {
    if (!descriptor || segments[descriptor.checkpointStepNo]) return
    const controller = new AbortController()
    fetch(
      `${apiBase}/api/v1/replays/${encodeURIComponent(roomId)}/segments/${descriptor.checkpointStepNo}`,
      { credentials: 'omit', signal: controller.signal },
    )
      .then(async (result) => await result.json() as ReplaySegmentResponse)
      .then((response) => {
        if (!response.ok) {
          setError(response)
          setPlaying(false)
          return
        }
        setSegments((current) => ({
          ...current,
          [response.checkpointStepNo]: response,
        }))
        setError(null)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError({ ok: false, code: 'replay_segment_unavailable', message: 'Replay segment is unavailable' })
        setPlaying(false)
      })
    return () => controller.abort()
  }, [apiBase, descriptor, roomId, segmentRetry, segments])

  const current = descriptor
    ? segments[descriptor.checkpointStepNo]?.steps.find((step) => step.stepNo === stepNo)
    : undefined
  const stepIndex = manifest?.steps.findIndex((step) => step.stepNo === stepNo) ?? -1
  const previousStep = manifest?.steps[stepIndex - 1]
  const nextStep = manifest?.steps[stepIndex + 1]
  const canMovePrevious = previousStep?.stepNo === stepNo - 1
  const canMoveNext = nextStep?.stepNo === stepNo + 1

  const selectStep = useCallback((nextStepNo: number) => {
    if (!manifest?.steps.some((step) => step.stepNo === nextStepNo)) return
    if (nextStepNo === stepNo) setSegmentRetry((value) => value + 1)
    setError(null)
    setStepNo(nextStepNo)
  }, [manifest, stepNo])
  const move = useCallback((delta: number) => {
    if (!manifest) return
    const index = manifest.steps.findIndex((step) => step.stepNo === stepNo)
    const next = manifest.steps[index + delta]
    if (next?.stepNo === stepNo + delta) selectStep(next.stepNo)
  }, [manifest, selectStep, stepNo])

  useEffect(() => {
    if (!playing || !manifest || !current) return
    if (!nextStep || !canMoveNext) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => selectStep(nextStep.stepNo), 1200)
    return () => window.clearTimeout(timer)
  }, [canMoveNext, current, manifest, nextStep, playing, selectStep])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'ArrowLeft') move(-1)
      if (event.key === 'ArrowRight') move(1)
      if (event.key === 'Home' && manifest) selectStep(manifest.firstStepNo)
      if (event.key === 'End' && manifest) selectStep(manifest.lastStepNo)
      if (event.key === ' ') {
        event.preventDefault()
        setPlaying((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [manifest, move, selectStep])

  useEffect(() => {
    if (!manifest || !perspective) return
    const url = new URL(window.location.href)
    url.searchParams.set('perspective', perspective)
    url.searchParams.set('layout', layout)
    url.searchParams.set('step', String(stepNo))
    window.history.replaceState(null, '', url)
    window.parent.postMessage({
      type: 'open-agricola-replay-location',
      perspective,
      layout,
      step: stepNo,
    } satisfies LocationMessage, '*')
  }, [layout, manifest, perspective, stepNo])

  const visibleFrame = useMemo(
    () => current && perspective
      ? frameForPerspective(current.frame, perspective)
      : null,
    [current, perspective],
  )
  const participantName = (playerIndex: number): string => {
    const player = manifest?.participants.find((candidate) => candidate.playerIndex === playerIndex)
    return getPlayerDisplayName(locale, player?.displayName, playerIndex, player?.nameIsDefault)
  }
  const actor = current?.playerIndex === null || current?.playerIndex === undefined
    ? '—'
    : participantName(current.playerIndex)
  const visibleIntent = current && perspective
    ? intentForPerspective(current, perspective)
    : undefined
  const scores = visibleFrame?.gameOver ? visibleFrame.scores : undefined

  if (!manifest && !error) {
    return <main className="replay-loading">{text.loading}</main>
  }
  if (!manifest) {
    return (
      <main className="replay-loading replay-error">
        <strong>{error?.code}</strong>
        <span>{error?.message}</span>
      </main>
    )
  }
  if (!perspective) {
    return (
      <main className="replay-loading">
        <h1>{text.title}</h1>
        <p>{text.choose}</p>
      </main>
    )
  }

  const unavailable = error?.unavailableRange
  return (
    <main className={`replay-app replay-app--${layout}`}>
      <header className="replay-header">
        <div>
          <p className="replay-kicker">{text.title}</p>
          <h1>{roomId}</h1>
        </div>
        <div className="replay-header__controls">
          <label>
            <span className="sr-only">{text.choose}</span>
            <select
              aria-label={text.choose}
              value={perspective}
              onChange={(event) => setPerspective(event.target.value as ReplayPerspective)}
            >
              {manifest.participants.map((player) => (
                <option key={player.playerIndex} value={`p${player.playerIndex + 1}`}>
                  {participantName(player.playerIndex)}
                </option>
              ))}
              <option value="open">{text.open}</option>
            </select>
          </label>
          <button
            type="button"
            className="replay-layout-toggle"
            onClick={() => setLayout((value) => value === 'timeline' ? 'board' : 'timeline')}
          >
            {layout === 'timeline' ? text.board : text.timeline}
          </button>
          {scores?.length ? (
            <button type="button" onClick={() => setShowScores(true)}>
              {text.scores}
            </button>
          ) : null}
        </div>
      </header>

      {(manifest.missingPrefix || manifest.corruptRanges.length > 0 || error) && (
        <div className="replay-warning-stack">
          {manifest.missingPrefix && <div className="replay-warning">{text.missingPrefix}</div>}
          {manifest.corruptRanges.map((range) => (
            <div
              key={`${range.firstStepNo}-${range.lastStepNo}`}
              className="replay-warning replay-warning--error"
            >
              {text.unavailable} {range.firstStepNo}–{range.lastStepNo}
              {range.nextCheckpointStepNo !== undefined && (
                <button
                  type="button"
                  onClick={() => selectStep(range.nextCheckpointStepNo!)}
                >
                  {text.continue}
                </button>
              )}
            </div>
          ))}
          {error && (
            <div className="replay-warning replay-warning--error">
              <strong>{error.code}</strong> {error.message || text.unavailable}
              {unavailable?.nextCheckpointStepNo !== undefined && (
                <button
                  type="button"
                  onClick={() => selectStep(unavailable.nextCheckpointStepNo!)}
                >
                  {text.continue}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <section className="replay-timeline" aria-label={text.timeline}>
        <ol>
          {manifest.steps.map((step) => (
            <li key={step.stepNo}>
              <button
                type="button"
                className={step.stepNo === stepNo ? 'is-current' : ''}
                aria-current={step.stepNo === stepNo ? 'step' : undefined}
                onClick={() => selectStep(step.stepNo)}
              >
                <span>{String(step.stepNo).padStart(3, '0')}</span>
                <strong>{step.commandType}</strong>
                <small>
                  {step.playerIndex === null
                    ? 'SYSTEM'
                    : participantName(step.playerIndex)}
                </small>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="replay-stage">
        {visibleFrame
          ? (
              <ReplayBoard
                key={perspective}
                frame={visibleFrame}
                locale={locale}
                perspective={perspective}
              />
            )
          : <div className="replay-frame-loading">{text.loading}</div>}
      </section>

      <aside className="replay-evidence" aria-label={text.evidence}>
        <h2>{text.evidence}</h2>
        <dl>
          <div><dt>{text.step}</dt><dd>{current?.stepNo ?? stepNo}</dd></div>
          <div><dt>{text.round}</dt><dd>{visibleFrame?.round ?? '—'}</dd></div>
          <div><dt>{text.actor}</dt><dd>{actor}</dd></div>
          <div><dt>{text.command}</dt><dd>{current?.commandType ?? '—'}</dd></div>
          <div className="replay-evidence__wide">
            <dt>{text.intent}</dt>
            <dd>
              <code>
                {current
                  ? visibleIntent === undefined
                    ? text.hiddenIntent
                    : JSON.stringify(visibleIntent)
                  : '—'}
              </code>
            </dd>
          </div>
          <div className="replay-evidence__wide">
            <dt>{text.frameHash}</dt>
            <dd><code>{current?.frameHash ?? '—'}</code></dd>
          </div>
        </dl>
      </aside>

      <footer className="replay-transport">
        <button type="button" onClick={() => move(-1)} disabled={!canMovePrevious}>
          {text.previous}
        </button>
        <button type="button" className="replay-play" onClick={() => setPlaying((value) => !value)}>
          {playing ? text.pause : text.play}
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          disabled={!canMoveNext}
        >
          {text.next}
        </button>
        <input
          aria-label={text.step}
          type="range"
          min={0}
          max={Math.max(0, manifest.steps.length - 1)}
          value={Math.max(0, stepIndex)}
          onChange={(event) => {
            const index = Number(event.target.value)
            const step = manifest.steps[index]
            if (step && step.stepNo - stepNo === index - stepIndex) selectStep(step.stepNo)
          }}
        />
        <output>{stepNo} / {manifest.lastStepNo}</output>
      </footer>
      {scores?.length && showScores ? (
        <ScoringPad
          locale={locale}
          scores={scores}
          players={visibleFrame?.players ?? []}
          onClose={() => setShowScores(false)}
          showDraftHistory
        />
      ) : null}
    </main>
  )
}

export function ReplayViewer({ locale }: { locale: Locale }) {
  return new URLSearchParams(window.location.search).get('mode') === 'reported-evidence'
    ? <ReportedEvidenceViewer locale={locale} />
    : <ArchiveReplayViewer locale={locale} />
}
