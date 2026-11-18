import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
createRoot(document.getElementById('root')).render(<App />)
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {})

// Auto-update: when the app returns to the foreground, reload if a newer build is published.
const curJs = () => [...document.scripts].map((x) => x.src).find((x) => /assets\/index-.*\.js/.test(x))?.split('/').pop()
const checkUpdate = async () => {
  try {
    const h = await (await fetch('./index.html?t=' + Date.now(), { cache: 'no-store' })).text()
    const m = h.match(/assets\/(index-[^"']+\.js)/)
    if (m && curJs() && m[1] !== curJs()) location.reload()
  } catch {}
}
if (import.meta.env.PROD) {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate() })
  checkUpdate()
}
