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

const seams = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../../../services/llm/generation/browser', () => ({ createBrowserGenerationPorts: seams.create, createSandboxPorts: vi.fn() }))
vi.mock('../../../services/llm/generation/admission', () => ({
  ADMITTED_GENERATION_MODELS: [{}], generationAdmission: () => ({}), resolveGenerationTarget: () => ({}),
}))

const config = { provider: 'deepseek' as const, model: 'deepseek-v4-flash', apiKey: 'browser-only' }
const draft = { cardId: 'CUSTOM_UITest', cardType: 'minor' as const, name: 'UI Test', description: '', cardJson: {}, effectCode: 'adopted A', artUrl: null, generation: {} }
const failure = { workspaceId: 'w', versionId: 'tested-version-B', source: 'actually tested B', sourceFingerprint: sourceFingerprint('actually tested B'), errors: ['B runtime error'] }
const checkpoint = vi.fn(async () => true)
const apiFetch = vi.fn()
const complete = vi.fn<ToolTransport['complete']>()
const clarification: ModelTurn = { calls: [], text: '{"kind":"clarification","message":"Which round?"}', message: { role: 'assistant', content: 'Which round?' }, finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: null, reasoningTokens: null } }

function Harness() {
  const initial = createWorkshopDraftState({ id: 'w', authorId: 'author', revision: 1, reviewStatus: 'unsubmitted', live: false, draft, approvedVersionId: null, sandboxPassVersionId: null, sandboxPassedAt: null })
  const [state, dispatch] = useReducer(workshopDraftReducer, workshopDraftReducer(initial, { type: 'candidateCompleted', candidate: { id: 'C', kind: 'ability', sourceCode: 'selected C', cardJson: {}, prompt: 'C request', createdAt: 1, baseRevision: 1, stale: false, validation: { valid: true, errors: [] } } }))
  return <LocaleProvider><WorkshopAbilityPanel state={state} config={config} dispatch={dispatch} checkpoint={checkpoint} apiFetch={apiFetch} onAdopt={async () => {}} sandboxFailure={failure} /></LocaleProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Element.prototype.scrollIntoView = vi.fn()
  complete.mockResolvedValue(clarification)
  const ports: AttemptPorts = {
    model: { target: { provider: config.provider, model: config.model, endpoint: 'https://api.deepseek.com/v1/chat/completions' }, complete },
    loadContract: async () => ({ format: 1, id: 'sandbox-v1:' + 'a'.repeat(64), runtime: 'server-isolated-vm', limits: { memoryLimitMb: 8, executionTimeoutMs: 100 }, effects: {}, actions: {}, listeners: { actions: [], phases: {}, scopes: [] }, helpers: '', semantics: [] }),
    openReferences: async () => ({ commit: 'b'.repeat(40), reads: [], execute: async () => '' }),
    validate: vi.fn(),
  }
  seams.create.mockReturnValue(ports)
})

describe('Workshop ability request entry points', () => {
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
})
