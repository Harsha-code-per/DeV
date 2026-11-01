document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const text = document.querySelector(button.dataset.copy).textContent
    await navigator.clipboard.writeText(text).then(() => {
      button.textContent = "Copied"
      setTimeout(() => (button.textContent = "Copy"), 1600)
    })
  })
})
