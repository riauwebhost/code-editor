import { useEffect, useMemo, useRef, useState } from 'react'
import { Editor } from '@monaco-editor/react'
import { emmetHTML, emmetCSS } from 'emmet-monaco-es'
import * as Babel from '@babel/standalone'
import './App.css'

type LogItem = { type: 'log' | 'warn' | 'error'; message: string }

const defaultHTML = `<!-- HTML -->\n<div id="app">\n  <h1>Hello Code Editor</h1>\n  <p>Edit HTML/CSS/JS di kiri, hasil di kanan.</p>\n</div>`
const defaultCSS = `/* CSS */\nbody { font-family: system-ui, Arial; padding: 16px; }\n#app h1 { color: #3b82f6; }\n` 
const defaultJS = `// JS (support JSX/TS via Babel)\nconsole.log('Ready!')\n`

function App() {
  const [html, setHtml] = useState<string>(() => {
    const s = localStorage.getItem('ce_saved_html')
    return s !== null ? s : (localStorage.getItem('ce_html') ?? defaultHTML)
  })
  const [css, setCss] = useState<string>(() => {
    const s = localStorage.getItem('ce_saved_css')
    return s !== null ? s : (localStorage.getItem('ce_css') ?? defaultCSS)
  })
  const [js, setJs] = useState<string>(() => {
    const s = localStorage.getItem('ce_saved_js')
    return s !== null ? s : (localStorage.getItem('ce_js') ?? defaultJS)
  })
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('ce_theme') === 'dark')
  const [autorun, setAutorun] = useState<boolean>(() => localStorage.getItem('ce_autorun') !== 'false')
  const [logs, setLogs] = useState<LogItem[]>([])
  const [extCss, setExtCss] = useState<string>(() => (localStorage.getItem('ce_saved_extCss') ?? localStorage.getItem('ce_extCss') ?? ''))
  const [extJs, setExtJs] = useState<string>(() => (localStorage.getItem('ce_saved_extJs') ?? localStorage.getItem('ce_extJs') ?? ''))
  const [leftWidth, setLeftWidth] = useState<number>(() => Number(localStorage.getItem('ce_saved_leftWidth') ?? localStorage.getItem('ce_leftWidth') ?? 50))
  const dragRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const panesRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const [hHtml, setHHtml] = useState<number>(() => Number(localStorage.getItem('ce_saved_hHtml') ?? localStorage.getItem('ce_hHtml') ?? 33))
  const [hCss, setHCss] = useState<number>(() => Number(localStorage.getItem('ce_saved_hCss') ?? localStorage.getItem('ce_hCss') ?? 33))
  const [hJs, setHJs] = useState<number>(() => Number(localStorage.getItem('ce_saved_hJs') ?? localStorage.getItem('ce_hJs') ?? 34))
  const [view, setView] = useState<'split'|'editor'|'preview'>(() => (window.innerWidth < 900 ? 'editor' : 'split'))
  const [width, setWidth] = useState<number>(window.innerWidth)
  const [device, setDevice] = useState<'full'|'mobile'|'tablet'|'desktop'>(() => ((localStorage.getItem('ce_saved_device') as any) ?? (localStorage.getItem('ce_device') as any) ?? 'full'))
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const encoded = params.get('code')
    const hasSaved = !!localStorage.getItem('ce_saved_time')
    if (encoded && !hasSaved) {
      try {
        const json = JSON.parse(decodeURIComponent(atob(encoded)))
        setHtml(json.html ?? html)
        setCss(json.css ?? css)
        setJs(json.js ?? js)
        setExtCss(json.extCss ?? '')
        setExtJs(json.extJs ?? '')
      } catch {}
    }
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.__ce_console__) {
        setLogs((prev) => [...prev, e.data.__ce_console__])
      }
    }
    window.addEventListener('message', onMsg)
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'enter') { e.preventDefault(); runPreview() }
      if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveSnapshot(); setToast('Saved') }
      if (ctrl && e.key.toLowerCase() === 'k') { e.preventDefault(); setLogs([]) }
    }
    window.addEventListener('keydown', onKey)
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('message', onMsg); window.removeEventListener('resize', onResize) }
  }, [])

  useEffect(() => {
    localStorage.setItem('ce_html', html)
  }, [html])
  useEffect(() => {
    localStorage.setItem('ce_css', css)
  }, [css])
  useEffect(() => {
    localStorage.setItem('ce_js', js)
  }, [js])
  useEffect(() => {
    localStorage.setItem('ce_theme', dark ? 'dark' : 'light')
  }, [dark])
  useEffect(() => {
    localStorage.setItem('ce_autorun', String(autorun))
  }, [autorun])
  useEffect(() => { localStorage.setItem('ce_device', device) }, [device])
  useEffect(() => { localStorage.setItem('ce_extCss', extCss) }, [extCss])
  useEffect(() => { localStorage.setItem('ce_extJs', extJs) }, [extJs])
  useEffect(() => { localStorage.setItem('ce_leftWidth', String(leftWidth)) }, [leftWidth])
  useEffect(() => { localStorage.setItem('ce_hHtml', String(hHtml)) }, [hHtml])
  useEffect(() => { localStorage.setItem('ce_hCss', String(hCss)) }, [hCss])
  useEffect(() => { localStorage.setItem('ce_hJs', String(hJs)) }, [hJs])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 1800); return () => clearTimeout(t) } }, [toast])

  const bundle = useMemo(() => buildBundle({ html, css, js, extCss, extJs }), [html, css, js, extCss, extJs])
  const savedState = useMemo(() => ({
    html: localStorage.getItem('ce_saved_html') ?? '',
    css: localStorage.getItem('ce_saved_css') ?? '',
    js: localStorage.getItem('ce_saved_js') ?? '',
    extCss: localStorage.getItem('ce_saved_extCss') ?? '',
    extJs: localStorage.getItem('ce_saved_extJs') ?? ''
  }), [html, css, js, extCss, extJs])
  const isDirty = (savedState.html !== html) || (savedState.css !== css) || (savedState.js !== js) || (savedState.extCss !== extCss) || (savedState.extJs !== extJs)

  useEffect(() => {
    if (autorun) runPreview()
  }, [bundle])

  function buildBundle(input: { html: string; css: string; js: string; extCss: string; extJs: string }) {
    const cssLinks = input.extCss
      .split(/\s+/)
      .filter(Boolean)
      .map((href) => `<link rel="stylesheet" href="${href}">`)
      .join('\n')
    const jsLinks = input.extJs
      .split(/\s+/)
      .filter(Boolean)
      .map((src) => `<script src="${src}"></script>`)
      .join('\n')
    let transpiled = ''
    try {
      transpiled = Babel.transform(input.js, {
        filename: 'index.tsx',
        presets: [
          ['env', { targets: 'defaults' }],
          ['typescript', {}],
          ['react', { runtime: 'automatic' }],
        ],
      }).code || ''
    } catch (e: any) {
      transpiled = `console.error(${JSON.stringify(String(e?.message || e))})`
    }
    const consolePatch = `
      (function(){
        const send = (type, message) => parent.postMessage({__ce_console__: {type, message}}, '*');
        const fmt = (args) => args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
        ['log','warn','error'].forEach(k=>{
          const orig = console[k];
          console[k] = function(...args){ send(k, fmt(args)); try{orig.apply(console,args)}catch{}}
        });
        window.addEventListener('error', (ev)=> send('error', ev.message));
      })();
    `
    const doc = `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        ${cssLinks}
        <style>${input.css}</style>
      </head>
      <body>
        ${input.html}
        ${jsLinks}
        <script>${consolePatch}</script>
        <script>try{${transpiled}}catch(e){console.error(e && e.message || e)}</script>
      </body>
    </html>`
    return doc
  }

  function runPreview() {
    setLogs([])
    const iframe = iframeRef.current
    if (!iframe) return
    const blob = new Blob([bundle], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    iframe.src = url
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  function shareURL() {
    const payload = { html, css, js, extCss, extJs }
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)))
    const url = `${location.origin}${location.pathname}?code=${encoded}`
    navigator.clipboard.writeText(url).catch(() => {})
    alert('Link tersalin ke clipboard')
  }

  function saveSnapshot() {
    localStorage.setItem('ce_saved_html', html)
    localStorage.setItem('ce_saved_css', css)
    localStorage.setItem('ce_saved_js', js)
    localStorage.setItem('ce_saved_extCss', extCss)
    localStorage.setItem('ce_saved_extJs', extJs)
    localStorage.setItem('ce_saved_leftWidth', String(leftWidth))
    localStorage.setItem('ce_saved_hHtml', String(hHtml))
    localStorage.setItem('ce_saved_hCss', String(hCss))
    localStorage.setItem('ce_saved_hJs', String(hJs))
    localStorage.setItem('ce_saved_device', device)
    localStorage.setItem('ce_saved_time', String(Date.now()))
    localStorage.setItem('ce_html', html)
    localStorage.setItem('ce_css', css)
    localStorage.setItem('ce_js', js)
    localStorage.setItem('ce_extCss', extCss)
    localStorage.setItem('ce_extJs', extJs)
    if (location.search) { history.replaceState(null, '', location.pathname) }
  }

  function exportFiles() {
    import('jszip').then(({ default: JSZip }) => {
      import('file-saver').then(({ saveAs }) => {
        const zip = new JSZip()
        zip.file('index.html', html)
        zip.file('style.css', css)
        zip.file('script.js', js)
        zip.generateAsync({ type: 'blob' }).then((content: Blob) => saveAs(content, 'code-editor.zip'))
      })
    })
  }

  function onGutterPointerDown(e: React.PointerEvent) {
    const container = workspaceRef.current
    const rectW = container ? container.getBoundingClientRect().width : window.innerWidth
    const startX = e.clientX
    const start = leftWidth
    let raf = 0
    const onMove = (ev: PointerEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const factor = ev.altKey ? 0.5 : 1
        const delta = (ev.clientX - startX) * factor
        const pct = Math.min(90, Math.max(10, start + (delta / rectW) * 100))
        setLeftWidth(Number(pct.toFixed(2)))
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onVDragPointerDownTop(e: React.PointerEvent) {
    const startY = e.clientY
    const sum = hHtml + hCss
    const container = panesRef.current
    const height = container ? container.getBoundingClientRect().height : window.innerHeight
    let raf = 0
    const onMove = (ev: PointerEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const factor = ev.altKey ? 0.5 : 1
        const deltaPct = ((ev.clientY - startY) / height) * 100 * factor
        let newHtml = Math.min(80, Math.max(10, hHtml + deltaPct))
        let newCss = sum - newHtml
        if (newCss < 10) { newCss = 10; newHtml = sum - 10 }
        if (newCss > 80) { newCss = 80; newHtml = sum - 80 }
        setHHtml(Number(newHtml.toFixed(2)))
        setHCss(Number(newCss.toFixed(2)))
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function onVDragPointerDownMiddle(e: React.PointerEvent) {
    const startY = e.clientY
    const sum = hCss + hJs
    const container = panesRef.current
    const height = container ? container.getBoundingClientRect().height : window.innerHeight
    let raf = 0
    const onMove = (ev: PointerEvent) => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const factor = ev.altKey ? 0.5 : 1
        const deltaPct = ((ev.clientY - startY) / height) * 100 * factor
        let newCss = Math.min(80, Math.max(10, hCss + deltaPct))
        let newJs = sum - newCss
        if (newJs < 10) { newJs = 10; newCss = sum - 10 }
        if (newJs > 80) { newJs = 80; newCss = sum - 80 }
        setHCss(Number(newCss.toFixed(2)))
        setHJs(Number(newJs.toFixed(2)))
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className={dark ? 'app dark' : 'app'}>
      <header className="toolbar">
        <div className="brand">Purwadi Code Editor {isDirty ? '•' : '👨‍💻'}</div>
        <div className="tools">
          <label>
            Theme
            <select value={dark ? 'dark' : 'light'} onChange={(e) => setDark(e.target.value === 'dark')}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Auto-run
            <input type="checkbox" checked={autorun} onChange={(e) => setAutorun(e.target.checked)} />
          </label>
          <button onClick={runPreview}>Run</button>
          <button onClick={() => { saveSnapshot(); setToast('Saved') }}>Save</button>
          <button onClick={() => setLogs([])}>Clear Console</button>
          <button onClick={shareURL}>Share</button>
          <button onClick={exportFiles}>Export</button>
          <label>
            View
            <select value={view} onChange={(e)=> setView(e.target.value as any)}>
              <option value="split">Split</option>
              <option value="editor">Editor</option>
              <option value="preview">Preview</option>
            </select>
          </label>
          <label>
            Device
            <select value={device} onChange={(e)=> setDevice(e.target.value as any)}>
              <option value="full">Full</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
              <option value="desktop">Desktop</option>
            </select>
          </label>
        </div>
      </header>
      <div className="workspace" ref={workspaceRef} style={{ gridTemplateColumns: view==='split' && width>=900 ? `${leftWidth}% 10px ${100 - leftWidth}%` : view==='editor' ? '100% 0 0' : '0 0 100%' }}>
        <div className="panes" ref={panesRef} style={{ gridTemplateRows: `${hHtml}% 6px ${hCss}% 6px ${hJs}% auto` }}>
          <div className="pane">
            <div className="pane-title">HTML</div>
            <Editor height="100%" defaultLanguage="html" theme={dark ? 'vs-dark' : 'light'} value={html} onChange={(v) => setHtml(v || '')} options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true }} onMount={(_, monaco)=>{ try{ emmetHTML(monaco) }catch{} }} />
          </div>
          <div className="vGutter" onPointerDown={onVDragPointerDownTop} />
          <div className="pane">
            <div className="pane-title">CSS</div>
            <Editor height="100%" defaultLanguage="css" theme={dark ? 'vs-dark' : 'light'} value={css} onChange={(v) => setCss(v || '')} options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true }} onMount={(_, monaco)=>{ try{ emmetCSS(monaco) }catch{} }} />
          </div>
          <div className="vGutter" onPointerDown={onVDragPointerDownMiddle} />
          <div className="pane">
            <div className="pane-title">JS / JSX / TS</div>
            <Editor height="100%" defaultLanguage="javascript" theme={dark ? 'vs-dark' : 'light'} value={js} onChange={(v) => setJs(v || '')} options={{ fontSize: 14, minimap: { enabled: false }, automaticLayout: true }} />
          </div>
          <div className="resources">
            <input placeholder="CSS URLs (spasi antar link)" value={extCss} onChange={(e) => setExtCss(e.target.value)} />
            <input placeholder="JS URLs (spasi antar link)" value={extJs} onChange={(e) => setExtJs(e.target.value)} />
          </div>
        </div>
        <div className="gutter" ref={dragRef} onPointerDown={onGutterPointerDown} onDoubleClick={()=> setLeftWidth(50)} />
        <div className="preview">
          <div className="viewport" style={{ width: device==='full' ? '100%' : device==='mobile' ? 375 : device==='tablet' ? 768 : 1280 }}>
            <iframe ref={iframeRef} title="Preview" sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin" />
          </div>
          <div className="console">
            <div className="console-title">Console</div>
            <div className="console-body">
              {logs.map((l, i) => (
                <div key={i} className={`row ${l.type}`}>{l.message}</div>
              ))}
            </div>
          </div>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}

export default App
