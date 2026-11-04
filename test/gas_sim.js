// Runs dist/apps-script/Code.gs against an in-memory mock of SpreadsheetApp + a fake Claude API.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const code = fs.readFileSync(path.join(__dirname, '../dist/apps-script/Code.gs'), 'utf8');
const fw = JSON.parse(fs.readFileSync(path.join(__dirname, '../framework.json'), 'utf8'));

function Sheet(name){ this.name=name; this.data=[]; }
Sheet.prototype.getLastRow=function(){ let n=this.data.length; while(n>0 && this.data[n-1].every(v=>v===''||v==null)) n--; return n; };
Sheet.prototype.getLastColumn=function(){ return (this.data[0]||[]).filter(v=>v!==''&&v!=null).length; };
Sheet.prototype.getMaxRows=function(){ return Math.max(1000,this.data.length); };
Sheet.prototype.setFrozenRows=function(){ return this; };
Sheet.prototype.getRange=function(r,c,nr,nc){ const s=this; nr=nr||1; nc=nc||1; const rg={
  getValues(){ const out=[]; for(let i=0;i<nr;i++){ const row=[]; for(let j=0;j<nc;j++){ const v=(s.data[r-1+i]||[])[c-1+j]; row.push(v===undefined?'':v);} out.push(row);} return out; },
  setValues(v){ v.forEach((row,i)=>{ while(s.data.length<r+i) s.data.push([]); row.forEach((x,j)=>{ s.data[r-1+i][c-1+j]=x; }); }); return rg; },
  setNumberFormat(){ return rg; }, setFontWeight(){ return rg; }, setFontColor(){ return rg; }, setBackground(){ return rg; } }; return rg; };
const sheets={};
const NEW_TABS=['Assessments','Journal','Growth','Recommendations','Reviews'];
Object.keys(fw.tables).filter(t=>!NEW_TABS.includes(t)).forEach(t=>{ const s=new Sheet(t); s.data.push(fw.tables[t].filter(c=>c!=='LensStatus'&&c!=='Prefs')); sheets[t]=s; });
const ss={ getSheetByName:n=>sheets[n]||null, insertSheet:n=>(sheets[n]=new Sheet(n)), getName:()=>'mock' };

let lastBody=null, calls=0;
const ctx = {
  SpreadsheetApp:{ openById:()=>ss, getActiveSpreadsheet:()=>ss },
  LockService:{ getScriptLock:()=>({ waitLock(){}, releaseLock(){} }) },
  PropertiesService:{ getScriptProperties:()=>({ getProperty:k=>k==='ANTHROPIC_API_KEY'?'sk-test':null }) },
  UrlFetchApp:{ fetch:(url,opt)=>{ calls++; lastBody=JSON.parse(opt.payload);
    const lastUser = lastBody.messages[lastBody.messages.length-1].content;
    let text = 'What do you notice when you sit with that? Take your time.';
    if (/congruence review/.test(lastUser)) text = 'Here is the review:\n```json\n'+JSON.stringify({summary:'Mostly congruent; Tuesdays drift from your Purpose.',
      trace:[{item:'Morning writing',element:'Key Activities',tracesTo:['Strategy','Purpose'],status:'traced',note:'core'},{item:'Email triage',element:'Key Activities',tracesTo:[],status:'untraced',note:'no link'},{item:'Coaching calls',element:'Key Activities',tracesTo:['Relationships'],status:'weak',note:'loose'}],
      orphans:[{element:'Vision',text:'thriving neighborhood',note:'nothing carries it out'}],
      cards:[{layer:'Why',kind:'contemplate',title:'What would make you proud at 80?',body:'Sit with it.',tracesTo:'Purpose',action:{type:'journal',text:'What would make you proud at 80?'}},
             {layer:'Why',kind:'contemplate',title:'EXTRA WHY (should be capped)',body:'x',tracesTo:'Vision',action:{type:'journal'}},
             {layer:'How',kind:'challenge',title:'Your no-list is missing email',body:'Email eats Tuesday.',tracesTo:'Purpose',action:{type:'revise',element:'Strategy',text:'Add email triage to the no-list'}},
             {layer:'What',kind:'suggest',title:'Learn facilitation',body:'Builds on Developer.',tracesTo:'Purpose',action:{type:'learn',kind:'Skill',text:'Group facilitation'}},
             {layer:'What',kind:'community',title:'Find a writers group',body:'Fellow travelers.',tracesTo:'Relationships',action:{type:'community'},search:'writers group near me'}]})+'\n```';
    else if (/TASK FOR THE APP/.test(lastUser)) text = /Belief:/.test(lastUser) ? 'Belief: Enough is a choice I make each day.\nWhy: Because chasing more kept me from noticing what I had.' : '- I am enough, and growing.\n- People are mostly doing their best.\n- The universe rewards curiosity.';
    return { getResponseCode:()=>200, getContentText:()=>JSON.stringify({ content:[{type:'text',text}] }) }; } },
  HtmlService:{}, Logger:{ log:console.log }, console
};
vm.createContext(ctx); vm.runInContext(code, ctx);
const api = (a, args) => { const r = ctx.api(a, args); if (r && r.error) throw new Error(a+': '+r.error); return r; };
const assert = (c, m) => { if(!c) throw new Error('ASSERT: '+m); console.log('  ✓', m); };

// 1. under-18 is refused
assert(ctx.api('createUser',{ name:'Kid', is18:false }).error, 'under-18 createUser is refused');
// 2. onboarding with a pressing problem
const u = api('createUser',{ name:'Nate', whatBrought:'Feeling scattered', hopedChange:'More intention', pressing:'Should I take the new role?', is18:true });
const userId = u.UserID; const s = api('startSession',{ userId }); const sessionId = s.SessionID;
let st = api('getState',{ userId });
assert(st.parked.length===1 && st.parked[0].Status==='Parked', 'pressing problem parked on onboarding');
// 3. strict order: Vision locked
assert(ctx.api('saveElement',{ userId, element:'Vision', statement:'x', status:'Draft' }).error, 'Vision cannot be saved before the Why beneath it');
assert(ctx.api('coach',{ userId, context:'element:Core Beliefs', mode:'open' }).error, 'Core Beliefs coaching is locked before a chosen belief');
// 4. exploration: open area, coach opens, answer, lens capture
api('startArea',{ userId, sessionId, area:'Money' });
let r = api('coach',{ userId, sessionId, context:'explore:Money', mode:'open' });
assert(r.reply && r.reply.Role==='assistant', 'coach opens the Money area');
assert(/CURRENT Lens 1 of 7 · Father figure/.test(lastBody.system[1].text), 'context names the current lens (Father figure)');
assert(/first area/.test(lastBody.system[1].text), 'first-ever area prompts the premise');
assert(lastBody.system[0].cache_control && /Life in Design Coach/.test(lastBody.system[0].text), 'full guide sent as cached system block');
assert(/Should I take the new role/.test(lastBody.system[1].text), 'parked problem is in the coach context');
api('coach',{ userId, sessionId, context:'explore:Money', mode:'chat', message:'My dad saw money as security; never spend.' });
st = api('getState',{ userId });
assert(st.exploration.find(x=>x.Area==='Money' && x.LensOrder==='1').Response.includes('security'), 'reply captured under lens 1');
const adv=ctx.api('advanceLens',{ userId, sessionId, area:'Money' }); console.log(adv&&adv.error); assert(!adv.error, 'advance from lens 1');
api('advanceLens',{ userId, sessionId, area:'Money', skip:true }); // skip mother
for (let i=3;i<=7;i++){ api('coach',{ userId, sessionId, context:'explore:Money', mode:'chat', message:'Answer for lens '+i }); api('advanceLens',{ userId, sessionId, area:'Money' }); }
st = api('getState',{ userId });
const rows = st.exploration.filter(x=>x.Area==='Money');
assert(rows.length===7, 'seven lens rows for Money');
assert(rows.find(x=>x.LensOrder==='2').Skipped==='TRUE', 'mother lens recorded as skipped');
r = api('coach',{ userId, sessionId, context:'explore:Money', mode:'open' });
assert(/All seven lenses are explored/.test(lastBody.system[1].text), 'coach told to invite closing the area');
r = api('coach',{ userId, sessionId, context:'explore:Money', mode:'draft' });
assert(r.draft && r.draft.belief.startsWith('Enough'), 'draft of chosen belief parsed');
api('saveChosenBelief',{ userId, sessionId, area:'Money', belief:r.draft.belief, why:r.draft.why });
// 5. Core Beliefs unlocked, capture + versioning
r = api('coach',{ userId, sessionId, context:'element:Core Beliefs', mode:'open' });
assert(/Synthesize from the chosen beliefs/.test(lastBody.system[1].text) && /Enough is a choice/.test(lastBody.system[1].text), 'Core Beliefs context carries chosen beliefs');
r = api('coach',{ userId, sessionId, context:'element:Core Beliefs', mode:'draft' });
assert(typeof r.draft==='string' && r.draft.includes('enough'), 'element draft returned for approval (not saved)');
st = api('getState',{ userId }); assert(st.design.length===0, 'nothing saved before approval');
api('saveElement',{ userId, sessionId, element:'Core Beliefs', statement:r.draft, status:'Draft' });
api('saveElement',{ userId, sessionId, element:'Core Beliefs', statement:r.draft+'\n- Love is a practice.', status:'Approved', changeNote:'Added love' });
st = api('getState',{ userId });
const cbRow = st.design.find(x=>x.Element==='Core Beliefs');
assert(cbRow.Version==='2' && cbRow.Status==='Approved', 'Core Beliefs at v2 Approved');
assert(st.history.filter(h=>h.Element==='Core Beliefs').length===2, 'both versions kept in ElementHistory');
assert(st.history[1].ChangeNote==='Added love', 'change note stored');
// 6. walk the rest of the stack
['Vision','Purpose','Governing Principles','Strategy','Relationships','Key Activities','Resources','Methods'].forEach(e=>api('saveElement',{ userId, sessionId, element:e, statement:e+' draft', status:'Draft' }));
r = api('coach',{ userId, sessionId, context:'element:Key Activities', mode:'chat', message:'My week is chaos.' });
assert(/The What layer has arrived/.test(lastBody.system[1].text), 'What layer brings parked problems back');
r = api('coach',{ userId, sessionId, context:'alignment', mode:'open' });
assert(/Alignment check/.test(lastBody.system[1].text), 'alignment context');
// 7. commitments, problems, sessions
api('addCommitment',{ userId, sessionId, text:'Write my no-list', focus:'Strategy', context:'element:Strategy' });
st = api('getState',{ userId });
const c = st.commitments[0]; assert(c.Status==='Open', 'commitment open');
api('updateCommitment',{ userId, commitmentId:c.CommitmentID, status:'Done' });
api('updateProblem',{ userId, problemId:st.parked[0].ProblemID, status:'Resolved' });
st = api('getState',{ userId });
assert(st.commitments[0].Status==='Done' && st.parked[0].Status==='Resolved', 'commitment done & problem resolved');
assert(sheets.Sessions.data[1][3] !== '', 'session end recorded');
// 8. model message shape
const msgs = lastBody.messages; let ok = msgs[0].role==='user' && msgs[msgs.length-1].role==='user';
for (let i=1;i<msgs.length;i++) if (msgs[i].role===msgs[i-1].role) ok=false;
assert(ok, 'messages alternate and start/end with user');
assert(!JSON.stringify(api('getState',{ userId })).includes('Watts'), 'client payload never carries the voice note');
assert(sheets.BeliefExploration.data[0].includes('LensStatus'), 'missing LensStatus column added to existing sheet');

console.log('\nPhase A');
assert(NEW_TABS.every(t=>sheets[t] && sheets[t].data[0][0]), 'new tabs created in an existing Sheet');
assert(sheets.Users.data[0].includes('Prefs'), 'Prefs column added to Users');
// assessments
assert(ctx.api('saveAssessment',{ userId, test:'clifton', values:{ top:['Learner','Strategic'] } }).error, 'CliftonStrengths needs at least 5');
api('saveAssessment',{ userId, test:'clifton', values:{ top:['Learner','Strategic','Ideation','Relator','Achiever'] }, takenOn:'2025-01-10' });
api('saveAssessment',{ userId, test:'mbti', values:{ pairs:[{pick:'I',pct:'62'},{pick:'N'},{pick:'F'},{pick:'J'}], identity:'A' } });
assert(ctx.api('saveAssessment',{ userId, test:'genius', values:{ buckets:{Wonder:'genius',Invention:'genius',Discernment:'genius'} } }).error, 'Working Genius enforces 2/2/2');
api('saveAssessment',{ userId, test:'genius', values:{ buckets:{Wonder:'genius',Invention:'genius',Discernment:'competency',Galvanizing:'competency',Enablement:'frustration',Tenacity:'frustration'} } });
api('saveAssessment',{ userId, test:'holland', values:{ code:['Social','Artistic','Investigative'] } });
api('saveAssessment',{ userId, test:'love', values:{ scores:{'Words of Affirmation':4,'Quality Time':9,'Receiving Gifts':1,'Acts of Service':8,'Physical Touch':8} } });
api('saveAssessment',{ userId, test:'clifton', values:{ top:['Learner','Strategic','Ideation','Relator','Achiever','Input'] } });
st = api('getState',{ userId });
const sum = k => st.assessments.find(a=>a.Test===k).Summary;
assert(st.assessments.filter(a=>a.Test==='clifton').length===1, 'saving a test again updates it in place');
assert(sum('clifton')==='Top 5: Learner, Strategic, Ideation, Relator, Achiever (mostly Strategic Thinking) · 6 ranked', 'Clifton summary: '+sum('clifton'));
assert(sum('mbti')==='INFJ-A (I 62%)', 'MBTI summary: '+sum('mbti'));
assert(sum('holland').startsWith('SAI'), 'Holland code: '+sum('holland'));
assert(sum('love').startsWith('Primary: Quality Time'), 'Love languages: '+sum('love'));
assert(/Genius: Wonder & Invention/.test(sum('genius')), 'Working Genius: '+sum('genius'));
// journal + growth
api('addJournal',{ userId, entry:'Tuesdays feel stolen by email.', prompt:'Where did your time go?' });
api('addJournal',{ userId, entry:'PRIVATE: not for the coach', coachCanRead:false });
api('addGrowth',{ userId, kind:'Skill', title:'Public speaking', detail:'Toastmasters', status:'Acquired' });
r = api('coach',{ userId, sessionId, context:'element:Resources', mode:'open' });
const sys = lastBody.system[1].text;
assert(/Learner, Strategic/.test(sys) && /INFJ-A/.test(sys), 'coach context carries test results');
assert(/Tuesdays feel stolen/.test(sys) && !/PRIVATE/.test(sys), 'coach sees shared journal entries only');
assert(/Public speaking/.test(sys), 'coach sees the growth log');
assert(/immodest, honest inventory/.test(sys), 'Resources focus uses strengths');
st = api('getState',{ userId });
const priv = st.journal.find(j=>/PRIVATE/.test(j.Entry));
api('updateJournal',{ userId, entryId:priv.EntryID, erase:true });
st = api('getState',{ userId });
assert(st.journal.length===1 && !JSON.stringify(sheets.Journal.data).includes('PRIVATE'), 'erasing a journal entry removes its text from the Sheet');
// review
const rv = api('coach',{ userId, sessionId, context:'iterate', mode:'review' });
assert(lastBody.max_tokens===2400, 'review uses the larger budget');
assert(rv.review && rv.review.Traced==='1' && rv.review.Total==='3', 'review stored with trace score 1/3');
st = api('getState',{ userId });
const recs = st.recs;
assert(recs.length===4, 'cards capped by depth gradient (Why ≤1): '+recs.length);
assert(recs.find(x=>x.Kind==='community').SearchQuery==='writers group near me', 'community card keeps its search phrase');
// accept revise -> note in element context
const howCard = recs.find(x=>x.Layer==='How');
const res = api('respondRec',{ userId, sessionId, recId:howCard.RecID, status:'Accepted', actionText:'Put email in a 30-minute window' });
assert(res.next && res.next.open==='element:Strategy', 'accepting a How card opens Strategy');
const notes = api('getMessages',{ userId, context:'element:Strategy' });
assert(/accepted guidance to work into Strategy: "Put email in a 30-minute window"/.test(notes[notes.length-1].Content), 'accepted guidance is noted in Strategy');
api('coach',{ userId, sessionId, context:'element:Strategy', mode:'open' });
assert(/accepted from a congruence review.*30-minute window.*adapted in their own words/.test(lastBody.system[1].text), 'accepted guidance becomes a new input in the Strategy coaching context');
// accept learn -> growth planned
api('respondRec',{ userId, sessionId, recId:recs.find(x=>x.ActionType==='learn').RecID, status:'Accepted' });
st = api('getState',{ userId });
assert(st.growth.some(g=>g.Title==='Group facilitation' && g.Status==='Planned' && g.Kind==='Skill'), 'accepting a learning card adds a planned skill');
// decline with reason
api('respondRec',{ userId, sessionId, recId:recs.find(x=>x.Kind==='community').RecID, status:'Declined', note:'Already in one' });
r = api('coach',{ userId, sessionId, context:'iterate', mode:'open' });
assert(/Already in one/.test(lastBody.system[1].text) && /30-minute window/.test(lastBody.system[1].text), 'accepted and declined guidance both feed the next conversation');
assert(/objective evaluator of congruence/.test(lastBody.system[1].text), 'iterate focus sets the evaluator role');
// nudges
const NOW = Date.now() + 20*86400000;
let ng = ctx.LID.computeNudges(api('getState',{ userId }), NOW);
assert(ng.some(n=>n.type==='recommendations') && ng.some(n=>n.type==='review'), 'nudges: guidance waiting + review due after 14 days');
api('savePrefs',{ userId, prefs:{ types:{ review:false } } });
ng = ctx.LID.computeNudges(api('getState',{ userId }), NOW);
assert(!ng.some(n=>n.type==='review') && ng.length>0, 'a nudge type can be turned off');
api('savePrefs',{ userId, prefs:{ nudges:false } });
assert(ctx.LID.computeNudges(api('getState',{ userId }), NOW).length===0, 'all nudges can be turned off');
api('savePrefs',{ userId, prefs:{ nudges:true } });
// weekly email
let mails=[]; ctx.MailApp={ sendEmail:o=>mails.push(o) }; ctx.ScriptApp={ getService:()=>({ getUrl:()=>'https://script.google.com/x' }) };
api('updateUser',{ userId, patch:{ Email:'nate@example.com' } });
ctx.sendWeeklyNudges();
assert(mails.length===1 && /What would make you proud at 80/.test(mails[0].htmlBody), 'weekly email sent with the open Why question');
ctx.sendWeeklyNudges();
assert(mails.length===1, 'no second email within the same week');
api('savePrefs',{ userId, prefs:{ email:false, lastEmailAt:'' } }); ctx.sendWeeklyNudges();
assert(mails.length===1, 'email nudges can be turned off');
console.log('\nSheet rows:', Object.keys(sheets).map(t=>t+'='+(sheets[t].getLastRow()-1)).join(' '));
console.log('Claude calls:', calls);
