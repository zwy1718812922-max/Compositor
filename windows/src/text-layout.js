export const paragraphAlignments=['left','center','right','justify-left','justify-center','justify-right','justify-all'];
export const alignmentNames=['左对齐','居中对齐','右对齐','末行左对齐','末行居中对齐','末行右对齐','全部两端对齐'];
const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
export function justifyLine(ctx,text,width) {
  const chars=Array.from(text),gaps=[];
  for(let i=0;i<chars.length-1;i++)if(/\s/u.test(chars[i])||cjk.test(chars[i])||cjk.test(chars[i+1]))gaps.push(i);
  const extra=Math.max(0,width-ctx.measureText(text).width),spacing=gaps.length?extra/gaps.length:0;
  const fragments=[];let start=0;
  for(const end of [...gaps,chars.length-1]){const t=chars.slice(start,end+1).join('');const x=ctx.measureText(chars.slice(0,start).join('')).width+spacing*gaps.filter(i=>i<start).length;if(t)fragments.push({text:t,x});start=end+1;}
  return {fragments,width:gaps.length&&extra>0?width:ctx.measureText(text).width};
}
// Keep paragraph ends so last-line alignment applies independently to each paragraph.
export function layoutText(ctx,layer) {
  const p=layer.paragraph||{},result=[],lineHeight=layer.fontSize*(layer.lineHeight||1.35),width=layer.boxWidth||Infinity,left=p.leftIndent||0,right=p.rightIndent||0,first=p.firstIndent||0;let y=0;
  layer.text.split('\n').forEach((paragraph,index)=>{
    y+=p.spaceBefore||0;const prefix=p.list==='bullet'?'• ':p.list==='number'?(index+1)+'. ':'';let line='',lineIndex=0;
    const push=last=>{const available=Math.max(1,width-left-right-(lineIndex===0?first:0));result.push({text:line,x:left+(lineIndex===0?first:0),y,width:available,paragraph:index,last});y+=lineHeight;lineIndex++;line='';};
    const tokens=(prefix+paragraph).match(/[\p{Script=Latin}\p{N}\p{M}'’-]+|[^\p{Script=Latin}\p{N}\p{M}'’-]/gu)||[];
    for(const token of tokens){let available=width-left-right-(lineIndex===0?first:0);if(layer.textMode==='paragraph'&&line&&ctx.measureText(line+token).width>available)push(false);
      for(const char of Array.from(token)){available=width-left-right-(lineIndex===0?first:0);if(layer.textMode==='paragraph'&&line&&ctx.measureText(line+char).width>available)push(false);line+=char;}
    }
    push(true);y+=p.spaceAfter||0;
  });return {lines:result,height:y};
}
export function paintTextLine(ctx,layer,line,size) {
  const align=layer.align||'left',paragraph=layer.textMode==='paragraph',justify=paragraph&&align.startsWith('justify-')&&(!line.last||align==='justify-all');
  const lastAlign=align.startsWith('justify-')?align.slice(8):align,available=paragraph?line.width:size.width,origin=paragraph?line.x:0;
  const run=justify?justifyLine(ctx,line.text,available):{fragments:[{text:line.text,x:0}],width:ctx.measureText(line.text).width};
  const offset=justify?0:lastAlign==='center'?(available-run.width)/2:lastAlign==='right'?available-run.width:0;
  ctx.textAlign='left';for(const fragment of run.fragments)ctx.fillText(fragment.text,origin+offset+fragment.x,line.y);
  const x=origin+offset;if(layer.underline)ctx.fillRect(x,line.y+layer.fontSize,run.width,Math.max(1,layer.fontSize/18));if(layer.strike)ctx.fillRect(x,line.y+layer.fontSize*.55,run.width,Math.max(1,layer.fontSize/18));
}
