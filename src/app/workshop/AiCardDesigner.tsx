import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig, defaultModel,
  streamChat, extractCardFromResponse, generateCardArt, buildCardArtPrompt,
  supportsImageGeneration,
  PROVIDER_LABELS, PROVIDER_KEY_HINTS, PROVIDER_MODELS,
  type LlmConfig, type LlmProvider, type ChatMessage,
} from '../../services/llmService'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../services/llmPrompts'
import { useLocale } from '../../contexts/LocaleContext'
import { ResourceText } from '../../components/common/ResourceText'

const backendHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const API_BASE = import.meta.env.VITE_API_BASE || `http://${backendHost}:5175`
const TOKEN_KEY = 'open-agricola-token'

async function uploadArt(dataUrl: string): Promise<string | null> {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const resp = await fetch(`${API_BASE}/api/workshop/art`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ dataUrl }),
    })
    const d = await resp.json()
    if (d.ok && d.url) return `${API_BASE}${d.url}`
    return null
  } catch {
    return null
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExtractedCard = {
  card: {
    id: string
    name: string
    card_type: 'minor' | 'occupation'
    cost: Record<string, number>
    vp: number
    desc: string[]
    prerequisite?: string
    modifiers?: unknown[]
  }
  effects?: Record<string, unknown>
  sourceCode?: string
}

type DisplayMessage = ChatMessage & { streaming?: boolean; isError?: boolean }

// ── Markdown with code copy ─────────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="ai-code-block">
      <div className="ai-code-header">
        {lang && <span className="ai-code-lang">{lang}</span>}
        <button type="button" className="ai-code-copy" onClick={handleCopy}>
          {copied ? '✓' : '复制'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

function MessageContent({ text }: { text: string }) {
  const parts = text.split(/(```[\s\S]*?```)/g)

  return (
    <>
      {parts.map((part, i) => {
        const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/)
        if (codeMatch) {
          const [, lang, code] = codeMatch
          return <CodeBlock key={i} lang={lang ?? ''} code={code ?? ''} />
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// ── Config Panel ──────────────────────────────────────────────────────────────

function ApiKeyPanel({ onConfigured }: { onConfigured: () => void }) {
  const [provider, setProvider] = useState<LlmProvider>('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(defaultModel('openai'))
  const [baseUrl, setBaseUrl] = useState('')
  const [showKey, setShowKey] = useState(false)

  const handleProviderChange = (p: LlmProvider) => {
    setProvider(p)
    setModel(defaultModel(p))
    setBaseUrl('')
  }

  const handleSave = () => {
    if (!apiKey.trim()) return
    saveLlmConfig({ provider, apiKey: apiKey.trim(), model, baseUrl: baseUrl.trim() || undefined })
    onConfigured()
  }

  return (
    <div className="ai-config-panel">
      <div className="ai-config-notice">
        <span className="ai-notice-icon">🔒</span>
        <div>
          <strong>API Key 安全声明</strong>
          <p>
            你的 API Key 仅保存在浏览器本地（localStorage）。
            它<strong>绝不会</strong>通过 WebSocket 或 HTTP 发送到游戏服务器。
            所有 AI 请求由你的浏览器直接发出，游戏服务器无法获取你的 Key。
            <br/>
            <a href="https://github.com/titanxxh/open-agricola/blob/main/src/services/llmService.ts" target="_blank" rel="noopener noreferrer" className="ai-source-link">
              查看源码验证
            </a>
          </p>
        </div>
      </div>

      <div className="ai-config-form">
        <div className="form-field">
          <label>AI 提供商</label>
          <div className="ai-provider-btns">
            {(['gemini', 'groq', 'openai', 'anthropic', 'openrouter', 'custom'] as LlmProvider[]).map(p => (
              <button
                key={p}
                type="button"
                className={`ai-provider-btn${provider === p ? ' active' : ''}`}
                onClick={() => handleProviderChange(p)}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {provider === 'custom' && (
          <div className="form-field">
            <label>API 端点（兼容 OpenAI 格式）</label>
            <input
              type="url"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder="https://your-proxy.example.com"
            />
          </div>
        )}

        <div className="form-field">
          <label>模型</label>
          {PROVIDER_MODELS[provider].length > 0 ? (
            <select value={model} onChange={e => setModel(e.target.value)} className="ai-model-select">
              {PROVIDER_MODELS[provider].map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={defaultModel(provider)}
            />
          )}
        </div>

        <div className="form-field">
          <label>API Key</label>
          <div className="ai-key-input-row">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={provider === 'openai' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : 'your-api-key'}
              autoComplete="off"
            />
            <button type="button" className="btn-link ai-toggle-key" onClick={() => setShowKey(s => !s)}>
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          {PROVIDER_KEY_HINTS[provider] && (
            <div className="form-hint">
              获取 Key：<a href={`https://${PROVIDER_KEY_HINTS[provider]}`} target="_blank" rel="noopener noreferrer">{PROVIDER_KEY_HINTS[provider]}</a>
            </div>
          )}
        </div>

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!apiKey.trim()}>
          保存并开始设计
        </button>
      </div>
    </div>
  )
}

// ── Art Panel ─────────────────────────────────────────────────────────────────

function ArtPanel({ cardType, cardName, artUrl, setArtUrl, config, setError }: {
  cardType: 'minor' | 'occupation'
  cardName: string
  artUrl: string | null
  setArtUrl: (url: string | null) => void
  config: LlmConfig
  setError: (msg: string) => void
}) {
  const { locale } = useLocale()
  const [artSubject, setArtSubject] = useState('')
  const [generating, setGenerating] = useState(false)
  const [artPrompt, setArtPrompt] = useState('')

  // Auto-generate prompt when subject or card type changes
  useEffect(() => {
    if (!artSubject.trim()) {
      setArtPrompt('')
      return
    }
    setArtPrompt(buildCardArtPrompt(artSubject.trim(), cardType, locale as 'zh' | 'en'))
  }, [artSubject, cardType, locale])

  const canGenerateArt = supportsImageGeneration(config)

  const handleGenerate = async () => {
    if (!artPrompt.trim() || generating || !canGenerateArt) return
    setGenerating(true)
    setError('')
    try {
      const dataUrl = await generateCardArt(artPrompt, config)
      if (!dataUrl) {
        setError(locale === 'zh'
          ? '图片生成失败，请检查 API Key 权限'
          : 'Image generation failed, please check your API key permissions')
        return
      }
      const uploaded = await uploadArt(dataUrl)
      setArtUrl(uploaded ?? dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Art generation error')
    } finally {
      setGenerating(false)
    }
  }

  const borderLabel = cardType === 'occupation'
    ? (locale === 'zh' ? '圆形金边' : 'circular gold-trimmed')
    : (locale === 'zh' ? '六角形金边' : 'hexagonal gold-trimmed')

  return (
    <div className="ai-art-panel">
      <div className="ai-art-panel-header">
        <h3>{locale === 'zh' ? '卡牌美术' : 'Card Art'}</h3>
        <span className="ai-art-border-tag">{borderLabel}</span>
      </div>

      {artUrl && (
        <div className="ai-art-preview-area">
          <img src={artUrl} alt={cardName || 'card art'} className="ai-art-preview-img" />
        </div>
      )}

      <div className="form-field">
        <label>
          {cardType === 'occupation'
            ? (locale === 'zh' ? '描述人物形象（如：一个正在锻造铁器的快乐铁匠）' : 'Describe the character (e.g., a cheerful blacksmith forging iron)')
            : (locale === 'zh' ? '描述物品（如：一个由木头和藤条编织的中世纪摇篮）' : 'Describe the object (e.g., a medieval cradle made of wood and wicker)')
          }
        </label>
        <input
          type="text"
          value={artSubject}
          onChange={e => setArtSubject(e.target.value)}
          placeholder={cardType === 'occupation'
            ? (locale === 'zh' ? '一个正在采摘水果的快乐农夫' : 'a cheerful farmer picking fruit')
            : (locale === 'zh' ? '一把质朴的中世纪木锤' : 'a rustic medieval wooden mallet')
          }
        />
      </div>

      {artPrompt && (
        <div className="ai-art-prompt-preview">
          <div className="ai-art-prompt-label">{locale === 'zh' ? '生成提示词' : 'Generation Prompt'}</div>
          <textarea
            className="ai-art-prompt-text"
            value={artPrompt}
            onChange={e => setArtPrompt(e.target.value)}
            rows={4}
          />
        </div>
      )}

      {canGenerateArt ? (
        <button
          type="button"
          className="btn-primary ai-art-gen-btn"
          onClick={handleGenerate}
          disabled={generating || !artPrompt.trim()}
        >
          {generating
            ? (locale === 'zh' ? '生成中…' : 'Generating…')
            : (locale === 'zh' ? '生成卡牌图片' : 'Generate Card Art')
          }
        </button>
      ) : (
        <div className="ai-art-no-gen">
          {locale === 'zh'
            ? '图片生成需要 OpenAI（DALL-E 3）或 Gemini（Imagen 3）API Key'
            : 'Image generation requires OpenAI (DALL-E 3) or Gemini (Imagen 3) API Key'
          }
        </div>
      )}
    </div>
  )
}

// ── Ability Chat Panel ────────────────────────────────────────────────────────

function AbilityPanel({
  config, cardType, cardName, prerequisite, costHint, extracted, setExtracted, artUrl, onImport,
  sandboxErrors, onSandboxErrorsConsumed, setError,
}: {
  config: LlmConfig
  cardType: 'minor' | 'occupation'
  cardName: string
  prerequisite?: string
  costHint?: string
  extracted: ExtractedCard | null
  setExtracted: (e: ExtractedCard | null) => void
  artUrl: string | null
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
  setError: (msg: string) => void
}) {
  const { locale } = useLocale()
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessages = useCallback(async (chatHistory: ChatMessage[]) => {
    if (!config) return
    setStreaming(true)
    setError('')

    const assistantMsg: DisplayMessage = { role: 'assistant', content: '', streaming: true }
    setMessages(prev => [...prev, assistantMsg])

    try {
      let fullText = ''
      for await (const chunk of streamChat(chatHistory, CARD_DESIGNER_SYSTEM_PROMPT, config)) {
        fullText += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: fullText, streaming: true }
          return updated
        })
      }

      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: fullText }
        return updated
      })

      const parsed = extractCardFromResponse(fullText)
      if (parsed?.card) {
        setExtracted({
          card: parsed.card as ExtractedCard['card'],
          effects: parsed.effects ?? undefined,
          sourceCode: parsed.sourceCode || undefined,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setMessages(prev => prev.filter(m => !m.streaming))
    } finally {
      setStreaming(false)
    }
  }, [config, setError, setExtracted])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !config || streaming) return

    // Prepend card context to user message
    const typeLabel = cardType === 'occupation' ? '职业卡 (Occupation)' : '小发展卡 (Minor Improvement)'
    const parts = [`卡牌类型: ${typeLabel}`]
    if (cardName.trim()) parts.push(`卡牌名称: ${cardName.trim()}`)
    if (prerequisite?.trim()) parts.push(`前置条件: ${prerequisite.trim()}`)
    if (costHint?.trim()) parts.push(`消耗资源: ${costHint.trim()}`)
    const context = `[${parts.join(', ')}]\n`

    const userContent = input.trim()
    const enrichedContent = context + userContent

    const userMsg: DisplayMessage = { role: 'user', content: userContent }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')

    // Send enriched version to LLM but display original to user
    const chatHistory: ChatMessage[] = newMessages.map((m, i) => ({
      role: m.isError ? 'user' as const : m.role,
      content: i === newMessages.length - 1 ? enrichedContent : m.content,
    }))
    await sendMessages(chatHistory)
  }, [input, config, messages, streaming, sendMessages, cardType, cardName])

  // Auto-inject sandbox errors
  useEffect(() => {
    if (!sandboxErrors?.length || streaming || !config) return

    const errorText = [
      '⚠️ 沙盒运行报错',
      '',
      '我导入的卡牌在沙盒中运行时出现了以下错误：',
      '',
      ...sandboxErrors.map((e, i) => `${i + 1}. ${e}`),
      '',
      '请根据这些错误修改卡牌定义，并给出完整的修复后 JSON。',
    ].join('\n')

    const errorMsg: DisplayMessage = { role: 'user', content: errorText, isError: true }
    const newMessages = [...messages, errorMsg]
    setMessages(newMessages)
    onSandboxErrorsConsumed?.()

    const chatHistory: ChatMessage[] = newMessages.map(m => ({ role: m.isError ? 'user' as const : m.role, content: m.content }))
    void sendMessages(chatHistory)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxErrors])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="ai-ability-panel">
      <div className="ai-ability-panel-header">
        <h3>{locale === 'zh' ? '卡牌能力' : 'Card Ability'}</h3>
        {extracted && (
          <button
            type="button"
            className="btn-primary ws-btn-sm"
            onClick={() => onImport(extracted, artUrl)}
          >
            {locale === 'zh' ? '导入编辑器 →' : 'Import →'}
          </button>
        )}
      </div>

      <div className="ai-chat-area">
        {messages.length === 0 && (
          <div className="ai-chat-hint">
            <p>{locale === 'zh' ? '描述你想设计的卡牌效果，AI 会生成符合 Agricola 规范的卡牌定义。' : 'Describe the card effect you want. AI will generate an Agricola-compatible card definition.'}</p>
            <p>{locale === 'zh' ? '示例：' : 'Examples:'}</p>
            <ul>
              <li>{locale === 'zh' ? '"工人回家时可以花 1 粮食换 3 食物，费用 1 木头"' : '"Spend 1 grain for 3 food when workers return home, costs 1 wood"'}</li>
              <li>{locale === 'zh' ? '"建造房间时节省 1 黏土"' : '"Save 1 clay when building rooms"'}</li>
            </ul>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ai-message-${msg.role}${msg.isError ? ' ai-message-error' : ''}`}>
            <div className="ai-message-role">
              {msg.isError ? (locale === 'zh' ? '沙盒报错' : 'Sandbox Error')
                : msg.role === 'user' ? (locale === 'zh' ? '你' : 'You')
                : 'AI'}
            </div>
            <div className={`ai-message-content${msg.streaming ? ' ai-streaming' : ''}`}>
              {msg.role === 'assistant'
                ? <MessageContent text={msg.content || (msg.streaming ? '▋' : '')} />
                : (msg.content || (msg.streaming ? '▋' : ''))
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {extracted && (
        <div className="ai-extracted-summary">
          <span className="ws-badge">{extracted.card.card_type === 'minor' ? (locale === 'zh' ? '小改进' : 'Minor') : (locale === 'zh' ? '职业' : 'Occupation')}</span>
          <span className="ai-extracted-name">{extracted.card.name}</span>
          {extracted.effects && Object.keys(extracted.effects).length > 0 && (
            <span className="ai-extracted-hooks">{Object.keys(extracted.effects).join(', ')}</span>
          )}
          <ResourceText text={(extracted.card.desc ?? []).join(' ')} />
        </div>
      )}

      <div className="ai-input-area">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={locale === 'zh' ? '描述你想要的卡牌效果… (Enter 发送)' : 'Describe the card effect… (Enter to send)'}
          rows={2}
          disabled={streaming}
        />
        <button
          type="button"
          className="btn-primary ai-send-btn"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '…' : '→'}
        </button>
      </div>
    </div>
  )
}

// ── Main AiCardDesigner ───────────────────────────────────────────────────────

export function AiCardDesigner({ onImport, onClose, onSaved, onAddToSandboxAndRestart, sandboxErrors, onSandboxErrorsConsumed }: {
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  onClose: () => void
  onSaved?: () => void
  onAddToSandboxAndRestart?: (cardDbId: string) => Promise<void>
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
}) {
  const { locale } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [cardType, setCardType] = useState<'minor' | 'occupation'>('minor')
  const [cardName, setCardName] = useState('')
  const [prerequisite, setPrerequisite] = useState('')
  const [costInput, setCostInput] = useState('')
  const [extracted, setExtracted] = useState<ExtractedCard | null>(null)
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleClearConfig = () => {
    clearLlmConfig()
    setConfig(null)
  }

  // Sync card type/name from extracted card
  useEffect(() => {
    if (extracted?.card) {
      if (extracted.card.card_type) setCardType(extracted.card.card_type)
      if (extracted.card.name) setCardName(extracted.card.name)
    }
  }, [extracted])

  /** Save card and return the DB ID, or null on failure. */
  const saveCardToWorkshop = async (): Promise<string | null> => {
    if (!extracted?.card) return null
    const card = extracted.card
    if (!card.name?.trim()) { setError(locale === 'zh' ? '请先设置卡牌名称' : 'Card name is required'); return null }
    if (!card.id?.startsWith('CUSTOM_') || card.id.length < 8) { setError(locale === 'zh' ? '卡牌 ID 必须以 CUSTOM_ 开头且至少8个字符' : 'Card ID must start with CUSTOM_ and be at least 8 characters'); return null }

    setSaving(true)
    setError('')
    setSaveSuccess(false)
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const cardJson = {
        id: card.id,
        name: card.name,
        deck: 'CUSTOM',
        number: 0,
        desc: card.desc ?? [],
        cost: card.cost ?? {},
        vp: card.vp ?? 0,
        modifiers: card.modifiers ?? [],
        implemented: true,
      }

      const body: Record<string, unknown> = {
        card_id: card.id,
        card_type: card.card_type,
        name: card.name,
        description: (card.desc ?? []).join(' '),
        card_json: cardJson,
        art_url: artUrl,
        status: 'draft',
      }

      // If we have source code from TS extraction, save as effect_code
      if (extracted.sourceCode) {
        body.effect_code = extracted.sourceCode
      } else if (extracted.effects && Object.keys(extracted.effects).length > 0 && !('_hasCode' in extracted.effects)) {
        body.effect_dsl = extracted.effects
      }

      const r = await fetch(`${API_BASE}/api/workshop/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const d = await r.json()
      if (d.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        return d.id as string
      } else {
        setError(d.error ?? (locale === 'zh' ? '保存失败' : 'Save failed'))
      }
    } catch {
      setError(locale === 'zh' ? '网络错误' : 'Network error')
    } finally {
      setSaving(false)
    }
    return null
  }

  const handleSaveCard = async () => {
    const dbId = await saveCardToWorkshop()
    if (dbId) onSaved?.()
  }

  const handleSaveAndAddToSandbox = async () => {
    if (!onAddToSandboxAndRestart) return
    const dbId = await saveCardToWorkshop()
    if (dbId) {
      onSaved?.()
      await onAddToSandboxAndRestart(dbId)
    }
  }

  if (!config) {
    return (
      <div className="ai-designer">
        <div className="ai-designer-header">
          <h2>{locale === 'zh' ? 'AI 卡牌设计师' : 'AI Card Designer'}</h2>
          <button type="button" className="btn-link" onClick={onClose}>{locale === 'zh' ? '关闭' : 'Close'}</button>
        </div>
        <ApiKeyPanel onConfigured={() => setConfig(getLlmConfig())} />
      </div>
    )
  }

  return (
    <div className="ai-designer">
      <div className="ai-designer-header">
        <h2>{locale === 'zh' ? 'AI 卡牌设计师' : 'AI Card Designer'}</h2>
        <div className="ai-header-actions">
          <span className="ai-provider-tag">{config.provider} / {config.model}</span>
          <button type="button" className="btn-link" onClick={handleClearConfig}>{locale === 'zh' ? '切换 API Key' : 'Switch Key'}</button>
          <button type="button" className="btn-link" onClick={onClose}>{locale === 'zh' ? '关闭' : 'Close'}</button>
        </div>
      </div>

      {/* Card info bar */}
      <div className="ai-card-info-bar">
        <div className="ai-card-type-toggle">
          <button
            type="button"
            className={`ai-type-btn${cardType === 'minor' ? ' active' : ''}`}
            onClick={() => setCardType('minor')}
          >
            {locale === 'zh' ? '小发展' : 'Minor'}
          </button>
          <button
            type="button"
            className={`ai-type-btn${cardType === 'occupation' ? ' active' : ''}`}
            onClick={() => setCardType('occupation')}
          >
            {locale === 'zh' ? '职业' : 'Occupation'}
          </button>
        </div>
        <input
          type="text"
          className="ai-card-name-input"
          value={cardName}
          onChange={e => setCardName(e.target.value)}
          placeholder={locale === 'zh' ? '卡牌名称' : 'Card name'}
        />
        {extracted && (
          <>
            <button
              type="button"
              className={`btn-primary ai-save-card-btn${saveSuccess ? ' ai-save-success' : ''}`}
              onClick={handleSaveCard}
              disabled={saving}
            >
              {saving
                ? (locale === 'zh' ? '保存中…' : 'Saving…')
                : saveSuccess
                  ? (locale === 'zh' ? '已保存' : 'Saved')
                  : (locale === 'zh' ? '保存到我的卡牌' : 'Save')
              }
            </button>
            {onAddToSandboxAndRestart && (
              <button
                type="button"
                className="btn-primary ai-save-card-btn ai-sandbox-btn"
                onClick={handleSaveAndAddToSandbox}
                disabled={saving}
              >
                {locale === 'zh' ? '加入沙盒并测试' : 'Add to Sandbox & Test'}
              </button>
            )}
          </>
        )}
      </div>

      {/* Minor improvement extra fields */}
      {cardType === 'minor' && (
        <div className="ai-minor-fields">
          <input
            type="text"
            className="ai-minor-input"
            value={prerequisite}
            onChange={e => setPrerequisite(e.target.value)}
            placeholder={locale === 'zh' ? '前置条件（可选，如：2 个职业、仍住木屋）' : 'Prerequisite (optional, e.g., 2 occupations)'}
          />
          <input
            type="text"
            className="ai-minor-input"
            value={costInput}
            onChange={e => setCostInput(e.target.value)}
            placeholder={locale === 'zh' ? '消耗资源（可选，如：1 木 2 黏土）' : 'Cost (optional, e.g., 1 wood 2 clay)'}
          />
        </div>
      )}

      {/* Two-panel layout */}
      <div className="ai-designer-panels">
        <ArtPanel
          cardType={cardType}
          cardName={cardName}
          artUrl={artUrl}
          setArtUrl={setArtUrl}
          config={config}
          setError={setError}
        />
        <AbilityPanel
          config={config}
          cardType={cardType}
          cardName={cardName}
          prerequisite={prerequisite}
          costHint={costInput}
          extracted={extracted}
          setExtracted={setExtracted}
          artUrl={artUrl}
          onImport={onImport}
          sandboxErrors={sandboxErrors}
          onSandboxErrorsConsumed={onSandboxErrorsConsumed}
          setError={setError}
        />
      </div>

      {error && <div className="form-error ai-error">{error}</div>}
    </div>
  )
}
