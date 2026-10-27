// 只读加载 /workspace/cg 的 QZCraft/QZStore，跑 canon-queue-cases.json。用法：node run-canon-cases.js
const S=require('../core/store.js'),C=require('../core/craft.js');
const {cases}=require('./canon-cases.json');let pass=0,fail=0;const byBug={};
for(const t of cases){
  const P=new S({},'regress');const ents={};t.canon.forEach(n=>ents[n]=P.addEntity({name:n,type:'PERSON'}));
  if(t.deadAt){for(let i=1;i<=t.deadAt;i++){const c=P.addChapter('前置'+i,'……');if(i===t.deadAt)Object.values(ents).forEach(e=>P.addProgress(e.id,{chapterId:c.id,text:'死亡',dead:true}));}}
  const ch=P.addChapter('被测',t.text),e=t.expect;let ok,got;
  if(t.scan){const r=C.scan(t.text,P.data.nodes,[],{});got=r.suspects.map(s=>s.word);ok=got.includes(e.suspect)||got.some(w=>w.replace(/[\s　]/g,'')!==w&&w.includes(e.suspect.replace(/[\s　]/g,'').slice(-1)));ok=got.includes(e.suspect);}
  else{const q=C.canonQueue(P,ch.id);got=q.map(x=>x.kind+(x.sub?'/'+x.sub:'')+(x.conf?'/'+x.conf:'')+':'+(x.name||''));
    if(e.noflag)ok=!q.some(x=>x.name===e.noflag);
    else ok=q.some(x=>x.name===e.flag&&(!e.kind||x.kind===e.kind)&&(!e.sub||x.sub===e.sub)&&(!e.conf||x.conf===e.conf));}
  ok?pass++:fail++;(byBug[t.bug]=byBug[t.bug]||[0,0])[ok?0:1]++;
  if(!ok)console.log('FAIL',t.id,JSON.stringify(t.text),'→',JSON.stringify(got));
}
if(fail){console.log('入正典回归失败 '+fail+'/'+cases.length);process.exitCode=1;}else console.log('入正典回归用例 '+pass+' 条通过');
