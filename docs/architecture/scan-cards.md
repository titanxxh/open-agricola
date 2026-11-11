# Scan card faces

Scanned expansion cards (L and X decks, Legendairy Forest, landscape events, Changelings, Newdale) are drawn rather than pasted. Each face is a frame template assembled from parts, with the card's own illustration and text on top. The encyclopedia is the only consumer ([client](client.md#card-encyclopedia)).

Entry points: `shared/scan-cards/` holds the records, types, text markup and frame part paths. `client/components/scan-cards/` holds one component per template, and `client/styles/scan-cards.css` holds their styles.

## Seam

- `shared/scan-cards/records.ts` holds one display record per printed face (`ScanCard` in `types.ts`). Records are display data with no rules. `layout` picks the template, and `ScanCardFace` dispatches on it.
- `art` is the illustration cut from the print's window alone, transparent outside it, sized to the box the template draws it in. `overlay` is a transparent layer the size of the face for art the print draws past its window; it sits above the frame. `frame` names the template's base part.
- Images live in the public-assets repository under `assets/<set>/<kind>/`. Every path a face paints is listed in `public-assets.required.json`, and `public-assets.ref` pins the assets commit.
- `scanFaceAssets(card)` returns every image a face paints: art, frame, overlay, badge, template parts and the text's inline art. The encyclopedia loads that list before drawing the face and shows the text face when any of them fails.
- Text uses the markup documented in `shared/scan-cards/text.ts` and rendered by `ScanText`. Lines break where the print breaks them.
- Template part paths are the `*_FRAME_PARTS` constants in `shared/scan-cards/index.ts`. Geometry constants in each component are face pixels measured from the prints.

## Face geometry

- Portrait faces are 235 × 374 CSS px (`ScanPortrait`, corner radius 16); landscape events are 420 × 262.5. Positions in components and CSS are in these face pixels.
- A print registered to 940 × 1496 px is 4 px per face pixel. A face shot 235 px wide at device scale 4 therefore overlays it 1:1.

## Frame rules

- Build every frame from parts, the way the official frames are built. Reuse the official slices (`revised/card_frames.jpg`, `revised/action_frame.png`), the official linen (`revised/action_frame_bg.jpg`), `revised/meeples.png` sprites and the deck badges wherever the print's part matches.
- Recolour a reused part with an inline SVG gradient map from its luminance to the print's colours. The offspring and alien artifact templates do this. Do not cut a new copy.
- A part with no existing asset is either pure geometry drawn in SVG or CSS (borders, keylines, plates, rings), or a part cut alone from the cleanest print with clean anti-aliased edges.
- No whole-card cut-outs, and no card content (text, numbers, category icons, art) on a frame part. Do not hide rough edges with rectangle masks or colour blocks.
- Per-card CSS (`.scan-card[data-card-id="…"]`, or `.scan-event[data-card-id="…"]` for landscape events) is limited to what that card's print measures: type size, line pitch, block position, and the size and offset of inline art.

## Templates

| `layout` | Component, root class | Built from | Fields a record supplies besides `art`, `text`, `name` |
|---|---|---|---|
| `occupation`, `minor`, `major` | `PlayerCard` through `scanSkinMeta`; `[data-scan-deck]` rules in `card-sprite.css` | The official assembly from `card_frames.jpg`, the deck badge | `deck`, `number`, `players`, `vp`, `cost`, `prerequisite`, `isCookery`, `category`, `overlay` |
| `alien-artifact` | `AlienArtifactCard`, `.scan-artifact` | See below | `number`, `vp`, `passing`, `bonusPoints`, `category`, `overlay` |
| `illustrated-action` | `IllustratedActionCard`, `.scan-illustrated` (`.scan-official-action`) | `action_frame.png` re-stacked in bands by `ActionFrame` so the panel closes above full-bleed art; Forest cards add the parchment paper and the number tree (see below) | `deck`, `number`, `flavor`, `overlay` |
| `space-merchant`, `alien-event` | `SpaceMerchantCard`, `AlienEventCard` in `XBandCard.tsx`; `.scan-episode[data-layout]` | SVG tiles and keylines, plates filled with `action_frame_bg.jpg`, red or blue side plates, badge, category roundel, the official `.card-score` coin | `number`, `bannerKind`, `bannerValue`, `claim`, `category`, `overlay`; `bonusPoints` on alien events |
| `event` (Forest stories) | `ForestEventCard`, `.scan-story` | Bronze-rimmed SVG tiles, the wood inlay, the plate paper, the number tree; hex windows add the `meeples.png` sprigs | `number`, `timing`, `alert`, `scoringByPlayers`, `window`, `mark` |
| `landscape-event` | `LandscapeEventCard`, `.scan-event` (landscape) | A gold plate with the occupation slice's mottle, the band scrollwork mirrored, an `action_frame_bg.jpg` panel, the offspring sprig | `number`, `scope`, `when`, `overlay` |
| `offspring` | `OffspringCard`, `.scan-offspring` | The major slice under a navy gradient map, SVG plates filled with `changelings/frames/parchment.jpg`, bevel rims, `changelings/frames/sprig.png` | `number`, `assign`, `feeding` |
| `guest` | `GuestCard`, `.scan-guest` | See below | `uses`, `overlay` |
| `crop-circles` | `CropCirclesCard`, `.scan-crop` | `action_frame.png` re-stacked in horizontal bands by `ActionFrame`: the title band gains two vine turns and the panel loses middle rows, while corners and knots keep their size | `number`, `covers`, `blocksBuilding` |
| `expansion-rules` | `ExpansionRulesCard`, `.scan-rules` | `frame` is `changelings/frames/parchment.jpg`, untiled, under a luminance-to-tan SVG colour map; a blurred light stroke on the card outline gives the print's pale rim; `art` is the set logo cut from the print | none |

### Template notes

- **Alien artifact.** The print is the official minor frame redrawn in green. The template draws:
  - the minor slice of `card_frames.jpg` under a luminance-to-green map, in two vertical parts so its lower rim lands on the print's;
  - SVG title and text plates filled with `action_frame_bg.jpg` and sunk into the body by shade and light strokes;
  - the window sprigs `x-deck/frames/artifact-sprig-left.png` and `-right.png`, cut from the print. Cards with `passing` keep the slice's arrows, recoloured, instead;
  - the category roundel through the same green map, and a negative `vp` coin through a bronze map. Both are HTML, so their maps sit in a zero-size sibling SVG, as on the offspring face;
  - with `bonusPoints`, the bonus coin from `meeples.png`.

  `art` fills the hexagon's box (`.scan-artifact .scan-stack-art`).
- **Guest.** `frame` is the title scroll `newdale/frames/guest-scroll.png`, cut from the print. Around it the template draws:
  - a gold band with the occupation slice's mottle and leaves;
  - a white disc with ring keylines around the window;
  - the Forest parchment panel and the offspring sprig.
- **Illustrated action.** `PANEL` in `IllustratedActionCard.tsx` gives the bands the X prints close their panel with and where their art starts; each Forest card lists its own in `PANELS`:
  - `ActionFrame` re-stacks `action_frame.png` in bands, as for Crop Circles. Bands repeat or drop rows of the linen and the vine posts, so the panel's bottom border, keyline and side posts end where the print closes it. Corners and knots keep their size. `actionFrameRow` maps a frame row to the face;
  - the art runs full bleed from `artTop` to the card edges, under the frame, on white stock;
  - anything the print draws over the panel or its border goes in the overlay.

  Forest cards (`deck: 'legendairy-forest'`) draw `ForestPaper` inside the frame:
  - the Forest parchment through `revised/action_frame_panel.png`;
  - the title band paled through `revised/action_frame_title.png`.

  Both masks are cut from the official frame's own pixels and laid in the same bands. The number tree sits on the panel's foot.
- **Forest stories.** `frame` is the wood inlay `legendairy-forest/frames/wood.jpg`. `window: 'hex'` selects the unicorn-story hex window between brown bands; the pointed window is the default.

## Adding a card

1. Pick the layout whose print matches. When none does, add a layout: the type in `types.ts`, a component, a `ScanCardFace` case, a branch in `scanFaceAssets`, `SCAN_PUBLIC_TYPE` in `scripts/card-encyclopedia/catalog.ts`, the encyclopedia labels and the tests below.
2. Cut the art from the registered print. Take the window only, transparent outside it. Put any part drawn past the window into the overlay, a transparent layer the size of the face.
3. Commit the files to the assets repository, list them in `public-assets.required.json`, and set `public-assets.ref` to that commit.
4. Add the record with its layout's fields. Transcribe the text with the print's line breaks; inline pictures at a line's end use `{art:PATH|WIDTH|end}`.
5. Compare the face with its print (below). Add per-card CSS only for the measured type and placement.
6. Update the counts in `shared/scan-cards/__tests__/catalog.test.ts` and `scripts/__tests__/card-encyclopedia-scan.test.ts`, and the face checks in `client/app/encyclopedia/__tests__/EncyclopediaScanFace.test.tsx`.

## Checking against the print

- Register the print to the face with an affine fit on the frame keylines, at 940 × 1496 px (1680 × 1050 for landscape).
- Shoot the face element on the encyclopedia page at 235 px wide and device scale 4. Shoot it twice: once in full and once with the content layers hidden, which leaves the frame alone.
- Compare frame-only against the print for the frame, and the full face for content. Use side-by-side sheets with zoomed crops. Measure keylines and text line boxes against the print.
- When a shared part changes, shoot every face that uses it before and after. Faces the change is not meant to touch must stay pixel-identical.
- Run the scan-card Vitest set (`shared/scan-cards`, `client/app/encyclopedia`, `scripts/__tests__/card-encyclopedia-scan.test.ts`, `scripts/__tests__/public-assets.test.ts`), `scripts/__tests__/docs-budget.test.ts` and ESLint.

Comparison images and registration scripts stay outside both repositories.
