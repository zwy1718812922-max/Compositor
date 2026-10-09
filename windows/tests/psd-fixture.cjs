const { writePsdBuffer } = require('ag-psd');
require('../psd.cjs');
function bitmap(width, height, color) { return { width, height, data: new Uint8ClampedArray(Array.from({ length: width * height }, () => color).flat()) }; }
function psdFixture(extra = {}) {
  const image = bitmap(8, 6, [25, 50, 90, 255]);
  return writePsdBuffer({ width: 8, height: 6, imageData: image, children: [
    { name: '背景', imageData: image },
    { name: '中文组', blendMode: 'pass through', opened: true, children: [
      { name: '蒙版图层', left: 2, top: 1, imageData: bitmap(4, 4, [220, 30, 50, 255]), mask: { left: 2, top: 1, defaultColor: 0, imageData: { width: 4, height: 4, data: new Uint8ClampedArray(Array.from({ length: 16 }, (_, i) => i % 4 < 2 ? [255,255,255,255] : [0,0,0,255]).flat()) } } },
      { name: '剪贴颜色', clipping: true, left: 0, top: 0, imageData: bitmap(8, 6, [240, 210, 20, 255]) }
    ] }
  ], imageResources: { resolutionInfo: { horizontalResolution: 300, horizontalResolutionUnit: 'PPI', verticalResolution: 300, verticalResolutionUnit: 'PPI', widthUnit: 'Inches', heightUnit: 'Inches' } }, ...extra }, { noBackground: true });
}
module.exports = { bitmap, psdFixture };
