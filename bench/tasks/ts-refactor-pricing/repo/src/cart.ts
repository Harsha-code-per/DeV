// discount is a fraction between 0 and 1
export type Item = { name: string; price: number; qty: number; discount?: number }

export function cartTotal(items: Item[]) {
  return items.reduce((sum, item) => {
    const gross = item.price * item.qty
    const net = gross - gross * (item.discount ?? 0)
    return sum + Math.round(net * 100) / 100
  }, 0)
}
