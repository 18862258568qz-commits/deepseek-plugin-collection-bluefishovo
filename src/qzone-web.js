// QQ 空间 Web 接口客户端（NapCat 只提供 send_qzone_msg / delete_qzone_msg，
// 看别人说说、点赞、评论、留言板都要走 qzone 的 web CGI）。
//
// 关键坑（都是实测踩出来的，改之前先读完）：
//   1. cookie 必须用 NapCat get_cookies(domain=qzone.qq.com) 拿，里面有 p_skey；
//   2. g_tk 要用 **p_skey** 算（不是 skey），而且必须放在 **query** 上；
//      放 body 会被 TAPISIX 直接打回 500（comment/like/留言板都一样）；
//   3. 写接口返回不是纯 JSON：评论/留言板返回 JSON，点赞返回 JSONP（_Callback({...})），
//      统一先用 parseLoose 兜住；
//   4. 一定要带 Referer + Origin + 桌面 UA，否则空响应。
//
// 只做只读 + 有限写（点赞/评论/留言），限流与权限由 bridge 路由层控制。

import iconv from 'iconv-lite';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

function gtkOf(skey) {
  let h = 5381;
  for (const ch of String(skey ?? '')) {
    h += (h << 5) + ch.codePointAt(0);
    h &= 0xffffffff;
  }
  return h & 0x7fffffff;
}

/**
 * 表单编码：GBK 模式下把每个值先转成 GBK 字节再做 percent-encoding。
 * Qzone 的老 CGI（留言板 get_msgb/add_msgb）是 GBK 的，发 UTF-8 会把双字节汉字切坏。
 */
function encodeForm(form, useGbk) {
  const parts = [];
  for (const [k, v] of Object.entries(form)) {
    const key = encodeURIComponent(k);
    const raw = String(v ?? '');
    let val;
    if (useGbk) {
      const bytes = iconv.encode(raw, 'gbk');
      val = [...bytes].map((b) => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('');
    } else {
      val = encodeURIComponent(raw);
    }
    parts.push(`${key}=${val}`);
  }
  return parts.join('&');
}

/** JSONP / JSON / 带前后空白的脏响应 → 对象 */
function parseLoose(text) {
  const s = String(text ?? '').trim();
  if (!s) return { ok: false, error: '空响应' };
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1));
    } catch {}
  }
  return { ok: false, error: s.slice(0, 200) };
}

class QzoneWeb {
  /**
   * @param {{ httpUrl: string, timeoutMs?: number }} options
   *   httpUrl = NapCat 的 HTTP 根地址（如 http://127.0.0.1:3000）
   */
  constructor(options = {}) {
    this.httpUrl = String(options.httpUrl ?? '').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.cache = null; // { cookies, uin, gtk, at }
  }

  async cookies() {
    const now = Date.now();
    if (this.cache && now - this.cache.at < 10 * 60_000) return this.cache;
    const res = await fetch(`${this.httpUrl}/get_cookies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: 'qzone.qq.com' }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await res.json().catch(() => null);
    const cookieStr = data?.data?.cookies;
    if (!cookieStr) throw new Error('取不到 QQ 空间 cookie（NapCat 未登录或 get_cookies 失败）');
    const pSkey = /p_skey=([^;]+)/.exec(cookieStr)?.[1] ?? '';
    const skey = /(?:^|;\s*)skey=([^;]+)/.exec(cookieStr)?.[1] ?? pSkey;
    const uinRaw = /(?:^|;\s*)uin=o?(\d+)/.exec(cookieStr)?.[1] ?? '';
    this.cache = {
      cookies: cookieStr,
      gtk: gtkOf(skey),
      uin: Number(uinRaw) || 0,
      at: now,
    };
    return this.cache;
  }

  async raw(url, { method = 'GET', form = null, refererUin } = {}, { encoding = null } = {}) {
    const { cookies } = await this.cookies();
    const headers = {
      cookie: cookies,
      referer: `https://user.qzone.qq.com/${refererUin ?? ''}`,
      origin: 'https://user.qzone.qq.com',
      'user-agent': UA,
      accept: '*/*',
    };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      body = encodeForm(form, (encoding ?? this.encoding ?? 'utf8') === 'gbk');
    }
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(this.timeoutMs) });
    // 留言板系 CGI 连响应体都是 GBK：不按 GBK 解就会读出整串乱码
    const text =
      (encoding ?? this.encoding ?? 'utf8') === 'gbk'
        ? iconv.decode(Buffer.from(await res.arrayBuffer()), 'gbk')
        : await res.text();
    if (!res.ok) throw new Error(`QQ 空间接口 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`);
    return text;
  }

  /** 某人的说说列表（uin 省略 = 自己）。返回精简后的条目，方便模型直接读 */
  async listFeeds(uin, { num = 10, pos = 0 } = {}) {
    const me = await this.cookies();
    const target = Number(uin) || me.uin;
    const g = me.gtk;
    const url =
      `https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6` +
      `?uin=${target}&ftype=0&sort=0&pos=${pos}&num=${num}&replynum=0&g_tk=${g}` +
      `&callback=_preloadCallback&code_version=1&format=jsonp&need_private_comment=1`;
    const data = parseLoose(await this.raw(url, { refererUin: target }));
    if (data.code !== 0 && data.code != null) throw new Error(`取说说失败（code=${data.code}${data.message ? ` ${data.message}` : ''}）`);
    const feeds = (data.msglist ?? []).map((f) => ({
      tid: String(f.tid ?? ''),
      uin: Number(f.uin) || target,
      name: decodeEmoji(String(f.name ?? '')),
      content: decodeEmoji(String(f.content ?? '')).replace(/\[em\][^/]*\[\/em\]/g, '').trim(),
      time: f.created_time ? new Date(Number(f.created_time) * 1000).toISOString() : '',
      comments: Number(f.cmtnum ?? 0),
      likes: Number(f.likenum ?? f.like ?? 0) || undefined,
      secret: Number(f.secret ?? 0),
      // 图片/视频：有没有图、几张、地址都带上——她「看懂动态」的前提是有图可看
      images: extractPicUrls(f),
      videos: extractVideoUrls(f),
      repost: f.rt_con?.content ? decodeEmoji(String(f.rt_con.content)).slice(0, 300) : '',
    }));
    return {
      uin: target,
      total: Number(data.total ?? feeds.length),
      self: target === me.uin,
      nickname: decodeEmoji(String(data.logininfo?.name ?? '')),
      feeds,
    };
  }

  /** 单条说说详情（含评论） */
  async feedDetail(uin, tid) {
    const me = await this.cookies();
    const target = Number(uin) || me.uin;
    const url =
      `https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msgdetail_v6` +
      `?uin=${target}&tid=${encodeURIComponent(tid)}&not_trunc_con=1&hostuin=${me.uin}&g_tk=${me.gtk}` +
      `&callback=_preloadCallback&code_version=1&format=jsonp`;
    const data = parseLoose(await this.raw(url, { refererUin: target }));
    if (data.code !== 0 && data.code != null) throw new Error(`取说说详情失败（code=${data.code}）`);
    return {
      tid: String(data.tid ?? tid),
      uin: target,
      content: decodeEmoji(String(data.content ?? '')),
      images: extractPicUrls(data),
      videos: extractVideoUrls(data),
      repost: data.rt_con?.content ? decodeEmoji(String(data.rt_con.content)).slice(0, 300) : '',
      time: data.created_time ? new Date(Number(data.created_time) * 1000).toISOString() : '',
      comments: Number(data.cmtnum ?? 0),
      commentList: (data.commentlist ?? []).map((c) => ({
        name: decodeEmoji(String(c.name ?? '')),
        content: decodeEmoji(String(c.content ?? '')),
        time: c.createTime ?? '',
      })),
    };
  }

  /** 给某条说说点赞 */
  async likeFeed(uin, tid) {
    const me = await this.cookies();
    const target = Number(uin) || me.uin;
    const unikey = `http://user.qzone.qq.com/${target}/mood/${tid}`;
    const url =
      `https://user.qzone.qq.com/proxy/domain/w.qzone.qq.com/cgi-bin/likes/internal_dolike_app?g_tk=${me.gtk}`;
    const data = parseLoose(
      await this.raw(url, {
        method: 'POST',
        refererUin: target,
        form: {
          qzreferrer: `https://user.qzone.qq.com/${target}`,
          opuin: me.uin,
          unikey,
          curkey: unikey,
          appid: 311,
          from: 1,
          iflike: 0,
          fupdate: 1,
          face: 1,
          need_private_comment: 1,
        },
      })
    );
    if (data.code !== 0 && data.code != null) throw new Error(`点赞失败（code=${data.code}${data.message ? ` ${data.message}` : ''}）`);
    return { uin: target, tid, liked: true };
  }

  /** 评论某条说说 */
  async commentFeed(uin, tid, content) {
    const me = await this.cookies();
    const target = Number(uin) || me.uin;
    const url =
      `https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_re_feeds?g_tk=${me.gtk}`;
    const data = parseLoose(
      await this.raw(url, {
        method: 'POST',
        refererUin: target,
        form: {
          topicId: `${target}_${tid}__1`,
          feedsType: 0,
          content,
          uin: me.uin,
          hostUin: target,
          format: 'json',
          plat: 'qzone',
          source: 'ic',
        },
      })
    );
    if (data.code !== 0 && data.code != null) throw new Error(`评论失败（code=${data.code}${data.message ? ` ${data.message}` : ''}）`);
    return { uin: target, tid, comment: content };
  }

  /** 读某人留言板（含回复），留言板 CGI 是 GBK 的，读写都要按 GBK 走 */
  async listBoardMessages(uin, { num = 10, start = 0 } = {}) {
    const me = await this.cookies();
    const target = Number(uin) || me.uin;
    const url =
      `https://user.qzone.qq.com/proxy/domain/m.qzone.qq.com/cgi-bin/new/get_msgb` +
      `?uin=${me.uin}&hostUin=${target}&start=${start}&num=${num}&g_tk=${me.gtk}&format=json`;
    const data = parseLoose(await this.raw(url, { refererUin: target }, { encoding: 'gbk' }));
    if (data.code !== 0 && data.code != null) throw new Error(`读留言板失败（code=${data.code}）`);
    const list = data?.data?.commentList ?? [];
    return {
      uin: target,
      total: Number(data?.data?.total ?? list.length),
      messages: list.map((c) => ({
        id: String(c.id ?? ''),
        uin: Number(c.uin) || 0,
        name: decodeEmoji(String(c.nickname ?? c.name ?? '')),
        content: String(c.ubbContent ?? c.htmlContent ?? '').trim(),
        time: String(c.pubtime ?? ''),
        replies: (c.replyList ?? []).map((r) => ({
          name: decodeEmoji(String(r.nickname ?? r.name ?? '')),
          content: String(r.ubbContent ?? r.content ?? '').trim(),
          time: String(r.pubtime ?? r.time ?? ''),
        })),
      })),
    };
  }

  /** 给某人留言板留言 */
  async postBoardMessage(uin, content) {
    const me = await this.cookies();
    const target = Number(uin) || me.uin;
    const url = `https://user.qzone.qq.com/proxy/domain/m.qzone.qq.com/cgi-bin/new/add_msgb?g_tk=${me.gtk}`;
    // 留言板 CGI 是 GBK 系：表单必须按 GBK 编码，否则中文会被半个字地切坏（实测「干饭」→「干��」）
    const data = parseLoose(
      await this.raw(
        url,
        {
          method: 'POST',
          refererUin: target,
          form: { uin: me.uin, hostUin: target, content, format: 'json', plat: 'qzone', source: 'ic' },
        },
        { encoding: 'gbk' }
      )
    );
    if (data.code !== 0 && data.code != null) throw new Error(`留言失败（code=${data.code}${data.message ? ` ${data.message}` : ''}）`);
    return { uin: target, messageId: data?.data?.msgid ?? null };
  }
}

/**
 * 说说里的图片：msglist 用 pic 数组（每项 {url1,url2,url3,is_video,...}），
 * 老接口偶尔给 picurl。全部收成可直接下载的地址；/m/ 前缀的是小图，换成原图更清楚。
 */
function extractPicUrls(feed) {
  const out = [];
  const push = (u) => {
    let url = String(u ?? '').trim();
    if (!url) return;
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('http://')) url = url.replace('http://', 'https://');
    // /m/ 是缩略图，原图去掉这段前缀
    const big = url.replace('/m/', '/');
    if (!out.includes(big)) out.push(big);
  };
  const pics = Array.isArray(feed?.pic) ? feed.pic : [];
  for (const p of pics) {
    if (p?.is_video) continue;
    push(p?.url3 || p?.url2 || p?.url1);
  }
  if (typeof feed?.picurl === 'string') push(feed.picurl);
  return out.slice(0, 9);
}

/** 说说里的视频（只给地址和封面，不下视频本体） */
function extractVideoUrls(feed) {
  const out = [];
  const pics = Array.isArray(feed?.pic) ? feed.pic : [];
  for (const p of pics) {
    if (!p?.is_video) continue;
    const url = String(p?.url3 || p?.url2 || p?.url1 || '').trim();
    if (url) out.push(url.startsWith('http') ? url : `https:${url.replace(/^\/\//, '//')}`);
  }
  return out.slice(0, 3);
}

/**
 * QQ 空间的 emoji 是 `[em]e328051[/em]` 这种私有编码（前 4 位是 Unicode 私用区码位、后 3 位是图序），
 * 直接解成字符会给模型看一堆私用区乱码，所以整体去掉；顺带还原被转义的斜杠。
 */
function decodeEmoji(s) {
  return String(s ?? '')
    .replace(/\[em\][^[]*\[\/em\]/g, '')
    .replace(/\\\//g, '/')
    .trim();
}

export { QzoneWeb, gtkOf, parseLoose };
