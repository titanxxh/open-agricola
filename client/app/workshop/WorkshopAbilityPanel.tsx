import { t as translateMessage } from '../../../shared/i18n'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { LlmConfig } from '../../services/llm'
import { getBrowserTestRuntimeId, runBrowserCardTests } from '../../local-sandbox/card-tests'
import { GenerationAttempt, ATTEMPT_ALLOWANCE, type AttemptSnapshot } from '../../services/llm/generation/attempt'
import { createBrowserGenerationPorts, createSandboxPorts } from '../../services/llm/generation/browser'
import { buildGenerationRequest, matchesGenerationIdentity, type GenerationIntent, type GenerationRequest, type PlaytestFailure } from '../../services/llm/generation/request'
import type { WorkshopVisibleMessage } from '../../../shared/contract/workshop-generation'
import { abilityArtifactFingerprint, currentAbilityTesting, isAbilityCandidateReady, sourceFingerprint } from '../../../shared/projections/workshop-generation'
import { isCurrentAbilityAttempt, type AbilityCandidate, type WorkshopDraftAction, type WorkshopDraftState } from './workshop-draft-model'
import { MessageContent } from './WorkshopMessageContent'

type Props = {
  state: WorkshopDraftState
  config: LlmConfig | null
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>
  dispatch: (action: WorkshopDraftAction) => void
  checkpoint: () => Promise<boolean>
  onAdopt: (candidate: AbilityCandidate) => Promise<void>
  sandboxFailure?: PlaytestFailure | null
  validationErrors?: string | null
  onValidationErrorsConsumed?: () => void
}
type ActiveRun = { attempt: GenerationAttempt; request: GenerationRequest; config: LlmConfig; applied: boolean }
const sameConfig = (current: LlmConfig | null, captured: LlmConfig): boolean => Boolean(current
  && current.provider === captured.provider && current.model === captured.model
  && current.apiKey === captured.apiKey && current.baseUrl === captured.baseUrl)

export function WorkshopAbilityPanel({ state, config, apiFetch, dispatch, checkpoint, onAdopt, sandboxFailure, validationErrors, onValidationErrorsConsumed }: Props) {
  const { locale, t } = useLocale()
  const { draft, session } = state
  const candidates = session.abilityCandidates
  const selected = candidates.find(candidate => candidate.id === session.selectedAbilityCandidateId)
  const messages = session.abilityMessages as WorkshopVisibleMessage[]
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<AttemptSnapshot | null>(null)
  const [activeRequest, setActiveRequest] = useState<GenerationRequest | null>(null)
  const [browserRuntimeId, setBrowserRuntimeId] = useState<string>()
  const [validating, setValidating] = useState<string | null>(null)
  const runRef = useRef<ActiveRun | null>(null)
  const validationRef = useRef<{ validationId: string; controller: AbortController } | null>(null)
  const messagesRef = useRef(messages)
  const stateRef = useRef(state)
  const configRef = useRef(config)
  const mounted = useRef(true)
  const bottom = useRef<HTMLDivElement>(null)
  const errorElement = useRef<HTMLDivElement>(null)
  const progressElement = useRef<HTMLElement>(null)
  useEffect(() => {
    let active = true
    void getBrowserTestRuntimeId().then(id => { if (active) setBrowserRuntimeId(id) }).catch(reason => { if (active) setError(String(reason)) })
    return () => { active = false }
  }, [])
  const ready = (candidate: AbilityCandidate) => Boolean(browserRuntimeId && isAbilityCandidateReady(candidate, browserRuntimeId))
  const stopValidation = useCallback(() => {
    const validation = validationRef.current
    if (!validation) return
    validationRef.current = null
    validation.controller.abort()
    dispatch({ type: 'abilityValidationEnded', validationId: validation.validationId })
    if (mounted.current) setValidating(null)
  }, [dispatch])
  useLayoutEffect(() => { stateRef.current = state; configRef.current = config; messagesRef.current = messages }, [state, config, messages])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if (error) errorElement.current?.focus() }, [error])
  useEffect(() => { if (progress?.status === 'paused') progressElement.current?.focus() }, [progress?.status])

  const commitMessages = useCallback((update: (current: WorkshopVisibleMessage[]) => WorkshopVisibleMessage[]) => {
    const next = update(messagesRef.current)
    messagesRef.current = next
    dispatch({ type: 'sessionChanged', session: { abilityMessages: next } })
  }, [dispatch])

  const acceptResult = useCallback(async (run: ActiveRun, snapshot: AttemptSnapshot) => {
    if (run.applied || !snapshot.result || runRef.current !== run) return
    run.applied = true
    const current = stateRef.current
    const applicable = sameConfig(configRef.current, run.config) && isCurrentAbilityAttempt(current, run.request)
    const report = snapshot.candidate?.testing?.lastRun
    if (applicable && report) setBrowserRuntimeId(report.browserRuntimeId)
    if (applicable) dispatch({ type: 'generationFinished', attemptId: run.request.attemptId, draftFingerprint: run.request.draftFingerprint,
      sourceCandidate: run.request.sourceCandidate, result: snapshot.result,
      ...(snapshot.candidate ? { candidate: { ...snapshot.candidate, baseRevision: run.request.baseRevision, stale: false, validation: { ...snapshot.candidate.validation, errors: snapshot.candidate.validation.errors ?? [] } } } : {}),
    })
    else dispatch({ type: 'generationInvalidated', attemptId: run.request.attemptId })
    const content = !applicable
      ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.the_input_source_or_model_configuration_changed_34f5a0"))
      : snapshot.result.message || (snapshot.result.kind === 'candidate'
        ? translateMessage(locale, 'platform.validationPassed')
        : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.this_attempt_has_ended_701025")))
    commitMessages(items => items.map(message => message.role === 'assistant' && message.attemptId === run.request.attemptId
      ? { role: 'assistant', attemptId: run.request.attemptId, content, ...(snapshot.status === 'cancelled' ? { interrupted: true } : {}) }
      : message))
    await checkpoint()
  }, [checkpoint, commitMessages, dispatch, locale])
  const acceptResultRef = useRef(acceptResult)
  useLayoutEffect(() => { acceptResultRef.current = acceptResult }, [acceptResult])

  useLayoutEffect(() => {
    const run = runRef.current
    if (run && !run.applied && (!sameConfig(config, run.config) || !isCurrentAbilityAttempt(state, run.request))) {
      run.attempt.cancel()
      void acceptResult(run, run.attempt.snapshot())
    }
    if (validationRef.current && state.session.activeAbilityValidationId !== validationRef.current.validationId) stopValidation()
  }, [state, config, acceptResult, stopValidation])

  useLayoutEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopValidation()
      const run = runRef.current
      if (run && !run.applied) {
        run.attempt.cancel()
        void acceptResultRef.current(run, run.attempt.snapshot())
      }
    }
  }, [stopValidation])

  const running = progress?.status === 'running'
  const live = running || progress?.status === 'paused'

  const begin = async (intent: GenerationIntent, history = messagesRef.current) => {
    if (!config) return
    const prior = runRef.current
    if (prior && !prior.applied) { prior.attempt.cancel(); await acceptResult(prior, prior.attempt.snapshot()) }
    setError('')
    try {
      const request = buildGenerationRequest({ workspaceId: state.workspaceId, baseRevision: state.baseRevision, draft, intent, selectedCandidate: selected, messages: history })
      const ports = createBrowserGenerationPorts(config, apiFetch)
      const attempt = new GenerationAttempt(request, ports, {
        onProgress: snapshot => {
          if (!mounted.current || runRef.current !== run) return
          setProgress(snapshot)
          if (snapshot.status === 'paused' && snapshot.candidate) {
            dispatch({ type: 'generationCheckpoint', attemptId: request.attemptId, candidate: { ...snapshot.candidate, baseRevision: request.baseRevision, stale: false, validation: { ...snapshot.candidate.validation, errors: snapshot.candidate.validation.errors ?? [] } } })
            void checkpoint()
          }
        },
        onText: delta => {
          if (!mounted.current || runRef.current !== run || run.applied) return
          commitMessages(items => items.map(message => message.role === 'assistant' && message.attemptId === request.attemptId
            ? { ...message, content: (message.content + delta).slice(-64000), streaming: true } : message))
        },
      })
      const run: ActiveRun = { attempt, request, config: { ...config }, applied: false }
      runRef.current = run
      setActiveRequest(request)
      dispatch({ type: 'generationStarted', attemptId: request.attemptId })
      // Keep the synchronous ownership check in step with the reducer dispatch.
      stateRef.current = { ...stateRef.current, session: { ...stateRef.current.session, activeAbilityAttemptId: request.attemptId } }
      dispatch({ type: 'sessionChanged', session: { abilityInput: '' } })
      commitMessages(() => [...history, { role: 'user', content: intent.message, attemptId: request.attemptId }, { role: 'assistant', content: '', streaming: true, attemptId: request.attemptId }])
      await acceptResult(run, await attempt.start())
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const resume = async () => {
    const run = runRef.current
    if (!run) return
    if (!sameConfig(config, run.config)) {
      setError(translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.the_model_configuration_changed_start_a_new_c9024c"))
      return
    }
    if (!isCurrentAbilityAttempt(stateRef.current, run.request)) {
      setError(translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.the_input_or_source_changed_start_a_b7fe31"))
      return
    }
    await acceptResult(run, await run.attempt.resume({ extendAllowance: progress?.needsAllowance, retry: Boolean(progress?.retry) }))
  }

  const stop = async () => {
    const run = runRef.current
    if (run) { run.attempt.cancel(); await acceptResult(run, run.attempt.snapshot()) }
  }

  const validate = async (candidate: AbilityCandidate) => {
    stopValidation()
    setValidating(candidate.id); setError('')
    const validationId = crypto.randomUUID()
    const controller = new AbortController()
    const validation = { validationId, controller }
    validationRef.current = validation
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)])
    dispatch({ type: 'abilityValidationStarted', validationId })
    stateRef.current = { ...stateRef.current, session: { ...stateRef.current.session, activeAbilityValidationId: validationId } }
    try {
      const ports = createSandboxPorts(apiFetch)
      const contract = await ports.loadContract(signal)
      signal.throwIfAborted()
      const result = await ports.validate(candidate.sourceCode, draft.cardId, contract.id, signal)
      signal.throwIfAborted()
      if (!mounted.current || stateRef.current.session.activeAbilityValidationId !== validationId) return
      if (result.sourceFingerprint !== sourceFingerprint(candidate.sourceCode) || result.sandboxContractId !== contract.id) throw new Error('Validation belongs to different source or sandbox.')
      if (result.valid && !matchesGenerationIdentity(result.cardJson, { id: draft.cardId, type: draft.cardType, name: draft.name })) {
        result.valid = false
        result.errors = [...result.errors, 'CARD_DEF id, card type and name must match the immutable request identity.']
      }
      const testing = { code: candidate.testing?.code ?? '' }
      let tested = candidate.testing
      if (result.valid) {
        const report = testing.code.trim()
          ? await runBrowserCardTests({ source: candidate.sourceCode, tests: testing.code, signal })
          : { browserRuntimeId: await getBrowserTestRuntimeId(), outcome: { kind: 'error' as const, message: 'Add behavior tests before running UT.' } }
        signal.throwIfAborted()
        if (!mounted.current || stateRef.current.session.activeAbilityValidationId !== validationId) return
        setBrowserRuntimeId(report.browserRuntimeId)
        tested = { ...testing, lastRun: { ...report, artifactFingerprint: abilityArtifactFingerprint(candidate.sourceCode, testing.code) } }
      }
      dispatch({ type: 'abilityCandidateValidated', validationId, candidateId: candidate.id, sourceFingerprint: result.sourceFingerprint, validation: result, testing: tested, cardJson: result.cardJson })
      await checkpoint()
    } catch (reason) {
      if (mounted.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    }
    finally {
      if (validationRef.current === validation) stopValidation()
    }
  }

  const adopt = async (candidate: AbilityCandidate) => {
    try {
      const runtimeId = await getBrowserTestRuntimeId()
      setBrowserRuntimeId(runtimeId)
      if (!isAbilityCandidateReady(candidate, runtimeId)) throw new Error('Run validation and UT for the current source, tests and browser runtime before adopting.')
      await onAdopt(candidate)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const importSource = async () => {
    if (!draft.effectCode) return
    dispatch({ type: 'candidateCompleted', candidate: { id: crypto.randomUUID(), kind: 'ability', prompt: translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.manually_edit_adopted_source_cbecf3"), sourceCode: draft.effectCode, cardJson: draft.cardJson, testing: { code: currentAbilityTesting(draft)?.code ?? '' }, validation: { valid: false, errors: [] }, createdAt: Date.now(), baseRevision: state.baseRevision, stale: false } })
    await checkpoint()
  }
  const latest = progress?.result ?? session.latestAbilityResult
  const stageLabels = { "initializing": translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.checking_reference_and_sandbox_versions_06ac4b"), "model": translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.waiting_for_model_02338d"), "tools": "AI", "testing": "UT", "validation": translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.validating_complete_source_e31675") }

  return <div className="ai-ability-panel">
    <div className="ai-ability-panel-header">
      <h3>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.card_ability_e73e6d")}</h3>
      {draft.effectCode && <button type="button" className="aicw-button" onClick={() => { void importSource() }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.open_in_manual_editor_78402e")}</button>}
    </div>
    {draft.effectCode && <section className="aicw-current-code"><div><strong>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.currently_adopted_source_444554")}</strong><span>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generated_results_become_candidates_for_you_to_6cc51a")}</span></div><pre tabIndex={0}><code>{draft.effectCode}</code></pre></section>}
    {!config && <div className="ai-panel-needs-config">{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.configure_a_model_in_first_806eb5", { value0: t('platform.aiConfig') })}</div>}
    {error && <div ref={errorElement} className="form-error aicw-panel-error" role="alert" tabIndex={-1}>{error}</div>}
    <p className="form-hint">{selected ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.follow_ups_modify_selected_candidate_72453c", { value0: candidates.indexOf(selected) + 1 })) : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.follow_ups_use_the_adopted_draft_aa3ca5"))}
      {selected && <button type="button" className="btn-link" onClick={() => dispatch({ type: 'sessionChanged', session: { selectedAbilityCandidateId: undefined } })}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.use_adopted_draft_6021c4")}</button>}</p>

    {progress && <section ref={progressElement} tabIndex={-1} className="aicw-generation-progress" aria-label={translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generation_progress_9ca061")}>
      <strong role="status">{progress.status === 'running' ? stageLabels[progress.stage] : progress.status === 'paused' ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.paused_cf54b6")) : progress.status === 'cancelled' ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.interrupted_297455")) : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.attempt_finished_95c800"))}</strong>
      {activeRequest && <p className="form-hint">{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.fixed_input_for_this_attempt_670013")}: {activeRequest.input.intent.kind === 'repair'
        ? `${translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.playtest_version_37fd1d")} ${activeRequest.input.intent.failure.versionId.slice(0, 10)}`
        : activeRequest.sourceCandidate ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.selected_candidate_source_54109c")) : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.adopted_draft_6101e6"))} · {activeRequest.input.sourceFingerprint?.slice(0, 12) ?? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.no_source_yet_3bb1af"))}</p>}
      <p>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.model_requests_249d90")} {progress.modelRequests} / {progress.allowance.modelRequests} · {translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.references_9d957c")} {progress.referenceCalls}</p>
      <p className="form-hint">{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.input_output_tokens_2ebef1")}: {progress.usage.inputTokens ?? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.unknown_82d553"))} / {progress.usage.outputTokens ?? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.unknown_82d553"))}</p>
      {progress.reason && <p>{progress.reason}</p>}
      {progress.status === 'paused' && <>
        {progress.needsAllowance && <p>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.model_requests_249d90")}: +{ATTEMPT_ALLOWANCE.modelRequests} · 5 min</p>}
        {progress.retry === 'model' && <p>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.usage_of_the_previous_request_may_be_cb870a")}</p>}
        <button type="button" className="aicw-button" onClick={() => { void resume() }}>{progress.needsAllowance ? (progress.retry === 'model' ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.add_allowance_and_retry_request_c6a247")) : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.add_allowance_and_continue_ac02f5"))) : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.retry_this_step_7e6405"))}</button>
      </>}
      {live && <button type="button" className="aicw-button" onClick={() => { void stop() }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.stop_attempt_56ddbc")}</button>}
    </section>}

    {!live && latest && latest.kind !== 'candidate' && latest.kind !== 'failed-source' && <section className="aicw-generation-result" role="status"><strong>{({ answer: 'AI', failure: translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generation_incomplete_e6bd1c"), interrupted: translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.previous_attempt_interrupted_64e6b1") })[latest.kind]}</strong><p>{latest.message}</p></section>}
    <div className="ai-chat-area">
      {!messages.length && <div className="ai-chat-hint"><p>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.describe_the_effect_the_model_will_request_7bd2cb")}</p></div>}
      {messages.map((message, index) => <div key={`${message.attemptId ?? index}-${message.role}-${index}`} className={`ai-message ai-message-${message.role}`}>
        <div className="ai-message-role">{message.role === 'user' ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.you_efc9ff")) : 'AI'}
          {message.interrupted && <small>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.interrupted_start_a_new_attempt_3c189e")}</small>}
          {message.role === 'user' && !running && <button type="button" className="btn-link ai-resend-btn" disabled={!config} onClick={() => { void begin({ kind: 'resend', message: message.content }, messages.slice(0, index)) }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.resend_d02dd3")}</button>}
        </div><div className={`ai-message-content${message.streaming && running ? ' ai-streaming' : ''}`}><MessageContent text={message.content || (message.streaming ? '…' : '')} /></div>
      </div>)}<div ref={bottom} />
    </div>
    {config && <div className="ai-input-area"><textarea value={session.abilityInput} onChange={event => dispatch({ type: 'sessionChanged', session: { abilityInput: event.target.value } })} placeholder={translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.describe_the_card_effect_b8e539")} rows={3} disabled={running} />
      <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void begin({ kind: selected || draft.effectCode ? 'follow-up' : 'generate', message: session.abilityInput.trim() }) }} disabled={running || !session.abilityInput.trim() || !config}>{running ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generating_e604d4")) : live ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.start_new_attempt_2ba1e6")) : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generate_ability_candidate_4232d5"))}</button></div>}

    {candidates.length > 0 && <section className="aicw-candidate-section">
      <div className="aicw-candidate-heading"><div><strong>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.recent_ability_candidates_f00791")}</strong><span>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.code_validation_still_requires_a_behavior_playtest_f41c3d")}</span></div><span>{candidates.length} / 3</span></div>
      <div className="aicw-ability-tabs">{candidates.map((candidate, index) => <button type="button" key={candidate.id} aria-pressed={selected?.id === candidate.id} className={selected?.id === candidate.id ? 'is-selected' : ''} onClick={() => dispatch({ type: 'sessionChanged', session: { selectedAbilityCandidateId: candidate.id } })}><strong>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.candidate_d4e8ef")} {index + 1}</strong><small>{ready(candidate) ? t('platform.validationPassed') : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.unvalidated_cannot_adopt_b3daad"))}</small></button>)}</div>
      {selected && <div className="aicw-ability-review">
        <div className="aicw-candidate-toolbar"><span className={`aicw-candidate-state${selected.stale ? ' is-stale' : ''}`}>{selected.stale ? (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generated_from_an_older_draft_7f8037")) : ready(selected) ? t('platform.validationPassed') : (translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.source_retained_for_editing_27eb7f"))}</span>
          <details><summary>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.generation_record_and_references_a66104")}</summary><p>{selected.prompt}</p><p>{[selected.provider, selected.model].filter(Boolean).join(' · ')}</p>{selected.provenance && <><p>GitHub: {selected.provenance.referenceCommit?.slice(0, 12)} · Sandbox: {selected.provenance.sandboxContractId?.slice(0, 24)}</p><ul>{selected.provenance.references.map((reference, index) => <li key={`${reference.url}-${index}`}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.path}:{reference.startLine}–{reference.endLine}</a></li>)}</ul></>}</details></div>
        <textarea className="aicw-source-editor" value={selected.sourceCode} onChange={event => dispatch({ type: 'abilityCandidateEdited', candidateId: selected.id, sourceCode: event.target.value })} aria-label={translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.ability_candidate_source_800c22")} spellCheck={false} />
        <label>UT<textarea className="aicw-source-editor" aria-label="UT" spellCheck={false} value={selected.testing?.code ?? ''} onChange={event => dispatch({ type: 'abilityCandidateEdited', candidateId: selected.id, sourceCode: selected.sourceCode, tests: event.target.value })} /></label>
        {selected.testing?.lastRun && <section className="aicw-ut-report" role="status">
          <strong>UT · {ready(selected) ? t('platform.validationPassed') : t('platform.validationFailed')}</strong>
          {selected.testing.lastRun.outcome.kind === 'passed' && <span> · {selected.testing.lastRun.outcome.count}</span>}
          {selected.testing.lastRun.outcome.kind === 'error' && <p>{selected.testing.lastRun.outcome.message}</p>}
          {selected.testing.lastRun.outcome.kind === 'failed' && <ul>{selected.testing.lastRun.outcome.failures.map((failure, index) => <li key={index}>{failure.name}: {failure.error}</li>)}</ul>}
        </section>}
        {selected.validation.errors.length > 0 && <ul className="aicw-validation-errors">{selected.validation.errors.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        <div className="aicw-candidate-actions"><button type="button" className="aicw-button" onClick={() => { dispatch({ type: 'candidateDiscarded', kind: 'ability', candidateId: selected.id }); void checkpoint() }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.discard_2ec117")}</button>
          <button type="button" className="aicw-button" onClick={() => { if (validating === selected.id) stopValidation(); else void validate(selected) }}>{validating === selected.id ? translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.stop_attempt_56ddbc") : t('platform.validateCode')}</button>
          <button type="button" className="aicw-button aicw-button-primary" disabled={!ready(selected) || validating !== null} onClick={() => { void adopt(selected) }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.adopt_as_current_source_953de9")}</button></div>
      </div>}
    </section>}
    {sandboxFailure && <section className="ai-validation-error-bar"><div><strong>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.playtest_failed_33437a")} · {sandboxFailure.versionId.slice(0, 10)}</strong><p>{sandboxFailure.errors.join('\n')}</p><p>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.repair_targets_the_source_actually_used_in_c3eebb")}</p></div><button type="button" className="aicw-button" disabled={running || !config} onClick={() => { void begin({ kind: 'repair', message: translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.fix_the_complete_source_for_this_playtest_d9ccac"), failure: sandboxFailure }) }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.ai_repair_b4d072")}</button></section>}
    {validationErrors && <div className="ai-validation-error-bar"><div>{validationErrors}</div><button type="button" className="aicw-button" disabled={running || !config} onClick={() => { void begin({ kind: 'follow-up', message: `${translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.fix_these_code_validation_errors_229c94")}:\n${validationErrors}` }); onValidationErrorsConsumed?.() }}>{translateMessage(locale, "ui.copy.app_workshop_WorkshopAbilityPanel.send_to_ai_d5662e")}</button></div>}
  </div>
}
