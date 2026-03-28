import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig, defaultModel,
  streamChat, extractCardJson, generateCardArt,
  type LlmConfig, type LlmProvider, type ChatMessage,
} from '../../services/llmService'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../services/llmPrompts'
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
}

type DisplayMessage = ChatMessage & { streaming?: boolean }

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
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="ai-source-link">
              查看源码验证
            </a>
          </p>
        </div>
      </div>

      <div className="ai-config-form">
        <div className="form-field">
          <label>AI 提供商</label>
          <div className="ai-provider-btns">
            {(['openai', 'anthropic', 'custom'] as LlmProvider[]).map(p => (
              <button
                key={p}
                type="button"
                className={`ai-provider-btn${provider === p ? ' active' : ''}`}
                onClick={() => handleProviderChange(p)}
              >
                {p === 'openai' ? 'OpenAI' : p === 'anthropic' ? 'Anthropic' : '自定义'}
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
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder={defaultModel(provider)}
          />
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
        </div>

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!apiKey.trim()}>
          保存并开始设计
        </button>
      </div>
    </div>
  )
}

// ── Card Preview ──────────────────────────────────────────────────────────────

function CardPreview({ extracted, artUrl, onGenArt, generatingArt }: {
  extracted: ExtractedCard
  artUrl: string | null
  onGenArt: () => void
  generatingArt: boolean
}) {
  const { card } = extracted
  const costEntries = Object.entries(card.cost ?? {}).filter(([, v]) => v > 0)

  return (
    <div className="ai-card-preview">
      <div className="ai-preview-art-area">
        {artUrl
          ? <img src={artUrl} alt={card.name} className="ai-preview-art" />
          : <div className="ai-preview-art-placeholder">
              <button type="button" className="btn-secondary ws-btn-sm" onClick={onGenArt} disabled={generatingArt}>
                {generatingArt ? '生成中…' : '生成卡牌美术'}
              </button>
            </div>
        }
        {artUrl && (
          <button type="button" className="btn-link ai-regen-art" onClick={onGenArt} disabled={generatingArt}>
            {generatingArt ? '生成中…' : '重新生成'}
          </button>
        )}
      </div>

      <div className="ai-preview-body">
        <div className="ai-preview-name">{card.name}</div>
        <div className="ai-preview-meta">
          <span className="ws-badge">{card.card_type === 'minor' ? '小改进' : '职业'}</span>
          {(card.vp ?? 0) > 0 && <span className="ws-badge ai-badge-vp">{card.vp} VP</span>}
        </div>
        {costEntries.length > 0 && (
          <div className="ai-preview-cost">
            费用：{costEntries.map(([r, n]) => `${r}×${n}`).join(' ')}
          </div>
        )}
        {card.prerequisite && (
          <div className="ai-preview-prereq">先决：{card.prerequisite}</div>
        )}
        <div className="ai-preview-desc">
          <ResourceText text={(card.desc ?? []).join(' ')} />
        </div>
        {extracted.effects && Object.keys(extracted.effects).length > 0 && (
          <div className="ai-preview-effects">
            <span className="ai-effect-label">效果：</span>
            {Object.keys(extracted.effects).join('、')}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main AiCardDesigner ───────────────────────────────────────────────────────

export function AiCardDesigner({ onImport, onClose }: {
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  onClose: () => void
}) {
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [extracted, setExtracted] = useState<ExtractedCard | null>(null)
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const [generatingArt, setGeneratingArt] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleClearConfig = () => {
    clearLlmConfig()
    setConfig(null)
  }

  const handleSend = useCallback(async () => {
    if (!input.trim() || !config || streaming) return
    setError('')

    const userMsg: DisplayMessage = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    // Add empty assistant message for streaming
    const assistantMsg: DisplayMessage = { role: 'assistant', content: '', streaming: true }
    setMessages(prev => [...prev, assistantMsg])

    try {
      let fullText = ''
      const chatHistory: ChatMessage[] = newMessages.map(m => ({ role: m.role, content: m.content }))

      for await (const chunk of streamChat(chatHistory, CARD_DESIGNER_SYSTEM_PROMPT, config)) {
        fullText += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: fullText, streaming: true }
          return updated
        })
      }

      // Mark streaming done
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: fullText }
        return updated
      })

      // Try to extract card JSON
      const parsed = extractCardJson(fullText)
      if (parsed?.card) {
        setExtracted(parsed as ExtractedCard)
        setArtUrl(null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setError(msg)
      setMessages(prev => prev.filter(m => !m.streaming))
    } finally {
      setStreaming(false)
    }
  }, [input, config, messages, streaming])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleGenArt = async () => {
    if (!config || !extracted || generatingArt) return
    setGeneratingArt(true)
    try {
      const desc = extracted.card.desc?.join(' ') ?? extracted.card.name
      const dataUrl = await generateCardArt(extracted.card.name, desc, config)
      if (!dataUrl) { setError('美术生成失败（仅 OpenAI DALL-E 支持）'); return }
      // Upload to server so the final URL is a persistent path, not a large base64 blob
      const uploaded = await uploadArt(dataUrl)
      setArtUrl(uploaded ?? dataUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : '美术生成出错')
    } finally {
      setGeneratingArt(false)
    }
  }

  // Show config panel if not configured
  if (!config) {
    return (
      <div className="ai-designer">
        <div className="ai-designer-header">
          <h2>AI 卡牌设计师</h2>
          <button type="button" className="btn-link" onClick={onClose}>关闭</button>
        </div>
        <ApiKeyPanel onConfigured={() => setConfig(getLlmConfig())} />
      </div>
    )
  }

  return (
    <div className="ai-designer">
      <div className="ai-designer-header">
        <h2>AI 卡牌设计师</h2>
        <div className="ai-header-actions">
          <span className="ai-provider-tag">{config.provider} / {config.model}</span>
          <button type="button" className="btn-link" onClick={handleClearConfig}>切换 API Key</button>
          <button type="button" className="btn-link" onClick={onClose}>关闭</button>
        </div>
      </div>

      <div className="ai-designer-body">
        {/* Chat area */}
        <div className="ai-chat-area">
          {messages.length === 0 && (
            <div className="ai-chat-hint">
              <p>描述你想设计的卡牌，AI 会帮你生成符合 Agricola 规范的卡牌定义。</p>
              <p>示例：</p>
              <ul>
                <li>"设计一个工人回家时可以花 1 粮食换 3 食物的小改进，费用 1 木头"</li>
                <li>"做一个建造房间时节省 1 黏土的职业卡"</li>
                <li>"参考麦酒长凳，但改成用蔬菜换食物的版本"</li>
              </ul>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`ai-message ai-message-${msg.role}`}>
              <div className="ai-message-role">{msg.role === 'user' ? '你' : 'AI'}</div>
              <div className={`ai-message-content${msg.streaming ? ' ai-streaming' : ''}`}>
                {msg.content || (msg.streaming ? '▋' : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Card preview sidebar */}
        {extracted && (
          <div className="ai-preview-sidebar">
            <div className="ai-preview-header">
              <span>卡牌预览</span>
              <button
                type="button"
                className="btn-primary ws-btn-sm"
                onClick={() => onImport(extracted, artUrl)}
              >
                导入编辑器 →
              </button>
            </div>
            <CardPreview
              extracted={extracted}
              artUrl={artUrl}
              onGenArt={handleGenArt}
              generatingArt={generatingArt}
            />
          </div>
        )}
      </div>

      {error && <div className="form-error ai-error">{error}</div>}

      <div className="ai-input-area">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的卡牌效果… (Enter 发送，Shift+Enter 换行)"
          rows={3}
          disabled={streaming}
        />
        <button
          type="button"
          className="btn-primary ai-send-btn"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '生成中…' : '发送'}
        </button>
      </div>
    </div>
  )
}
