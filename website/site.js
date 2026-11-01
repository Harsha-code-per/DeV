// Every block in the docs holds one thing to copy, with its own button.
document.querySelectorAll(".doc pre").forEach((block) => {
  const button = document.createElement("button")
  button.className = "copy-block"
  button.type = "button"
  button.textContent = "Copy"
  block.append(button)
  button.addEventListener("click", () => copy(block.querySelector("code").textContent, button))
})

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => copy(document.querySelector(button.dataset.copy).textContent, button))
})

async function copy(text, button) {
  await navigator.clipboard.writeText(text)
  button.textContent = "Copied"
  setTimeout(() => (button.textContent = "Copy"), 1600)
}
