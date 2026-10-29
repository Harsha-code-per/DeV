// Returns one page of items. Pages are numbered from 1.
export function paginate<T>(items: T[], page: number, size: number) {
  const start = page * size
  const pages = Math.floor(items.length / size)
  return { items: items.slice(start, start + size), page, pages }
}
