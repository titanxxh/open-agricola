/**
 * Workshop AI Card Designer.
 *
 * The system prompt fed to the LLM lives in `client/services/llmPrompts.ts`.
 * Sandbox constraints visible to users (sandbox-error tooltips, "what can I
 * write" hints, etc.) MUST stay consistent with the single source of truth:
 *   docs/CUSTOM_CARD_SANDBOX.md
 *
 * CI runs `pnpm run check:prompt-sync` for whitelist names. Runtime semantics
 * are guarded by llmPrompts / executor contract tests and LLM golden replay.
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
} from '../../services/llm'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../services/llmPrompts'
import { LocalizationModal, isLocaleEntryComplete } from './LocalizationModal'
import { useLocale } from '../../contexts/LocaleContext'
import { PlayerCard } from '../../components/common/PlayerCard'
import { Section } from '../../components/common/Section'
import type { CardMeta } from '../../services/card-meta'
import { resolveCardArtUrl } from '../../../shared/utils/card-art-url'
import { sourceFingerprint } from '../../../shared/projections/workshop-generation'
import { API_BASE } from '../../config'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { useWorkshopDraft } from './useWorkshopDraft'
import type {
  AbilityCandidate,
  ArtCandidate,
  WorkshopClientDraft,
  WorkshopStage,
} from './workshop-draft-model'

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

const cookieApiFetch: ApiFetch = (path, init) => fetch(`${API_BASE}${path}`, {
  ...init,
  credentials: 'include',
})

/** Generate a card ID from a display name — English only */
function autoCardId(name: string): string {
  // Keep only ASCII letters, digits, underscores
  const slug = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)
  return slug ? `CUSTOM_${slug}` : ''
}

/** Check if a card ID is valid (CUSTOM_ prefix, ASCII only, min length) */
function isValidCardId(id: string, locale: 'zh' | 'en' = 'zh'): { valid: boolean; reason?: string } {
  if (!id.startsWith('CUSTOM_')) {
    return {
      valid: false,
      reason: locale === 'zh' ? 'ID 必须以 CUSTOM_ 开头' : 'ID must start with CUSTOM_',
    }
  }
  if (id.length < 8) {
    return {
      valid: false,
      reason: locale === 'zh' ? 'ID 太短，至少 8 个字符' : 'ID must contain at least 8 characters',
    }
  }
  if (/[^a-zA-Z0-9_]/.test(id)) {
    return {
      valid: false,
      reason: locale === 'zh'
        ? 'ID 只能包含英文字母、数字和下划线'
        : 'ID may only contain ASCII letters, numbers, and underscores',
    }
  }
  return { valid: true }
}

const COST_RESOURCE_ALIASES: Record<string, string> = {
  wood: 'wood',
  木材: 'wood',
  木: 'wood',
  clay: 'clay',
  黏土: 'clay',
  粘土: 'clay',
  reed: 'reed',
  芦苇: 'reed',
  蘆葦: 'reed',
  stone: 'stone',
  石材: 'stone',
  石头: 'stone',
  石: 'stone',
  food: 'food',
  食物: 'food',
  grain: 'grain',
  谷物: 'grain',
  vegetable: 'vegetable',
  蔬菜: 'vegetable',
  sheep: 'sheep',
  羊: 'sheep',
  boar: 'boar',
  野猪: 'boar',
  cattle: 'cattle',
  牛: 'cattle',
  fuel: 'fuel',
  燃料: 'fuel',
  horse: 'horse',
  马: 'horse',
}

function parseWorkshopCostInput(input: string): Record<string, number> {
  const cost: Record<string, number> = {}
  const aliases = Object.keys(COST_RESOURCE_ALIASES)
    .sort((left, right) => right.length - left.length)
    .join('|')
  const pattern = new RegExp(`(\\d+)\\s*<?(${aliases})>?`, 'gi')
  for (const match of input.matchAll(pattern)) {
    const amount = Number(match[1])
    const resource = COST_RESOURCE_ALIASES[match[2]!.toLowerCase()]
    if (resource && amount > 0) cost[resource] = (cost[resource] ?? 0) + amount
  }
  return cost
}

async function uploadArt(
  dataUrl: string,
  apiFetch: ApiFetch,
): Promise<string | null> {
  try {
    const resp = await apiFetch('/api/workshop/art', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
 * shows this read-only as the source for the translate button.
 */
export function pickLocalizationCurrentContent(args: {
  cardLocales: Record<string, { name: string; desc: string[]; prerequisite?: string }>
  cardName: string
  prerequisite: string
  extractedName: string | undefined
  extractedDesc: string[] | undefined
  extractedPrerequisite: string | undefined
}): { name: string; desc: string[]; prerequisite?: string } {
  const localeEntry = args.cardLocales.en
  return {
    name: args.cardName || args.extractedName || localeEntry?.name || '',
    desc: args.extractedDesc ?? localeEntry?.desc ?? [],
    prerequisite: args.prerequisite
      || args.extractedPrerequisite
      || localeEntry?.prerequisite,
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
    rules?: string[]
    prerequisite?: string
    modifiers?: unknown[]
    locales?: Record<string, CardLocaleEntry>
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
  review_status: string
  live: boolean
  updated_at: number
}

type WorkshopDraftVersion = {
  id: string
  version_number: number
  card_json: Record<string, unknown>
  art_url: string | null
  created_at: number
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
      <pre tabIndex={0}><code>{code}</code></pre>
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
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="ai-model-select"
              aria-label={capability === 'image'
                ? '图片生成模型 / Image generation model'
                : '能力生成模型 / Ability generation model'}
            >
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

// ── the reference Reference Image Picker ────────────────────────────────────────────────

/** The reference card image URL given deck letter and card number */
function refImgUrl(deck: string, num: number) {
  return publicAssetUrl(`/assets/revised/deck${deck}/${deck}${String(num).padStart(3, '0')}.png`)
}

// All the reference card images: decks A-E, minors 1-84, occupations 85-168
const DECKS = ['A', 'B', 'C', 'D', 'E'] as const
const MINOR_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => refImgUrl(d, i + 1)))
const OCC_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => refImgUrl(d, i + 85)))

async function fetchRefImage(url: string): Promise<ReferenceImage | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    if (!(blob instanceof Blob)) return null
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
              aria-label={isSelected ? (locale === 'zh' ? '取消选择参考图' : 'Deselect reference') : (locale === 'zh' ? '选择参考图' : 'Select reference')}
              aria-pressed={isSelected}
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

// Card face icon box geometry, mirrored from client/styles/card-sprite.css:
//   .player-card.occupation .card-icon { width: 180.95px;  height: 189.645px }
//   .player-card.minor      .card-icon { width: 182.125px; height: 189.9975px }
// Both boxes are slightly taller than wide. Art must ship at that ratio —
// a square canvas leaves the card face no good option, only cropping the
// sides (cover) or letterboxing it (contain).
const CARD_ART_ICON_BOX = {
  occupation: { width: 180.95, height: 189.645 },
  minor: { width: 182.125, height: 189.9975 },
} as const

// Badge width as a share of the canvas width, measured off official deck art
// (which uses the very same badge-with-transparent-corners layout):
//   deckE/E089.png (occupation): circle   383x383 of 512 -> 74.8% wide
//   deckE/E001.png (minor):      hexagon  441x384 of 512 -> 86.1% wide
// The two card types differ because a flat-top hexagon is 1.155x wider than
// tall, so it needs more width to carry the same visual height. Filling the
// canvas edge to edge instead swallows the frame's wheat-ear ornaments and
// reads as "the art is too big" next to an official card.
export const CARD_ART_BADGE_RATIO = {
  occupation: 383 / 512,
  minor: 441 / 512,
} as const

export function cardArtCanvasSize(cardType: 'minor' | 'occupation'): {
  width: number
  height: number
} {
  const width = 512
  const box = CARD_ART_ICON_BOX[cardType]
  return { width, height: Math.round((width * box.height) / box.width) }
}

async function processCardArt(dataUrl: string, cardType: 'minor' | 'occupation'): Promise<string> {
  const { width: WIDTH, height: HEIGHT } = cardArtCanvasSize(cardType)
  const BORDER = 8
  const GOLD = '#c9a227'
  // R is the path radius; the stroke straddles it, so the badge's outer edge
  // lands exactly on WIDTH * ratio.
  const R = (WIDTH * CARD_ART_BADGE_RATIO[cardType]) / 2 - BORDER / 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const ctx = canvas.getContext('2d')!
      const cx = WIDTH / 2
      const cy = HEIGHT / 2

      const buildPath = () => {
        ctx.beginPath()
        if (cardType === 'occupation') {
          ctx.arc(cx, cy, R, 0, Math.PI * 2)
        } else {
          // Flat-top hexagon (matching the reference card sprites)
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

      // Cover-fit the badge's bounding box, not the whole canvas: scaling to
      // the canvas would push most of the picture outside the clip. A flat-top
      // hexagon is only sqrt(3)*R tall against its 2*R width.
      ctx.save()
      buildPath()
      ctx.clip()
      const badgeWidth = R * 2
      const badgeHeight = cardType === 'occupation' ? R * 2 : R * Math.sqrt(3)
      const scale = Math.max(badgeWidth / img.width, badgeHeight / img.height)
      const iw = img.width * scale
      const ih = img.height * scale
      ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih)
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

function ArtPanel({
  cardType,
  cardName,
  artUrl,
  artSubject,
  candidates,
  selectedCandidateId,
  baseRevision,
  refCache,
  apiFetch,
  onSubjectChange,
  onCandidateCompleted,
  onCandidateSelected,
  onCandidateDiscarded,
  onCandidateAdopted,
}: {
  cardType: 'minor' | 'occupation'
  cardName: string
  artUrl: string | null
  artSubject: string
  candidates: ArtCandidate[]
  selectedCandidateId?: string
  baseRevision: number
  refCache?: Map<string, ReferenceImage>
  apiFetch: ApiFetch
  onSubjectChange: (subject: string) => void
  onCandidateCompleted: (candidate: ArtCandidate) => Promise<void>
  onCandidateSelected: (candidateId: string) => void
  onCandidateDiscarded: (candidateId: string) => Promise<void>
  onCandidateAdopted: (candidate: ArtCandidate) => Promise<void>
}) {
  const { locale, t } = useLocale()
  const config = getLlmConfig(KEY_LLM_CONFIG_ART)
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [artError, setArtError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (artError) errorRef.current?.focus()
  }, [artError])

  const selectedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId)
    ?? candidates.at(-1)
  const canGenerateArt = config ? supportsImageGeneration(config) : false
  const borderLabel = cardType === 'occupation'
    ? (locale === 'zh' ? '圆形金边' : 'Circular gold trim')
    : (locale === 'zh' ? '六角形金边' : 'Hexagonal gold trim')

  const completeCandidate = async (
    resultUrl: string,
    prompt: string,
    provider?: string,
    model?: string,
    referenceImages?: string[],
  ) => {
    await onCandidateCompleted({
      id: globalThis.crypto?.randomUUID?.() ?? `art-${Date.now()}`,
      kind: 'art',
      prompt,
      promptFormat: 'subject',
      resultUrl,
      createdAt: Date.now(),
      baseRevision,
      stale: false,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(referenceImages?.length ? { referenceImages } : {}),
    })
  }

  const handleToggleRef = (url: string) => {
    setSelectedRefs(previous =>
      previous.includes(url)
        ? previous.filter(entry => entry !== url)
        : [...previous, url],
    )
  }

  const handleGenerate = async () => {
    const subject = artSubject.trim()
    if (!subject || generating || !canGenerateArt || !config) return
    setGenerating(true)
    setArtError('')
    try {
      const prompt = buildCardArtPrompt(subject, cardType, locale as 'zh' | 'en')
      const referenceImages = selectedRefs.length > 0
        ? (await Promise.all(
            selectedRefs.map(url =>
              refCache?.get(url)
                ? Promise.resolve(refCache.get(url)!)
                : fetchRefImage(url),
            ),
          )).filter((entry): entry is ReferenceImage => entry !== null)
        : undefined
      const rawDataUrl = await generateCardArt(prompt, config, referenceImages)
      if (!rawDataUrl) {
        setArtError(locale === 'zh'
          ? '图片服务没有返回结果，请检查模型与 API Key。'
          : 'The image service returned no result. Check the model and API key.')
        return
      }
      const processed = await processCardArt(rawDataUrl, cardType)
      const uploaded = await uploadArt(processed, apiFetch)
      if (!uploaded) {
        setArtError(locale === 'zh'
          ? '图片未上传到服务器；候选暂时只保存在本机。'
          : 'The image was not uploaded; this candidate is local-only for now.')
      }
      await completeCandidate(
        uploaded ?? processed,
        subject,
        config.provider,
        config.model,
        selectedRefs,
      )
    } catch (reason) {
      setArtError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setGenerating(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
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
      const uploaded = await uploadArt(processed, apiFetch)
      await completeCandidate(
        uploaded ?? processed,
        artSubject.trim() || (locale === 'zh' ? '手动上传图片' : 'Manually uploaded image'),
        'upload',
        file.type,
      )
    } catch (reason) {
      setArtError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="ai-art-panel">
      <div className="ai-art-panel-header">
        <h3>{locale === 'zh' ? '卡牌图片' : 'Card art'}</h3>
        <span className="ai-art-border-tag">{borderLabel}</span>
      </div>

      {artUrl && (
        <section className="aicw-current-asset">
          <div>
            <strong>{locale === 'zh' ? '当前已采用' : 'Currently adopted'}</strong>
            <small>{locale === 'zh' ? '新候选不会自动覆盖' : 'New candidates do not overwrite this'}</small>
          </div>
          <img src={resolveCardArtUrl(artUrl, API_BASE)} alt={cardName || (locale === 'zh' ? '当前卡牌图片' : 'Current card art')} />
        </section>
      )}

      {!config && (
        <div className="ai-panel-needs-config">
          {locale === 'zh'
            ? `请先在顶部「${t('platform.aiConfig')}」中配置图片生成模型。`
            : `Configure an image-generation model in "${t('platform.aiConfig')}" first.`}
        </div>
      )}

      {config && (
        <div className="aicw-generator-fields">
          <label>
            <span>{locale === 'zh' ? '画面主题' : 'Image subject'}</span>
            <input
              type="text"
              value={artSubject}
              onChange={event => onSubjectChange(event.target.value)}
              placeholder={cardType === 'occupation'
                ? (locale === 'zh' ? '一个正在采摘水果的农夫' : 'A farmer picking fruit')
                : (locale === 'zh' ? '一把质朴的中世纪木锤' : 'A rustic medieval wooden mallet')}
            />
          </label>
          {canGenerateArt && (
            <RefImagePicker
              cardType={cardType}
              selected={selectedRefs}
              onToggle={handleToggleRef}
            />
          )}
          <button
            type="button"
            className="aicw-button aicw-button-primary"
            onClick={() => { void handleGenerate() }}
            disabled={generating || !artSubject.trim() || !canGenerateArt}
          >
            {generating
              ? (locale === 'zh' ? '正在生成候选…' : 'Generating candidate…')
              : (locale === 'zh' ? '生成图片候选' : 'Generate art candidate')}
          </button>
        </div>
      )}

      {artError && (
        <div
          ref={errorRef}
          className="form-error aicw-panel-error"
          role="alert"
          tabIndex={-1}
        >
          {artError}
        </div>
      )}

      {candidates.length > 0 && (
        <section className="aicw-candidate-section">
          <div className="aicw-candidate-heading">
            <div>
              <strong>{locale === 'zh' ? '最近候选' : 'Recent candidates'}</strong>
              <span>{locale === 'zh' ? '最多保留 3 个，采用后才写入卡牌' : 'Up to 3; only adoption changes the card'}</span>
            </div>
            <span>{candidates.length} / 3</span>
          </div>
          <div className="aicw-art-candidates">
            {candidates.map(candidate => (
              <button
                type="button"
                key={candidate.id}
                className={selectedCandidate?.id === candidate.id ? 'is-selected' : ''}
                onClick={() => onCandidateSelected(candidate.id)}
                aria-label={`${locale === 'zh' ? '查看图片候选' : 'View art candidate'} ${candidate.id}`}
              >
                <img src={resolveCardArtUrl(candidate.resultUrl, API_BASE)} alt="" />
                <span>{candidate.model ?? candidate.provider ?? (locale === 'zh' ? '未知模型' : 'Unknown model')}</span>
              </button>
            ))}
          </div>
          {selectedCandidate && (
            <div className="aicw-art-review">
              <img src={resolveCardArtUrl(selectedCandidate.resultUrl, API_BASE)} alt={locale === 'zh' ? '待采用图片候选' : 'Art candidate awaiting adoption'} />
              <div>
                <span className={`aicw-candidate-state${selectedCandidate.stale ? ' is-stale' : ''}`}>
                  {selectedCandidate.stale
                    ? (locale === 'zh' ? '基于旧草稿生成' : 'Generated from an older draft')
                    : (locale === 'zh' ? '待采用' : 'Awaiting adoption')}
                </span>
                <details>
                  <summary>{locale === 'zh' ? '查看生成记录' : 'View generation record'}</summary>
                  <p>{selectedCandidate.prompt}</p>
                  <small>
                    {[selectedCandidate.provider, selectedCandidate.model].filter(Boolean).join(' · ')
                      || (locale === 'zh' ? '未记录模型' : 'Model not recorded')}
                  </small>
                  {selectedCandidate.referenceImages?.length ? (
                    <small className="aicw-reference-record">
                      {locale === 'zh' ? '参考图' : 'References'}：
                      {selectedCandidate.referenceImages.join(', ')}
                    </small>
                  ) : null}
                </details>
                <div className="aicw-candidate-actions">
                  <button type="button" className="aicw-button" onClick={() => { void onCandidateDiscarded(selectedCandidate.id) }}>
                    {locale === 'zh' ? '丢弃候选' : 'Discard'}
                  </button>
                  <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void onCandidateAdopted(selectedCandidate) }}>
                    {locale === 'zh' ? '采用为当前卡面' : 'Adopt as current art'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="ai-art-upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={event => { void handleFileUpload(event) }}
          hidden
        />
        <button
          type="button"
          className="aicw-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? (locale === 'zh' ? '正在处理上传…' : 'Processing upload…')
            : (locale === 'zh' ? '上传为图片候选' : 'Upload as candidate')}
        </button>
      </div>
    </div>
  )
}

// ── Ability Chat Panel ────────────────────────────────────────────────────────

function AbilityPanel({
  cardId,
  cardType,
  cardName,
  prerequisite,
  costHint,
  extracted,
  input,
  messages,
  candidates,
  selectedCandidateId,
  baseRevision,
  apiFetch,
  onInputChange,
  onMessagesChange,
  onCandidateCompleted,
  onCandidateSelected,
  onCandidateEdited,
  onCandidateValidated,
  onCandidateDiscarded,
  onCandidateAdopted,
  sandboxErrors,
  validationErrors,
  onValidationErrorsConsumed,
}: {
  cardId: string
  cardType: 'minor' | 'occupation'
  cardName: string
  prerequisite?: string
  costHint?: string
  extracted: ExtractedCard | null
  input: string
  messages: DisplayMessage[]
  candidates: AbilityCandidate[]
  selectedCandidateId?: string
  baseRevision: number
  apiFetch: ApiFetch
  onInputChange: (input: string) => void
  onMessagesChange: (messages: DisplayMessage[]) => void
  onCandidateCompleted: (candidate: AbilityCandidate) => Promise<void>
  onCandidateSelected: (candidateId: string) => void
  onCandidateEdited: (candidateId: string, sourceCode: string) => void
  onCandidateValidated: (
    candidateId: string,
    validation: AbilityCandidate['validation'],
    fingerprint: string,
  ) => Promise<void>
  onCandidateDiscarded: (candidateId: string) => Promise<void>
  onCandidateAdopted: (candidate: AbilityCandidate) => Promise<void>
  sandboxErrors?: string[] | null
  validationErrors?: string | null
  onValidationErrorsConsumed?: () => void
}) {
  const { locale, t } = useLocale()
  const config = getLlmConfig()
  const [chatError, setChatError] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [validatingCandidateId, setValidatingCandidateId] = useState<string | null>(null)
  const messagesRef = useRef(messages)
  const bottomRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const injectedSandboxErrorsRef = useRef<string | null>(null)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (chatError) errorRef.current?.focus()
  }, [chatError])

  const selectedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId)
    ?? candidates.at(-1)

  const importAdoptedSource = () => {
    if (!extracted?.sourceCode) return
    void onCandidateCompleted({
      id: globalThis.crypto?.randomUUID?.() ?? `ability-${Date.now()}`,
      kind: 'ability',
      prompt: locale === 'zh' ? '手动编辑当前源码' : 'Manually edit current source',
      sourceCode: extracted.sourceCode,
      cardJson: extracted.card,
      validation: { valid: false, errors: [] },
      createdAt: Date.now(),
      baseRevision,
      stale: false,
    })
  }

  const commitMessages = useCallback((
    update: DisplayMessage[] | ((current: DisplayMessage[]) => DisplayMessage[]),
  ) => {
    const next = typeof update === 'function' ? update(messagesRef.current) : update
    messagesRef.current = next
    onMessagesChange(next)
  }, [onMessagesChange])

  const buildChatHistory = useCallback((
    visibleMessages: DisplayMessage[],
    requestIndex: number,
  ): ChatMessage[] => {
    const typeLabel = cardType === 'occupation'
      ? '职业卡 (Occupation)'
      : '小改良卡 (Minor Improvement)'
    const contextParts = ['CARD_ID、卡牌类型和卡牌名称必须与当前卡牌完全一致']
    if (cardId.trim()) contextParts.push(`卡牌 ID: ${cardId.trim()}`)
    contextParts.push(`卡牌类型: ${typeLabel}`)
    if (cardName.trim()) contextParts.push(`卡牌名称: ${cardName.trim()}`)
    if (prerequisite?.trim()) contextParts.push(`前置条件: ${prerequisite.trim()}`)
    if (costHint?.trim()) contextParts.push(`消耗资源: ${costHint.trim()}`)
    if (requestIndex === 0 && extracted?.sourceCode) {
      contextParts.push(`\n当前已有代码:\n\`\`\`typescript\n${extracted.sourceCode}\n\`\`\``)
    }
    return visibleMessages.map((message, index) => ({
      role: message.isError ? 'user' : message.role,
      content: index === requestIndex
        ? `[${contextParts.join(', ')}]\n${message.content}`
        : message.content,
    }))
  }, [cardId, cardName, cardType, costHint, extracted, prerequisite])

  const validateSource = useCallback(async (
    sourceCode: string,
  ): Promise<AbilityCandidate['validation']> => {
    try {
      const response = await apiFetch('/api/workshop/cards/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourceCode, card_id: cardId }),
      })
      const data = await response.json() as {
        ok: boolean
        valid?: boolean
        errors?: string[]
        error?: string
      }
      if (!response.ok || !data.ok) {
        return {
          valid: false,
          errors: [data.error ?? `Request failed (${response.status})`],
        }
      }
      return {
        valid: data.valid === true,
        errors: data.errors ?? [],
      }
    } catch (reason) {
      return {
        valid: false,
        errors: [reason instanceof Error ? reason.message : String(reason)],
      }
    }
  }, [apiFetch, cardId])

  const sendMessages = useCallback(async (
    chatHistory: ChatMessage[],
    promptSnapshot: string | undefined,
    request: string,
  ) => {
    if (!config) return
    setStreaming(true)
    setChatError('')
    commitMessages(current => [
      ...current,
      { role: 'assistant', content: '', streaming: true, promptSnapshot },
    ])
    try {
      let fullText = ''
      for await (const chunk of streamChat(chatHistory, CARD_DESIGNER_SYSTEM_PROMPT, config)) {
        fullText += chunk
        commitMessages(current => {
          const updated = [...current]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: fullText,
            streaming: true,
            promptSnapshot,
          }
          return updated
        })
      }
      commitMessages(current => {
        const updated = [...current]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: fullText,
          promptSnapshot,
        }
        return updated
      })
      const parsed = extractCardFromResponse(fullText)
      if (!parsed?.sourceCode) {
        setChatError(locale === 'zh'
          ? 'AI 回复中没有可采用的完整源代码。'
          : 'The AI response did not contain complete source code.')
        return
      }
      const validation = await validateSource(parsed.sourceCode)
      await onCandidateCompleted({
        id: globalThis.crypto?.randomUUID?.() ?? `ability-${Date.now()}`,
        kind: 'ability',
        prompt: request,
        sourceCode: parsed.sourceCode,
        cardJson: parsed.card,
        validation,
        createdAt: Date.now(),
        baseRevision,
        stale: false,
        provider: config.provider,
        model: config.model,
      })
    } catch (reason) {
      setChatError(reason instanceof Error ? reason.message : String(reason))
      commitMessages(current => current.filter(message => !message.streaming))
    } finally {
      setStreaming(false)
    }
  }, [
    baseRevision,
    commitMessages,
    config,
    locale,
    onCandidateCompleted,
    validateSource,
  ])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !config || streaming) return
    const request = input.trim()
    const visibleMessages: DisplayMessage[] = [
      ...messages,
      { role: 'user', content: request },
    ]
    commitMessages(visibleMessages)
    onInputChange('')
    const chatHistory = buildChatHistory(visibleMessages, visibleMessages.length - 1)
    const promptSnapshot = [
      `[SYSTEM]\n${CARD_DESIGNER_SYSTEM_PROMPT}`,
      ...chatHistory.map(message =>
        `[${message.role.toUpperCase()}]\n${message.content}`),
    ].join('\n\n---\n\n')
    await sendMessages(chatHistory, promptSnapshot, request)
  }, [
    buildChatHistory,
    commitMessages,
    config,
    input,
    messages,
    onInputChange,
    sendMessages,
    streaming,
  ])

  const handleResend = useCallback((messageIndex: number) => {
    if (streaming || !config) return
    const truncated = messages.slice(0, messageIndex + 1)
    commitMessages(truncated)
    const chatHistory = buildChatHistory(truncated, messageIndex)
    const promptSnapshot = [
      `[SYSTEM]\n${CARD_DESIGNER_SYSTEM_PROMPT}`,
      ...chatHistory.map(message =>
        `[${message.role.toUpperCase()}]\n${message.content}`),
    ].join('\n\n---\n\n')
    void sendMessages(
      chatHistory,
      promptSnapshot,
      truncated[messageIndex]?.content ?? '',
    )
  }, [buildChatHistory, commitMessages, config, messages, sendMessages, streaming])

  const handleValidate = async (candidate: AbilityCandidate) => {
    setValidatingCandidateId(candidate.id)
    const validation = await validateSource(candidate.sourceCode)
    await onCandidateValidated(candidate.id, validation, sourceFingerprint(candidate.sourceCode))
    setValidatingCandidateId(null)
  }

  const injectError = useCallback((heading: string, errors: string[]) => {
    if (!config || streaming) return
    const content = [
      heading,
      '',
      ...errors,
      '',
      '请根据错误修改卡牌定义，并返回完整源代码。',
    ].join('\n')
    const nextMessages: DisplayMessage[] = [
      ...messagesRef.current,
      { role: 'user', content, isError: true },
    ]
    commitMessages(nextMessages)
    const chatHistory: ChatMessage[] = nextMessages.map(message => ({
      role: message.isError ? 'user' : message.role,
      content: message.content,
    }))
    void sendMessages(chatHistory, undefined, content)
  }, [commitMessages, config, sendMessages, streaming])

  useEffect(() => {
    if (!sandboxErrors?.length) {
      injectedSandboxErrorsRef.current = null
      return
    }
    const signature = JSON.stringify(sandboxErrors)
    if (injectedSandboxErrorsRef.current === signature || !config || streaming) return
    injectedSandboxErrorsRef.current = signature
    injectError('沙盒运行报错', sandboxErrors)
  }, [config, injectError, sandboxErrors, streaming])

  return (
    <div className="ai-ability-panel">
      <div className="ai-ability-panel-header">
        <h3>{locale === 'zh' ? '卡牌能力' : 'Card ability'}</h3>
        {extracted?.sourceCode && (
          <button type="button" className="aicw-button" onClick={importAdoptedSource}>
            {locale === 'zh' ? '导入手动编辑器' : 'Open in manual editor'}
          </button>
        )}
      </div>

      {extracted?.sourceCode && (
        <section className="aicw-current-code">
          <div>
            <strong>{locale === 'zh' ? '当前已采用源码' : 'Currently adopted source'}</strong>
            <span>{locale === 'zh' ? '新生成结果先进入候选，不会自动覆盖。' : 'New generations stay as candidates until adopted.'}</span>
          </div>
          <pre tabIndex={0}><code>{extracted.sourceCode}</code></pre>
        </section>
      )}

      {!config && (
        <div className="ai-panel-needs-config">
          {locale === 'zh'
            ? `请先在顶部「${t('platform.aiConfig')}」中配置能力生成模型。`
            : `Configure an ability model in "${t('platform.aiConfig')}" first.`}
        </div>
      )}

      {chatError && (
        <div
          ref={errorRef}
          className="form-error aicw-panel-error"
          role="alert"
          tabIndex={-1}
        >
          {chatError}
        </div>
      )}

      <div className="ai-chat-area">
        {messages.length === 0 && (
          <div className="ai-chat-hint">
            <p>{locale === 'zh'
              ? '描述想要的效果。AI 生成的源码会先进入候选，并自动做静态验证。'
              : 'Describe the effect. Generated source becomes a candidate and is statically validated.'}</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`ai-message ai-message-${message.role}${message.isError ? ' ai-message-error' : ''}`}
          >
            <div className="ai-message-role">
              {message.isError
                ? (locale === 'zh' ? '错误反馈' : 'Error feedback')
                : message.role === 'user'
                  ? (locale === 'zh' ? '你' : 'You')
                  : 'AI'}
              {message.role === 'user' && !streaming && (
                <button type="button" className="btn-link ai-resend-btn" onClick={() => handleResend(index)}>
                  {locale === 'zh' ? '重发' : 'Resend'}
                </button>
              )}
            </div>
            {message.role === 'assistant' && message.promptSnapshot && (
              <details className="ai-prompt-details">
                <summary className="ai-prompt-summary">
                  {locale === 'zh' ? '查看完整 Prompt' : 'View full prompt'}
                </summary>
                <pre className="ai-prompt-text" tabIndex={0}>{message.promptSnapshot}</pre>
              </details>
            )}
            <div className={`ai-message-content${message.streaming ? ' ai-streaming' : ''}`}>
              {message.role === 'assistant'
                ? <MessageContent text={message.content || (message.streaming ? '▋' : '')} />
                : message.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {config && (
        <div className="ai-input-area">
          <textarea
            value={input}
            onChange={event => onInputChange(event.target.value)}
            placeholder={locale === 'zh' ? '描述你想要的卡牌效果…' : 'Describe the card effect…'}
            rows={3}
            disabled={streaming}
          />
          <button
            type="button"
            className="aicw-button aicw-button-primary"
            onClick={() => { void handleSend() }}
            disabled={streaming || !input.trim()}
          >
            {streaming
              ? (locale === 'zh' ? '生成中…' : 'Generating…')
              : (locale === 'zh' ? '生成能力候选' : 'Generate ability candidate')}
          </button>
        </div>
      )}

      {candidates.length > 0 && (
        <section className="aicw-candidate-section">
          <div className="aicw-candidate-heading">
            <div>
              <strong>{locale === 'zh' ? '最近能力候选' : 'Recent ability candidates'}</strong>
              <span>{locale === 'zh' ? '编辑后需要重新验证' : 'Editing requires revalidation'}</span>
            </div>
            <span>{candidates.length} / 3</span>
          </div>
          <div className="aicw-ability-tabs">
            {candidates.map(candidate => (
              <button
                type="button"
                key={candidate.id}
                className={selectedCandidate?.id === candidate.id ? 'is-selected' : ''}
                onClick={() => onCandidateSelected(candidate.id)}
              >
                <strong>{candidate.model ?? (locale === 'zh' ? '能力候选' : 'Ability candidate')}</strong>
                <small>{candidate.validation.valid
                  ? (locale === 'zh' ? '验证通过' : 'Validated')
                  : (locale === 'zh' ? '待验证' : 'Needs validation')}</small>
              </button>
            ))}
          </div>
          {selectedCandidate && (
            <div className="aicw-ability-review">
              <div className="aicw-candidate-toolbar">
                <span className={`aicw-candidate-state${selectedCandidate.stale ? ' is-stale' : ''}`}>
                  {selectedCandidate.stale
                    ? (locale === 'zh' ? '基于旧草稿生成' : 'Generated from an older draft')
                    : selectedCandidate.validation.valid
                      ? (locale === 'zh' ? '验证通过，待采用' : 'Validated, awaiting adoption')
                      : (locale === 'zh' ? '待验证' : 'Needs validation')}
                </span>
                <details>
                  <summary>{locale === 'zh' ? '生成记录' : 'Generation record'}</summary>
                  <p>{selectedCandidate.prompt}</p>
                  <small>
                    {[selectedCandidate.provider, selectedCandidate.model].filter(Boolean).join(' · ')}
                  </small>
                </details>
              </div>
              <textarea
                className="aicw-source-editor"
                value={selectedCandidate.sourceCode}
                onChange={event => onCandidateEdited(selectedCandidate.id, event.target.value)}
                aria-label={locale === 'zh' ? '能力候选源码' : 'Ability candidate source'}
                spellCheck={false}
              />
              {selectedCandidate.validation.errors.length > 0 && (
                <ul className="aicw-validation-errors">
                  {selectedCandidate.validation.errors.map(validationError => (
                    <li key={validationError}>{validationError}</li>
                  ))}
                </ul>
              )}
              <div className="aicw-candidate-actions">
                <button type="button" className="aicw-button" onClick={() => { void onCandidateDiscarded(selectedCandidate.id) }}>
                  {locale === 'zh' ? '丢弃候选' : 'Discard'}
                </button>
                <button type="button" className="aicw-button" onClick={() => { void handleValidate(selectedCandidate) }} disabled={validatingCandidateId === selectedCandidate.id}>
                  {validatingCandidateId === selectedCandidate.id
                    ? (locale === 'zh' ? '验证中…' : 'Validating…')
                    : (locale === 'zh' ? '运行静态验证' : 'Run static validation')}
                </button>
                <button
                  type="button"
                  className="aicw-button aicw-button-primary"
                  onClick={() => { void onCandidateAdopted(selectedCandidate) }}
                  disabled={!selectedCandidate.validation.valid}
                >
                  {locale === 'zh' ? '采用为当前源码' : 'Adopt as current source'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {validationErrors && (
        <div className="ai-validation-error-bar">
          <div className="ai-validation-error-text">{validationErrors}</div>
          <button
            type="button"
            className="aicw-button"
            onClick={() => {
              injectError('代码验证失败', [validationErrors])
              onValidationErrorsConsumed?.()
            }}
            disabled={streaming || !config}
          >
            {locale === 'zh' ? '发送给 AI 修复' : 'Send to AI'}
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

type CardLocaleEntry = {
  name: string
  desc: string[]
  rules?: string[]
  prerequisite?: string
}

const WORKSHOP_STAGES: WorkshopStage[] = [
  'metadata',
  'art',
  'ability',
  'localization',
  'validation',
]

const readLocales = (value: unknown): Record<string, CardLocaleEntry> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, CardLocaleEntry>
    : {}

const draftToExtracted = (draft: WorkshopClientDraft): ExtractedCard => {
  const cardJson = draft.cardJson
  const cost = cardJson.cost && typeof cardJson.cost === 'object' && !Array.isArray(cardJson.cost)
    ? cardJson.cost as Record<string, number>
    : {}
  return {
    card: {
      id: draft.cardId,
      name: draft.name,
      card_type: draft.cardType,
      cost,
      vp: typeof cardJson.vp === 'number' ? cardJson.vp : 0,
      desc: Array.isArray(cardJson.desc)
        ? cardJson.desc.filter((value): value is string => typeof value === 'string')
        : [],
      rules: Array.isArray(cardJson.rules)
        ? cardJson.rules.filter((value): value is string => typeof value === 'string')
        : undefined,
      prerequisite: typeof cardJson.prerequisite === 'string'
        ? cardJson.prerequisite
        : undefined,
      modifiers: Array.isArray(cardJson.modifiers) ? cardJson.modifiers : [],
      locales: readLocales(cardJson.locales),
    },
    sourceCode: draft.effectCode ?? undefined,
  }
}

type AiCardDesignerProps = {
  initialCard?: ApiCard
  initialCardId?: string
  onClose: () => void
  onAddToSandboxAndRestart?: (cardDbId: string, versionId: string) => Promise<boolean>
  sandboxErrors?: string[] | null
  onCardLoaded?: (cardDbId: string) => void
  apiFetch?: ApiFetch
}

export function AiCardDesigner({
  initialCard,
  initialCardId,
  onClose,
  onAddToSandboxAndRestart,
  sandboxErrors,
  onCardLoaded,
  apiFetch,
}: AiCardDesignerProps) {
  const { locale, t } = useLocale()
  const workshopApiFetch = apiFetch ?? cookieApiFetch
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
  const [cardIdCopied, setCardIdCopied] = useState(false)
  const [refCache, setRefCache] = useState<Map<string, ReferenceImage>>(new Map())
  const [myCards, setMyCards] = useState<ApiCard[]>([])
  const [currentCardDbId, setCurrentCardDbId] = useState<string | null>(
    initialCard?.id ?? initialCardId ?? null,
  )
  const [showLocalizationModal, setShowLocalizationModal] = useState(false)
  const [cardLocales, setCardLocales] = useState<Record<string, CardLocaleEntry>>({})
  const [pendingStage, setPendingStage] = useState<WorkshopStage | null>(null)
  const [sandboxConfirmation, setSandboxConfirmation] = useState(false)
  const [runtimeSandboxErrors, setRuntimeSandboxErrors] = useState<string[] | null>(null)
  const sandboxGateErrors = sandboxErrors?.length ? sandboxErrors : runtimeSandboxErrors
  const [versions, setVersions] = useState<WorkshopDraftVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState('')
  const [metadataValidationAttempted, setMetadataValidationAttempted] = useState(false)
  const hydratedWorkspaceRef = useRef('')
  const errorRef = useRef<HTMLDivElement>(null)
  const recoveryRef = useRef<HTMLElement>(null)
  const workspaceHeadingRef = useRef<HTMLDivElement>(null)
  const cardNameRef = useRef<HTMLInputElement>(null)
  const cardIdRef = useRef<HTMLInputElement>(null)
  const [abilityConfig, setAbilityConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [artConfig, setArtConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))
  const {
    state: controllerState,
    loading: controllerLoading,
    error: controllerError,
    dispatch,
    updateDraft,
    updateSession,
    checkpoint,
    retryCheckpoint,
    changeStage,
    resolveConflict,
    adoptCandidate: adoptDraftCandidate,
    publishDraft,
    unpublishDraft,
    pinDraftVersion,
    confirmSandboxPass,
    restoreVersion,
    undoRestore,
  } = useWorkshopDraft({
    cardId: currentCardDbId ?? '',
    apiFetch: workshopApiFetch,
  })
  const workspaceState = controllerState?.workspaceId === currentCardDbId
    ? controllerState
    : null

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (!saveSuccess) return
    const timer = setTimeout(() => setSaveSuccess(false), 3000)
    return () => clearTimeout(timer)
  }, [saveSuccess])

  useEffect(() => {
    if (
      controllerError
      || controllerState?.save.status === 'offline'
      || controllerState?.save.status === 'error'
    ) recoveryRef.current?.focus()
  }, [controllerError, controllerState?.save.status])

  useEffect(() => {
    let cancelled = false
    const prefetchUrls = [
      ...sampleN(MINOR_REF_IMAGES, 3),
      ...sampleN(OCC_REF_IMAGES, 3),
    ]
    void Promise.all(
      prefetchUrls.map(async url => ({ url, image: await fetchRefImage(url) })),
    ).then(entries => {
      if (cancelled) return
      setRefCache(previous => {
        const next = new Map(previous)
        for (const { url, image } of entries) {
          if (image) next.set(url, image)
        }
        return next
      })
    })
    return () => { cancelled = true }
  }, [])

  const refreshMyCards = useCallback(() => {
    void workshopApiFetch('/api/workshop/cards?scope=mine')
      .then(response => response.json())
      .then(data => {
        if (data.ok) setMyCards(data.cards as ApiCard[])
      })
      .catch(reason => {
        console.warn('[AiCardDesigner] Failed to load saved designs:', reason)
      })
  }, [workshopApiFetch])

  useEffect(() => { refreshMyCards() }, [refreshMyCards])

  const hydrateDraft = useCallback((draft: WorkshopClientDraft) => {
    const restored = draftToExtracted(draft)
    const rawDraft = draft.cardJson._draft && typeof draft.cardJson._draft === 'object'
      ? draft.cardJson._draft as { prerequisite?: string; costInput?: string }
      : {}
    setCardType(draft.cardType)
    setCardName(draft.name)
    setCardIdInput(draft.cardId)
    setPrerequisite(rawDraft.prerequisite ?? restored.card.prerequisite ?? '')
    setCostInput(rawDraft.costInput ?? Object.entries(restored.card.cost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(' '))
    setExtracted(restored)
    setArtUrl(draft.artUrl)
    setCardLocales(restored.card.locales ?? {})
  }, [])

  useEffect(() => {
    if (!workspaceState) return
    const hydrationKey = `${workspaceState.workspaceId}:${workspaceState.baseRevision}`
    if (hydratedWorkspaceRef.current === hydrationKey) return
    hydratedWorkspaceRef.current = hydrationKey
    hydrateDraft(workspaceState.draft)
  }, [hydrateDraft, workspaceState])

  const patchDraft = useCallback((
    apply: (current: WorkshopClientDraft) => WorkshopClientDraft,
  ) => {
    if (workspaceState) updateDraft(apply(workspaceState.draft))
  }, [updateDraft, workspaceState])

  const handleLoadCard = useCallback((apiCard: ApiCard) => {
    const cardJson = apiCard.card_json
    const nextType = cardJson.card_type === 'occupation' || apiCard.card_type === 'occupation'
      ? 'occupation'
      : 'minor'
    const nextExtracted: ExtractedCard = {
      card: {
        id: typeof cardJson.id === 'string' ? cardJson.id : apiCard.card_id,
        name: apiCard.name,
        card_type: nextType,
        cost: cardJson.cost && typeof cardJson.cost === 'object'
          ? cardJson.cost as Record<string, number>
          : {},
        vp: typeof cardJson.vp === 'number' ? cardJson.vp : 0,
        desc: Array.isArray(cardJson.desc)
          ? cardJson.desc.filter((value): value is string => typeof value === 'string')
          : [],
        rules: Array.isArray(cardJson.rules)
          ? cardJson.rules.filter((value): value is string => typeof value === 'string')
          : undefined,
        prerequisite: typeof cardJson.prerequisite === 'string'
          ? cardJson.prerequisite
          : undefined,
        modifiers: Array.isArray(cardJson.modifiers) ? cardJson.modifiers : [],
        locales: readLocales(cardJson.locales),
      },
      sourceCode: apiCard.effect_code ?? undefined,
    }
    const rawDraft = cardJson._draft && typeof cardJson._draft === 'object'
      ? cardJson._draft as { prerequisite?: string; costInput?: string }
      : {}
    setCardType(nextType)
    setCardName(apiCard.name)
    setCardIdInput(apiCard.card_id)
    setPrerequisite(rawDraft.prerequisite ?? nextExtracted.card.prerequisite ?? '')
    setCostInput(rawDraft.costInput ?? Object.entries(nextExtracted.card.cost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(' '))
    setExtracted(nextExtracted)
    setArtUrl(apiCard.art_url)
    setCardLocales(nextExtracted.card.locales ?? {})
    setCurrentCardDbId(apiCard.id)
    onCardLoaded?.(apiCard.id)
  }, [onCardLoaded])

  useEffect(() => {
    if (initialCard) handleLoadCard(initialCard)
  }, [handleLoadCard, initialCard])

  useEffect(() => {
    if (!initialCard && initialCardId) setCurrentCardDbId(initialCardId)
  }, [initialCard, initialCardId])

  useEffect(() => {
    if (!pendingStage || !workspaceState) return
    void changeStage(pendingStage).then(changed => {
      if (changed) setPendingStage(null)
    })
  }, [changeStage, pendingStage, workspaceState])

  const buildCardJson = (): Record<string, unknown> => ({
    id: cardIdInput,
    name: cardName,
    card_type: cardType,
    deck: 'CUSTOM',
    number: 0,
    desc: extracted?.card.desc ?? [],
    ...(extracted?.card.rules ? { rules: extracted.card.rules } : {}),
    cost: parseWorkshopCostInput(costInput),
    vp: extracted?.card.vp ?? 0,
    prerequisite: prerequisite || undefined,
    modifiers: extracted?.card.modifiers ?? [],
    implemented: true,
    _draft: {
      prerequisite: prerequisite || undefined,
      costInput: costInput || undefined,
    },
    ...(Object.keys(cardLocales).length > 0 ? { locales: cardLocales } : {}),
  })

  const createDraft = async (): Promise<string | null> => {
    const name = cardName.trim()
    setMetadataValidationAttempted(true)
    if (!name) {
      cardNameRef.current?.focus()
      return null
    }
    const nextCardId = cardIdInput.trim() || autoCardId(name)
    const idCheck = isValidCardId(nextCardId, locale)
    if (!idCheck.valid) {
      cardIdRef.current?.focus()
      return null
    }
    setSaving(true)
    setError('')
    setSaveSuccess(false)
    try {
      const response = await workshopApiFetch('/api/workshop/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: nextCardId,
          card_type: cardType,
          name,
          description: (extracted?.card.desc ?? []).join(' '),
          card_json: { ...buildCardJson(), id: nextCardId, name },
          art_url: artUrl,
          status: 'draft',
          ...(extracted?.sourceCode ? { effect_code: extracted.sourceCode } : {}),
        }),
      })
      const data = await response.json() as {
        ok: boolean
        id?: string
        error?: string
        errors?: string[]
      }
      if (!response.ok || !data.ok || !data.id) {
        const details = data.errors?.join('\n')
        if (details) setValidationErrors(details)
        setError([
          data.error ?? (locale === 'zh' ? '保存失败' : 'Save failed'),
          details,
        ].filter(Boolean).join(':\n'))
        return null
      }
      setCardIdInput(nextCardId)
      setSaveSuccess(true)
      return data.id
    } catch {
      setError(locale === 'zh' ? '网络错误' : 'Network error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCard = async (): Promise<string | null> => {
    setMetadataValidationAttempted(true)
    if (!cardName.trim()) {
      cardNameRef.current?.focus()
      return null
    }
    const idCheck = isValidCardId(cardIdInput.trim(), locale)
    if (!idCheck.valid) {
      cardIdRef.current?.focus()
      return null
    }
    if (workspaceState) {
      setSaving(true)
      setError('')
      const saved = await checkpoint()
      setSaving(false)
      if (!saved) return null
      setSaveSuccess(true)
      refreshMyCards()
      return workspaceState.workspaceId
    }
    if (currentCardDbId) {
      setError(locale === 'zh'
        ? '草稿尚未恢复，请稍后重试'
        : 'Draft is still loading. Try again shortly.')
      return null
    }
    const dbId = await createDraft()
    if (!dbId) return null
    setCurrentCardDbId(dbId)
    onCardLoaded?.(dbId)
    refreshMyCards()
    return dbId
  }

  const updateCardType = (next: 'minor' | 'occupation') => {
    setCardType(next)
    patchDraft(current => ({
      ...current,
      cardType: next,
      cardJson: { ...current.cardJson, card_type: next },
    }))
  }

  const updateCardName = (next: string) => {
    const previousAutoId = autoCardId(cardName)
    const nextAutoId = autoCardId(next)
    const shouldUpdateId = (!cardIdInput || cardIdInput === previousAutoId) && nextAutoId.length > 7
    setCardName(next)
    if (shouldUpdateId) setCardIdInput(nextAutoId)
    patchDraft(current => ({
      ...current,
      name: next,
      cardId: shouldUpdateId ? nextAutoId : current.cardId,
      cardJson: {
        ...current.cardJson,
        name: next,
        id: shouldUpdateId ? nextAutoId : current.cardId,
      },
    }))
  }

  const updateCardId = (next: string) => {
    setCardIdInput(next)
    patchDraft(current => ({
      ...current,
      cardId: next,
      cardJson: { ...current.cardJson, id: next },
    }))
  }

  const updatePrerequisite = (next: string) => {
    setPrerequisite(next)
    patchDraft(current => {
      const rawDraft = current.cardJson._draft && typeof current.cardJson._draft === 'object'
        ? current.cardJson._draft as Record<string, unknown>
        : {}
      return {
        ...current,
        cardJson: {
          ...current.cardJson,
          prerequisite: next || undefined,
          _draft: {
            ...rawDraft,
            prerequisite: next || undefined,
            costInput: costInput || undefined,
          },
        },
      }
    })
  }

  const updateCost = (next: string) => {
    setCostInput(next)
    patchDraft(current => {
      const rawDraft = current.cardJson._draft && typeof current.cardJson._draft === 'object'
        ? current.cardJson._draft as Record<string, unknown>
        : {}
      return {
        ...current,
        cardJson: {
          ...current.cardJson,
          cost: parseWorkshopCostInput(next),
          _draft: {
            ...rawDraft,
            prerequisite: prerequisite || undefined,
            costInput: next || undefined,
          },
        },
      }
    })
  }

  const updateLocales = (next: Record<string, CardLocaleEntry>) => {
    setCardLocales(next)
    patchDraft(current => ({
      ...current,
      cardJson: { ...current.cardJson, locales: next },
    }))
  }

  const completeArtCandidate = async (candidate: ArtCandidate) => {
    dispatch({ type: 'candidateCompleted', candidate })
    await checkpoint()
  }

  const completeAbilityCandidate = async (candidate: AbilityCandidate) => {
    dispatch({ type: 'candidateCompleted', candidate })
    await checkpoint()
  }

  const discardCandidate = async (
    kind: 'art' | 'ability',
    candidateId: string,
  ) => {
    dispatch({ type: 'candidateDiscarded', kind, candidateId })
    await checkpoint()
  }

  const validateAbilityCandidate = async (
    candidateId: string,
    validation: AbilityCandidate['validation'],
    fingerprint: string,
  ) => {
    dispatch({ type: 'abilityCandidateValidated', candidateId, validation, sourceFingerprint: fingerprint })
    await checkpoint()
  }

  const adoptCandidate = async (candidate: ArtCandidate | AbilityCandidate) => {
    if (
      candidate.stale
      && !window.confirm(locale === 'zh'
        ? '这个候选基于旧草稿生成。仍要采用吗？'
        : 'This candidate was generated from an older draft. Adopt it anyway?')
    ) return
    if (await adoptDraftCandidate(candidate)) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus())
    }
  }

  const handleStageChange = async (stage: WorkshopStage) => {
    if (workspaceState) {
      await changeStage(stage)
      return
    }
    setPendingStage(stage)
    if (!currentCardDbId) await handleSaveCard()
  }

  const handleClose = async () => {
    if (workspaceState) await checkpoint()
    onClose()
  }

  const handleSwitchDraft = async (card: ApiCard) => {
    if (workspaceState) await checkpoint()
    handleLoadCard(card)
  }

  const handleResolveConflict = async (choice: 'server' | 'local') => {
    if (await resolveConflict(choice)) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus())
    }
  }

  const handlePublishAndStartSandbox = async () => {
    if (!onAddToSandboxAndRestart || !currentCardDbId || !workspaceState) return
    setSaving(true)
    setError('')
    try {
      const versionId = await pinDraftVersion()
      if (!versionId) return
      updateSession({ sandboxTestVersionId: undefined })
      setSandboxConfirmation(false)
      setRuntimeSandboxErrors(null)
      if (await onAddToSandboxAndRestart(currentCardDbId, versionId)) {
        updateSession({ sandboxTestVersionId: versionId })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmSandboxPass = async () => {
    const versionId = workspaceState?.session.sandboxTestVersionId
    if (!versionId || !sandboxConfirmation) return
    setSaving(true)
    setError('')
    try {
      const response = await workshopApiFetch('/api/game/state')
      const payload = await response.json() as {
        cardWarnings?: unknown
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`)
      }
      const errors = Array.isArray(payload.cardWarnings)
        ? payload.cardWarnings.filter((value): value is string => typeof value === 'string')
        : []
      setRuntimeSandboxErrors(errors.length > 0 ? errors : null)
      if (errors.length > 0) return
      await confirmSandboxPass(versionId, errors)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
      setSandboxConfirmation(false)
    }
  }

  const loadVersionHistory = useCallback(async () => {
    if (!currentCardDbId) return
    setVersionsLoading(true)
    setVersionsError('')
    try {
      const response = await workshopApiFetch(
        `/api/workshop/cards/${encodeURIComponent(currentCardDbId)}/versions`,
      )
      const payload = await response.json() as {
        ok?: boolean
        versions?: WorkshopDraftVersion[]
        error?: string
      }
      if (!response.ok || !payload.ok || !Array.isArray(payload.versions)) {
        setVersions([])
        setVersionsError(payload.error ?? (locale === 'zh'
          ? '版本历史加载失败'
          : 'Could not load version history'))
        return
      }
      setVersions(payload.versions)
    } catch (reason) {
      setVersions([])
      setVersionsError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setVersionsLoading(false)
    }
  }, [currentCardDbId, locale, workshopApiFetch])

  const handleRestoreVersion = async (versionId: string) => {
    setSaving(true)
    setError('')
    const restored = await restoreVersion(versionId)
    setSaving(false)
    if (restored) await loadVersionHistory()
  }

  const handleUndoRestore = async () => {
    setSaving(true)
    setError('')
    await undoRestore()
    setSaving(false)
  }

  const localizationReady = isLocaleEntryComplete(cardLocales.zh)
  const metadataReady = Boolean(cardName.trim() && isValidCardId(cardIdInput.trim(), locale).valid)
  const handoffInputsReady = Boolean(
    metadataReady
    && artUrl
    && extracted?.sourceCode
    && localizationReady
  )
  const handoffReady = Boolean(
    handoffInputsReady
    && workspaceState?.sandboxPassVersionId
  )
  const readiness: Record<WorkshopStage, boolean> = {
    metadata: metadataReady,
    art: Boolean(artUrl),
    ability: Boolean(extracted?.sourceCode),
    localization: localizationReady,
    validation: handoffReady,
  }
  const activeStage = workspaceState?.stage ?? 'metadata'
  const activeStageIndex = WORKSHOP_STAGES.indexOf(activeStage)

  useEffect(() => {
    if (activeStage === 'validation' && currentCardDbId && !controllerLoading) {
      void loadVersionHistory()
    }
  }, [
    activeStage,
    controllerLoading,
    currentCardDbId,
    loadVersionHistory,
    workspaceState?.baseRevision,
  ])

  const stageCopy: Record<WorkshopStage, { label: string; helper: string }> = locale === 'zh'
    ? {
        metadata: { label: '基础信息', helper: '名称、类型与卡牌 ID' },
        art: { label: '卡面图', helper: '主题、参考图与候选' },
        ability: { label: '卡牌能力', helper: '对话、源码与验证' },
        localization: { label: '本地化', helper: '补齐中英文案' },
        validation: { label: '验证与交付', helper: '沙盒测试和发布检查' },
      }
    : {
        metadata: { label: 'Card details', helper: 'Name, type, and card ID' },
        art: { label: 'Card art', helper: 'Subject, references, and candidates' },
        ability: { label: 'Card ability', helper: 'Conversation, source, and validation' },
        localization: { label: 'Localization', helper: 'Complete Chinese and English copy' },
        validation: { label: 'Validate & hand off', helper: 'Sandbox test and publish checks' },
      }
  const syncedTime = controllerState?.save.savedAt
    ? new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(controllerState.save.savedAt)
    : null
  const liveEditBlocked = controllerState?.save.errorCode === 'live_edit_blocked'
  const saveStatus = saving || controllerState?.save.status === 'saving'
    ? (locale === 'zh' ? '正在保存' : 'Saving')
    : !currentCardDbId
      ? (locale === 'zh' ? '尚未创建' : 'Not created')
    : controllerState?.save.status === 'dirty'
      ? (locale === 'zh' ? '有未保存修改' : 'Unsaved changes')
      : controllerState?.save.status === 'offline'
        ? (locale === 'zh' ? '离线，已保存在本机' : 'Offline, saved locally')
        : controllerState?.save.status === 'error'
          ? liveEditBlocked
            ? (locale === 'zh' ? '请先下架' : 'Unpublish to edit')
            : (locale === 'zh' ? '同步失败' : 'Sync failed')
        : controllerState?.save.status === 'conflict'
          ? (locale === 'zh' ? '需要选择草稿版本' : 'Draft choice required')
          : syncedTime
            ? (locale === 'zh' ? `已同步 ${syncedTime}` : `Synced ${syncedTime}`)
            : (locale === 'zh' ? '已同步' : 'Synced')
  const descriptionLines = extracted?.card.desc ?? []
  const liveCardId = cardIdInput || 'CUSTOM_'
  const handleCopyLiveCardId = async () => {
    let copied = false
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(liveCardId)
      copied = true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = liveCardId
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      } finally {
        textarea.remove()
      }
    }
    if (!copied) return
    setCardIdCopied(true)
    setTimeout(() => setCardIdCopied(false), 1500)
  }
  const liveCardMeta: CardMeta = {
    id: liveCardId,
    name: cardLocales[locale]?.name || cardName || (locale === 'zh' ? '未命名卡牌' : 'Untitled card'),
    deck: 'CUSTOM',
    number: 0,
    type: cardType,
    locales: cardLocales,
    rules: extracted?.card.rules,
    desc: descriptionLines.length > 0
      ? descriptionLines
      : [locale === 'zh' ? '能力说明会在采用代码后显示。' : 'Ability text appears after code is adopted.'],
    cost: parseWorkshopCostInput(costInput),
    prerequisite: prerequisite || undefined,
    vp: extracted?.card.vp ?? 0,
  }

  return (
    <div className="ai-designer aicw-shell">
      <header className="aicw-header">
        <div ref={workspaceHeadingRef} className="aicw-heading" tabIndex={-1}>
          <span>{locale === 'zh' ? '卡牌工坊 / AI 卡牌设计师' : 'Card Workshop / AI Card Designer'}</span>
          <div>
            <h2>{cardName || (locale === 'zh' ? '新卡牌草稿' : 'New card draft')}</h2>
            <span className="aicw-draft-badge">
              {workspaceState?.reviewStatus === 'merged'
                ? (locale === 'zh' ? '已收录（只读）' : 'Merged (read-only)')
                : workspaceState?.live
                  ? (locale === 'zh' ? '已上线' : 'Live')
                  : workspaceState?.reviewStatus === 'approved'
                    ? (locale === 'zh' ? '已过审' : 'Approved')
                    : (locale === 'zh' ? '草稿' : 'Draft')}
            </span>
            {workspaceState?.reviewStatus === 'approved' && !workspaceState.live && (
              <button
                type="button"
                className="aicw-button aicw-button-primary"
                onClick={() => { void publishDraft() }}
                disabled={saving}
              >
                {locale === 'zh' ? '发布上线' : 'Publish live'}
              </button>
            )}
            {workspaceState?.live && workspaceState.reviewStatus !== 'merged' && (
              <button
                type="button"
                className="aicw-button"
                onClick={() => { void unpublishDraft() }}
                disabled={saving}
              >
                {locale === 'zh' ? '下架' : 'Unpublish'}
              </button>
            )}
          </div>
          <code>{cardIdInput || 'CUSTOM_'}</code>
        </div>
        <div className="aicw-header-actions">
          <span className={`aicw-save-state is-${controllerState?.save.status ?? 'saved'}`} aria-live="polite">
            {saveStatus}
          </span>
          <button
            type="button"
            className={`aicw-button aicw-button-primary${saveSuccess ? ' is-success' : ''}`}
            onClick={() => { void handleSaveCard() }}
            disabled={saving || workspaceState?.reviewStatus === 'merged' || Boolean(currentCardDbId && controllerLoading)}
          >
            {saveSuccess
              ? (locale === 'zh' ? '已保存' : 'Saved')
              : (locale === 'zh' ? '保存草稿' : 'Save draft')}
          </button>
          <button type="button" className="aicw-button" onClick={() => { void handleClose() }}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </header>

      <div className="ai-designer-config-section">
        <Section
          collapsible
          defaultCollapsed={Boolean(abilityConfig && artConfig)}
          locale={locale}
          icon=""
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
                onConfigured={() => {
                  setArtConfig(getLlmConfig(KEY_LLM_CONFIG_ART))
                }}
                onClear={() => {
                  setArtConfig(null)
                }}
              />
            </div>
            <div className="ai-config-grid-col">
              <h4 className="ai-config-grid-heading">{t('platform.aiConfigAbilityHeading')}</h4>
              <ConfigBar
                capability="chat"
                config={abilityConfig}
                onConfigured={() => {
                  setAbilityConfig(getLlmConfig())
                }}
                onClear={() => {
                  setAbilityConfig(null)
                }}
              />
            </div>
          </div>
        </Section>
      </div>

      {myCards.length > 0 && (
        <div className="aicw-design-picker">
          <label htmlFor="aicw-card-picker">{locale === 'zh' ? '切换草稿' : 'Switch draft'}</label>
          <select
            id="aicw-card-picker"
            value={currentCardDbId ?? ''}
            onChange={event => {
              const card = myCards.find(item => item.id === event.target.value)
              if (card) void handleSwitchDraft(card)
            }}
          >
            <option value="">{locale === 'zh' ? '选择已有卡牌' : 'Select a saved card'}</option>
            {myCards.map(card => (
              <option key={card.id} value={card.id}>
                {card.name} · {card.card_type === 'minor'
                  ? (locale === 'zh' ? '小改良' : 'Minor')
                  : (locale === 'zh' ? '职业' : 'Occupation')}
              </option>
            ))}
          </select>
        </div>
      )}

      {controllerState?.conflict && (
        <section className="aicw-conflict" role="alert">
          <div>
            <strong>{locale === 'zh' ? '服务器上已有更新' : 'The server draft changed'}</strong>
            <span>
              {locale === 'zh'
                ? '请选择保留服务器整份草稿，或用本机整份草稿覆盖后继续。'
                : 'Keep the complete server draft, or retry with the complete local draft.'}
            </span>
          </div>
          <div>
            <button type="button" className="aicw-button" onClick={() => { void handleResolveConflict('server') }}>
              {locale === 'zh' ? '使用服务器草稿' : 'Use server draft'}
            </button>
            <button
              type="button"
              className="aicw-button aicw-button-primary"
              onClick={() => {
                if (window.confirm(locale === 'zh'
                  ? '确认用本机整份草稿覆盖服务器版本？'
                  : 'Replace the complete server draft with this local draft?')) {
                  void handleResolveConflict('local')
                }
              }}
            >
              {locale === 'zh' ? '保留本机草稿' : 'Keep local draft'}
            </button>
          </div>
        </section>
      )}

      {(controllerError || controllerState?.save.status === 'offline' || controllerState?.save.status === 'error') && (
        <section
          ref={recoveryRef}
          className="aicw-recovery"
          role="alert"
          tabIndex={-1}
        >
          <span>
            {controllerError
              ?? (liveEditBlocked
                ? (locale === 'zh'
                    ? '卡牌已上线，请先下架后继续编辑。未保存的修改已保存在本机。'
                    : 'This card is live. Unpublish it to continue editing. Unsaved changes are saved on this device.')
                : controllerState?.save.error
                  ?? (locale === 'zh' ? '修改已保存在本机。' : 'Changes are saved on this device.'))}
          </span>
          {controllerState && (
            <button
              type="button"
              className="aicw-button"
              onClick={() => { void (liveEditBlocked ? unpublishDraft() : retryCheckpoint()) }}
              disabled={saving}
            >
              {liveEditBlocked
                ? (locale === 'zh' ? '下架后继续编辑' : 'Unpublish to continue editing')
                : (locale === 'zh' ? '重试保存' : 'Retry save')}
            </button>
          )}
        </section>
      )}

      <main className="aicw-layout">
        <aside className="aicw-preview-pane">
          <div className="aicw-section-heading">
            <span>{locale === 'zh' ? '实时卡牌' : 'Live card'}</span>
            <small>{locale === 'zh' ? '当前已采用草稿' : 'Current adopted draft'}</small>
          </div>
          <PlayerCard
            locale={locale}
            cardId={liveCardId}
            cardType={cardType}
            cardMeta={liveCardMeta}
            artUrl={artUrl}
            className="aicw-live-card"
          />
          <div className="aicw-live-card-id">
            <span>
              <small>{locale === 'zh' ? '卡牌 ID' : 'Card ID'}</small>
              <code>{liveCardId}</code>
            </span>
            <button
              type="button"
              className="aicw-button"
              onClick={() => { void handleCopyLiveCardId() }}
              disabled={!isValidCardId(liveCardId, locale).valid}
              aria-live="polite"
            >
              {cardIdCopied ? t('ui.cardCopied') : t('ui.cardCopy')}
            </button>
          </div>
          <div className="aicw-readiness" aria-label={locale === 'zh' ? '草稿完整度' : 'Draft completeness'}>
            {WORKSHOP_STAGES.slice(0, 4).map(stage => (
              <div key={stage}>
                <span className={readiness[stage] ? 'is-ready' : ''} aria-hidden="true" />
                <strong>{stageCopy[stage].label}</strong>
                <small>{readiness[stage]
                  ? (locale === 'zh' ? '已就绪' : 'Ready')
                  : (locale === 'zh' ? '待完成' : 'Incomplete')}</small>
              </div>
            ))}
          </div>
        </aside>

        <section className="aicw-workspace">
          <nav className="aicw-stage-rail" aria-label={locale === 'zh' ? '设计阶段' : 'Design stages'}>
            <span className="aicw-stage-title">{locale === 'zh' ? '设计阶段' : 'Design stages'}</span>
            {WORKSHOP_STAGES.map((stage, index) => (
              <button
                type="button"
                key={stage}
                className={activeStage === stage ? 'is-active' : ''}
                aria-current={activeStage === stage ? 'step' : undefined}
                onClick={() => { void handleStageChange(stage) }}
              >
                <span className={`aicw-stage-marker${readiness[stage] ? ' is-ready' : ''}`}>
                  {readiness[stage] ? '✓' : index + 1}
                </span>
                <span>
                  <strong>{stageCopy[stage].label}</strong>
                  <small>{stageCopy[stage].helper}</small>
                </span>
              </button>
            ))}
            <div className="aicw-stage-progress">
              <span>{locale === 'zh' ? '当前步骤' : 'Current step'}</span>
              <strong>{activeStageIndex + 1} / {WORKSHOP_STAGES.length}</strong>
            </div>
          </nav>

          <div className="aicw-stage-content" key={activeStage}>
            <div className="aicw-stage-heading">
              <div>
                <span>{locale === 'zh' ? '当前任务' : 'Current task'}</span>
                <h2>{stageCopy[activeStage].label}</h2>
                <p>{stageCopy[activeStage].helper}</p>
              </div>
              <span className={`aicw-status-tag${readiness[activeStage] ? ' is-ready' : ''}`}>
                {readiness[activeStage]
                  ? (locale === 'zh' ? '已就绪' : 'Ready')
                  : (locale === 'zh' ? '进行中' : 'In progress')}
              </span>
            </div>

            {currentCardDbId && controllerLoading && (
              <div className="aicw-loading" role="status">
                {locale === 'zh' ? '正在恢复草稿…' : 'Restoring draft…'}
              </div>
            )}

            {!controllerLoading && activeStage === 'metadata' && (
              <div className="aicw-metadata">
                <fieldset>
                  <legend>{locale === 'zh' ? '卡牌类型' : 'Card type'}</legend>
                  <div className="ai-card-type-toggle">
                    <button type="button" className={`ai-type-btn${cardType === 'minor' ? ' active' : ''}`} onClick={() => updateCardType('minor')}>
                      {locale === 'zh' ? '小改良' : 'Minor improvement'}
                    </button>
                    <button type="button" className={`ai-type-btn${cardType === 'occupation' ? ' active' : ''}`} onClick={() => updateCardType('occupation')}>
                      {locale === 'zh' ? '职业' : 'Occupation'}
                    </button>
                  </div>
                </fieldset>
                <label>
                  <span>{locale === 'zh' ? '英文卡牌名' : 'Card name'}</span>
                  <input
                    ref={cardNameRef}
                    type="text"
                    value={cardName}
                    onChange={event => updateCardName(event.target.value)}
                    placeholder={locale === 'zh' ? '例如 Medieval Mallet' : 'e.g. Medieval Mallet'}
                    aria-invalid={metadataValidationAttempted && !cardName.trim()}
                    aria-describedby={metadataValidationAttempted && !cardName.trim()
                      ? 'aicw-card-name-error'
                      : undefined}
                  />
                  {metadataValidationAttempted && !cardName.trim() && (
                    <small id="aicw-card-name-error" className="form-error" role="alert">
                      {locale === 'zh' ? '请输入卡牌名称' : 'Enter a card name'}
                    </small>
                  )}
                </label>
                <label>
                  <span>{locale === 'zh' ? '卡牌 ID' : 'Card ID'}</span>
                  <input
                    ref={cardIdRef}
                    type="text"
                    className="aicw-code-input"
                    value={cardIdInput}
                    onChange={event => updateCardId(event.target.value)}
                    placeholder="CUSTOM_MedievalMallet"
                    aria-invalid={cardIdInput ? !isValidCardId(cardIdInput, locale).valid : undefined}
                    aria-describedby={cardIdInput && !isValidCardId(cardIdInput, locale).valid
                      ? 'aicw-card-id-error'
                      : undefined}
                  />
                  {cardIdInput && !isValidCardId(cardIdInput, locale).valid && (
                    <small id="aicw-card-id-error" className="form-error" role="alert">
                      {isValidCardId(cardIdInput, locale).reason}
                    </small>
                  )}
                </label>
                {cardType === 'minor' && (
                  <div className="aicw-field-row">
                    <label>
                      <span>{t('platform.prerequisite')}</span>
                      <input id="ai-prerequisite-input" type="text" value={prerequisite} onChange={event => updatePrerequisite(event.target.value)} placeholder={locale === 'zh' ? '可选，如：2 个职业' : 'Optional, e.g. 2 occupations'} />
                    </label>
                    <label>
                      <span>{t('platform.cost')}</span>
                      <input id="ai-cost-input" type="text" value={costInput} onChange={event => updateCost(event.target.value)} placeholder={locale === 'zh' ? '可选，如：1 木 2 黏土' : 'Optional, e.g. 1 wood 2 clay'} />
                    </label>
                  </div>
                )}
                <div className="aicw-inline-actions">
                  <span>{locale === 'zh' ? '保存后即可进入图片、能力和本地化步骤。' : 'Save once to unlock the remaining design stages.'}</span>
                  <button type="button" className="aicw-button aicw-button-primary" disabled={!metadataReady || saving} onClick={() => { void handleStageChange('art') }}>
                    {locale === 'zh' ? '保存并继续到卡面图' : 'Save and continue to art'}
                  </button>
                </div>
              </div>
            )}

            {!controllerLoading && activeStage === 'art' && (
              <ArtPanel
                cardType={cardType}
                cardName={cardName}
                artUrl={artUrl}
                artSubject={workspaceState?.session.artSubject ?? ''}
                candidates={workspaceState?.session.artCandidates ?? []}
                selectedCandidateId={workspaceState?.session.selectedArtCandidateId}
                baseRevision={workspaceState?.baseRevision ?? 0}
                refCache={refCache}
                apiFetch={workshopApiFetch}
                onSubjectChange={artSubject => updateSession({ artSubject })}
                onCandidateCompleted={completeArtCandidate}
                onCandidateSelected={candidateId => updateSession({
                  selectedArtCandidateId: candidateId,
                })}
                onCandidateDiscarded={candidateId => discardCandidate('art', candidateId)}
                onCandidateAdopted={adoptCandidate}
              />
            )}

            {!controllerLoading && activeStage === 'ability' && (
              <AbilityPanel
                cardId={cardIdInput}
                cardType={cardType}
                cardName={cardName}
                prerequisite={prerequisite}
                costHint={costInput}
                extracted={extracted}
                input={workspaceState?.session.abilityInput ?? ''}
                messages={(workspaceState?.session.abilityMessages ?? []) as DisplayMessage[]}
                candidates={workspaceState?.session.abilityCandidates ?? []}
                selectedCandidateId={workspaceState?.session.selectedAbilityCandidateId}
                baseRevision={workspaceState?.baseRevision ?? 0}
                apiFetch={workshopApiFetch}
                onInputChange={input => updateSession({ abilityInput: input })}
                onMessagesChange={messages => updateSession({ abilityMessages: messages })}
                onCandidateCompleted={completeAbilityCandidate}
                onCandidateSelected={candidateId => updateSession({
                  selectedAbilityCandidateId: candidateId,
                })}
                onCandidateEdited={(candidateId, sourceCode) => dispatch({
                  type: 'abilityCandidateEdited',
                  candidateId,
                  sourceCode,
                  cardJson: extractCardFromResponse(
                    `\`\`\`typescript\n${sourceCode}\n\`\`\``,
                  )?.card,
                })}
                onCandidateValidated={validateAbilityCandidate}
                onCandidateDiscarded={candidateId => discardCandidate('ability', candidateId)}
                onCandidateAdopted={adoptCandidate}
                sandboxErrors={sandboxGateErrors}
                validationErrors={validationErrors}
                onValidationErrorsConsumed={() => setValidationErrors(null)}
              />
            )}

            {!controllerLoading && activeStage === 'localization' && (
              <div className="aicw-localization">
                <div>
                  <strong>{localizationReady
                    ? (locale === 'zh' ? '中文本地化已完整' : 'Chinese localization is complete')
                    : (locale === 'zh' ? '中文本地化尚未完成' : 'Chinese localization is incomplete')}</strong>
                  <p>{locale === 'zh' ? '英文原文保留在卡牌定义中；提交社区 PR 前必须补齐中文名称与说明。' : 'English stays in the card definition; Chinese name and description are required before handoff.'}</p>
                </div>
                <button type="button" className="aicw-button aicw-button-primary" onClick={() => setShowLocalizationModal(true)} disabled={!cardName.trim()}>
                  {localizationReady
                    ? (locale === 'zh' ? '检查本地化' : 'Review localization')
                    : (locale === 'zh' ? '开始本地化' : 'Start localization')}
                </button>
              </div>
            )}

            {!controllerLoading && activeStage === 'validation' && (
              <div className="aicw-validation">
                <ul>
                  {WORKSHOP_STAGES.slice(0, 4).map(stage => (
                    <li key={stage} className={readiness[stage] ? 'is-ready' : ''}>
                      <span aria-hidden="true">{readiness[stage] ? '✓' : '–'}</span>
                      <div>
                        <strong>{stageCopy[stage].label}</strong>
                        <small>{readiness[stage]
                          ? (locale === 'zh' ? '已完成' : 'Complete')
                          : stageCopy[stage].helper}</small>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="aicw-version-gate">
                  <div>
                    <span>{locale === 'zh' ? '已过审版本' : 'Approved version'}</span>
                    <strong>{workspaceState?.approvedVersionId
                      ? workspaceState.approvedVersionId.slice(0, 12)
                      : (locale === 'zh' ? '尚未过审' : 'Not approved yet')}</strong>
                  </div>
                  <div>
                    <span>{locale === 'zh' ? '同版本沙盒确认' : 'Same-version sandbox pass'}</span>
                    <strong>{handoffReady
                      ? (locale === 'zh' ? '已满足社区 PR 交接门槛' : 'Community PR gate satisfied')
                      : (locale === 'zh' ? '尚未确认' : 'Not confirmed')}</strong>
                  </div>
                </div>
                <section className="aicw-version-history" aria-labelledby="aicw-version-history-title">
                  <div className="aicw-version-history-heading">
                    <div>
                      <span>{locale === 'zh' ? '不可变快照' : 'Immutable snapshots'}</span>
                      <h3 id="aicw-version-history-title">
                        {locale === 'zh' ? '版本历史' : 'Version history'}
                      </h3>
                    </div>
                    {workspaceState?.session.restoreUndoDraft && (
                      <button
                        type="button"
                        className="aicw-button"
                        onClick={() => { void handleUndoRestore() }}
                        disabled={saving}
                      >
                        {locale === 'zh' ? '撤销恢复' : 'Undo restore'}
                      </button>
                    )}
                  </div>
                  {versionsLoading ? (
                    <div className="aicw-version-message" role="status">
                      {locale === 'zh' ? '正在加载版本…' : 'Loading versions…'}
                    </div>
                  ) : versionsError ? (
                    <div className="aicw-version-message is-error" role="alert">
                      <span>{versionsError}</span>
                      <button type="button" className="aicw-button" onClick={() => { void loadVersionHistory() }}>
                        {locale === 'zh' ? '重试' : 'Retry'}
                      </button>
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="aicw-version-message">
                      {locale === 'zh'
                        ? '采用候选或发布后，版本会出现在这里。'
                        : 'Versions appear here after adopting a candidate or publishing.'}
                    </div>
                  ) : (
                    <ol>
                      {versions.map(version => (
                        <li key={version.id}>
                          <div>
                            <strong>
                              {locale === 'zh'
                                ? `版本 ${version.version_number}`
                                : `Version ${version.version_number}`}
                            </strong>
                            <span>
                              {typeof version.card_json.name === 'string'
                                ? version.card_json.name
                                : version.id.slice(0, 12)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="aicw-button"
                            onClick={() => { void handleRestoreVersion(version.id) }}
                            disabled={saving}
                            aria-label={locale === 'zh'
                              ? `恢复版本 ${version.version_number}`
                              : `Restore version ${version.version_number}`}
                          >
                            {locale === 'zh' ? '恢复' : 'Restore'}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <div className="aicw-handoff">
                  <div>
                    <strong>{locale === 'zh' ? '下一步：固定版本沙盒测试' : 'Next: sandbox-test a fixed version'}</strong>
                    <span>{locale === 'zh' ? '固化会锁定当前内容；沙盒只加载这个不可变版本。' : 'Pinning locks the current content; the sandbox loads only that immutable version.'}</span>
                  </div>
                  <div>
                    <button type="button" className="aicw-button" onClick={() => { void handleSaveCard() }} disabled={saving || !metadataReady}>
                      {locale === 'zh' ? '保存检查点' : 'Save checkpoint'}
                    </button>
                    {onAddToSandboxAndRestart && (
                      <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void handlePublishAndStartSandbox() }} disabled={saving || !workspaceState || !handoffInputsReady}>
                        {locale === 'zh' ? '固化当前版本并启动沙盒' : 'Pin current version and start sandbox'}
                      </button>
                    )}
                  </div>
                </div>
                {workspaceState?.session.sandboxTestVersionId && !handoffReady && (
                  <div className="aicw-sandbox-confirm">
                    <label>
                      <input
                        type="checkbox"
                        checked={sandboxConfirmation}
                        onChange={event => setSandboxConfirmation(event.target.checked)}
                        disabled={Boolean(sandboxGateErrors?.length)}
                      />
                      <span>{locale === 'zh'
                        ? '我确认这个固定版本在沙盒中没有运行错误'
                        : 'I confirm this pinned version has no sandbox runtime errors'}</span>
                    </label>
                    {sandboxGateErrors?.length
                      ? <small>{locale === 'zh' ? '先修复已知沙盒错误并重新固化。' : 'Fix known sandbox errors and publish again first.'}</small>
                      : null}
                    <button
                      type="button"
                      className="aicw-button aicw-button-primary"
                      onClick={() => { void handleConfirmSandboxPass() }}
                      disabled={!sandboxConfirmation || saving}
                    >
                      {locale === 'zh' ? '确认沙盒通过' : 'Confirm sandbox pass'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <footer className="aicw-stage-footer">
              <span>{activeStageIndex + 1} / {WORKSHOP_STAGES.length} · {stageCopy[activeStage].label}</span>
              {activeStageIndex < WORKSHOP_STAGES.length - 1 && (
                <button type="button" className="aicw-button" onClick={() => { void handleStageChange(WORKSHOP_STAGES[activeStageIndex + 1]!) }}>
                  {locale === 'zh' ? '下一阶段' : 'Next stage'}
                </button>
              )}
            </footer>
          </div>
        </section>
      </main>

      {showLocalizationModal && (
        <LocalizationModal
          currentContent={pickLocalizationCurrentContent({
            cardLocales,
            cardName,
            prerequisite,
            extractedName: extracted?.card.name,
            extractedDesc: extracted?.card.desc,
            extractedPrerequisite: extracted?.card.prerequisite,
          })}
          currentLang="en"
          locales={cardLocales}
          onSave={(updatedLocales) => {
            updateLocales(updatedLocales)
            setShowLocalizationModal(false)
          }}
          onClose={() => setShowLocalizationModal(false)}
        />
      )}
      {error && (
        <div
          ref={errorRef}
          className="form-error ai-error"
          role="alert"
          tabIndex={-1}
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
