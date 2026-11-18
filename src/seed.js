const cats = [
  ['Продукты', '🥦', '#ffd54f', 'expense'], ['Одежда', '👖', '#8c9eff', 'expense'], ['Бензин', '⛽', '#ffb74d', 'expense'],
  ['Кафе', '☕', '#ff6b6b', 'expense'], ['Отдых', '🏖️', '#ff9800', 'expense'], ['Машина', '🚗', '#7cdc6a', 'expense'],
  ['Дом', '🏠', '#4fc3f7', 'expense'], ['Здоровье', '💊', '#ba68c8', 'expense'], ['Транспорт', '🚌', '#90a4ae', 'expense'],
  ['Зарплата', '💼', '#66bb6a', 'income'], ['Подработка', '🧑‍💻', '#26a69a', 'income'], ['Подарки', '🎁', '#ec407a', 'income'],
].map(([name, icon, color, type], i) => ({ id: 'c' + i, name, icon, color, type }))
// Empty start: one MDL account at zero, no operations. Rates are MDL per 1 unit (BNM, refreshed from rates.json).
export const seed = () => ({
  v: 2, updatedAt: 0, auth: null, theme: 'dark',
  accounts: [{ id: 'cash', name: 'Наличные', currency: 'MDL', initial: 0 }],
  categories: cats, transactions: [], budgets: {}, loans: [], recurring: [],
  rates: { MDL: 1, USD: 17.5, EUR: 19.5, RUB: 0.19 }, ratesDate: null,
})
