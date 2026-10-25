import { t as translateMessage } from '../../../shared/i18n'
import { useCurrentLocale } from '../../contexts/LocaleContext'
import { useRef, type ReactNode } from 'react'

interface Props {
  title: string
  cards: ReactNode[]
  emptyState?: string
}

export function CardCarousel({ title, cards, emptyState }: Props) {
  const locale = useCurrentLocale()
  const trackRef = useRef<HTMLDivElement>(null)

  function scroll(dir: -1 | 1) {
    trackRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' })
  }

  return (
    <div className="card-carousel">
      <div className="card-carousel__header">
        <h4 className="card-carousel__title">{title}</h4>
        {cards.length > 2 && (
          <div className="card-carousel__nav">
            <button onClick={() => scroll(-1)} aria-label="prev">‹</button>
            <button onClick={() => scroll(1)} aria-label="next">›</button>
          </div>
        )}
      </div>
      {cards.length === 0 ? (
        <p className="card-carousel__empty">{emptyState ?? translateMessage(locale, "ui.copy.client_components_board_CardCarousel_tsx.none_2d0077")}</p>
      ) : (
        <div className="card-carousel__track" ref={trackRef}>
          {cards.map((c, i) => (
            <div key={i} className="card-carousel__item">{c}</div>
          ))}
        </div>
      )}
    </div>
  )
}
