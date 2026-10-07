import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocale } from '../../contexts/LocaleContext'
import type { LlmConfig } from '../../services/llm'
import { ADMITTED_GENERATION_MODELS, generationAdmission, resolveGenerationTarget } from '../../services/llm/generation/admission'
import { GenerationAttempt, ATTEMPT_ALLOWANCE, type AttemptSnapshot } from '../../services/llm/generation/attempt'
import { createBrowserGenerationPorts, createSandboxPorts } from '../../services/llm/generation/browser'
import { buildGenerationRequest, type GenerationIntent, type GenerationRequest, type PlaytestFailure } from '../../services/llm/generation/request'
import type { WorkshopVisibleMessage } from '../../../shared/contract/workshop-generation'
import { sourceFingerprint } from '../../../shared/projections/workshop-generation'
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
  const zh = locale === 'zh'
  const { draft, session } = state
  const candidates = session.abilityCandidates
  const selected = candidates.find(candidate => candidate.id === session.selectedAbilityCandidateId)
  const messages = session.abilityMessages as WorkshopVisibleMessage[]
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<AttemptSnapshot | null>(null)
  const [activeRequest, setActiveRequest] = useState<GenerationRequest | null>(null)
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
    if (applicable) dispatch({ type: 'generationFinished', attemptId: run.request.attemptId, draftFingerprint: run.request.draftFingerprint,
      sourceCandidate: run.request.sourceCandidate, result: snapshot.result,
      ...(snapshot.candidate ? { candidate: { ...snapshot.candidate, baseRevision: run.request.baseRevision, stale: false, validation: { ...snapshot.candidate.validation, errors: snapshot.candidate.validation.errors ?? [] } } } : {}),
    })
    else dispatch({ type: 'generationInvalidated', attemptId: run.request.attemptId })
    const content = !applicable
      ? (zh ? '生成期间输入、源码或模型配置已改变，此结果未替换当前候选。请按当前内容开始新尝试。' : 'The input, source or model configuration changed during generation. This result did not replace the current candidate; start a new attempt.')
      : snapshot.result.message || (snapshot.result.kind === 'candidate'
        ? (zh ? '完整源码已通过代码校验。请检查并采用候选，再试玩确认规则。' : 'Complete source passed code validation. Review and adopt the candidate, then playtest its behavior.')
        : (zh ? '本次尝试已结束。' : 'This attempt has ended.'))
    commitMessages(items => items.map(message => message.role === 'assistant' && message.attemptId === run.request.attemptId
      ? { role: 'assistant', attemptId: run.request.attemptId, content, ...(snapshot.status === 'cancelled' ? { interrupted: true } : {}) }
      : message))
    await checkpoint()
  }, [checkpoint, commitMessages, dispatch, zh])
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

  let admitted = false
  try { admitted = Boolean(config && generationAdmission(resolveGenerationTarget(config))) } catch { /* Invalid saved config stays closed. */ }
  const running = progress?.status === 'running'
  const live = running || progress?.status === 'paused'

  const begin = async (intent: GenerationIntent, history = messagesRef.current) => {
    if (!config || !admitted) return
    const prior = runRef.current
    if (prior && !prior.applied) { prior.attempt.cancel(); await acceptResult(prior, prior.attempt.snapshot()) }
    setError('')
    try {
      const request = buildGenerationRequest({ workspaceId: state.workspaceId, baseRevision: state.baseRevision, draft, intent, selectedCandidate: selected, messages: history })
      const ports = createBrowserGenerationPorts(config, apiFetch)
      const attempt = new GenerationAttempt(request, ports, {
        onProgress: snapshot => { if (mounted.current && runRef.current === run) setProgress(snapshot) },
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
      setError(zh ? '模型配置已改变，请开始新尝试。' : 'The model configuration changed. Start a new attempt.')
      return
    }
    if (!isCurrentAbilityAttempt(stateRef.current, run.request)) {
      setError(zh ? '输入或源码已改变，请开始新尝试。' : 'The input or source changed. Start a new attempt.')
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
      dispatch({ type: 'abilityCandidateValidated', validationId, candidateId: candidate.id, sourceFingerprint: result.sourceFingerprint, validation: result, cardJson: result.cardJson })
      await checkpoint()
    } catch (reason) {
      if (mounted.current && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
    }
    finally {
      if (validationRef.current === validation) stopValidation()
    }
  }

  const importSource = async () => {
    if (!draft.effectCode) return
    dispatch({ type: 'candidateCompleted', candidate: { id: crypto.randomUUID(), kind: 'ability', prompt: zh ? '手动编辑当前源码' : 'Manually edit adopted source', sourceCode: draft.effectCode, cardJson: draft.cardJson, validation: { valid: false, errors: [] }, createdAt: Date.now(), baseRevision: state.baseRevision, stale: false } })
    await checkpoint()
  }
  const latest = progress?.result ?? session.latestAbilityResult
  const stageLabels = zh ? { initializing: '确认资料与沙盒版本', model: '等待模型', references: '读取参考资料', validation: '校验完整源码' }
    : { initializing: 'Checking reference and sandbox versions', model: 'Waiting for model', references: 'Reading references', validation: 'Validating complete source' }

  return <div className="ai-ability-panel">
    <div className="ai-ability-panel-header">
      <h3>{zh ? '卡牌能力' : 'Card ability'}</h3>
      {draft.effectCode && <button type="button" className="aicw-button" onClick={() => { void importSource() }}>{zh ? '导入手动编辑器' : 'Open in manual editor'}</button>}
    </div>
    {draft.effectCode && <section className="aicw-current-code"><div><strong>{zh ? '当前已采用源码' : 'Currently adopted source'}</strong><span>{zh ? '生成结果先进入候选，由你决定是否采用。' : 'Generated results become candidates for you to review and adopt.'}</span></div><pre tabIndex={0}><code>{draft.effectCode}</code></pre></section>}
    {!config ? <div className="ai-panel-needs-config">{zh ? `请先在顶部「${t('platform.aiConfig')}」配置模型。` : `Configure a model in "${t('platform.aiConfig')}" first.`}</div>
      : !admitted && <div className="ai-panel-needs-config" role="status">{ADMITTED_GENERATION_MODELS.length
        ? (zh ? '当前模型或接口尚未通过工具与卡牌行为验收，请换用已验收的组合。' : 'This model or endpoint has not passed tool and card-behavior verification. Select an admitted combination.')
        : (zh ? '模型正在等待工具与卡牌行为验收，能力生成暂未开放。你仍可手动编辑和校验源码。' : 'Models are awaiting tool and card-behavior verification. Ability generation is not yet available; manual editing and validation are available.')}</div>}
    {error && <div ref={errorElement} className="form-error aicw-panel-error" role="alert" tabIndex={-1}>{error}</div>}
    <p className="form-hint">{selected ? (zh ? `追加需求将修改选中的候选 ${candidates.indexOf(selected) + 1}。` : `Follow-ups modify selected candidate ${candidates.indexOf(selected) + 1}.`) : (zh ? '追加需求以当前已采用草稿为基础。' : 'Follow-ups use the adopted draft.')}
      {selected && <button type="button" className="btn-link" onClick={() => dispatch({ type: 'sessionChanged', session: { selectedAbilityCandidateId: undefined } })}>{zh ? '改用已采用草稿' : 'Use adopted draft'}</button>}</p>

    {progress && <section ref={progressElement} tabIndex={-1} className="aicw-generation-progress" aria-label={zh ? '生成进度' : 'Generation progress'}>
      <strong role="status">{progress.status === 'running' ? stageLabels[progress.stage] : progress.status === 'paused' ? (zh ? '已暂停' : 'Paused') : progress.status === 'cancelled' ? (zh ? '已中断' : 'Interrupted') : (zh ? '本次尝试已结束' : 'Attempt finished')}</strong>
      {activeRequest && <p className="form-hint">{zh ? '本次固定输入' : 'Fixed input for this attempt'}: {activeRequest.input.intent.kind === 'repair'
        ? `${zh ? '试玩版本' : 'Playtest version'} ${activeRequest.input.intent.failure.versionId.slice(0, 10)}`
        : activeRequest.sourceCandidate ? (zh ? '选中的候选源码' : 'Selected candidate source') : (zh ? '已采用草稿' : 'Adopted draft')} · {activeRequest.input.sourceFingerprint?.slice(0, 12) ?? (zh ? '尚无源码' : 'No source yet')}</p>}
      <p>{zh ? '模型请求' : 'Model requests'} {progress.modelRequests} / {progress.allowance.modelRequests} · {zh ? '查资料' : 'References'} {progress.referenceCalls} / {progress.allowance.referenceCalls} · {zh ? '代码修复' : 'Code repairs'} {progress.repairs} / 2</p>
      <p className="form-hint">{zh ? '输入 / 输出 token' : 'Input / output tokens'}: {progress.usage.inputTokens ?? (zh ? '未知' : 'unknown')} / {progress.usage.outputTokens ?? (zh ? '未知' : 'unknown')}</p>
      {progress.reason && <p>{progress.reason}</p>}
      {progress.status === 'paused' && <>
        {progress.needsAllowance && <p>{zh ? `继续增加 ${ATTEMPT_ALLOWANCE.modelRequests} 次模型请求、${ATTEMPT_ALLOWANCE.referenceCalls} 次资料调用和 5 分钟；以上计数继续累加。` : 'Continue adds 8 model requests, 24 reference calls and 5 active minutes. Counts remain cumulative.'}</p>}
        {progress.retry === 'model' && <p>{zh ? '前一次请求的用量可能未知，重试将计为一次新请求。' : 'Usage of the previous request may be unknown. Retry counts as a new request.'}</p>}
        <button type="button" className="aicw-button" onClick={() => { void resume() }}>{progress.needsAllowance ? (progress.retry === 'model' ? (zh ? '追加额度并重试请求' : 'Add allowance and retry request') : (zh ? '追加额度并继续' : 'Add allowance and continue')) : (zh ? '重试当前步骤' : 'Retry this step')}</button>
      </>}
      {live && <button type="button" className="aicw-button" onClick={() => { void stop() }}>{zh ? '停止本次尝试' : 'Stop attempt'}</button>}
    </section>}

    {!live && latest && latest.kind !== 'candidate' && latest.kind !== 'failed-source' && <section className="aicw-generation-result" role="status"><strong>{({ clarification: zh ? '需要补充信息' : 'Clarification needed', 'capability-gap': zh ? '沙盒能力缺口' : 'Sandbox capability gap', failure: zh ? '生成未完成' : 'Generation incomplete', interrupted: zh ? '上次尝试已中断' : 'Previous attempt interrupted' })[latest.kind]}</strong><p>{latest.message}</p></section>}
    <div className="ai-chat-area">
      {!messages.length && <div className="ai-chat-hint"><p>{zh ? '描述卡牌效果，模型会按需查阅 GitHub 源码与样例。' : 'Describe the effect. The model will request GitHub source and examples as needed.'}</p></div>}
      {messages.map((message, index) => <div key={`${message.attemptId ?? index}-${message.role}-${index}`} className={`ai-message ai-message-${message.role}`}>
        <div className="ai-message-role">{message.role === 'user' ? (zh ? '你' : 'You') : 'AI'}
          {message.interrupted && <small>{zh ? ' · 已中断，需要新尝试' : ' · Interrupted; start a new attempt'}</small>}
          {message.role === 'user' && !running && <button type="button" className="btn-link ai-resend-btn" disabled={!admitted} onClick={() => { void begin({ kind: 'resend', message: message.content }, messages.slice(0, index)) }}>{zh ? '重发' : 'Resend'}</button>}
        </div><div className={`ai-message-content${message.streaming && running ? ' ai-streaming' : ''}`}><MessageContent text={message.content || (message.streaming ? '…' : '')} /></div>
      </div>)}<div ref={bottom} />
    </div>
    {config && <div className="ai-input-area"><textarea value={session.abilityInput} onChange={event => dispatch({ type: 'sessionChanged', session: { abilityInput: event.target.value } })} placeholder={zh ? '描述你想要的卡牌效果…' : 'Describe the card effect…'} rows={3} disabled={running} />
      <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void begin({ kind: selected || draft.effectCode ? 'follow-up' : 'generate', message: session.abilityInput.trim() }) }} disabled={running || !session.abilityInput.trim() || !admitted}>{running ? (zh ? '生成中…' : 'Generating…') : live ? (zh ? '开始新尝试' : 'Start new attempt') : (zh ? '生成能力候选' : 'Generate ability candidate')}</button></div>}

    {candidates.length > 0 && <section className="aicw-candidate-section">
      <div className="aicw-candidate-heading"><div><strong>{zh ? '最近能力候选' : 'Recent ability candidates'}</strong><span>{zh ? '代码校验通过后仍需试玩确认规则。' : 'Code validation still requires a behavior playtest.'}</span></div><span>{candidates.length} / 3</span></div>
      <div className="aicw-ability-tabs">{candidates.map((candidate, index) => <button type="button" key={candidate.id} aria-pressed={selected?.id === candidate.id} className={selected?.id === candidate.id ? 'is-selected' : ''} onClick={() => dispatch({ type: 'sessionChanged', session: { selectedAbilityCandidateId: candidate.id } })}><strong>{zh ? '候选' : 'Candidate'} {index + 1}</strong><small>{candidate.validation.valid ? (zh ? '代码校验通过' : 'Code validated') : (zh ? '未通过校验，不可采用' : 'Unvalidated; cannot adopt')}</small></button>)}</div>
      {selected && <div className="aicw-ability-review">
        <div className="aicw-candidate-toolbar"><span className={`aicw-candidate-state${selected.stale ? ' is-stale' : ''}`}>{selected.stale ? (zh ? '基于旧草稿生成' : 'Generated from an older draft') : selected.validation.valid ? (zh ? '代码校验通过，待采用' : 'Code validated, awaiting adoption') : (zh ? '保留源码供修改' : 'Source retained for editing')}</span>
          <details><summary>{zh ? '生成记录与资料来源' : 'Generation record and references'}</summary><p>{selected.prompt}</p><p>{[selected.provider, selected.model].filter(Boolean).join(' · ')}</p>{selected.provenance && <><p>GitHub: {selected.provenance.referenceCommit?.slice(0, 12)} · Sandbox: {selected.provenance.sandboxContractId?.slice(0, 24)}</p><ul>{selected.provenance.references.map((reference, index) => <li key={`${reference.url}-${index}`}><a href={reference.url} target="_blank" rel="noopener noreferrer">{reference.path}:{reference.startLine}–{reference.endLine}</a></li>)}</ul></>}</details></div>
        <textarea className="aicw-source-editor" value={selected.sourceCode} onChange={event => dispatch({ type: 'abilityCandidateEdited', candidateId: selected.id, sourceCode: event.target.value })} aria-label={zh ? '能力候选源码' : 'Ability candidate source'} spellCheck={false} />
        {selected.validation.errors.length > 0 && <ul className="aicw-validation-errors">{selected.validation.errors.map((item, index) => <li key={index}>{item}</li>)}</ul>}
        <div className="aicw-candidate-actions"><button type="button" className="aicw-button" onClick={() => { dispatch({ type: 'candidateDiscarded', kind: 'ability', candidateId: selected.id }); void checkpoint() }}>{zh ? '丢弃候选' : 'Discard'}</button>
          <button type="button" className="aicw-button" disabled={validating === selected.id} onClick={() => { void validate(selected) }}>{validating === selected.id ? (zh ? '验证中…' : 'Validating…') : (zh ? '运行静态验证' : 'Run static validation')}</button>
          <button type="button" className="aicw-button aicw-button-primary" disabled={!selected.validation.valid} onClick={() => { void onAdopt(selected) }}>{zh ? '采用为当前源码' : 'Adopt as current source'}</button></div>
      </div>}
    </section>}
    {sandboxFailure && <section className="ai-validation-error-bar"><div><strong>{zh ? '试玩报错' : 'Playtest failed'} · {sandboxFailure.versionId.slice(0, 10)}</strong><p>{sandboxFailure.errors.join('\n')}</p><p>{zh ? '修复针对实际试玩的这份源码。' : 'Repair targets the source actually used in this playtest.'}</p></div><button type="button" className="aicw-button" disabled={running || !admitted} onClick={() => { void begin({ kind: 'repair', message: zh ? '根据本次试玩错误修复完整源码，保持其他规则不变。' : 'Fix the complete source for this playtest failure, preserving the other rules.', failure: sandboxFailure }) }}>{zh ? 'AI 修复' : 'AI repair'}</button></section>}
    {validationErrors && <div className="ai-validation-error-bar"><div>{validationErrors}</div><button type="button" className="aicw-button" disabled={running || !admitted} onClick={() => { void begin({ kind: 'follow-up', message: `${zh ? '修复代码校验错误' : 'Fix these code validation errors'}:\n${validationErrors}` }); onValidationErrorsConsumed?.() }}>{zh ? '发送给 AI 修复' : 'Send to AI'}</button></div>}
  </div>
}
