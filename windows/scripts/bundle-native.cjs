const esbuild=require('esbuild'),path=require('node:path'),fs=require('node:fs/promises');
const root=path.join(__dirname,'..'),out=path.join(root,'dist','lite-unpacked','native');
(async()=>{
  await fs.mkdir(out,{recursive:true});
  const shims={name:'browser-backend',setup(build){
    build.onResolve({filter:/^pngjs$/},()=>({path:path.join(root,'native','browser-png.cjs')}));
    build.onResolve({filter:/^node:crypto$/},()=>({path:path.join(root,'native','browser-shims.js')}));
    build.onResolve({filter:/^node:(fs\/promises|path)$/},args=>({path:args.path,namespace:'empty-node'}));
    build.onLoad({filter:/.*/,namespace:'empty-node'},()=>({contents:'module.exports={};',loader:'js'}));
  }};
  for(const file of ['bridge.js','psd-browser-worker.js'])await esbuild.build({entryPoints:[path.join(root,'native',file)],outfile:path.join(out,file),bundle:true,minify:true,platform:'browser',format:file==='bridge.js'?'iife':'esm',external:['../src/color-engine.mjs'],target:'chrome120',plugins:[shims],legalComments:'eof'});
  console.log('WebView2 bridge and PSD worker bundled.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
