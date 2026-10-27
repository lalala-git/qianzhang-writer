'use strict';
/* 全部使用内存存储和假 fetch：不读写作品目录，不连接外部模型。 */
const assert = require('node:assert/strict');
const Storage = require('../core/storage.js');
const KEY = 'qianzhang:v3:project:', TRASH = 'qianzhang:v3:trash:';
const book = { project_id:'book', meta:{ title:'恢复测试' }, nodes:[], relations:[], chapters:[{ text:'唯一的稿件' }] };
const reply = (status, body) => ({ ok:status < 300, status, json:async () => body });
function memory(initial, failWrites) {
  const values = Object.assign({}, initial);
  return {
    values,
    getItem:k => Object.hasOwn(values, k) ? values[k] : null,
    setItem(k, v) { if (failWrites && failWrites(k)) throw new Error('quota'); values[k] = String(v); },
    removeItem:k => { delete values[k]; },
    key:i => Object.keys(values)[i],
    get length() { return Object.keys(values).length; },
  };
}
async function run() {
  const originalFetch = global.fetch;
  try {
    const requests = [];
    global.fetch = async (url, options) => { requests.push({ url, options, body:JSON.parse(options.body) }); return reply(200, { rev:1 }); };
    const storage = new Storage({ localStorage:memory() }); storage.server = true; storage.token = 'test-token';
    assert.equal(await storage.save('book', book), 'server');
    assert.equal(requests[0].options.keepalive, false, '普通保存仍按队列发送，不启用保活');
    assert.equal(requests[0].body.unload, false);
    storage._queue.book = new Promise(() => {});
    const immediate = storage.save('book', book, { unload:true });
    assert.equal(requests.length, 2, '关页补存立即发送，不等待已有保存队列');
    assert.equal(await immediate, 'server');
    assert.equal(requests[1].options.keepalive, true);
    assert.equal(requests[1].body.unload, true);
    const large = Object.assign({}, book, { chapters:[{ text:'汉'.repeat(21000) }] });
    await storage.save('book', large, { unload:true });
    const big = requests[2];
    assert.ok(big.options.body.length < 60000, '中文边界样本字符数低于旧阈值');
    assert.ok(new TextEncoder().encode(big.options.body).byteLength > 60000, '完整请求字节数超过保活阈值');
    assert.equal(big.options.keepalive, false, '大稿继续普通发送，不误用保活请求');
    assert.equal(big.body.unload, true, '关页补存语义不因大小限制丢失');

    const retry = [];
    global.fetch = async (url, options = {}) => {
      if (url.endsWith('/ping')) return reply(200, { token:'renewed-token' });
      retry.push({ options, body:JSON.parse(options.body) });
      return reply(retry.length === 1 ? 403 : 200, { rev:2 });
    };
    const reconnect = new Storage({ localStorage:memory() }); reconnect.server = true; reconnect.token = 'old-token';
    assert.equal(await reconnect.save('book', book, { unload:true }), 'server');
    assert.equal(retry.length, 2);
    assert.equal(retry[1].options.headers['X-Qianzhang-Token'], 'renewed-token');
    for (const request of retry) {
      assert.equal(request.options.keepalive, true, '重新握手前后都保留保活选项');
      assert.equal(request.body.unload, true, '重新握手前后都保留关页标记');
    }

    const trashKey = TRASH + 'book.1', saved = JSON.stringify(book);
    const full = memory({ [trashKey]:saved }, k => k.startsWith(KEY));
    const offline = new Storage({ localStorage:full }); let quotaWarnings = 0;
    offline.onQuota = () => { quotaWarnings++; };
    await assert.rejects(offline.restore({ local:true, file:trashKey, id:'book' }), /存储已满/);
    assert.equal(quotaWarnings, 1);
    assert.equal(full.getItem(trashKey), saved, '配额满时保留回收站原件');
    assert.equal(full.getItem(KEY + 'book'), null);
    const normal = memory({ [trashKey]:saved });
    const recovered = new Storage({ localStorage:normal });
    assert.equal(await recovered.restore({ local:true, file:trashKey, id:'book' }), 'book');
    assert.deepEqual(JSON.parse(normal.getItem(KEY + 'book')), book);
    assert.equal(normal.getItem(trashKey), null, '保存成功后才移除回收站原件');

    const failedLocal = memory({ [trashKey]:saved });
    const failedServer = new Storage({ localStorage:failedLocal }); failedServer.server = true; failedServer.token = 'test-token';
    global.fetch = async () => reply(500, { error:'fixture service failure' });
    await assert.rejects(failedServer.restore({ local:true, file:trashKey, id:'book' }), /fixture service failure/);
    assert.equal(failedLocal.getItem(trashKey), saved, '服务失败时回收站原件仍可再次恢复');
    const pendingLocal = memory({ [trashKey]:saved });
    const pendingServer = new Storage({ localStorage:pendingLocal }); pendingServer.server = true;
    let accept;
    global.fetch = () => new Promise(resolve => { accept = resolve; });
    const pendingRestore = pendingServer.restore({ local:true, file:trashKey, id:'book' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pendingLocal.getItem(trashKey), saved, '服务尚未确认时不能提前移除回收站原件');
    accept(reply(200, { rev:1 }));
    assert.equal(await pendingRestore, 'book');
    assert.equal(pendingLocal.getItem(trashKey), null);
    console.log('存储恢复：关页补存、UTF-8 请求大小、403 重试、配额失败与服务失败保留回收站通过');
  } finally { global.fetch = originalFetch; }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
