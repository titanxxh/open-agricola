import type { ReactNode } from 'react'
import type { EncyclopediaFace as EncyclopediaFaceRef } from '../../../shared/contract/card-encyclopedia'
import type { Locale } from '../../../shared/i18n'
import { getParentCardDefinition, type ParentCardId } from '../../../shared/parents'
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
  /** When this image fails to load, the entry shows its text face instead. */
  artUrl?: (face: FaceOf<K>) => string | undefined
  render: (props: { face: FaceOf<K>; item: EncyclopediaItem; locale: Locale }) => ReactNode
}

const textFace = ({ item, locale }: { item: EncyclopediaItem; locale: Locale }) =>
  <EncyclopediaTextFace item={item} locale={locale} />

const FACE_VIEWS: { readonly [K in FaceKind]: FaceView<K> } = {
  card: {
    artUrl: ({ cardId, cardType }) => {
      const path = officialCardArtPath(cardId, cardType)
      return path ? publicAssetUrl(path) : undefined
    },
    render: ({ face, item, locale }) => getCardMeta(face.cardId)
      ? <PlayerCard locale={locale} cardId={face.cardId} cardType={face.cardType} enablePreview={false} className="encyclopedia-face__card" />
      : textFace({ item, locale }),
  },
  parent: {
    artUrl: ({ parentId }) => {
      const card = getParentCardDefinition(parentId as ParentCardId)
      return card ? resolveParentCardAssetUrls(card.assets).portraitUrl : undefined
    },
    render: ({ face, item, locale }) => getParentCardDefinition(face.parentId as ParentCardId)
      ? <ParentCardFace id={face.parentId as ParentCardId} locale={locale} />
      : textFace({ item, locale }),
  },
  moorSpecialAction: { render: textFace },
  moorStart: { render: textFace },
  season: { render: textFace },
}

const faceView = <K extends FaceKind>(face: FaceOf<K>): FaceView<K> => FACE_VIEWS[face.kind as K]

export function EncyclopediaFace({ item, locale }: { item: EncyclopediaItem; locale: Locale }) {
  const face = item.entry.face
  const view = faceView(face)
  const status = useImageStatus(view.artUrl?.(face))
  if (status === 'failed') return <EncyclopediaTextFace item={item} locale={locale} imageMissing />
  return view.render({ face, item, locale })
}
