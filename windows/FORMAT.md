# Windows project format v1–v4

Windows 0.5.0 saves v4 and reads v1–v3. See [v4 additions](../docs/windows-format-v4.md). The native WebView2 and Electron builds use the same renderer, schema validation, and PSD conversion code.

The Windows port uses a separate UTF-8 JSON format, with extension `.ccomp`, to avoid claiming compatibility with the upstream macOS `.comp` package. The macOS manifest schema and `ProjectManifest.current` are unchanged.

- `format`: `com.compositor.windows`
- `version`: `3` for new saves; versions `1` and `2` remain readable
- `width`, `height`: integer document pixels, each 1–16384 in v2; v1 remains limited to 4096
- `resolution`: pixels/inch, finite 1–9600, required by v2; v1 defaults to 72 on load
- `colorSpace`: `sRGB`, required by v2
- `activeId`: an existing layer ID
- `layers`: bottom-to-top array, 1–100 layers

Every layer has a unique string `id`, a `name` up to 200 characters, a `type` (`raster`, `text`, or v3 `group`), numeric `x`/`y` (±100000), `scale` (0.01–100), clockwise `rotation` in degrees (±36000), `opacity` (0–1), Canvas 2D `blend`, and boolean `visible`/`locked`.

Transforms use the top-left origin: translate, rotate, uniformly scale. Supported blends: source-over, multiply, screen, overlay, darken, lighten, difference, soft-light, hard-light.

Raster layers embed a PNG data URL in `data`. Pixels are local to that layer and may be smaller than the document. Layer raster dimensions are 1–16384 in v2 (1–4096 in v1); the total raster and mask budget is 64 × 1024 × 1024 pixels. The document canvas itself has the same total pixel budget. These expanded bounds allow A3/A2 at 300 ppi without silently reducing the chosen resolution.

Text layers store `text` (up to 10000 UTF-16 code units), `font` (family name, up to 200 characters), `fontSize` (1–1000 document pixels), `color` (#rrggbb), and boolean `bold`. Newlines are explicit; text does not wrap automatically. Line height is 1.35 × fontSize. The text baseline is top; rendering uses installed fonts with Microsoft YaHei and sans-serif fallbacks.

The complete UTF-8 file is capped at 128 MiB. Validation and image decoding complete before replacing the current editor document. Saves use a temporary sibling file and rename over the destination; the previous file is retained if validation or writing fails. Undo, viewport, selection outline, and document display name are not serialized. PNG/JPEG exports do not clear the project's dirty state.

Physical document inputs convert to pixels as round(inches × resolution). A millimetre is 1/25.4 inch, a centimetre 1/2.54 inch, and a point 1/72 inch. Width and height in pixel units do not change when resolution changes. PNG exports set pHYs to pixels/metre with unit 1; JPEG exports set JFIF density in pixels/inch. JPEG density is rounded to the nearest integer, while project metadata preserves fractional resolution.

New-document saved/recent presets live in localStorage under compositor.new-document.v1, separately from document files. Their unit, width, height, resolution and background are retained. There is no dependency on the upstream macOS project format.

Windows 0.3.0 keeps format v2. Selections and crop previews are session state and are not saved. Crop/canvas-size changes update document dimensions and layer positions, retaining out-of-canvas layer pixels. Image resizing resamples raster data and scales layer positions; editable text scales through its existing uniform scale. Adjustments are baked into PNG pixels. Merge and text rasterization produce ordinary raster layers, so these operations require no new manifest fields.


Windows 0.4.0 saves format v3. The flat array retains bottom-to-top **sibling** order. Optional `parentId` is null/absent for root nodes, otherwise it references a group. Canonical saves place descendants before their group record. Group records have no image data, fixed x/y=0, scale=1, rotation=0, and boolean `collapsed`; their blend may additionally be `pass-through`. Visibility and locking are inherited from ancestors. Normal groups composite in isolation; pass-through groups blend their children against the existing backdrop and interpolate by group opacity and mask. Nesting is limited to 10 groups; missing parents and cycles are rejected. Optional boolean `clipping` clips consecutive siblings above a non-clipping base to the base's transparency; orphan clipping flags are released during structural edits.

Any v3 layer or group may have `mask`: a grayscale opaque PNG `data`, world-space x/y, uniform scale, clockwise rotation, `defaultColor` (0–255 outside the bitmap), `density` (0–1), document-space `feather` (0–100 pixels), and boolean `enabled` / `linked`. White reveals, black hides. Density interpolates the mask toward white; feather blurs mask edges. A linked mask follows the image transform; an unlinked mask is positioned independently. Masks count toward the same 64 × 1024 × 1024 source-pixel budget as raster layers. Cached render surfaces are never saved. Mask editing may expand/normalize a partial bitmap to cover the document while retaining its previous out-of-canvas extent. Crop/canvas resizing shifts all bitmap and mask positions while groups retain fixed transforms; image resizing resamples both image and mask pixels and scales positions and feather.

PSD is an exchange format, not the editable Windows project schema. Export renders text and uniform transforms into ordinary raster data, retains groups, opacity, supported blends, masks and clipping, and writes a full-resolution composite and resolution metadata. Import accepts RGB 8-bit sRGB/square-pixel files within the same limits. PSD text is rasterized; complex unsupported content requires explicit composite-preview confirmation. The PSD mask's editing link choice is not retained through exchange; it defaults to linked on import. Windows `.ccomp` v3 retains this choice and editable text.
