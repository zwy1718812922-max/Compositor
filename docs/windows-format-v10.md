# Windows format v10: editable local AI beauty

Windows 0.10.0 now saves `.ccomp` v10 and reads v1–v9. This is independent of the macOS `.comp` manifest; `ProjectManifest.current` is unchanged.

Raster `filters` accept `kind: "beauty"`, with the v9 ID, enabled, strength and ordered stack semantics. The original `layer.data` PNG is retained. `values` contains default controls (`smooth`, `blemish`, `even`, `brighten`, `redness`, all integer percentages 0–100), a model identifier and up to 32 independently adjustable `faces`:

- `id`, `name`, `enabled`: unique identifier, label and individual switch.
- `settings`: the five integer controls for that face.
- `rect`: integer source-pixel x/y/width/height. Transforming the layer transforms its beauty results as well.
- `box`, `landmarks`: source-pixel detector bounds and five feature points, used when recomputing that face.
- `blend`: optional 512×512 PNG. RGB holds the full network's blend field; alpha is the feathered skin mask with feature protection.
- `repair`: optional native ROI-sized PNG. RGB holds the predicted blemish repair; alpha holds the restricted blemish confidence. Both patch images must exist together. Uncomputed faces may omit both.
- `scope`: `auto` or `local`; `regions`: up to 64 rectangles inside the face ROI in source coordinates. Local repair only affects these rectangles. Other beauty controls retain the face skin mask.

One face ROI is limited to 4M pixels; decoded model patches are limited to 16M pixels per beauty filter. Changing percentages, switches, order or overall strength reuses the embedded patches and needs no AI runtime or network. Reset and saved presets change controls without discarding face assets. Global parameter memory and presets exclude document-specific images, face identities and locations. To regenerate after source pixel edits, select the face and compute it again.

Beauty never modifies incoming alpha and leaves pixels outside its masks unchanged. Blend fields follow ABPN's original pointwise composition; blemish repair is a masked interpolation. PNG, JPEG and baked PSD use the same formulas as 100% preview. PSD does not preserve the Windows beauty stack; `.ccomp` does. Original source pixels remain editable and undo includes the complete filter data. Model weights live in the external AI directory and are not embedded in `.ccomp`.
