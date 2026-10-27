// 只读复现：保存进行中又打字 → 保存完成把状态从 dirty 改回 saved → 下一次 flush 直接跳过 → 正文没落盘
const fs=require('fs'),vm=require('vm');
const g={console,setTimeout,clearTimeout,Promise,document:{getElementById:()=>null},localStorage:{getItem:()=>null,setItem(){}}};
g.self=g;g.QZStore=require('../core/store.js');g.QZUI={toast(){}};g.QZStorage=function(){};
vm.createContext(g);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../ui/app.js'),'utf8'),g);
const disk={};let saves=0;
const app=new g.QZApp({});
app.storage={save:(id,d)=>{saves++;const snap=JSON.stringify(d);return new Promise(r=>setTimeout(()=>{disk[id]=JSON.parse(snap);r('server')},300));}}; // 服务端保存耗时 300ms
const P=new g.QZStore({},'workspace');app.project=P;P.onChange(()=>app.scheduleSave());
const c=P.addChapter('','');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  P.updateChapter(c.id,{title:'第一章 风起'});      // t=0 打标题
  await sleep(750);                                    // t=700 防抖到期 → flush 开始（saving，耗时 300ms）
  P.updateChapter(c.id,{text:'林远推开了门。'});       // t=750 保存中打正文 → dirty，700ms 后再 flush
  await sleep(2000);
  const d=disk.workspace.chapters[0];
  console.log('保存请求次数:',saves,' 内存正文:',JSON.stringify(P.chapter(c.id).text),' saveState:',app.saveState);
  require('assert').equal(d.text,'林远推开了门。','保存途中打的字不能丢');
  // 存储层：409 冲突、403 重新握手、浏览器副本更新时取新的、空间满要报
  const Storage=require('../core/storage.js'),assert=require('assert');
  const mem={},ls={getItem:k=>k in mem?mem[k]:null,setItem:(k,v)=>{if(String(v).includes('FULL'))throw new Error('quota');mem[k]=String(v)},removeItem:k=>{delete mem[k]},key:i=>Object.keys(mem)[i],get length(){return Object.keys(mem).length}};
  let sd={_rev:3,meta:{updated_at:'2026-01-01'},project_id:'b',nodes:[],relations:[]},token='t1',pings=0;
  global.fetch=async(url,o={})=>{const R=(st,j)=>({ok:st<300,status:st,json:async()=>j});
    if(url.endsWith('/ping')){pings++;return R(200,{token});}
    if(url.includes('/project?'))return R(200,JSON.parse(JSON.stringify(sd)));
    if(url.endsWith('/save')){if(o.headers['X-Qianzhang-Token']!==token)return R(403,{error:'写入授权失败'});const b=JSON.parse(o.body);if(b.baseRev!=null&&b.baseRev!==sd._rev)return R(409,{});sd=Object.assign(b.content,{_rev:sd._rev+1});return R(200,{ok:true,rev:sd._rev});}};
  const st=new Storage({localStorage:ls});await st.connect();await st.load('b');
  assert.equal(await st.save('b',{project_id:'b',meta:{updated_at:'2026-01-02'},nodes:[],relations:[]}),'server');
  token='t2'; assert.equal(await st.save('b',{project_id:'b',meta:{updated_at:'2026-01-03'},nodes:[],relations:[]}),'server','服务重启换口令后自动重新握手');
  sd._rev+=5; // 另一个窗口存过
  await st.save('b',{project_id:'b',meta:{},nodes:[],relations:[]}).then(()=>assert.fail('应当冲突'),e=>assert.ok(e.conflict,'两个窗口互相覆盖要报 409'));
  mem['qianzhang:v3:project:b']=JSON.stringify({project_id:'b',meta:{updated_at:'2099-01-01',title:'新'},nodes:[],relations:[]});
  const got=await st.load('b');assert.equal(got.meta.title,'新','浏览器副本更新就用它');assert.equal(st.takeNewerLocal('b'),true);
  let warned=0;st.onQuota=()=>warned++;st._localSet('b',{x:'FULL'});assert.equal(warned,1,'空间满要提醒');
  console.log('保存安全：保存途中打字不丢、403 重新握手、409 不覆盖、取较新副本、空间满提醒通过');
})();
