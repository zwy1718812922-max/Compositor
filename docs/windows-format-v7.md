# Windows project format v7

Windows 0.9.0 writes `.ccomp` v7 and reads v1–v6. The macOS `.comp` schema and `ProjectManifest.current` are unchanged. All v6 color, ICC, layer, mask and text fields remain valid.

Layers and masks may have optional boolean `flipX` and `flipY`. The affine transform applies these signs before rotation and shear; scale values remain positive. Linked masks follow the full affine transform, including reflections.

The new `shape` layer stores a `shape` object: `kind` (`rect`, `ellipse`, `triangle`, `polygon`, `line`), local `width`/`height` (0.0001–16384), `fill`/`stroke` (`#rrggbb` or `none`), `strokeWidth` (0–500), `dash` (`solid`, `dash`, `dot`), polygon `sides` (integer 3–32), `radii` (top-left, top-right, bottom-right, bottom-left, each limited to half the shorter side), and boolean `linked`. Lines may also store boolean `horizontal`/`vertical`. Shapes retain geometry until explicitly rasterized. Their metadata does not count as decoded raster pixels.

A root `group` may have `artboard: {width, height, background}`. Dimensions are integer 1–16384 with at most 64 million pixels; `background` is `#rrggbb` or `transparent`. Such a group may have nonzero world-space x/y, but no scale/rotation. Ordinary groups still have fixed identity transforms. Children keep world-space positions and are clipped to their artboard. Moving an artboard moves its contents and linked masks; resizing it changes its clipping rectangle without deleting source pixels. Adding or moving artboards expands the document extent, shifting all contents and guides if the extent crosses zero. Artboards cannot nest.

New documents with the artboard option use an artboard background. Without it, they use an editable `fill` layer. Optional `fill.alpha` (0–1) provides explicit transparent fills without disabling their later color edits; absent alpha defaults to 1. Procedural fill dimensions do not count as stored raster pixels in v7. Actual raster assets and masks still share the 64 million pixel limit.

Text may have optional boolean `strike` and `paragraph`: `leftIndent`, `rightIndent`, `spaceBefore`, `spaceAfter` (0–10000 local pixels), `firstIndent` (-1000–10000), `list` (`none`, `bullet`, `number`), and `direction` (`ltr`, `rtl`). These are rendered and saved as editable text properties. OpenType shaping, multilingual typography and Photoshop's complete paragraph engine are not replicated.

Native-resolution preview caches, panel geometry, color-picker state, recent thumbnails and temporary hand gestures are not stored in the document. Recent thumbnails are generated from the same full-resolution, color-proofed composite used for navigation. Cached previews are bounded and can be rebuilt from project contents.

Image resizing can resample pixels or change resolution alone. Pixel resampling preserves independent horizontal/vertical transforms, editable shapes/text, artboard sizes, masks, styles and guides. Canvas resizing and cropping retain pixels outside the canvas. Work is cancellable and a successful application creates one undo entry.

PSD exchange retains artboard rectangles, background metadata and group ownership. Shapes and extended paragraph typography are exported as individual pixel layers to preserve their appearance; `.ccomp` retains their editable parameters. Plain supported text remains editable in PSD. Current/all-artboard PNG/JPEG exports use each artboard's exact rectangle and chosen background. Existing PSD/PSB, bit-depth, layer, file-size and color-separation limits remain as documented in v6.
