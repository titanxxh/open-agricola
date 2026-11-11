import type { CSSProperties, ReactNode } from 'react'
import type { Locale } from '../../../shared/i18n'
import { scanBadgePath, type ScanCategory as ScanCategoryId, type ScanDeck } from '../../../shared/scan-cards'
import { CardWithCopy } from '../common/CardWithCopy'
import { publicAssetUrl } from '../../utils/public-asset-url'

export function ScanBadge({ deck }: { deck: ScanDeck }) {
  return <img className="scan-badge" src={publicAssetUrl(scanBadgePath(deck))} alt="" />
}

export function ScanCategory({ category, style }: { category?: ScanCategoryId; style?: CSSProperties }) {
  if (!category) return null
  return <span className="scan-category" data-category={category} style={style} />
}

export function ScanPortrait({
  locale,
  cardId,
  label,
  layout,
  children,
}: {
  locale: Locale
  cardId: string
  label: string
  layout: string
  children: ReactNode
}) {
  return (
    <CardWithCopy
      locale={locale}
      cardId={cardId}
      enablePreview={false}
      canvasWidth={235}
      className="scan-card"
      data-card-id={cardId}
    >
      <div className="scan-card-inner" data-layout={layout} role="group" aria-label={label.replace(/\s+/g, ' ')}>
        {children}
      </div>
    </CardWithCopy>
  )
}
