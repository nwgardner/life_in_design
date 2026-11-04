import asyncio, sys
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW_URL = (ROOT / 'dist' / 'preview.html').as_uri()
SHOTS = str(ROOT / 'test' / 'shots'); pathlib.Path(SHOTS).mkdir(exist_ok=True)
from playwright.async_api import async_playwright
import os
LOCAL_FONTS = open(os.environ.get('LID_FONT_CSS','/dev/null')).read()
MOCK = """
window.claude = { use: async (n) => n!=='sample' ? null : Object.assign(async (msgs, o) => {
  const last = msgs[msgs.length-1].content;
  let text = /TASK FOR THE APP/.test(last) ? (/Belief:/.test(last) ? 'Belief: Enough is a choice I make.\\nWhy: Chasing more hid what I had.' : '- I am enough, and growing.\\n- People mostly do their best.')
     : 'Let\\'s begin with what your *father figure* believed about money. What did you hear, out loud or between the lines?';
  if (o && o.onText) o.onText({text, delta:text});
  return { text, truncated:false };
}, { json: async()=>({}) }) };
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errs=[]
        for name, vp, scheme in [('desktop',{'width':1280,'height':860},'light'),('phone',{'width':390,'height':844},'dark')]:
            pg = await b.new_page(viewport=vp, color_scheme=scheme)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type=='error' and 'fonts' not in m.text else None)
            await pg.add_init_script(MOCK); await pg.route('**/fonts.g*/**', lambda r: r.fulfill(status=200, content_type='text/css', body=LOCAL_FONTS) if 'googleapis' in r.request.url else r.abort())
            await pg.goto(PREVIEW_URL)
            await pg.wait_for_timeout(400)
            if name=='desktop': await pg.screenshot(path=SHOTS+'/1-welcome.png', full_page=True)
            await pg.fill('#ob-name','Nate'); await pg.fill('#ob-brought','Feeling scattered across too many good things.')
            await pg.fill('#ob-pressing','Should I take the new role?'); await pg.check('#ob-adult')
            await pg.click('#onboard button[type=submit]'); await pg.wait_for_timeout(300)
            await pg.click('button.area[data-area="Money"]'); await pg.wait_for_timeout(600)
            await pg.fill('#msg','My dad saw money as security. Never spend unless you must.')
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
            await pg.screenshot(path=SHOTS+f'/2-explore-{name}.png', full_page=(name=='desktop'))
            # walk lenses
            await pg.click('[data-act=nextLens]'); await pg.wait_for_timeout(400)
            for i in range(6):
                await pg.fill('#msg', f'Answer {i}'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(350)
                await pg.click('[data-act=nextLens]'); await pg.wait_for_timeout(350)
            await pg.click('[data-act=closeArea]'); await pg.wait_for_timeout(500)
            await pg.click('[data-act=saveBelief]'); await pg.wait_for_timeout(400)
            await pg.click('[data-act=nav][data-view=journey] >> nth=0'); await pg.wait_for_timeout(300)
            await pg.click('button.cell[data-key="Core Beliefs"]'); await pg.wait_for_timeout(500)
            await pg.click('[data-act=capture]'); await pg.wait_for_timeout(500)
            if name=='desktop': await pg.screenshot(path=SHOTS+'/3-capture.png')
            await pg.click('[data-act=saveEl][data-status=Draft]'); await pg.wait_for_timeout(400)
            await pg.click('#nav [data-view=journey]'); await pg.wait_for_timeout(300)
            await pg.screenshot(path=SHOTS+f'/4-journey-{name}.png', full_page=True)
            await pg.click('#nav [data-view=design]'); await pg.wait_for_timeout(300)
            if name=='phone': await pg.screenshot(path=SHOTS+'/5-design-phone.png', full_page=False)
            sw = await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth')
            print(name, 'horizontal overflow:', sw)
            st = await pg.evaluate("JSON.parse(localStorage.getItem('lid.db.v1')).DesignRecord.length + ' design rows, ' + JSON.parse(localStorage.getItem('lid.db.v1')).ChosenBeliefs.length + ' chosen'")
            print(name, st)
        print('errors:', errs[:5])
        await b.close()
asyncio.run(main())
