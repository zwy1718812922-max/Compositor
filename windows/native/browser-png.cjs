const { Buffer } = require('buffer');
const { deflate, Inflate } = require('pako');
const signature = Buffer.from('89504e470d0a1a0a','hex');
const crcTable = Uint32Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc(data){let v=0xffffffff;for(const b of data)v=crcTable[(v^b)&255]^(v>>>8);return(v^0xffffffff)>>>0;}
function chunk(name,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(name,4,'ascii');data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,data.length+8)),data.length+8);return out;}
function size(w,h){if(!w||!h||w>16384||h>16384||w*h>64*1024*1024)throw new Error('PNG 尺寸超出限制。');}
function write({width,height,data}){
  size(width,height);const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(data.buffer,data.byteOffset+y*width*4,width*4).copy(raw,y*(width*4+1)+1);
  return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',Buffer.from(deflate(raw,{level:3}))),chunk('IEND',Buffer.alloc(0))]);
}
function read(input){
  const bytes=Buffer.from(input);if(bytes.length<33||!bytes.subarray(0,8).equals(signature))throw new Error('PNG 文件损坏。');
  let header,palette,transparency;const idat=[];
  for(let p=8;p<bytes.length;){const len=bytes.readUInt32BE(p),end=p+len+12;if(end>bytes.length)throw new Error('PNG 数据不完整。');const type=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+len);if(crc(bytes.subarray(p+4,p+8+len))!==bytes.readUInt32BE(p+8+len))throw new Error('PNG 校验失败。');if(type==='IHDR')header=data;if(type==='PLTE')palette=data;if(type==='tRNS')transparency=data;if(type==='IDAT')idat.push(data);p=end;if(type==='IEND')break;}
  if(!header||!idat.length)throw new Error('PNG 缺少图像数据。');const w=header.readUInt32BE(0),h=header.readUInt32BE(4),depth=header[8],type=header[9],interlace=header[12];size(w,h);
  const channels={0:1,2:3,3:1,4:2,6:4}[type];if(!channels||![1,2,4,8,16].includes(depth)||interlace>1||type===3&&!palette)throw new Error('PNG 颜色格式无效。');
  const passes=interlace?[[0,0,8,8],[4,0,8,8],[0,4,4,8],[2,0,4,4],[0,2,2,4],[1,0,2,2],[0,1,1,2]]:[[0,0,1,1]];
  let expected=0;for(const[x,y,dx,dy]of passes){const pw=Math.max(0,Math.ceil((w-x)/dx)),ph=Math.max(0,Math.ceil((h-y)/dy));if(pw&&ph)expected+=ph*(Math.ceil(pw*channels*depth/8)+1);}
  const inflater=new Inflate(),parts=[];let length=0;inflater.onData=part=>{length+=part.length;if(length>expected)throw new Error('PNG 解压数据超出尺寸。');parts.push(Buffer.from(part));};inflater.push(Buffer.concat(idat),true);if(inflater.err||length!==expected)throw new Error('PNG 压缩数据损坏。');const raw=Buffer.concat(parts),out=Buffer.alloc(w*h*4);let offset=0;
  const maximum=2**depth-1,bpp=Math.max(1,Math.ceil(channels*depth/8));
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(const[x0,y0,dx,dy]of passes){const pw=Math.max(0,Math.ceil((w-x0)/dx)),ph=Math.max(0,Math.ceil((h-y0)/dy));if(!pw||!ph)continue;const stride=Math.ceil(pw*channels*depth/8);let prior=Buffer.alloc(stride);
    for(let y=0;y<ph;y++){const filter=raw[offset++],row=Buffer.from(raw.subarray(offset,offset+stride));offset+=stride;if(filter>4)throw new Error('PNG 滤波格式无效。');for(let i=0;i<stride;i++){const a=i>=bpp?row[i-bpp]:0,b=prior[i],c=i>=bpp?prior[i-bpp]:0;row[i]=(row[i]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}
      const sample=i=>depth===16?row.readUInt16BE(i*2):depth===8?row[i]:(row[Math.floor(i*depth/8)]>>(8-depth-i*depth%8))&maximum;
      for(let x=0;x<pw;x++){const p=((y0+y*dy)*w+x0+x*dx)*4,s=x*channels;let r,g,b,a=maximum;
        if(type===3){const index=sample(s);if(index*3+2>=palette.length)throw new Error('PNG 调色板无效。');out[p]=palette[index*3];out[p+1]=palette[index*3+1];out[p+2]=palette[index*3+2];out[p+3]=transparency?.[index]??255;continue;}
        if(type===0||type===4){r=g=b=sample(s);if(type===4)a=sample(s+1);else if(transparency&&r===transparency.readUInt16BE(0))a=0;}
        else{r=sample(s);g=sample(s+1);b=sample(s+2);if(type===6)a=sample(s+3);else if(transparency&&r===transparency.readUInt16BE(0)&&g===transparency.readUInt16BE(2)&&b===transparency.readUInt16BE(4))a=0;}
        out[p]=Math.round(r/maximum*255);out[p+1]=Math.round(g/maximum*255);out[p+2]=Math.round(b/maximum*255);out[p+3]=Math.round(a/maximum*255);
      }prior=row;
    }
  }
  return{width:w,height:h,data:out};
}
module.exports={PNG:{sync:{read,write}}};
