# Screenshots of key views in both themes, with real fonts (set LID_FONT_CSS to a local @font-face stylesheet).
import asyncio, json, os, sys
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW_URL = (ROOT / 'dist' / 'preview.html').as_uri()
SHOTS = str(ROOT / 'test' / 'shots'); pathlib.Path(SHOTS).mkdir(exist_ok=True)
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from ui_phaseA import MOCK, SEED
LOCAL_FONTS = open(os.environ.get('LID_FONT_CSS','/dev/null')).read()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs=[]
        for name, vp, scheme in [('desktop-light',{'width':1366,'height':900},'light'),('phone-dark',{'width':390,'height':844},'dark')]:
            pg = await b.new_page(viewport=vp, color_scheme=scheme)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.route('**/fonts.g*/**', lambda r: r.fulfill(status=200, content_type='text/css', body=LOCAL_FONTS) if 'googleapis' in r.request.url else r.abort())
            await pg.add_init_script(MOCK)
            await pg.goto(PREVIEW_URL); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=SHOTS+f'/L1-welcome-{name}.png')
            await pg.fill('#ob-name','Nate'); await pg.check('#ob-adult'); await pg.click('#onboard button[type=submit]'); await pg.wait_for_timeout(400)
            await pg.click('[data-act=guideDone]'); await pg.wait_for_timeout(300)
            await pg.click('.way[data-entry="why"]'); await pg.wait_for_timeout(500)
            await pg.click('.stone[data-area="Money"]'); await pg.wait_for_timeout(700)
            await pg.fill('#msg','My dad saw money as security. Never spend unless you must.'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1200)
            await pg.screenshot(path=SHOTS+f'/L2-studio-{name}.png')
            await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(1400)
            await pg.screenshot(path=SHOTS+f'/L3-journey-{name}.png', full_page=True)
            await pg.click('#nav [data-view=iterate]'); await pg.click('[data-act=runReview]'); await pg.wait_for_timeout(1500)
            await pg.screenshot(path=SHOTS+f'/L4-iterate-{name}.png')
            await pg.click('#nav [data-view=inputs]'); await pg.wait_for_timeout(900)
            await pg.screenshot(path=SHOTS+f'/L5-inputs-{name}.png')
            print(name, 'overflow:', await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth'))
        print('errors:', errs); await b.close()
asyncio.run(main())
