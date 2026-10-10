# Windows project format v5

Windows 0.6.0 writes `.ccomp` v5 and reads v1–v4. The macOS `.comp` format and `ProjectManifest.current` are unchanged.

Transforms retain `x`, `y`, `scale` and clockwise `rotation`. Optional `scaleY` is the independent vertical scale, defaulting to `scale`. Optional `skew` is a horizontal shear before rotation, defaulting to zero. The linear matrix is `[cos(r)*scale, sin(r)*scale, (cos(r)*skew-sin(r))*scaleY, (sin(r)*skew+cos(r))*scaleY]`. Both scales are positive, 0.01–100; shear is finite, −100–100. The same fields apply to masks. Linked masks follow the complete affine delta. Group children remain in document coordinates, allowing independent scaling of a rotated group without losing shear.

New `fill` layers store `width`, `height`, and `fill: {kind, color, color2, angle, scale, pattern, data?}`. Kinds are `solid`, `gradient`, and `pattern`. Patterns are `checker`, `dots`, `stripes` and `image`; custom tiles are embedded PNGs up to 512 × 512. Generated pixels are cached only in memory. Masks, opacity, visibility, transforms and FX apply normally.

New `adjustment` layers store `adjustment: {kind, values}` and alter the underlying sibling composite, preserving alpha. Available kinds and numeric ranges are defined by `src/fill-model.mjs`. Layer opacity and masks control adjustment strength. Clipped adjustments operate on their base layer. Adjustments have no independently transformed image and do not support FX or applying a mask as pixels; merge them down first. The algorithms approximate common Photoshop adjustments and are not an exact Photoshop color engine.

Text optionally stores `fontWeight` (100–900), `italic`, `underline`, and `textGeometry.matrix` for an imported affine PSD text cache. Editing replaces the cache using local fonts; cancellation restores the cache and transform. Font favorites stay in the user's application preferences, outside documents.

`guides` contains up to 200 `{id, axis, position}` records. `axis` is `x` for a vertical guide and `y` for a horizontal guide; positions are document pixels. `ruler` stores `unit` (`px`, `in`, `cm`, `mm`, `pt`), `origin: {x,y}`, `visible`, `guidesVisible`, and `locked`. Guides and origins follow crop, canvas anchors and image resizing. Standard PSD guide resources are imported and exported. PNG/JPEG exports contain no guides or ruler graphics.

AI cutouts produce ordinary linked grayscale PNG masks. No model, executable, accelerator selection or inference cache is embedded in a document. Model and runtime caches live in `%LOCALAPPDATA%\CompositorZH\AI`. Source image pixels remain unchanged.

Validation limits remain 100 layers, 64 million stored/generated layer and mask pixels, 16,384 pixels per side, and a 128 MB project file. Fill settings, embedded patterns, affine transforms, text metadata and ruler settings are validated before replacing the current document. Saves use atomic replacement.
