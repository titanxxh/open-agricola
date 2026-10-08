// @vitest-environment jsdom
import { useReducer } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkshopAbilityPanel } from '../WorkshopAbilityPanel'
import { createWorkshopDraftState, workshopDraftReducer } from '../workshop-draft-model'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { sourceFingerprint } from '../../../../shared/projections/workshop-generation'
import type { AttemptPorts } from '../../../services/llm/generation/attempt'
import type { ModelTurn, ToolTransport } from '../../../services/llm/generation/protocol'
import type { WorkshopDraftContract } from '../../../../shared/contract/workshop'
import type { LlmConfig } from '../../../services/llm'

const seams = vi.hoisted(() => ({ create: vi.fn(), sandbox: vi.fn() }))
vi.mock('../../../services/llm/generation/browser', () => ({ createBrowserGenerationPorts: seams.create, createSandboxPorts: seams.sandbox }))
vi.mock('../../../services/llm/generation/admission', () => ({
  ADMITTED_GENERATION_MODELS: [{}], generationAdmission: () => ({}), resolveGenerationTarget: () => ({}),
}))

const config = { provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: 'browser-only' }
const draft = { cardId: 'CUSTOM_UITest', cardType: 'minor' as const, name: 'UI Test', description: '', cardJson: {}, effectCode: 'adopted A', artUrl: null, generation: {} }
const failure = { workspaceId: 'w', versionId: 'tested-version-B', source: 'actually tested B', sourceFingerprint: sourceFingerprint('actually tested B'), identity: { id: draft.cardId, type: draft.cardType, name: draft.name }, errors: ['B runtime error'] }
const checkpoint = vi.fn(async () => true)
const apiFetch = vi.fn()
const complete = vi.fn<ToolTransport['complete']>()
const clarification: ModelTurn = { calls: [], text: '{"kind":"clarification","message":"Which round?"}', message: { role: 'assistant', content: 'Which round?' }, finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: null, reasoningTokens: null } }

function Harness({ modelConfig = config, currentDraft = draft }: { modelConfig?: LlmConfig; currentDraft?: WorkshopDraftContract } = {}) {
  const initial = createWorkshopDraftState({ id: 'w', authorId: 'author', revision: 1, reviewStatus: 'unsubmitted', live: false, draft: currentDraft, approvedVersionId: null, sandboxPassVersionId: null, sandboxPassedAt: null })
  const [state, dispatch] = useReducer(workshopDraftReducer, workshopDraftReducer(initial, { type: 'candidateCompleted', candidate: { id: 'C', kind: 'ability', sourceCode: 'selected C', cardJson: {}, prompt: 'C request', createdAt: 1, baseRevision: 1, stale: false, validation: { valid: true, errors: [] } } }))
  return <LocaleProvider><WorkshopAbilityPanel state={state} config={modelConfig} dispatch={dispatch} checkpoint={checkpoint} apiFetch={apiFetch} onAdopt={async () => {}} sandboxFailure={failure} /></LocaleProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  complete.mockResolvedValue(clarification)
  const ports: AttemptPorts = {
    model: { target: { provider: config.provider, model: config.model, endpoint: 'https://api.deepseek.com/v1/chat/completions' }, complete },
    loadContract: async () => ({ format: 1, id: 'sandbox-v1:' + 'a'.repeat(64), runtime: 'server-isolated-vm', limits: { memoryLimitMb: 8, executionTimeoutMs: 100 }, effects: {}, actions: {}, listeners: { actions: [], phases: {}, scopes: [], players: { actor: 'player', owner: 'ownerPlayer', effectRecipient: 'effectPlayer' } }, helpers: '', semantics: [] }),
    openReferences: async () => ({ commit: 'b'.repeat(40), reads: [], execute: async () => '' }),
    validate: vi.fn(),
  }
  seams.create.mockReturnValue(ports)
  seams.sandbox.mockReturnValue({ loadContract: ports.loadContract, validate: ports.validate })
})

describe('Workshop ability request entry points', () => {
  it('cancels manual validation on unmount without checkpointing its late response', async () => {
    const sandbox: Pick<AttemptPorts, 'loadContract' | 'validate'> = seams.sandbox()
    let resolve!: (value: Awaited<ReturnType<AttemptPorts['validate']>>) => void
    vi.mocked(sandbox.validate).mockImplementation(() => new Promise(done => { resolve = done }))
    const { unmount } = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '运行静态验证' }))
    await waitFor(() => expect(sandbox.validate).toHaveBeenCalledTimes(1))
    const [, , contractId, signal] = vi.mocked(sandbox.validate).mock.calls[0]
    unmount()
    expect(signal.aborted).toBe(true)
    await act(async () => { resolve({ valid: true, errors: [], sourceFingerprint: sourceFingerprint('selected C'), sandboxContractId: contractId }) })
    expect(checkpoint).not.toHaveBeenCalled()
  })
  it('waits for AI repair and sends the actual tested B while C stays selected', async () => {
    render(<Harness />)
    expect(screen.getByLabelText('能力候选源码')).toHaveValue('selected C')
    expect(complete).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'AI 修复' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    const input = JSON.parse(String(complete.mock.calls[0][0][1].content))
    expect(input).toMatchObject({ source: 'actually tested B', intent: { kind: 'repair', failure: { versionId: 'tested-version-B', source: 'actually tested B' } } })
    await waitFor(() => expect(screen.getByText('需要补充信息')).toBeInTheDocument())
    expect(screen.getByLabelText('能力候选源码')).toHaveValue('selected C')
  })

  it.each([{ cardId: 'CUSTOM_Renamed' }, { cardType: 'occupation' as const }, { name: 'Renamed after playtest' }])('rejects repair before creating a model transport when the tested identity changed: %j', async change => {
    render(<Harness currentDraft={{ ...draft, ...change }} />)
    await userEvent.click(screen.getByRole('button', { name: 'AI 修复' }))
    expect(screen.getByText(/playtest card identity changed/)).toBeInTheDocument()
    expect(seams.create).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByLabelText('能力候选源码')).toHaveValue('selected C')
  })

  it('uses selected C for follow-up and the adopted draft after explicitly clearing selection', async () => {
    render(<Harness />)
    const input = screen.getByPlaceholderText('描述你想要的卡牌效果…')
    await userEvent.type(input, 'Change the reward')
    await userEvent.click(screen.getByRole('button', { name: '生成能力候选' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(JSON.parse(String(complete.mock.calls[0][0][1].content)).source).toBe('selected C')
    await userEvent.click(screen.getByRole('button', { name: '改用已采用草稿' }))
    await userEvent.click(screen.getByRole('button', { name: '重发' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(JSON.parse(String(complete.mock.calls[1][0][1].content))).toMatchObject({ source: 'adopted A', intent: { kind: 'resend', message: 'Change the reward' } })
  })

  it('rejects a late model completion after the author stopped the attempt', async () => {
    let resolve!: (turn: ModelTurn) => void
    complete.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'AI 修复' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    await userEvent.click(screen.getByRole('button', { name: '停止本次尝试' }))
    await act(async () => { resolve(clarification) })
    expect(screen.queryByText('需要补充信息')).not.toBeInTheDocument()
    expect(screen.getByLabelText('能力候选源码')).toHaveValue('selected C')
    expect(complete).toHaveBeenCalledTimes(1)
  })
  it.each([
    { ...config, model: 'deepseek-v4-pro' },
    { ...config, apiKey: 'replacement-browser-key' },
    { ...config, baseUrl: 'https://provider.example/v1' },
  ])('cancels the attempt when its model configuration changes: %j', async modelConfig => {
    let resolve!: (turn: ModelTurn) => void
    complete.mockImplementation(() => new Promise(done => { resolve = done }))
    const { rerender } = render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'AI 修复' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    const signal = complete.mock.calls[0][2]
    rerender(<Harness modelConfig={modelConfig} />)
    expect(signal.aborted).toBe(true)
    // Even a transport that ignores abort must not start validation or repair.
    await act(async () => { resolve({ ...clarification, text: '```ts\nconst CARD_DEF = {}; const CARD_IMPL = {};\n```' }) })
    expect(screen.getByLabelText('能力候选源码')).toHaveValue('selected C')
    expect(seams.create.mock.results[0].value.validate).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '停止本次尝试' })).not.toBeInTheDocument()
  })
  it('cancels generation when the author edits the valid candidate used as input', async () => {
    let resolve!: (turn: ModelTurn) => void
    complete.mockImplementation(() => new Promise(done => { resolve = done }))
    render(<Harness />)
    await userEvent.type(screen.getByPlaceholderText('描述你想要的卡牌效果…'), 'Change the reward')
    await userEvent.click(screen.getByRole('button', { name: '生成能力候选' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    await userEvent.type(screen.getByLabelText('能力候选源码'), ' with manual edit')
    expect(complete.mock.calls[0][2].aborted).toBe(true)
    await act(async () => { resolve(clarification) })
    expect(screen.getByLabelText('能力候选源码')).toHaveValue('selected C with manual edit')
    expect(screen.queryByText('需要补充信息')).not.toBeInTheDocument()
    expect(complete).toHaveBeenCalledTimes(1)
  })
})
