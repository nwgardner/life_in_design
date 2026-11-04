import asyncio, json
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
PREVIEW_URL = (ROOT / 'dist' / 'preview.html').as_uri()
SHOTS = str(ROOT / 'test' / 'shots'); pathlib.Path(SHOTS).mkdir(exist_ok=True)
from playwright.async_api import async_playwright
import os
LOCAL_FONTS = open(os.environ.get('LID_FONT_CSS','/dev/null')).read()
REVIEW = {"summary":"Mostly congruent. Email is eating the hours your Purpose needs.",
 "trace":[{"item":"Morning writing","element":"Key Activities","tracesTo":["Strategy","Purpose"],"status":"traced","note":"core"},
          {"item":"Email triage","element":"Key Activities","tracesTo":[],"status":"untraced","note":"no link"},
          {"item":"Coaching calls","element":"Key Activities","tracesTo":["Relationships"],"status":"weak","note":"loose"}],
 "orphans":[{"element":"Vision","text":"A thriving neighborhood","note":"nothing carries it out"}],
 "cards":[{"layer":"Why","kind":"contemplate","title":"What would make you proud at 80?","body":"Sit with it for a week.","tracesTo":"Purpose","action":{"type":"journal","text":"What would make you proud at 80?"}},
   {"layer":"How","kind":"challenge","title":"Your no-list is missing email","body":"Email takes Tuesday. Your Strategy says writing comes first.","tracesTo":"Purpose","action":{"type":"revise","element":"Strategy","text":"Add email triage to the no-list"}},
   {"layer":"What","kind":"suggest","title":"Learn group facilitation","body":"It builds on your Developer strength.","tracesTo":"Purpose","action":{"type":"learn","kind":"Skill","text":"Group facilitation"}},
   {"layer":"What","kind":"community","title":"Find a local writers circle","body":"Fellow travelers for your writing practice.","tracesTo":"Relationships","action":{"type":"community"},"search":"writers circle near me"}]}
MOCK = """
window.claude = { use: async (n) => n!=='sample' ? null : Object.assign(async (msgs, o) => {
  const last = msgs[msgs.length-1].content;
  let text = /congruence review/.test(last) ? '```json\\n'+JSON.stringify(%s)+'\\n```'
    : /TASK FOR THE APP/.test(last) ? '- Draft line' : 'Take your time with that. What do you notice?';
  if (o && o.onText) o.onText({text, delta:text});
  return { text, truncated:false };
}, { json: async()=>({}) }) };
""" % json.dumps(REVIEW)
SEED = """() => {
  const db = JSON.parse(localStorage.getItem('lid.db.v1'));
  const d = { rows:t=>db[t]=db[t]||[], insert:(t,o)=>{ const c={}; for(const k in o) c[k]=o[k]==null?'':String(o[k]); (db[t]=db[t]||[]).push(c); return c; },
    update:(t,p,patch)=>{ (db[t]||[]).forEach(o=>{ if(p(o)) for(const k in patch) o[k]=String(patch[k]); }); } };
  const userId = localStorage.getItem('lid.userId');
  LID.ACTIONS.saveChosenBelief(d,{userId, area:'Money', belief:'Enough is a choice I make.'});
  const S = {'Core Beliefs':'- I am enough, and growing.\\n- People mostly do their best.','Vision':'A neighborhood where every kid has a mentor.','Purpose':'I help people find the words for who they are.',
    'Governing Principles':'- I say the hard thing early.','Strategy':'Focus: writing, coaching. No: committees.','Relationships':'Multipliers: Ana, Sam.',
    'Key Activities':'- Morning writing\\n- Coaching calls\\n- Email triage','Resources':'Writing, listening.','Methods':'Weekly review on Fridays.'};
  for (const e of Object.keys(S)) LID.ACTIONS.saveElement(d,{userId, element:e, statement:S[e], status:'Draft'});
  localStorage.setItem('lid.db.v1', JSON.stringify(db));
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs=[]
        for name, vp, scheme in [('desktop',{'width':1280,'height':900},'light'),('phone',{'width':390,'height':844},'dark')]:
            pg = await b.new_page(viewport=vp, color_scheme=scheme)
            pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e)))
            await pg.route('**/fonts.g*/**', lambda r: r.fulfill(status=200, content_type='text/css', body=LOCAL_FONTS) if 'googleapis' in r.request.url else r.abort())
            await pg.add_init_script(MOCK)
            await pg.goto(PREVIEW_URL); await pg.wait_for_timeout(300)
            await pg.fill('#ob-name','Nate'); await pg.check('#ob-adult')
            await pg.click('#onboard button[type=submit]'); await pg.wait_for_timeout(300)
            await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(500)
            overflow = {}
            async def ov(tag): overflow[tag] = await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth')
            await ov('journey')
            # --- tests
            await pg.click('#nav [data-view=inputs]'); await pg.wait_for_timeout(200); await ov('inputs')
            await pg.click('[data-test=clifton]'); await pg.wait_for_timeout(200)
            for th in ['Learner','Developer','Strategic','Ideation','Relator']:
                await pg.click(f'#layer [data-act=rk-add][data-v="{th}"]')
            await pg.click('#layer [data-act=rk-up][data-i="1"]')
            if name=='desktop': await pg.screenshot(path=SHOTS+'/A1-clifton-editor.png')
            await pg.click('#layer [data-act=edSave]'); await pg.wait_for_timeout(200)
            await pg.click('[data-test=mbti]'); await pg.wait_for_timeout(150)
            for i,l in enumerate('INFJ'): await pg.click(f'#layer [data-act=pair][data-i="{i}"][data-v="{l}"]')
            await pg.fill('#layer [data-inp=pct][data-i="0"]','64'); await pg.click('#layer [data-act=sel][data-v=A]')
            await pg.click('#layer [data-act=edSave]'); await pg.wait_for_timeout(150)
            await pg.click('[data-test=genius]'); await pg.wait_for_timeout(150)
            for it,v in [('Wonder','genius'),('Invention','genius'),('Discernment','competency'),('Galvanizing','competency'),('Enablement','frustration'),('Tenacity','frustration')]:
                await pg.click(f'#layer [data-act=bk][data-item="{it}"][data-v="{v}"]')
            if name=='phone': await pg.screenshot(path=SHOTS+'/A2-genius-phone.png')
            await pg.click('#layer [data-act=edSave]'); await pg.wait_for_timeout(150)
            await pg.click('[data-test=love]'); await pg.wait_for_timeout(150)
            for it,v in [('Words of Affirmation','4'),('Quality Time','10'),('Receiving Gifts','1'),('Acts of Service','7'),('Physical Touch','8')]:
                await pg.fill(f'#layer input[type=number][data-item="{it}"]', v)
            await pg.click('#layer [data-act=edSave]'); await pg.wait_for_timeout(150)
            await pg.click('[data-test=enneagram]'); await pg.wait_for_timeout(150)
            await pg.click('#layer [data-act=sel][data-f=type][data-v="5"]'); await pg.click('#layer [data-act=sel][data-f=wing][data-v="4"]')
            await pg.click('#layer [data-act=edSave]'); await pg.wait_for_timeout(150)
            if name=='desktop': await pg.screenshot(path=SHOTS+'/A3-tests.png', full_page=True)
            # --- journal
            await pg.click('[data-act=tab][data-tab=journal]'); await pg.click('[data-act=nextPrompt]')
            await pg.fill('#jr-entry','Tuesdays feel stolen by email.'); await pg.click('#journalForm button[type=submit]'); await pg.wait_for_timeout(150)
            # --- growth
            await pg.click('[data-act=tab][data-tab=growth]'); await pg.click('[data-act=gkind][data-v=Skill]')
            await pg.fill('#gr-title','Public speaking'); await pg.fill('#gr-detail','Toastmasters, 10 speeches'); await pg.click('#growthForm button[type=submit]'); await pg.wait_for_timeout(150)
            await ov('growth')
            # --- iterate
            await pg.click('#nav [data-view=iterate]'); await pg.click('[data-act=runReview]'); await pg.wait_for_timeout(800)
            await ov('iterate')
            await pg.screenshot(path=SHOTS+f'/A4-iterate-{name}.png', full_page=(name=='desktop'))
            # adapt the How card -> Strategy studio
            await pg.click('[data-act=recAdapt] >> nth=0'); await pg.fill('#rec-text','Email only in a 30-minute window after lunch')
            await pg.click('[data-act=recAdaptSave]'); await pg.wait_for_timeout(700)
            studio = await pg.evaluate("document.querySelector('.chat-head .eyebrow').innerText")
            note = await pg.evaluate("[...document.querySelectorAll('.divider')].pop().innerText")
            await pg.click('#nav [data-view=iterate]'); await pg.wait_for_timeout(200)
            await pg.click('[data-act=rec] >> text=Accept'); await pg.wait_for_timeout(300)   # learn card
            await pg.click('[data-act=recDecline] >> nth=-1'); await pg.fill('#rec-note','Already in one'); await pg.click('[data-act=recDeclineSave]'); await pg.wait_for_timeout(200)
            await pg.click('[data-act=rec] >> text=Sit with it'); await pg.wait_for_timeout(300)
            jp = await pg.evaluate("document.querySelector('#journalForm .q') && document.querySelector('#journalForm .q').innerText")
            # --- notifications
            await pg.click('#nav [data-view=you]'); await pg.wait_for_timeout(150); await ov('you')
            await pg.uncheck('[data-nf=reflection]'); await pg.wait_for_timeout(200)
            await pg.click('#nav [data-view=journey]'); await pg.wait_for_timeout(200)
            if name=='desktop': await pg.screenshot(path=SHOTS+'/A5-journey.png', full_page=True)
            db = await pg.evaluate("JSON.parse(localStorage.getItem('lid.db.v1'))")
            print(f'--- {name}')
            print(' tests:', [ (a['Test'], a['Summary'][:60]) for a in db['Assessments'] ])
            print(' journal:', len(db['Journal']), '| growth:', [(g['Kind'],g['Title'],g['Status']) for g in db['Growth']])
            print(' recs:', [(r['Layer'], r['Status'], r['UserNote']) for r in db['Recommendations']])
            print(' studio after adapt:', studio, '| note:', note[:90])
            print(' journal prompt from Why card:', jp)
            print(' prefs:', db['Users'][0].get('Prefs'))
            print(' overflow:', overflow)
        print('errors:', errs[:5]); await b.close()
if __name__ == '__main__':
    asyncio.run(main())
