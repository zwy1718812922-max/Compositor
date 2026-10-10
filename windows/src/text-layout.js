// Canvas and the inline editor share the same paragraph measurements.
export function layoutText(ctx, layer) {
  const p=layer.paragraph||{}, result=[],size=layer.fontSize,lineHeight=size*(layer.lineHeight||1.35), width=layer.boxWidth||Infinity;
  const left=p.leftIndent||0,right=p.rightIndent||0,first=p.firstIndent||0;let y=0;
  layer.text.split('\n').forEach((paragraph,index)=>{
    y+=p.spaceBefore||0;
    const prefix=p.list==='bullet'?'• ':p.list==='number'?(index+1)+'. ':'';
    let line='',lineIndex=0;
    const push=()=>{result.push({text:line,x:left+(lineIndex===0?first:0),y,width:Math.max(1,width-left-right-(lineIndex===0?first:0)),paragraph:index});y+=lineHeight;lineIndex++;line='';};
    for(const char of Array.from(prefix+paragraph)){
      const available=width-left-right-(lineIndex===0?first:0);
      if(layer.textMode==='paragraph'&&line&&ctx.measureText(line+char).width>available)push();
      line+=char;
    }
    push();y+=p.spaceAfter||0;
  });
  return {lines:result,height:y};
}
