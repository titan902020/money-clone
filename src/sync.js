// Shared storage: a private GitHub repo holds data.json. Token lives only in this browser.
const REPO = 'titan902020/money-clone-data', FILE = 'data.json'
const url = `https://api.github.com/repos/${REPO}/contents/${FILE}`
const TK = 'mc-gh'
export const getToken = () => { try { return localStorage.getItem(TK) } catch { return null } }
export const setToken = (t) => localStorage.setItem(TK, t)
export const clearToken = () => localStorage.removeItem(TK)
const hdr = (t) => ({ Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json' })
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o, null, 1))))
const dec = (b) => JSON.parse(decodeURIComponent(escape(atob(b.replace(/\n/g, '')))))
const fail = (r) => Object.assign(new Error('GitHub ' + r.status), { status: r.status })

export async function pull(token) {
  const r = await fetch(url + '?t=' + Date.now(), { headers: hdr(token), cache: 'no-store' })
  if (r.status === 404) return null
  if (!r.ok) throw fail(r)
  const j = await r.json()
  return { sha: j.sha, data: dec(j.content) }
}
export async function push(token, data, sha) {
  const r = await fetch(url, { method: 'PUT', headers: hdr(token), body: JSON.stringify({ message: 'sync', content: enc(data), ...(sha ? { sha } : {}) }) })
  if (!r.ok) throw fail(r)
  return (await r.json()).content.sha
}
