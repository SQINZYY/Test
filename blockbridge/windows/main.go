//go:build windows

// BlockBridge für Windows: ein Fenster mit der eingebauten Edge-WebView2, das die
// Oberfläche aus dist/ (eingebettet) anzeigt. Speichern, "In Minecraft öffnen" und
// "Öffnen mit …" laufen über die hier gebundenen Funktionen.
package main

import (
	"embed"
	"encoding/base64"
	"encoding/json"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"github.com/jchv/go-webview2"
)

//go:embed all:web
var webFiles embed.FS

var version = "1.0.0"

var (
	shell32           = syscall.NewLazyDLL("shell32.dll")
	procShellExecuteW = shell32.NewProc("ShellExecuteW")
	comdlg32          = syscall.NewLazyDLL("comdlg32.dll")
	procGetSaveFileW  = comdlg32.NewProc("GetSaveFileNameW")
	user32            = syscall.NewLazyDLL("user32.dll")
	procMessageBoxW   = user32.NewProc("MessageBoxW")
)

func utf16(s string) *uint16 {
	p, _ := syscall.UTF16PtrFromString(s)
	return p
}

func shellExecute(verb, file, params string) bool {
	var v, p *uint16
	if verb != "" {
		v = utf16(verb)
	}
	if params != "" {
		p = utf16(params)
	}
	r, _, _ := procShellExecuteW.Call(0, uintptr(unsafe.Pointer(v)), uintptr(unsafe.Pointer(utf16(file))), uintptr(unsafe.Pointer(p)), 0, 1)
	return r > 32 // laut Doku: Werte > 32 bedeuten Erfolg
}

func messageBox(text, title string) {
	procMessageBoxW.Call(0, uintptr(unsafe.Pointer(utf16(text))), uintptr(unsafe.Pointer(utf16(title))), 0x40)
}

// OPENFILENAMEW (commdlg.h), Layout für 64 Bit
type openFileName struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	flagsEx           uint32
}

const (
	ofnOverwritePrompt = 0x00000002
	ofnNoChangeDir     = 0x00000008
	ofnPathMustExist   = 0x00000800
	ofnExplorer        = 0x00080000
)

// Speichern-Dialog; gibt den gewählten Pfad zurück oder "" bei Abbruch.
func saveDialog(owner uintptr, name string) string {
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
	label := map[string]string{"mcpack": "Minecraft-Paket", "mcaddon": "Minecraft-Add-on", "zip": "ZIP-Archiv", "png": "PNG-Bild"}[ext]
	if label == "" {
		label = "Datei"
	}
	filter := label + " (*." + ext + ")\x00*." + ext + "\x00Alle Dateien (*.*)\x00*.*\x00\x00"
	filterU, _ := syscall.UTF16FromString(filter)
	buf := make([]uint16, 1024)
	initial, _ := syscall.UTF16FromString(name)
	copy(buf, initial)
	dir := downloadsDir()
	ofn := openFileName{
		hwndOwner:       owner,
		lpstrFilter:     &filterU[0],
		nFilterIndex:    1,
		lpstrFile:       &buf[0],
		nMaxFile:        uint32(len(buf)),
		lpstrInitialDir: utf16(dir),
		lpstrTitle:      utf16("Speichern"),
		flags:           ofnOverwritePrompt | ofnNoChangeDir | ofnPathMustExist | ofnExplorer,
		lpstrDefExt:     utf16(ext),
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	r, _, _ := procGetSaveFileW.Call(uintptr(unsafe.Pointer(&ofn)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf)
}

func downloadsDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Downloads")
}

func cleanName(name string) string {
	r := strings.NewReplacer("\\", "_", "/", "_", ":", "_", "*", "_", "?", "_", "\"", "_", "<", "_", ">", "_", "|", "_")
	n := strings.TrimSpace(r.Replace(name))
	if n == "" {
		n = "BlockBridge"
	}
	return n
}

type result map[string]interface{}

func main() {
	sub, _ := fs.Sub(webFiles, "web")
	mime.AddExtensionType(".js", "application/javascript")
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		messageBox("BlockBridge konnte nicht starten: "+err.Error(), "BlockBridge")
		return
	}
	files := http.FileServer(http.FS(sub))
	go http.Serve(ln, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		files.ServeHTTP(w, r)
	}))

	dataDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "BlockBridge")
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  dataDir,
		WindowOptions: webview2.WindowOptions{
			Title:  "BlockBridge",
			Width:  1000,
			Height: 840,
			IconId: 1,
			Center: true,
		},
	})
	if w == nil {
		messageBox("BlockBridge braucht die „Microsoft Edge WebView2 Runtime“ (in Windows 10/11 normalerweise schon vorhanden).\n\nSie wird jetzt im Browser geöffnet – nach der Installation BlockBridge neu starten.", "BlockBridge")
		shellExecute("open", "https://developer.microsoft.com/microsoft-edge/webview2/", "")
		return
	}
	defer w.Destroy()
	w.SetSize(400, 520, webview2.HintMin)
	hwnd := uintptr(w.Window())

	done := func(id string, res result) {
		b, _ := json.Marshal(res)
		w.Eval("window.__bbDone && window.__bbDone(" + jsonString(id) + "," + jsonString(string(b)) + ")")
	}

	// Speichern: Dialog erst nach Rückkehr aus dem WebView2-Ereignis zeigen (Dispatch)
	w.Bind("bbSave", func(id, name, b64 string) {
		data, err := base64.StdEncoding.DecodeString(b64)
		w.Dispatch(func() {
			if err != nil {
				done(id, result{"ok": false, "error": "Daten fehlerhaft"})
				return
			}
			path := saveDialog(hwnd, cleanName(name))
			if path == "" {
				done(id, result{"ok": false, "canceled": true})
				return
			}
			if err := os.WriteFile(path, data, 0o644); err != nil {
				done(id, result{"ok": false, "error": err.Error()})
				return
			}
			done(id, result{"ok": true, "path": path})
		})
	})

	// In Minecraft öffnen: in den Temp-Ordner schreiben und mit dem zuständigen Programm öffnen
	w.Bind("bbOpen", func(id, name, b64 string) {
		data, err := base64.StdEncoding.DecodeString(b64)
		w.Dispatch(func() {
			if err != nil {
				done(id, result{"ok": false, "error": "Daten fehlerhaft"})
				return
			}
			dir := filepath.Join(os.TempDir(), "BlockBridge")
			_ = os.MkdirAll(dir, 0o755)
			path := filepath.Join(dir, cleanName(name))
			if err := os.WriteFile(path, data, 0o644); err != nil {
				done(id, result{"ok": false, "error": err.Error()})
				return
			}
			if !shellExecute("open", path, "") {
				done(id, result{"ok": false, "error": "Minecraft (Bedrock Edition) scheint nicht installiert zu sein."})
				return
			}
			done(id, result{"ok": true, "path": path})
		})
	})

	w.Bind("bbShowInFolder", func(path string) {
		if _, err := os.Stat(path); err == nil {
			shellExecute("open", "explorer.exe", "/select,\""+path+"\"")
		}
	})

	// Dateien, die per "Öffnen mit" oder Ziehen auf die EXE übergeben wurden
	startupDone := false
	w.Bind("bbStartupFiles", func() []result {
		out := []result{}
		if startupDone {
			return out
		}
		startupDone = true
		for _, a := range os.Args[1:] {
			st, err := os.Stat(a)
			if err != nil || st.IsDir() || st.Size() > 500<<20 {
				continue
			}
			data, err := os.ReadFile(a)
			if err != nil {
				continue
			}
			out = append(out, result{"name": filepath.Base(a), "data": base64.StdEncoding.EncodeToString(data)})
		}
		return out
	})

	w.Bind("bbVersion", func() string { return version })

	w.Navigate("http://" + ln.Addr().String() + "/index.html")
	w.Run()
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
