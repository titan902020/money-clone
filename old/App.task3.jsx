import React, { useEffect, useMemo, useRef, useState } from 'react'
import { seed } from './seed.js'
import { pull, push, getToken, setToken, clearToken } from './sync.js'
import { hashPw, randHex, fmt, uid, hm, evalExpr, press, periodRange, shiftAnchor, periodLabel, toCSV, startOfDay, CURRENCIES, SYM, pad } from './util.js'

const CACHE = 'mc-cache', SESS = 'mc-sess'
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)) } catch { return null } }
const sessOf = (a) => (a?.hash ? 'ok-' + a.hash.slice(0, 24) : '')
const migrate = (d) => { const b = seed(); return { ...b, ...d, rates: { ...b.rates, ...(d.rates || {}), MDL: 1 }, theme: d.theme || b.theme } }

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
  const up = (patch) => setS((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch), updatedAt: Date.now() }))
  const updateRates = async (force) => {
    try {
      const j = await (await fetch('./rates.json?t=' + Date.now(), { cache: 'no-store' })).json()
      if (force || j.date !== s.ratesDate) up((p) => ({ rates: { ...p.rates, ...j.rates, MDL: 1 }, ratesDate: j.date }))
      return j.date
    } catch { return null }
  }
  useEffect(() => { updateRates(false) }, [])
  const ctx = { s, up, setRoute, setModal, sync, onLogout, onDisconnect, updateRates }
  const main = ['expense', 'income', 'report', 'menu'].includes(route)
  return (
    <div className="phone">
      {route === 'expense' && <Entry key="e" ctx={ctx} type="expense" />}
      {route === 'income' && <Entry key="i" ctx={ctx} type="income" />}
      {route === 'report' && <Report ctx={ctx} />}
      {route === 'menu' && <Menu ctx={ctx} />}
      {route === 'accounts' && <Accounts ctx={ctx} />}
      {route === 'feed' && <Feed ctx={ctx} />}
      {route === 'loans' && <Loans ctx={ctx} />}
      {route === 'recurring' && <Recurring ctx={ctx} />}
      {route === 'settings' && <Settings ctx={ctx} />}
      {main && (
        <nav className="tabs">
          {[['expense', '➖', 'Расходы'], ['income', '➕', 'Доходы'], ['report', '📊', 'Отчёт'], ['menu', '☰', 'Меню']].map(([k, i, l]) => (
            <button key={k} className={route === k ? 'on' : ''} onClick={() => setRoute(k)}><span>{i}</span>{l}</button>
          ))}
        </nav>
      )}
      {modal && <FormModal {...modal} onClose={() => setModal(null)} />}
    </div>
  )
}

function Header({ title, back, ctx, left, right }) {
  return (
    <header className="hdr">
      <div className="hl">{back ? <button className="lnk" onClick={() => ctx.setRoute(back)}>‹ Меню</button> : left}</div>
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
  const { s, up, setModal } = ctx
  const [acc, setAcc] = useState(s.accounts[0]?.id)
  const [expr, setExpr] = useState('')
  const [pick, setPick] = useState(false)
  const bal = useMemo(() => balances(s), [s])
  const total = evalExpr(expr)
  const hasOp = /[+\-×÷]/.test(expr)
  const cats = s.categories.filter((c) => c.type === type)
  const save = (catId) => {
    if (!total) return
    up((p) => ({ transactions: [...p.transactions, { id: uid(), type, accountId: acc, categoryId: catId, amount: total, ts: Date.now(), note: '' }] }))
    setExpr(''); setPick(false)
  }
  const addCat = () => setModal({
    title: 'Новая категория',
    fields: [{ key: 'name', label: 'Название' }, { key: 'icon', label: 'Иконка (эмодзи)', def: '🛒' }],
    onSubmit: (v) => { if (v.name) up((p) => ({ categories: [...p.categories, { id: uid(), name: v.name, icon: v.icon || '🛒', color: '#4fc3f7', type }] })) },
  })
  const days = useMemo(() => {
    const list = s.transactions.filter((t) => t.type === type || t.type === 'transfer').sort((a, b) => b.ts - a.ts).slice(0, 40)
    const g = []; list.forEach((t) => { const k = startOfDay(t.ts).getTime(); let x = g.find((y) => y.k === k); if (!x) g.push((x = { k, items: [] })); x.items.push(t) })
    return g
  }, [s.transactions, type])
  const today = startOfDay(new Date()).getTime()
  const dayName = (k) => k === today ? 'сегодня' : k === today - 864e5 ? 'вчера' : new Date(k).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const catOf = (id) => s.categories.find((c) => c.id === id)
  const accOf = (id) => s.accounts.find((a) => a.id === id)
  return (
    <>
      <Header title={type === 'expense' ? 'Расходы' : 'Доходы'} ctx={ctx} left={<button className="lnk" onClick={() => setPick(true)} title="Категории">⭐</button>} right={<button className="lnk" onClick={() => ctx.setRoute('report')} title="Отчёт">◔</button>} />
      <div className="scroll">
        <div className="tiles">
          {s.accounts.map((a) => (
            <button key={a.id} className={'tile' + (a.id === acc ? ' on' : '')} onClick={() => setAcc(a.id)}>
              <span>{a.name}</span><b>{fmt(bal[a.id], a.currency)}</b>
            </button>
          ))}
        </div>
        <div className="calc">
          <div className="disp">{expr ? <><span>{expr}</span>{hasOp && <em>= {fmt(total, accOf(acc)?.currency)}</em>}</> : <i>Введите сумму</i>}</div>
          <div className="keys">
            {['+', '1', '2', '3', '−', '4', '5', '6', '×', '7', '8', '9', '÷', '.', '0', '⌫'].map((k) => (
              <button key={k} className={/[+−×÷]/.test(k) ? 'op' : ''} onClick={() => setExpr((e) => press(e, k))}>{k}</button>
            ))}
          </div>
          <button className="primary wide" disabled={!total} onClick={() => setPick(true)}>
            {total ? `${fmt(total, accOf(acc)?.currency)} — выбрать категорию` : 'Выберите категорию после ввода суммы'}
          </button>
        </div>
        {days.map((g) => {
          const real = g.items.filter((t) => t.type !== 'transfer')
          const sum = real.reduce((x, t) => x + t.amount, 0)
          return (
            <div key={g.k}>
              <div className="dayhdr">{real.length ? `${type === 'expense' ? 'Потрачено' : 'Получено'} ${dayName(g.k)}: ${fmt(sum, 'MDL')}` : `Переводы ${dayName(g.k)}`}</div>
              {g.items.map((t) => {
                if (t.type === 'transfer') {
                  const fa = accOf(t.fromAccountId), ta = accOf(t.toAccountId)
                  return (
                    <div key={t.id} className="row" onClick={() => confirm('Удалить перевод?') && up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) }))}>
                      <span className="ic">⇄</span>
                      <div className="mid"><div>Перевод</div><small>{fa?.name} → {ta?.name}{t.note && <u> {t.note}</u>}</small></div>
                      <div className="rt"><b className="xfer">{fmt(t.amount, fa?.currency)}{fa?.currency !== ta?.currency && ` → ${fmt(t.toAmount ?? t.amount, ta?.currency)}`}</b><small>{hm(t.ts)}</small></div>
                    </div>
                  )
                }
                const c = catOf(t.categoryId)
                return (
                  <div key={t.id} className="row" onClick={() => confirm('Удалить операцию?') && up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) }))}>
                    <span className="ic">{c?.icon}</span>
                    <div className="mid"><div>{c?.name}</div><small>{accOf(t.accountId)?.name}{t.note && <u> {t.note}</u>}</small></div>
                    <div className="rt"><b className={type}>{fmt(t.amount, accOf(t.accountId)?.currency)}</b><small>{hm(t.ts)}</small></div>
                  </div>
                )
              })}
            </div>
          )
        })}
        {!days.length && <p className="empty">Операций пока нет. Введите сумму и выберите категорию.</p>}
      </div>
      {pick && (
        <div className="sheet" onClick={() => setPick(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <h3>{total ? `${fmt(total, accOf(acc)?.currency)} · ${accOf(acc)?.name}` : 'Категории'}</h3>
            <div className="cgrid">
              {cats.map((c) => <button key={c.id} onClick={() => save(c.id)}><span>{c.icon}</span>{c.name}</button>)}
              <button className="add" onClick={addCat}><span>＋</span>Новая</button>
            </div>
          </div>
        </div>
      )}
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

function Report({ ctx }) {
  const { s, up, setModal } = ctx
  const [mode, setMode] = useState('report')
  const [kind, setKind] = useState('month')
  const [anchor, setAnchor] = useState(new Date())
  const [type, setType] = useState('expense')
  const [accF, setAccF] = useState('all')
  const [from, to] = periodRange(kind, anchor)
  const accs = accF === 'all' ? s.accounts : s.accounts.filter((a) => a.id === accF)
  const accMap = Object.fromEntries(s.accounts.map((a) => [a.id, a]))
  const inP = s.transactions.filter((t) => t.ts >= from && t.ts < to && t.type === type && accs.some((a) => a.id === t.accountId))
  const by = {}; inP.forEach((t) => { by[t.categoryId] = (by[t.categoryId] || 0) + toBase(s, t.amount, accMap[t.accountId]?.currency) })
  const data = Object.entries(by).map(([id, v]) => { const c = s.categories.find((x) => x.id === id) || {}; return { id, v, name: c.name, icon: c.icon, color: c.color } }).sort((a, b) => b.v - a.v)
  const total = data.reduce((a, d) => a + d.v, 0)
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
      <Header title="" ctx={ctx} left={<span />} right={<span />} />
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
            <Pie data={data} />
            {data.map((d) => (
              <div key={d.id} className="rep">
                <div className="bar" style={{ width: `${(d.v / (data[0].v || 1)) * 100}%`, background: d.color }} />
                <div className="line"><span>{d.icon} {d.name}</span><span><b>{Math.round((d.v / total) * 100)}%</b><br /><i className={type}>{fmt(d.v, 'MDL')}</i></span></div>
              </div>
            ))}
          </>
        ) : (
          <>
            <p className="hint">Нажмите на категорию, чтобы задать месячный лимит.</p>
            {s.categories.filter((c) => c.type === 'expense').map((c) => {
              const lim = s.budgets[c.id], sp = spentM(c.id), pct = lim ? Math.min(100, (sp / lim) * 100) : 0
              return (
                <div key={c.id} className="bud" onClick={() => setLimit(c)}>
                  <div className="line"><span>{c.icon} {c.name}</span><span>{lim ? <><b className={sp > lim ? 'expense' : ''}>{fmt(sp, 'MDL')}</b> / {fmt(lim, 'MDL')}</> : <small>{sp ? fmt(sp, 'MDL') + ' · ' : ''}лимит не задан</small>}</span></div>
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
  const items = [['🏦', 'Счета', () => setRoute('accounts')], ['🧾', 'Лента', () => setRoute('feed')], ['💳', 'Кредиты', () => setRoute('loans')], ['🔁', 'Автоплатежи', () => setRoute('recurring')], ['📤', 'Экспорт в CSV', dl], ['⚙️', 'Настройки', () => setRoute('settings')]]
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
  const accOpts = { options: s.accounts.map((a) => a.id), labels: Object.fromEntries(s.accounts.map((a) => [a.id, a.name])) }
  if (s.accounts.length < 2) return alert('Нужно минимум два счёта')
  const fi = Math.max(0, s.accounts.findIndex((a) => a.id === fromId))
  setModal({
    title: '⇄ Перевод между счетами',
    fields: [
      { key: 'from', label: 'Откуда', ...accOpts, def: s.accounts[fi].id },
      { key: 'to', label: 'Куда', ...accOpts, def: s.accounts[fi === 0 ? 1 : 0].id },
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
  const total = accF === 'all' ? s.accounts.reduce((a, x) => a + toBase(s, bal[x.id], x.currency), 0) : bal[accF] || 0
  const today = startOfDay(new Date()).getTime()
  const dayName = (k) => new Date(k).toLocaleDateString('ru-RU', { weekday: 'long' }) + (k === today ? ' · сегодня' : k === today - 864e5 ? ' · вчера' : '')
  const addOp = (type) => {
    const cats = s.categories.filter((c) => c.type === type)
    const accs = accF === 'all' ? s.accounts : s.accounts.filter((a) => a.id === accF)
    setModal({
      title: type === 'expense' ? '− Расход' : '+ Доход',
      fields: [
        { key: 'acc', label: 'Счёт', options: s.accounts.map((a) => a.id), labels: Object.fromEntries(s.accounts.map((a) => [a.id, a.name])), def: accs[0]?.id },
        { key: 'cat', label: 'Категория', options: cats.map((c) => c.id), labels: Object.fromEntries(cats.map((c) => [c.id, `${c.icon} ${c.name}`])), def: cats[0]?.id },
        { key: 'amount', label: 'Сумма', type: 'number' },
        { key: 'note', label: 'Заметка' },
      ],
      onSubmit: (v) => { if (+v.amount > 0 && v.acc) up((p) => ({ transactions: [...p.transactions, { id: uid(), type, accountId: v.acc, categoryId: v.cat, amount: +v.amount, ts: Date.now(), note: v.note || '' }] })) },
    })
  }
  const del = (t) => confirm(t.type === 'transfer' ? 'Удалить перевод?' : 'Удалить операцию?') && up((p) => ({ transactions: p.transactions.filter((x) => x.id !== t.id) }))
  return (
    <>
      <Header title="Лента" back="menu" ctx={ctx} right={
        <select className="hsel" value={accF} onChange={(e) => setAccF(e.target.value)}>
          <option value="all">Все</option>
          {s.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
                    <div key={t.id} className="row" onClick={() => del(t)}>
                      <span className="ic">⇄</span>
                      <div className="mid"><div>Перевод</div><small>{fa?.name} → {ta?.name}{t.note && <u> {t.note}</u>}</small></div>
                      <div className="rt"><b className="xfer">{fmt(t.amount, fa?.currency)}{fa?.currency !== ta?.currency && ` → ${fmt(t.toAmount ?? t.amount, ta?.currency)}`}</b><small>{hm(t.ts)}</small></div>
                    </div>
                  )
                }
                const c = catOf(t.categoryId), a = accOf(t.accountId)
                return (
                  <div key={t.id} className="row" onClick={() => del(t)}>
                    <span className="ic">{c?.icon}</span>
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
  const bal = balances(s)
  const form = (a) => setModal({
    title: a ? 'Счёт' : 'Новый счёт',
    fields: [{ key: 'name', label: 'Название', def: a?.name || '' }, { key: 'currency', label: 'Валюта', options: CURRENCIES, def: a?.currency || 'MDL' }, { key: 'initial', label: 'Начальный остаток', type: 'number', def: a?.initial ?? 0 }],
    onSubmit: (v) => v.name && up((p) => ({ accounts: a ? p.accounts.map((x) => x.id === a.id ? { ...x, name: v.name, currency: v.currency, initial: +v.initial || 0 } : x) : [...p.accounts, { id: uid(), name: v.name, currency: v.currency, initial: +v.initial || 0 }] })),
    onDelete: a && (() => confirm('Удалить счёт и его операции?') && up((p) => ({ accounts: p.accounts.filter((x) => x.id !== a.id), transactions: p.transactions.filter((t) => t.accountId !== a.id && t.fromAccountId !== a.id && t.toAccountId !== a.id) }))),
  })
  const sum = s.accounts.reduce((t, a) => t + toBase(s, bal[a.id], a.currency), 0)
  return (
    <>
      <Header title="Счета" back="menu" ctx={ctx} right={<><button className="lnk" onClick={() => openTransfer(ctx)} title="Перевод">⇄</button><button className="lnk" onClick={() => form()}>＋</button></>} />
      <div className="scroll">
        <div className="sum"><h2>Всего: {fmt(sum, 'MDL')}</h2></div>
        {s.accounts.map((a) => <div key={a.id} className="row" onClick={() => form(a)}><span className="ic">🏦</span><div className="mid"><div>{a.name}</div><small>{a.currency}</small></div><div className="rt"><b>{fmt(bal[a.id], a.currency)}</b></div></div>)}
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
        {s.recurring.map((r) => <div key={r.id} className="row" onClick={() => confirm('Удалить автоплатёж?') && up((p) => ({ recurring: p.recurring.filter((x) => x.id !== r.id) }))}><span className="ic">{cat(r.categoryId)?.icon}</span><div className="mid"><div>{cat(r.categoryId)?.name}</div><small>каждый месяц, {r.day}-го {r.note && '· ' + r.note}</small></div><div className="rt"><b className={r.type}>{fmt(r.amount)}</b></div></div>)}
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
        <h4 className="sec">Курсы к MDL (BNM{s.ratesDate ? ', ' + s.ratesDate : ''})</h4>
        {['USD', 'EUR', 'RUB'].map((c) => <label key={c} className="mrow"><span>{SYM[c]}</span>1 {c} =<input className="num" type="number" step="any" value={s.rates[c]} onChange={(e) => up({ rates: { ...s.rates, [c]: +e.target.value || 1 } })} /> MDL</label>)}
        <button className="mrow" onClick={upd}><span>🏦</span>Обновить курсы с BNM<em>{msg}</em></button>
        <h4 className="sec">Устройство</h4>
        <button className="mrow" onClick={ctx.onLogout}><span>🔒</span>Выйти из аккаунта</button>
        <button className="mrow" onClick={() => confirm('Отключить это устройство от хранилища? Токен GitHub будет удалён здесь.') && ctx.onDisconnect()}><span>🔌</span>Отключить устройство</button>
        <button className="mrow danger" onClick={() => confirm('Стереть все счета и операции? Логин и пароль сохранятся.') && up({ ...seed(), auth: s.auth, theme: s.theme, rates: s.rates, ratesDate: s.ratesDate })}><span>♻️</span>Начать с нуля</button>
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
