`src/cart.ts` and `src/invoice.ts` both compute the total for one line item with copy-pasted logic (quantity, discount, rounding to cents).

Refactor: move that logic into one exported function `lineTotal(item: Item): number` in a new file `src/pricing.ts`, move the `Item` type there too (re-export it from `src/cart.ts` so existing imports keep working), and make both `cart.ts` and `invoice.ts` use `lineTotal`. This is a pure refactor: the results of `cartTotal` and `invoiceLines` must not change for any input.
