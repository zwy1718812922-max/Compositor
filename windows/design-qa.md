# PS-style Windows editor design QA

final result: passed

Selected reference: design/ps-ui-classic.png, option 1 approved by the user. Implementation captures are from the packaged 0.4.0 Windows executable, rather than a static mockup: preview.png, mask-preview.png, menu-preview.png and preview-small.png.

## Evidence and comparison

Reference and full implementation both use a 1697 × 927 frame at the captured device scale. The combined comparison is design/comparison-full.png; focused same-scale comparisons are design/comparison-chrome.png and design/comparison-panels.png. They were opened together with the mask state and the 1024 × 720 minimum-window capture. scripts/compare-ui.py reproduces the comparison artifacts.

The implementation state is the editable 1280 × 800 Chinese sample, nine stored layer/group records, five visible root rows, collapsed text folder, the orb layer selected, soft brush preset selected, Move tool, auto-selection disabled and transform outline hidden. The selected concept has different control toggle states, a stylized 1280 × 800 sample, and a different folder arrangement; these are recorded state/content differences. The editor preserves actual document aspect ratio and font rendering instead of flattening the concept artwork into the canvas.

## Findings corrected

- P1, layout: replaced the previous tall branded header and persistent command strip with a 42px gray menu/title row, 42px context row, compact document tab, real rulers, one tool column, panel rail and stacked right panels.
- P2, panel proportions: adjusted the desktop panel width to 310px and top/brush panel heights to 210/225px. Compact controls and independently scrolling panels keep the layer actions reachable at the 1024 × 720 minimum.
- P2, thumbnail clarity: transparent layers now show their occupied image region in the thumbnail; mask thumbnails clearly show black/white content. Linked/unlinked and active image/mask states are visible and functional.
- P2, readability: increased muted control-label contrast and selected-layer text contrast; preserved clear blue focus indicators. Footer information remains legible without a branded status strip.
- P2, behavior: editing controls follow the selected image or mask. The Move tool exposes actual auto-selection and transform visibility controls; paint controls include actual size, hardness and opacity. Text selection opens its editable properties. Menus support keyboard focus, arrows, Enter and Escape.

## Mandatory comparison surfaces

- Typography: Segoe UI / Microsoft YaHei with compact Chinese menu, label and row text. No clipped input values or overlapping captions were observed in the final normal/minimum captures. Document text is rendered from editable layers using installed fonts.
- Layout/spacing: neutral gray rectangular controls and thin dividers match the selected direction. Chrome, rulers and right panels retain the source hierarchy. Canvas positioning responds to actual zoom and document dimensions; it is not stretched to the generated concept's slightly different artwork crop.
- Color/surfaces: #535353 chrome, #454545 panels and #262626 workspace; muted labels, grayscale icons, blue focus and selected-layer feedback. No decorative dashboard cards were added.
- Assets/icons: local MIT Tabler 3.49.0 icons form a consistent 18–21px outline family. Original editable sample artwork is reused. Brush previews are functional Canvas visualizations of preset stroke/hardness parameters, not replacement stock imagery. No broken image assets were observed.
- Copy/content: Chinese terminology is coherent. PSD export explicitly states that text converts to pixels; unsupported imports offer explicit preview confirmation. Unsupported Photoshop channel/path or advanced tool controls are not displayed as working controls.
- Viewport resilience: the target desktop frame and the enforced 1024 × 720 Windows minimum were checked. Side panels and long menus scroll while canvas tools and layer actions stay available. This is a desktop Windows application, so phone/tablet breakpoints are outside the supported viewport scope.
- States/interactions: swatches, properties, text controls, mask controls, disabled locks, selection highlights, group folding, search, preset selection, menus, dialog cancellation and error messages were exercised. The mask capture shows the active black/white thumbnail and live controls; the artwork remains editable.
- Accessibility: native form controls, Chinese accessible names, visible keyboard focus, menu keyboard navigation, alt="" for decorative icons, status announcements and no mandatory animation. Other Windows DPI settings and screen-reader-specific behavior were not independently validated.

## Verification and remaining differences

Seven Node tests and nineteen Electron tests passed on the packaged EXE. The portable EXE separately passed extraction/startup and editing/mask smoke checks. PSD files were independently decoded and recomposited using psd-tools; the largest checked 8-bit channel difference was 3.

Expected product differences from the concept: the standard outline icon set, actual sample font/color rendering, app-specific feature labels, working swatch categories, and compact 12–13px UI rather than the generated concept's slightly larger glyphs. No remaining actionable P0/P1/P2 findings. P3 polish could further tune panel glyph weights and swatch arrangement without changing the approved gray UI direction.
