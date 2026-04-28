/**
 * Workshop AI Card Designer.
 *
 * The system prompt fed to the LLM lives in `client/services/llmPrompts.ts`.
 * Sandbox constraints visible to users (sandbox-error tooltips, "what can I
 * write" hints, etc.) MUST stay consistent with the single source of truth:
 *   docs/CUSTOM_CARD_SANDBOX.md
 *
 * CI runs `pnpm run check:prompt-sync` to keep llmPrompts.ts and the SANDBOX
 * doc aligned with the underlying source code (cardEffectHooks /
 * isActionHookPhase / DENIED_IDENTIFIERS / DENIED_PROPERTY_ACCESS).
 *
 * If you add UI copy here that lists hooks / phases / denied identifiers,
 * link to the SANDBOX doc rather than embedding a parallel list.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig,
  getProvider, listModelsFor, defaultModelFor,
  streamChat, extractCardFromResponse, generateCardArt, buildCardArtPrompt,
  supportsImageGeneration, KEY_LLM_CONFIG_ART,
  PROVIDER_LABELS, PROVIDER_KEY_HINTS,
  type LlmConfig, type LlmProvider, type ChatMessage, type ReferenceImage,
} from '../../services/llmService'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../services/llmPrompts'
import { LocalizationModal } from './LocalizationModal'
import { useLocale } from '../../contexts/LocaleContext'
import { ResourceText } from '../../components/common/ResourceText'
import { Section } from '../../components/common/Section'
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

/**
 * Build the "current language" content fed to LocalizationModal. The modal
 * shows this read-only as the source for the translate button. Picking the
 * right source matters: if the user has already filled in a translation for
 * the active UI language we want to honour it, otherwise fall back to the
 * editor inputs the user is actually looking at.
 */
export function pickLocalizationCurrentContent(args: {
  locale: string
  cardLocales: Record<string, { name: string; desc: string[]; prerequisite?: string }>
  cardName: string
  prerequisite: string
  extractedName: string | undefined
  extractedDesc: string[] | undefined
  extractedPrerequisite: string | undefined
}): { name: string; desc: string[]; prerequisite?: string } {
  const localeEntry = args.cardLocales[args.locale]
  const editorPrereq = args.prerequisite || args.extractedPrerequisite
  if (localeEntry?.name && (localeEntry.desc?.length ?? 0) > 0) {
    return {
      name: localeEntry.name,
      desc: localeEntry.desc,
      prerequisite: localeEntry.prerequisite ?? editorPrereq,
    }
  }
  return {
    name: args.cardName || args.extractedName || '',
    desc: args.extractedDesc ?? [],
    prerequisite: editorPrereq,
  }
}

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
    locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
  }
  sourceCode?: string
}

type DisplayMessage = ChatMessage & { streaming?: boolean; isError?: boolean; promptSnapshot?: string }

export type ApiCard = {
  id: string          // DB row id
  card_id: string     // CUSTOM_xxx
  card_type: string
  name: string
  description: string
  art_url: string | null
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

function ConfigBar({ config, onConfigured, onClear, storageKey, capability }: {
  config: LlmConfig | null
  onConfigured: () => void
  onClear: () => void
  storageKey?: string
  capability: 'chat' | 'image'
}) {
  const [expanded, setExpanded] = useState(!config)
  const [provider, setProvider] = useState<LlmProvider>(config?.provider ?? 'gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(() => {
    if (!config) return defaultModelFor(getProvider('gemini'), capability) ?? ''
    // Validate the saved model against this panel's capability. If it doesn't
    // qualify (e.g. user saved a chat-only model in the image panel), fall back
    // to the provider's preferred model for this capability.
    const def = getProvider(config.provider)
    const valid = listModelsFor(def, capability)
    if (valid.some(m => m.id === config.model)) return config.model
    return defaultModelFor(def, capability) ?? ''
  })
  const [showKey, setShowKey] = useState(false)

  const handleProviderChange = (p: LlmProvider) => {
    setProvider(p)
    const next = defaultModelFor(getProvider(p), capability)
    setModel(next ?? '')
  }

  const handleSave = () => {
    if (!apiKey.trim()) return
    saveLlmConfig({ provider, apiKey: apiKey.trim(), model }, storageKey)
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
    // Detect stale-but-saved model that no longer matches the panel's capability
    // (e.g. a previously saved gemini-2.5-flash for the image panel after Task 3
    // trimmed the model list). Surface a subtle warning so the user knows to fix it.
    let stale = false
    try {
      const def = getProvider(config.provider)
      if (def.models.length > 0) {
        const validIds = listModelsFor(def, capability).map(m => m.id)
        if (!validIds.includes(config.model)) stale = true
      }
    } catch { /* unknown provider — leave hint off */ }

    return (
      <div className="ai-config-bar">
        <span className="ai-provider-tag">{config.provider} / {config.model}</span>
        {stale && (
          <span className="ai-config-bar-stale" title={`'${config.model}' 不再可用，请点击「切换」更新`}>已失效</span>
        )}
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
          {(['gemini', 'openrouter', 'deepseek', 'aihubmix'] as LlmProvider[]).map(p => (
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

        {(() => {
          const providerDef = getProvider(provider)
          const availableModels = listModelsFor(providerDef, capability)
          if (availableModels.length === 0) {
            // Provider has models but none support this capability.
            return (
              <span className="ai-model-mismatch">
                {capability === 'image'
                  ? '该 provider 不支持图像生成，请切换 provider'
                  : '该 provider 不支持代码/聊天生成，请切换 provider'}
              </span>
            )
          }
          return (
            <select value={model} onChange={e => setModel(e.target.value)} className="ai-model-select">
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )
        })()}

        <div className="ai-key-input-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="API Key"
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

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!apiKey.trim() || !model.trim()}>
          保存配置
        </button>
      </div>
    </div>
  )
}

function ConfigStatusSummary({
  artConfig,
  abilityConfig,
  locale,
  t,
}: {
  artConfig: LlmConfig | null
  abilityConfig: LlmConfig | null
  locale: 'zh' | 'en'
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const statusText = (heading: string, config: LlmConfig | null) => {
    if (!config) {
      return locale === 'zh'
        ? `${heading}：${t('platform.aiConfigStatusMissing')}`
        : `${heading}: ${t('platform.aiConfigStatusMissing')}`
    }
    const provider = PROVIDER_LABELS[config.provider] ?? config.provider
    return locale === 'zh'
      ? `${heading}：${provider} · ${config.model}`
      : `${heading}: ${provider} · ${config.model}`
  }

  return (
    <div className="ai-config-status-summary" aria-label={t('platform.aiConfigStatusLabel')}>
      <span className={`ai-config-status-chip${artConfig ? '' : ' is-missing'}`}>
        {statusText(t('platform.aiConfigImageHeading'), artConfig)}
      </span>
      <span className={`ai-config-status-chip${abilityConfig ? '' : ' is-missing'}`}>
        {statusText(t('platform.aiConfigAbilityHeading'), abilityConfig)}
      </span>
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

function ArtPanel({ cardType, cardName, artUrl, setArtUrl, refCache, configVersion }: {
  cardType: 'minor' | 'occupation'
  cardName: string
  artUrl: string | null
  setArtUrl: (url: string | null) => void
  refCache?: Map<string, ReferenceImage>
  configVersion?: number
}) {
  const { locale, t } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))

  // Re-read config when the parent's lifted ConfigBar updates it.
  useEffect(() => {
    setConfig(getLlmConfig(KEY_LLM_CONFIG_ART))
  }, [configVersion])
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

      {!config && (
        <div className="ai-panel-needs-config">
          {locale === 'zh'
            ? `请先在顶部「${t('platform.aiConfig')}」中配置图片生成模型。`
            : `Configure an image-generation model in the top "${t('platform.aiConfig')}" section first.`}
        </div>
      )}

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
                ? '图片生成需要 Gemini、OpenAI 或 OpenRouter 图片模型'
                : 'Image gen requires Gemini, OpenAI, or OpenRouter image models'
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
  configVersion,
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
  configVersion?: number
}) {
  const { locale, t } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig())

  // Re-read config when the parent's lifted ConfigBar updates it.
  useEffect(() => {
    setConfig(getLlmConfig())
  }, [configVersion])
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

      {!config && (
        <div className="ai-panel-needs-config">
          {locale === 'zh'
            ? `请先在顶部「${t('platform.aiConfig')}」中配置能力生成模型。`
            : `Configure an ability-generation model in the top "${t('platform.aiConfig')}" section first.`}
        </div>
      )}

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

export function AiCardDesigner({ initialCard, onImport, onClose, onAddToSandboxAndRestart, sandboxErrors, onSandboxErrorsConsumed }: {
  initialCard?: ApiCard
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  onClose: () => void
  onAddToSandboxAndRestart?: (cardDbId: string) => Promise<void>
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
}) {
  const { locale, t } = useLocale()
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

  // Lifted ConfigBar state: AbilityPanel uses default storage key, ArtPanel uses
  // KEY_LLM_CONFIG_ART. We hold both at the top so the configs are configured
  // once in a single collapsible section. Bump configVersion to make the panels
  // re-read from localStorage after the user saves/clears.
  const [abilityConfig, setAbilityConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [artConfig, setArtConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))
  const [configVersion, setConfigVersion] = useState(0)
  const bumpConfig = () => setConfigVersion((v) => v + 1)

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
      // Pull any locales the LLM emitted in the code block into the editor's
      // cardLocales state so the LocalizationModal can show them. Existing
      // user-edited entries win — we only fill keys the user hasn't touched.
      const extractedLocales = extracted.card.locales
      if (extractedLocales && Object.keys(extractedLocales).length > 0) {
        setCardLocales((prev) => {
          const merged = { ...prev }
          for (const [lang, entry] of Object.entries(extractedLocales)) {
            if (!merged[lang]) merged[lang] = entry
          }
          return merged
        })
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

      // LLM must emit TS source; if missing we simply don't populate effect_code.
      if (extracted?.sourceCode) {
        body.effect_code = extracted.sourceCode
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

  const handleLoadCard = useCallback((apiCard: ApiCard) => {
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
      sourceCode: apiCard.effect_code ?? undefined,
    })
    // Restore locales from card_json
    const savedLocales = (cj.locales ?? {}) as Record<string, { name: string; desc: string[]; prerequisite?: string }>
    setCardLocales(savedLocales)
  }, [])

  useEffect(() => {
    if (initialCard) handleLoadCard(initialCard)
  }, [handleLoadCard, initialCard])

  return (
    <div className="ai-designer">
      <div className="ai-designer-header">
        <h2>{locale === 'zh' ? 'AI 卡牌设计师' : 'AI Card Designer'}</h2>
      </div>

      {/* Lifted AI provider config — collapsible, defaults collapsed once both are configured */}
      <div className="ai-designer-config-section">
        <Section
          collapsible
          defaultCollapsed={!!(abilityConfig && artConfig)}
          icon="🤖"
          title={t('platform.aiConfig')}
          actions={
            <ConfigStatusSummary
              artConfig={artConfig}
              abilityConfig={abilityConfig}
              locale={locale}
              t={t}
            />
          }
          variant="parchment"
        >
          {!abilityConfig && !artConfig && (
            <div className="ai-config-missing-alert">
              <strong>{t('platform.aiConfigMissingTitle')}</strong>
              <span>{t('platform.aiConfigMissingBody')}</span>
            </div>
          )}
          <div className="ai-config-grid">
            <div className="ai-config-grid-col">
              <h4 className="ai-config-grid-heading">{t('platform.aiConfigImageHeading')}</h4>
              <ConfigBar
                storageKey={KEY_LLM_CONFIG_ART}
                capability="image"
                config={artConfig}
                onConfigured={() => { setArtConfig(getLlmConfig(KEY_LLM_CONFIG_ART)); bumpConfig() }}
                onClear={() => { setArtConfig(null); bumpConfig() }}
              />
            </div>
            <div className="ai-config-grid-col">
              <h4 className="ai-config-grid-heading">{t('platform.aiConfigAbilityHeading')}</h4>
              <ConfigBar
                capability="chat"
                config={abilityConfig}
                onConfigured={() => { setAbilityConfig(getLlmConfig()); bumpConfig() }}
                onClear={() => { setAbilityConfig(null); bumpConfig() }}
              />
            </div>
          </div>
        </Section>
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
              const hasCode = !!c.effect_code
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

      <div className="ai-card-info-bar ai-designer-toolbar">
            {/* Group 1: card type tabs */}
            <div className="ai-designer-toolbar__group">
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
            </div>

            {/* Group 2: name + ID */}
            <div className="ai-designer-toolbar__group ai-designer-toolbar__group--grow">
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
            </div>

            {/* Group 3: save / sandbox / localize / close */}
            <div className="ai-designer-toolbar__group">
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
              <button type="button" className="btn-link ai-designer-close" onClick={onClose}>
                {locale === 'zh' ? '关闭' : 'Close'}
              </button>
            </div>
          </div>

          {/* Completeness chips: chip-style with 👁/✏ when present, ✗ when missing */}
          <div className="ai-completeness-bar">
            <span className={`card-asset-chip${artUrl ? ' is-active' : ''}`}>
              {artUrl ? '👁' : '✗'} {t('platform.image')}
            </span>
            <span className={`card-asset-chip${extracted?.sourceCode ? ' is-active' : ''}`}>
              {extracted?.sourceCode ? '✏' : '✗'} {t('platform.code')}
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
              <div className="form-field ai-minor-field">
                <label htmlFor="ai-prerequisite-input">{t('platform.prerequisite')}</label>
                <input
                  id="ai-prerequisite-input"
                  type="text"
                  className="ai-minor-input"
                  value={prerequisite}
                  onChange={e => setPrerequisite(e.target.value)}
                  placeholder={locale === 'zh' ? '可选，如：2 个职业、仍住木屋' : 'Optional, e.g., 2 occupations'}
                />
              </div>
              <div className="form-field ai-minor-field">
                <label htmlFor="ai-cost-input">{t('platform.cost')}</label>
                <input
                  id="ai-cost-input"
                  type="text"
                  className="ai-minor-input"
                  value={costInput}
                  onChange={e => setCostInput(e.target.value)}
                  placeholder={locale === 'zh' ? '可选，如：1 木 2 黏土' : 'Optional, e.g., 1 wood 2 clay'}
                />
              </div>
            </div>
          )}

          <div className="ai-designer-panels">
            <ArtPanel
              cardType={cardType}
              cardName={cardName}
              artUrl={artUrl}
              setArtUrl={setArtUrl}
              refCache={refCache}
              configVersion={configVersion}
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
              configVersion={configVersion}
            />
          </div>

      {showLocalizationModal && (
        <LocalizationModal
          currentContent={pickLocalizationCurrentContent({
            locale,
            cardLocales,
            cardName,
            prerequisite,
            extractedName: extracted?.card?.name,
            extractedDesc: extracted?.card?.desc,
            extractedPrerequisite: extracted?.card?.prerequisite,
          })}
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
