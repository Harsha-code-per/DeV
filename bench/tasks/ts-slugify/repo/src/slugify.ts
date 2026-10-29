export function slugify(title: string) {
  return title.toLowerCase().replace(" ", "-").replace(/[^a-z0-9-]/g, "")
}
