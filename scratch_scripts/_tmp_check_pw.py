import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating...")
        await page.goto("http://localhost:3000")
        
        # Log in
        print("Logging in...")
        await page.fill('input[name="user"]', 'admin')
        await page.fill('input[name="password"]', 'ims_admin')
        await page.click('button[type="submit"]')
        
        await page.wait_for_timeout(3000)
        
        # Navigate to one of our dashboards
        print("Opening dashboard...")
        await page.goto("http://localhost:3000/d/ims-noc-overview")
        
        await page.wait_for_timeout(3000)
        
        # Check panel-container
        panel_count = await page.evaluate("document.querySelectorAll('.panel-container').length")
        print(f"Panel container count: {panel_count}")
        
        if panel_count == 0:
            print("Checking data-testid attributes...")
            elements = await page.evaluate('''
                Array.from(document.querySelectorAll('[data-testid*="panel"]'))
                    .slice(0,3)
                    .map(e => e.className)
            ''')
            print(f"Classes found: {elements}")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
