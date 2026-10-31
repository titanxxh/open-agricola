import type { EncyclopediaTerrainTile } from '../../../shared/contract/card-encyclopedia'
import { FARM_COLS, FARM_ROWS } from '../../../shared/domain/farmyard-geometry'
import { t, type Locale } from '../../../shared/i18n'
import { FarmGroundSprite } from '../../components/board/FarmGroundSprite'

const TERRAIN_LABEL_KEYS = { forest: 'ui.tileForest', moor: 'ui.tileMoor' } as const

/** A starting terrain card as the farm it deals: drawn with in-game ground art, or as plain colour blocks without it. */
export function MoorStartLayout({ locale, tiles, art }: {
  locale: Locale
  tiles: readonly EncyclopediaTerrainTile[]
  art: boolean
}) {
  const kindAt = new Map(tiles.map(({ row, col, kind }) => [`${row}:${col}`, kind]))
  return (
    <div
      role="table"
      aria-label={t(locale, 'ui.encyclopedia.moorStart.layout')}
      className={`encyclopedia-moor-start encyclopedia-moor-start--${art ? 'art' : 'plain'}`}
    >
      {Array.from({ length: FARM_ROWS }, (_, row) => (
        <div key={row} role="row" className="encyclopedia-moor-start__row">
          {Array.from({ length: FARM_COLS }, (_, col) => {
            const kind = kindAt.get(`${row}:${col}`)
            const label = kind ? t(locale, TERRAIN_LABEL_KEYS[kind]) : undefined
            return (
              <div
                key={col}
                role="cell"
                aria-label={label}
                title={label}
                className={`encyclopedia-moor-start__tile${kind ? ` encyclopedia-moor-start__tile--${kind}` : ''}`}
              >
                {art ? (
                  <div className="farm-node-background" aria-hidden="true">
                    <FarmGroundSprite terrain={kind} row={row} col={col} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
