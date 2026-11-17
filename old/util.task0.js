export const SYM = { RUB: '₽', USD: '$', EUR: '€' }
export const CURRENCIES = ['RUB', 'USD', 'EUR']
export const fmt = (n, cur = 'RUB') =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(Math.round(n * 100) / 100) + ' ' + (SYM[cur] || cur)
export const uid = () => Math.random().toString(36).slice(2, 10)
export const pad = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hm = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

export function evalExpr(s) {
  s = s.replace(/−/g, '-')
  const t = s.match(/(\d+\.?\d*|\.\d+|[+\-−×÷])/g)
  if (!t) return 0
  while (t.length && /^[+\-−×÷]$/.test(t[t.length - 1])) t.pop()
  if (!t.length) return 0
  const st = [parseFloat(t[0])]
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i], v = parseFloat(t[i + 1])
    if (op === '×') st[st.length - 1] *= v
    else if (op === '÷') st[st.length - 1] = v ? st[st.length - 1] / v : 0
    else st.push(op, v)
  }
  let r = st[0]
  for (let i = 1; i < st.length; i += 2) r = st[i] === '+' ? r + st[i + 1] : r - st[i + 1]
  return Math.round(r * 100) / 100
}

export function press(expr, key) {
  const last = expr.slice(-1)
  if (key === '⌫') return expr.slice(0, -1)
  if (/[+\-−×÷]/.test(key)) {
    if (!expr) return expr
    return /[+\-−×÷]/.test(last) ? expr.slice(0, -1) + key : expr + key
  }
  if (key === '.') {
    const cur = expr.split(/[+\-−×÷]/).pop()
    if (cur.includes('.')) return expr
    return expr + (cur === '' ? '0.' : '.')
  }
  return expr + key
}

export function periodRange(kind, anchor) {
  const a = new Date(anchor)
  if (kind === 'day') { const s = startOfDay(a); return [s, new Date(s.getTime() + 864e5)] }
  if (kind === 'month') return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 1)]
  return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear() + 1, 0, 1)]
}
export function shiftAnchor(kind, anchor, dir) {
  const a = new Date(anchor)
  if (kind === 'day') a.setDate(a.getDate() + dir)
  else if (kind === 'month') a.setMonth(a.getMonth() + dir, 1)
  else a.setFullYear(a.getFullYear() + dir, 0, 1)
  return a
}
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
export function periodLabel(kind, anchor) {
  const a = new Date(anchor)
  if (kind === 'day') return a.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  if (kind === 'month') return `${MONTHS[a.getMonth()]} ${a.getFullYear()} г.`
  return `${a.getFullYear()} г.`
}

export function toCSV(state) {
  const acc = Object.fromEntries(state.accounts.map((a) => [a.id, a]))
  const cat = Object.fromEntries(state.categories.map((c) => [c.id, c]))
  const rows = [['Дата', 'Время', 'Тип', 'Счёт', 'Категория', 'Сумма', 'Валюта', 'Заметка']]
  ;[...state.transactions].sort((a, b) => a.ts - b.ts).forEach((t) => {
    const d = new Date(t.ts)
    rows.push([ymd(d), hm(t.ts), t.type === 'expense' ? 'Расход' : 'Доход', acc[t.accountId]?.name || '', cat[t.categoryId]?.name || '', t.amount, acc[t.accountId]?.currency || '', t.note || ''])
  })
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
}
