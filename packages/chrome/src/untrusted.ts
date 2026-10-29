// The same wrapping DeV uses for web content (packages/devcode/src/util/untrusted.ts): DeV's system
// prompt tells the model to treat these blocks as data, and a closing tag inside the page is
// neutralised so the page can't end the block early.
export function wrap(source: string, content: string) {
  const safe = content.replaceAll(/<\/?untrusted_content/gi, (tag) => tag.replace("<", "&lt;"))
  return `<untrusted_content source="${source.replaceAll('"', "&quot;")}">\n${safe}\n</untrusted_content>`
}
