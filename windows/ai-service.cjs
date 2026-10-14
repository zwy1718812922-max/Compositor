const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
function createAiService(progress){
 const root=process.env.COMPOSITOR_AI_ROOT||path.join(process.env.LOCALAPPDATA,'CompositorZH','AI'),base=__dirname.replace('app.asar','app.asar.unpacked');let worker;
 function cancel(){if(!worker)return false;spawn('taskkill.exe',['/PID',String(worker.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});return true;}
 function run(input={task:'status'}){
  if(!['status','install','infer','beautyStatus','beautyInstall','beautyAnalyze','beautyInfer'].includes(input.task))return Promise.reject(new Error('未知 AI 操作。'));
  const python=path.join(root,'runtime','python.exe');if(['status','beautyStatus'].includes(input.task)&&!fs.existsSync(python))return Promise.resolve({installed:false,ready:false,devices:[]});
  if(worker)return Promise.reject(new Error('AI 任务正在运行，请先取消或等待完成。'));if(input.task!=='install'&&!fs.existsSync(python))return Promise.reject(new Error('请先安装本地 AI 组件。'));
  return new Promise((resolve,reject)=>{
   let result,failure,buffer='',errors='';const install=input.task==='install';
   const script=input.task==='beautyInstall'?'beauty-install.py':input.task.startsWith('beauty')?'beauty.py':'segment.py';
   const process=spawn(install?'powershell.exe':python,install?['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(base,'ai','install.ps1'),'-Root',root]:[path.join(base,'ai',script)],{windowsHide:true,env:{...global.process.env,PYTHONIOENCODING:'utf-8',OPENVINO_TELEMETRY_DISABLED:'1'}});worker=process;
   process.stdout.setEncoding('utf8');process.stdout.on('data',chunk=>{buffer+=chunk;let next;while((next=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,next).trim();buffer=buffer.slice(next+1);if(!line)continue;try{const m=JSON.parse(line);if(m.progress!==undefined)progress(m);if(m.result)result=m.result;if(m.error)failure=m.error;}catch{failure='AI 组件返回数据无效。';}}});
   process.stderr.on('data',c=>{errors=(errors+c).slice(-4000);});process.on('error',e=>{worker=null;reject(e);});process.on('close',code=>{worker=null;result?resolve(result):reject(new Error(failure||('本地 AI 任务已取消或失败：'+errors)));});
   process.stdin.on('error',()=>{});process.stdin.end(install?'':JSON.stringify({...input,root}));
  });
 }
 return {run,cancel};
}
module.exports={createAiService};
