import type { Item } from "./cart"

export function invoiceLines(items: Item[]) {
  return items.map((item) => {
    const gross = item.price * item.qty
    const net = gross - gross * (item.discount ?? 0)
    const total = Math.round(net * 100) / 100
    return `${item.name.padEnd(12)} ${String(item.qty).padStart(3)} x ${item.price.toFixed(2)} = ${total.toFixed(2)}`
  })
}
