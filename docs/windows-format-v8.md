# Windows project format v8

Windows 0.10.0 writes `.ccomp` v8 and reads v1–v7. The macOS `.comp` schema and `ProjectManifest.current` remain unchanged. The base schema is documented in [Windows FORMAT](../windows/FORMAT.md); all v7 fields remain valid.

Text `align` accepts `left`, `center`, `right`, `justify-left`, `justify-center`, `justify-right`, and `justify-all`. Last-line justification is evaluated separately for each newline-delimited paragraph. Chinese spacing uses character opportunities; Latin words use whitespace opportunities, without stretching glyphs. A line without spacing opportunities retains its natural width. This is not Photoshop's full shaping engine.

Triangle and polygon shapes may store `vertexRadii`, an array in vertex order starting at the top vertex, clockwise. The array has three entries for triangles, or `sides` entries for polygons. Each is a nonnegative finite local pixel radius, bounded by half the shorter dimension. Tangent distances are additionally reduced together when adjacent rounded corners exceed an edge. Rectangles retain their four `radii` in top-left, top-right, bottom-right, bottom-left order. Ellipses and lines have no corner controls.

Shape resizing absorbs positive horizontal and vertical scale into geometric dimensions while preserving stroke width and circular local corner radii. Existing saved shapes are normalized on load. Rotation, reflections and shear retain their affine representation. Shapes remain vector geometry in `.ccomp`; PSD exchange continues to bake them into individual raster layers. Extended paragraph properties are likewise baked for PSD appearance.

There is no fixed layer-count, aggregate source-pixel, or 128 MiB encoded-file quota. Individual Canvas surfaces remain bounded to 16384 pixels per side, and real runtime allocation limits apply. Validation still checks identifiers, hierarchy, dimensions, types and PNG structure. Undo snapshots share unchanged pixels, and reconstructable render caches use eviction; their resource budgets do not reject documents.

Persistent property defaults are separate from project data: `compositor.propertyDefaults.v1` in the host's existing local profile. New-object appearance defaults are categorized by shape kind, text, fill kind, adjustment kind, artboard and mask. Current placement and drawn dimensions take precedence. Canceled color/numeric/text sessions do not commit defaults. Existing objects always retain their saved settings.

Recent items retain `compositor.recentProjects.v1`, adding `previewVersion: 2` and a host-specific `stamp` containing file size and modification time. Stale entries rebuild sequentially in the background on the home screen. PSD entries use the file's embedded full-resolution composite, converted once when CMYK; project entries render actual saved content. Preview refresh does not change the active document, its save path, or the source file.
