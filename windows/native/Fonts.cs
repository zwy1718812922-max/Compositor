using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class FontCatalog {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct LogFont {
        public int height,width,escapement,orientation,weight;
        public byte italic,underline,strikeout,charset,outPrecision,clipPrecision,quality,pitch;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string face;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct EnumFont {
        public LogFont font;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=64)] public string fullName;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string style;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=32)] public string script;
    }
    delegate int Callback(IntPtr font,IntPtr metrics,uint type,IntPtr data);
    [DllImport("user32.dll")] static extern IntPtr GetDC(IntPtr window);
    [DllImport("user32.dll")] static extern int ReleaseDC(IntPtr window,IntPtr dc);
    [DllImport("gdi32.dll",CharSet=CharSet.Unicode)] static extern int EnumFontFamiliesEx(IntPtr dc,ref LogFont font,Callback callback,IntPtr data,uint flags);
    public sealed class Style { public string name; public int weight; public bool italic; }
    public sealed class Family { public string family; public List<Style> styles=new List<Style>(); }
    public static List<Family> Read() {
        var catalog=new SortedDictionary<string,Family>(StringComparer.CurrentCultureIgnoreCase);var dc=GetDC(IntPtr.Zero);
        try {
            var query=new LogFont { charset=1, face="" };
            Callback callback=delegate(IntPtr pointer,IntPtr metrics,uint type,IntPtr data) {
                var f=(EnumFont)Marshal.PtrToStructure(pointer,typeof(EnumFont));var name=f.font.face;
                if(String.IsNullOrWhiteSpace(name)||name.StartsWith("@"))return 1;
                Family family;if(!catalog.TryGetValue(name,out family)){family=new Family {family=name};catalog.Add(name,family);}
                var style=new Style {name=String.IsNullOrEmpty(f.style)?"Regular":f.style,weight=Math.Max(100,Math.Min(900,f.font.weight)),italic=f.font.italic!=0};
                if(!family.styles.Exists(s=>s.weight==style.weight&&s.italic==style.italic))family.styles.Add(style);return 1;
            };
            EnumFontFamiliesEx(dc,ref query,callback,IntPtr.Zero,0);
            // An empty face enumerates families. A second pass enumerates each family's faces.
            var families=new List<Family>(catalog.Values);
            foreach(var family in families){family.styles.Clear();query.face=family.family;EnumFontFamiliesEx(dc,ref query,callback,IntPtr.Zero,0);}
            GC.KeepAlive(callback);
        } finally {ReleaseDC(IntPtr.Zero,dc);}
        return new List<Family>(catalog.Values);
    }
}
