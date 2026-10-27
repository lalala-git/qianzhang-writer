/*! 千章 · core/craft.js · 网文作者工具：码字目标与连更、伏笔、本章体检
 * 纯函数，不碰 DOM；浏览器里挂在 QZCraft，node 里 require。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QZCraft = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  /** 本地日期键 YYYY-MM-DD（按作者所在时区）。 */
  function dayKey(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(key, n) { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); }

  /* ---------- 码字目标与连更 ---------- */
  /** 连更天数：今天达标则从今天往回数，否则从昨天往回数（今天还有机会）。 */
  function streak(daily, goal, today) {
    daily = daily || {}; goal = Math.max(1, goal || 1); today = today || dayKey();
    const hit = k => (daily[k] || 0) >= goal;
    let cur = 0, k = hit(today) ? today : addDays(today, -1);
    while (hit(k)) { cur++; k = addDays(k, -1); }
    let best = 0, run = 0;
    Object.keys(daily).sort().forEach((key, i, arr) => {
      if (!hit(key)) { run = 0; return; }
      run = i > 0 && arr[i - 1] === addDays(key, -1) && hit(arr[i - 1]) ? run + 1 : 1;
      best = Math.max(best, run);
    });
    return { current:cur, best:Math.max(best, cur), today:Math.max(0, daily[today] || 0), goal, done:hit(today) };
  }
  /** 热力图：返回按周排列的格子（最后一列是本周），level 0–4。 */
  function heatmap(daily, goal, weeks, today) {
    today = today || dayKey(); weeks = weeks || 16; goal = Math.max(1, goal || 1);
    const [y, m, d] = today.split('-').map(Number), dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // 周一为 0
    const start = addDays(today, -dow - (weeks - 1) * 7), cols = [];
    for (let w = 0; w < weeks; w++) {
      const col = [];
      for (let i = 0; i < 7; i++) {
        const key = addDays(start, w * 7 + i), v = Math.max(0, (daily || {})[key] || 0);
        col.push({ key, words:v, future:key > today, level:v <= 0 ? 0 : v < goal * 0.5 ? 1 : v < goal ? 2 : v < goal * 2 ? 3 : 4 });
      }
      cols.push(col);
    }
    return cols;
  }

  /* ---------- 存稿 ---------- */
  /** 存稿：最后一章已发布之后、已经写了字的章节。days = 按每天更新章数还能撑几天。 */
  function stock(project, today, minWords) {
    today = today || dayKey(); minWords = minWords == null ? 500 : minWords;
    const list = project.chapters(), perDay = project.data.writing.perDay || 1;
    let last = -1; list.forEach((c, i) => { if (c.status === 'published') last = i; });
    const pending = list.slice(last + 1).filter(c => c.status !== 'published');
    const ready = pending.filter(c => countWords(c.text) >= minWords);
    const scheduled = pending.filter(c => c.publishAt).sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    const overdue = scheduled.filter(c => c.publishAt < today);
    const days = Math.floor(ready.length / perDay);
    const unpub = list.filter(c => c.status !== 'published').length;
    return { published:list.filter(c => c.status === 'published').length, stock:ready.length, unpub, notCounted:unpub - ready.length, minWords, days, perDay,
      level:days >= 7 ? 'ok' : days >= 3 ? 'warn' : 'danger', next:scheduled.find(c => c.publishAt >= today) || null, overdue };
  }
  function countWords(text) { // 与 QZStore.countWords 相同（浏览器里直接复用它的缓存）
    if (typeof self !== 'undefined' && self.QZStore) return self.QZStore.countWords(text);
    const s = String(text || ''); return (s.match(/[A-Za-z0-9_'-]+/g) || []).length + s.replace(/[A-Za-z0-9_'-]+/g, '').replace(/[\s\p{P}\p{S}]/gu, '').length;
  }


  /* ---------- 小黑屋 ---------- */
  /** 专注会话状态：剩余秒数、本次字数、是否达成、是否还锁着。 */
  function focusState(f, nowMs, words) {
    const left = Math.max(0, Math.round((f.start + f.minutes * 60000 - nowMs) / 1000)), wrote = Math.max(0, words - f.startWords);
    const goalDone = !f.goal || wrote >= f.goal, timeDone = !f.minutes || left === 0;
    const done = f.goal ? goalDone : timeDone;
    return { left, wrote, goalDone, timeDone, done, locked:!!f.lock && !done };
  }
  const mmss = s => pad(Math.floor(s / 60)) + ':' + pad(s % 60);

  /* ---------- 伏笔 ---------- */
  /** 状态：resolved 已回收 / overdue 已超过计划章 / soon 三章内到期 / open 未回收。 */
  function foreshadowStatus(f, chapterCount) {
    if (f.resolvedIn) return 'resolved';
    const due = parseInt(f.dueChapter, 10);
    if (!due) return 'open';
    if (chapterCount > due) return 'overdue';
    if (chapterCount >= due - 3) return 'soon';
    return 'open';
  }
  const STATUS_LABEL = { resolved:'已回收', overdue:'已逾期', soon:'快到期', open:'待回收' };

  /* ---------- 本章体检 ---------- */
  const CRUTCH = ['仿佛', '似乎', '瞬间', '竟然', '不由得', '忍不住', '缓缓', '淡淡', '微微', '嘴角上扬', '深吸一口气', '倒吸一口凉气', '眼中闪过', '一丝', '心中一动', '不禁', '顿时', '下意识'];
  // 内置的只是起步清单（平台常见的高风险类别），作者可在「设置」里补充自己书所在平台的词。
  const SENSITIVE = ['毒品', '吸毒', '贩毒', '赌博', '赌场', '自杀', '自残', '色情', '裸体', '强奸', '恐怖袭击', '炸弹制作', '邪教', '枪支买卖', '血腥', '肢解', '传销', '洗钱', '翻墙', '代孕'];
  // 常见错别字：错写 → 正写（只收不会误伤的固定搭配）
  const TYPOS = { '既使':'即使', '在接再厉':'再接再厉', '再接再励':'再接再厉', '迫不急待':'迫不及待', '一愁莫展':'一筹莫展', '莫明其妙':'莫名其妙', '按步就班':'按部就班',
    '走头无路':'走投无路', '甘败下风':'甘拜下风', '默守成规':'墨守成规', '谈笑风声':'谈笑风生', '不径而走':'不胫而走', '一如继往':'一如既往', '声名雀起':'声名鹊起',
    '变本加利':'变本加厉', '气慨':'气概', '布署':'部署', '震憾':'震撼', '松驰':'松弛', '针贬':'针砭', '寒喧':'寒暄', '脉膊':'脉搏', '烦燥':'烦躁', '幅射':'辐射',
    '防碍':'妨碍', '宣泻':'宣泄', '坐阵':'坐镇', '蜇伏':'蛰伏', '频临':'濒临', '修茸':'修葺', '暴躁如雷':'暴跳如雷', '世外桃园':'世外桃源', '金榜提名':'金榜题名',
    '穿流不息':'川流不息', '出类拔粹':'出类拔萃', '一股作气':'一鼓作气', '自抱自弃':'自暴自弃', '义不容词':'义不容辞', '原形必露':'原形毕露', '张慌失措':'张皇失措',
    '惹事生非':'惹是生非', '仗义直言':'仗义执言', '谈何容意':'谈何容易', '默默无文':'默默无闻', '貌和神离':'貌合神离', '病入膏盲':'病入膏肓', '鬼鬼崇崇':'鬼鬼祟祟',
    '迷团':'谜团', '凑和':'凑合', '一诺千斤':'一诺千金' };
  const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛范彭郎鲁韦马苗方俞任袁柳鲍史唐费薛雷贺倪汤罗毕郝安常乐于傅齐康伍余顾孟黄萧尹姚邵汪毛狄米贝明戴宋庞熊纪舒屈项祝董梁杜阮蓝闵季贾江童颜郭梅盛林钟徐邱骆高夏蔡田胡凌霍虞万柯卢莫房解应丁宣邓单杭洪包左石崔吉龚程邢裴陆荣翁荀羊甄曲封储靳段焦巴牧山谷车侯宓全班仰秋仲伊宫宁仇栾甘厉戎祖武符刘景詹龙叶幸司黎薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴胥苍双闻莘党翟谭贡劳姬申扶冉宰郦雍桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公';
  const SUS_PREP = new Set('给对到在得把被向和跟与叫让替为从朝往比将问使教令'.split(''));
  const REP_STOP = new Set('因为 所以 以为 什么 自己 时候 已经 虽然 但是 可是 然而 于是 只是 还是 就是 不是 没有 这样 那样 怎么 这么 那么 知道 觉得 起来 出来 下去 过来 回来 一个 这个 那个 一样 一声 一点 一会 一下 一边 一面 现在 后来 以后 以前 之后 先前 似乎 仿佛 大约 或者 而且 并且 如果 不过 便是 也是 却是 只有 所谓 许多 什么 东西 地方 事情 样子 心里 眼睛 一回 两个 几个 非常 十分 终于 忽然 突然 依然 仍然 已是 便又 竟然 实在 其实 大家 别人 人们 他们 我们 你们 她们 今天 明天 昨天 晚上 早上'.split(' '));
  const STOP = new Set('的了是在我他她你着这那一不就也都和而有个们来去说道又把被让给到上下中人没要会看好地得还很'.split(''));
  const CJK = /[\u4e00-\u9fff]/;
  const NAME_CUE_AFTER = /^[说道问笑喊叫叹点摇看想走站坐皱冷的：:，,。]/;

  function findAll(text, word) {
    const out = []; if (!word) return out;
    for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + word.length)) out.push(i);
    return out;
  }
  function namesOf(n) {
    return [n.name].concat(String(n.aliases || '').split(/[,，、\s]+/)).map(s => String(s || '').trim()).filter(s => s.length >= 2);
  }

  /**
   * 扫描一段正文。entities: [{id,name,aliases,summary,type}]，extraSensitive: 额外敏感词数组。
   * 返回 { mentions, suspects, sensitive, crutch, repeats }，每项带 index 便于在编辑器里定位。
   */
  function scan(text, entities, extraSensitive, opts) {
    opts = opts || {};
    text = String(text || ''); entities = entities || [];
    const known = new Map(); entities.forEach(e => namesOf(e).forEach(n => known.set(n, e)));
    const covered = new Uint8Array(text.length);
    const mentions = [];
    entities.forEach(e => {
      let count = 0, first = -1;
      namesOf(e).forEach(n => findAll(text, n).forEach(i => { count++; if (first < 0 || i < first) first = i; covered.fill(1, i, i + n.length); }));
      if (count) mentions.push({ entity:e, count, index:first });
    });
    mentions.sort((a, b) => b.count - a.count);

    // 疑似错名：与已知名字只差一个字，且该处不属于任何已知名字。
    const suspects = new Map();
    known.forEach((e, name) => {
      const L = name.length;
      for (let i = 0; i + L <= text.length; i++) {
        if (covered[i] || covered[i + L - 1]) continue;
        const w = text.substr(i, L); if (w === name || known.has(w) || !CJK.test(w)) continue;
        let diff = -1, n = 0;
        for (let k = 0; k < L && n < 2; k++) if (w[k] !== name[k]) { diff = k; n++; }
        if (n !== 1 || !CJK.test(w[diff])) continue;
        if (diff === 0 && SUS_PREP.has(w[0])) continue;
        if (diff === 0 && L >= 3 && SURNAMES.includes(w[0])) continue;
        if ((diff === 0 && /[一二三四五六七八九十大小老]/.test(w[0])) || (diff === L - 1 && name[L - 1] === name[L - 2])) continue; // 二夫人/王夫人；刘姥姥被截成「刘姥」+动词 // 钱太爷/赵太爷：换了个姓，是另一个人 // 「给老栓」「对老栓」：省了姓的三字名前挨着介词
        if (L === 2 && (name[0] === '阿' || /[嫂爷婶叔伯姐哥妈公婆]/.test(name[1]))) continue; // 阿Q/阿桂、七嫂/七斤：本来就是一类称呼，不算错
        if (/[月日年号岁斤两]/.test(w[diff]) && /[一二三四五六七八九十〇零]/.test(w[0])) continue;
        if (STOP.has(w[diff]) || (L === 2 && text.length >= 1500)) continue; // 两字名（如「星河」「子君」）差一个字几乎全是普通词，不再猜；虚词换字也不算
        if (L === 2) { // 两字名太容易误报：只认「名字 + 说/道/的…」这类出现位置，且只换了第二个字
          if (diff !== 1 || !NAME_CUE_AFTER.test(text.charAt(i + 2))) continue;
        }
        const s = suspects.get(w) || { word:w, like:name, entity:e, count:0, index:i };
        s.count++; suspects.set(w, s);
      }
    });
    // 只留真像笔误的：正名出现得远比它多（≥5 倍且至少 4 次），它自己只出现一两次；常出现的多半是另一个人或普通词
    suspects.forEach((s, w) => { if (s.spaced) return; const main = (known.get(s.like) && findAll(text, s.like).length) || 0; if (s.count > 2 || (text.length >= 1500 && (main < 4 || main < s.count * 5))) suspects.delete(w); }); /* 短片段（刚写的几段）样本太少，不按倍数筛 */
    // 名字中间夹了空格（半角/全角）：「林 远」多半是笔误
    known.forEach((e, name) => { const ch = Array.from(name); if (ch.length < 2 || ch.length > 4) return;
      const re = new RegExp(ch.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[ \u3000\t]*').replace(/\*/g, '*'), 'g'); let m;
      while ((m = re.exec(text))) { const w = m[0]; if (w === name || !/[ \u3000\t]/.test(w)) continue; const s = suspects.get(w) || { word:w, like:name, entity:e, count:0, index:m.index, spaced:true }; s.count++; suspects.set(w, s); } });

    const listHits = words => words.map(w => ({ word:w, positions:findAll(text, w) })).filter(x => x.positions.length)
      .map(x => ({ word:x.word, count:x.positions.length, index:x.positions[0] })).sort((a, b) => b.count - a.count);
    const sensitive = listHits(Array.from(new Set(SENSITIVE.concat(extraSensitive || []).map(s => String(s).trim()).filter(Boolean))));
    const typos = listHits(Object.keys(TYPOS)).map(x => Object.assign(x, { fix:TYPOS[x.word] }));
    const crutch = listHits(CRUTCH).filter(x => x.count >= 3 && x.count / Math.max(1, text.length) * 1000 >= 1.5); // 按每千字密度算，长章里出现三次不算多

    // 高频重复：两字词，排除虚词与人名，出现次数明显偏多
    const counts = new Map();
    for (let i = 0; i + 2 <= text.length; i++) {
      const a = text[i], b = text[i + 1];
      if (!CJK.test(a) || !CJK.test(b) || STOP.has(a) || STOP.has(b) || covered[i] || covered[i + 1]) continue;
      const w = a + b; counts.set(w, (counts.get(w) || 0) + 1);
    }
    const threshold = Math.max(6, Math.round(text.length / 200));
    // 是更长词的一截（「爱罗先珂」被切成 爱罗/罗先/先珂）就不单报
    const partOf = (w, c) => { for (const [v, n] of counts) if (n >= c * 0.7 && v !== w && (v[0] === w[1] || v[1] === w[0])) { const tri = v[0] === w[1] ? w + v[1] : v[0] + w; if (findAll(text, tri).length >= c * 0.7) return true; } return false; };
    const repeats = Array.from(counts.entries()).filter(([w, c]) => c >= threshold && !known.has(w) && !REP_STOP.has(w) && !partOf(w, c))
      .sort((x, y) => y[1] - x[1]).slice(0, 8).map(([word, count]) => ({ word, count, index:text.indexOf(word) }));

    // 已故角色又开口：名字后紧跟说/道/问/笑等
    const ghosts = [];
    (opts.dead || []).forEach(id => { const e = entities.find(x => x.id === id); if (!e) return;
      let hit = null, count = 0;
      namesOf(e).forEach(n => findAll(text, n).forEach(i => { if (/^[说道问笑喊叫答]/.test(text.charAt(i + n.length))) { count++; if (!hit || i < hit) hit = i; } }));
      if (count) ghosts.push({ word:e.name, entity:e, count, index:hit });
    });
    return { typos, ghosts, mentions, suspects:Array.from(suspects.values()).sort((a, b) => b.count - a.count).slice(0, 12), sensitive, crutch, repeats };
  }

  /* ---------- 节奏、出场、黄金三章 ---------- */
  const HYPE = ['震惊', '震撼', '突破', '晋级', '打脸', '跪下', '跪地', '暴怒', '怒喝', '轰', '炸', '杀', '斩', '血', '秒杀', '逆袭', '碾压', '惊呆', '倒吸一口凉气', '不可能', '怎么可能', '竟然', '居然', '爆发', '觉醒', '宝物', '传承', '升级', '吐血', '跪'];
  const HOOK = ['竟然', '突然', '没想到', '究竟', '到底', '下一刻', '就在这时', '然而', '却见', '……', '？', '！', '?', '!'];
  const countOf = (text, w) => { let n = 0, i = text.indexOf(w); while (i >= 0) { n++; i = text.indexOf(w, i + w.length); } return n; };
  function dialogueRatio(text) { const m = String(text).match(/[“「『][^”」』]*[”」』]/g) || []; const d = m.reduce((s, x) => s + x.length, 0); return text.length ? d / text.replace(/\s/g, '').length : 0; }
  const insightCache = { key:null, val:null };
  /**
   * 全书体检：每章字数、对话占比、爆点密度、章末钩子；人物出场分布；黄金三章自查。
   * 结果按章节内容缓存，正文不变就不重算。
   */
  function insight(project) {
    const all = project.chapters(), people = project.data.nodes.filter(n => n.type === 'PERSON');
    const key = all.map(c => c.id + ':' + c.text.length + ':' + (c.updated_at || '')).join('|') + '#' + people.map(n => n.id + n.name + (n.aliases || '')).join('|');
    if (insightCache.key === key) return insightCache.val;
    const chapters = all.map((c, i) => { const t = c.text, w = countWords(t), hype = HYPE.reduce((s, x) => s + countOf(t, x), 0), tail = t.trim().slice(-80);
      return { id:c.id, no:i + 1, title:c.title, words:w, dialogue:dialogueRatio(t), hype, hypeDensity:w ? hype * 1000 / w : 0, hook:HOOK.some(x => tail.includes(x)) }; });
    const cast = people.map(n => { const names = namesOf(n), counts = all.map(c => names.reduce((s, x) => s + countOf(c.text, x), 0)), on = counts.map((x, i) => x ? i + 1 : 0).filter(Boolean);
      return { id:n.id, name:n.name, counts, total:counts.reduce((a, b) => a + b, 0), chapters:on.length, first:on[0] || 0, last:on[on.length - 1] || 0, gap:on.length ? all.length - on[on.length - 1] : all.length }; })
      .sort((a, b) => b.total - a.total);
    const lead = cast[0] && cast[0].total ? cast[0] : null;
    const missing = cast.filter(x => x !== lead && x.chapters >= 2 && x.gap >= Math.max(8, Math.round(all.length / 5)));
    // 连续多章没有爆点
    let run = 0, flat = []; chapters.forEach(c => { if (c.words >= 500 && c.hypeDensity < 0.5) { run++; if (run === 4) flat.push(c.no - 3); } else run = 0; });
    const g = chapters.slice(0, 3), first = all[0] ? all[0].text : '';
    const golden = !all.length ? [] : [
      { ok:!!lead && namesOf(project.entity(lead.id)).some(x => first.slice(0, 600).includes(x)), label:'第一章前 600 字内主角登场', tip:lead ? '读者在前几百字就要知道「这是谁的故事」。目前出场最多的是「' + lead.name + '」。' : '在设定里建好主角，就能检查主角是否尽早登场。' },
      { ok:g.every(c => c.words >= 2000), label:'前三章每章 2000 字以上', tip:'太短的开篇撑不起签约和推荐的字数要求，也立不住冲突。' },
      { ok:g.some(c => c.hype >= 2), label:'前三章出现冲突或爽点', tip:'开篇就要有矛盾：被看不起、危机、奇遇、反转……这里统计的是「打脸、突破、竟然、怒喝」这类词。' },
      { ok:g.filter(c => c.hook).length >= Math.min(2, g.length), label:'章末留钩子', tip:'章末用悬念、反转或问句收尾，让读者想点下一章。' },
      { ok:g.every(c => c.dialogue >= 0.1 && c.dialogue <= 0.7), label:'对话和叙述比例适中', tip:'对话占 10%～70% 比较好读；全是叙述显得闷，全是对话显得散。' },
      { ok:!g.some(c => /很久很久以前|这个世界|大陆分为|纪元/.test(c.id && project.chapter(c.id).text.slice(0, 300))), label:'开头不堆世界观', tip:'开篇第一段就介绍大陆、纪元、势力，很多读者会直接退出。设定可以边打边讲。' }];
    const val = { chapters, cast, lead, missing, flat, golden };
    insightCache.key = key; insightCache.val = val; return val;
  }

  /* ---------- 章节模板 ---------- */
  const TEMPLATES = [
    { id:'hype', name:'爽点章', desc:'压抑 → 反击 → 打脸，最常用的升级节奏', outline:'压：主角被看轻 / 遇到阻碍（谁？怎么羞辱？）\n蓄：主角的底牌或准备\n爆：反击、打脸、突破（围观者的反应）\n收：获得什么（资源、名声、实力）\n钩：新的麻烦或更大的敌人露面' },
    { id:'bridge', name:'过渡章', desc:'整理收获、交代下一段目标，别让读者觉得水', outline:'回顾：上一段的结果（一两句带过）\n整理：收获、伤势、人际变化\n新目标：下一段要去哪、为什么\n小冲突：途中一个小插曲保持张力\n钩：引出下一段的主要矛盾' },
    { id:'suspense', name:'悬念章', desc:'抛出谜团，章末断在关键处', outline:'异常：发生了什么不对劲的事\n调查：主角发现的线索（埋伏笔）\n误导：一个看似合理的解释\n反转：真相的一角\n断章：停在最想知道下一步的地方' },
    { id:'emotion', name:'感情 / 日常章', desc:'人物关系推进，给读者喘口气', outline:'场景：在哪、做什么（有画面感）\n互动：两人之间的小摩擦或默契\n推进：关系变化的一个具体细节\n侧写：通过配角或环境衬托\n余味：留一句让人回味的话' },
    { id:'climax', name:'高潮章', desc:'大战或终局，多线收束', outline:'局势：双方实力、赌注（输了会失去什么）\n第一波：交锋，主角落下风\n转折：底牌 / 伏笔回收 / 援军\n决胜：最关键的一招\n余波：代价与收获，伏笔回收' }];

  /* ---------- 写作统计报表 ---------- */
  /** 最近 days 天的码字报表：每天字数、合计、日均（按写作天数）、最高的一天、达标天数，以及与上一个周期的对比。 */
  function report(daily, goal, days, today) {
    today = today || dayKey(); daily = daily || {}; goal = goal || 2000;
    const list = []; for (let i = days - 1; i >= 0; i--) { const k = addDays(today, -i); list.push({ key:k, words:Math.max(0, daily[k] || 0) }); }
    const sum = list.reduce((s, x) => s + x.words, 0), active = list.filter(x => x.words > 0), best = list.reduce((b, x) => x.words > b.words ? x : b, { key:'', words:0 });
    let prev = 0; for (let i = days; i < days * 2; i++) prev += Math.max(0, daily[addDays(today, -i)] || 0);
    return { days:list, sum, activeDays:active.length, avg:active.length ? Math.round(sum / active.length) : 0, best, hit:list.filter(x => x.words >= goal).length, prev, change:prev ? (sum - prev) / prev : null };
  }

  /* ---------- 人物关系图布局 ---------- */
  /** 简单的力导向布局（确定性：同样的数据每次排出一样的图）。返回 {id:{x,y}}，坐标在 [pad, w-pad] × [pad, h-pad]。 */
  function layoutGraph(ids, edges, w, h, iters) {
    const n = ids.length, pos = {}, pad = 40; if (!n) return pos;
    ids.forEach((id, i) => { const a = i / n * Math.PI * 2; pos[id] = { x:w / 2 + Math.cos(a) * w / 3, y:h / 2 + Math.sin(a) * h / 3 }; });
    const k = Math.sqrt(w * h / n) * 1.1; let t = w / 8;
    for (let it = 0; it < (iters || 220); it++) {
      const d = {}; ids.forEach(id => d[id] = { x:0, y:0 });
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = pos[ids[i]], b = pos[ids[j]]; let dx = a.x - b.x, dy = a.y - b.y, l = Math.hypot(dx, dy) || 0.01; const f = k * k / l;
        dx = dx / l * f; dy = dy / l * f; d[ids[i]].x += dx; d[ids[i]].y += dy; d[ids[j]].x -= dx; d[ids[j]].y -= dy; }
      edges.forEach(e => { const a = pos[e.source], b = pos[e.target]; if (!a || !b || a === b) return; let dx = a.x - b.x, dy = a.y - b.y; const l = Math.hypot(dx, dy) || 0.01, f = l * l / k;
        dx = dx / l * f; dy = dy / l * f; d[e.source].x -= dx; d[e.source].y -= dy; d[e.target].x += dx; d[e.target].y += dy; });
      ids.forEach(id => { const p = pos[id], v = d[id], l = Math.hypot(v.x, v.y) || 1, m = Math.min(l, t);
        p.x += v.x / l * m + (w / 2 - p.x) * 0.004; p.y += v.y / l * m + (h / 2 - p.y) * 0.004; });
      t *= 0.97;
    }
    // 缩放进画布
    const xs = ids.map(i => pos[i].x), ys = ids.map(i => pos[i].y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    // 等比缩放（不拉伸），再居中
    const sx0 = (w - 2 * pad) / Math.max(1, x1 - x0), sy0 = (h - 2 * pad) / Math.max(1, y1 - y0), sx = Math.min(sx0, sy0 * 1.8), sy = Math.min(sy0, sx0 * 1.8), ox = (w - (x1 - x0) * sx) / 2, oy = (h - (y1 - y0) * sy) / 2;
    ids.forEach(id => { const p = pos[id]; p.x = n === 1 ? w / 2 : ox + (p.x - x0) * sx; p.y = n === 1 ? h / 2 : oy + (p.y - y0) * sy; });
    return pos;
  }

  /* ---------- 读者评论整理 ---------- */
  const COMMENT_KINDS = [
    ['fix', '指错', /错别字|错字|写错|笔误|打错|bug|BUG|前后矛盾|矛盾|吃书|不对吧|不是.{1,8}吗|应该是|搞错|穿帮/],
    ['urge', '催更', /催更|加更|更新|快更|求更|断更|多更|爆更|几更|更啊|更吧|更了/],
    ['idea', '建议', /建议|希望|能不能|可不可以|要是|如果能|应该让|别让|不要让|太拖|水了|节奏/],
    ['praise', '夸奖', /好看|精彩|好爽|爽|牛|支持|追了|入坑|喜欢|期待|神作|赞/]];
  /** 把粘贴进来的读者评论按「指错 / 催更 / 建议 / 夸奖 / 其他」分类；指错里引号中的原文会去全书找位置。 */
  function comments(text, project) {
    const lines = String(text || '').split(/\n+/).map(x => x.trim()).filter(x => x.length >= 2);
    const out = { fix:[], urge:[], idea:[], praise:[], other:[] };
    lines.forEach(t => { const k = (COMMENT_KINDS.find(x => x[2].test(t)) || ['other'])[0], item = { text:t };
      if (k === 'fix' && project) { const q = (t.match(/[「“"『]([^」”"』]{2,30})[」”"』]/) || [])[1] || (t.match(/([\u4e00-\u9fa5]{2,10})应该是/) || [])[1];
        if (q) { item.quote = q; item.hits = project.search(q, 20); } }
      out[k].push(item); });
    return out;
  }
  /** 书名、简介自查。 */
  function blurbCheck(title, blurb, leadName) {
    const t = Array.from(String(title || '').trim()), b = String(blurb || '').trim(), n = Array.from(b.replace(/\s/g, '')).length;
    return [
      { ok:t.length >= 2 && t.length <= 15, label:'书名 2～15 个字', tip:'太长在榜单和书架上会被截断，太短不好搜。当前 ' + t.length + ' 字。' },
      { ok:!/^(无题|未命名|我的作品|新作品)/.test(t.join('')), label:'书名不是占位名', tip:'书名决定第一眼的点击，最好能看出题材或爽点，如「我在XX当XX」。' },
      { ok:n >= 80 && n <= 400, label:'简介 80～400 字', tip:'太短说不清卖点，太长读者没耐心。当前 ' + n + ' 字。' },
      { ok:!!leadName && b.includes(leadName), label:'简介里有主角', tip:leadName ? '让读者知道这是「' + leadName + '」的故事。' : '先在设定里建好主角。' },
      { ok:/[？?！!…]|却|竟|没想到|直到|然而|但/.test(b), label:'简介有冲突或悬念', tip:'用一个反转或问题收住，比如「直到那一天……」「他却不知道……」。' },
      { ok:n > 0 && !/^.{0,20}(大陆|世界|纪元|位面|宇宙)/.test(b), label:'简介不从世界观讲起', tip:'先讲人和事，再带出世界。' }];
  }

  /* ---------- 版本对比 ---------- */
  /** 按段落对比两版文字（LCS），返回 [{t:'='|'+'|'-', s}]。段落太多时退化为整体替换。 */
  function diffParas(a, b) {
    const A = String(a || '').split('\n'), B = String(b || '').split('\n');
    if (A.length * B.length > 4e6) return [{ t:'-', s:a }, { t:'+', s:b }];
    const m = A.length, n = B.length, L = Array.from({ length:m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < m && j < n) { if (A[i] === B[j]) { out.push({ t:'=', s:A[i] }); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t:'-', s:A[i++] }); else out.push({ t:'+', s:B[j++] }); }
    while (i < m) out.push({ t:'-', s:A[i++] }); while (j < n) out.push({ t:'+', s:B[j++] });
    return out.filter(x => x.s.trim() || x.t === '=');
  }

  /* ---------- 平台格式 ---------- */
  /** 发布到网文平台的常用排版：段首两个全角空格、段间空一行、去掉多余空白；可选章节标题。 */
  function platformText(chapters, opts) {
    opts = Object.assign({ indent:true, blank:true, title:true }, opts);
    return chapters.map(c => {
      const paras = String(c.text || '').split(/\n+/).map(x => x.replace(/^[\s\u3000]+|[\s\u3000]+$/g, '')).filter(Boolean)
        .map(x => (opts.indent ? '\u3000\u3000' : '') + x);
      return (opts.title ? c.title + '\n\n' : '') + paras.join(opts.blank ? '\n\n' : '\n');
    }).join('\n\n\n');
  }

  /* ---------- AI 提示（有模型时用，没有就不调用） ---------- */
  function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; }
  function bible(project, upTo) {
    return project.data.nodes.slice(0, 60).map(n => {
      const pg = project.progressOf ? project.progressOf(n.id, upTo).slice(-3).map(x => x.text + (x.dead ? '（已死亡）' : '')).filter(Boolean) : [];
      return '- ' + n.name + (n.aliases ? '（又名' + n.aliases + '）' : '') + '：' + clip(n.summary || n.detail, 80) + (pg.length ? '；当前状态：' + pg.join(' → ') : '');
    }).join('\n');
  }
  function checkMessages(project, chapterId) {
    const c = project.chapter(chapterId);
    return [{ role:'system', content:'你是一位严格的网文责编，只指出问题，不改写正文。用中文分条列出：1. 与设定矛盾之处（人物名字、身份、能力、物品、时间）2. 本章内前后矛盾 3. 读者可能看不懂的地方。每条引用原文短句，并给出依据。没有问题就说没有。' },
      { role:'user', content:'【设定（截至上一章）】\n' + bible(project, project.chapterNo(chapterId) - 1) + '\n\n【书中时间】' + (c.storyTime || '（未填）') + '\n【本章：' + c.title + '】\n' + clip(c.text, 12000) }];
  }
  function unblockMessages(project, chapterId) {
    const list = project.chapters(), c = project.chapter(chapterId), i = list.indexOf(c);
    const open = (project.data.foreshadows || []).filter(f => !f.resolvedIn).map(f => '- ' + f.title + (f.note ? '：' + clip(f.note, 60) : '')).join('\n') || '（无）';
    return [{ role:'system', content:'你是网文作者的写作搭档。作者卡文了。给出 3 个方向明显不同的下一步剧情思路（每个 2-3 句），优先利用未回收的伏笔和已登场的配角，最后各给一句可以直接开写的开头。不要写正文全文。' },
      { role:'user', content:'【作品】' + project.title + '\n【设定】\n' + bible(project, project.chapterNo(chapterId)) + '\n【未回收伏笔】\n' + open
        + '\n【书中时间】' + (c.storyTime || '（未填）') + '\n【本章细纲】' + (c.outline || '（无）') + '\n【前情】' + (i > 0 ? clip(list[i - 1].text.slice(-800), 800) : '（无）') + '\n【本章已写】' + clip(c.text.slice(-2000), 2000) }];
  }

  /** AI 写作：作者定方向、定长度、定禁区；模型只出草稿，由作者决定要不要放进正文。 */
  const WRITE_MODES = { continue:'续写', polish:'润色', expand:'扩写' };
  const KEEPS = { voice:'保持我的文风、人称和用词习惯', cast:'不新增有名有姓的人物', plot:'不推进主线大事件、不揭开伏笔', short:'少用形容词堆砌，多用动作和对话' };
  function writeMessages(project, chapterId, o) {
    o = o || {}; const c = project.chapter(chapterId), mode = WRITE_MODES[o.mode] ? o.mode : 'continue', len = Math.max(100, Math.min(3000, +o.len || 500));
    const keep = (o.keep || []).map(k => KEEPS[k]).filter(Boolean);
    const rule = mode === 'continue' ? '接着【前文】最后一句往下写约 ' + len + ' 字正文。'
      : mode === 'polish' ? '润色【选中段落】：只改语病、节奏和用词，不改情节和信息量，字数与原文相当。'
      : '把【选中段落】扩写到约 ' + len + ' 字：补动作、神态、环境和对话，不改情节走向。';
    const sys = '你是网文作者的代笔助手，只输出可以直接放进正文的文字，不要解释、不要标题、不要加引号说明。' + rule
      + (keep.length ? '必须遵守：' + keep.join('；') + '。' : '') + (o.note ? '作者的要求：' + clip(o.note, 300) + '。' : '');
    const before = String(o.before != null ? o.before : c.text);
    return [{ role:'system', content:sys }, { role:'user', content:'【设定】\n' + bible(project, project.chapterNo(chapterId)) + '\n【本章：' + c.title + '】\n【本章细纲】' + (c.outline || '（无）')
      + '\n【前文】\n' + clip(before.slice(-2500), 2500) + (mode !== 'continue' ? '\n【选中段落】\n' + clip(o.sel || '', 3000) : '') }];
  }
  /** 简介：本机先给一份可改的骨架；连了模型再出 3 版。 */
  function blurbDraft(project) {
    const r = insight(project), lead = r.lead ? r.lead.name : '主角', other = r.cast.filter(x => x !== r.lead && x.chapters).slice(0, 2).map(x => x.name);
    const first = (project.chapters()[0] || {}).text || '', hook = (first.replace(/\s+/g, '').match(/[^。！？]{8,40}[。！？]/) || [''])[0];
    return (hook ? hook + '\n' : '') + lead + '本以为……，直到……。' + (other.length ? '\n与' + other.join('、') + '的纠葛，' : '\n') + '一场……就此开始。\n（把省略号换成你的故事；最后一句留个悬念。）';
  }
  function blurbMessages(project) {
    const r = insight(project), ch = project.chapters().slice(0, 3).map(c => '【' + c.title + '】' + clip(c.text, 1500)).join('\n');
    return [{ role:'system', content:'你是网文编辑。为这本书写 3 版简介，每版 80-150 字，风格分别是：悬念钩子、爽点直给、人物反差。说清主角是谁、遇到什么、想要什么、最大阻碍，结尾留钩子。不剧透结局。用「一、二、三、」分开，不要其他说明。' },
      { role:'user', content:'【书名】' + project.title + '\n【主角】' + (r.lead ? r.lead.name : '未知') + '\n【设定】\n' + bible(project, 3) + '\n【开篇】\n' + ch }];
  }
  /** 把模型输出的「一、二、三、」拆成几版。 */
  function splitVersions(text) {
    const parts = String(text || '').split(/(?:^|\n)\s*(?:[一二三四五]、|[1-5][.、])\s*/).map(x => x.trim()).filter(Boolean);
    return parts.length ? parts : [String(text || '').trim()];
  }

  /** 平台发布预设：排版习惯 + 发布前自查。数字是常见建议，不是平台硬规定。 */
  const PLATFORMS = {
    qidian:{ name:'起点', indent:true, blank:true, minWords:2000, titleMax:25, tip:'段首空两格、段间空行；单章建议 2000 字以上' },
    fanqie:{ name:'番茄', indent:false, blank:true, minWords:2000, titleMax:25, tip:'手机阅读为主：不缩进、段间空行、段落宜短' },
    qimao:{ name:'七猫', indent:true, blank:false, minWords:2000, titleMax:25, tip:'段首空两格、段间不空行' },
    plain:{ name:'通用', indent:true, blank:true, minWords:0, titleMax:40, tip:'晋江、刺猬猫等后台大多也接受' } };
  const NO_PREFIX = /^\s*第[\d一二三四五六七八九十百千零〇两]+[章回节]/;
  function chapterTitle(c, no) { const t = String(c.title || '').trim(); return NO_PREFIX.test(t) ? t : '第' + no + '章 ' + (t || '无题'); }
  /** 发布前自查：标题、字数、敏感词、超长段落、空章。返回 [{chapterId,no,title,kind,text}] */
  /**
   * 设定规则（一致性）：每行一条，「词 [范围] [：原因]」。范围：第20章前 / 第20章起 / 第5-30章；不写就是全书。
   * 词可用 / 分开写多个。例：「长生诀 第20章前：这时还没人知道」「师兄/师弟：林舟只叫沈砚“沈兄”」
   */
  /**
   * 读者数据导入：把作家后台的章节数据表（复制粘贴或 csv）读成 { cols, rows:[{ no, title, v:{列:数} }] }。
   * 认得的列：章节/序号、标题、阅读/点击、订阅/均订、追读、收藏、评论/本章说、打赏、完读。其余数字列也保留。
   */
  const READER_COLS = [['阅读', /阅读|点击|浏览|读者数/], ['订阅', /订阅|均订|首订/], ['追读', /追读|追更/], ['完读', /完读|读完/], ['收藏', /收藏|加书架|书架/], ['评论', /评论|本章说|段评|章评/], ['打赏', /打赏|月票|推荐票/]];
  function parseReader(src) {
    const lines = String(src || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (!lines.length) return null;
    const split = l => (/\t/.test(l) ? l.split('\t') : l.split(/\s*[,，]\s*|\s{2,}|\s*\|\s*/)).map(x => x.trim().replace(/^"|"$/g, ''));
    const num = x => { const m = String(x).replace(/,/g, '').match(/^(-?\d+(?:\.\d+)?)\s*(万|w|W|%)?$/); return m ? +m[1] * (m[2] === '万' || /w/i.test(m[2] || '') ? 10000 : 1) : null; };
    const head = split(lines[0]), hasHead = !head.some(h => num(h) != null) && head.some(h => /章|标题|名称/.test(h) || READER_COLS.some(c => c[1].test(h)));
    const names = hasHead ? head : head.map((h, i) => i === 0 ? (num(h) != null ? '章节' : '标题') : '数据' + i);
    const map = names.map(h => { if (/^(章节|序号|章节序号|章号|编号|#)$/.test(h)) return '#no'; if (/标题|章节名|名称|章节$/.test(h)) return '#title'; const c = READER_COLS.find(c => c[1].test(h)); return c ? c[0] : h; });
    const rows = [], cols = [];
    (hasHead ? lines.slice(1) : lines).forEach((l, k) => {
      const cells = split(l), r = { no:null, title:'', v:{} };
      cells.forEach((x, i) => { const key = map[i]; if (!key) return;
        if (key === '#no') { const m = x.match(/(\d+)/); r.no = m ? +m[1] : null; }
        else if (key === '#title') { r.title = x; const m = x.match(/^第\s*(\d+)\s*章/); if (m && r.no == null) r.no = +m[1]; }
        else { const v = num(x); if (v != null) { r.v[key] = v; if (!cols.includes(key)) cols.push(key); } else if (!r.title && i <= 1) { r.title = x; const m = x.match(/第\s*(\d+)\s*章/); if (m && r.no == null) r.no = +m[1]; } } });
      if (r.no == null && !r.title) return; if (r.no == null) r.no = k + 1; rows.push(r);
    });
    cols.sort((a, b) => { const ia = READER_COLS.findIndex(c => c[0] === a), ib = READER_COLS.findIndex(c => c[0] === b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return rows.length && cols.length ? { cols, rows:rows.sort((a, b) => a.no - b.no) } : null;
  }
  /** 掉读点：某列比前一章掉了 drop 以上（默认 30%），以及首尾留存。 */
  function readerDrops(data, col, drop) {
    const d = drop || 0.3, rows = (data && data.rows || []).filter(r => r.v[col] != null), out = [];
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1].v[col], b = rows[i].v[col]; if (a > 0 && (a - b) / a >= d) out.push({ no:rows[i].no, title:rows[i].title, from:a, to:b, pct:Math.round((a - b) / a * 100) }); }
    const first = rows[0], last = rows[rows.length - 1];
    return { drops:out.sort((a, b) => b.pct - a.pct), keep:first && last && first.v[col] ? Math.round(last.v[col] / first.v[col] * 100) : null, max:Math.max(0, ...rows.map(r => r.v[col])) };
  }

  function parseRules(src) {
    return String(src || '').split(/\n+/).map(l => l.trim()).filter(l => l && !/^[#／/]{2}/.test(l)).map(l => {
      const m = l.match(/^(.+?)(?:\s*[：:→]\s*(.*))?$/), head = m[1], note = (m[2] || '').trim();
      let from = 1, to = Infinity, words = head;
      const r = head.match(/\s*第?\s*(\d+)\s*(?:章)?\s*(?:[-~—到至]\s*第?\s*(\d+)\s*章?|(之前|以前|前)|(起|之后|以后|后))\s*$/);
      if (r) { words = head.slice(0, r.index); const a = +r[1]; if (r[2]) { from = a; to = +r[2]; } else if (r[3]) to = a - 1; else from = a; }
      return { words:words.split(/[\/／|｜]/).map(w => w.trim()).filter(Boolean), from, to, note, line:l };
    }).filter(x => x.words.length);
  }
  function ruleHits(rules, text, no) {
    const out = []; (rules || []).forEach(r => { if (no < r.from || no > r.to) return; r.words.forEach(w => { const i = String(text).indexOf(w); if (i < 0) return;
      out.push({ word:w, index:i, count:String(text).split(w).length - 1, note:r.note, range:r.to === Infinity ? (r.from > 1 ? '第 ' + r.from + ' 章起' : '全书') : r.from <= 1 ? '第 ' + (r.to + 1) + ' 章前' : '第 ' + r.from + '–' + r.to + ' 章' }); }); });
    return out;
  }
  function publishCheck(project, list, platform, extraSensitive) {
    const P = PLATFORMS[platform] || PLATFORMS.plain, all = project.chapters(), out = [], words = SENSITIVE.concat(extraSensitive || []);
    list.forEach(c => {
      const no = all.indexOf(c) + 1, n = countWords(c.text), title = chapterTitle(c, no), add = (kind, text) => out.push({ chapterId:c.id, no, title, kind, text });
      if (!n) add('danger', '空章');
      else if (P.minWords && n < P.minWords) add('warn', '只有 ' + n + ' 字，' + P.name + '建议 ' + P.minWords + ' 字以上');
      if (Array.from(title).length > P.titleMax) add('warn', '标题 ' + Array.from(title).length + ' 字，偏长');
      const hit = words.filter(w => w && String(c.text).includes(w)); if (hit.length) add('danger', '敏感词：' + hit.slice(0, 6).join('、'));
      ruleHits(parseRules((project.data.writing || {}).rules), c.text, no).forEach(h => add('danger', '违反设定规则：「' + h.word + '」' + (h.note ? '（' + h.note + '）' : '')));
      const long = String(c.text).split(/\n+/).filter(x => Array.from(x.trim()).length > 300).length; if (long && platform === 'fanqie') add('warn', long + ' 段超过 300 字，手机上像一堵墙');
    });
    return out;
  }
  /**
   * 边写边建：从正文里找出还没登记的新名字。
   * 说话人（X 道 / X 说，出现 ≥2 次）、介绍（名叫 X）、地名（来到 X 城/山/宗…）。返回 [{ name, count, type, sample }]。
   */
  const NN_STOP = new Set('他们 她们 我们 你们 众人 少年 少女 老者 那人 此人 对方 心中 忽然 突然 只是 于是 然后 不过 但是 那里 这里 自己 大家 有人 一人 两人 二人 三人 女子 男子 老人 孩子 弟子 师父 师傅 掌柜 小二 侍卫 将军 先生 姑娘 公子 夫人 大人 老爷 道士 和尚 声音 笑着 冷冷 淡淡 轻轻 低声 沉声 大声 连忙 急忙 赶紧 微微 缓缓 一边 这时 此时 那时 当时 现在 今天 明天 如此 这样 那样 什么 怎么 为何 不知 知道 说道 问道 心道 暗道 喝道'.split(' '));
  const NN_ACT = /^(满心|厉声|自言|言自|喜孜|笑嘻|大喜|大怒|大惊|心中|口中|连声|齐声|高声|转念|不好|只听|众猴|众人|众妖)|(欢喜|高叫|自语|大笑|闻言|闻|听了|见了|叹|应声|笑着|一声)$/;
  const NN_LEAD = /^[听见说着对向和与跟让叫被把将只却便又也就才都还并而且再忙正]+/, NN_TAIL = /[笑怒冷沉低轻淡大高忙急又也便就却才都还连不的了着]+$/;
  function newNames(text, entities, ignore) {
    text = String(text || ''); const known = []; (entities || []).forEach(e => namesOf(e).forEach(n => known.push(n)));
    const skip = new Set(ignore || []), found = new Map();
    const clean = w => { w = w.replace(NN_TAIL, ''); if (Array.from(w).length > 2) w = w.replace(NN_LEAD, ''); return w; };
    const bad = w => Array.from(w).length < 2 || NN_STOP.has(w) || skip.has(w) || /^[他她它我你这那其此某谁每各]/.test(w) || /[的了着过吗呢吧啊么得地之即个是在]/.test(w) || known.some(k => k === w || k.includes(w) || w.includes(k));
    const put = (w, type, weight, at, src) => { w = clean(w); if (bad(w) || NN_ACT.test(w) || CANON_GENERIC.has(w)) return; const r = found.get(w) || { name:w, count:0, score:0, type, index:Math.max(0, text.indexOf(w, at)), src:{} }; r.count++; r.score += weight; r.src[src || 'dao'] = 1; found.set(w, r); };
    let m; const sp = /([\u4e00-\u9fa5]{2,4}?)(?:冷笑|笑|怒|沉声|低声|轻声|淡淡|大声|忙|急)?(?:道|说|问|喊|喝道)[：:，,“"]/g;
    while ((m = sp.exec(text))) if (Array.from(clean(m[1])).length <= 3) put(m[1], 'PERSON', 1, m.index, 'dao'); /* 四字的「满心欢喜道」「厉声高叫道」多是成语/动作 */
    const intro = /(?:名叫|叫做|名为|唤作|自称|姓名是)([\u4e00-\u9fa5]{2,3})/g;
    while ((m = intro.exec(text))) put(m[1], 'PERSON', 2, m.index, 'intro');
    const place = /(?:来到|到了|前往|进入|回到|离开|赶往|抵达)([\u4e00-\u9fa5]{1,4}(?:城|山|宗|门|派|镇|村|谷|峰|殿|阁|府|国|州|岛|洞|寺|观|楼))/g;
    while ((m = place.exec(text))) put(m[1], 'PLACE', 2, m.index, 'place');
    // 截断：这个「名字」后面几乎总跟同一个字（土谷→祠、混世魔→王），说明真名更长，丢掉
    found.forEach((r, w) => { const nx = findAll(text, w).map(i => text.charAt(i + w.length)), top = {}; nx.forEach(c => { top[c] = (top[c] || 0) + 1; }); const best = Math.max(0, ...Object.entries(top).filter(([c]) => /[\u4e00-\u9fa5]/.test(c) && !/[道说问喊笑的了着]/.test(c)).map(([, n]) => n)); if (nx.length >= 2 && best >= nx.length * 0.8) found.delete(w); });
    return Array.from(found.values()).filter(r => r.score >= 2).map(r => Object.assign(r, { sample:text.slice(Math.max(0, r.index - 8), r.index + r.name.length + 10).replace(/\s+/g, ' ') })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 5);
  }
  /** 写作时间与效率：近 days 天的时长、速度、最顺手的时段、每周几最勤快。 */
  function timeStats(writing, days, todayKey) {
    days = days || 30; const T = (writing && writing.time) || {}, D = (writing && writing.daily) || {}, end = todayKey || dayKey();
    const hours = Array(24).fill(0), week = Array(7).fill(0), weekN = Array(7).fill(0), trend = [];
    let min = 0, words = 0, timedWords = 0, activeDays = 0;
    for (let i = days - 1; i >= 0; i--) {
      const k = addDays(end, -i), t = T[k] || {}, w = Math.max(0, D[k] || 0), m = t.m || 0, wd = new Date(k + 'T00:00:00').getDay();
      (t.h || []).forEach((v, h) => { if (v > 0) hours[h] += v; });
      words += w; min += m; if (m >= 1) timedWords += w; if (w > 0) { activeDays++; week[wd] += w; weekN[wd]++; }
      trend.push({ day:k, words:w, min:Math.round(m), speed:m >= 5 ? Math.round(w / m * 60) : null });
    }
    const speed = min >= 5 ? Math.round(timedWords / min * 60) : null, top = hours.map((v, h) => ({ h, v })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const best = top.length ? top[0].h : null, bestWin = best == null ? null : (() => { let b = 0, at = 0; for (let h = 0; h < 24; h++) { const v = hours[h] + hours[(h + 1) % 24]; if (v > b) { b = v; at = h; } } return at; })();
    const wkAvg = week.map((v, i) => weekN[i] ? Math.round(v / weekN[i]) : 0), bestDay = wkAvg.indexOf(Math.max(...wkAvg));
    const sp = trend.filter(x => x.speed != null), half = Math.floor(sp.length / 2), avg = a => a.length ? a.reduce((n, x) => n + x.speed, 0) / a.length : 0;
    const change = sp.length >= 4 ? Math.round((avg(sp.slice(half)) - avg(sp.slice(0, half))) / Math.max(1, avg(sp.slice(0, half))) * 100) : null;
    const tips = [];
    if (bestWin != null && top.length >= 2) tips.push('你在 ' + bestWin + ':00–' + ((bestWin + 2) % 24) + ':00 写得最多，把最难的章节放在这个时段。');
    if (speed != null && speed < 600) tips.push('每小时约 ' + speed + ' 字，偏慢——试试先写细纲再动笔，或开小黑屋限时冲刺。');
    if (change != null && change <= -20) tips.push('最近速度比前半段慢了 ' + (-change) + '%，可能卡文了，看看「卡文急救」。');
    if (change != null && change >= 20) tips.push('最近速度提升了 ' + change + '%，状态不错。');
    if (activeDays && activeDays < days / 3) tips.push(days + ' 天里只写了 ' + activeDays + ' 天，固定每天一个时段比偶尔爆更更稳。');
    return { days, min:Math.round(min), words, speed, activeDays, hours, week:wkAvg, bestDay:wkAvg[bestDay] ? bestDay : null, bestWin, trend, change, tips };
  }
  /**
   * AI 陪写：作者停笔时给一句边注。离线版用规则（平淡、连续对话、长段、角色状态、字数里程），
   * 连了模型就用 companionMessages 让模型说一句。recent 为本次新写的部分。
   */
  const CP_CONFLICT = /竟然|突然|没想到|然而|却|偏偏|不料|猛地|骤然|杀|血|怒|惊|危|逃|追|输|赢|死|？|！|……/;
  function companion(project, chapterId, text, sinceLen, seen) {
    const c = project.chapter(chapterId); text = String(text == null ? (c ? c.text : '') : text); seen = seen || [];
    const recent = text.slice(Math.max(0, sinceLen || 0)), n = countWords(recent), paras = text.split(/\n+/).map(x => x.trim()).filter(Boolean), out = [];
    const no = c ? project.chapterNo(c.id) : 0, add = (k, t) => { if (!seen.includes(k)) out.push({ k, text:t }); };
    const tail = paras.slice(-6);
    if (tail.length >= 5 && tail.every(x => /^[“"「]/.test(x))) add('talk:' + paras.length, '连着 ' + tail.length + ' 段都是对话，插一个动作或神态，让读者看清是谁在说。');
    const wall = paras.slice(-3).find(x => Array.from(x).length > 300); if (wall) add('wall:' + paras.indexOf(wall), '刚才那段 ' + Array.from(wall).length + ' 字，手机上像一堵墙，找个停顿拆成两三段？');
    if (n >= 400 && !CP_CONFLICT.test(recent)) add('flat:' + Math.floor(text.length / 500), '这 ' + n + ' 字一直很平稳，可以来一点意外、冲突或悬念，让读者手指别停。');
    (project.data.nodes || []).forEach(e => { if (!namesOf(e).some(nm => recent.includes(nm))) return; const pg = project.progressOf(e.id, no); const last = pg[pg.length - 1];
      if (last && last.dead) add('dead:' + e.id, '「' + e.name + '」在第 ' + last.no + ' 章已经死了——这里是回忆还是写串了？');
      else if (last && last.text) add('state:' + e.id + ':' + last.no, '提醒：「' + e.name + '」现在是「' + last.text + '」（第 ' + last.no + ' 章），别写串。'); });
    const total = countWords(text), mark = Math.floor(total / 1000) * 1000;
    if (!out.length && mark >= 1000) add('mile:' + mark, '本章写到 ' + mark.toLocaleString() + ' 字了，' + (CP_CONFLICT.test(text.slice(-200)) ? '节奏不错，继续。' : '想想这章的钩子放在哪。'));
    return out[0] || null;
  }
  function companionMessages(project, chapterId, text) {
    const c = project.chapter(chapterId), no = c ? project.chapterNo(c.id) : 0, before = Array.from(String(text || '')).slice(-800).join('');
    const cast = (project.data.nodes || []).filter(e => namesOf(e).some(nm => before.includes(nm))).slice(0, 6).map(e => e.name + '：' + (e.summary || '')).join('\n');
    return [{ role:'system', content:'你是网文作者身边的陪写搭档。作者刚停笔，请读最近写的一段，用一句话（不超过 40 个汉字）回应：要么像读者一样说出此刻的感受，要么提一个具体的下一步点子，要么指出一个明显的问题。不要改写原文，不要客套，不要加引号。' },
      { role:'user', content:'第 ' + no + ' 章《' + (c ? c.title : '') + '》' + (c && c.outline ? '\n本章细纲：' + c.outline : '') + (cast ? '\n出场人物：\n' + cast : '') + '\n\n最近写的：\n' + before }];
  }
  /** 发布前 30 秒：单章逐项打勾，返回清单 + 可直接粘贴的正文。 */

  /**
   * 下一章自动预填：把作者自己的规划（上章结尾、出场人物最新状态、到期伏笔、上章细纲）
   * 整理成一份可直接改的细纲骨架。不调用 AI、不写正文。
   * 返回 { no, lines:[{k,text}], outline } 或 null（没有上一章时）。
   */
  function nextPrefill(project, prevId) {
    const all = project.chapters(), prev = prevId ? project.chapter(prevId) : all[all.length - 1]; if (!prev) return null;
    const pno = all.indexOf(prev) + 1, no = pno + 1, lines = [], text = String(prev.text || '').replace(/\s+$/, '');
    const tail = Array.from(text.split(/(?<=[。！？!?」”])/).filter(x => x.trim()).slice(-1).join('').trim()).slice(-40).join('');
    if (tail) lines.push({ k:'hook', text:'承接上章结尾：' + tail });
    const people = scan(text, project.data.nodes).mentions.filter(m => m.entity.type === 'PERSON').slice(0, 3);
    if (people.length) lines.push({ k:'cast', text:'出场：' + people.map(m => { const pg = project.progressOf(m.entity.id, pno), last = pg[pg.length - 1]; return m.entity.name + (last && last.text ? '（' + String(last.text).slice(0, 16) + '）' : ''); }).join('、') });
    const fs = project.foreshadows().filter(f => !f.resolvedIn).map(f => ({ f, st:foreshadowStatus(f, no) })).filter(x => x.st === 'overdue' || x.st === 'soon')
      .sort((a, b) => (a.f.dueChapter || 0) - (b.f.dueChapter || 0)).slice(0, 3);
    if (fs.length) lines.push({ k:'fs', text:'该回收的伏笔：' + fs.map(x => x.f.title + '（' + (x.st === 'overdue' ? '已逾期，原定第 ' : '第 ') + x.f.dueChapter + ' 章）').join('、') });
    const real = String(prev.outline || '').split('\n').map(l => l.trim()).find(l => l && !/^(?:承接上章结尾|出场|该回收的伏笔|上章细纲|本章冲突|章末钩子)：/.test(l)); // 只取作者自己写的细纲，绝不套娃预填文字
    if (real) lines.push({ k:'prev', text:'上章细纲：' + (Array.from(real).length > 80 ? Array.from(real).slice(0, 80).join('') + '…' : real) });
    lines.push({ k:'conflict', text:'本章冲突：' }, { k:'end', text:'章末钩子：' });
    return { no, lines, outline:lines.map(x => x.text).join('\n') };
  }


  /**
   * 活的设定回声：光标前 40 字内最近写到的设定，返回它截至本章的最新状态与上次出现的章节。
   * 返回 { entity, name, state, lastNo, lastId } 或 null。
   */
  function echoAt(project, chapterId, text, caret) {
    const all = project.chapters(), no = all.findIndex(c => c.id === chapterId) + 1; text = String(text || '');
    const pos = caret == null ? text.length : Math.max(0, Math.min(caret, text.length)), win = text.slice(Math.max(0, pos - 40), pos);
    let best = null;
    project.data.nodes.forEach(e => namesOf(e).forEach(n => { const i = win.lastIndexOf(n); if (i >= 0 && (!best || i + n.length > best.end || (i + n.length === best.end && n.length > best.name.length))) best = { entity:e, name:n, end:i + n.length }; }));
    if (!best) return null;
    const e = best.entity, names = namesOf(e), pg = no ? project.progressOf(e.id, no) : [], last = pg[pg.length - 1];
    let lastNo = 0, lastId = null;
    for (let k = (no || all.length + 1) - 2; k >= 0; k--) { const t = all[k].text || ''; if (names.some(n => t.includes(n))) { lastNo = k + 1; lastId = all[k].id; break; } }
    return { entity:e, name:e.name, type:e.type, summary:String(e.summary || '').slice(0, 40), state:last ? String(last.text || (last.dead ? '已死亡' : '')).slice(0, 30) : '', stateNo:last ? last.no : 0, dead:!!(last && last.dead), lastNo, lastId, gap:lastNo ? no - lastNo : 0 };
  }


  /**
   * 断更保险：连更满 minStreak 天且今天还没投保 → need=true（由调用方把最近 3 章存为「保险稿」）；
   * 隔了 missed 天没写 → 给出「从这里继续」的提示（基于下一章预填）。
   */
  function insurance(project, today, minStreak) {
    today = today || dayKey(); minStreak = minStreak || 3;
    const W = project.data.writing || {}, daily = W.daily || {}, s = streak(daily, W.goal, today);
    const days = Object.keys(daily).filter(k => daily[k] > 0 && k <= today).sort(), lastDay = days[days.length - 1] || null;
    let missed = 0; if (lastDay && lastDay < today) { let k = lastDay; while (k < today && missed < 999) { k = addDays(k, 1); missed++; } missed--; }
    const all = project.chapters(), keep = all.filter(c => String(c.text || '').trim()).slice(-3).map(c => c.id);
    const pf = keep.length ? nextPrefill(project, keep[keep.length - 1]) : null;
    return { streak:s.current, need:s.current >= minStreak && W.insured !== today && keep.length > 0, keep, lastDay, missed:Math.max(0, missed),
      tip:pf ? pf.lines.filter(x => !/：$/.test(x.text)).map(x => x.text) : [] };
  }


  /** 千章仪式感：章节里程碑。返回刚到达且最高的一档 { n, words, chapters, best, days, top, resolved, planted, skin } 或 null。 */
  const RITES = [{ n:100, skin:'ink', name:'墨痕光标' }, { n:300, skin:'jade', name:'青玉纸' }, { n:500, skin:'ember', name:'烛火' }, { n:1000, skin:'gold', name:'千章金' }];
  function ritual(project, seen) {
    seen = seen || []; const all = project.chapters(), n = all.length, hit = RITES.filter(r => n >= r.n).pop();
    if (!hit || seen.includes(hit.n)) return null;
    const W = project.data.writing || {}, st = streak(W.daily, W.goal), cnt = new Map(), people = project.data.nodes.filter(e => e.type === 'PERSON');
    const sample = all.length > 400 ? all.filter((c, i) => i % Math.ceil(all.length / 400) === 0) : all;
    sample.forEach(c => { const t = c.text || ''; people.forEach(e => { const k = namesOf(e).reduce((a, nm) => a + (t.includes(nm) ? 1 : 0), 0); if (k) cnt.set(e, (cnt.get(e) || 0) + 1); }); });
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0].name), fs = project.foreshadows();
    return { n:hit.n, skin:hit.skin, skinName:hit.name, chapters:n, words:all.reduce((a, c) => a + countWords(c.text), 0), best:st.best, days:Object.keys(W.daily || {}).filter(k => W.daily[k] > 0).length, top, resolved:fs.filter(f => f.resolvedIn).length, planted:fs.length };
  }


  /** 读者预期雷达：作者标了「爽/虐/悬/甜」，按本章结构和自己以往同类章节比，给一句匹配度提示。 */
  const MOODS = { '爽':HYPE, '虐':['泪', '哭', '痛', '绝望', '心碎', '冷笑', '背叛', '失去', '死', '血', '颤抖', '跪'], '悬':HOOK.concat(['秘密', '谜', '诡异', '影子', '不对劲', '究竟', '消失']), '甜':['笑', '脸红', '心跳', '温柔', '牵', '抱', '吻', '暖', '轻声', '耳尖'] };
  function moodShape(text, mood) {
    text = String(text || ''); const L = text.length, ks = MOODS[mood] || [];
    let first = -1, hits = 0; ks.forEach(k => { let i = text.indexOf(k); if (i >= 0 && (first < 0 || i < first)) first = i; while (i >= 0) { hits++; i = text.indexOf(k, i + k.length); } });
    return { len:L, first, density:L ? hits / L * 1000 : 0, endHook:HOOK.some(k => text.slice(-120).includes(k)) };
  }
  function expectRadar(project, chapterId) {
    const all = project.chapters(), c = project.chapter(chapterId); if (!c || !c.expect || !MOODS[c.expect]) return null;
    const m = c.expect, me = moodShape(c.text, m); if (me.len < 200) return { mood:m, level:'wait', score:0, tips:['写到 200 字以上再看'], base:0 };
    const past = all.filter(x => x !== c && x.expect === m && String(x.text || '').length >= 200).map(x => moodShape(x.text, m));
    const avg = k => past.reduce((a, x) => a + x[k], 0) / past.length, tips = []; let score = 100;
    const fFirst = past.length ? avg('first') : me.len / 3, fDen = past.length ? avg('density') : 1.2, from = past.length ? '比你以往 ' + past.length + ' 章「' + m + '」章' : '按常见节奏';
    if (me.first < 0) { score -= 45; tips.push('通篇没有明显的「' + m + '」点'); }
    else if (me.first - fFirst > 300) { score -= 25; tips.push('「' + m + '」点' + from + '晚了 ' + Math.round(me.first - fFirst) + ' 字'); }
    if (me.density < fDen * 0.6) { score -= 20; tips.push('「' + m + '」的浓度' + (past.length ? '只有你同类章的 ' + Math.round(me.density / Math.max(0.01, fDen) * 100) + '%' : '偏淡')); }
    if (m === '悬' && !me.endHook) { score -= 20; tips.push('悬念章结尾没有留钩子'); }
    if (!tips.length) tips.push('「' + m + '」铺得够' + (past.length ? '，和你以往同类章节一致' : ''));
    score = Math.max(0, score); return { mood:m, score, level:score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'danger', tips, base:past.length };
  }


  /** 文风锚定：把本章的句长、对白占比、程度副词、概括句与「锚点章」（默认全书前 3 章，也可自己指定）比，看有没有越写越飘。 */
  const VAGUE = ['非常', '十分', '极其', '特别', '无比', '异常', '格外', '相当', '很'], SUMMARY = ['总之', '总而言之', '就这样', '于是', '一切都', '终于', '显然', '不禁', '仿佛'];
  function styleOf(text) {
    text = String(text || ''); const L = Array.from(text.replace(/\s/g, '')).length; if (!L) return null;
    const sents = text.split(/[。！？!?…]+/).map(x => x.trim()).filter(Boolean), dlg = (text.match(/[“「][^”」]*[”」]/g) || []).join('').length;
    const cnt = ks => ks.reduce((a, k) => a + text.split(k).length - 1, 0);
    return { len:L, sent:sents.length ? L / sents.length : L, dialog:dlg / L, vague:cnt(VAGUE) / L * 1000, summary:cnt(SUMMARY) / L * 1000 };
  }
  function styleDrift(project, chapterId) {
    const all = project.chapters(), c = project.chapter(chapterId); if (!c) return null;
    const me = styleOf(c.text); if (!me || me.len < 500) return null;
    const pick = (project.data.meta && Array.isArray(project.data.meta.styleAnchors) ? project.data.meta.styleAnchors : []).map(id => project.chapter(id)).filter(Boolean);
    const def = () => all.filter(x => x.id !== c.id && Array.from(String(x.text || '')).length >= 500).slice(0, 3), own = pick.filter(x => x.id !== c.id), anchors = own.length ? own : def();
    if (!anchors.length) return null;
    const A = anchors.map(x => styleOf(x.text)), avg = k => A.reduce((a, x) => a + x[k], 0) / A.length, tips = []; let score = 100;
    const sent = avg('sent'), dialog = avg('dialog'), vague = avg('vague'), summ = avg('summary');
    if (me.sent > sent * 1.45 && me.sent - sent > 8) { score -= 20; tips.push('句子变长了：平均 ' + Math.round(me.sent) + ' 字/句，锚点章 ' + Math.round(sent)); }
    if (me.sent < sent * 0.6 && sent - me.sent > 6) { score -= 15; tips.push('句子变碎了：平均 ' + Math.round(me.sent) + ' 字/句，锚点章 ' + Math.round(sent)); }
    if (Math.abs(me.dialog - dialog) > 0.25) { score -= 15; tips.push('对白占比 ' + Math.round(me.dialog * 100) + '%，锚点章 ' + Math.round(dialog * 100) + '%'); }
    if (me.vague > Math.max(vague * 1.8, vague + 2)) { score -= 20; tips.push('「很/非常/十分」这类程度词多了（每千字 ' + me.vague.toFixed(1) + '，锚点 ' + vague.toFixed(1) + '），试试换成具体的动作和画面'); }
    if (me.summary > Math.max(summ * 2, summ + 1.5)) { score -= 20; tips.push('概括句多了（「于是/终于/不禁」每千字 ' + me.summary.toFixed(1) + '），场景可能被一句话带过'); }
    return { score:Math.max(0, score), level:score >= 80 ? 'ok' : score >= 55 ? 'warn' : 'danger', tips:tips.length ? tips : ['和锚点章的文风一致'], anchors:anchors.map(x => all.indexOf(x) + 1), picked:own.length > 0, me, base:{ sent, dialog, vague, summary:summ } };
  }


  /** 工具人预警：最近 win 章里频繁出场、却几乎不开口也不主动做事的主要人物。 */
  const ACT = '道说问喊笑叫吼答骂叹决定转身冲抓推拔走跑举';
  function bystanders(project, win) {
    win = win || 10; const all = project.chapters(), recent = all.slice(-win), text = recent.map(c => c.text || '').join('\n'); if (!text.trim()) return [];
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return project.data.nodes.filter(n => n.type === 'PERSON').map(n => {
      const names = namesOf(n); if (!names.length) return null; const alt = names.map(esc).join('|');
      const m = (text.match(new RegExp(alt, 'g')) || []).length; if (m < 6) return null;
      const speak = (text.match(new RegExp('(' + alt + ')[^。！？\\n“”]{0,10}[' + ACT + ']', 'g')) || []).length + (text.match(new RegExp('(' + alt + ')[：:]\\s*[“「]', 'g')) || []).length;
      return { id:n.id, name:n.name, mentions:m, acts:speak, ratio:speak / m, chapters:recent.filter(c => names.some(x => (c.text || '').includes(x))).length };
    }).filter(x => x && x.ratio < 0.12).sort((a, b) => b.mentions - a.mentions).slice(0, 5);
  }


  /** AI 腔自查：模型最爱用、读者一眼看出的套话（平台也在查 AI 稿）。返回 [{word,count,index}]，按次数排。 */
  const AIISH = ['眼中闪过一丝', '闪过一丝', '嘴角勾起一抹', '勾起一抹', '一抹弧度', '空气仿佛凝固', '仿佛凝固了', '心中一凛', '不由得', '不禁', '一股莫名的', '莫名的', '深吸一口气', '倒吸一口凉气', '眸子', '眸光', '缓缓开口', '淡淡地说', '淡淡道', '微微一笑', '似乎在诉说', '宛如', '交织在一起', '仿佛在诉说', '这一刻', '与此同时', '值得一提的是', '总而言之', '不仅如此', '一丝丝', '涟漪'];
  function aiTone(text) {
    text = String(text || ''); const L = Array.from(text).length, out = [], used = [];
    const taken = new Uint8Array(text.length), idx = {};
    AIISH.slice().sort((x, y) => y.length - x.length).forEach(w => { let i = text.indexOf(w); while (i >= 0) { let free = true; for (let k = i; k < i + w.length; k++) if (taken[k]) { free = false; break; } if (free) { taken.fill(1, i, i + w.length); const h = idx[w] || (idx[w] = { word:w, count:0, index:i }); h.count++; if (i < h.index) h.index = i; } i = text.indexOf(w, i + 1); } });
    Object.values(idx).forEach(h => out.push(h)); void used;
    // 不禁/不由得/宛如/总而言之 名家也常用：只出现一两次、又没有别的套话陪着时不算
    const soft = new Set(['不禁', '不由得', '宛如', '总而言之']), hard = out.filter(h => !soft.has(h.word)).length;
    for (let k = out.length - 1; k >= 0; k--) if (soft.has(out[k].word) && out[k].count < 3 && !hard) out.splice(k, 1);
    const total = out.reduce((a, x) => a + x.count, 0);
    return { hits:out.sort((a, b) => b.count - a.count), total, per1k:L ? total / L * 1000 : 0, level:L < 300 ? 'wait' : total / L * 1000 > 3 ? 'danger' : total / L * 1000 > 1.2 ? 'warn' : 'ok' };
  }

  /** 手机排版：文字墙段落、同段多人对白。返回可定位的 hits。 */
  function mobileLayout(text) {
    text = String(text || ''); const walls = [], crowd = []; let pos = 0;
    text.split('\n').forEach(line => { const t = line.trim(), at = pos + line.indexOf(t); pos += line.length + 1; if (!t) return;
      const L = Array.from(t).length, q = (t.match(/“[^”]*”/g) || []).length, head = Array.from(t).slice(0, 10).join('') + '…';
      if (L > 250 && q === 0) walls.push({ word:head, unit:'字', count:L, index:at, len:L });
      // 只算真正有人开口的引号（前面挨着 说/道/：），且要有两个以上不同的说话人；术语、反讽的引号不算
      const said = []; { const re = /([\u4e00-\u9fa5]{1,3}?)(?:说道|笑道|问道|说|道|问|喊|叫)[：:，,]?“/g; let x; while ((x = re.exec(t))) { const w = x[1].replace(/^[，。、]/, ''); if (!/^[又还也便就再却都只才爱]/.test(w)) said.push(w); } }
      const who = new Set(said); if (said.length >= 3 && who.size >= 2) crowd.push({ word:head, unit:'句', count:said.length, index:at, len:L }); });
    walls.sort((a, b) => b.count - a.count); walls.length = Math.min(walls.length, 3); walls.sort((a, b) => a.index - b.index); // 一章最多点名 3 段最长的
    return { walls, crowd, total:walls.length + crowd.length };
  }

  /** 标点与占位符：漏给读者的 ??? / TODO / XX / 【待补】，半角标点混用，连串！！！ */
  function punct(text) {
    text = String(text || ''); const pick = (re, kind) => { const m = {}; let x; re.lastIndex = 0; while ((x = re.exec(text))) { const w = x[0]; (m[w] || (m[w] = { word:w, count:0, index:x.index, kind })).count++; } return Object.values(m); };
    const holes = pick(/\?{2,}|？{3,}|TODO|todo|XXX?|（待补[^）]*）|【待[补写定][^】]*】|此处[待省]略/g, 'hole');
    const half = pick(/[\u4e00-\u9fa5][,.!?;:](?=[\u4e00-\u9fa5“])/g, 'half');
    const pile = pick(/[！!]{3,}|[？?！!]{2,}[！!？?]+|…{4,}|。{2,}/g, 'pile').filter(x => !holes.some(h => h.word === x.word));
    return { holes, half, pile, total:holes.length + half.length + pile.length };
  }

  /** 开头三行：读者决定读不读的地方。看有没有对白、疑问、冲突，是否以天气/介绍开场。 */
  const OPEN_SLOW = ['阳光', '天空', '天气', '清晨', '那一天', '那天', '是一个', '出生在', '名叫', '今年', '岁的', '从前', '很久以前', '这是一个', '晴朗', '微风'];
  const OPEN_PULL = ['死', '杀', '血', '突然', '竟然', '居然', '为什么', '不对', '秘密', '最后一', '只剩', '必须', '来不及', '退婚', '重生', '穿越', '系统'];
  function opening(text) {
    const t = String(text || '').replace(/^\s+/, ''), sents = (t.match(/[^。！？!?\n]+[。！？!?”」』]*/g) || []).map(x => x.trim()).filter(x => /[\u4e00-\u9fa5A-Za-z0-9]/.test(x)).slice(0, 3), head = sents.join('');
    if (Array.from(t).length < 60) return { level:'wait', sents, slow:[], pull:[] };
    const slow = OPEN_SLOW.filter(w => head.includes(w)), pull = OPEN_PULL.filter(w => head.includes(w)), talk = /[“「『]/.test(head), ask = /[？?！!]/.test(head);
    const score = pull.length * 2 + (talk ? 1 : 0) + (ask ? 1 : 0) - slow.length;
    return { level:score >= 2 ? 'ok' : score >= 1 ? 'warn' : 'danger', sents, slow, pull, talk, ask, score };
  }

  /** 人称跳跃：第三人称章节里，引号外零星出现的「我」——多半是漏了引号或视角跳了。 */
  function povSlip(text) {
    text = String(text || ''); const paras = []; let pos = 0;
    let open = false; // 跨段的引号：上一段开了“没合上，这一段还在对白里
    text.split('\n').forEach(line => { const at = pos; pos += line.length + 1; const t = line.trim(); if (!t) return;
      let narr = (open ? '“' : '') + line; narr = narr.replace(/“[^”]*”|「[^」]*」|‘[^’]*’/g, m => ' '.repeat(m.length)); const lo = narr.lastIndexOf('“'); open = lo >= 0; if (open) narr = narr.slice(0, lo) + ' '.repeat(narr.length - lo); if (line !== narr && narr.length > line.length) narr = narr.slice(1);
      const segs = t.split(/[，。！？；、]/).filter(Boolean), poem = segs.length >= 2 && segs.every(x => /^[\u4e00-\u9fa5]+$/.test(x) && x.length === segs[0].length && x.length >= 4 && x.length <= 7) && !/[他她了的吗呢]/.test(t); /* 诗词：几句等长的四/五/七言 */
      const i = poem ? -1 : narr.search(/我(?!们|方|军|国|派|族|佛|邦|王|主|皇|家)/); paras.push({ line, at, i, third:/[他她]/.test(narr) }); });
    const mine = paras.filter(p => p.i >= 0), third = paras.filter(p => p.third && p.i < 0).length;
    if (paras.length < 5 || !mine.length || mine.length > Math.max(2, paras.length * 0.2) || third < mine.length * 2) return { mode:mine.length > paras.length * 0.2 ? 'first' : 'third', hits:[] };
    return { mode:'third', hits:mine.map(p => ({ word:Array.from(p.line.slice(p.i)).slice(0, 10).join(''), count:1, index:p.at + p.i, len:1 })) };
  }

  /** 设定说明段：没有对白、塞满「被称为/分为/据说」的长段，读者会跳过。 */
  const INFODUMP = ['被称为', '被誉为', '分为', '共有', '据说', '传说', '相传', '是指', '也就是说', '所谓', '等级', '境界', '划分', '由此可见', '一般来说', '众所周知', '历史上', '千年前', '万年前'];
  function infodump(text) {
    text = String(text || ''); const hits = []; let pos = 0;
    text.split('\n').forEach(line => { const at = pos; pos += line.length + 1; const t = line.trim(), L = Array.from(t).length; if (L < 80 || /[“「]/.test(t)) return;
      const ws = INFODUMP.filter(w => t.includes(w)); if (ws.length >= 2 || (ws.length && L > 180)) hits.push({ word:Array.from(t).slice(0, 10).join('') + '…', unit:'字', count:L, index:at + line.indexOf(t), len:t.length, marks:ws }); });
    return { hits };
  }

  /** 对话标签：一章里全是「XX说道」「XX道」，读起来像流水账。 */
  function dialogTags(text) {
    text = String(text || ''); const quotes = (text.match(/[“「][^”」]{1,200}[”」]/g) || []).length, m = {}; let x, n = 0;
    const re = /(?:[”」][，,]?|^|\n)([\u4e00-\u9fa5]{1,4}?)(说道|笑道|问道|答道|喊道|说|道|问)[：:，,。]?(?=[“「])|[”」]([\u4e00-\u9fa5]{1,4}?)(说道|笑道|问道|答道|喊道|说|道|问)[。，,]/g;
    while ((x = re.exec(text))) { const w = x[2] || x[4], at = x.index + x[0].indexOf(w, (x[1] || x[3] || '').length); n++; (m[w] || (m[w] = { word:w, count:0, index:at })).count++; }
    const plain = Object.values(m).filter(h => /^(说|道|说道)$/.test(h.word)).reduce((a, h) => a + h.count, 0);
    return { quotes, tags:n, plain, hits:Object.values(m).sort((a, b) => b.count - a.count), level:quotes >= 6 && plain >= 5 && plain / quotes >= 0.6 ? 'warn' : 'ok' };
  }

  /** 场景切换：时间/地点跳转的段落前没有空行或分隔符，读者会以为还在同一场。 */
  const SCENE_JUMP = /^(当晚|当夜|深夜|傍晚|清晨|与此同时|另一边|另一头|[一二两三四五六七八九十半几数]+(个)?(天|日|月|年|周|小时|时辰)(之|以)?后)/;
  function sceneBreaks(text) {
    const lines = String(text || '').split('\n'), hits = []; let pos = 0;
    lines.forEach((line, i) => { const at = pos; pos += line.length + 1; const t = line.trim(), m = t.match(SCENE_JUMP); if (!m || i === 0) return; const prev = lines[i - 1].trim();
      if (prev && !/^([-*＊—=~·]\s*){3,}$/.test(prev)) hits.push({ word:m[0], count:1, index:at + line.indexOf(t), len:m[0].length }); });
    return { hits };
  }

  /** 标题撞车：本章名和其他章完全相同或高度相似（去掉章号后比较二元组）。 */
  function titleClash(project, chapterId) {
    const strip = t => String(t || '').replace(/^第\s*[\d零一二三四五六七八九十百千]+\s*[章回节]\s*/, '').replace(/[\s，。！？、：·（）()\-—]/g, '');
    const gram = t => { const a = Array.from(t), g = new Set(); for (let i = 0; i < a.length - 1; i++) g.add(a[i] + a[i + 1]); return g; };
    const all = project.chapters(), c = project.chapter(chapterId); if (!c) return [];
    const me = strip(c.title); if (Array.from(me).length < 2) return []; const mg = gram(me);
    return all.map((o, i) => ({ o, no:i + 1 })).filter(x => x.o.id !== c.id).map(x => { const t = strip(x.o.title); if (!t) return null; if (t === me) return { no:x.no, title:x.o.title, id:x.o.id, sim:1 };
      const g = gram(t); let k = 0; g.forEach(v => { if (mg.has(v)) k++; }); const sim = k / (mg.size + g.size - k || 1); return sim >= 0.5 ? { no:x.no, title:x.o.title, id:x.o.id, sim } : null; }).filter(Boolean).sort((a, b) => b.sim - a.sim);
  }

  /** 超长句：70 字以上才见句号，手机上读着喘不过气。 */
  function longSent(text) {
    text = String(text || ''); const hits = [], re = /[^。！？!?…\n]+[。！？!?…]*/g; let x;
    while ((x = re.exec(text))) { const t = x[0], L = Array.from(t.replace(/[“”「」]/g, '')).length; const commas = (t.match(/[，,、；]/g) || []).length; if (L >= (commas >= L / 15 ? 120 : 70)) { const lead = t.search(/\S/); hits.push({ word:Array.from(t.slice(lead)).slice(0, 10).join('') + '…', unit:'字', count:L, index:x.index + lead, len:t.length - lead }); } }
    return { hits };
  }

  /** 情绪直给：「他很生气」「她感到害怕」——把情绪说出来，不如写出来。 */
  const EMO = '生气|愤怒|开心|高兴|难过|伤心|害怕|恐惧|紧张|激动|失望|痛苦|兴奋|尴尬|委屈|绝望|感动|焦虑|不安|震惊';
  function tellEmotion(text) {
    text = String(text || ''); const m = {}, re = new RegExp('(?:很|非常|十分|特别|无比|感到|觉得|心里很|心中很|显得)(?:' + EMO + ')', 'g'); let x;
    const narr = text.replace(/“[^”]*”|「[^」]*」/g, s => ' '.repeat(s.length));
    while ((x = re.exec(narr))) { const after = narr.slice(x.index + x[0].length, x.index + x[0].length + 12); if (/^[，,地]?[^。！？]{0,6}?(跳|跑|拍|抓|握|攥|搓|跺|站起|扑|冲|抱|摔|砸|踢|捶|咬|抖|哭|笑出|喊|叫|说|道)/.test(after)) continue; // 后面紧跟具体动作，已经写出来了
      (m[x[0]] || (m[x[0]] = { word:x[0], count:0, index:x.index })).count++; }
    const hits = Object.values(m).sort((a, b) => b.count - a.count); return { hits, total:hits.reduce((a, h) => a + h.count, 0) };
  }

  /** 流水账：起床、洗漱、吃饭、睡觉一件件写——和主线无关的日常最拖节奏。 */
  const ROUTINE = ['起床', '醒来', '睁开眼', '洗漱', '刷牙', '洗脸', '穿好衣服', '吃早饭', '吃完早饭', '吃午饭', '吃晚饭', '吃过饭', '出门', '回到家', '回家', '躺下', '睡觉', '睡着', '上床'];
  function routine(text) {
    text = String(text || ''); const hits = [];
    ROUTINE.forEach(w => { const i = text.indexOf(w); if (i >= 0 && !hits.some(h => h.word.includes(w) || w.includes(h.word))) hits.push({ word:w, count:text.split(w).length - 1, index:i }); });
    hits.sort((a, b) => a.index - b.index); const span = hits.length ? Array.from(text.slice(hits[0].index, hits[hits.length - 1].index)).length : 0;
    return { hits, level:hits.length >= 4 && span < 600 ? 'warn' : 'ok' };
  }

  /** 句首重复：连着 4 句以上都用「他」「她」「我」开头，读起来像报菜名。 */
  function sameStart(text) {
    text = String(text || ''); const hits = [], re = /[^。！？!?\n]+[。！？!?”]*/g; let x, run = [];
    const flush = () => { if (run.length >= 4) hits.push({ word:'「' + run[0].lead + '」开头', count:run.length, unit:'句', index:run[0].at, len:run[run.length - 1].end - run[0].at }); run = []; };
    while ((x = re.exec(text))) { const lead0 = x[0].search(/\S/), t = x[0].slice(lead0), m = t.match(/^(他们|她们|我们|他|她|我|你)/), at = x.index + lead0;
      if (text[x.index - 1] === '\n' || !m) { if (!m || (run.length && run[0].lead !== m[1])) flush(); else if (text[x.index - 1] === '\n') flush(); }
      if (m) { if (run.length && run[0].lead !== m[1]) flush(); run.push({ lead:m[1], at, end:x.index + x[0].length }); } }
    flush(); return { hits };
  }

  /**
   * 写完一章自动入正典：新名字、状态变化、和正典冲突，排成待确认队列。
   * 比喻/假设/回忆/梦境、对白里的话不当真；泛称（黑衣人、店小二）不建卡；「故意这样写」「本章临时」记下后不再弹。
   */
  const CANON_SKIP = /像|仿佛|好像|如同|宛如|似乎|如果|假如|要是|若是|万一|回忆|想起|记得|梦见|梦里|梦中|曾经|当年|以为|假装|传言|据说|觉得|感觉|快要|差点|几乎|险些|好似|恐怕/;
  const CANON_MEMORY = /留下的|遗物|浮现|眼前|笑脸|身影|想到|想起|念及|画像|遗像|牌位|梦|记忆|往事/;
  const CANON_KIN = /的(?:父亲|母亲|爹|娘|师父|师傅|师兄|师姐|师弟|师妹|兄长|哥哥|姐姐|弟弟|妹妹|妻子|夫人|丈夫|儿子|女儿|朋友|手下|部下|仆人|坐骑|尸体|尸首|仇人|敌人|对手|族人|家人|徒弟)/;
  const CANON_GENERIC = new Set('黑衣人 白衣人 店小二 小二 掌柜 老板 老者 少年 少女 青年 中年人 祝师 小妖 魔王 众猴 樵夫 老龙 会计 大哥 二哥 大嫂 衙门 转念 不好 群妖 众妖 猴王 美猴王 妖王 龙王 老妖 大汉 壮汉 侍卫 护卫 守卫 丫鬟 婢女 管家 路人 村民 百姓 弟子 长老 老头 老妇 妇人 书生 道士 和尚 刺客 杀手 士兵 官兵 捕快 衙役 伙计 车夫 船夫 乞丐 胖子 瘦子 汉子 姑娘 公子 小姐 夫人 大人 山贼 土匪 强盗'.split(' '));
  const CANON_STATE = [['dead', /当场死亡|死亡|死了|死去|身亡|陨落|殒命|战死|阵亡|断了气|咽了气|丧命|丧生|毙命|气绝|遇害|身死|归西|被杀|被斩|丢了性命|没了气息/], ['hurt', /受了重伤|重伤|断了[一条只]?[左右]?[臂腿手脚]|瞎了|废了|中毒/], ['heal', /好了大半|痊愈|伤势好转|伤好了|康复|恢复如初|毒已经?解了|解了毒|复明|伤口愈合|接上了/], ['power', /突破|晋升|踏入|晋入|迈入|觉醒/], ['res', /获得了?|得到了?|拿到了?|收下了?/]];
  const CANON_LABEL = { dead:'死亡', hurt:'受伤', heal:'伤势恢复', power:'突破/成长', res:'得到东西' };
  /** 状态词归给谁：只看动词所在分句里、动词前面最近的那个名字；「X的父亲」这种不算 X。 */
  function canonSubject(t, at, names) {
    const head = t.slice(0, at), start = Math.max(head.lastIndexOf('，'), head.lastIndexOf(','), head.lastIndexOf('；'), head.lastIndexOf('：')) + 1;
    const clause = head.slice(start).replace(new RegExp('(' + names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')' + CANON_KIN.source, 'g'), m => ' '.repeat(m.length));
    return names.some(n => clause.includes(n));
  }
  /** 正文里写了某人死亡、但还没记到人物卡：返回最早那一章 {no, sample}（被作者标为忽略/本章临时的不算） */
  function textDeath(project, n, names, before, gone) {
    const all = project.chapters();
    for (let i = 0; i < Math.min(before - 1, all.length); i++) {
      const t0 = String(all[i].text || ''); if (!names.some(k => t0.includes(k)) || !/死|亡|殒|陨|毙|气绝|遇害|归西|被杀|被斩|断了气|咽了气|丧/.test(t0)) continue;
      const re = /[^。！？!?\n]+[。！？!?”」]*/g; let x;
      while ((x = re.exec(t0))) {
        const t = x[0].replace(/“[^”]*”?|「[^」]*」?/g, m => ' '.repeat(m.length)); if (!names.some(k => t.includes(k)) || CANON_SKIP.test(t) || CANON_MEMORY.test(x[0])) continue;
        const m = t.match(CANON_STATE[0][1]); if (!m || !canonSubject(t, m.index, names)) continue;
        const snip = x[0].trim().slice(0, 40); if (gone['st:' + n.id + ':' + snip]) continue;
        return { no:i + 1, sample:snip, soft:true };
      }
    }
    return null;
  }
  function canonQueue(project, chapterId) {
    const c = project.chapter(chapterId); if (!c) return [];
    const text = String(c.text || ''), no = project.chapterNo(chapterId), W = project.data.writing || {}, gone = W.canonDismiss || {}, out = [];
    const sents = []; { const re = /[^。！？!?\n]+[。！？!?”」]*/g; let x; while ((x = re.exec(text))) sents.push({ t:x[0], at:x.index }); }
    const narr = s => s.t.replace(/“[^”]*”?|「[^」]*」?/g, m => ' '.repeat(m.length));
    const push = it => { if (!gone[it.key]) out.push(it); };
    newNames(text, project.data.nodes, W.nnIgnore).forEach(r => { if (CANON_GENERIC.has(r.name)) return; const s = sents.filter(s => s.t.includes(r.name)), real = s.filter(x => !CANON_SKIP.test(narr(x)));
      if (!real.length) return; push({ key:'new:' + r.name, kind:'new', name:r.name, type:r.type, text:'新' + (r.type === 'PLACE' ? '地点' : '人物') + '：' + r.name, sample:r.sample, index:r.index, len:r.name.length, conf:real.length === s.length && (r.type === 'PLACE' || (r.score >= 2 && r.count >= 2 && r.src && (r.src.intro || r.src.place))) ? 'high' : 'low' /* 只靠「X道」认出来的名字从不算高把握 */ }); });
    project.data.nodes.forEach(n => { const names = namesOf(n), prev = project.progressOf(n.id, no - 1), deadAt = prev.find(p => p.dead), mine = (n.progress || []).filter(p => p.chapterId === chapterId);
      const states = [];
      sents.forEach(s => { const t = narr(s); if (!names.some(k => t.includes(k))) return; if (CANON_SKIP.test(t)) return;
        CANON_STATE.forEach(([kind, re]) => { const m = t.match(re); if (!m || !canonSubject(t, m.index, names)) return; const snip = s.t.trim().slice(0, 40);
          if (mine.some(p => p.text && snip.includes(p.text.slice(0, 6)))) return;
          const at = s.at + m.index;
          if (kind === 'dead' && deadAt) return push({ key:'cf:' + n.id + ':' + no + ':dead', kind:'conflict', id:n.id, name:n.name, text:n.name + ' 在第 ' + deadAt.no + ' 章已死，这里又死一次', src:deadAt.no, sample:snip, index:at, len:m[0].length, conf:'low' });
          states.push({ key:'st:' + n.id + ':' + snip, kind:'state', sub:kind, id:n.id, name:n.name, text:n.name + ' ' + CANON_LABEL[kind], sample:snip, index:at, len:m[0].length, conf:kind === 'dead' || kind === 'hurt' || kind === 'heal' ? 'high' : 'low' }); }); });
      // 同一章里身体状态以章末为准：先重伤后好了大半，只留后者
      const body = states.filter(x => x.sub === 'hurt' || x.sub === 'heal'), lastBody = body[body.length - 1];
      states.filter(x => !(x.sub === 'hurt' || x.sub === 'heal') || x === lastBody).forEach(x => { if (x === lastBody && body.length > 1) x.text += '（章末状态）'; push(x); });
      const dead2 = deadAt || textDeath(project, n, names, no, gone);
      if (dead2) { const deadAt = dead2; const all = sents.filter(s => { const t = narr(s); return !CANON_SKIP.test(t) && !CANON_MEMORY.test(s.t) && names.some(k => t.replace(new RegExp('(' + names.join('|') + ')' + CANON_KIN.source, 'g'), ' ').includes(k)) && !/死|尸|坟|墓|遗|灵位|生前/.test(s.t); });
        const s = all[0]; if (s) push({ key:'cf:' + n.id + ':' + no + ':alive', kind:'conflict', id:n.id, name:n.name, text:n.name + (deadAt.soft ? ' 在第 ' + deadAt.no + ' 章正文里死了（人物卡还没记），这里又出场' : ' 已在第 ' + deadAt.no + ' 章死亡，这里又出场') + (all.length > 1 ? ' ' + all.length + ' 处' : ''), src:deadAt.no, soft:!!deadAt.soft, sample:s.t.trim().slice(0, 40), index:s.at, len:s.t.length, conf:'low',
          hits:all.map(x => ({ sample:x.t.trim().slice(0, 40), index:x.at, len:x.t.length })) }); } }); /* 每一句都列出来，归在同一条冲突下 */
    project.data.nodes.forEach(n => namesOf(n).forEach(k => { const ch = Array.from(k); if (ch.length < 2 || ch.length > 4) return; const re = new RegExp(ch.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[ \u3000\t]+')), m = text.match(re);
      if (m) push({ key:'sp:' + k + ':' + no, kind:'typo', name:k, id:n.id, bad:m[0], text:'「' + m[0] + '」中间有空格，可能是笔误', sample:text.slice(Math.max(0, m.index - 8), m.index + m[0].length + 10).replace(/\s+/g, ' '), index:m.index, len:m[0].length, conf:'high' }); }));
    const seen = new Set(); return out.filter(x => !seen.has(x.key) && seen.add(x.key)).sort((a, b) => (a.kind === 'conflict' ? 0 : 1) - (b.kind === 'conflict' ? 0 : 1) || a.index - b.index);
  }

  function quickCheck(project, chapterId, platform, extraSensitive) {
    const P = PLATFORMS[platform] || PLATFORMS.plain, all = project.chapters(), c = project.chapter(chapterId); if (!c) return null;
    const no = all.indexOf(c) + 1, n = countWords(c.text), title = chapterTitle(c, no), items = [], add = (k, label, level, detail) => items.push({ k, label, level, ok:level === 'ok', detail:detail || '' });
    add('words', '字数', !n ? 'danger' : P.minWords && n < P.minWords ? 'warn' : 'ok', n.toLocaleString() + ' 字' + (P.minWords ? '（' + P.name + '建议 ≥ ' + P.minWords + '）' : ''));
    const raw = String(c.title || '').trim(), tl = Array.from(raw).length, bare = !tl || /^第\s*[\d零一二三四五六七八九十百千]+\s*[章回节]$/.test(raw);
    add('title', '标题', bare || tl > P.titleMax ? 'warn' : 'ok', bare ? '只有章号，起个章名更容易被点开' : tl > P.titleMax ? tl + ' 字，偏长' : title);
    const r = scan(c.text, project.data.nodes, extraSensitive, { dead:project.deadBy ? project.deadBy(no - 1) : [] });
    const typo = r.typos.map(x => x.word + '→' + x.fix).concat(r.suspects.map(x => x.word + '→' + x.like + '？'));
    add('typo', '错别字 / 错名', typo.length ? 'warn' : 'ok', typo.length ? typo.slice(0, 5).join('、') : '没发现');
    const sens = SENSITIVE.concat(extraSensitive || []).filter(w => w && String(c.text).includes(w));
    add('sensitive', '敏感词', sens.length ? 'danger' : 'ok', sens.length ? sens.slice(0, 6).join('、') : '没命中');
    const rh = ruleHits(parseRules((project.data.writing || {}).rules), c.text, no);
    add('rules', '设定规则', rh.length ? 'danger' : 'ok', rh.length ? rh.map(h => '「' + h.word + '」' + (h.note ? h.note : '')).slice(0, 3).join('；') : '没违反');
    if (r.ghosts && r.ghosts.length) add('ghost', '已故角色', 'danger', r.ghosts.map(x => x.word).slice(0, 4).join('、') + ' 已在前文死亡');
    const tail = Array.from(String(c.text).replace(/\s+$/, '')).slice(-120).join(''), hooked = HOOK.some(h => tail.includes(h));
    add('hook', '章末钩子', !n ? 'warn' : hooked ? 'ok' : 'warn', hooked ? '结尾有悬念' : '最后 120 字没有悬念/转折，读者容易在这章停下');
    const ph = punct(c.text).holes; if (ph.length) add('hole', '占位符', 'danger', ph.map(x => x.word).slice(0, 4).join('、') + ' 会直接被读者看到');
    const due = (project.data.foreshadows || []).filter(f => !f.resolvedIn && parseInt(f.dueChapter, 10) && parseInt(f.dueChapter, 10) <= no);
    add('foreshadow', '到期伏笔', due.length ? 'warn' : 'ok', due.length ? due.slice(0, 3).map(f => '「' + f.title + '」第 ' + f.dueChapter + ' 章该回收').join('；') : '没有到期的');
    const long = String(c.text).split(/\n+/).filter(x => Array.from(x.trim()).length > 300).length;
    add('para', '段落长度', long ? 'warn' : 'ok', long ? long + ' 段超过 300 字，手机上像一堵墙' : '手机上读着不累');
    const bad = items.filter(x => x.level === 'danger').length, warn = items.filter(x => x.level === 'warn').length;
    return { no, title, words:n, items, bad, warn, ready:!bad, text:publishText(project, [c], platform), platform:P.name };
  }
  function publishText(project, list, platform) {
    const P = PLATFORMS[platform] || PLATFORMS.plain, all = project.chapters();
    return platformText(list.map(c => ({ title:chapterTitle(c, all.indexOf(c) + 1), text:c.text })), { indent:P.indent, blank:P.blank, title:true });
  }

  /** 里程碑：字数和章数各一条线；gap 为距上次码字的天数（断更预警）。 */
  const MS_WORDS = [10000, 50000, 100000, 300000, 500000, 1000000, 2000000, 3000000, 5000000];
  const MS_CH = [10, 50, 100, 300, 500, 1000, 2000];
  function milestones(words, chapters, daily, today) {
    today = today || dayKey();
    const fmt = n => n >= 10000 ? (n / 10000) + ' 万字' : n.toLocaleString() + ' 字';
    const pick = (list, have, f) => { const i = list.findIndex(x => x > have), prev = i > 0 ? list[i - 1] : i < 0 ? list[list.length - 1] : 0, next = i < 0 ? null : list[i];
      return { have, reached:prev ? f(prev) : '', next:next ? f(next) : '', need:next ? next - have : 0, pct:next ? Math.round((have - (i > 0 ? list[i - 1] : 0)) / (next - (i > 0 ? list[i - 1] : 0)) * 100) : 100 }; };
    const days = Object.keys(daily || {}).filter(k => (daily[k] || 0) > 0 && k <= today).sort();
    const last = days[days.length - 1], gap = last ? Math.round((Date.parse(today) - Date.parse(last)) / 864e5) : null;
    return { words:pick(MS_WORDS, words, fmt), chapters:pick(MS_CH, chapters, n => n + ' 章'), gap, last };
  }

  /**
   * 战力 / 资源成长线。状态变化里标成「境界」的按阶梯排名，标成「资源」的按「灵石 +100」记账。
   * 提醒：成长停滞、升得太快、越级、倒退、资源透支。ladder 为境界阶梯（从低到高），可为空。
   */
  const LADDER_DEFAULT = '炼气 筑基 金丹 元婴 化神 炼虚 合体 大乘 渡劫';
  function ladderOf(s) { return String(s == null ? LADDER_DEFAULT : s).split(/[\s,，、→>]+/).map(x => x.trim()).filter(Boolean); }
  function rankOf(text, ladder) { let best = -1, at = -1; ladder.forEach((r, i) => { const k = String(text).lastIndexOf(r); if (k >= 0 && (k > at || (k === at && r.length > (ladder[best] || '').length))) { best = i; at = k; } }); return best; }
  function growth(project, opts) {
    const o = opts || {}, ladder = ladderOf(o.ladder !== undefined ? o.ladder : (project.data.writing || {}).ladder), total = project.chapters().length;
    const stallGap = o.stallGap || 40, fastGap = o.fastGap || 3, people = [], res = [], alerts = [];
    project.data.nodes.forEach(n => {
      const list = project.progressOf(n.id).filter(x => x.no !== Infinity);
      const steps = list.filter(x => x.kind === 'power').map(x => ({ no:x.no, text:x.text, rank:rankOf(x.text, ladder), chapterId:x.chapterId }));
      if (steps.length) {
        const last = steps[steps.length - 1], since = total - last.no;
        people.push({ id:n.id, name:n.name, steps, rank:last.rank, level:last.rank >= 0 ? ladder[last.rank] : last.text, since });
        for (let i = 1; i < steps.length; i++) {
          const a = steps[i - 1], b = steps[i]; if (a.rank < 0 || b.rank < 0) continue;
          if (b.rank < a.rank) alerts.push({ kind:'down', id:n.id, no:b.no, text:n.name + ' 第 ' + b.no + ' 章从「' + ladder[a.rank] + '」掉到「' + ladder[b.rank] + '」——是有意的跌落吗？记得交代原因。' });
          else if (b.rank - a.rank > 1) alerts.push({ kind:'skip', id:n.id, no:b.no, text:n.name + ' 第 ' + b.no + ' 章从「' + ladder[a.rank] + '」直接到「' + ladder[b.rank] + '」，跳过了 ' + (b.rank - a.rank - 1) + ' 个境界。' });
          else if (b.rank > a.rank && b.no - a.no < fastGap) alerts.push({ kind:'fast', id:n.id, no:b.no, text:n.name + ' 第 ' + a.no + '→' + b.no + ' 章连升两次，间隔不到 ' + fastGap + ' 章，读者可能觉得太快、后期没得升。' });
        }
        if (since >= stallGap) alerts.push({ kind:'stall', id:n.id, no:last.no, text:n.name + ' 已经 ' + since + ' 章没有成长（停在第 ' + last.no + ' 章的「' + (last.rank >= 0 ? ladder[last.rank] : last.text) + '」），读者可能觉得憋屈。' });
      }
      const book = {};
      list.filter(x => x.kind === 'res').forEach(x => String(x.text).replace(/([^\s+\-－＋\d，,、]{1,8})\s*([+\-－＋])\s*(\d+)/g, (m, name, sg, v) => {
        name = name.replace(/^(得到|获得|拿到|收到|赚了?|赚到|花了?|花掉|消耗|用掉|失去|交出|买了?|卖了?|捡到|抢到|上交|奖励|赏)/, '') || name; const r = book[name] = book[name] || { owner:n.name, id:n.id, name, balance:0, log:[] }; const d = (sg === '-' || sg === '－' ? -1 : 1) * Number(v);
        r.balance += d; r.log.push({ no:x.no, d, after:r.balance });
        if (r.balance < 0 && !r.warned) { r.warned = true; alerts.push({ kind:'neg', id:n.id, no:x.no, text:n.name + ' 的「' + name + '」在第 ' + x.no + ' 章花成了 ' + r.balance + '，前面没攒够——是不是漏记了收入？' }); }
        return m; }));
      Object.values(book).forEach(r => { delete r.warned; res.push(r); });
    });
    alerts.sort((a, b) => a.no - b.no);
    return { ladder, people, res, alerts, total };
  }

  /* ===== 别名映射：错名 / 外号 / 一名多人 / 别名使用范围，以及安全的批量替换 ===== */
  const AL_VAR = { '遠':'远', '雲':'云', '風':'风', '蘇':'苏', '韓':'韩', '張':'张', '陳':'陈', '趙':'赵', '劉':'刘', '鋒':'锋', '華':'华', '飛':'飞', '龍':'龙', '鳳':'凤', '劍':'剑', '靈':'灵', '寧':'宁', '曉':'晓', '東':'东', '書':'书', '楊':'杨', '葉':'叶', '馬':'马', '孫':'孙', '•':'·', '・':'·', '．':'·', '.':'·', '‧':'·' };
  /* 形近 / 音近、常被打错的名字用字（成对） */
  const AL_PAIR = ['峰锋', '晴情', '晴清', '远源', '云芸', '风枫', '轩萱', '涵含', '琳林', '辰晨', '瑶遥', '婷亭', '凌灵', '浩皓', '泽择', '恒衡', '杰洁', '雪雷', '飞非', '玉王', '宇字', '默墨', '萧肖', '然燃'];
  function alNorm(ch) {
    const c = ch.charCodeAt(0);
    if (c >= 0xFF01 && c <= 0xFF5E) return String.fromCharCode(c - 0xFEE0);
    return AL_VAR[ch] || ch;
  }
  function alPair(a, b) { return AL_PAIR.some(p => (p[0] === a && p[1] === b) || (p[1] === a && p[0] === b)); }
  function alEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /** 引号里的对白区间 [{s,e,speaker}]；speaker = 引号前同一句里最近出现的已登记名字 */
  function alDialogue(text, names) {
    const out = [], re = /[“「"]([^”」"]*)[”」"]/g; let m;
    while ((m = re.exec(text))) {
      const pre = text.slice(Math.max(0, m.index - 14), m.index).split(/[。！？\n]/).pop();
      let sp = '', at = -1; names.forEach(n => { const i = pre.lastIndexOf(n); if (i > at) { at = i; sp = n; } });
      out.push({ s:m.index, e:m.index + m[0].length, speaker:sp });
    }
    return out;
  }
  function alIn(ds, i) { return ds.find(d => i > d.s && i < d.e) || null; }
  function alMap(aliases) {
    const out = {};
    Object.keys(aliases || {}).forEach(a => {
      const v = aliases[a];
      if (Array.isArray(v)) out[a] = { to:v.slice(), scope:null };
      else if (v && typeof v === 'object') out[a] = { to:[].concat(v.to || []), scope:v.scope || null };
      else if (v) out[a] = { to:[String(v)], scope:null };
    });
    return out;
  }
  /**
   * 别名建议。ctx: {canon:[名字], aliases:{别名:[人物] | {to, scope:{onlyDialogue}|{speaker}}}, marks:{名字:说明}}
   * → [{kind:'typo'|'nickname'|'conflict'|'scope', name, target, confidence:'high'|'low', at:[offset]}]
   * 只提示，不改正文；尊称（师父、少爷、大师兄）不当成别名，一名多人只提示歧义。
   */
  function aliasSuggest(ctx, text) {
    ctx = ctx || {}; text = String(text || '');
    const canon = (ctx.canon || []).filter(Boolean), marks = ctx.marks || {}, al = alMap(ctx.aliases);
    const known = new Set(canon.concat(Object.keys(al)));
    const out = [], byKey = new Map();
    const add = (kind, name, target, conf, at) => {
      if (marks[name] !== undefined || (kind !== 'conflict' && kind !== 'scope' && known.has(name))) return;
      const k = kind + '|' + name; let x = byKey.get(k);
      if (!x) { x = { kind, name, target, confidence:conf, at:[] }; byKey.set(k, x); out.push(x); }
      if (x.at.indexOf(at) < 0) x.at.push(at);
      if (conf === 'high') x.confidence = 'high';
    };
    const isCJK = ch => /[\u3400-\u9fff]/.test(ch);
    /* 1) 错名：异体 / 全角 / 间隔号 / 名字中间的空格（高把握），形近音近一字之差 */
    canon.forEach(name => {
      const chars = Array.from(name);
      const cls = chars.map(ch => { const n = alNorm(ch), vs = new Set([ch, n]); Object.keys(AL_VAR).forEach(k => { if (AL_VAR[k] === n) vs.add(k); }); for (let c = 0xFF01; c <= 0xFF5E; c++) if (String.fromCharCode(c - 0xFEE0) === n) vs.add(String.fromCharCode(c)); return '[' + Array.from(vs).map(alEsc).join('') + ']'; });
      const re = new RegExp(cls.join(chars.length > 1 ? '[ \\u3000]?' : ''), 'g'); let m;
      while ((m = re.exec(text))) if (m[0] !== name && !canon.some(c => c !== name && text.substr(m.index, c.length) === c)) add('typo', m[0], name, 'high', m.index);
      if (chars.length < 2 || !chars.every(isCJK)) return;
      for (let i = 0; i + chars.length <= text.length; i++) {
        const w = text.substr(i, chars.length); if (w === name || !Array.from(w).every(isCJK)) continue;
        let diff = -1, n = 0; for (let j = 0; j < chars.length; j++) if (w[j] !== chars[j] && alNorm(w[j]) !== chars[j]) { n++; diff = j; }
        if (n !== 1) continue;
        if (known.has(w) || canon.some(c => c.includes(w) || (c !== name && text.substr(i, c.length) === c) || (c !== name && text.slice(Math.max(0, i - c.length + 1), i + c.length).includes(c)))) continue;
        const pair = alPair(w[diff], chars[diff]);
        if (pair) add('typo', w, name, w[diff] === '锋' || w[diff] === '峰' ? 'high' : 'low', i);
        else if (chars.length >= 3 && diff === chars.length - 1 && /[锋峯]/.test(w[diff])) add('typo', w, name, 'low', i);
      }
    });
    /* 2) 外号：「X…人称/外号/叫他 Y」，Y 归到句子主语 X 上；给别人（小狗）起外号、人名在外号后面的都不算 */
    const cue = /(江湖人称|人送外号|人称|外号叫|外号|绰号|都叫他|都叫她|叫他|叫她|称他|称她|喊他|喊她)[是为作做]?[“「"]?([\u4e00-\u9fff]{2,4}?)(?=[”」"，。！？、；\s]|也|就|便|$)/g;
    let m;
    while ((m = cue.exec(text))) {
      const nick = m[2], start = m.index;
      const sent = text.slice(0, start).split(/[。！？\n]/).pop();
      if (/给|替|帮|为/.test(sent.replace(/[^，]*，/g, '').slice(-12)) && /起/.test(text.slice(start - 6, start))) continue;
      let who = '', at = -1; canon.forEach(c => { const i = sent.lastIndexOf(c); if (i >= 0 && (at < 0 || i < at)) { at = i; who = c; } });
      if (/[他她]/.test(m[1]) && (!/(众人|大家|人们|旁人|别人|同门|街坊)[都也]?$/.test(text.slice(Math.max(0, start - 4), start).replace(/都$/, '').concat('')) && !/(众人|大家|人们|旁人|别人|同门|街坊)都?$/.test(text.slice(Math.max(0, start - 5), start)))) continue; /* 「阿Q称他假洋鬼子」是 X 叫别人，不是 X 的外号 */
      if (/^[做作]/.test(text.slice(start + m[1].length)) && /[他她]/.test(m[1]) || /[不没]$/.test(text.slice(start - 1, start))) continue;
      if (!who || known.has(nick) || canon.some(c => c.includes(nick))) continue;
      const quoted = /[“「"]/.test(text[start + m[1].length]) || text.indexOf(nick, start + m[0].length) >= 0;
      add('nickname', nick, who, quoted ? 'high' : 'low', start + m[0].length - nick.length);
    }
    /* 3) 已登记别名：一名多人提示歧义；带范围的别名出了范围低把握提示 */
    const ds = alDialogue(text, canon);
    Object.keys(al).forEach(a => {
      const info = al[a]; let i = -1;
      while ((i = text.indexOf(a, i + 1)) >= 0) {
        if (info.to.length > 1) { add('conflict', a, info.to.slice(), 'low', i); continue; }
        const sc = info.scope; if (!sc) continue;
        const d = alIn(ds, i);
        if (sc.onlyDialogue && !d) add('scope', a, info.to[0], 'low', i);
        if (sc.speaker && d && d.speaker && d.speaker !== sc.speaker) add('scope', a, info.to[0], 'low', i);
      }
    });
    return out;
  }
  /**
   * 批量替换（只返回新文本，不落盘）。op: {from, to, scope?, range?:[s,e]}；ctx 同 aliasSuggest（可省）。
   * 歧义别名（一名多人）拒绝；标为「故意」的名字不替换；别名登记了范围时，范围内的称呼保留不动。
   * → {text, changes:[{at, before, after, ctx}], refused?:'理由'}
   */
  function aliasReplace(text, op, ctx) {
    text = String(text || ''); op = op || {}; ctx = ctx || {};
    const from = String(op.from || ''), to = String(op.to || '');
    if (!from || from === to) return { text, changes:[] };
    const al = alMap(ctx.aliases)[from], marks = ctx.marks || {};
    if (al && al.to.length > 1) return { text, changes:[], refused:'「' + from + '」同时是 ' + al.to.join('、') + ' 的别名，不能一键替换，请逐处确认' };
    if (marks[from] !== undefined) return { text, changes:[], refused:'「' + from + '」已标为故意这样写' };
    const scope = op.scope || (al && al.scope) || null, ds = scope ? alDialogue(text, ctx.canon || []) : [];
    const range = Array.isArray(op.range) ? op.range : null, changes = [];
    let i = -1;
    while ((i = text.indexOf(from, i + 1)) >= 0) {
      if (range && (i < range[0] || i + from.length > range[1])) continue;
      if (scope) { const d = alIn(ds, i); if (scope.onlyDialogue && d) continue; if (scope.speaker && d && d.speaker === scope.speaker) continue; }
      changes.push({ at:i, before:from, after:to, ctx:text.slice(Math.max(0, i - 8), i + from.length + 8) });
    }
    let out = '', last = 0; changes.forEach(c => { out += text.slice(last, c.at) + to; last = c.at + from.length; });
    return { text:out + text.slice(last), changes };
  }
  /** 全书预览：按章分组列出每一处，作者可逐条取消。chapters: [{id, no, title, text}] */
  function aliasPreview(chapters, op, ctx) {
    const groups = []; let count = 0, refused = '';
    (chapters || []).forEach(c => { const r = aliasReplace(c.text, op, ctx); if (r.refused) refused = r.refused; if (r.changes.length) { groups.push({ id:c.id, no:c.no, title:c.title, changes:r.changes }); count += r.changes.length; } });
    return { groups, count, groupBy:'chapter', refused:refused || undefined };
  }

  return { aliasSuggest, aliasReplace, aliasPreview, parseReader, readerDrops, READER_COLS, parseRules, ruleHits, growth, ladderOf, rankOf, LADDER_DEFAULT, milestones, PLATFORMS, chapterTitle, publishCheck, quickCheck, nextPrefill, echoAt, insurance, ritual, RITES, expectRadar, MOODS, styleOf, styleDrift, bystanders, aiTone, AIISH, canonQueue, CANON_SKIP, canonSubject, sameStart, routine, ROUTINE, tellEmotion, longSent, mobileLayout, punct, titleClash, sceneBreaks, dialogTags, infodump, INFODUMP, povSlip, opening, OPEN_SLOW, newNames, timeStats, companion, companionMessages, publishText, WRITE_MODES, KEEPS, writeMessages, blurbDraft, blurbMessages, splitVersions, TEMPLATES, report, layoutGraph, comments, blurbCheck, COMMENT_KINDS, insight, HYPE, HOOK, diffParas, TYPOS, platformText, stock, focusState, mmss, dayKey, addDays, streak, heatmap, foreshadowStatus, STATUS_LABEL, scan, CRUTCH, SENSITIVE, checkMessages, unblockMessages };
}));
