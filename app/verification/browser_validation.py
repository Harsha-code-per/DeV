from playwright.sync_api import sync_playwright


class BrowserValidator:
    def check_site(self, url: str):
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True
                )

                page = browser.new_page()

                page.goto(
                    url,
                    wait_until="domcontentloaded",
                    timeout=30000
                )

                title = page.title()

                browser.close()

                return {
                    "success": True,
                    "title": title
                }

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }