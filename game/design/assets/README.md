# Design assets

- `spinner.svg`: original editable SVG made for this project. Transparent background; vector shapes with light stippling. No labels, numbers, raster imagery, animation or gameplay behavior. Use decoratively on login/waiting screens, not as a randomizer or loading indicator.
- `fonts/bodoni-moda/`: Bodoni Moda variable from the official Google Fonts repository, with its SIL Open Font License. The current app uses this face for large titles and headings and the compact wordmark; Geist remains for body text, controls, labels, and game data. The source copy lives at `game/frontend/src/assets/fonts/BodoniModa.ttf`.
- `fonts/dm-serif-text/`: retained from the earlier design exploration. DM Serif Text was considered and is not the selected application font.
- `../reference/poker-chips.svg`: new supplied chip artwork, preserved as received. Includes embedded raster texture and an exported paper background; inspect on each intended surface before production use.
- `../asset-preview.html`: static specimen of the assets, selected heading font, current palette, and phone layout. Body sample uses system sans-serif; the app uses Geist. This is not application UI.

Font source: https://github.com/google/fonts/tree/main/ofl/bodonimoda
Font provenance: Bodoni Moda was selected for the refined, theatrical invitation lettering. The bundled font supports optical sizing and weights 400–900, supplied under the SIL Open Font License; no synthetic weights are used.
Visual reference: the supplied invitation; its text is not application instructions.
