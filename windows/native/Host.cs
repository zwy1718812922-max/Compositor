using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program {
    [STAThread] static void Main() {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new EditorWindow());
    }
}
internal sealed class StartupPanel : Panel {
    readonly Timer timer = new Timer(); float phase;
    public StartupPanel() { DoubleBuffered = true; Dock = DockStyle.Fill; BackColor = Color.FromArgb(37,37,37); timer.Interval = 20; timer.Tick += delegate { phase = (phase + .015f) % 1; Invalidate(); }; timer.Start(); }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e); var g=e.Graphics; g.SmoothingMode=System.Drawing.Drawing2D.SmoothingMode.AntiAlias; int cx=Width/2,cy=Height/2;
        using(var pen=new Pen(Color.FromArgb(80,150,223),2)) g.DrawRectangle(pen,cx-35,cy-140,70,70);
        using(var font=new Font("Segoe UI",36)) using(var brush=new SolidBrush(Color.FromArgb(155,201,250))) g.DrawString("C",font,brush,cx-26,cy-140);
        using(var font=new Font("Segoe UI",25)) using(var brush=new SolidBrush(Color.Gainsboro)) { var s=g.MeasureString("Compositor",font); g.DrawString("Compositor",font,brush,cx-s.Width/2,cy-48); }
        using(var font=new Font("Microsoft YaHei",10)) using(var brush=new SolidBrush(Color.Silver)) { var s=g.MeasureString("中文版 · Windows 11",font);g.DrawString("中文版 · Windows 11",font,brush,cx-s.Width/2,cy+1);g.DrawString("正在准备编辑工作区…",font,brush,cx-83,cy+66); }
        using(var brush=new SolidBrush(Color.FromArgb(65,65,65)))g.FillRectangle(brush,cx-110,cy+50,220,3);
        g.SetClip(new Rectangle(cx-110,cy+50,220,3));using(var brush=new SolidBrush(Color.FromArgb(77,154,235)))g.FillRectangle(brush,cx-210+phase*420,cy+50,100,3);g.ResetClip();
    }
    protected override void Dispose(bool disposing) { if(disposing)timer.Dispose();base.Dispose(disposing); }
}
internal sealed class EditorWindow : Form {
    readonly Dictionary<string,string> imports = new Dictionary<string,string>();
    readonly Dictionary<string,Stream> importStreams = new Dictionary<string,Stream>();
    const string Origin="https://compositor.local/",PageUrl=Origin+"src/index.html";
    const int MaxBytes=128*1024*1024;
    readonly WebView2 web=new WebView2();readonly StartupPanel splash=new StartupPanel();
    readonly bool testing=Environment.GetEnvironmentVariable("COMPOSITOR_TEST")=="1";
    bool dirty;string currentPath,pendingPath,exportPath,mockOpen,mockSave;
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hwnd,int message,IntPtr wParam,IntPtr lParam);
    static JavaScriptSerializer Json() { return new JavaScriptSerializer { MaxJsonLength=256*1024*1024,RecursionLimit=128 }; }
    static Dictionary<string,object> Object(object value) { return value as Dictionary<string,object> ?? new Dictionary<string,object>(); }
    static object Get(Dictionary<string,object> value,string key) { object result;return value.TryGetValue(key,out result)?result:null; }
    static string StringValue(object value) { return value as string ?? ""; }
    static string Field(Dictionary<string,object> value,string key) { return StringValue(Get(value,key)); }
    static bool Flag(object value) { return value is bool && (bool)value; }
    static double Number(object value) { return Convert.ToDouble(value); }
    public EditorWindow() {
        Text="Compositor 中文版 0.8.0"; ClientSize=new Size(1440,960);MinimumSize=new Size(1024,720);StartPosition=FormStartPosition.CenterScreen;
        FormBorderStyle=FormBorderStyle.None;BackColor=Color.FromArgb(38,38,38);Padding=new Padding(1);AutoScaleMode=AutoScaleMode.Dpi;
        MaximizedBounds=Screen.FromControl(this).WorkingArea;var icon=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"assets","icon.ico");if(File.Exists(icon))Icon=new Icon(icon);
        web.Dock=DockStyle.Fill;web.DefaultBackgroundColor=BackColor;Controls.Add(web);Controls.Add(splash);splash.BringToFront();
        Load+=async delegate { await Initialize(); };
        FormClosing+=delegate(object sender,FormClosingEventArgs e){if(!dirty&&ai!=null)ai.Cancel();if(dirty&&web.CoreWebView2!=null){e.Cancel=true;Command("close");}};
    }
    async Task Initialize() {
        try {
            var profile=Environment.GetEnvironmentVariable("COMPOSITOR_PROFILE");if(String.IsNullOrEmpty(profile))profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CompositorZH","WebView2");
            var options=new CoreWebView2EnvironmentOptions();options.Language="zh-CN";var port=Environment.GetEnvironmentVariable("COMPOSITOR_DEBUG_PORT");int debugPort;if(testing&&Int32.TryParse(port,out debugPort)&&debugPort>0&&debugPort<65536)options.AdditionalBrowserArguments="--remote-debugging-port="+debugPort;
            var environment=await CoreWebView2Environment.CreateAsync(null,profile,options);await web.EnsureCoreWebView2Async(environment);
            var core=web.CoreWebView2;core.SetVirtualHostNameToFolderMapping("compositor.local",AppDomain.CurrentDomain.BaseDirectory,CoreWebView2HostResourceAccessKind.DenyCors);
            core.AddWebResourceRequestedFilter("https://compositor-import.local/_import/*",CoreWebView2WebResourceContext.All);
            core.WebResourceRequested+=delegate(object sender,CoreWebView2WebResourceRequestedEventArgs e){
                var token=new Uri(e.Request.Uri).AbsolutePath.Substring("/_import/".Length);string file;
                if(e.Request.Method!="GET"||!imports.TryGetValue(token,out file)){e.Response=core.Environment.CreateWebResourceResponse(null,404,"Not Found","Cache-Control: no-store");return;}
                imports.Remove(token);
                try {var stream=File.OpenRead(file);importStreams[token]=stream;e.Response=core.Environment.CreateWebResourceResponse(stream,200,"OK","Content-Type: application/octet-stream\r\nAccess-Control-Allow-Origin: https://compositor.local\r\nCache-Control: no-store");}
                catch {e.Response=core.Environment.CreateWebResourceResponse(null,404,"Not Found","Cache-Control: no-store");}
            };
            FormClosed+=delegate {foreach(var stream in importStreams.Values)stream.Dispose();importStreams.Clear();imports.Clear();};
            core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.AreDevToolsEnabled=testing;core.Settings.IsStatusBarEnabled=false;core.Settings.IsZoomControlEnabled=false;
            core.Settings.IsGeneralAutofillEnabled=false;core.Settings.IsPasswordAutosaveEnabled=false;
            core.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e){if(e.Uri!=PageUrl)e.Cancel=true;};
            core.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
            core.PermissionRequested+=delegate(object sender,CoreWebView2PermissionRequestedEventArgs e){e.State=CoreWebView2PermissionState.Deny;};
            core.DownloadStarting+=delegate(object sender,CoreWebView2DownloadStartingEventArgs e){e.Cancel=true;};
            core.WebMessageReceived+=ReceiveMessage;
            var bridge=File.ReadAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"native","bridge.js"),Encoding.UTF8);
            await core.AddScriptToExecuteOnDocumentCreatedAsync((testing?"window.__COMPOSITOR_TEST_HOST__=true;":"")+bridge);
            core.Navigate(PageUrl);
        } catch(Exception error) {
            MessageBox.Show(this,"无法启动编辑器："+error.Message+"\n\n请确认已安装 Microsoft Edge WebView2 运行时。\n官方下载：https://developer.microsoft.com/microsoft-edge/webview2/","Compositor 启动",MessageBoxButtons.OK,MessageBoxIcon.Error);Close();
        }
    }
    async void ReceiveMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e) {
        if(e.Source!=PageUrl)return;
        int id=0;
        try { var request=Object(Json().DeserializeObject(e.WebMessageAsJson));id=Convert.ToInt32(Get(request,"id"));var value=await Dispatch(Field(request,"method"),Get(request,"payload"));if(!IsDisposed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(Json().Serialize(new { id,result=new {ok=true,value} })); }
        catch(Exception error) { if(!IsDisposed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(Json().Serialize(new {id,result=new {ok=false,error=error.Message}})); }
    }
    void Command(string action) { web.CoreWebView2.PostWebMessageAsJson(Json().Serialize(new {command=action})); }
    string OpenPath(string filter,bool images=false) { if(testing&&!String.IsNullOrEmpty(mockOpen))return mockOpen;using(var d=new OpenFileDialog { Title=images?"导入图片为图层":"打开项目或 PSD",Filter=filter,CheckFileExists=true,Multiselect=images })return d.ShowDialog(this)==DialogResult.OK?d.FileName:null; }
    string SavePath(string filter,string name) { if(testing&&!String.IsNullOrEmpty(mockSave))return mockSave;using(var d=new SaveFileDialog { Title="选择保存位置",Filter=filter,FileName=name,AddExtension=true,OverwritePrompt=true })return d.ShowDialog(this)==DialogResult.OK?d.FileName:null; }
    static byte[] ReadBytes(string file) { if(new FileInfo(file).Length>MaxBytes)throw new Exception("文件超过 128 MB。");return File.ReadAllBytes(file); }
    static void AtomicWrite(string file,byte[] data) {
        if(data.Length>MaxBytes)throw new Exception("文件超过 128 MB。");file=Path.GetFullPath(file);var temp=Path.Combine(Path.GetDirectoryName(file),"."+Path.GetFileName(file)+"."+Guid.NewGuid()+".tmp");
        try { File.WriteAllBytes(temp,data);if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file); }finally {if(File.Exists(temp))File.Delete(temp);}
    }
    AiService ai;
    async Task<object> Dispatch(string method,object payload) {
        var p=Object(payload);
        switch(method) {
            case "ai:cancel":return ai!=null&&ai.Cancel();
            case "ai:run":if(ai==null)ai=new AiService(AppDomain.CurrentDomain.BaseDirectory,Environment.GetEnvironmentVariable("COMPOSITOR_AI_ROOT")??Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"CompositorZH","AI"),data=>{if(!IsDisposed)BeginInvoke(new Action(()=>web.CoreWebView2.PostWebMessageAsJson(Json().Serialize(new {aiProgress=data}))));});return await ai.Run(p);
            case "fonts:list":return await Task.Run(()=>FontCatalog.Read());
            case "color:profile":{var file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows),"System32","spool","drivers","color","RSWOP.icm");if(StringValue(payload)=="custom")file=OpenPath("CMYK ICC 配置文件|*.icc;*.icm");if(file==null)return null;var b=await Task.Run(()=>ReadBytes(file));if(b.Length<128||b.Length>4*1024*1024||Encoding.ASCII.GetString(b,36,4)!="acsp"||Encoding.ASCII.GetString(b,16,4)!="CMYK")throw new Exception("请选择 CMYK ICC 配置文件。");return Convert.ToBase64String(b);}
            case "renderer:ready":splash.Hide();splash.Dispose();return true;
            case "document:dirty":dirty=Flag(payload);return true;
            case "document:commit":currentPath=Get(p,"kind")!=null?StringValue(Get(p,"path")):StringValue(payload)=="open"?pendingPath:null;if(String.IsNullOrEmpty(currentPath))currentPath=null;pendingPath=null;return true;
            case "document:close":if(!dirty)Close();return true;
            case "window:drag":ReleaseCapture();SendMessage(Handle,0xA1,(IntPtr)2,IntPtr.Zero);return true;
            case "window:action":switch(StringValue(payload)){case "minimize":WindowState=FormWindowState.Minimized;break;case "maximize":WindowState=WindowState==FormWindowState.Maximized?FormWindowState.Normal:FormWindowState.Maximized;break;case "close":Close();break;default:throw new Exception("未知窗口操作。");}return true;
            case "project:open": {
                var file=StringValue(payload);if(!String.IsNullOrEmpty(file)){if(!Path.IsPathRooted(file)||(!String.Equals(Path.GetExtension(file),".ccomp",StringComparison.OrdinalIgnoreCase)&&!String.Equals(Path.GetExtension(file),".psd",StringComparison.OrdinalIgnoreCase)))throw new Exception("最近项目路径无效。");}else file=OpenPath("项目和 Photoshop 文件|*.ccomp;*.psd|Compositor 项目|*.ccomp|Photoshop PSD|*.psd");if(file==null)return null;
                var name=Path.GetFileNameWithoutExtension(file);if(Path.GetExtension(file).ToLowerInvariant()==".psd"){if(new FileInfo(file).Length>MaxBytes)throw new Exception("文件超过 128 MB。");pendingPath=null;var token=Guid.NewGuid().ToString("N");imports.Clear();imports[token]=file;return new {source="psd",path=file,name,url="https://compositor-import.local/_import/"+token};}
                var bytes=await Task.Run(()=>ReadBytes(file));
                var project=Json().DeserializeObject(Encoding.UTF8.GetString(bytes));pendingPath=file;return new {project,path=file,name};
            }
            case "project:save": {
                var project=Object(Get(p,"project"));if(Field(project,"format")!="com.compositor.windows"||Number(Get(project,"version"))<1||Number(Get(project,"version"))>6)throw new Exception("项目格式无效。");
                var file=currentPath;if(file==null||Flag(Get(p,"saveAs")))file=SavePath("Compositor 项目|*.ccomp",file??"未命名.ccomp");if(file==null)return null;
                var bytes=Encoding.UTF8.GetBytes(Json().Serialize(project));await Task.Run(()=>AtomicWrite(file,bytes));currentPath=file;return new {path=file,name=Path.GetFileNameWithoutExtension(file)};
            }
            case "image:import": {
                string[] files;if(testing&&!String.IsNullOrEmpty(mockOpen))files=new[]{mockOpen};else using(var d=new OpenFileDialog {Title="导入图片为图层",Filter="图片|*.png;*.jpg;*.jpeg;*.webp;*.bmp",Multiselect=true}){if(d.ShowDialog(this)!=DialogResult.OK)return new object[0];files=d.FileNames;}
                var output=new List<object>();long total=0;foreach(var file in files){total+=new FileInfo(file).Length;if(total>MaxBytes)throw new Exception("导入图片总大小超过 128 MB。");var ext=Path.GetExtension(file).ToLowerInvariant();var mime=ext==".png"?"image/png":ext==".jpg"||ext==".jpeg"?"image/jpeg":ext==".webp"?"image/webp":ext==".bmp"?"image/bmp":null;if(mime==null)throw new Exception("不支持此图片格式。");var bytes=await Task.Run(()=>ReadBytes(file));output.Add(new {name=Path.GetFileName(file),data="data:"+mime+";base64,"+Convert.ToBase64String(bytes)});}return output;
            }
            case "image:export": {
                var format=Field(p,"format");if(format!="png"&&format!="jpeg")throw new Exception("图片格式无效。");var file=SavePath(format=="png"?"PNG 图片|*.png":"JPEG 图片|*.jpg",format=="png"?"作品.png":"作品.jpg");if(file==null)return null;var bytes=Convert.FromBase64String(Field(p,"data"));await Task.Run(()=>AtomicWrite(file,bytes));return file;
            }
            case "project:release":{var token=StringValue(payload);Stream stream;if(token!=null&&importStreams.TryGetValue(token,out stream)){importStreams.Remove(token);stream.Dispose();}if(token!=null)imports.Remove(token);return true;}
            case "psd:select":exportPath=SavePath("Photoshop PSD|*.psd","作品.psd");return exportPath;
            case "psd:write": { if(exportPath==null||Field(p,"path")!=exportPath)throw new Exception("PSD 保存位置无效。");var file=exportPath;var bytes=Convert.FromBase64String(Field(p,"data"));await Task.Run(()=>AtomicWrite(file,bytes));exportPath=null;return file; }
            case "image:copy": {
                var data=StringValue(payload);if(!data.StartsWith("data:image/png;base64,"))throw new Exception("剪贴板图片格式无效。");var bytes=Convert.FromBase64String(data.Substring(22));if(bytes.Length>MaxBytes)throw new Exception("图片超过 128 MB。");
                using(var stream=new MemoryStream(bytes))using(var image=Image.FromStream(stream)){if(image.Width>16384||image.Height>16384||(long)image.Width*image.Height>64*1024*1024)throw new Exception("图片尺寸超出限制。");var obj=new DataObject();obj.SetData("PNG",false,new MemoryStream(bytes));obj.SetData(DataFormats.Bitmap,true,new Bitmap(image));Clipboard.SetDataObject(obj,true);}return true;
            }
            case "image:paste": {
                if(Clipboard.ContainsData("PNG")){var stream=Clipboard.GetData("PNG") as MemoryStream;if(stream!=null){var bytes=stream.ToArray();if(bytes.Length>MaxBytes)throw new Exception("剪贴板图片超过 128 MB。");return "data:image/png;base64,"+Convert.ToBase64String(bytes);}}
                if(!Clipboard.ContainsImage())return null;using(var image=Clipboard.GetImage())using(var stream=new MemoryStream()){if(image.Width>16384||image.Height>16384||(long)image.Width*image.Height>64*1024*1024)throw new Exception("剪贴板图片尺寸超出限制。");image.Save(stream,ImageFormat.Png);return "data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());}
            }
            case "test:configure": {
                if(!testing)throw new Exception("测试接口未启用。");if(Get(p,"open")!=null)mockOpen=Field(p,"open");if(Get(p,"save")!=null)mockSave=Field(p,"save");if(Get(p,"command")!=null)Command(Field(p,"command"));if(Get(p,"width")!=null&&Get(p,"height")!=null)ClientSize=new Size((int)Number(Get(p,"width")),(int)Number(Get(p,"height")));if(Flag(Get(p,"exit"))){dirty=false;Close();}return true;
            }
            default:throw new Exception("未知操作。");
        }
    }
    protected override void WndProc(ref Message m) {
        const int hitTest=0x84;if(m.Msg==hitTest){base.WndProc(ref m);if(WindowState==FormWindowState.Normal){int x=(short)(m.LParam.ToInt64()&65535),y=(short)((m.LParam.ToInt64()>>16)&65535);var p=PointToClient(new Point(x,y));int border=6;bool l=p.X<border,r=p.X>ClientSize.Width-border,t=p.Y<border,b=p.Y>ClientSize.Height-border;int hit=l?(t?13:b?16:10):r?(t?14:b?17:11):t?12:b?15:0;if(hit!=0)m.Result=(IntPtr)hit;}return;}base.WndProc(ref m);
    }
}
