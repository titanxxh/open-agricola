import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig, defaultModel,
  streamChat, extractCardFromResponse, generateCardArt, buildCardArtPrompt,
  supportsImageGeneration, KEY_LLM_CONFIG_ART,
  PROVIDER_LABELS, PROVIDER_KEY_HINTS, PROVIDER_MODELS,
  type LlmConfig, type LlmProvider, type ChatMessage, type ReferenceImage,
} from '../../services/llmService'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../services/llmPrompts'
import { LocalizationModal } from './LocalizationModal'
import { useLocale } from '../../contexts/LocaleContext'
import { ResourceText } from '../../components/common/ResourceText'
import { API_BASE } from '../../config'

const TOKEN_KEY = 'open-agricola-token'

/** Generate a card ID from a display name — English only */
function autoCardId(name: string): string {
  // Keep only ASCII letters, digits, underscores
  const slug = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)
  return slug ? `CUSTOM_${slug}` : ''
}

/** Check if a card ID is valid (CUSTOM_ prefix, ASCII only, min length) */
function isValidCardId(id: string): { valid: boolean; reason?: string } {
  if (!id.startsWith('CUSTOM_')) return { valid: false, reason: 'ID 必须以 CUSTOM_ 开头' }
  if (id.length < 8) return { valid: false, reason: 'ID 太短，至少 8 个字符' }
  if (/[^a-zA-Z0-9_]/.test(id)) return { valid: false, reason: 'ID 只能包含英文字母、数字和下划线' }
  return { valid: true }
}

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

type DisplayMessage = ChatMessage & { streaming?: boolean; isError?: boolean; promptSnapshot?: string }

type ApiCard = {
  id: string          // DB row id
  card_id: string     // CUSTOM_xxx
  card_type: string
  name: string
  description: string
  art_url: string | null
  effect_dsl: Record<string, unknown> | null
  effect_code: string | null
  card_json: Record<string, unknown>  // already parsed by server
  status: string
  updated_at: number
}

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
  // Split on complete code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)

  // Check if there's an unclosed code block at the end (during streaming)
  const lastPart = parts[parts.length - 1] ?? ''
  const openMatch = lastPart.match(/^([\s\S]*?)(```(\w*)\n[\s\S]*)$/)

  const renderedParts: { type: 'text' | 'code'; content: string; lang?: string }[] = []

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] ?? ''
    const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/)
    if (codeMatch) {
      renderedParts.push({ type: 'code', lang: codeMatch[1] ?? '', content: codeMatch[2] ?? '' })
    } else {
      renderedParts.push({ type: 'text', content: part })
    }
  }

  if (openMatch) {
    // Text before the unclosed block
    if (openMatch[1]) renderedParts.push({ type: 'text', content: openMatch[1] })
    // Unclosed code block — render as code anyway
    const openLang = openMatch[3] ?? ''
    const openCode = (openMatch[2] ?? '').replace(/^```\w*\n?/, '')
    renderedParts.push({ type: 'code', lang: openLang, content: openCode })
  } else {
    const codeMatch = lastPart.match(/^```(\w*)\n?([\s\S]*?)```$/)
    if (codeMatch) {
      renderedParts.push({ type: 'code', lang: codeMatch[1] ?? '', content: codeMatch[2] ?? '' })
    } else if (lastPart) {
      renderedParts.push({ type: 'text', content: lastPart })
    }
  }

  return (
    <>
      {renderedParts.map((part, i) =>
        part.type === 'code'
          ? <CodeBlock key={i} lang={part.lang ?? ''} code={part.content} />
          : <span key={i}>{part.content}</span>
      )}
    </>
  )
}

// ── Inline Config Bar ─────────────────────────────────────────────────────────

function ConfigBar({ config, onConfigured, onClear, storageKey }: {
  config: LlmConfig | null
  onConfigured: () => void
  onClear: () => void
  storageKey?: string
}) {
  const [expanded, setExpanded] = useState(!config)
  const [provider, setProvider] = useState<LlmProvider>(config?.provider ?? 'openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(config?.model ?? defaultModel('openai'))
  const [baseUrl, setBaseUrl] = useState(config?.baseUrl ?? '')
  const [showKey, setShowKey] = useState(false)

  const handleProviderChange = (p: LlmProvider) => {
    setProvider(p)
    setModel(defaultModel(p))
    setBaseUrl('')
  }

  const handleSave = () => {
    if (!apiKey.trim()) return
    saveLlmConfig({ provider, apiKey: apiKey.trim(), model, baseUrl: baseUrl.trim() || undefined }, storageKey)
    setExpanded(false)
    onConfigured()
  }

  const handleClear = () => {
    clearLlmConfig(storageKey)
    setApiKey('')
    setExpanded(true)
    onClear()
  }

  if (!expanded && config) {
    return (
      <div className="ai-config-bar">
        <span className="ai-provider-tag">{config.provider} / {config.model}</span>
        <button type="button" className="btn-link" onClick={() => setExpanded(true)}>切换</button>
        <button type="button" className="btn-link ai-config-bar-clear" onClick={handleClear}>清除</button>
      </div>
    )
  }

  return (
    <div className="ai-config-bar ai-config-bar-expanded">
      <div className="ai-config-bar-row">
        <strong>AI 提供商配置</strong>
        <span className="ai-config-bar-hint">API Key 仅保存在本地，不会上传到服务器</span>
        {config && (
          <button type="button" className="btn-link" onClick={() => setExpanded(false)}>折叠</button>
        )}
      </div>

      <div className="ai-config-bar-fields">
        <div className="ai-provider-btns">
          {(['gemini', 'openrouter'] as LlmProvider[]).map(p => (
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

        {provider === 'custom' && (
          <input
            type="url"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="API 端点 (兼容 OpenAI 格式)"
            className="ai-config-bar-input"
          />
        )}

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
            className="ai-config-bar-input"
          />
        )}

        <div className="ai-key-input-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={provider === 'openai' ? 'sk-...' : provider === 'anthropic' ? 'sk-ant-...' : 'API Key'}
            autoComplete="off"
            className="ai-config-bar-input"
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

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!apiKey.trim()}>
          保存配置
        </button>
      </div>
    </div>
  )
}

// ── BGA Reference Image Picker ────────────────────────────────────────────────

/** BGA card image URL given deck letter and card number */
function bgaImgUrl(deck: string, num: number) {
  return `/bga-img/deck${deck}/${deck}${String(num).padStart(3, '0')}.png`
}

// All BGA card images: decks A-E, minors 1-84, occupations 85-168
const DECKS = ['A', 'B', 'C', 'D', 'E'] as const
const MINOR_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => bgaImgUrl(d, i + 1)))
const OCC_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => bgaImgUrl(d, i + 85)))

async function fetchRefImage(url: string): Promise<ReferenceImage | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const data = dataUrl.split(',')[1] ?? ''
        resolve({ data, mimeType: blob.type || 'image/png' })
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function RefImagePicker({ cardType, selected, onToggle }: {
  cardType: 'minor' | 'occupation'
  selected: string[]
  onToggle: (url: string) => void
}) {
  const { locale } = useLocale()
  const allImages = cardType === 'minor' ? MINOR_REF_IMAGES : OCC_REF_IMAGES
  // Show 6 random images, stable per mount
  const [images] = useState(() => sampleN(allImages, 6))

  return (
    <div className="ai-ref-picker">
      <div className="ai-ref-picker-label">
        {locale === 'zh' ? `参考图片（最多选3张）` : 'Reference images (up to 3)'}
      </div>
      <div className="ai-ref-picker-grid">
        {images.map(url => {
          const isSelected = selected.includes(url)
          const maxed = selected.length >= 3 && !isSelected
          return (
            <button
              key={url}
              type="button"
              className={`ai-ref-thumb${isSelected ? ' selected' : ''}${maxed ? ' maxed' : ''}`}
              onClick={() => !maxed && onToggle(url)}
              title={isSelected ? (locale === 'zh' ? '取消选择' : 'Deselect') : (locale === 'zh' ? '选为参考' : 'Use as reference')}
            >
              <img src={url} alt="" />
              {isSelected && <span className="ai-ref-check">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Canvas Art Processing ──────────────────────────────────────────────────────

async function processCardArt(dataUrl: string, cardType: 'minor' | 'occupation'): Promise<string> {
  const SIZE = 512
  const BORDER = 8
  const GOLD = '#c9a227'
  const R = SIZE / 2 - BORDER / 2 - 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const cx = SIZE / 2
      const cy = SIZE / 2

      const buildPath = () => {
        ctx.beginPath()
        if (cardType === 'occupation') {
          ctx.arc(cx, cy, R, 0, Math.PI * 2)
        } else {
          // Flat-top hexagon (matching BGA card sprites)
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i
            const x = cx + R * Math.cos(angle)
            const y = cy + R * Math.sin(angle)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
        }
      }

      // Clip and draw image cover-fit
      ctx.save()
      buildPath()
      ctx.clip()
      const scale = Math.max(SIZE / img.width, SIZE / img.height)
      const iw = img.width * scale
      const ih = img.height * scale
      ctx.drawImage(img, (SIZE - iw) / 2, (SIZE - ih) / 2, iw, ih)
      ctx.restore()

      // Gold border on top
      buildPath()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = BORDER
      ctx.stroke()

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

// ── Art Panel ─────────────────────────────────────────────────────────────────

function ArtPanel({ cardType, cardName, artUrl, setArtUrl, refCache }: {
  cardType: 'minor' | 'occupation'
  cardName: string
  artUrl: string | null
  setArtUrl: (url: string | null) => void
  refCache?: Map<string, ReferenceImage>
}) {
  const { locale } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))
  const [artSubject, setArtSubject] = useState('')
  const [generating, setGenerating] = useState(false)
  const [artPrompt, setArtPrompt] = useState('')
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [artError, setArtError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setArtError('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
      const processed = await processCardArt(dataUrl, cardType)
      const uploaded = await uploadArt(processed)
      setArtUrl(uploaded ?? processed)
    } catch (err) {
      setArtError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleToggleRef = (url: string) => {
    setSelectedRefs(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    )
  }

  // Auto-generate prompt when subject or card type changes
  useEffect(() => {
    if (!artSubject.trim()) {
      setArtPrompt('')
      return
    }
    setArtPrompt(buildCardArtPrompt(artSubject.trim(), cardType, locale as 'zh' | 'en'))
  }, [artSubject, cardType, locale])

  const canGenerateArt = config ? supportsImageGeneration(config) : false

  const handleGenerate = async () => {
    if (!artPrompt.trim() || generating || !canGenerateArt || !config) return
    setGenerating(true)
    setArtError('')
    try {
      // Use pre-fetched cache when available, fall back to live fetch
      const refImages = selectedRefs.length > 0
        ? (await Promise.all(selectedRefs.map(url => refCache?.get(url) ? Promise.resolve(refCache.get(url)!) : fetchRefImage(url)))).filter((r): r is ReferenceImage => r !== null)
        : undefined
      const rawDataUrl = await generateCardArt(artPrompt, config, refImages)
      if (!rawDataUrl) {
        setArtError(locale === 'zh'
          ? '⚠️ 图片生成失败：API 未返回图片数据，请检查 API Key 权限和模型是否支持图片生成'
          : '⚠️ Image generation failed: API returned no image data. Check API key permissions and model support.')
        return
      }
      // Process through hexagonal/circular gold border clipping
      const dataUrl = await processCardArt(rawDataUrl, cardType)
      const uploaded = await uploadArt(dataUrl)
      if (!uploaded) {
        setArtError(locale === 'zh'
          ? '⚠️ 图片上传到服务器失败，图片仅在本地显示'
          : '⚠️ Failed to upload art to server, showing local preview only')
      }
      setArtUrl(uploaded ?? dataUrl)
    } catch (err) {
      setArtError(err instanceof Error ? err.message : 'Art generation error')
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
        <h3>{locale === 'zh' ? '🖼 卡牌图片' : '🖼 Card Art'}</h3>
        <span className="ai-art-border-tag">{borderLabel}</span>
      </div>

      <ConfigBar
        storageKey={KEY_LLM_CONFIG_ART}
        config={config}
        onConfigured={() => setConfig(getLlmConfig(KEY_LLM_CONFIG_ART))}
        onClear={() => setConfig(null)}
      />

      {artUrl && (
        <div className="ai-art-preview-area">
          <img src={artUrl} alt={cardName || 'card art'} className="ai-art-preview-img" />
        </div>
      )}

      {config && (
        <>
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

          {canGenerateArt && (
            <RefImagePicker
              cardType={cardType}
              selected={selectedRefs}
              onToggle={handleToggleRef}
            />
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
                : selectedRefs.length > 0
                  ? (locale === 'zh' ? `生成图片（${selectedRefs.length}张参考）` : `Generate (${selectedRefs.length} refs)`)
                  : (locale === 'zh' ? '生成卡牌图片' : 'Generate Card Art')
              }
            </button>
          ) : (
            <div className="ai-art-no-gen">
              {locale === 'zh'
                ? '图片生成需要 Gemini（gemini-3.1-flash-image-preview）或 OpenAI（DALL-E 3）'
                : 'Image gen requires Gemini (gemini-3.1-flash-image-preview) or OpenAI (DALL-E 3)'
              }
            </div>
          )}

          {artError && <div className="form-error" style={{ marginTop: 8 }}>{artError}</div>}
        </>
      )}

      <div className="ai-art-upload-section">
        <div className="ai-art-upload-divider">
          <span>{locale === 'zh' ? '或者上传自己的图片' : 'Or upload your own image'}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn-secondary ai-art-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? (locale === 'zh' ? '处理中…' : 'Processing…')
            : (locale === 'zh' ? '上传图片' : 'Upload Image')
          }
        </button>
        <div className="ai-art-upload-hint">
          {cardType === 'occupation'
            ? (locale === 'zh' ? '上传后自动裁剪为圆形 + 金边' : 'Auto-cropped to circle + gold border')
            : (locale === 'zh' ? '上传后自动裁剪为六角形 + 金边' : 'Auto-cropped to hexagon + gold border')
          }
        </div>
      </div>
    </div>
  )
}

// ── Ability Chat Panel ────────────────────────────────────────────────────────

function AbilityPanel({
  cardType, cardName, prerequisite, costHint, extracted, setExtracted, artUrl, onImport,
  sandboxErrors, onSandboxErrorsConsumed, validationErrors, onValidationErrorsConsumed,
}: {
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
  validationErrors?: string | null
  onValidationErrorsConsumed?: () => void
}) {
  const { locale } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [chatError, setChatError] = useState('')
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessages = useCallback(async (chatHistory: ChatMessage[], promptSnapshot?: string) => {
    if (!config) return
    setStreaming(true)
    setChatError('')

    const assistantMsg: DisplayMessage = { role: 'assistant', content: '', streaming: true, promptSnapshot }
    setMessages(prev => [...prev, assistantMsg])

    try {
      let fullText = ''
      for await (const chunk of streamChat(chatHistory, CARD_DESIGNER_SYSTEM_PROMPT, config)) {
        fullText += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: fullText, streaming: true, promptSnapshot }
          return updated
        })
      }

      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: fullText, promptSnapshot }
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
      setChatError(msg)
      setMessages(prev => prev.filter(m => !m.streaming))
    } finally {
      setStreaming(false)
    }
  }, [config, setChatError, setExtracted])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !config || streaming) return

    // Prepend card context to user message
    const typeLabel = cardType === 'occupation' ? '职业卡 (Occupation)' : '小发展卡 (Minor Improvement)'
    const parts = [`卡牌类型: ${typeLabel}`]
    if (cardName.trim()) parts.push(`卡牌名称: ${cardName.trim()}`)
    if (prerequisite?.trim()) parts.push(`前置条件: ${prerequisite.trim()}`)
    if (costHint?.trim()) parts.push(`消耗资源: ${costHint.trim()}`)
    // Include existing source code as context when starting a fresh conversation
    // (e.g., user navigated away, came back, and loaded a saved card)
    if (messages.length === 0 && extracted?.sourceCode) {
      parts.push(`\n当前已有代码:\n\`\`\`typescript\n${extracted.sourceCode}\n\`\`\``)
    }
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
    // Build prompt snapshot for inspection
    const promptSnapshot = [
      `[SYSTEM]\n${CARD_DESIGNER_SYSTEM_PROMPT}`,
      ...chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`),
    ].join('\n\n---\n\n')
    await sendMessages(chatHistory, promptSnapshot)
  }, [input, config, messages, streaming, sendMessages, cardType, cardName, extracted])

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

  const handleInjectValidationError = useCallback(() => {
    if (!validationErrors || streaming || !config) return
    const errorText = [
      '⚠️ 代码验证失败',
      '',
      '保存卡牌时服务端返回了以下验证错误：',
      '',
      validationErrors,
      '',
      '请修复这些错误，重新给出完整的卡牌代码。注意不要使用 import 语句，所有依赖通过参数注入。',
    ].join('\n')

    const errorMsg: DisplayMessage = { role: 'user', content: errorText, isError: true }
    const newMessages = [...messages, errorMsg]
    setMessages(newMessages)
    onValidationErrorsConsumed?.()

    const chatHistory: ChatMessage[] = newMessages.map(m => ({ role: m.isError ? 'user' as const : m.role, content: m.content }))
    void sendMessages(chatHistory)
  }, [validationErrors, streaming, config, messages, sendMessages, onValidationErrorsConsumed])

  const handleResend = useCallback((msgIndex: number) => {
    if (streaming || !config) return
    // Truncate to messages up to and including this user message
    const truncated = messages.slice(0, msgIndex + 1)
    setMessages(truncated)
    const chatHistory: ChatMessage[] = truncated.map(m => ({
      role: m.isError ? 'user' as const : m.role,
      content: m.content,
    }))
    const promptSnapshot = [
      `[SYSTEM]\n${CARD_DESIGNER_SYSTEM_PROMPT}`,
      ...chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`),
    ].join('\n\n---\n\n')
    void sendMessages(chatHistory, promptSnapshot)
  }, [streaming, config, messages, sendMessages])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="ai-ability-panel">
      <div className="ai-ability-panel-header">
        <h3>{locale === 'zh' ? '💬 卡牌能力' : '💬 Card Ability'}</h3>
        {extracted && (
          <button
            type="button"
            className="btn-primary ws-btn-sm"
            onClick={() => onImport(extracted, artUrl)}
          >
            {locale === 'zh' ? '导入手动编辑器（可微调字段）→' : 'Import to manual editor →'}
          </button>
        )}
      </div>

      <ConfigBar
        config={config}
        onConfigured={() => setConfig(getLlmConfig())}
        onClear={() => setConfig(null)}
      />

      {chatError && <div className="form-error" style={{ marginTop: 4, marginBottom: 4 }}>{chatError}</div>}

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
              {msg.role === 'user' && !streaming && (
                <button
                  type="button"
                  className="btn-link ai-resend-btn"
                  onClick={() => handleResend(i)}
                  title={locale === 'zh' ? '从这条消息重新发送' : 'Resend from this message'}
                >
                  ↻
                </button>
              )}
            </div>
            {msg.role === 'assistant' && msg.promptSnapshot && (
              <details className="ai-prompt-details">
                <summary className="ai-prompt-summary">
                  {locale === 'zh' ? '查看完整 Prompt' : 'View full prompt'}
                </summary>
                <pre className="ai-prompt-text">{msg.promptSnapshot}</pre>
              </details>
            )}
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

      {validationErrors && (
        <div className="ai-validation-error-bar">
          <div className="ai-validation-error-text">
            ⚠️ {locale === 'zh' ? '代码验证失败' : 'Code validation failed'}：{validationErrors}
          </div>
          <button
            type="button"
            className="btn-primary ws-btn-sm"
            onClick={handleInjectValidationError}
            disabled={streaming || !config}
          >
            {locale === 'zh' ? '发送给 AI 修复' : 'Send to AI to fix'}
          </button>
        </div>
      )}

      {config && (
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
      )}
    </div>
  )
}

function sampleN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

// ── Main AiCardDesigner ───────────────────────────────────────────────────────

export function AiCardDesigner({ onImport, onClose, onAddToSandboxAndRestart, sandboxErrors, onSandboxErrorsConsumed }: {
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  onClose: () => void
  onAddToSandboxAndRestart?: (cardDbId: string) => Promise<void>
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
}) {
  const { locale } = useLocale()
  const [cardType, setCardType] = useState<'minor' | 'occupation'>('minor')
  const [cardName, setCardName] = useState('')
  const [cardIdInput, setCardIdInput] = useState('')
  const [prerequisite, setPrerequisite] = useState('')
  const [costInput, setCostInput] = useState('')
  const [extracted, setExtracted] = useState<ExtractedCard | null>(null)
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [refCache, setRefCache] = useState<Map<string, ReferenceImage>>(new Map())
  const [myCards, setMyCards] = useState<ApiCard[]>([])
  const [autoSaving, setAutoSaving] = useState(false)
  const [autoSaveFlash, setAutoSaveFlash] = useState(false)
  const [currentCardDbId, setCurrentCardDbId] = useState<string | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showLocalizationModal, setShowLocalizationModal] = useState(false)
  const [cardLocales, setCardLocales] = useState<Record<string, { name: string; desc: string[]; prerequisite?: string }>>({})

  // Pre-fetch 3 random minor + 3 random occupation reference images on mount
  useEffect(() => {
    let cancelled = false
    const prefetchUrls = [
      ...sampleN(MINOR_REF_IMAGES, 3),
      ...sampleN(OCC_REF_IMAGES, 3),
    ]
    void (async () => {
      const entries = await Promise.all(
        prefetchUrls.map(async url => ({ url, img: await fetchRefImage(url) }))
      )
      if (cancelled) return
      setRefCache(prev => {
        const next = new Map(prev)
        for (const { url, img } of entries) {
          if (img) next.set(url, img)
        }
        return next
      })
    })()
    return () => { cancelled = true }
  }, [])

  const refreshMyCards = useCallback(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return
    fetch(`${API_BASE}/api/workshop/cards?scope=mine`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => { if (d.ok) setMyCards(d.cards as ApiCard[]) })
      .catch(err => { console.warn('[AiCardDesigner] Failed to load saved designs:', err) })
  }, [])

  // Load user's own cards on mount
  useEffect(() => { refreshMyCards() }, [refreshMyCards])

  // Auto-save when extracted card or art changes
  useEffect(() => {
    const card = extracted?.card
    if (!card?.id?.startsWith('CUSTOM_') || card.id.length < 8 || !card.name?.trim()) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaving(true)
      void saveCardToWorkshop(true).then(dbId => {
        setAutoSaving(false)
        if (!dbId) return
        setCurrentCardDbId(dbId)
        setAutoSaveFlash(true)
        setTimeout(() => setAutoSaveFlash(false), 2000)
        refreshMyCards()
      })
    }, 1000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  // saveCardToWorkshop reads from closure; refreshMyCards is stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extracted, artUrl])

  // Sync card type/name/id from extracted card
  useEffect(() => {
    if (extracted?.card) {
      if (extracted.card.card_type) setCardType(extracted.card.card_type)
      if (extracted.card.name) setCardName(extracted.card.name)
      // If the AI generated a valid English CUSTOM_ ID, use it
      if (extracted.card.id?.startsWith('CUSTOM_') && isValidCardId(extracted.card.id).valid) {
        setCardIdInput(extracted.card.id)
      }
    }
  }, [extracted])

  /** Save card and return the DB ID, or null on failure.
   *  Pass `silent=true` for auto-save (no UI state changes). */
  const saveCardToWorkshop = async (silent?: boolean): Promise<string | null> => {
    const name = extracted?.card?.name?.trim() || cardName.trim()
    if (!name) { if (!silent) setError(locale === 'zh' ? '请先设置卡牌名称' : 'Card name is required'); return null }

    // Use manually-set card ID, or extracted card ID, or generate from name
    const cardId = cardIdInput.trim().startsWith('CUSTOM_') && cardIdInput.trim().length >= 8
      ? cardIdInput.trim()
      : extracted?.card?.id?.startsWith('CUSTOM_') && extracted.card.id.length >= 8
        ? extracted.card.id
        : autoCardId(name) || `CUSTOM_Card_${Date.now().toString(36)}`

    // Validate card ID format (must be ASCII only)
    const idCheck = isValidCardId(cardId)
    if (!idCheck.valid) {
      if (!silent) setError(locale === 'zh'
        ? `卡牌 ID 格式错误：${idCheck.reason}。请修改 ID 字段（仅限英文字母、数字、下划线）`
        : `Invalid card ID: ${idCheck.reason}`)
      return null
    }

    if (!silent) { setSaving(true); setError(''); setSaveSuccess(false) }
    try {
      const token = localStorage.getItem(TOKEN_KEY)
      const card = extracted?.card
      const cardJson = {
        id: cardId,
        name,
        card_type: card?.card_type ?? cardType,
        deck: 'CUSTOM',
        number: 0,
        desc: card?.desc ?? [],
        cost: card?.cost ?? {},
        vp: card?.vp ?? 0,
        prerequisite: card?.prerequisite ?? (prerequisite || undefined),
        modifiers: card?.modifiers ?? [],
        implemented: true,
        // Save raw form inputs for restoration
        _draft: {
          prerequisite: prerequisite || undefined,
          costInput: costInput || undefined,
        },
        ...(Object.keys(cardLocales).length > 0 ? { locales: cardLocales } : {}),
      }

      const body: Record<string, unknown> = {
        ...(currentCardDbId ? { id: currentCardDbId } : {}),
        card_id: cardId,
        card_type: card?.card_type ?? cardType,
        name,
        description: (card?.desc ?? []).join(' '),
        card_json: cardJson,
        art_url: artUrl,
        status: 'draft',
      }

      // If we have source code from TS extraction, save as effect_code
      if (extracted?.sourceCode) {
        body.effect_code = extracted.sourceCode
      } else if (extracted?.effects && Object.keys(extracted.effects).length > 0 && !('_hasCode' in extracted.effects)) {
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
        if (!silent) { setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000) }
        return d.id as string
      } else {
        if (!silent) {
          let errMsg = d.error ?? (locale === 'zh' ? '保存失败' : 'Save failed')
          // Show detailed validation errors
          if (Array.isArray(d.errors) && d.errors.length > 0) {
            const detailStr = (d.errors as string[]).join('\n')
            errMsg += ':\n' + detailStr
            setValidationErrors(detailStr)
          }
          setError(errMsg)
        }
      }
    } catch {
      if (!silent) setError(locale === 'zh' ? '网络错误' : 'Network error')
    } finally {
      if (!silent) setSaving(false)
    }
    return null
  }

  const handleSaveCard = async () => {
    const dbId = await saveCardToWorkshop()
    if (dbId) { setCurrentCardDbId(dbId); refreshMyCards() }
  }

  const handleSaveAndAddToSandbox = async () => {
    if (!onAddToSandboxAndRestart) return
    const dbId = await saveCardToWorkshop()
    if (dbId) {
      setCurrentCardDbId(dbId)
      refreshMyCards()
      // Don't call onSaved here — it navigates away from the editor
      await onAddToSandboxAndRestart(dbId)
    }
  }

  const handleLoadCard = (apiCard: ApiCard) => {
    const cj = apiCard.card_json
    const ct = ((cj.card_type ?? apiCard.card_type) as string) as 'minor' | 'occupation'
    const cardData: ExtractedCard['card'] = {
      id: (cj.id ?? apiCard.card_id) as string,
      name: apiCard.name,
      card_type: ct,
      cost: (cj.cost ?? {}) as Record<string, number>,
      vp: (cj.vp ?? 0) as number,
      desc: (cj.desc ?? []) as string[],
      prerequisite: cj.prerequisite as string | undefined,
      modifiers: (cj.modifiers ?? []) as unknown[],
    }
    setCardType(ct)
    setCardName(apiCard.name)
    setCardIdInput(apiCard.card_id)
    setArtUrl(apiCard.art_url ?? null)
    setCurrentCardDbId(apiCard.id)
    // Restore raw form inputs from _draft, or fall back to parsed card_json
    const draft = (cj._draft ?? {}) as { prerequisite?: string; costInput?: string }
    setPrerequisite(draft.prerequisite ?? (cj.prerequisite as string) ?? '')
    if (draft.costInput) {
      setCostInput(draft.costInput)
    } else {
      const costParts = Object.entries((cj.cost ?? {}) as Record<string, number>)
        .map(([k, v]) => `${v} ${k}`)
      setCostInput(costParts.join(' '))
    }
    setExtracted({
      card: cardData,
      effects: apiCard.effect_dsl ?? undefined,
      sourceCode: apiCard.effect_code ?? undefined,
    })
    // Restore locales from card_json
    const savedLocales = (cj.locales ?? {}) as Record<string, { name: string; desc: string[]; prerequisite?: string }>
    setCardLocales(savedLocales)
  }

  return (
    <div className="ai-designer">
      <div className="ai-designer-header">
        <h2>{locale === 'zh' ? 'AI 卡牌设计师' : 'AI Card Designer'}</h2>
        <button type="button" className="btn-link" onClick={onClose}>{locale === 'zh' ? '关闭' : 'Close'}</button>
      </div>

      {/* Load previous designs */}
      {myCards.length > 0 && (
        <div className="ai-my-cards-bar">
          <span className="ai-my-cards-label">{locale === 'zh' ? '加载设计：' : 'Load design:'}</span>
          <select
            className="ai-my-cards-select"
            value={currentCardDbId ?? ''}
            onChange={e => {
              const card = myCards.find(c => c.id === e.target.value)
              if (card) handleLoadCard(card)
            }}
          >
            <option value="">{locale === 'zh' ? '-- 选择已有卡牌 --' : '-- Select a card --'}</option>
            {myCards.map(c => {
              const hasArt = !!c.art_url
              const hasCode = !!(c.effect_code ?? c.effect_dsl)
              const missing = [
                !hasArt && (locale === 'zh' ? '缺图片' : 'no art'),
                !hasCode && (locale === 'zh' ? '缺代码' : 'no code'),
              ].filter(Boolean).join(' · ')
              return (
                <option key={c.id} value={c.id}>
                  {c.name} [{c.card_type === 'minor' ? (locale === 'zh' ? '小发展' : 'Minor') : (locale === 'zh' ? '职业' : 'Occ')}]
                  {missing ? `  ⚠ ${missing}` : '  ✓'}
                </option>
              )
            })}
          </select>
        </div>
      )}

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
              onChange={e => {
                setCardName(e.target.value)
                // Auto-generate card ID from name if user hasn't manually edited it
                const prevAuto = autoCardId(cardName)
                if (!cardIdInput || cardIdInput === prevAuto) {
                  const newAuto = autoCardId(e.target.value)
                  // Only auto-set if the name has ASCII chars; otherwise leave empty for AI to fill
                  if (newAuto.length > 7) setCardIdInput(newAuto)
                }
              }}
              placeholder={locale === 'zh' ? '卡牌名称' : 'Card name'}
            />
            <input
              type="text"
              className="ai-card-id-input"
              value={cardIdInput}
              onChange={e => setCardIdInput(e.target.value)}
              placeholder={locale === 'zh' ? 'CUSTOM_英文ID（AI生成后自动填入）' : 'CUSTOM_EnglishId (auto-filled by AI)'}
              title={locale === 'zh' ? '卡牌唯一标识，仅限英文字母、数字、下划线' : 'Unique card ID, English letters/digits/underscore only'}
            />
            <button
              type="button"
              className={`btn-primary ai-save-card-btn${saveSuccess ? ' ai-save-success' : ''}`}
              onClick={handleSaveCard}
              disabled={saving || !cardName.trim()}
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
                disabled={saving || !extracted?.sourceCode}
                title={!extracted?.sourceCode ? (locale === 'zh' ? '需要先生成卡牌代码' : 'Generate card code first') : ''}
              >
                {locale === 'zh' ? '加入沙盒并测试' : 'Add to Sandbox & Test'}
              </button>
            )}
            <button
              type="button"
              className="btn-primary ai-save-card-btn"
              onClick={() => setShowLocalizationModal(true)}
              disabled={!cardName.trim()}
            >
              {locale === 'zh' ? '本地化' : 'Localize'}
            </button>
          </div>

          {/* Completeness + auto-save status */}
          <div className="ai-completeness-bar">
            <span className={artUrl ? 'ai-complete-tag' : 'ai-missing-tag'}>
              {artUrl ? '✓' : '✗'} {locale === 'zh' ? '图片' : 'Art'}
            </span>
            <span className={extracted?.effects || extracted?.sourceCode ? 'ai-complete-tag' : 'ai-missing-tag'}>
              {extracted?.effects || extracted?.sourceCode ? '✓' : '✗'} {locale === 'zh' ? '代码' : 'Code'}
            </span>
            {autoSaving && (
              <span className="ai-autosave-status">{locale === 'zh' ? '自动保存…' : 'Saving…'}</span>
            )}
            {autoSaveFlash && !autoSaving && (
              <span className="ai-autosave-ok">✓ {locale === 'zh' ? '已自动保存' : 'Auto-saved'}</span>
            )}
          </div>

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

          <div className="ai-designer-panels">
            <ArtPanel
              cardType={cardType}
              cardName={cardName}
              artUrl={artUrl}
              setArtUrl={setArtUrl}
              refCache={refCache}
            />
            <AbilityPanel
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
              validationErrors={validationErrors}
              onValidationErrorsConsumed={() => setValidationErrors(null)}
            />
          </div>

      {showLocalizationModal && (
        <LocalizationModal
          currentContent={{
            name: extracted?.card?.name ?? cardName,
            desc: extracted?.card?.desc ?? [],
            prerequisite: extracted?.card?.prerequisite ?? (prerequisite || undefined),
          }}
          currentLang={locale}
          locales={cardLocales}
          onSave={(updatedLocales) => {
            setCardLocales(updatedLocales)
            setShowLocalizationModal(false)
          }}
          onClose={() => setShowLocalizationModal(false)}
        />
      )}
      {error && <div className="form-error ai-error" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}
    </div>
  )
}
