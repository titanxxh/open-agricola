import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from '../../shared/i18n'
import type {
  ReplayManifest,
  ReplayManifestResponse,
  ReplaySegment,
  ReplaySegmentResponse,
  ReplayUnavailableError,
} from '../../shared/contract/protocol/replay'
import { registerCustomCardMetadata } from '../../shared/cards/custom-card-metadata'
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

const labels = {
  en: {
    title: 'Game Archive',
    choose: 'Choose a perspective to open this replay.',
    open: 'Open information',
    timeline: 'Timeline first',
    board: 'Board first',
    play: 'Play',
    pause: 'Pause',
    previous: 'Previous',
    next: 'Next',
    loading: 'Opening archive…',
    missingPrefix: 'The beginning of this game was not archived.',
    unavailable: 'This replay range is unavailable.',
    continue: 'Continue at the next intact checkpoint',
    evidence: 'Frame evidence',
    actor: 'Actor',
    command: 'Command',
    intent: 'Intent',
    round: 'Round',
    step: 'Step',
    frameHash: 'Frame hash',
    hiddenIntent: 'Hidden for this perspective',
  },
  zh: {
    title: '对局档案',
    choose: '选择一个视角后打开回放。',
    open: '全开信息',
    timeline: '时间线优先',
    board: '棋盘优先',
    play: '播放',
    pause: '暂停',
    previous: '上一步',
    next: '下一步',
    loading: '正在打开档案…',
    missingPrefix: '这局游戏的开头未被归档。',
    unavailable: '这一段回放不可用。',
    continue: '从下一个完整检查点继续',
    evidence: '帧证据',
    actor: '行动者',
    command: '命令',
    intent: '意图',
    round: '轮次',
    step: '步骤',
    frameHash: '帧哈希',
    hiddenIntent: '当前视角不可见',
  },
} as const

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

export function ReplayViewer() {
  const params = new URLSearchParams(window.location.search)
  const roomId = params.get('room') ?? ''
  const apiBase = (params.get('api') ?? window.location.origin).replace(/\/$/, '')
  const locale: Locale = params.get('locale') === 'en' ? 'en' : 'zh'
  const text = labels[locale]
  const [manifest, setManifest] = useState<ReplayManifest | null>(null)
  const [error, setError] = useState<ReplayUnavailableError | null>(null)
  const [segments, setSegments] = useState<Record<number, ReplaySegment>>({})
  const [perspective, setPerspective] = useState<ReplayPerspective | null>(null)
  const [layout, setLayout] = useState<ReplayLayout>(() =>
    resolveLayout(params.get('layout'), window.innerWidth),
  )
  const [stepNo, setStepNo] = useState(0)
  const [playing, setPlaying] = useState(false)
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
  const actor = current?.playerIndex === null || current?.playerIndex === undefined
    ? '—'
    : manifest?.participants.find((player) => player.playerIndex === current.playerIndex)
      ?.displayName ?? `P${current.playerIndex + 1}`
  const visibleIntent = current && perspective
    ? intentForPerspective(current, perspective)
    : undefined

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
                  {player.displayName}
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
                    : manifest.participants.find((player) => player.playerIndex === step.playerIndex)
                      ?.displayName ?? `P${step.playerIndex + 1}`}
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
            const step = manifest.steps[Number(event.target.value)]
            if (step) selectStep(step.stepNo)
          }}
        />
        <output>{stepNo} / {manifest.lastStepNo}</output>
      </footer>
    </main>
  )
}
