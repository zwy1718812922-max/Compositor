using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

internal sealed class AiService {
    readonly string basePath,root;readonly Action<object> progress;Process worker;
    static JavaScriptSerializer Json(){return new JavaScriptSerializer {MaxJsonLength=256*1024*1024};}
    public AiService(string path,string cache,Action<object> callback){basePath=path;root=cache;progress=callback;}
    public bool Cancel(){var p=worker;if(p==null)return false;try { using(var killer=Process.Start(new ProcessStartInfo("taskkill.exe","/PID "+p.Id+" /T /F") {CreateNoWindow=true,UseShellExecute=false,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardOutput=true,RedirectStandardError=true})){killer.WaitForExit();} }catch(InvalidOperationException){}return true;}
    public Task<object> Run(Dictionary<string,object> input){return Task.Run<object>(()=>Execute(input));}
    object Execute(Dictionary<string,object> input){
        var task=input.ContainsKey("task")?Convert.ToString(input["task"]):"status";
        if(task!="status"&&task!="install"&&task!="infer"&&task!="beautyStatus"&&task!="beautyInstall"&&task!="beautyAnalyze"&&task!="beautyInfer")throw new Exception("未知 AI 操作。");
        var python=Path.Combine(root,"runtime","python.exe");
        if((task=="status"||task=="beautyStatus")&&!File.Exists(python))return new {installed=false,ready=false,devices=new string[0]};
        if(worker!=null)throw new Exception("AI 任务正在运行，请先取消或等待完成。");
        if(task!="install"&&!File.Exists(python))throw new Exception("请先安装本地 AI 组件。");
        string arguments;
        if(task=="install")arguments="-NoProfile -ExecutionPolicy Bypass -File \""+Path.Combine(basePath,"ai","install.ps1")+"\" -Root \""+root+"\"";
        else arguments="\""+Path.Combine(basePath,"ai",task=="beautyInstall"?"beauty-install.py":task.StartsWith("beauty")?"beauty.py":"segment.py")+"\"";
        var info=new ProcessStartInfo(task=="install"?"powershell.exe":python,arguments){CreateNoWindow=true,UseShellExecute=false,WindowStyle=ProcessWindowStyle.Hidden,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};
        info.EnvironmentVariables["PYTHONIOENCODING"]="utf-8";info.EnvironmentVariables["OPENVINO_TELEMETRY_DISABLED"]="1";
        var process=new Process {StartInfo=info};worker=process;
        try {
            if(!process.Start())throw new Exception("无法启动本地 AI 组件。");
            var error=process.StandardError.ReadToEndAsync();
            if(task!="install"){var job=new Dictionary<string,object>(input);job["root"]=root;var bytes=Encoding.UTF8.GetBytes(Json().Serialize(job));process.StandardInput.BaseStream.Write(bytes,0,bytes.Length);process.StandardInput.BaseStream.Flush();}process.StandardInput.Close();
            object result=null;string failure=null,line;
            while((line=process.StandardOutput.ReadLine())!=null){if(String.IsNullOrWhiteSpace(line))continue;var message=Json().DeserializeObject(line) as Dictionary<string,object>;if(message==null)continue;if(message.ContainsKey("progress"))progress(message);if(message.ContainsKey("result"))result=message["result"];if(message.ContainsKey("error"))failure=Convert.ToString(message["error"]);}
            process.WaitForExit();if(failure!=null)throw new Exception(failure);if(result==null)throw new Exception(process.ExitCode!=0?"本地 AI 任务已取消或失败："+error.Result:"AI 组件未返回结果。");return result;
        }finally{worker=null;process.Dispose();}
    }
}
