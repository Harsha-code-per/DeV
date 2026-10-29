// Calls `fn` for every item with at most `limit` calls running at the same time.
export function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let running = 0
  let next = 0
  return new Promise((resolve, reject) => {
    const launch = () => {
      if (next === items.length && running === 0) return resolve(results)
      while (running < limit && next < items.length) {
        const item = items[next++]
        running++
        fn(item, next).then((result) => {
          results.push(result)
          running--
          launch()
        }, reject)
      }
    }
    launch()
  })
}
