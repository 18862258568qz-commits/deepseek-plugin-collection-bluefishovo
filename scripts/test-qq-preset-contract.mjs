// reserved2 提示词与插件边界的静态契约；不调用模型，不向 QQ 发送消息。
// 这些检查只能防止关键协议/能力被误删，不能证明聊天质量无损。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import yaml from 'js-yaml';

const preset = yaml.load(fs.readFileSync(
  new URL('../dsh/agent-presets/qq-chat-v2/agent.cordis.yml', import.meta.url), 'utf8',
));
const persona = preset.find((row) => row.id === 'persona');
const prefix = persona?.config?.prefix ?? '';

test('reserved2 YAML resolves to the expected persona and template variables', () => {
  assert.equal(persona?.name, '@deepseek-ai/dsh-persona');
  assert.match(prefix, /\{\{model\}\}/);
  // DSH 0.2.1 不再注册 {{cwd}}：模板里出现它会直接让 prompt 装配失败，
  // 所以 preset 刻意**不写** suffix。这里钉住"别把它加回来"，
  // 而不是要求 suffix 存在（旧断言写的正是那个会让装配崩掉的写法）。
  const suffix = persona?.config?.suffix;
  assert.ok(
    suffix === undefined || !/\{\{cwd\}\}/.test(suffix),
    'persona.suffix 不得包含 {{cwd}}（DSH 0.2.1 未注册该变量，会让 prompt 装配失败）',
  );
  assert.equal(Object.hasOwn(persona.config, 'text'), false);
});

test('local/admin tool restrictions and existing compaction budgets stay intact', () => {
  assert.deepEqual(preset.map((row) => row.id), [
    'persona', 'tool-web', 'tool-ask-user', 'tool-todo', 'qq-tool-restrict', 'compaction',
  ]);
  assert.deepEqual(preset.find((row) => row.id === 'tool-web').config, { search: false, fetch: false });
  assert.equal(preset.find((row) => row.id === 'qq-tool-restrict').name, './qq-tool-restrict.mjs');
  const compaction = preset.find((row) => row.id === 'compaction');
  assert.deepEqual(compaction.isolate, { compaction: true, toolResultPruner: true });
  // 预算随 preset 收紧过（50000/45000 → 20000/16000）：阈值 50000 + 头 45000 时，
  // 剪完的结果仍可能接近 47k 字符，既省不下多少上下文，也装不进更小的窗口。
  // 这里钉住当前实际值，并额外钉住"剪完一定比阈值短"的语义关系，
  // 防止以后有人只调大 headChars 就悄悄让 pruner 失效。
  const pruner = compaction.config.find((row) => row.id === 'tool-result-pruner').config;
  assert.deepEqual(pruner, { thresholdChars: 20000, headChars: 16000, tailChars: 2000 });
  assert.ok(
    pruner.headChars + pruner.tailChars <= pruner.thresholdChars,
    'pruner 的 headChars + tailChars 不得超过 thresholdChars（否则裁剪后反而更长）',
  );
  for (const text of ['你没有本地工具', '群友没有管理权限', 'API 令牌', '角色由桥接注入']) {
    assert.ok(prefix.includes(text), `missing safety rule: ${text}`);
  }
});

test('snapshots are optional, partial snapshots require reading, and watermarks are not message IDs', () => {
  assert.match(prefix, /可能附带【本次消息快照】/);
  assert.match(prefix, /partial=true[^。]*继续读取/);
  assert.match(prefix, /readThroughSeq 是桥接本地的 seq，不是 QQ messageId/);
  assert.match(prefix, /没有水位[^。]*省略 throughSeq/);
  assert.match(prefix, /首次进入会话、角色变化[^。]*qq_get_prompt/);
});

test('one closing action can acknowledge the read watermark after the full observation', () => {
  assert.match(prefix, /qq_mark_read\(throughSeq=/);
  assert.match(prefix, /qq_set_wake_config\(config=[^)]*throughSeq=/);
  assert.match(prefix, /不需先 mark_read/);
  assert.match(prefix, /qq_wait_for_messages\(timeoutMs=300000\)/);
  assert.match(prefix, /短等待不能代替/);
  assert.match(prefix, /preSleepWaitRemainingMs[^。]*继续等待/);
  assert.match(prefix, /若你参与回复[^。]*重新观察/);
});

test('pre-reply quiet checks, waiting for replies and pre-sleep observation have distinct instructions', () => {
  assert.match(prefix, /先理解并处理当前消息/);
  assert.match(prefix, /【首答前】[^\n]*qq_wait_for_messages\(purpose="reply", quietMs=10000\)/);
  assert.match(prefix, /读取和思考花掉的时间也算，已安静足够就立即返回/);
  assert.match(prefix, /不要再重开一次普通长等待/);
  assert.match(prefix, /预算到但 quiet=false 不等于对方说完/);
  assert.match(prefix, /【等下文】[^\n]*purpose="messages", timeoutMs=60000~120000/);
  assert.match(prefix, /【回复后】[^\n]*qq_wait_for_messages\(purpose="messages"\)/);
  assert.match(prefix, /短静默不算沉睡前观察/);
  assert.match(prefix, /5 分钟观察不是回复的前置条件/);
  assert.match(prefix, /只有准备收尾时[^。]*preSleepWaitRemainingMs/);
});

test('social autonomy and visual, forwarding, sticker and web capabilities remain described', () => {
  for (const text of [
    '【反 AI 味：拒绝有求必应】', '【保持主体性】', '【学习群友策略】',
    '【不要当群管家/主持人】', '普通对话默认 1 条，最多 2 条', '不要用空格断句',
    '不会自动发送到 QQ', 'qq_get_message_images', 'qq_get_forward_msg', 'nestedForwardIds',
    'qq_send_poke', 'qq_list_stickers', 'qq_get_sticker_image', 'qq_send_sticker',
    'qq_collect_sticker', 'qq_sticker_note', 'qq_get_self_image',
    'qq_set_sticker_remark', '只有管理端明确开启后才能用',
    // 语音：第 16 条已重写。预制语音库（qq_send_voice / qq_list_voices）按出厂默认关闭，
    // 唯一正确的路径是 qq_say_voice 现场合成 —— 所以这里不能再断言"人设提到 qq_send_voice"
    // 当作"AI 知道自己会说话"的证据（旧断言命中的只是"它已经不存在了"那句话）。
    // 改为钉住三件真正决定行为的事：
    //   ① 人设知道该用哪个工具（qq_say_voice）；
    //   ② 人设知道语音库/工具可能是关的，且此时继续打字而不是重试或假装；
    //   ③ verified=true 才算真的落地（防止 AI 编造"我发了语音"）。
    'qq_say_voice', '预制语音库已关闭',
    '工具没出现或报「工具未启用」就继续打字',
    '返回 verified=true 才算真的落地', '不要假装发了语音',
    'mcp__web-search-safe__web_search', 'mcp__web-search-safe__web_fetch',
  ]) assert.ok(prefix.includes(text), `missing capability or voice rule: ${text}`);
});

test('autonomy limits and the observation escape hatch stay described', () => {
  // These rules were previously unguarded: deleting any of them left every test green.
  for (const text of [
    // 沉睡前观察唯一的逃生口：明确结束语可以跳过 5 分钟等待。
    '除非对方明确“不聊了/晚安/下了/拜拜”等结束语',
    // [SILENT] 是桥接的退出标记，误用会静默吞掉回复。
    '不要用 [SILENT]',
    // 记忆面
    '【记忆卫生】', 'qq_memory_append', 'qq_memory_query', 'qq_memory_remove', 'qq_memory_clear',
    // 黑话面
    'qq_slang_query', 'qq_slang_submit', '不重复提交',
    // 频率上限（表情包那条从"普通闲聊约 3~5 轮一张"改成了"差不多每 1~2 轮就该有一张"，
    // 是主动调高表情密度；这里跟住新文案，仍然钉住"有上限、别刷屏"的意图）
    '差不多每 1~2 轮就该有一张', '别刷屏', '每条只能一张，不能附带文字', '不要频繁拍',
    // 会话令牌是硬前置，漏传会被拒绝。
    '作为 token 参数传入',
    // 指定成员唤醒
    'triggers.speakerIds', '不凭记忆乱填',
  ]) assert.ok(prefix.includes(text), `missing rule: ${text}`);
});

console.log(`reserved2 persona prefix: ${prefix.length} characters (not a model-token estimate)`);
