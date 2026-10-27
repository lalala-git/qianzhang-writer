'use strict';
/* 角色聊天：提示词内容、SSE 解析、流式/非流式、错误提示。全部用假 fetch，不连外网。 */
const assert = require('node:assert/strict');
const Project = require('../core/store.js');
const AI = require('../core/ai.js');

const p = new Project({ meta:{ title:'雾海' } });
const a = p.addEntity({ name:'林舟', type:'PERSON', summary:'守灯少年', detail:'怕水' });
const b = p.addEntity({ name:'沈灯', type:'PERSON', summary:'师父' });
p.addEntity({ name:'灯火不灭', type:'RULE', summary:'灯灭则船沉' });
p.addRelation(a.id, b.id, '师从');
const ch = p.addChapter('第一章'); p.updateChapter(ch.id, { text:'夜里雾很大，林舟守着灯。' });
const sys = AI.characterPrompt(p, a.id);
for (const s of ['雾海', '林舟', '守灯少年', '怕水', '沈灯', '师从', '灯火不灭', '夜里雾很大']) assert.ok(sys.includes(s), '提示词包含 ' + s);
p.addMessage(a.id, 'user', '你怕吗？');
const msgs = AI.buildMessages(p, a.id, p.chat(a.id).messages);
assert.equal(msgs[0].role, 'system'); assert.deepEqual(msgs[msgs.length - 1], { role:'user', content:'你怕吗？' });

assert.equal(AI.endpoint('https://api.deepseek.com/'), 'https://api.deepseek.com/chat/completions');
assert.equal(AI.endpoint('http://x/v1/chat/completions'), 'http://x/v1/chat/completions');
assert.equal(AI.ready({ baseUrl:'https://a', model:'m' }), false);
assert.equal(AI.ready({ baseUrl:'http://127.0.0.1:11434/v1', model:'m' }), true, '本机模型不需要密钥');

const sse = AI.parseSSE('data: {"choices":[{"delta":{"content":"怕"}}]}\n\ndata: {"choices":[{"delta":{"content":"。"}}]}\ndata: {"cho');
assert.deepEqual(sse.deltas, ['怕', '。']); assert.equal(sse.rest, 'data: {"cho'); assert.equal(sse.done, false);
assert.equal(AI.parseSSE('data: [DONE]\n').done, true);

const settings = { baseUrl:'https://api.example.com/v1', model:'m', apiKey:'sk-test' };
function streamFetch(chunks) {
  return (url, init) => {
    assert.equal(url, 'https://api.example.com/v1/chat/completions');
    assert.equal(init.headers.Authorization, 'Bearer sk-test');
    assert.equal(JSON.parse(init.body).stream, true);
    let i = 0; const enc = new TextEncoder();
    return Promise.resolve({ ok:true, headers:{ get:() => 'text/event-stream' },
      body:{ getReader:() => ({ read:() => Promise.resolve(i < chunks.length ? { done:false, value:enc.encode(chunks[i++]) } : { done:true }) }) } });
  };
}
(async () => {
  const seen = [];
  const full = await AI.complete(settings, msgs, { fetch:streamFetch(['data: {"choices":[{"delta":{"content":"有"}}]}\n\ndata: {"choi', 'ces":[{"delta":{"content":"一点"}}]}\n\ndata: [DONE]\n\n']), onDelta:(d, f) => seen.push(f) });
  assert.equal(full, '有一点'); assert.deepEqual(seen, ['有', '有一点'], '跨块拆开的 SSE 也能拼好');
  const plain = await AI.complete(settings, msgs, { fetch:() => Promise.resolve({ ok:true, headers:{ get:() => 'application/json' }, text:() => Promise.resolve('{"choices":[{"message":{"content":"好"}}]}') }) });
  assert.equal(plain, '好');
  await assert.rejects(AI.complete(settings, msgs, { fetch:() => Promise.resolve({ ok:false, status:401, text:() => Promise.resolve('bad') }) }), /密钥/);
  await assert.rejects(AI.complete(settings, msgs, { fetch:() => Promise.reject(new TypeError('Failed to fetch')) }), /无法连接/);
  await assert.rejects(AI.complete({ baseUrl:'', model:'' }, msgs, { fetch:() => assert.fail('不应发请求') }), /设置/);
  console.log('角色聊天：提示词、SSE 流式解析、非流式回复与错误提示通过');
})().catch(e => { console.error(e); process.exitCode = 1; });
