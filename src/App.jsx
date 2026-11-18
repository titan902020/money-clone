import React, { useEffect, useMemo, useRef, useState } from 'react'
import Ico from './icons.jsx'
import { Search, SlidersHorizontal, Plus, ChevronDown, ArrowLeftRight, ArrowDownRight, ArrowUpRight, Landmark, ReceiptText, Menu as MenuIcon, ChevronRight, ChevronLeft, BarChart3, PieChart } from 'lucide-react'
import { seed } from './seed.js'
import { pull, push, getToken, setToken, clearToken } from './sync.js'
import { hashPw, randHex, fmt, uid, hm, evalExpr, press, periodRange, shiftAnchor, periodLabel, toCSV, startOfDay, CURRENCIES, SYM, pad } from './util.js'

const CACHE = 'mc-cache', SESS = 'mc-sess'
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) } catch { return null } }
const sessOf = (a) => (a?.hash ? 'ok-' + a.hash.slice(0, 24) : '')
const migrate = (d) => { const b = seed(); return { ...b, ...d, accounts: (d.accounts || b.accounts).map((a) => ({ ...a, archived: !!a.archived })), rates: { ...b.rates, ...(d.rates || {}), MDL: 1 }, theme: d.theme || b.theme } }

function applyRecurring(s) {
  const now = new Date(); const cur = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  let added = [], changed = false
  const recurring = s.recurring.map((r) => {
    let last = r.lastRun || cur.replace(/-\d+$/, (m) => '-' + pad(+m.slice(1) - 1))
    let [y, m] = last.split('-').map(Number); let lr = r.lastRun
    for (;;) {
      m++; if (m > 12) { m = 1; y++ }
      const key = `${y}-${pad(m)}`; if (key > cur) break
      const d = new Date(y, m - 1, Math.min(r.day, 28), 9, 0)
      if (key === cur && d > now) break
      added.push({ id: uid(), type: r.type, accountId: r.accountId, categoryId: r.categoryId, amount: r.amount, ts: d.getTime(), note: 'Автоплатёж: ' + (r.note || '') })
      lr = key; changed = true
    }
    return { ...r, lastRun: lr || cur }
  })
  return changed ? { ...s, recurring, transactions: [...s.transactions, ...added] } : s
}

function Main({ s, setS, sync, onLogout, onDisconnect }) {
  const [route, setRoute] = useState('expense')
  const [modal, setModal] = useState(null)
  const [edit, setEdit] = useState(null)
  const up = (patch) => setS((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch), updatedAt: Date.now() }))
  const updateRates = async (force) => {
    try {
      const j = await (await fetch('./rates.json?t=' + Date.now(), { cache: 'no-store' })).json()
      if (force || j.date !== s.ratesDate) up((p) => ({ rates: { ...p.rates, ...j.rates, MDL: 1 }, ratesDate: j.date }))
      return j.date
    } catch { return null }
  }
  useEffect(() => { updateRates(false) }, [])
  const openEdit = (id) => { setEdit({ id, back: route }); setRoute('edit') }
  const cycleTheme = () => { const o = ['dark', 'black', 'light']; up({ theme: o[(o.indexOf(s.theme) + 1) % o.length] }) }
  const ctx = { s, up, setRoute, setModal, edit, openEdit, cycleTheme, sync, onLogout, onDisconnect, updateRates }
  const main = ['expense', 'income', 'accounts', 'feed', 'menu'].includes(route)
  return (
    <div className="phone">
      {route === 'expense' && <Entry key="e" ctx={ctx} type="expense" />}
      {route === 'income' && <Entry key="i" ctx={ctx} type="income" />}
      {route === 'report' && <Report ctx={ctx} />}
      {route === 'menu' && <Menu ctx={ctx} />}
      {route === 'accounts' && <Accounts ctx={ctx} />}
      {route === 'feed' && <Feed ctx={ctx} />}
      {route === 'edit' && <Edit ctx={ctx} />}
      {route === 'loans' && <Loans ctx={ctx} />}
      {route === 'recurring' && <Recurring ctx={ctx} />}
      {route === 'settings' && <Settings ctx={ctx} />}
      {main && (
        <nav className="tabs">
          {[['expense', ArrowDownRight, 'Расходы'], ['income', ArrowUpRight, 'Доходы'], ['accounts', Landmark, 'Счета'], ['feed', ReceiptText, 'Лента'], ['menu', MenuIcon, 'Меню']].map(([k, I, l]) => (
            <button key={k} className={route === k ? 'on' : ''} onClick={() => setRoute(k)}><span key={route === k ? 'a' : 'b'}>{(s.style || 'maib') === 'maib' ? <I size={24} strokeWidth={route === k ? 2.2 : 1.75} /> : <em>{EM[k]}</em>}</span>{l}</button>
          ))}
        </nav>
      )}
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}

const PALETTE = ['#ff8a2a', '#3d9bff', '#a56bd8', '#2fae6b', '#ffb454', '#e0457b', '#2f55e0', '#8e9aa8', '#f0c987', '#3ecf8e', '#ff6b6b', '#26a6b8']
const EM = { expense: '➖', income: '➕', accounts: '🏦', feed: '🧾', menu: '☰' }

function Header({ title, back, backLabel = 'Меню', ctx, left, right }) {
  return (
    <header className="hdr">
      <div className="hl">{back ? <button className="lnk" onClick={() => ctx.setRoute(back)}>‹ {backLabel}</button> : left}</div>
      <h1>{title}</h1>
      <div className="hr">{right}</div>
    </header>
  )
}

function balances(s) {
  const b = Object.fromEntries(s.accounts.map((a) => [a.id, a.initial || 0]))
  s.transactions.forEach((t) => {
    if (t.type === 'transfer') {
      if (b[t.fromAccountId] !== undefined) b[t.fromAccountId] -= t.amount
      if (b[t.toAccountId] !== undefined) b[t.toAccountId] += t.toAmount ?? t.amount
      return
    }
    if (b[t.accountId] !== undefined) b[t.accountId] += t.type === 'income' ? t.amount : -t.amount })
  return b
}
const toBase = (s, amt, cur) => amt * (s.rates[cur] || 1)
const MDL = 'MDL'

function Entry({ ctx, type }) {
  const { s, up, setModal, openEdit } = ctx
  const act = s.accounts.filter((a) => !a.archived)
  const [acc, setAcc] = useState(act[0]?.id)
  const [expr, setExpr] = useState('')
  const [sheet, setSheet] = useState(null) // 'all' | 'search'
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const inp = useRef(null), pull = useRef(null)
  const bal = useMemo(() => balances(s), [s])
  const total = evalExpr(expr)
  const accSel = s.accounts.find((a) => a.id === acc && !a.archived) || act[0]
  const cats = s.categories.filter((c) => c.type === type)
  const freq = useMemo(() => {
    const n = {}; s.transactions.forEach((t) => { if (t.type === type) n[t.categoryId] = (n[t.categoryId] || 0) + 1 })
    return [...cats].sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0))
  }, [s.transactions, s.categories, type])
  const save = (catId) => {
    if (!total || !accSel) return
    up((p) => ({ transactions: [...p.transactions, { id: uid(), type, accountId: accSel.id, categoryId: catId, amount: total, ts: Date.now(), note: '' }] }))
    setExpr(''); setSheet(null); setQ('')
  }
  const addCat = () => setModal({
    title: 'Новая категория',
    fields: [{ key: 'name', label: 'Название' }, { key: 'icon', label: 'Иконка (эмодзи)', def: '🛒' }],
    onSubmit: (v) => { if (v.name) up((p) => ({ categories: [...p.categories, { id: uid(), name: v.name, icon: v.icon || '🛒', color: PALETTE[p.categories.length % PALETTE.length], type }] })) },
  })
  const today = startOfDay(new Date()).getTime()
  const dayItems = (k) => s.transactions.filter((t) => t.type === type && startOfDay(t.ts).getTime() === k).sort((a, b) => b.ts - a.ts)
  const accOf = (id) => s.accounts.find((a) => a.id === id)
  const catOf = (id) => s.categories.find((c) => c.id === id)
  const onInput = (e) => setExpr(e.target.value.replace(/,/g, '.').replace(/\*/g, '×').replace(/\//g, '÷').replace(/[^0-9.+\-−×÷]/g, ''))
  const Day = ({ k, label }) => {
    const items = dayItems(k), sum = items.reduce((x, t) => x + t.amount, 0)
    return (
      <>
        <div className="dayhdr">{label}: <b>{fmt(sum, MDL)}</b></div>
        {items.map((t) => {
          const c = catOf(t.categoryId), a = accOf(t.accountId), isOpen = open === t.id
          return (
            <div key={t.id} className="row opr" onClick={() => (isOpen ? openEdit(t.id) : setOpen(t.id))}>
              <span className="ic"><Ico icon={c?.icon} /></span>
              <div className="mid"><div>{c?.name}</div>{isOpen ? <span className="chip">{a?.name}</span> : <small>{a?.name}{t.note && <u> {t.note}</u>}</small>}
                {isOpen && <div className="acts" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => openEdit(t.id)} title="Изменить">✎</button>
                  <button onClick={() => up((p) => ({ transactions: p.transactions.map((x) => x.id === t.id ? { ...x, ts: x.ts - 864e5 } : x) }))} title="На вчера">←1</button>
                  <button onClick={() => confirm('Удалить операцию?') && up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) }))} title="Удалить">🗑</button>
                </div>}
              </div>
              <div className="rt"><b className={type}>{fmt(t.amount, a?.currency)}</b><small>{hm(t.ts)}</small></div>
            </div>
          )
        })}
        {!items.length && <p className="empty">Нет операций</p>}
      </>
    )
  }
  const word = type === 'expense' ? 'Потрачено' : 'Получено'
  const tiles = total ? freq.slice(0, 6) : []
  const found = freq.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <Header title={type === 'expense' ? 'Расходы' : 'Доходы'} ctx={ctx} left={<button className="lnk" onClick={() => ctx.cycleTheme()} title="Тема">☀</button>} right={<button className="lnk" onClick={() => ctx.setRoute('report')} title="Отчёт">◔</button>} />
      <div className="scroll"
        onTouchStart={(e) => { pull.current = e.currentTarget.scrollTop <= 0 ? e.touches[0].clientY : null }}
        onTouchEnd={(e) => { const y0 = pull.current; pull.current = null; if (y0 != null && e.changedTouches[0].clientY - y0 > 60) inp.current?.focus() }}>
        <div className={'amt ' + type}>
          <input ref={inp} value={expr} onChange={onInput} placeholder="Введите сумму" inputMode="decimal" enterKeyHint="done" />
          {expr && <button onClick={() => setExpr('')} aria-label="Очистить">✕</button>}
        </div>
        {/[+\-−×÷]/.test(expr) && total > 0 && <div className="amtsum">= {fmt(total, accSel?.currency)}</div>}
        <div className="tiles">
          {act.map((a) => (
            <button key={a.id} className={'tile' + (a.id === accSel?.id ? ' on' : '')} onClick={() => setAcc(a.id)}>
              <span>{a.name}</span><b>{fmt(bal[a.id], a.currency)}</b>
            </button>
          ))}
        </div>
        {total > 0 && (
          <div className="cgrid4">
            <button onClick={() => setSheet('all')}><span>☰</span>Все категории</button>
            <button onClick={() => { setQ(''); setSheet('search') }}><span>🔍</span>Быстрый поиск</button>
            {tiles.map((c) => <button key={c.id} onClick={() => save(c.id)}><span><Ico icon={c.icon} size={26} /></span>{c.name}</button>)}
          </div>
        )}
        <Day k={today} label={`${word} сегодня`} />
        <Day k={today - 864e5} label={`${word} вчера`} />
        <button className="histlink" onClick={() => ctx.setRoute('feed')}>История</button>
      </div>
      {sheet && (
        <div className="sheet" onClick={() => setSheet(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h3>{sheet === 'all' ? 'Все категории' : 'Быстрый поиск'} · {fmt(total, accSel?.currency)}</h3>
            {sheet === 'search' && <input className="num qs" autoFocus placeholder="Название категории" value={q} onChange={(e) => setQ(e.target.value)} />}
            <div className="cgrid">
              {(sheet === 'all' ? freq : found).map((c) => <button key={c.id} onClick={() => save(c.id)}><span><Ico icon={c.icon} size={26} /></span>{c.name}</button>)}
              {sheet === 'all' && <button className="add" onClick={addCat}><span>＋</span>Новая</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Edit({ ctx }) {
  const { s, up, edit, setRoute } = ctx
  const t = s.transactions.find((x) => x.id === edit?.id)
  const back = edit?.back || 'expense'
  const BL = { expense: 'Расходы', income: 'Доходы', feed: 'Лента', accounts: 'Счета' }
  const d0 = t ? new Date(t.ts) : new Date()
  const [v, setV] = useState(() => t ? { acc: t.accountId, from: t.fromAccountId, to: t.toAccountId, cat: t.categoryId, amount: String(t.amount), toAmount: String(t.toAmount ?? ''), date: `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`, time: `${pad(d0.getHours())}:${pad(d0.getMinutes())}`, note: t.note || '' } : {})
  useEffect(() => { if (!t) setRoute(back) }, [t])
  if (!t) return null
  const isX = t.type === 'transfer'
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const cats = s.categories.filter((c) => c.type === t.type)
  const accSel = (k) => <select value={v[k]} onChange={set(k)}>{s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (архив)' : ''}</option>)}</select>
  const done = () => {
    const amount = +v.amount
    if (!(amount > 0)) return alert('Введите сумму больше 0')
    const ts = new Date(`${v.date}T${v.time || '00:00'}`).getTime() || t.ts
    up((p) => ({ transactions: p.transactions.map((x) => x.id !== t.id ? x : isX
      ? { ...x, fromAccountId: v.from, toAccountId: v.to, amount, toAmount: +v.toAmount > 0 ? +v.toAmount : amount, ts, note: v.note }
      : { ...x, accountId: v.acc, categoryId: v.cat, amount, ts, note: v.note }) }))
    setRoute(back)
  }
  const del = () => confirm('Удалить операцию?') && (up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) })), setRoute(back))
  return (
    <>
      <Header title="Изменение" ctx={ctx} left={<button className="lnk" onClick={() => setRoute(back)}>‹ {BL[back] || 'Назад'}</button>} right={<button className="lnk" onClick={done}>Готово</button>} />
      <div className="scroll">
        <div className="grp">
          {isX ? <>
            <label className="frow">Откуда{accSel('from')}</label>
            <label className="frow">Куда{accSel('to')}</label>
          </> : <>
            <label className="frow">Счёт{accSel('acc')}</label>
            <label className="frow">Категория<select value={v.cat} onChange={set('cat')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></label>
          </>}
          <label className="frow">Сумма<input type="number" step="any" inputMode="decimal" value={v.amount} onChange={set('amount')} /></label>
          {isX && <label className="frow">Зачислено<input type="number" step="any" inputMode="decimal" value={v.toAmount} onChange={set('toAmount')} /></label>}
          <label className="frow">Дата<input type="date" value={v.date} onChange={set('date')} /></label>
          <label className="frow">Время<input type="time" value={v.time} onChange={set('time')} /></label>
          <label className="frow">Заметка<input value={v.note} onChange={set('note')} /></label>
        </div>
        <div className="grp"><button className="delbtn" onClick={del}>Удалить {isX ? 'перевод' : t.type === 'income' ? 'доход' : 'расход'}…</button></div>
      </div>
    </>
  )
}

function Pie({ data }) {
  const total = data.reduce((a, d) => a + d.v, 0)
  if (!total) return <div className="piee">нет данных</div>
  let a0 = -Math.PI / 2
  const R = 100
  return (
    <svg viewBox="-110 -110 220 220" className="pie">
      {data.length === 1 ? <circle r={R} fill={data[0].color} /> : data.map((d) => {
        const a1 = a0 + (d.v / total) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0
        const p = `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${large} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)}Z`
        const mid = (a0 + a1) / 2; a0 = a1
        return <g key={d.id}><path d={p} fill={d.color} stroke="var(--bg)" strokeWidth="1.5" />{d.v / total > 0.07 && <text x={R * 0.62 * Math.cos(mid)} y={R * 0.62 * Math.sin(mid)} textAnchor="middle" dominantBaseline="middle" fontSize="11" fill="#222">{d.name}</text>}</g>
      })}
    </svg>
  )
}

function Donut({ data, center, onPrev, onNext }) {
  const total = data.reduce((a, d) => a + d.v, 0), R = 70, C = 2 * Math.PI * R
  let off = 0
  return (
    <div className="donut">
      <button onClick={onPrev}><ChevronLeft size={22} /></button>
      <svg viewBox="-90 -90 180 180" width="190" height="190" style={{ flex: "none" }}>
        <circle r={R} fill="none" stroke="#2a2a2a" strokeWidth="16" />
        {total > 0 && data.map((d) => { const len = (d.v / total) * C, el = <circle key={d.id} r={R} fill="none" stroke={d.color} strokeWidth="16" strokeDasharray={`${Math.max(len - 2, 0.5)} ${C}`} strokeDashoffset={-off} transform="rotate(-90)" />; off += len; return el })}
        <text textAnchor="middle" dominantBaseline="middle" fontSize="15" fill="var(--text)">{center}</text>
      </svg>
      <button onClick={onNext}><ChevronRight size={22} /></button>
    </div>
  )
}

function Bars({ items, sel, onPick }) {
  const max = Math.max(...items.map((i) => i.v), 1)
  return (
    <div className="bars">
      {items.map((i) => (
        <button key={i.key} onClick={() => onPick(i.date)}>
          <div className="col"><div className={sel === i.key ? 'on' : ''} style={{ height: `${Math.max((i.v / max) * 100, 3)}%` }} /></div>
          <small>{i.label}</small>
        </button>
      ))}
    </div>
  )
}

function Report({ ctx }) {
  const { s, up, setModal } = ctx
  const [mode, setMode] = useState('report')
  const [kind, setKind] = useState('month')
  const [anchor, setAnchor] = useState(new Date())
  const [type, setType] = useState('expense')
  const [accF, setAccF] = useState('all')
  const [view, setView] = useState('donut')
  const [bu, setBu] = useState('month')
  const [from, to] = periodRange(kind, anchor)
  const accs = accF === 'all' ? s.accounts.filter((a) => !a.archived) : s.accounts.filter((a) => a.id === accF)
  const accMap = Object.fromEntries(s.accounts.map((a) => [a.id, a]))
  const inP = s.transactions.filter((t) => t.ts >= from && t.ts < to && t.type === type && accs.some((a) => a.id === t.accountId))
  const by = {}; inP.forEach((t) => { by[t.categoryId] = (by[t.categoryId] || 0) + toBase(s, t.amount, accMap[t.accountId]?.currency) })
  const data = Object.entries(by).map(([id, v]) => { const c = s.categories.find((x) => x.id === id) || {}; return { id, v, name: c.name, icon: c.icon, color: c.color } }).sort((a, b) => b.v - a.v)
  const total = data.reduce((a, d) => a + d.v, 0)
  const sumIn = (f, t) => s.transactions.filter((x) => x.ts >= f && x.ts < t && x.type === type && accs.some((a) => a.id === x.accountId)).reduce((q, x) => q + toBase(s, x.amount, accMap[x.accountId]?.currency), 0)
  const MS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
  const barItems = bu === 'month'
    ? Array.from({ length: 9 }, (_, i) => { const d = new Date(anchor.getFullYear(), anchor.getMonth() - 8 + i, 1); const [f, t] = periodRange('month', d); return { key: f.getTime(), date: d, label: MS[d.getMonth()], v: sumIn(f, t) } })
    : Array.from({ length: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() }, (_, i) => { const d = new Date(anchor.getFullYear(), anchor.getMonth(), i + 1); const [f, t] = periodRange('day', d); return { key: f.getTime(), date: d, label: i % 3 === 0 ? String(i + 1) : '', v: sumIn(f, t) } })
  const barSel = bu === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime() : startOfDay(new Date(anchor)).getTime()
  const days = Math.max(1, Math.round((Math.min(to, new Date()) - from) / 864e5) || 1)
  const accSum = accs.reduce((sum, a) => sum + toBase(s, balances(s)[a.id], a.currency), 0)
  const setLimit = (c) => setModal({
    title: `Лимит: ${c.name} (на месяц)`, fields: [{ key: 'v', label: 'Сумма, MDL (0 — убрать)', type: 'number', def: s.budgets[c.id] || '' }],
    onSubmit: (v) => up((p) => { const b = { ...p.budgets }; +v.v > 0 ? (b[c.id] = +v.v) : delete b[c.id]; return { budgets: b } }),
  })
  const [mf, mt] = periodRange('month', anchor)
  const spentM = (cid) => s.transactions.filter((t) => t.type === 'expense' && t.categoryId === cid && t.ts >= mf && t.ts < mt).reduce((a, t) => a + toBase(s, t.amount, accMap[t.accountId]?.currency), 0)
  return (
    <>
      <Header title="Отчёт" back="expense" backLabel="Назад" ctx={ctx} />
      <div className="seg top"><button className={mode === 'report' ? 'on' : ''} onClick={() => setMode('report')}>Отчёт</button><button className={mode === 'budget' ? 'on' : ''} onClick={() => setMode('budget')}>Бюджет</button></div>
      <div className="scroll">
        {mode === 'report' && <div className="seg"><button className={kind === 'day' ? 'on' : ''} onClick={() => setKind('day')}>День</button><button className={kind === 'month' ? 'on' : ''} onClick={() => setKind('month')}>Месяц</button><button className={kind === 'year' ? 'on' : ''} onClick={() => setKind('year')}>Год</button></div>}
        <div className="nav">
          <button onClick={() => setAnchor((a) => shiftAnchor(mode === 'budget' ? 'month' : kind, a, -1))}>‹</button>
          <b>{periodLabel(mode === 'budget' ? 'month' : kind, anchor)}</b>
          <button onClick={() => setAnchor((a) => shiftAnchor(mode === 'budget' ? 'month' : kind, a, 1))}>›</button>
        </div>
        {mode === 'report' ? (
          <>
            <div className="accsel">
              <select value={accF} onChange={(e) => setAccF(e.target.value)}><option value="all">Все счета</option>{s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
              <div>{fmt(accSum, 'MDL')}</div>
            </div>
            <div className="seg small"><button className={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>Расходы</button><button className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Доходы</button></div>
            <div className="sum"><h2 className={type}>Всего {type === 'expense' ? 'потрачено' : 'получено'}: {fmt(total, 'MDL')}</h2><small>в среднем: {fmt(total / days, 'MDL')} в день</small></div>
            {(s.style || 'maib') === 'maib' ? (<>
            <div className="vtog"><button className={view === 'donut' ? 'on' : ''} onClick={() => setView('donut')}><PieChart size={18} /></button><button className={view === 'bars' ? 'on' : ''} onClick={() => setView('bars')}><BarChart3 size={18} /></button>
              {view === 'bars' && <><button className={bu === 'month' ? 'on' : ''} onClick={() => { setBu('month'); setKind('month') }}>Месяцы</button><button className={bu === 'day' ? 'on' : ''} onClick={() => { setBu('day'); setKind('month') }}>Дни</button></>}</div>
            {view === 'donut'
              ? <Donut data={data} center={new Date(anchor).toLocaleDateString('ru-RU', { month: 'long' })} onPrev={() => setAnchor((a) => shiftAnchor('month', a, -1))} onNext={() => setAnchor((a) => shiftAnchor('month', a, 1))} />
              : <Bars items={barItems} sel={barSel} onPick={(d) => setAnchor(d)} />}
            {data.map((d) => (
              <div key={d.id} className="catrow">
                <i className="cico" style={{ background: d.color }}><Ico icon={d.icon} size={20} /></i>
                <span className="cn">{d.name} <b>{Math.round((d.v / total) * 100)}%</b></span>
                <span className="ca">{fmt(d.v, 'MDL')}</span>
                <ChevronRight size={18} className="chev" />
              </div>
            ))}
            </>) : (<>
            <Pie data={data} />
            {data.map((d) => (
              <div key={d.id} className="rep">
                <div className="bar" style={{ width: `${(d.v / (data[0].v || 1)) * 100}%`, background: d.color }} />
                <div className="line"><span className="lk"><i className="ic"><Ico icon={d.icon} size={18} /></i> {d.name}</span><span><b>{Math.round((d.v / total) * 100)}%</b><br /><i className={type}>{fmt(d.v, 'MDL')}</i></span></div>
              </div>
            ))}
            </>)}
          </>
        ) : (
          <>
            <p className="hint">Нажмите на категорию, чтобы задать месячный лимит.</p>
            {s.categories.filter((c) => c.type === 'expense').map((c) => {
              const lim = s.budgets[c.id], sp = spentM(c.id), pct = lim ? Math.min(100, (sp / lim) * 100) : 0
              return (
                <div key={c.id} className="bud" onClick={() => setLimit(c)}>
                  <div className="line"><span className="lk"><i className="ic"><Ico icon={c.icon} size={18} /></i> {c.name}</span><span>{lim ? <><b className={sp > lim ? 'expense' : ''}>{fmt(sp, 'MDL')}</b> / {fmt(lim, 'MDL')}</> : <small>{sp ? fmt(sp, 'MDL') + ' · ' : ''}лимит не задан</small>}</span></div>
                  {lim > 0 && <div className="track"><div style={{ width: pct + '%', background: sp > lim ? '#e53935' : '#4caf50' }} /></div>}
                </div>
              )
            })}
          </>
        )}
      </div>
    </>
  )
}

function Menu({ ctx }) {
  const { s, setRoute } = ctx
  const dl = () => {
    const blob = new Blob(['﻿' + toCSV(s)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'money-ok-export.csv'; a.click()
  }
  const items = [ ['💳', 'Кредиты', () => setRoute('loans')], ['🔁', 'Автоплатежи', () => setRoute('recurring')], ['📤', 'Экспорт в CSV', dl], ['⚙️', 'Настройки', () => setRoute('settings')]]
  return (
    <>
      <Header title="Меню" ctx={ctx} />
      <div className="scroll">
        <p className="hint">{ctx.sync === 'ok' ? '☁ Синхронизировано' : ctx.sync === 'wait' ? '☁ Сохраняю…' : ctx.sync === 'offline' ? '⚠ Нет связи, сохранится позже' : ''}</p>
        {items.map(([i, l, f]) => <button key={l} className="mrow" onClick={f}><span>{i}</span>{l}<em>›</em></button>)}
        <button className="mrow" onClick={ctx.onLogout}><span>🔒</span>Выйти<em>›</em></button>
      </div>
    </>
  )
}

function openTransfer(ctx, fromId) {
  const { s, up, setModal } = ctx
  const list = s.accounts.filter((a) => !a.archived)
  const accOpts = { options: list.map((a) => a.id), labels: Object.fromEntries(list.map((a) => [a.id, a.name])) }
  if (list.length < 2) return alert('Нужно минимум два активных счёта')
  const fi = Math.max(0, list.findIndex((a) => a.id === fromId))
  setModal({
    title: '⇄ Перевод между счетами',
    fields: [
      { key: 'from', label: 'Откуда', ...accOpts, def: list[fi].id },
      { key: 'to', label: 'Куда', ...accOpts, def: list[fi === 0 ? 1 : 0].id },
      { key: 'amount', label: 'Сумма списания', type: 'number' },
      { key: 'toAmount', label: 'Сумма зачисления (пусто — по курсу)', type: 'number' },
      { key: 'note', label: 'Заметка' },
    ],
    onSubmit: (v) => {
      const fa = s.accounts.find((x) => x.id === v.from), ta = s.accounts.find((x) => x.id === v.to), amount = +v.amount
      if (!fa || !ta || fa.id === ta.id) return alert('Выберите два разных счёта')
      if (!(amount > 0)) return alert('Введите сумму больше 0')
      const toAmount = +v.toAmount > 0 ? +v.toAmount : Math.round(amount * (s.rates[fa.currency] || 1) / (s.rates[ta.currency] || 1) * 100) / 100
      up((p) => ({ transactions: [...p.transactions, { id: uid(), type: 'transfer', fromAccountId: fa.id, toAccountId: ta.id, amount, toAmount, ts: Date.now(), note: v.note || '' }] }))
    },
  })
}

function Feed({ ctx }) {
  const { s, up, setModal } = ctx
  const [anchor, setAnchor] = useState(new Date())
  const [accF, setAccF] = useState('all')
  const [q, setQ] = useState('')
  const [showQ, setShowQ] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [tf, setTf] = useState('all')
  const [from, to] = periodRange('month', anchor)
  const accOf = (id) => s.accounts.find((a) => a.id === id)
  const catOf = (id) => s.categories.find((c) => c.id === id)
  const inAcc = (t) => accF === 'all' || t.accountId === accF || t.fromAccountId === accF || t.toAccountId === accF
  // signed effect of a transaction in MDL (all accounts) or in the account's own currency (filtered)
  const effect = (t) => {
    if (t.type === 'transfer') {
      if (accF === 'all') return 0
      return t.fromAccountId === accF ? -t.amount : t.toAmount ?? t.amount
    }
    return t.type === 'income' ? t.amount : -t.amount
  }
  const cur = accF === 'all' ? MDL : accOf(accF)?.currency || MDL
  const conv = (t, v) => accF === 'all' ? toBase(s, v, accOf(t.accountId)?.currency || MDL) : v
  const list = s.transactions.filter((t) => t.ts >= from.getTime() && t.ts < to.getTime() && inAcc(t)).sort((a, b) => b.ts - a.ts)
  const days = []
  list.forEach((t) => { const k = startOfDay(t.ts).getTime(); let x = days.find((y) => y.k === k); if (!x) days.push((x = { k, items: [] })); x.items.push(t) })
  const bal = balances({ ...s, transactions: s.transactions.filter((t) => t.ts < to.getTime()) })
  const total = accF === 'all' ? s.accounts.filter((a) => !a.archived).reduce((a, x) => a + toBase(s, bal[x.id], x.currency), 0) : bal[accF] || 0
  const today = startOfDay(new Date()).getTime()
  const dayName = (k) => new Date(k).toLocaleDateString('ru-RU', { weekday: 'long' }) + (k === today ? ' · сегодня' : k === today - 864e5 ? ' · вчера' : '')
  const addOp = (type) => {
    const cats = s.categories.filter((c) => c.type === type)
    const accs = accF === 'all' ? s.accounts.filter((a) => !a.archived) : s.accounts.filter((a) => a.id === accF)
    setModal({
      title: type === 'expense' ? '− Расход' : '+ Доход',
      fields: [
        { key: 'acc', label: 'Счёт', options: s.accounts.filter((a) => !a.archived || a.id === accF).map((a) => a.id), labels: Object.fromEntries(s.accounts.map((a) => [a.id, a.name])), def: accs[0]?.id },
        { key: 'cat', label: 'Категория', options: cats.map((c) => c.id), labels: Object.fromEntries(cats.map((c) => [c.id, `${c.icon} ${c.name}`])), def: cats[0]?.id },
        { key: 'amount', label: 'Сумма', type: 'number' },
        { key: 'note', label: 'Заметка' },
      ],
      onSubmit: (v) => { if (+v.amount > 0 && v.acc) up((p) => ({ transactions: [...p.transactions, { id: uid(), type, accountId: v.acc, categoryId: v.cat, amount: +v.amount, ts: Date.now(), note: v.note || '' }] })) },
    })
  }
  const del = (t) => confirm(t.type === 'transfer' ? 'Удалить перевод?' : 'Удалить операцию?') && up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) }))
  if ((s.style || 'maib') === 'maib') {
    const ql = q.trim().toLowerCase()
    const vis = list.filter((t) => (tf === 'all' || t.type === tf) && (!ql || ((t.note || '') + ' ' + (catOf(t.categoryId)?.name || '')).toLowerCase().includes(ql)))
    const dstr = (ts) => { const d = new Date(ts); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` }
    const TF = ['all', 'expense', 'income', 'transfer'], TFL = { all: 'Все операции', expense: 'Расходы', income: 'Доходы', transfer: 'Переводы' }
    return (
      <>
        <Header title="Транзакции" ctx={ctx} right={<button className="lnk" onClick={() => ctx.setRoute('report')} title="Отчёт"><BarChart3 size={22} /></button>} />
        <div className="scroll">
          <div className="mf-top">
            <select className="mf-acc" value={accF} onChange={(e) => setAccF(e.target.value)}>
              <option value="all">Все счета</option>
              {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (архив)' : ''}</option>)}
            </select>
            <button className={'mf-ib' + (showQ || q ? ' on' : '')} onClick={() => setShowQ((v) => !v)} title="Поиск"><Search size={22} /></button>
            <button className={'mf-ib' + (tf !== 'all' ? ' on' : '')} onClick={() => { const n = TF[(TF.indexOf(tf) + 1) % TF.length]; setTf(n) }} title={TFL[tf]}><SlidersHorizontal size={22} /></button>
            <button className={'mf-ib' + (showAdd ? ' on' : '')} onClick={() => setShowAdd((v) => !v)} title="Добавить"><Plus size={24} /></button>
          </div>
          {showQ && <input className="mf-search" autoFocus placeholder="Поиск по заметке и категории" value={q} onChange={(e) => setQ(e.target.value)} />}
          {tf !== 'all' && <div className="mf-add"><button onClick={() => setTf('all')}>Фильтр: {TFL[tf]} ✕</button></div>}
          {showAdd && <div className="mf-add"><button onClick={() => { setShowAdd(false); addOp('expense') }}>− Расход</button><button onClick={() => { setShowAdd(false); addOp('income') }}>+ Доход</button><button onClick={() => { setShowAdd(false); openTransfer(ctx, accF === 'all' ? undefined : accF) }}>⇄ Перевод</button></div>}
          <div className="mf-month"><button onClick={() => setAnchor((a) => shiftAnchor('month', a, -1))}><ChevronLeft size={20} /></button><b>{new Date(anchor).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</b><span>{fmt(total, cur)}<button onClick={() => setAnchor((a) => shiftAnchor('month', a, 1))}><ChevronRight size={20} /></button></span></div>
          {vis.map((t) => {
            const xf = t.type === 'transfer', c = catOf(t.categoryId), a = accOf(xf ? t.fromAccountId : t.accountId), ta = accOf(t.toAccountId)
            return (
              <div key={t.id} className="mf-row" onClick={() => ctx.openEdit(t.id)}>
                <span className="mf-ic">{xf ? <ArrowLeftRight size={22} strokeWidth={1.75} /> : <Ico icon={c?.icon} />}</span>
                <div className="mf-mid"><div>{xf ? `${a?.name} → ${ta?.name}` : t.note || c?.name}</div><small>{dstr(t.ts)}{t.note && !xf ? ' · ' + c?.name : ''}{' · '}{xf ? hm(t.ts) : a?.name}</small></div>
                <div className={'mf-am ' + (t.type === 'income' ? 'income' : '')}>{t.type === 'income' ? '+' : xf ? '' : '−'}{new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t.amount)}<small>{a?.currency}</small></div>
              </div>
            )
          })}
          {!vis.length && <p className="empty">Нет операций</p>}
        </div>
      </>
    )
  }
  return (
    <>
      <Header title="Лента" ctx={ctx} right={
        <select className="hsel" value={accF} onChange={(e) => setAccF(e.target.value)}>
          <option value="all">Все</option>
          {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (архив)' : ''}</option>)}
        </select>} />
      <div className="scroll">
        <div className="mnav"><button onClick={() => setAnchor((a) => shiftAnchor('month', a, -1))}>‹</button><b>{periodLabel('month', anchor)}</b><button onClick={() => setAnchor((a) => shiftAnchor('month', a, 1))}>›</button></div>
        <div className="fsum">
          <div className="fq"><button onClick={() => addOp('expense')} title="Расход">−</button><button onClick={() => addOp('income')} title="Доход">+</button><button onClick={() => openTransfer(ctx, accF === 'all' ? undefined : accF)} title="Перевод">⇄</button></div>
          <div className="fb"><small>{accF === 'all' ? 'Все счета' : accOf(accF)?.name}</small><b className={total < 0 ? 'expense' : ''}>{fmt(total, cur)}</b></div>
        </div>
        {days.map((g) => {
          const net = g.items.reduce((a, t) => a + conv(t, effect(t)), 0)
          return (
            <div key={g.k}>
              <div className="dayhdr fday"><span className="dn">{new Date(g.k).getDate()}</span><span>{dayName(g.k)}</span><b className={net < 0 ? 'expense' : net > 0 ? 'income' : ''}>{net ? fmt(net, cur) : ''}</b></div>
              {g.items.map((t) => {
                if (t.type === 'transfer') {
                  const fa = accOf(t.fromAccountId), ta = accOf(t.toAccountId)
                  return (
                    <div key={t.id} className="row" onClick={() => ctx.openEdit(t.id)}>
                      <span className="ic">⇄</span>
                      <div className="mid"><div>Перевод</div><small>{fa?.name} → {ta?.name}{t.note && <u> {t.note}</u>}</small></div>
                      <div className="rt"><b className="xfer">{fmt(t.amount, fa?.currency)}{fa?.currency !== ta?.currency && ` → ${fmt(t.toAmount ?? t.amount, ta?.currency)}`}</b><small>{hm(t.ts)}</small></div>
                    </div>
                  )
                }
                const c = catOf(t.categoryId), a = accOf(t.accountId)
                return (
                  <div key={t.id} className="row" onClick={() => ctx.openEdit(t.id)}>
                    <span className="ic"><Ico icon={c?.icon} /></span>
                    <div className="mid"><div>{c?.name}</div><small>{a?.name}{t.note && <u> {t.note}</u>}</small></div>
                    <div className="rt"><b className={t.type}>{t.type === 'income' ? '' : '−'}{fmt(t.amount, a?.currency)}</b><small>{hm(t.ts)}</small></div>
                  </div>
                )
              })}
            </div>
          )
        })}
        {!days.length && <p className="empty">Нет операций</p>}
      </div>
    </>
  )
}

function Accounts({ ctx }) {
  const { s, up, setModal } = ctx
  const [sub, setSub] = useState('acc')
  const bal = balances(s)
  const ST = { options: ['active', 'archived'], labels: { active: 'Активный', archived: 'В архиве' } }
  const form = (a) => setModal({
    title: a ? 'Счёт' : 'Новый счёт',
    fields: [{ key: 'name', label: 'Название', def: a?.name || '' }, { key: 'currency', label: 'Валюта', options: CURRENCIES, def: a?.currency || 'MDL' }, { key: 'initial', label: 'Начальный остаток', type: 'number', def: a?.initial ?? 0 }, ...(a ? [{ key: 'status', label: 'Статус', ...ST, def: a.archived ? 'archived' : 'active' }] : [])],
    onSubmit: (v) => v.name && up((p) => ({ accounts: a ? p.accounts.map((x) => x.id === a.id ? { ...x, name: v.name, currency: v.currency, initial: +v.initial || 0, archived: v.status === 'archived' } : x) : [...p.accounts, { id: uid(), name: v.name, currency: v.currency, initial: +v.initial || 0, archived: false }] })),
    onDelete: a && (() => confirm('Удалить счёт и его операции?') && up((p) => ({ accounts: p.accounts.filter((x) => x.id !== a.id), transactions: p.transactions.filter((t) => t.accountId !== a.id && t.fromAccountId !== a.id && t.toAccountId !== a.id) }))),
  })
  const active = s.accounts.filter((a) => !a.archived), arch = s.accounts.filter((a) => a.archived)
  const sum = active.reduce((t, a) => t + toBase(s, bal[a.id], a.currency), 0)
  const accOf = (id) => s.accounts.find((a) => a.id === id)
  const xfers = s.transactions.filter((t) => t.type === 'transfer').sort((a, b) => b.ts - a.ts)
  const accRow = (a) => <div key={a.id} className="row" onClick={() => form(a)}><span className="ic">🏦</span><div className="mid"><div>{a.name}</div><small>{a.currency}</small></div><div className="rt"><b>{fmt(bal[a.id], a.currency)}</b></div></div>
  return (
    <>
      <Header title="Счета" ctx={ctx} right={<><button className="lnk" onClick={() => openTransfer(ctx)} title="Перевод">⇄</button><button className="lnk" onClick={() => form()}>＋</button></>} />
      <div className="seg top" style={{ padding: '0 14px 10px' }}>{[['acc', 'Счета'], ['xfer', 'Переводы'], ['arch', 'Архив']].map(([k, l]) => <button key={k} className={sub === k ? 'on' : ''} onClick={() => setSub(k)}>{l}</button>)}</div>
      <div className="scroll">
        {sub === 'acc' && <>
          <div className="sum"><h2>Всего: {fmt(sum, 'MDL')}</h2></div>
          {active.map(accRow)}
          {!active.length && <p className="empty">Нет активных счетов</p>}
        </>}
        {sub === 'xfer' && <>
          {xfers.map((t) => { const fa = accOf(t.fromAccountId), ta = accOf(t.toAccountId); return (
            <div key={t.id} className="row" onClick={() => confirm('Удалить перевод?') && up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) }))}>
              <span className="ic">⇄</span>
              <div className="mid"><div>{fa?.name} → {ta?.name}</div><small>{new Date(t.ts).toLocaleDateString('ru-RU')} {hm(t.ts)}{t.note && <u> {t.note}</u>}</small></div>
              <div className="rt"><b className="xfer">{fmt(t.amount, fa?.currency)}{fa?.currency !== ta?.currency && ` → ${fmt(t.toAmount ?? t.amount, ta?.currency)}`}</b></div>
            </div>) })}
          {!xfers.length && <p className="empty">Переводов пока нет</p>}
        </>}
        {sub === 'arch' && <>
          {arch.map(accRow)}
          {!arch.length && <p className="empty">Архив пуст. Чтобы убрать счёт, откройте его и поставьте статус «В архиве».</p>}
        </>}
      </div>
    </>
  )
}

function Loans({ ctx }) {
  const { s, up, setModal } = ctx
  const [arch, setArch] = useState(false)
  const add = () => setModal({
    title: 'Новый кредит', fields: [{ key: 'name', label: 'Название' }, { key: 'total', label: 'Сумма кредита', type: 'number' }, { key: 'paid', label: 'Уже выплачено', type: 'number', def: 0 }],
    onSubmit: (v) => v.name && +v.total > 0 && up((p) => ({ loans: [...p.loans, { id: uid(), name: v.name, icon: '💳', total: +v.total, paid: +v.paid || 0, archived: false }] })),
  })
  const pay = (l) => setModal({
    title: l.name, fields: [{ key: 'p', label: 'Внести платёж', type: 'number' }],
    onSubmit: (v) => up((p) => ({ loans: p.loans.map((x) => x.id === l.id ? { ...x, paid: Math.min(x.total, x.paid + (+v.p || 0)), archived: x.paid + (+v.p || 0) >= x.total } : x) })),
    onDelete: () => confirm('Удалить кредит?') && up((p) => ({ loans: p.loans.filter((x) => x.id !== l.id) })),
  })
  const list = s.loans.filter((l) => !!l.archived === arch)
  return (
    <>
      <Header title="Кредиты" back="menu" ctx={ctx} />
      <div className="seg top2"><div className="segw"><button className={!arch ? 'on' : ''} onClick={() => setArch(false)}>Активные</button><button className={arch ? 'on' : ''} onClick={() => setArch(true)}>Архивные</button></div><button className="lnk big" onClick={add}>＋</button></div>
      <div className="scroll">
        {list.map((l) => {
          const pct = Math.round((l.paid / l.total) * 100)
          return (
            <div key={l.id} className="loan" onClick={() => pay(l)}>
              <div className="line"><span>{l.icon} {l.name}</span><b className="expense">{fmt(l.total - l.paid)}</b></div>
              <div className="track pk"><div style={{ width: pct + '%' }} /><span>{pct}%</span><em>{fmt(l.paid)}</em></div>
            </div>
          )
        })}
        {!list.length && <p className="empty">Здесь пока пусто.</p>}
      </div>
    </>
  )
}

function Recurring({ ctx }) {
  const { s, up, setModal } = ctx
  const add = () => setModal({
    title: 'Автоплатёж',
    fields: [
      { key: 'type', label: 'Тип', options: ['expense', 'income'], labels: { expense: 'Расход', income: 'Доход' }, def: 'expense' },
      { key: 'accountId', label: 'Счёт', options: s.accounts.map((a) => a.id), labels: Object.fromEntries(s.accounts.map((a) => [a.id, a.name])), def: s.accounts[0]?.id },
      { key: 'categoryId', label: 'Категория', options: s.categories.map((c) => c.id), labels: Object.fromEntries(s.categories.map((c) => [c.id, c.icon + ' ' + c.name])), def: s.categories[0]?.id },
      { key: 'amount', label: 'Сумма', type: 'number' }, { key: 'day', label: 'День месяца (1–28)', type: 'number', def: 1 }, { key: 'note', label: 'Заметка' },
    ],
    onSubmit: (v) => +v.amount > 0 && up((p) => ({ recurring: [...p.recurring, { id: uid(), type: v.type, accountId: v.accountId, categoryId: v.categoryId, amount: +v.amount, day: Math.min(28, Math.max(1, +v.day || 1)), note: v.note, lastRun: null }] })),
  })
  const cat = (id) => s.categories.find((c) => c.id === id)
  return (
    <>
      <Header title="Автоплатежи" back="menu" ctx={ctx} right={<button className="lnk" onClick={add}>＋</button>} />
      <div className="scroll">
        <p className="hint">Операция создаётся автоматически каждый месяц в выбранный день (при открытии приложения).</p>
        {s.recurring.map((r) => <div key={r.id} className="row" onClick={() => confirm('Удалить автоплатёж?') && up((p) => ({ recurring: p.recurring.filter((x) => x.id !== r.id) }))}><span className="ic"><Ico icon={cat(r.categoryId)?.icon} /></span><div className="mid"><div>{cat(r.categoryId)?.name}</div><small>каждый месяц, {r.day}-го {r.note && '· ' + r.note}</small></div><div className="rt"><b className={r.type}>{fmt(r.amount)}</b></div></div>)}
        {!s.recurring.length && <p className="empty">Автоплатежей нет.</p>}
      </div>
    </>
  )
}

function Settings({ ctx }) {
  const { s, up, updateRates } = ctx
  const [msg, setMsg] = useState('')
  const upd = async () => { setMsg('…'); const d = await updateRates(true); setMsg(d ? 'Курсы BNM на ' + d : 'Не удалось получить курсы') }
  return (
    <>
      <Header title="Настройки" back="menu" ctx={ctx} />
      <div className="scroll">
        <label className="mrow"><span>🌙</span>Тема
          <select className="num wide2" value={s.theme || 'dark'} onChange={(e) => up({ theme: e.target.value })}>
            <option value="dark">Тёмная</option><option value="black">Чёрная (OLED)</option><option value="light">Светлая</option><option value="auto">Как в системе</option>
          </select></label>
        <label className="mrow"><span>🎨</span>Стиль
          <select className="num wide2" value={s.style || 'maib'} onChange={(e) => up({ style: e.target.value })}>
            <option value="maib">maib (линейные иконки)</option><option value="money">Money OK (эмодзи)</option>
          </select></label>
        <h4 className="sec">Курсы к MDL (BNM{s.ratesDate ? ', ' + s.ratesDate : ''})</h4>
        {['USD', 'EUR', 'RUB'].map((c) => <label key={c} className="mrow"><span>{SYM[c]}</span>1 {c} =<input className="num" type="number" step="any" value={s.rates[c]} onChange={(e) => up({ rates: { ...s.rates, [c]: +e.target.value || 1 } })} /> MDL</label>)}
        <button className="mrow" onClick={upd}><span>🏦</span>Обновить курсы с BNM<em>{msg}</em></button>
        <h4 className="sec">Устройство</h4>
        <button className="mrow" onClick={ctx.onLogout}><span>🔒</span>Выйти из аккаунта</button>
        <button className="mrow" onClick={() => confirm('Отключить это устройство от хранилища? Токен GitHub будет удалён здесь.') && ctx.onDisconnect()}><span>🔌</span>Отключить устройство</button>
        <button className="mrow danger" onClick={() => confirm('Стереть все счета и операции? Логин и пароль сохранятся.') && up({ ...seed(), auth: s.auth, theme: s.theme, style: s.style, rates: s.rates, ratesDate: s.ratesDate })}><span>♻️</span>Начать с нуля</button>
      </div>
    </>
  )
}

function FormModal({ title, fields, onSubmit, onClose, onDelete }) {
  const [v, setV] = useState(() => Object.fromEntries(fields.map((f) => [f.key, f.def ?? ''])))
  return (
    <div className="sheet" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); onSubmit(v); onClose() }}>
        <h3>{title}</h3>
        {fields.map((f) => (
          <label key={f.key} className="fld">{f.label}
            {f.options ? <select value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>{f.options.map((o) => <option key={o} value={o}>{f.labels?.[o] || o}</option>)}</select>
              : <input type={f.type || 'text'} step="any" value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />}
          </label>
        ))}
        <div className="btns">{onDelete && <button type="button" className="danger" onClick={() => { onDelete(); onClose() }}>Удалить</button>}<button type="button" onClick={onClose}>Отмена</button><button className="primary">Сохранить</button></div>
      </form>
    </div>
  )
}

function Gate({ title, children }) {
  return <div className="phone"><div className="gate"><div className="gico">L</div><h2>{title}</h2>{children}</div></div>
}

export default function App() {
  const [phase, setPhase] = useState('boot')
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  const [sync, setSync] = useState('')
  const [f, setF] = useState({ token: '', login: '', pw: '', pw2: '' })
  const sha = useRef(null), skip = useRef(false), timer = useRef(null), sRef = useRef(null), phaseRef = useRef('boot')
  sRef.current = s; phaseRef.current = phase
  const theme = s?.theme || 'dark'
  if (s) document.documentElement.dataset.style = s.style || 'maib'
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const ap = () => {
      const t = theme === 'auto' ? (mq.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = t
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#1f7ab5' : t === 'black' ? '#000000' : '#1b1c1e')
    }
    ap(); mq.addEventListener('change', ap); return () => mq.removeEventListener('change', ap)
  }, [theme])
  const flush = async () => {
    const token = getToken(); if (!token || !sRef.current) return
    setSync('wait')
    try {
      if (!sha.current) sha.current = (await pull(token))?.sha || null
      try { sha.current = await push(token, sRef.current, sha.current) } catch (e) {
        if (e.status === 409 || e.status === 422) { const r = await pull(token); sha.current = await push(token, sRef.current, r?.sha || null) } else throw e
      }
      setSync('ok')
    } catch { setSync('offline') }
  }
  useEffect(() => {
    if (!s) return
    try { localStorage.setItem(CACHE, JSON.stringify(s)) } catch {}
    if (skip.current) { skip.current = false; return }
    clearTimeout(timer.current); timer.current = setTimeout(flush, 700)
  }, [s])
  const finish = (data, push_) => {
    let d = migrate(data); const r = applyRecurring(d)
    if (r !== d) { d = { ...r, updatedAt: Date.now() }; push_ = true }
    skip.current = !push_; setS(d)
    setPhase(!d.auth ? 'setup' : localStorage.getItem(SESS) === sessOf(d.auth) ? 'app' : 'login')
  }
  const connect = async (token) => {
    setErr('')
    try {
      const r = await pull(token); let data, dirty = false
      if (!r) { data = { ...seed(), updatedAt: Date.now() }; sha.current = await push(token, data, null) } else { data = r.data; sha.current = r.sha }
      const c = readCache(); if (c && (c.updatedAt || 0) > (data.updatedAt || 0)) { data = c; dirty = true }
      finish(data, dirty)
    } catch (e) {
      const c = readCache()
      if (e.status === 401 || e.status === 403 || e.status === 404 || !c) { if (e.status === 401 || e.status === 403) clearToken(); setErr(e.status === 404 ? 'Репозиторий money-clone-data не найден или нет доступа' : e.status === 401 ? 'Токен не подходит' : 'Нет связи с GitHub'); setPhase('connect') }
      else { sha.current = null; setSync('offline'); finish(c, true) }
    }
  }
  useEffect(() => { const t = getToken(); if (t) connect(t); else setPhase('connect') }, [])
  useEffect(() => {
    const onVis = async () => {
      const token = getToken()
      if (document.visibilityState !== 'visible' || phaseRef.current !== 'app' || !token || timer.current && sync === 'wait') return
      try {
        const r = await pull(token)
        if (r && r.sha !== sha.current) {
          sha.current = r.sha
          if ((r.data.updatedAt || 0) > (sRef.current?.updatedAt || 0)) { skip.current = true; setS(migrate(r.data)) }
        }
      } catch {}
    }
    document.addEventListener('visibilitychange', onVis); return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  const logout = () => { localStorage.removeItem(SESS); setF({ ...f, pw: '', pw2: '' }); setPhase('login') }
  const disconnect = () => { clearToken(); localStorage.removeItem(SESS); localStorage.removeItem(CACHE); setS(null); setPhase('connect') }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  if (phase === 'boot') return <Gate title="Загрузка…" />
  if (phase === 'connect') return (
    <Gate title="Подключение хранилища">
      <p className="hint">Вставьте токен доступа GitHub к приватному репозиторию money-clone-data. Он хранится только в этом браузере.</p>
      <form onSubmit={(e) => { e.preventDefault(); const t = f.token.trim(); if (t) { setToken(t); setPhase('boot'); connect(t) } }}>
        <input className="gin" type="password" placeholder="github_pat_…" autoComplete="off" value={f.token} onChange={set('token')} />
        {err && <p className="gerr">{err}</p>}
        <button className="primary wide">Подключить</button>
      </form>
    </Gate>
  )
  if (phase === 'setup') return (
    <Gate title="Создайте аккаунт">
      <p className="hint">Логин и пароль будут общими для всех ваших устройств.</p>
      <form onSubmit={async (e) => {
        e.preventDefault()
        if (f.login.trim().length < 3) return setErr('Логин — минимум 3 символа')
        if (f.pw.length < 6) return setErr('Пароль — минимум 6 символов')
        if (f.pw !== f.pw2) return setErr('Пароли не совпадают')
        const salt = randHex(), hash = await hashPw(f.login, f.pw, salt), auth = { login: f.login.trim(), salt, hash }
        localStorage.setItem(SESS, sessOf(auth)); setErr(''); setS((p) => ({ ...p, auth, updatedAt: Date.now() })); setF({ ...f, pw: '', pw2: '' }); setPhase('app')
      }}>
        <input className="gin" placeholder="Логин" autoComplete="username" value={f.login} onChange={set('login')} />
        <input className="gin" type="password" placeholder="Пароль" autoComplete="new-password" value={f.pw} onChange={set('pw')} />
        <input className="gin" type="password" placeholder="Пароль ещё раз" autoComplete="new-password" value={f.pw2} onChange={set('pw2')} />
        {err && <p className="gerr">{err}</p>}
        <button className="primary wide">Создать и войти</button>
      </form>
    </Gate>
  )
  if (phase === 'login') return (
    <Gate title="Вход">
      <form onSubmit={async (e) => {
        e.preventDefault()
        const a = s.auth, h = await hashPw(f.login, f.pw, a.salt)
        if (f.login.trim().toLowerCase() !== a.login.toLowerCase() || h !== a.hash) return setErr('Неверный логин или пароль')
        localStorage.setItem(SESS, sessOf(a)); setErr(''); setF({ ...f, pw: '' }); setPhase('app')
      }}>
        <input className="gin" placeholder="Логин" autoComplete="username" value={f.login} onChange={set('login')} />
        <input className="gin" type="password" placeholder="Пароль" autoComplete="current-password" value={f.pw} onChange={set('pw')} />
        {err && <p className="gerr">{err}</p>}
        <button className="primary wide">Войти</button>
      </form>
    </Gate>
  )
  return <Main s={s} setS={setS} sync={sync} onLogout={logout} onDisconnect={disconnect} />
}
