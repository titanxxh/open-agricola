import type { ReactNode } from 'react'
import { parseScanText, type ScanInline, type ScanParagraph } from '../../../shared/scan-cards/text'
import { publicAssetUrl } from '../../utils/public-asset-url'

const inline = (parts: readonly ScanInline[], prefix: string): ReactNode[] =>
  parts.map((part, index) => {
    const key = `${prefix}-${index}`
    if (part.kind === 'break') return <br key={key} />
    if (part.kind === 'art') {
      return <img key={key} className="scan-text__art scan-text__art--end" src={publicAssetUrl(part.src)} style={{ width: part.width }} alt="" />
    }
    if (part.kind === 'icon') {
      if (part.name === 'arrow') return <span key={key} className="scan-text__arrow">→</span>
      if (part.name === 'arrow-2x') {
        return (
          <span key={key} className="scan-text__times">
            <span className="scan-text__times-label">2x</span>
            <span className="scan-text__arrow">→</span>
          </span>
        )
      }
      const sown = part.name === 'field-grain' ? 'grain' : part.name === 'field-vegetable' ? 'vegetable' : ''
      if (sown) {
        return (
          <span key={key} className="scan-text__sown">
            <span className="res-icon res-icon-field" />
            <span className={`res-icon res-icon-${sown} scan-text__sown-crop`} />
          </span>
        )
      }
      return <span key={key} className={`scan-text__icon res-icon res-icon-${part.name}`} />
    }
    const className = [part.italic ? 'scan-text__i' : '', part.smallCaps ? 'scan-text__sc' : ''].filter(Boolean).join(' ')
    return className ? <span key={key} className={className}>{part.text}</span> : part.text
  })

const linesOf = (parts: readonly ScanInline[]): ScanInline[][] => {
  const lines: ScanInline[][] = [[]]
  for (const part of parts) {
    if (part.kind === 'break') lines.push([])
    else lines[lines.length - 1].push(part)
  }
  return lines.filter((line) => line.length > 0)
}

const blank = (part: ScanInline | undefined) => part?.kind === 'text' && part.text.trim() === ''

const pileLine = (line: readonly ScanInline[], key: string): ReactNode[] => {
  const nodes: ReactNode[] = []
  for (let i = 0; i < line.length; i++) {
    const part = line[i]
    let iconAt = i + 1
    while (blank(line[iconAt])) iconAt++
    const icon = line[iconAt]
    if (part.kind === 'text' && part.smallCaps && /^\d+$/.test(part.text.trim()) && icon?.kind === 'icon') {
      nodes.push(
        <span key={`${key}-n${i}`} className={`scan-text__labeled res-icon res-icon-${icon.name}`}>{part.text.trim()}</span>,
      )
      i = iconAt
      continue
    }
    if (blank(part)) continue
    const node = inline([part], `${key}-${i}`)[0]
    nodes.push(typeof node === 'string' ? <span key={`${key}-t${i}`} className="scan-text__t">{node}</span> : node)
  }
  return nodes
}

const pile = (block: ScanParagraph, key: string) => (
  <span className="scan-text__pile">
    {linesOf(block.inline).map((line, index) => (
      <span key={`${key}-${index}`} className="scan-text__pile-line">
        {pileLine(line, `${key}-${index}`)}
      </span>
    ))}
  </span>
)

export function ScanText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={['scan-text', className].filter(Boolean).join(' ')}>
      {parseScanText(text).map((block, index) => {
        const key = `b${index}`
        if (block.kind === 'art') {
          return <img key={key} className="scan-text__art" src={publicAssetUrl(block.src)} style={{ width: block.width }} alt="" />
        }
        if (block.kind === 'row') {
          const lead = block.mid && block.inline[0]?.kind === 'icon' && block.inline[0].name === 'arrow'
          const parts = lead ? block.inline.slice(1) : block.inline
          const picture = <img className="scan-text__art" src={publicAssetUrl(block.src)} style={{ width: block.width }} alt="" />
          return (
            <div key={key} className={block.top || block.mid ? 'scan-text__row scan-text__row--top' : 'scan-text__row'}>
              {lead ? <span className="scan-text__pair">{picture}<span className="scan-text__arrow">→</span></span> : picture}
              <p className="scan-text__p">{inline(parts, key)}</p>
            </div>
          )
        }
        if (block.pile) {
          return block.aside ? (
            <div key={key} className="scan-text__lead">
              {pile(block, key)}
              <p className="scan-text__p scan-text__p--left">{pileLine(block.aside, `${key}-side`)}</p>
            </div>
          ) : <span key={key}>{pile(block, key)}</span>
        }
        const modifiers = [
          block.small ? 'scan-text__p--small' : '',
          block.left ? 'scan-text__p--left' : '',
          block.inline.some((part) => part.kind === 'art') ? 'scan-text__p--end' : '',
        ]
        return <p key={key} className={['scan-text__p', ...modifiers].filter(Boolean).join(' ')}>{inline(block.inline, key)}</p>
      })}
    </div>
  )
}
