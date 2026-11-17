import { uid } from './util.js'
const cats = [
  ['Продукты', '🥦', '#ffd54f', 'expense'], ['Одежда', '👖', '#8c9eff', 'expense'], ['Бензин', '⛽', '#ffb74d', 'expense'],
  ['Кафе', '☕', '#ff6b6b', 'expense'], ['Отдых', '🏖️', '#ff9800', 'expense'], ['Машина', '🚗', '#7cdc6a', 'expense'],
  ['Дом', '🏠', '#4fc3f7', 'expense'], ['Здоровье', '💊', '#ba68c8', 'expense'], ['Транспорт', '🚌', '#90a4ae', 'expense'],
  ['Зарплата', '💼', '#66bb6a', 'income'], ['Подработка', '🧑‍💻', '#26a69a', 'income'], ['Подарки', '🎁', '#ec407a', 'income'],
].map(([name, icon, color, type]) => ({ id: uid(), name, icon, color, type }))
const byName = (n) => cats.find((c) => c.name === n).id
const accounts = [
  { id: 'cash', name: 'Наличные', currency: 'RUB', initial: 5000 },
  { id: 'credit', name: 'Кредитка', currency: 'RUB', initial: 30000 },
  { id: 'usd', name: 'Доллары', currency: 'USD', initial: 2000 },
  { id: 'eur', name: 'Евро', currency: 'EUR', initial: 1000 },
]
const now = new Date()
const at = (daysAgo, h, m) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return Math.min(d.getTime(), Date.now() - 60000 * (20 + m % 10)) }
const tx = (type, accountId, cat, amount, ts, note = '') => ({ id: uid(), type, accountId, categoryId: byName(cat), amount, ts, note })
export const seed = () => ({
  accounts, categories: cats,
  transactions: [
    tx('expense', 'cash', 'Продукты', 500, at(0, 8, 34)), tx('expense', 'credit', 'Одежда', 4000, at(0, 8, 34), 'Джинсы'),
    tx('expense', 'credit', 'Бензин', 1200, at(0, 8, 33)), tx('expense', 'cash', 'Кафе', 1000, at(1, 13, 10)),
    tx('expense', 'credit', 'Машина', 2728, at(3, 18, 0)), tx('expense', 'cash', 'Продукты', 2200, at(5, 19, 20)),
    tx('expense', 'cash', 'Отдых', 1500, at(8, 20, 5)), tx('expense', 'credit', 'Дом', 3100, at(12, 10, 0)),
    tx('income', 'credit', 'Зарплата', 60000, at(10, 9, 0)), tx('income', 'cash', 'Подарки', 3000, at(4, 15, 0)),
  ],
  budgets: { [byName('Продукты')]: 8000, [byName('Кафе')]: 3000, [byName('Одежда')]: 6000, [byName('Машина')]: 5000 },
  loans: [
    { id: uid(), name: 'Ипотека', icon: '🏠', total: 8100000, paid: 2000000, archived: false },
    { id: uid(), name: 'Автокредит', icon: '🚚', total: 4000000, paid: 1040000, archived: false },
  ],
  recurring: [], rates: { RUB: 1, USD: 90, EUR: 98 }, dark: false,
})
