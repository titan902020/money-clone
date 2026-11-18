// Fetch official BNM exchange rates (MDL per 1 unit) into public/rates.json
import { writeFileSync, existsSync, readFileSync } from 'node:fs'
const out = new URL('../public/rates.json', import.meta.url)
const d = new Date(), p = (n) => String(n).padStart(2, '0')
const date = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
try {
  const xml = await (await fetch(`https://www.bnm.md/en/official_exchange_rates?get_xml=1&date=${date}`)).text()
  const rates = {}
  for (const m of xml.matchAll(/<CharCode>(\w+)<\/CharCode>\s*<Nominal>(\d+)<\/Nominal>[\s\S]*?<Value>([\d.]+)<\/Value>/g)) {
    if (['USD', 'EUR', 'RUB'].includes(m[1])) rates[m[1]] = +(+m[3] / +m[2]).toFixed(6)
  }
  if (Object.keys(rates).length < 3) throw new Error('no rates in response')
  writeFileSync(out, JSON.stringify({ date, source: 'BNM', rates }, null, 1) + '\n')
  console.log('rates', date, rates)
} catch (e) {
  console.error('fetch failed:', e.message)
  if (!existsSync(out)) process.exit(1)
  console.log('keeping existing', readFileSync(out, 'utf8'))
}
