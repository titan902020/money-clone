import { Carrot, Shirt, Fuel, Coffee, Umbrella, Car, House, Pill, Bus, Briefcase, Laptop, Gift, Star, Dumbbell, Hospital, Utensils, BookOpen, Coins, ShoppingCart, CreditCard, Wallet, Tag } from 'lucide-react'

const MAP = { '🥦': Carrot, '👖': Shirt, '⛽': Fuel, '☕': Coffee, '🏖': Umbrella, '🚗': Car, '🏠': House, '💊': Pill, '🚌': Bus, '💼': Briefcase,
  '🧑‍💻': Laptop, '🎁': Gift, '⭐': Star, '🏋': Dumbbell, '🏥': Hospital, '🍴': Utensils, '📚': BookOpen, '💰': Coins, '🛒': ShoppingCart, '💳': CreditCard }

// Line icon (Lucide) for a category; falls back to the stored emoji if it has no mapping.
export default function Ico({ icon, size = 22 }) {
  const I = MAP[(icon || '').replace(/️/g, '')]
  return I ? <I size={size} strokeWidth={1.75} /> : <>{icon || <Tag size={size} strokeWidth={1.75} />}</>
}
