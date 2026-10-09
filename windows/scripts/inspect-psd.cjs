const fs = require('node:fs');
const path = require('node:path');
const { readPsdDocument } = require('../psd.cjs');
const { readPsd } = require('ag-psd');
const file = process.argv[2];
if (!file) throw new Error('Provide a PSD path.');
const bytes = fs.readFileSync(file), raw = readPsd(bytes, { useRawData: true, useImageData: true, skipThumbnail: true, skipLinkedFilesData: true, totalMemoryLimit: 512 * 1024 * 1024 });
const nodes = []; const visit = layers => { for (const l of layers || []) { nodes.push(l); visit(l.children); } }; visit(raw.children);
const summary = { file: path.basename(file), bytes: bytes.length, width: raw.width, height: raw.height, layers: nodes.length, groups: nodes.filter(l => l.children).length, text: nodes.filter(l => l.text).length, masks: nodes.filter(l => l.mask).length, effects: nodes.filter(l => l.effects && Object.keys(l.effects).some(k => !['scale','disabled'].includes(k))).length, blends: [...new Set(nodes.map(l => l.blendMode))] };
const start = performance.now();
try { const imported = readPsdDocument(bytes); Object.assign(summary, { importedLayers: imported.project.layers.length, importedText: imported.project.layers.filter(l => l.type === 'text').length, requiresConversion: Boolean(imported.requiresConversion), warnings: imported.warnings, conversionMs: Math.round(performance.now() - start) }); }
catch (error) { summary.error = error.message; process.exitCode = 1; }
console.log(JSON.stringify(summary, null, 2));
