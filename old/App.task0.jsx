import React, { useEffect, useMemo, useState } from 'react'
import { seed } from './seed.js'
import { fmt, uid, hm, evalExpr, press, periodRange, shiftAnchor, periodLabel, toCSV, startOfDay, CURRENCIES, SYM, pad } from './util.js'

const KEY = 'money-clone-v1'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || seed() } catch { return seed() } }

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

export default function App() {
  const [s, setS] = useState(() => applyRecurring(load()))
  const [route, setRoute] = useState('expense')
  const [modal, setModal] = useState(null)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch {} }, [s])
  useEffect(() => { document.documentElement.dataset.theme = s.dark ? 'dark' : 'light' }, [s.dark])
  const up = (patch) => setS((p) => ({ ...p, ...(typeof patch === 'function' ? patch(p) : patch) }))
  const ctx = { s, up, setRoute, setModal }
  const main = ['expense', 'income', 'report', 'menu'].includes(route)
  return (
    <div className="phone">
      {route === 'expense' && <Entry key="e" ctx={ctx} type="expense" />}
      {route === 'income' && <Entry key="i" ctx={ctx} type="income" />}
      {route === 'report' && <Report ctx={ctx} />}
      {route === 'menu' && <Menu ctx={ctx} />}
      {route === 'accounts' && <Accounts ctx={ctx} />}
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
  s.transactions.forEach((t) => { if (b[t.accountId] !== undefined) b[t.accountId] += t.type === 'income' ? t.amount : -t.amount })
  return b
}
const toBase = (s, amt, cur) => amt * (s.rates[cur] || 1)

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
    const list = s.transactions.filter((t) => t.type === type).sort((a, b) => b.ts - a.ts).slice(0, 40)
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
          const sum = g.items.reduce((x, t) => x + t.amount, 0)
          return (
            <div key={g.k}>
              <div className="dayhdr">{type === 'expense' ? 'Потрачено' : 'Получено'} {dayName(g.k)}: {fmt(sum, 'RUB')}</div>
              {g.items.map((t) => {
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
    title: `Лимит: ${c.name} (на месяц)`, fields: [{ key: 'v', label: 'Сумма, ₽ (0 — убрать)', type: 'number', def: s.budgets[c.id] || '' }],
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
              <div>{fmt(accSum, 'RUB')}</div>
            </div>
            <div className="seg small"><button className={type === 'expense' ? 'on' : ''} onClick={() => setType('expense')}>Расходы</button><button className={type === 'income' ? 'on' : ''} onClick={() => setType('income')}>Доходы</button></div>
            <div className="sum"><h2 className={type}>Всего {type === 'expense' ? 'потрачено' : 'получено'}: {fmt(total, 'RUB')}</h2><small>в среднем: {fmt(total / days, 'RUB')} в день</small></div>
            <Pie data={data} />
            {data.map((d) => (
              <div key={d.id} className="rep">
                <div className="bar" style={{ width: `${(d.v / (data[0].v || 1)) * 100}%`, background: d.color }} />
                <div className="line"><span>{d.icon} {d.name}</span><span><b>{Math.round((d.v / total) * 100)}%</b><br /><i className={type}>{fmt(d.v, 'RUB')}</i></span></div>
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
                  <div className="line"><span>{c.icon} {c.name}</span><span>{lim ? <><b className={sp > lim ? 'expense' : ''}>{fmt(sp, 'RUB')}</b> / {fmt(lim, 'RUB')}</> : <small>{sp ? fmt(sp, 'RUB') + ' · ' : ''}лимит не задан</small>}</span></div>
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
  const items = [['🏦', 'Счета', () => setRoute('accounts')], ['💳', 'Кредиты', () => setRoute('loans')], ['🔁', 'Автоплатежи', () => setRoute('recurring')], ['📤', 'Экспорт в CSV', dl], ['⚙️', 'Настройки', () => setRoute('settings')]]
  return (
    <>
      <Header title="Меню" ctx={ctx} />
      <div className="scroll">{items.map(([i, l, f]) => <button key={l} className="mrow" onClick={f}><span>{i}</span>{l}<em>›</em></button>)}</div>
    </>
  )
}

function Accounts({ ctx }) {
  const { s, up, setModal } = ctx
  const bal = balances(s)
  const form = (a) => setModal({
    title: a ? 'Счёт' : 'Новый счёт',
    fields: [{ key: 'name', label: 'Название', def: a?.name || '' }, { key: 'currency', label: 'Валюта', options: CURRENCIES, def: a?.currency || 'RUB' }, { key: 'initial', label: 'Начальный остаток', type: 'number', def: a?.initial ?? 0 }],
    onSubmit: (v) => v.name && up((p) => ({ accounts: a ? p.accounts.map((x) => x.id === a.id ? { ...x, name: v.name, currency: v.currency, initial: +v.initial || 0 } : x) : [...p.accounts, { id: uid(), name: v.name, currency: v.currency, initial: +v.initial || 0 }] })),
    onDelete: a && (() => confirm('Удалить счёт и его операции?') && up((p) => ({ accounts: p.accounts.filter((x) => x.id !== a.id), transactions: p.transactions.filter((t) => t.accountId !== a.id) }))),
  })
  const sum = s.accounts.reduce((t, a) => t + toBase(s, bal[a.id], a.currency), 0)
  return (
    <>
      <Header title="Счета" back="menu" ctx={ctx} right={<button className="lnk" onClick={() => form()}>＋</button>} />
      <div className="scroll">
        <div className="sum"><h2>Всего: {fmt(sum, 'RUB')}</h2></div>
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
  const { s, up } = ctx
  return (
    <>
      <Header title="Настройки" back="menu" ctx={ctx} />
      <div className="scroll">
        <label className="mrow"><span>🌙</span>Тёмная тема<input type="checkbox" checked={s.dark} onChange={(e) => up({ dark: e.target.checked })} /></label>
        <h4 className="sec">Курсы валют к ₽</h4>
        {['USD', 'EUR'].map((c) => <label key={c} className="mrow"><span>{SYM[c]}</span>1 {c} =<input className="num" type="number" value={s.rates[c]} onChange={(e) => up({ rates: { ...s.rates, [c]: +e.target.value || 1 } })} /> ₽</label>)}
        <button className="mrow danger" onClick={() => confirm('Сбросить все данные к демо-набору?') && up(seed())}><span>♻️</span>Сбросить данные</button>
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
