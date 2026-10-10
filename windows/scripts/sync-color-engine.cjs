const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),source=path.join(root,'node_modules','lcms-wasm'),target=path.join(root,'src','vendor','lcms');
fs.mkdirSync(target,{recursive:true});for(const name of ['lcms.js','lcms.wasm'])fs.copyFileSync(path.join(source,'dist',name),path.join(target,name));fs.copyFileSync(path.join(source,'LICENSE.md'),path.join(target,'LICENSE.md'));
fs.writeFileSync(path.join(target,"package.json"),JSON.stringify({type:"module"}));
