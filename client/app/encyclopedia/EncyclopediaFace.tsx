import type { ReactNode } from 'react'
import type { EncyclopediaFace as EncyclopediaFaceRef } from '../../../shared/contract/card-encyclopedia'
import type { Locale } from '../../../shared/i18n'
import { getParentCardDefinition, type ParentCardId } from '../../../shared/parents'
import { isMoorSpecialActionId } from '../../../shared/projections/moor-special-actions'
import { SpecialActionCardFace } from '../../components/board/SpecialActionCardFace'
import { specialActionIconArtUrl } from '../../components/board/special-action-art'
import { ParentCardFace } from '../../components/common/ParentCardFace'
import { PlayerCard } from '../../components/common/PlayerCard'
import { officialCardArtPath } from '../../components/common/playerCardArt'
import { getCardMeta } from '../../services/card-meta'
import { resolveParentCardAssetUrls } from '../../services/parent-assets'
import { publicAssetUrl } from '../../utils/public-asset-url'
import type { EncyclopediaItem } from './encyclopedia-item'
import { EncyclopediaTextFace } from './EncyclopediaTextFace'
import { useImageStatus } from './useImageStatus'

type FaceKind = EncyclopediaFaceRef['kind']
type FaceOf<K extends FaceKind> = Extract<EncyclopediaFaceRef, { kind: K }>

type FaceView<K extends FaceKind> = {
  /** Every image the face draws; when any fails to load, the entry shows its text face instead. */
  artUrls?: (face: FaceOf<K>) => readonly string[]
  render: (props: { face: FaceOf<K>; item: EncyclopediaItem; locale: Locale }) => ReactNode
}

const textFace = ({ item, locale }: { item: EncyclopediaItem; locale: Locale }) =>
  <EncyclopediaTextFace item={item} locale={locale} />

const moorActions = (face: FaceOf<'moorSpecialAction'>) => face.actions.filter(isMoorSpecialActionId)

const FACE_VIEWS: { readonly [K in FaceKind]: FaceView<K> } = {
  card: {
    artUrls: ({ cardId, cardType }) => {
      const path = officialCardArtPath(cardId, cardType)
      return path ? [publicAssetUrl(path)] : []
    },
    render: ({ face, item, locale }) => getCardMeta(face.cardId)
      ? <PlayerCard locale={locale} cardId={face.cardId} cardType={face.cardType} enablePreview={false} className="encyclopedia-face__card" />
      : textFace({ item, locale }),
  },
  parent: {
    artUrls: ({ parentId }) => {
      const card = getParentCardDefinition(parentId as ParentCardId)
      return card ? [resolveParentCardAssetUrls(card.assets).portraitUrl] : []
    },
    render: ({ face, item, locale }) => getParentCardDefinition(face.parentId as ParentCardId)
      ? <ParentCardFace id={face.parentId as ParentCardId} locale={locale} />
      : textFace({ item, locale }),
  },
  moorSpecialAction: {
    artUrls: (face) => [...new Set([publicAssetUrl(face.image), ...moorActions(face).map(specialActionIconArtUrl)])],
    render: ({ face, item, locale }) => (
      <div className="encyclopedia-moor-action-face">
        <img className="encyclopedia-moor-action-face__art" src={publicAssetUrl(face.image)} alt="" />
        <SpecialActionCardFace
          className="encyclopedia-moor-action-face__card"
          locale={locale}
          players={item.entry.players && 'counts' in item.entry.players ? item.entry.players.counts : []}
          actions={moorActions(face)}
        />
      </div>
    ),
  },
  moorStart: { render: textFace },
  season: { render: textFace },
}

const faceView = <K extends FaceKind>(face: FaceOf<K>): FaceView<K> => FACE_VIEWS[face.kind as K]

export function EncyclopediaFace({ item, locale }: { item: EncyclopediaItem; locale: Locale }) {
  const face = item.entry.face
  const view = faceView(face)
  const status = useImageStatus(view.artUrls?.(face) ?? [])
  if (status === 'failed') return <EncyclopediaTextFace item={item} locale={locale} imageMissing />
  return view.render({ face, item, locale })
}
