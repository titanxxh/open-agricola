type BrandMarkProps = {
  title: string
  titleAs?: 'h1' | 'h2' | 'div'
  className?: string
  titleClassName?: string
  imageClassName?: string
}

const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`

export function BrandMark({
  title,
  titleAs = 'div',
  className = '',
  titleClassName = '',
  imageClassName = '',
}: BrandMarkProps) {
  const TitleTag = titleAs

  return (
    <div className={`brand-mark ${className}`.trim()}>
      <img
        className={`brand-mark-image ${imageClassName}`.trim()}
        src={BRAND_LOGO_SRC}
        alt="Open Agricola logo"
      />
      <TitleTag className={titleClassName}>{title}</TitleTag>
    </div>
  )
}
