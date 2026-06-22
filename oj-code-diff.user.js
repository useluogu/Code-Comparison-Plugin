// ==UserScript==
// @name         OJ 代码对比 (Luogu/AtCoder/Codeforces)
// @namespace    oj-code-diff
// @version      2.2.0
// @description  洛谷/Codeforces 提交记录代码对比，AtCoder 手动输入对比。支持并列视图、折叠未变更行、复制代码
// @author       useluogu
// @homepageURL  https://github.com/useluogu/Code-Comparison-Plugin
// @updateURL    https://raw.githubusercontent.com/useluogu/Code-Comparison-Plugin/main/oj-code-diff.user.js
// @downloadURL  https://raw.githubusercontent.com/useluogu/Code-Comparison-Plugin/main/oj-code-diff.user.js
// @match        https://www.luogu.com.cn/*
// @match        https://atcoder.jp/contests/*
// @match        https://codeforces.com/*/submission/*
// @match        https://codeforces.com/contest/*
// @match        https://codeforces.com/problemset/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      atcoder.jp
// @connect      codeforces.com
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const _unsafeWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  // ======================== 平台检测 ========================

  const PLATFORMS = {
    LUOGU:   { id: 'luogu',   name: '洛谷',   base: 'https://www.luogu.com.cn' },
    ATCODER: { id: 'atcoder', name: 'AtCoder', base: 'https://atcoder.jp' },
    CF:      { id: 'cf',      name: 'Codeforces', base: 'https://codeforces.com' },
  };

  /** 检测当前平台 */
  function detectPlatform() {
    const h = window.location.hostname;
    if (h === 'www.luogu.com.cn') return PLATFORMS.LUOGU;
    if (h === 'atcoder.jp') return PLATFORMS.ATCODER;
    if (h.endsWith('codeforces.com')) return PLATFORMS.CF;
    return null;
  }

  const CURRENT_PLATFORM = detectPlatform();

  // ======================== 常量配置 ========================
  const COLORS = {
    light: {
      addedBg: '#e6ffed', addedLineNum: '#22863a', addedText: '#24292e',
      removedBg: '#ffeef0', removedLineNum: '#cb2431', removedText: '#24292e',
      unchangedBg: '#ffffff', unchangedText: '#24292e',
      lineNumText: '#959da5', lineNumBg: '#f6f8fa', border: '#e1e4e8',
      modalBg: '#ffffff', overlayBg: 'rgba(0, 0, 0, 0.5)',
      textPrimary: '#24292e', textSecondary: '#586069', bgSecondary: '#f6f8fa',
      inputBg: '#ffffff', inputBorder: '#e1e4e8',
      btnSecBorder: '#d1d5da', btnSecColor: '#586069', btnSecHover: '#f3f4f6',
      sliderTrack: '#d1d5da',
    },
    dark: {
      addedBg: '#1b3a1f', addedLineNum: '#3fb950', addedText: '#e6edf3',
      removedBg: '#3d1a1a', removedLineNum: '#f85149', removedText: '#e6edf3',
      unchangedBg: '#0d1117', unchangedText: '#e6edf3',
      lineNumText: '#484f58', lineNumBg: '#161b22', border: '#30363d',
      modalBg: '#161b22', overlayBg: 'rgba(0, 0, 0, 0.7)',
      textPrimary: '#e6edf3', textSecondary: '#8b949e', bgSecondary: '#0d1117',
      inputBg: '#0d1117', inputBorder: '#30363d',
      btnSecBorder: '#30363d', btnSecColor: '#8b949e', btnSecHover: '#21262d',
      sliderTrack: '#30363d',
    },
  };

  // ======================== 模态框导航堆栈 ========================

  const modalStack = [];

  function pushAndHide(el) {
    if (!el) return;
    el.style.display = 'none';
    modalStack.push(el);
  }

  function popAndRestore() {
    if (modalStack.length === 0) return false;
    const prev = modalStack.pop();
    prev.style.display = '';
    const codeArea = prev.querySelector('.oj-diff-code');
    if (codeArea) codeArea.focus();
    return true;
  }

  // ======================== 用户设置 ========================
  const SETTINGS_KEY = 'oj-diff-settings';
  const DEFAULT_SETTINGS = {
    fontSize: 13,
    lineHeight: 1.5,
    tabSize: 4,
    themeMode: 'auto',
    collapseUnchanged: true,
    viewMode: 'unified', // 'unified' | 'split'
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      console.warn('[OJ代码对比] 读取设置失败:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('[OJ代码对比] 保存设置失败:', e);
    }
  }

  function applyCodeSettings(codeEl, settings) {
    if (!codeEl) return;
    const fs = settings.fontSize;
    const lhPx = (fs * settings.lineHeight).toFixed(1) + 'px';
    codeEl.style.fontSize = fs + 'px';
    codeEl.style.lineHeight = lhPx;
    codeEl.style.tabSize = String(settings.tabSize);
    codeEl.style.MozTabSize = String(settings.tabSize);
    const lnFs = Math.max(fs - 1, 9) + 'px';
    codeEl.querySelectorAll('.oj-diff-ln-old, .oj-diff-ln-new').forEach(el => {
      el.style.fontSize = lnFs;
      el.style.lineHeight = lhPx;
    });
  }

  // ======================== 主题 ========================

  function isDarkMode(themeMode) {
    const mode = themeMode || loadSettings().themeMode;
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    // auto：跟随各平台或系统
    if (CURRENT_PLATFORM && CURRENT_PLATFORM.id === 'luogu') {
      return (
        document.documentElement.getAttribute('data-theme') === 'dark' ||
        document.body?.getAttribute('data-theme') === 'dark' ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getColors(dark) {
    return dark ? COLORS.dark : COLORS.light;
  }

  // ======================== 工具函数 ========================

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 让浮动按钮可拖动（mousedown → mousemove 拖动，>5px 视为拖动不触发点击） */
  function makeDraggable(btn) {
    let dragging = false, dragStartX, dragStartY, startLeft, startTop;
    let useTop = false;

    btn.addEventListener('mousedown', (e) => {
      dragging = false;
      const rect = btn.getBoundingClientRect();
      dragStartX = e.clientX; dragStartY = e.clientY;
      startLeft = rect.left; startTop = rect.top;

      if (!useTop) {
        btn.style.bottom = '';
        btn.style.right = '';
        btn.style.width = btn.offsetWidth + 'px'; // 固定宽度，防止切换定位后拉伸
        btn.style.top = rect.top + 'px';
        btn.style.left = rect.left + 'px';
        useTop = true;
      }
      btn.style.cursor = 'grabbing';
      btn.style.transition = 'none';
      const bw = btn.offsetWidth, bh = btn.offsetHeight;

      const onMove = (ev) => {
        const dx = ev.clientX - dragStartX, dy = ev.clientY - dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) dragging = true;
        btn.style.left = Math.max(0, Math.min(startLeft + dx, window.innerWidth - bw)) + 'px';
        btn.style.top  = Math.max(0, Math.min(startTop  + dy, window.innerHeight - bh)) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        btn.style.cursor = 'pointer';
        btn.style.transition = 'all 0.2s ease';
        // 拖动后阻止 click 事件弹出菜单
        if (dragging) {
          const noClick = (ce) => { ce.stopImmediatePropagation(); btn.removeEventListener('click', noClick, true); };
          btn.addEventListener('click', noClick, true);
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }


  /**
   * GM_xmlhttpRequest 封装（用于跨域请求）
   * 同源请求优先用 fetch（支持 cookies），跨域回退到 GM_xmlhttpRequest
   */
  function gmFetch(url, options) {
    options = options || {};
    // 判断是否同源
    let isSameOrigin;
    try {
      const urlObj = new URL(url, location.href);
      isSameOrigin = urlObj.origin === location.origin;
    } catch (e) {
      isSameOrigin = false;
    }

    if (isSameOrigin && typeof fetch !== 'undefined') {
      // 同源请求使用原生 fetch（自动带 cookies）
      const headers = options.headers || {};
      headers.Accept = headers.Accept || 'text/html,application/json,*/*';
      return fetch(url, { method: options.method || 'GET', headers, credentials: 'same-origin' })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
          return r.text();
        });
    }

    // 跨域请求：使用 GM_xmlhttpRequest
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'undefined') {
        reject(new Error('GM_xmlhttpRequest 不可用（请确保脚本有 @grant GM_xmlhttpRequest）'));
        return;
      }
      GM_xmlhttpRequest({
        method: options.method || 'GET',
        url: url,
        headers: options.headers || {},
        onload: (response) => {
          resolve(response.responseText);
        },
        onerror: (error) => {
          reject(new Error(`GM_xmlhttpRequest 失败: ${error.message || '未知错误'}`));
        },
        ontimeout: () => {
          reject(new Error('GM_xmlhttpRequest 请求超时'));
        },
      });
    });
  }

  /**
   * 解析 HTML 字符串为 DOM Document（用于从页面中提取数据）
   */
  function parseHtml(htmlStr) {
    const parser = new DOMParser();
    return parser.parseFromString(htmlStr, 'text/html');
  }

  // ======================== 各平台 Adapter ========================

  // ---------- Luogu Adapter ----------
  const LuoguAdapter = {
    platform: PLATFORMS.LUOGU,

    /** 从 URL 中提取记录 ID */
    getRecordIdFromUrl() {
      const match = window.location.pathname.match(/\/record\/(\d+)/);
      return match ? match[1] : null;
    },

    isRecordPage() {
      return /^\/record\/\d+/.test(window.location.pathname);
    },

    async fetchRecordDetail(recordId) {
      const base = this.platform.base;
      const url = `${base}/record/${recordId}`;
      const sep = url.includes('?') ? '&' : '?';
      const jsonUrl = `${url}${sep}_contentOnly=1`;
      const text = await gmFetch(jsonUrl, {
        headers: { Accept: 'application/json' }
      });
      const response = JSON.parse(text);
      if (response.code !== undefined && response.code !== 200)
        throw new Error(`洛谷返回错误码: ${response.code}`);
      const data = response.currentData || response.data || response.record || response;
      // 验证返回的记录 ID 是否与请求一致（防止 Luogu 缓存/重定向导致返回错误记录）
      if (data.record && String(data.record.id) !== String(recordId)) {
        console.warn(`[Luogu] 返回记录 ID(${data.record.id}) 与请求 ID(${recordId}) 不一致，重新获取`);
        // 强制再请求一次
        const text2 = await gmFetch(jsonUrl + '&_t=' + Date.now(), {
          headers: { Accept: 'application/json' }
        });
        const response2 = JSON.parse(text2);
        const data2 = response2.currentData || response2.data || response2.record || response2;
        if (data2.record && String(data2.record.id) === String(recordId)) {
          return data2.record;
        }
        throw new Error(`洛谷 API 返回了提交 #${data.record?.id}（而非 #${recordId}），可能因缓存导致`);
      }
      if (!data.record) throw new Error('无法获取记录信息（response 中缺少 record 字段）');
      return data.record;
    },

    async fetchRecordList(params) {
      const base = this.platform.base;
      const query = new URLSearchParams();
      if (params.pid)  query.set('pid',  params.pid);
      if (params.user) query.set('user', params.user);
      if (params.page) query.set('page', String(params.page));
      query.set('_contentOnly', '1');
      const url = `${base}/record/list?${query.toString()}`;
      const text = await gmFetch(url, {
        headers: { Accept: 'application/json' }
      });
      const response = JSON.parse(text);
      const data = response.currentData || response.data || response;
      let records = data.records;
      if (!records) return [];
      if (Array.isArray(records)) return records;
      if (records.result)  return records.result;
      if (records.records) return records.records;
      if (records.values)  return records.values;
      if (records.data)    return records.data;
      return [];
    },

    async findPrevRecord(currentRecordId, currentRecord) {
      // 从当前记录对象提取题目 ID 和用户 ID
      const pid = this.getProblemId(currentRecord);
      const uid = this.getUserId(currentRecord);
      if (!pid || !uid) throw new Error('无法获取当前提交的题目/用户信息');
      for (let page = 1; page <= 5; page++) {
        const records = await this.fetchRecordList({ pid, user: String(uid), page });
        if (!records || records.length === 0) break;

        // 在当前页找当前记录
        const idx = records.findIndex(r => String(r.id) === String(currentRecordId));
        if (idx !== -1) {
          // 当前页找到——取后一个（更旧的）
          if (idx + 1 < records.length) return records[idx + 1];
          // 当前记录是此页最后一个，继续下一页
          continue;
        }
      }
      throw new Error('未找到该题目的上一次提交记录（当前记录可能是最新的一次，或已超出翻页范围）');
    },

    /** 获取当前页面已有的 record 数据（避免重复请求） */
    getPageData() {
      return _unsafeWindow._feInjection?.currentData?.record || null;
    },

    /** 构建记录 URL */
    recordUrl(recordId) {
      return `${this.platform.base}/record/${recordId}`;
    },

    /** 从 record 对象提取 sourceCode */
    getSourceCode(record) {
      return record.sourceCode ?? '';
    },

    /** 从 record 对象提取 problem ID */
    getProblemId(record) {
      const p = record.problem;
      return p?.pid || p?.id || p?.problemId || (typeof p === 'string' ? p : null);
    },

    /** 从 record 对象提取 user ID */
    getUserId(record) {
      return record.user?.uid || record.uid || null;
    },
  };

  // ---------- AtCoder Adapter（精简版：仅支持手动输入代码对比） ----------
  const AtCoderAdapter = {
    platform: PLATFORMS.ATCODER,

    getRecordIdFromUrl() {
      const m = window.location.pathname.match(/\/submissions\/(\d+)/);
      return m ? m[1] : null;
    },

    isRecordPage() {
      return /\/submissions\/\d+/.test(window.location.pathname);
    },

    /** 仅读取当前页 DOM 中的代码；非当前页抛错 */
    async fetchRecordDetail(submissionId) {
      const curId = this.getRecordIdFromUrl();
      if (curId && String(curId) === String(submissionId)) {
        const el = document.getElementById('program-source-text');
        if (el) return { sourceCode: el.textContent || '', id: submissionId };
      }
      throw new Error('AtCoder 仅支持对当前页提交操作，请使用"✏️两份代码对比"手动输入');
    },

    findPrevRecord() {
      throw new Error('AtCoder 暂不支持此功能，请使用"✏️两份代码对比"手动输入');
    },

    getPageData() {
      const el = document.getElementById('program-source-text');
      return el ? { sourceCode: el.textContent || '', id: this.getRecordIdFromUrl() } : null;
    },

    recordUrl(submissionId) {
      const slug = (window.location.pathname.match(/\/contests\/([^/]+)/) || [])[1] || '';
      return slug ? `https://atcoder.jp/contests/${slug}/submissions/${submissionId}` : '#';
    },

    getSourceCode(record)       { return record.sourceCode ?? ''; },
    getProblemId(record)        { return record.problemId || null; },
    getUserId(record)           { return record.userId || null; },
  };


  // ---------- Codeforces Adapter ----------
  const CfAdapter = {
    platform: PLATFORMS.CF,

    /** 从 URL 提取 submission ID */
    getRecordIdFromUrl() {
      // /contest/12345/submission/67890 or /submission/67890
      const match = window.location.pathname.match(/\/(?:submission|submissions)\/(\d+)/);
      return match ? match[1] : null;
    },

    isRecordPage() {
      return /\/(?:submission|submissions)\/\d+/.test(window.location.pathname);
    },

    /**
     * 获取提交详情。
     *
     * 流程：
     *   1. 优先用 hint.contestId（findPrevRecord 已知）构建 URL；
     *      否则用 CF API 查该 submissionId 的 contestId，再构建 URL。
     *      这样保证每次都请求正确的页面，不依赖当前浏览器 URL。
     *   2. 拿到 HTML 后从 DOM 提取 sourceCode、handle、problemIndex。
     *
     * 返回 { sourceCode, contestId, problemIndex, handle, id }
     */
    async fetchRecordDetail(submissionId, hint) {
      // --- 第一步：确定正确的 contestId，再构建 URL ---
      let contestId = hint?.contestId || '';
      let handle = '';
      let problemIndex = '';

      if (!contestId) {
        // 用当前登录用户 handle 调 API，找到该 submissionId 的 contestId
        const cfHandle = _unsafeWindow.CF?.currentUserHandle ||
                         document.querySelector('a.rated-user, a[href*="/profile/"]')?.textContent?.trim() ||
                         '';
        if (cfHandle) {
          try {
            const apiUrl = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(cfHandle)}&from=1&count=500`;
            const apiText = await gmFetch(apiUrl);
            const apiData = JSON.parse(apiText);
            if (apiData.status === 'OK') {
              const sub = apiData.result.find(s => s.id === Number(submissionId));
              if (sub) {
                contestId    = String(sub.contestId || '');
                problemIndex = sub.problem.index || '';
                handle       = sub.author.members[0]?.handle || cfHandle;
              }
            }
          } catch (e) {
            console.warn('[CF] API 查 contestId 失败，将用无 contest 路径:', e);
          }
        }
        // 如果 API 没命中，只有当 submissionId 就是当前页的提交时才用当前页 URL 里的 contestId
        if (!contestId) {
          const curPageSubId = window.location.pathname.match(/\/submission\/(\d+)/)?.[1];
          if (curPageSubId && curPageSubId === String(submissionId)) {
            contestId = window.location.pathname.match(/\/contest\/(\d+)/)?.[1] || '';
          }
          // 否则不 fallback，用无 contest 路径（/submission/id）
        }
      }

      // --- 第二步：用准确的 contestId 拉页面 ---
      const pageUrl = this.buildSubmissionUrl(submissionId, contestId);
      const html = await gmFetch(pageUrl);
      const doc = parseHtml(html);

      // 提取源代码
      const sourceEl = doc.getElementById('program-source-text');
      if (!sourceEl) throw new Error(`CF 提交 #${submissionId} 的代码不可见（可能需要登录或不是自己的提交）`);
      const sourceCode = sourceEl.textContent || '';
      if (!sourceCode.trim()) throw new Error(`CF 提交 #${submissionId} 的代码为空（可能被折叠或需要登录查看）`);

      // --- 第三步：从页面 DOM 补全仍缺的 handle / problemIndex ---
      if (!handle) {
        const ratedLinks = doc.querySelectorAll('a[href*="/profile/"]');
        for (const link of ratedLinks) {
          const t = link.textContent.trim();
          if (t && !t.includes(' ')) { handle = t; break; }
        }
      }
      if (!problemIndex) {
        const titleEl = doc.querySelector('title');
        if (titleEl) {
          const m = titleEl.textContent.match(/Problem\s+([A-Z]\d*)/i);
          if (m) problemIndex = m[1].toUpperCase();
        }
      }
      if (!problemIndex) {
        const subInfoRows = doc.querySelectorAll('.info-table tr, table.table tr');
        for (const row of subInfoRows) {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2 && cells[0].textContent.trim().toLowerCase().includes('problem')) {
            const link = cells[1].querySelector('a');
            if (link) {
              const m = (link.textContent || link.href).match(/\/([A-Z]\d*)(?:[/?#]|$)/i);
              if (m) { problemIndex = m[1].toUpperCase(); break; }
            }
          }
        }
      }

      return { sourceCode, contestId, problemIndex, handle, id: submissionId };
    },

    /**
     * 构建 submission 详情页 URL。
     * 必须传入 contestId 才能访问正确页面；无 contestId 时用无 contest 路径（可能 404）。
     */
    buildSubmissionUrl(submissionId, contestId) {
      if (contestId) {
        return `https://codeforces.com/contest/${contestId}/submission/${submissionId}`;
      }
      return `https://codeforces.com/submission/${submissionId}`;
    },

    /**
     * 通过 CF API 查找同一人、同一题的上一次提交。
     */
    async findPrevRecord(submissionId, currentRecord) {
      const handle = currentRecord.handle;
      if (!handle) throw new Error('无法获取提交者 handle（请确认已登录 CF 且本提交为自己的）');

      // 检查提交者是否为当前登录用户（避免拿别人的提交来找"上一次提交"）
      const loggedInHandle = _unsafeWindow.CF?.currentUserHandle ||
                             document.querySelector('a.rated-user, a[href*="/profile/"]')?.textContent?.trim() || '';
      if (loggedInHandle && loggedInHandle !== handle) {
        throw new Error(`此提交属于 ${handle}，不是你本人的提交，无法查找上一次提交`);
      }

      const curContestId  = Number(currentRecord.contestId);
      const curProblemIdx = currentRecord.problemIndex;
      if (!curContestId || !curProblemIdx) {
        throw new Error('无法识别当前提交的题目信息，无法查找上一次提交');
      }

      // 分页搜索：最多 2 页（每页 1000 条），覆盖约 2000 条提交记录
      const PAGE_SIZE = 1000;
      const MAX_PAGES = 2;

      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE + 1;
        const apiUrl = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=${from}&count=${PAGE_SIZE}`;
        const apiText = await gmFetch(apiUrl);
        const apiData = JSON.parse(apiText);
        if (apiData.status !== 'OK') throw new Error(`CF API 错误: ${apiData.comment}`);

        const subs = apiData.result; // 按提交时间倒序

        // 只在第 1 页查找当前提交的位置
        const currentIdx = page === 0
          ? subs.findIndex(s => s.id === Number(submissionId))
          : -1;

        // 从当前提交往后（更早的提交）找同一题
        const start = currentIdx >= 0 ? currentIdx + 1 : 0;
        for (let i = start; i < subs.length; i++) {
          const s = subs[i];
          if (s.problem.contestId === curContestId && s.problem.index === curProblemIdx) {
            return { id: String(s.id), contestId: String(s.contestId || curContestId) };
          }
        }

        // 当前提交不在本页末尾 → 已全量搜索，无需下一页
        if (currentIdx >= 0 && currentIdx + 1 < subs.length) break;
        // 当前提交未找到且本页未满 → 后面不会有更旧的了
        if (currentIdx < 0 && subs.length < PAGE_SIZE) break;
      }

      throw new Error(`未找到 ${handle} 对题目 ${curContestId}${curProblemIdx} 的上一次提交`);
    },

    getPageData() {
      // CF 无注入数据
      return null;
    },

    recordUrl(submissionId, record) {
      // 如果有 record 对象，用其中的 contestId 构建精确 URL
      const cid = record?.contestId;
      return this.buildSubmissionUrl(submissionId, cid);
    },

    getSourceCode(record) {
      return record.sourceCode ?? '';
    },

    getProblemId(record) {
      if (record.contestId && record.problemIndex) {
        return `${record.contestId}${record.problemIndex}`;
      }
      return null;
    },

    getUserId(record) {
      return record.handle || null;
    },
  };

  // 根据 URL 选择 adapter
  function getAdapter(platform) {
    platform = platform || CURRENT_PLATFORM;
    if (platform && platform.id === 'luogu')   return LuoguAdapter;
    if (platform && platform.id === 'atcoder') return AtCoderAdapter;
    if (platform && platform.id === 'cf')      return CfAdapter;
    return LuoguAdapter; // default
  }

  const ADAPTER = getAdapter();

  // ======================== Diff 算法 ========================

  function lineDiff(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;

    if (m * n > 9000000) {
      console.warn('[OJ代码对比] 文件过大，使用简化 diff');
      return [
        ...oldLines.map(c => ({ type: 'removed', content: c })),
        ...newLines.map(c => ({ type: 'added', content: c })),
      ];
    }

    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = oldLines[i - 1] === newLines[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    let i = m, j = n;
    const raw = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        raw.push({ type: 'unchanged', content: oldLines[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        raw.push({ type: 'added', content: newLines[j - 1] });
        j--;
      } else {
        raw.push({ type: 'removed', content: oldLines[i - 1] });
        i--;
      }
    }
    raw.reverse();

    // 合并连续 removed+added 对
    const merged = [];
    let k = 0;
    while (k < raw.length) {
      if (
        raw[k].type === 'removed' &&
        k + 1 < raw.length &&
        raw[k + 1].type === 'added'
      ) {
        const rg = [], ag = [];
        while (k < raw.length &&
          (raw[k].type === 'removed' || (raw[k].type === 'added' && rg.length > 0))) {
          if (raw[k].type === 'removed') rg.push(raw[k]);
          else ag.push(raw[k]);
          k++;
        }
        for (const x of rg) merged.push({ ...x, pairedWithAdd: true });
        for (const x of ag) merged.push({ ...x, pairedWithRemove: true });
      } else {
        merged.push(raw[k++]);
      }
    }
    return merged;
  }

  function collapseUnchanged(diffs) {
    const n = diffs.length;

    const oldNums = new Int32Array(n);
    const newNums = new Int32Array(n);
    let oldNum = 0, newNum = 0;
    for (let i = 0; i < n; i++) {
      if (diffs[i].type === 'removed') { oldNum++; newNums[i] = 0; oldNums[i] = oldNum; }
      else if (diffs[i].type === 'added') { newNum++; oldNums[i] = 0; newNums[i] = newNum; }
      else { oldNum++; newNum++; oldNums[i] = oldNum; newNums[i] = newNum; }
    }

    const result = [];
    let i = 0;
    while (i < n) {
      if (diffs[i].type !== 'unchanged') {
        result.push(diffs[i]);
        i++;
      } else {
        let start = i;
        while (i < n && diffs[i].type === 'unchanged') i++;
        const count = i - start;
        result.push({
          type: 'collapsed',
          count: count,
          oldStart: oldNums[start],
          oldEnd: oldNums[i - 1],
          newStart: newNums[start],
          newEnd: newNums[i - 1],
        });
      }
    }
    return result;
  }

  // ======================== 代码 HTML 构建 ========================

  function buildCodeHtml(diffs, showFoldIcons) {
    const blockInfo = new Map();
    if (showFoldIcons) {
      let runStart = -1, runLen = 0;
      for (let i = 0; i <= diffs.length; i++) {
        if (i < diffs.length && diffs[i].type === 'unchanged') {
          if (runLen === 0) runStart = i;
          runLen++;
        } else {
          if (runLen >= 1) {
            for (let j = runStart; j < runStart + runLen; j++) {
              blockInfo.set(j, { blockStart: runStart, blockCount: runLen });
            }
          }
          runLen = 0;
          runStart = -1;
        }
      }
    }

    let html = '';
    let oldLineNum = 0;
    let newLineNum = 0;

    for (let di = 0; di < diffs.length; di++) {
      const diff = diffs[di];
      if (diff.type === 'collapsed') {
        const hasLineInfo = diff.oldStart != null && diff.oldEnd != null;
        const oldRange = hasLineInfo
          ? (diff.oldStart === diff.oldEnd ? String(diff.oldStart) : diff.oldStart + '-' + diff.oldEnd)
          : '';
        const newRange = hasLineInfo
          ? (diff.newStart === diff.newEnd ? String(diff.newStart) : diff.newStart + '-' + diff.newEnd)
          : '';
        html +=
          '<div class="oj-diff-line oj-diff-collapsed" data-count="' + diff.count + '">' +
          '<span class="oj-diff-fold-icon-placeholder"></span>' +
          '<span class="oj-diff-ln-old' + (hasLineInfo ? ' oj-diff-ln-collapsed' : '') + '">' + oldRange + '</span>' +
          '<span class="oj-diff-ln-new' + (hasLineInfo ? ' oj-diff-ln-collapsed' : '') + '">' + newRange + '</span>' +
          '<span class="oj-diff-marker oj-diff-marker-empty"></span>' +
          '<span class="oj-diff-collapsed-btn" title="点击展开">⋯ ' + diff.count + ' 行相同代码' + (hasLineInfo && diff.oldStart !== diff.oldEnd ? '（' + diff.oldStart + '–' + diff.oldEnd + ' 行）' : '') + ' ⋯</span>' +
          '</div>';
        if (hasLineInfo) {
          oldLineNum = diff.oldEnd;
          newLineNum = diff.newEnd;
        } else {
          oldLineNum += diff.count;
          newLineNum += diff.count;
        }
        continue;
      }
      if (diff.type === 'unchanged') {
        oldLineNum++; newLineNum++;
        const info = blockInfo.get(di);
        const foldIcon = info
          ? '<span class="oj-diff-fold-icon" data-fold-start="' + info.blockStart + '" data-fold-count="' + info.blockCount + '" title="折叠 ' + info.blockCount + ' 行相同代码">⌃</span>'
          : '<span class="oj-diff-fold-icon-placeholder"></span>';
        html +=
          '<div class="oj-diff-line oj-diff-unchanged' + (info ? ' oj-diff-unchanged-foldable' : '') + '">' +
          foldIcon +
          '<span class="oj-diff-ln-old">' + oldLineNum + '</span>' +
          '<span class="oj-diff-ln-new">' + newLineNum + '</span>' +
          '<span class="oj-diff-marker oj-diff-marker-empty"></span>' +
          '<span class="oj-diff-content">' + escapeHtml(diff.content) + '</span>' +
          '</div>';
      } else if (diff.type === 'removed') {
        oldLineNum++;
        html +=
          '<div class="oj-diff-line oj-diff-removed">' +
          '<span class="oj-diff-fold-icon-placeholder"></span>' +
          '<span class="oj-diff-ln-old">' + oldLineNum + '</span>' +
          '<span class="oj-diff-ln-new"></span>' +
          '<span class="oj-diff-marker">-</span>' +
          '<span class="oj-diff-content">' + escapeHtml(diff.content) + '</span>' +
          '</div>';
      } else if (diff.type === 'added') {
        newLineNum++;
        html +=
          '<div class="oj-diff-line oj-diff-added">' +
          '<span class="oj-diff-fold-icon-placeholder"></span>' +
          '<span class="oj-diff-ln-old"></span>' +
          '<span class="oj-diff-ln-new">' + newLineNum + '</span>' +
          '<span class="oj-diff-marker">+</span>' +
          '<span class="oj-diff-content">' + escapeHtml(diff.content) + '</span>' +
          '</div>';
      }
    }
    return html;
  }

  // ======================== 并列视图 HTML 构建 ========================

  /**
   * 将 rawDiffs 转为并列（side-by-side）视图的 HTML。
   * 左侧显示旧代码（removed + unchanged），右侧显示新代码（added + unchanged）。
   * removed/added 行对齐：连续的 removed/added 块按行数对齐，短的一侧用空占位行补齐。
   */
  function buildSplitHtml(diffs) {
    // 先将 diffs 展开为对齐的行对 [{left, right}]
    // left/right: null（空占位）或 {type, content, lineNum}
    const pairs = [];
    let oldNum = 0, newNum = 0;
    let i = 0;
    while (i < diffs.length) {
      const d = diffs[i];
      if (d.type === 'collapsed') {
        pairs.push({ type: 'collapsed', data: d });
        if (d.oldEnd != null) { oldNum = d.oldEnd; newNum = d.newEnd; }
        else { oldNum += d.count; newNum += d.count; }
        i++;
      } else if (d.type === 'unchanged') {
        oldNum++; newNum++;
        pairs.push({ type: 'row', left: { type: 'unchanged', content: d.content, lineNum: oldNum }, right: { type: 'unchanged', content: d.content, lineNum: newNum } });
        i++;
      } else if (d.type === 'removed' || d.type === 'added') {
        // 收集连续的 removed / added 块，成对对齐
        const removedGroup = [], addedGroup = [];
        while (i < diffs.length && (diffs[i].type === 'removed' || diffs[i].type === 'added')) {
          if (diffs[i].type === 'removed') removedGroup.push(diffs[i]);
          else addedGroup.push(diffs[i]);
          i++;
        }
        const maxLen = Math.max(removedGroup.length, addedGroup.length);
        let lo = oldNum, ln = newNum;
        for (let j = 0; j < maxLen; j++) {
          const r = j < removedGroup.length ? removedGroup[j] : null;
          const a = j < addedGroup.length  ? addedGroup[j]   : null;
          if (r) lo++;
          if (a) ln++;
          pairs.push({
            type: 'row',
            left:  r ? { type: 'removed', content: r.content, lineNum: lo } : null,
            right: a ? { type: 'added',   content: a.content, lineNum: ln } : null,
          });
        }
        oldNum = lo; newNum = ln;
      } else {
        i++;
      }
    }

    // 渲染 pairs 为 HTML，使用 CSS Grid 两列布局
    let html = '<div class="oj-diff-split-container">';
    for (const p of pairs) {
      if (p.type === 'collapsed') {
        const d = p.data;
        const hasLineInfo = d.oldStart != null;
        const oldRange = hasLineInfo ? (d.oldStart === d.oldEnd ? String(d.oldStart) : d.oldStart + '-' + d.oldEnd) : '';
        const newRange = hasLineInfo ? (d.newStart === d.newEnd ? String(d.newStart) : d.newStart + '-' + d.newEnd) : '';
        const label = '⋯ ' + d.count + ' 行相同代码' + (hasLineInfo && d.oldStart !== d.oldEnd ? '（' + d.oldStart + '–' + d.oldEnd + ' 行）' : '') + ' ⋯';
        // 折叠行：横跨两列
        html += '<div class="oj-diff-split-collapsed oj-diff-collapsed" data-count="' + d.count + '">' +
          '<div class="oj-diff-split-half oj-diff-split-left">' +
            '<span class="oj-diff-ln-old oj-diff-ln-collapsed">' + oldRange + '</span>' +
            '<span class="oj-diff-split-collapsed-inner oj-diff-collapsed-btn" title="点击展开">' + label + '</span>' +
          '</div>' +
          '<div class="oj-diff-split-half oj-diff-split-right">' +
            '<span class="oj-diff-ln-new oj-diff-ln-collapsed">' + newRange + '</span>' +
            '<span class="oj-diff-split-collapsed-inner"></span>' +
          '</div>' +
        '</div>';
      } else {
        const L = p.left, R = p.right;
        const lType = L ? L.type : 'empty';
        const rType = R ? R.type : 'empty';
        html += '<div class="oj-diff-split-row">' +
          // 左列
          '<div class="oj-diff-split-half oj-diff-split-left oj-diff-split-' + lType + '">' +
            '<span class="oj-diff-ln-old">' + (L ? L.lineNum : '') + '</span>' +
            (lType === 'removed' ? '<span class="oj-diff-marker">-</span>' : '<span class="oj-diff-marker oj-diff-marker-empty"></span>') +
            '<span class="oj-diff-content">' + (L ? escapeHtml(L.content) : '') + '</span>' +
          '</div>' +
          // 分隔线
          '<div class="oj-diff-split-divider"></div>' +
          // 右列
          '<div class="oj-diff-split-half oj-diff-split-right oj-diff-split-' + rType + '">' +
            '<span class="oj-diff-ln-new">' + (R ? R.lineNum : '') + '</span>' +
            (rType === 'added' ? '<span class="oj-diff-marker">+</span>' : '<span class="oj-diff-marker oj-diff-marker-empty"></span>') +
            '<span class="oj-diff-content">' + (R ? escapeHtml(R.content) : '') + '</span>' +
          '</div>' +
        '</div>';
      }
    }
    html += '</div>';
    return html;
  }

  // ======================== 加载遮罩 ========================

  function createLoadingOverlay(message) {
    const dark = isDarkMode();
    const overlay = document.createElement('div');
    overlay.id = 'oj-diff-loading';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;' +
      'background:rgba(0,0,0,0.5);z-index:100000;' +
      'display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML =
      '<div style="' +
        'background:' + getColors(dark).modalBg + ';border-radius:12px;' +
        'padding:32px 48px;text-align:center;' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.3);' +
        'color:' + getColors(dark).textPrimary + ';font-size:16px;' +
      '">' +
        '<div class="oj-diff-spinner" style="' +
          'width:36px;height:36px;margin:0 auto 16px;' +
          'border:3px solid ' + getColors(dark).sliderTrack + ';' +
          'border-top-color:#3498db;border-radius:50%;' +
          'animation:oj-diff-spin 0.8s linear infinite;' +
        '"></div>' +
        '<div id="oj-diff-loading-msg">' + escapeHtml(message) + '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function removeLoadingOverlay() {
    const el = document.getElementById('oj-diff-loading');
    if (el) el.remove();
  }

  function updateLoadingMessage(overlay, message) {
    const el = overlay.querySelector('#oj-diff-loading-msg');
    if (el) el.textContent = message;
  }

  // ======================== 主对比模态框 ========================

  function showDiffModal(oldCode, newCode, oldLabel, newLabel, oldUrl, newUrl, currentRecordId, isPrevCompare) {
    const settings = loadSettings();
    const dark = isDarkMode(settings.themeMode);
    const C = getColors(dark);

    const hasRecordId = currentRecordId && String(currentRecordId).trim();

    const oldLines = String(oldCode || '').split('\n');
    const newLines = String(newCode || '').split('\n');
    const rawDiffs = lineDiff(oldLines, newLines);

    const addedCount   = rawDiffs.filter(d => d.type === 'added').length;
    const removedCount = rawDiffs.filter(d => d.type === 'removed').length;
    const unchangedCount = rawDiffs.filter(d => d.type === 'unchanged').length;

    let displayDiffs = settings.collapseUnchanged
      ? collapseUnchanged(rawDiffs)
      : rawDiffs;

    let currentViewMode = settings.viewMode || 'unified';

    function renderCodeHtml(diffs, viewMode) {
      if (viewMode === 'split') return buildSplitHtml(diffs);
      return buildCodeHtml(diffs, true);
    }

    let codeHtml = renderCodeHtml(displayDiffs, currentViewMode);

    let expandedDiffs = rawDiffs;

    // ---- 构建 DOM ----
    const overlay = document.createElement('div');
    overlay.id = 'oj-diff-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'oj-diff-modal ' + (dark ? 'oj-diff-dark' : 'oj-diff-light');

    // ---- Header ----
    const header = document.createElement('div');
    header.className = 'oj-diff-header';

    // 标题（含平台标识）
    const titleDiv = document.createElement('div');
    titleDiv.className = 'oj-diff-title';
    const platformTag = CURRENT_PLATFORM ? '[' + CURRENT_PLATFORM.name + '] ' : '';
    titleDiv.innerHTML = '<span class="oj-diff-title-icon">📋</span>' + escapeHtml(platformTag) + '代码对比';

    // ID 对比链接区
    const idsDiv = document.createElement('div');
    idsDiv.className = 'oj-diff-ids';
    const oldLinkHtml = oldUrl
      ? '<a href="' + escapeHtml(oldUrl) + '" target="_blank" class="oj-diff-record-link old">#' + escapeHtml(oldLabel) + '</a>'
      : '<span class="oj-diff-record-link old">' + escapeHtml(oldLabel) + '</span>';
    const newLinkHtml = newUrl
      ? '<a href="' + escapeHtml(newUrl) + '" target="_blank" class="oj-diff-record-link new">#' + escapeHtml(newLabel) + '</a>'
      : '<span class="oj-diff-record-link new">' + escapeHtml(newLabel) + '</span>';
    idsDiv.innerHTML = oldLinkHtml + '<span class="oj-diff-arrow">→</span>' + newLinkHtml;

    // 统计
    const statsDiv = document.createElement('div');
    statsDiv.className = 'oj-diff-stats';
    statsDiv.innerHTML =
      '<span class="oj-diff-stat-added">+' + addedCount + ' 行</span>' +
      '<span class="oj-diff-stat-removed">-' + removedCount + ' 行</span>' +
      '<span class="oj-diff-stat-unchanged">' + unchangedCount + ' 行未变更</span>';

    // 亮暗模式切换按钮
    const themeBtn = document.createElement('button');
    themeBtn.className = 'oj-diff-theme-btn';
    themeBtn.title = '切换亮/暗模式（当前：自动）';
    themeBtn.setAttribute('data-theme-mode', settings.themeMode);
    function updateThemeBtnContent(mode) {
      const LABELS = { auto: '🖥 自动', light: '☀️ 亮色', dark: '🌙 暗色' };
      themeBtn.innerHTML = '<span class="oj-diff-theme-icon"></span><span class="oj-diff-theme-label">' + LABELS[mode] + '</span>';
      themeBtn.title = '切换亮/暗模式（当前：' + LABELS[mode] + '）';
      themeBtn.classList.remove('oj-diff-theme-auto', 'oj-diff-theme-light', 'oj-diff-theme-dark');
      themeBtn.classList.add('oj-diff-theme-' + mode);
    }
    updateThemeBtnContent(settings.themeMode);

    // 关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.className = 'oj-diff-close';
    closeBtn.title = '关闭';
    closeBtn.textContent = '✕';

    header.appendChild(titleDiv);
    header.appendChild(idsDiv);
    header.appendChild(statsDiv);
    header.appendChild(themeBtn);
    header.appendChild(closeBtn);

    // ---- Body ----
    const body = document.createElement('div');
    body.className = 'oj-diff-body';

    const codeArea = document.createElement('div');
    codeArea.className = 'oj-diff-code';
    codeArea.id = 'oj-diff-code-area';
    codeArea.innerHTML = codeHtml;
    body.appendChild(codeArea);

    // ---- Settings bar ----
    const settingsBar = document.createElement('div');
    settingsBar.className = 'oj-diff-settings-bar';

    settingsBar.innerHTML =
      '<span class="oj-diff-settings-label">字号</span>' +
      '<input type="range" class="oj-diff-slider" id="oj-diff-font-slider"' +
        ' min="8" max="28" step="1" value="' + settings.fontSize + '" title="字体大小">' +
      '<span class="oj-diff-settings-value" id="oj-diff-font-value">' + settings.fontSize + 'px</span>' +

      '<span class="oj-diff-settings-divider">|</span>' +

      '<span class="oj-diff-settings-label">行距</span>' +
      '<input type="range" class="oj-diff-slider" id="oj-diff-lh-slider"' +
        ' min="1.0" max="3.0" step="0.1" value="' + settings.lineHeight + '" title="行间距">' +
      '<span class="oj-diff-settings-value" id="oj-diff-lh-value">' + settings.lineHeight.toFixed(1) + 'x</span>' +

      '<span class="oj-diff-settings-divider">|</span>' +

      '<span class="oj-diff-settings-label">缩进</span>' +
      '<div class="oj-diff-tab-group" id="oj-diff-tab-group">' +
        [2, 4, 8].map(n =>
          '<button class="oj-diff-tab-btn' + (settings.tabSize === n ? ' active' : '') + '" data-tab="' + n + '">' + n + '</button>'
        ).join('') +
      '</div>' +

      '<span class="oj-diff-settings-divider">|</span>' +

      '<button class="oj-diff-collapse-toggle" id="oj-diff-collapse-btn" title="折叠/展开未变更行">' +
        '<span class="oj-diff-collapse-icon">📄</span>' +
        '<span class="oj-diff-collapse-label">未折叠</span>' +
      '</button>' +

      '<span class="oj-diff-settings-divider">|</span>' +

      '<button class="oj-diff-view-toggle" id="oj-diff-view-btn" title="切换统一/并列视图">' +
        '<span class="oj-diff-view-icon"></span>' +
        '<span class="oj-diff-view-label"></span>' +
      '</button>';

    // ---- Footer ----
    const footer = document.createElement('div');
    footer.className = 'oj-diff-footer';

    const footerLeft = document.createElement('div');
    footerLeft.className = 'oj-diff-footer-left';

    const isAtCoder = CURRENT_PLATFORM?.id === 'atcoder';

    if (isAtCoder) {
      // AtCoder 只保留手动输入对比
      footerLeft.innerHTML =
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-manual-compare">✏️ 两份代码对比</button>';
    } else if (hasRecordId) {
      footerLeft.innerHTML =
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-prev-compare"' + (isPrevCompare ? ' disabled title="当前已在与上次提交对比"' : ' title="与上一次提交记录对比"') + '>⇄ 与上次提交对比</button>' +
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-manual-compare">✏️ 两份代码对比</button>' +
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-custom-compare">🔢 与指定提交对比</button>' +
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-record-compare">📋 两次提交记录对比</button>';
    } else {
      footerLeft.innerHTML =
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-manual-compare">✏️ 两份代码对比</button>' +
        '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-record-compare">📋 两次提交记录对比</button>';
    }

    const footerRight = document.createElement('div');
    footerRight.style.cssText = 'display:flex;gap:8px;align-items:center;';
    footerRight.innerHTML =
      '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-copy-old">📋 复制旧版</button>' +
      '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-copy-new">📋 复制新版</button>' +
      '<button class="oj-diff-btn oj-diff-btn-primary" id="oj-diff-close-btn">关闭</button>';

    footer.appendChild(footerLeft);
    footer.appendChild(footerRight);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(settingsBar);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    applyCodeSettings(codeArea, settings);

    let currentSettings = { ...settings };

    // ---- 设置交互 ----
    const fontSlider  = overlay.querySelector('#oj-diff-font-slider');
    const fontValueEl = overlay.querySelector('#oj-diff-font-value');
    const lhSlider    = overlay.querySelector('#oj-diff-lh-slider');
    const lhValueEl   = overlay.querySelector('#oj-diff-lh-value');

    fontSlider.addEventListener('input', () => {
      currentSettings.fontSize = parseInt(fontSlider.value, 10);
      fontValueEl.textContent = currentSettings.fontSize + 'px';
      applyCodeSettings(codeArea, currentSettings);
      saveSettings(currentSettings);
    });

    lhSlider.addEventListener('input', () => {
      currentSettings.lineHeight = parseFloat(parseFloat(lhSlider.value).toFixed(1));
      lhValueEl.textContent = currentSettings.lineHeight.toFixed(1) + 'x';
      applyCodeSettings(codeArea, currentSettings);
      saveSettings(currentSettings);
    });

    overlay.querySelector('#oj-diff-tab-group').addEventListener('click', (e) => {
      const btn = e.target.closest('.oj-diff-tab-btn');
      if (!btn) return;
      const tab = parseInt(btn.dataset.tab, 10);
      currentSettings.tabSize = tab;
      overlay.querySelectorAll('.oj-diff-tab-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.tab, 10) === tab);
      });
      applyCodeSettings(codeArea, currentSettings);
      saveSettings(currentSettings);
    });

    // 折叠/展开切换——三态
    const collapseBtn = overlay.querySelector('#oj-diff-collapse-btn');
    const collapseIcon = collapseBtn.querySelector('.oj-diff-collapse-icon');
    const collapseLabel = collapseBtn.querySelector('.oj-diff-collapse-label');

    function getCollapseState(diffs) {
      const hasCollapsed = diffs.some(d => d.type === 'collapsed');
      if (!hasCollapsed) return 'none';
      const hasUnchanged = diffs.some(d => d.type === 'unchanged');
      return hasUnchanged ? 'partial' : 'full';
    }

    function updateCollapseBtn(diffs) {
      const state = getCollapseState(diffs);
      collapseBtn.classList.toggle('active', state !== 'none');
      collapseBtn.classList.toggle('partial', state === 'partial');
      collapseBtn.classList.toggle('full', state === 'full');
      if (state === 'none') {
        collapseIcon.textContent = '📄'; collapseLabel.textContent = '未折叠';
        collapseBtn.title = '点击：折叠所有未变更行';
      } else if (state === 'partial') {
        collapseIcon.textContent = '🔀'; collapseLabel.textContent = '部分折叠';
        collapseBtn.title = '点击：折叠剩余未变更行';
      } else {
        collapseIcon.textContent = '🗂️'; collapseLabel.textContent = '已折叠';
        collapseBtn.title = '点击：展开所有行';
      }
    }

    let currentDiffs = displayDiffs;

    function refreshCollapseIcon() { updateCollapseBtn(currentDiffs); }
    refreshCollapseIcon();

    collapseBtn.addEventListener('click', () => {
      const state = getCollapseState(currentDiffs);
      let newDiffs;
      if (state === 'full') {
        currentSettings.collapseUnchanged = false;
        newDiffs = expandedDiffs;
      } else {
        currentSettings.collapseUnchanged = true;
        newDiffs = collapseUnchanged(expandedDiffs);
      }
      saveSettings(currentSettings);
      currentDiffs = newDiffs;
      codeArea.innerHTML = renderCodeHtml(newDiffs, currentViewMode);
      applyCodeSettings(codeArea, currentSettings);
      bindCollapseButtons(codeArea, newDiffs, expandedDiffs, currentSettings);
      refreshCollapseIcon();
    });

    // 绑定展开按钮和折叠图标事件
    function bindCollapseButtons(area, collapsedDiffs, allDiffs, s) {
      area.querySelectorAll('.oj-diff-collapsed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const collapsedLine = btn.closest('.oj-diff-collapsed');
          const count = parseInt(collapsedLine.getAttribute('data-count'), 10);

          let collapsedIndex = -1;
          const allCollapsedLines = area.querySelectorAll('.oj-diff-collapsed');
          let collapsedCount = 0;
          for (let ci = 0; ci < collapsedDiffs.length; ci++) {
            if (collapsedDiffs[ci].type === 'collapsed') {
              if (allCollapsedLines[collapsedCount] === collapsedLine) {
                collapsedIndex = ci;
                break;
              }
              collapsedCount++;
            }
          }
          if (collapsedIndex === -1) return;

          const newCollapsedDiffs = collapsedDiffs.slice();
          newCollapsedDiffs.splice(collapsedIndex, 1);
          let rawOffset = 0;
          for (let ci = 0; ci < collapsedIndex; ci++) {
            const item = collapsedDiffs[ci];
            if (item.type === 'collapsed') { rawOffset += item.count; }
            else { rawOffset += 1; }
          }
          const expandedItems = allDiffs.slice(rawOffset, rawOffset + count);
          newCollapsedDiffs.splice(collapsedIndex, 0, ...expandedItems);

          const hasMoreCollapsed = newCollapsedDiffs.some(d => d.type === 'collapsed');
          if (!hasMoreCollapsed) { s.collapseUnchanged = false; saveSettings(s); }
          currentDiffs = newCollapsedDiffs;

          area.innerHTML = renderCodeHtml(newCollapsedDiffs, currentViewMode);
          applyCodeSettings(area, s);
          bindCollapseButtons(area, newCollapsedDiffs, allDiffs, s);
          refreshCollapseIcon();
        });
      });

      area.querySelectorAll('.oj-diff-fold-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
          e.stopPropagation();
          const foldStart = parseInt(icon.getAttribute('data-fold-start'), 10);
          const foldCount = parseInt(icon.getAttribute('data-fold-count'), 10);
          if (isNaN(foldStart) || isNaN(foldCount) || foldCount < 1) return;

          const newDiffs = collapsedDiffs.slice();
          let valid = true;
          for (let fi = 0; fi < foldCount; fi++) {
            if (foldStart + fi >= newDiffs.length || newDiffs[foldStart + fi].type !== 'unchanged') {
              valid = false; break;
            }
          }
          if (!valid) return;

          let oldNum = 0, newNum = 0;
          for (let pi = 0; pi < foldStart; pi++) {
            const d = newDiffs[pi];
            if (d.type === 'collapsed') { oldNum = d.oldEnd; newNum = d.newEnd; }
            else if (d.type === 'removed') { oldNum++; }
            else if (d.type === 'added') { newNum++; }
            else { oldNum++; newNum++; }
          }
          const cOldStart = oldNum + 1, cNewStart = newNum + 1;
          const cOldEnd = cOldStart + foldCount - 1, cNewEnd = cNewStart + foldCount - 1;

          newDiffs.splice(foldStart, foldCount, {
            type: 'collapsed', count: foldCount,
            oldStart: cOldStart, oldEnd: cOldEnd,
            newStart: cNewStart, newEnd: cNewEnd,
          });

          currentDiffs = newDiffs;
          area.innerHTML = renderCodeHtml(newDiffs, currentViewMode);
          applyCodeSettings(area, s);
          bindCollapseButtons(area, newDiffs, allDiffs, s);
          refreshCollapseIcon();
        });
      });
    }
    bindCollapseButtons(codeArea, displayDiffs, expandedDiffs, currentSettings);

    // 视图切换（unified / split）
    const viewBtn = overlay.querySelector('#oj-diff-view-btn');
    const viewIcon = viewBtn.querySelector('.oj-diff-view-icon');
    const viewLabel = viewBtn.querySelector('.oj-diff-view-label');

    function updateViewBtn(mode) {
      if (mode === 'split') {
        viewIcon.textContent = '⇔';
        viewLabel.textContent = '并列视图';
        viewBtn.title = '当前：并列视图，点击切换为统一视图';
        viewBtn.classList.add('active');
      } else {
        viewIcon.textContent = '☰';
        viewLabel.textContent = '统一视图';
        viewBtn.title = '当前：统一视图，点击切换为并列视图';
        viewBtn.classList.remove('active');
      }
    }
    updateViewBtn(currentViewMode);

    viewBtn.addEventListener('click', () => {
      currentViewMode = currentViewMode === 'split' ? 'unified' : 'split';
      currentSettings.viewMode = currentViewMode;
      saveSettings(currentSettings);
      updateViewBtn(currentViewMode);
      // split 视图不支持折叠图标，但支持折叠块（collapsed）
      codeArea.innerHTML = renderCodeHtml(currentDiffs, currentViewMode);
      applyCodeSettings(codeArea, currentSettings);
      bindCollapseButtons(codeArea, currentDiffs, expandedDiffs, currentSettings);
      // split 时加宽 modal
      modal.style.maxWidth = currentViewMode === 'split' ? '1400px' : '';
    });
    // 初始如果是 split 也要加宽
    if (currentViewMode === 'split') modal.style.maxWidth = '1400px';

    // 亮暗模式切换
    const THEME_CYCLE = ['auto', 'light', 'dark'];
    themeBtn.addEventListener('click', () => {
      const cur = currentSettings.themeMode || 'auto';
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(cur) + 1) % 3];
      currentSettings.themeMode = next;
      updateThemeBtnContent(next);
      themeBtn.setAttribute('data-theme-mode', next);
      saveSettings(currentSettings);
      const newDark = isDarkMode(next);
      modal.classList.toggle('oj-diff-dark', newDark);
      modal.classList.toggle('oj-diff-light', !newDark);
    });

    // 关闭逻辑
    const closeBack = () => { overlay.remove(); popAndRestore(); };
    const hasParent = modalStack.length > 0;

    closeBtn.addEventListener('click', closeBack);
    overlay.querySelector('#oj-diff-close-btn').addEventListener('click', closeBack);
    // 复制代码
    overlay.querySelector('#oj-diff-copy-old').addEventListener('click', () => {
      navigator.clipboard.writeText(String(oldCode || '')).then(() => {
        showToast('旧版代码已复制到剪贴板', 'success');
      }).catch(() => {
        showToast('复制失败（请检查剪贴板权限）', 'error');
      });
    });
    overlay.querySelector('#oj-diff-copy-new').addEventListener('click', () => {
      navigator.clipboard.writeText(String(newCode || '')).then(() => {
        showToast('新版代码已复制到剪贴板', 'success');
      }).catch(() => {
        showToast('复制失败（请检查剪贴板权限）', 'error');
      });
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBack(); });
    const escHandler = (e) => {
      if (e.key === 'Escape') { closeBack(); document.removeEventListener('keydown', escHandler); }
    };
    document.addEventListener('keydown', escHandler);

    if (hasParent) {
      closeBtn.title = '返回上级';
      closeBtn.textContent = '←';
      overlay.querySelector('#oj-diff-close-btn').textContent = '返回';
    }

    // 按钮事件绑定
    if (!isAtCoder && hasRecordId) {
      if (!isPrevCompare) {
        overlay.querySelector('#oj-diff-prev-compare').addEventListener('click', () => {
          pushAndHide(overlay);
          runCompare(currentRecordId, null);
        });
      }

      overlay.querySelector('#oj-diff-custom-compare').addEventListener('click', () => {
        pushAndHide(overlay);
        promptCustomCompare(currentRecordId);
      });
    }

    overlay.querySelector('#oj-diff-manual-compare').addEventListener('click', () => {
      pushAndHide(overlay);
      showManualInputDialog();
    });

    if (!isAtCoder) {
      overlay.querySelector('#oj-diff-record-compare').addEventListener('click', () => {
        pushAndHide(overlay);
        showRecordCompareDialog();
      });
    }
  }

  // ======================== 手动输入对比对话框 ========================

  function showManualInputDialog() {
    const existing = document.getElementById('oj-diff-manual-dialog');
    if (existing) existing.remove();

    const settings = loadSettings();
    const dark = isDarkMode(settings.themeMode);
    const C = getColors(dark);

    const dialog = document.createElement('div');
    dialog.id = 'oj-diff-manual-dialog';
    dialog.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:150000;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);';

    dialog.innerHTML =
      '<div class="oj-diff-modal ' + (dark ? 'oj-diff-dark' : 'oj-diff-light') + '" style="max-width:860px;width:92vw;">' +
        '<div class="oj-diff-header">' +
          '<div class="oj-diff-title"><span class="oj-diff-title-icon">✏️</span>手动输入代码对比</div>' +
          '<button class="oj-diff-close" title="关闭">✕</button>' +
        '</div>' +
        '<div class="oj-diff-body" style="padding:20px;display:flex;gap:16px;overflow:auto;">' +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px;">' +
            '<label style="font-size:13px;font-weight:600;color:' + C.textSecondary + '">旧版本（左侧）</label>' +
            '<textarea id="oj-diff-manual-old" placeholder="粘贴或输入旧版本代码..." style="' +
              'flex:1;min-height:300px;padding:12px;border-radius:8px;' +
              'border:1px solid ' + C.inputBorder + ';' +
              'background:' + C.inputBg + ';color:' + C.textPrimary + ';' +
              'font-family:Consolas,monospace;font-size:13px;resize:vertical;' +
              'outline:none;box-sizing:border-box;tab-size:4;' +
            '"></textarea>' +
          '</div>' +
          '<div style="flex:1;display:flex;flex-direction:column;gap:8px;">' +
            '<label style="font-size:13px;font-weight:600;color:' + C.textSecondary + '">新版本（右侧）</label>' +
            '<textarea id="oj-diff-manual-new" placeholder="粘贴或输入新版本代码..." style="' +
              'flex:1;min-height:300px;padding:12px;border-radius:8px;' +
              'border:1px solid ' + C.inputBorder + ';' +
              'background:' + C.inputBg + ';color:' + C.textPrimary + ';' +
              'font-family:Consolas,monospace;font-size:13px;resize:vertical;' +
              'outline:none;box-sizing:border-box;tab-size:4;' +
            '"></textarea>' +
          '</div>' +
        '</div>' +
        '<div class="oj-diff-footer">' +
          '<div class="oj-diff-footer-left">' +
            '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-manual-cancel">取消</button>' +
            '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-manual-clear" title="清空两个输入框">🗑 清空</button>' +
          '</div>' +
          '<button class="oj-diff-btn oj-diff-btn-primary" id="oj-diff-manual-ok">开始对比</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    const close = () => { dialog.remove(); popAndRestore(); };
    dialog.querySelector('.oj-diff-close').addEventListener('click', close);
    dialog.querySelector('#oj-diff-manual-cancel').addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

    dialog.querySelector('#oj-diff-manual-clear').addEventListener('click', () => {
      dialog.querySelector('#oj-diff-manual-old').value = '';
      dialog.querySelector('#oj-diff-manual-new').value = '';
      dialog.querySelector('#oj-diff-manual-old').focus();
    });

    const doCompare = () => {
      const oldCode = dialog.querySelector('#oj-diff-manual-old').value;
      const newCode = dialog.querySelector('#oj-diff-manual-new').value;
      dialog.remove();
      const parent = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
      if (parent) { parent.remove(); modalStack.pop(); }
      showDiffModal(oldCode, newCode, '旧版本', '新版本', null, null, null, false);
    };

    dialog.querySelector('#oj-diff-manual-ok').addEventListener('click', doCompare);

    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doCompare();
      if (e.key === 'Escape') close();
    });

    const xBtn = dialog.querySelector('.oj-diff-close');
    if (modalStack.length > 0) { xBtn.title = '返回上级'; xBtn.textContent = '←'; }

    [dialog.querySelector('#oj-diff-manual-old'), dialog.querySelector('#oj-diff-manual-new')].forEach(ta => {
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = ta.selectionStart, end = ta.selectionEnd;
          ta.value = ta.value.slice(0, start) + '    ' + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + 4;
        }
      });
    });

    setTimeout(() => dialog.querySelector('#oj-diff-manual-old').focus(), 50);
  }

  // ======================== 自定义 ID 对比对话框 ========================

  function promptCustomCompare(currentRecordId) {
    const existing = document.getElementById('oj-diff-custom-dialog');
    if (existing) existing.remove();

    const settings = loadSettings();
    const dark = isDarkMode(settings.themeMode);
    const C = getColors(dark);

    const dialog = document.createElement('div');
    dialog.id = 'oj-diff-custom-dialog';
    dialog.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:150000;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);';
    dialog.innerHTML =
      '<div class="oj-diff-modal ' + (dark ? 'oj-diff-dark' : 'oj-diff-light') + '" style="max-width:480px;">' +
        '<div class="oj-diff-header">' +
          '<div class="oj-diff-title">输入对比提交 ID</div>' +
          '<button class="oj-diff-close" title="关闭">✕</button>' +
        '</div>' +
        '<div class="oj-diff-body" style="padding:24px;">' +
          '<p style="margin:0 0 16px;color:' + C.textSecondary + ';font-size:14px;">' +
            '输入要与当前提交 (#' + escapeHtml(String(currentRecordId)) + ') 对比的提交记录 ID' +
          '</p>' +
          '<input type="text" id="oj-diff-custom-id" placeholder="例如 12345678" style="' +
            'width:100%;padding:10px 14px;border-radius:8px;' +
            'border:1px solid ' + C.inputBorder + ';' +
            'background:' + C.inputBg + ';color:' + C.textPrimary + ';' +
            'font-size:15px;outline:none;box-sizing:border-box;' +
          '">' +
          '<div id="oj-diff-custom-error" style="color:#cb2431;font-size:13px;margin-top:8px;display:none;"></div>' +
        '</div>' +
        '<div class="oj-diff-footer">' +
          '<div class="oj-diff-footer-left">' +
            '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-custom-cancel">取消</button>' +
          '</div>' +
          '<button class="oj-diff-btn oj-diff-btn-primary" id="oj-diff-custom-ok">开始对比</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    const close = () => { dialog.remove(); popAndRestore(); };
    dialog.querySelector('.oj-diff-close').addEventListener('click', close);
    dialog.querySelector('#oj-diff-custom-cancel').addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

    const input = dialog.querySelector('#oj-diff-custom-id');
    input.focus();

    const doCompare = async () => {
      const targetId = input.value.trim();
      if (!targetId || !/^\d+$/.test(targetId)) {
        const errEl = dialog.querySelector('#oj-diff-custom-error');
        errEl.textContent = '请输入有效的数字 ID';
        errEl.style.display = 'block';
        return;
      }
      dialog.remove();
      const parent = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
      if (parent) { parent.remove(); modalStack.pop(); }
      await runCompare(currentRecordId, targetId);
    };

    dialog.querySelector('#oj-diff-custom-ok').addEventListener('click', doCompare);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCompare(); });

    const xBtn = dialog.querySelector('.oj-diff-close');
    if (modalStack.length > 0) { xBtn.title = '返回上级'; xBtn.textContent = '←'; }
  }

  // ======================== 对比两份提交记录对话框 ========================

  function showRecordCompareDialog() {
    const existing = document.getElementById('oj-diff-record-cmp-dialog');
    if (existing) existing.remove();

    const settings = loadSettings();
    const dark = isDarkMode(settings.themeMode);
    const C = getColors(dark);

    const dialog = document.createElement('div');
    dialog.id = 'oj-diff-record-cmp-dialog';
    dialog.style.cssText =
      'position:fixed;top:0;left:0;right:0;bottom:0;z-index:150000;' +
      'display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,0.55);';
    dialog.innerHTML =
      '<div class="oj-diff-modal ' + (dark ? 'oj-diff-dark' : 'oj-diff-light') + '" style="max-width:560px;">' +
        '<div class="oj-diff-header">' +
          '<div class="oj-diff-title"><span class="oj-diff-title-icon">🔢</span>对比两份提交记录</div>' +
          '<button class="oj-diff-close" title="关闭">✕</button>' +
        '</div>' +
        '<div class="oj-diff-body" style="padding:24px;display:flex;flex-direction:column;gap:16px;">' +
          '<p style="margin:0;color:' + C.textSecondary + ';font-size:14px;">' +
            '输入两份提交记录的 ID，获取代码后进行对比' +
          '</p>' +
          '<div style="display:flex;gap:12px;align-items:center;">' +
            '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
              '<label style="font-size:12px;font-weight:600;color:' + C.textSecondary + '">旧版本 ID（左侧）</label>' +
              '<input type="text" id="oj-diff-rcmp-old-id" placeholder="例如 12345678" style="' +
                'width:100%;padding:10px 14px;border-radius:8px;' +
                'border:1px solid ' + C.inputBorder + ';' +
                'background:' + C.inputBg + ';color:' + C.textPrimary + ';' +
                'font-size:15px;outline:none;box-sizing:border-box;' +
              '">' +
            '</div>' +
            '<span style="font-size:20px;color:' + C.textSecondary + ';margin-top:20px;">→</span>' +
            '<div style="flex:1;display:flex;flex-direction:column;gap:4px;">' +
              '<label style="font-size:12px;font-weight:600;color:' + C.textSecondary + '">新版本 ID（右侧）</label>' +
              '<input type="text" id="oj-diff-rcmp-new-id" placeholder="例如 87654321" style="' +
                'width:100%;padding:10px 14px;border-radius:8px;' +
                'border:1px solid ' + C.inputBorder + ';' +
                'background:' + C.inputBg + ';color:' + C.textPrimary + ';' +
                'font-size:15px;outline:none;box-sizing:border-box;' +
              '">' +
            '</div>' +
          '</div>' +
          '<div id="oj-diff-rcmp-error" style="color:#cb2431;font-size:13px;display:none;"></div>' +
        '</div>' +
        '<div class="oj-diff-footer">' +
          '<div class="oj-diff-footer-left">' +
            '<button class="oj-diff-btn oj-diff-btn-secondary" id="oj-diff-rcmp-cancel">取消</button>' +
          '</div>' +
          '<button class="oj-diff-btn oj-diff-btn-primary" id="oj-diff-rcmp-ok">开始对比</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(dialog);

    const close = () => { dialog.remove(); popAndRestore(); };
    dialog.querySelector('.oj-diff-close').addEventListener('click', close);
    dialog.querySelector('#oj-diff-rcmp-cancel').addEventListener('click', close);
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

    const oldInput = dialog.querySelector('#oj-diff-rcmp-old-id');
    const newInput = dialog.querySelector('#oj-diff-rcmp-new-id');

    const xBtn = dialog.querySelector('.oj-diff-close');
    if (modalStack.length > 0) { xBtn.title = '返回上级'; xBtn.textContent = '←'; }

    const doCompare = async () => {
      const oldId = oldInput.value.trim();
      const newId = newInput.value.trim();
      const errEl = dialog.querySelector('#oj-diff-rcmp-error');

      if (!oldId || !/^\d+$/.test(oldId) || !newId || !/^\d+$/.test(newId)) {
        errEl.textContent = '请输入有效的数字 ID（两个 ID 均为必填）';
        errEl.style.display = 'block';
        return;
      }
      if (oldId === newId) {
        errEl.textContent = '两个 ID 不能相同';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      dialog.remove();
      const parent = modalStack.length > 0 ? modalStack[modalStack.length - 1] : null;
      if (parent) { parent.remove(); modalStack.pop(); }
      await runRecordCompare(oldId, newId);
    };

    dialog.querySelector('#oj-diff-rcmp-ok').addEventListener('click', doCompare);
    oldInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') newInput.focus(); });
    newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doCompare(); });

    setTimeout(() => oldInput.focus(), 50);
  }

  // ======================== Toast 提示 ========================

  function showToast(message, type) {
    const dark = isDarkMode();
    const isError = type === 'error';
    const toast = document.createElement('div');
    toast.style.cssText =
      'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'z-index:200000;' +
      'background:' + (isError ? (dark ? '#3d1a1a' : '#ffeef0') : (dark ? '#1b3a1f' : '#e6ffed')) + ';' +
      'color:' + (isError ? (dark ? '#f85149' : '#cb2431') : (dark ? '#3fb950' : '#22863a')) + ';' +
      'padding:12px 24px;border-radius:8px;font-size:14px;' +
      'box-shadow:0 4px 16px rgba(0,0,0,0.2);max-width:480px;text-align:center;';
    toast.textContent = (isError ? '❌ ' : '✅ ') + message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, isError ? 4000 : 2000);
  }

  // ======================== 核心逻辑（通用，通过 ADAPTER 多态调用） ========================

  /** 根据两份提交记录 ID 获取代码并对比 */
  async function runRecordCompare(oldId, newId) {
    const loading = createLoadingOverlay('正在获取代码，请稍候...');
    try {
      updateLoadingMessage(loading, '正在获取旧版本 #' + oldId + ' ...');
      const oldRecord = await ADAPTER.fetchRecordDetail(oldId);
      updateLoadingMessage(loading, '正在获取新版本 #' + newId + ' ...');
      const newRecord = await ADAPTER.fetchRecordDetail(newId);

      const oldCode = ADAPTER.getSourceCode(oldRecord);
      const newCode = ADAPTER.getSourceCode(newRecord);
      if (!oldCode) throw new Error('旧版本 #' + oldId + ' 的代码不可访问或为空');
      if (!newCode) throw new Error('新版本 #' + newId + ' 的代码不可访问或为空');

      removeLoadingOverlay();
      showDiffModal(
        String(oldCode), String(newCode),
        String(oldId), String(newId),
        ADAPTER.recordUrl(oldId, oldRecord), ADAPTER.recordUrl(newId, newRecord),
        ADAPTER.getRecordIdFromUrl(),
        false
      );
    } catch (err) {
      removeLoadingOverlay();
      showToast(err.message, 'error');
    }
  }

  /** 核心对比逻辑 */
  async function runCompare(currentRecordId, targetRecordId) {
    const loading = createLoadingOverlay('正在获取代码，请稍候...');
    try {
      let currentRecord;
      let targetRecord;

      if (targetRecordId) {
        // 指定提交 ID 对比——总是从 API 重新获取，避免 getPageData 可能缺少 sourceCode
        updateLoadingMessage(loading, '正在获取当前提交代码...');
        currentRecord = await ADAPTER.fetchRecordDetail(currentRecordId);
        updateLoadingMessage(loading, '正在获取对比提交代码...');
        targetRecord = await ADAPTER.fetchRecordDetail(targetRecordId);
      } else {
        // 与上次提交对比
        // 尝试从页面缓存获取（仅洛谷有效，快速获取当前记录信息）
        const pageData = ADAPTER.getPageData();
        if (pageData) {
          currentRecord = pageData;
        } else {
          updateLoadingMessage(loading, '正在获取当前提交信息...');
          currentRecord = await ADAPTER.fetchRecordDetail(currentRecordId);
        }
        updateLoadingMessage(loading, '正在查找上一次提交记录...');
        const prevBase = await ADAPTER.findPrevRecord(currentRecordId, currentRecord);
        updateLoadingMessage(loading, '正在获取上一次提交代码...');
        targetRecord = await ADAPTER.fetchRecordDetail(prevBase.id, prevBase);
      }

      const curCode = ADAPTER.getSourceCode(currentRecord);
      const tgtCode = ADAPTER.getSourceCode(targetRecord);
      if (!curCode) throw new Error('当前提交的代码不可访问或为空（可能是隐私设置或权限不足）');
      if (!tgtCode) throw new Error('对比提交的代码不可访问或为空（可能是隐私设置或权限不足）');

      removeLoadingOverlay();
      showDiffModal(
        String(tgtCode), String(curCode),
        String(targetRecord.id || targetRecordId),
        String(currentRecord.id || currentRecordId),
        ADAPTER.recordUrl(targetRecord.id || targetRecordId, targetRecord),
        ADAPTER.recordUrl(currentRecord.id || currentRecordId, currentRecord),
        String(currentRecordId),
        !targetRecordId
      );
    } catch (err) {
      removeLoadingOverlay();
      showToast(err.message, 'error');
    }
  }

  // ======================== 按钮注入 ========================

  function injectCompareButton() {
    if (document.getElementById('oj-diff-compare-btn')) return;
    const recordId = ADAPTER.getRecordIdFromUrl();
    if (!recordId) return;

    const btn = document.createElement('button');
    btn.id = 'oj-diff-compare-btn';
    btn.textContent = '⇄ 代码对比';
    btn.title = '代码对比工具';
    btn.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:99999;' +
      'padding:12px 20px;border:none;border-radius:24px;' +
      'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);' +
      'color:#ffffff;font-size:15px;font-weight:600;' +
      'cursor:pointer;box-shadow:0 4px 16px rgba(102,126,234,0.4);' +
      'transition:all 0.2s ease;letter-spacing:0.5px;';
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 24px rgba(102,126,234,0.6)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 16px rgba(102,126,234,0.4)';
    });
    btn.addEventListener('click', () => showFloatingMenu(recordId));
    document.body.appendChild(btn);
    makeDraggable(btn);
  }

  function showFloatingMenu(recordId) {
    const existing = document.getElementById('oj-diff-float-menu');
    if (existing) { existing.remove(); return; }
    const btn = document.getElementById('oj-diff-compare-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const dark = isDarkMode();
    const C = getColors(dark);
    const isAtCoder = CURRENT_PLATFORM?.id === 'atcoder';
    const items = isAtCoder
      ? [ { text: '✏️ 两份代码对比', action: () => showManualInputDialog() } ]
      : [
          { text: '⇄ 与上次提交记录对比', action: () => runCompare(recordId, null) },
          { text: '🔢 与指定提交记录对比', action: () => promptCustomCompare(recordId) },
          { text: '✏️ 两份代码对比', action: () => showManualInputDialog() },
          { text: '📋 两次提交记录对比', action: () => showRecordCompareDialog() },
        ];
    const menuW = 220;
    const menu = document.createElement('div');
    menu.id = 'oj-diff-float-menu';
    menu.style.cssText =
      'position:fixed;z-index:-1;top:0;left:0;visibility:hidden;' +
      'background:' + C.modalBg + ';border:1px solid ' + C.border + ';' +
      'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);' +
      'padding:8px 0;min-width:' + menuW + 'px;';
    // 先装填项目、挂到 DOM 测量实际高度，再移除并重新定位
    for (const item of items) {
      const el = document.createElement('div');
      el.textContent = item.text;
      el.style.cssText =
        'padding:10px 20px;cursor:pointer;font-size:14px;' +
        'color:' + C.textPrimary + ';transition:background 0.15s;';
      el.addEventListener('mouseenter', () => el.style.background = C.bgSecondary);
      el.addEventListener('mouseleave', () => el.style.background = 'transparent');
      el.addEventListener('click', () => { menu.remove(); item.action(); });
      menu.appendChild(el);
    }
    document.body.appendChild(menu);
    const actualH = menu.offsetHeight;
    menu.remove();
    menu.style.visibility = '';
    menu.style.zIndex = '100001';
    // 水平位置：优先右对齐，太靠左则左对齐
    let ml = rect.right - menuW;
    if (ml < 4) ml = Math.max(4, rect.left);
    if (ml + menuW > window.innerWidth - 4) ml = window.innerWidth - menuW - 4;
    // 垂直位置：上方空间够则在按钮上方，否则在下方
    let mt;
    if (rect.top > actualH + 12) {
      mt = rect.top - 8 - actualH;
    } else {
      mt = rect.bottom + 8;
    }
    mt = Math.max(4, Math.min(mt, window.innerHeight - actualH - 4));
    menu.style.top = mt + 'px';
    menu.style.left = ml + 'px';
    document.body.appendChild(menu);
    document.body.appendChild(menu);
    const outsideClick = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', outsideClick); }
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
  }

  function injectInlineButton(recordId) {
    const existing = document.querySelector('[data-oj-diff-injected]');
    if (existing && document.body.contains(existing)) return;

    const codeBlock = document.querySelector('pre') || document.querySelector('code');
    if (!codeBlock) return;

    const container = document.createElement('div');
    container.setAttribute('data-oj-diff-injected', '1');
    container.style.cssText = 'display:flex;gap:8px;margin:8px 0;align-items:center;flex-wrap:wrap;';

    function makeBtn(text, color, onClick) {
      const b = document.createElement('button');
      b.textContent = text;
      b.style.cssText =
        'padding:6px 16px;border:1px solid ' + color + ';border-radius:6px;' +
        'background:transparent;color:' + color + ';font-size:13px;' +
        'cursor:pointer;transition:all 0.2s;';
      b.addEventListener('mouseenter', () => { b.style.background = color; b.style.color = '#fff'; });
      b.addEventListener('mouseleave', () => { b.style.background = 'transparent'; b.style.color = color; });
      b.addEventListener('click', onClick);
      return b;
    }

    const isAtCoder = CURRENT_PLATFORM?.id === 'atcoder';

    let buttons;
    if (isAtCoder) {
      buttons = [makeBtn('✏️ 两份代码对比', '#059669', () => showManualInputDialog())];
    } else {
      const b1 = makeBtn('⇄ 与上次提交对比', '#667eea', async () => {
        b1.style.pointerEvents = 'none';
        try { await runCompare(recordId, null); }
        finally { b1.style.pointerEvents = 'auto'; }
      });
      const b2 = makeBtn('🔢 与指定提交对比', '#8b5cf6', () => promptCustomCompare(recordId));
      const b3 = makeBtn('✏️ 两份代码对比', '#059669', () => showManualInputDialog());
      const b4 = makeBtn('📋 两次提交记录对比', '#d97706', () => showRecordCompareDialog());
      buttons = [b1, b2, b3, b4];
    }

    for (const b of buttons) container.appendChild(b);

    const preParent = codeBlock.closest('pre') || codeBlock.parentElement;
    if (preParent && preParent.parentElement) {
      preParent.parentElement.insertBefore(container, preParent);
    }
  }

  // ======================== 通用浮动按钮（非记录页） ========================

  function injectUniversalButton() {
    if (document.getElementById('oj-diff-universal-btn')) return;

    const dark = isDarkMode();
    const C = getColors(dark);

    const btn = document.createElement('button');
    btn.id = 'oj-diff-universal-btn';
    btn.innerHTML = '📋 代码对比';
    btn.title = '代码对比工具（手动输入 / 提交记录 ID 对比）';
    btn.style.cssText =
      'position:fixed;bottom:24px;right:24px;z-index:99999;' +
      'padding:12px 20px;border:none;border-radius:24px;' +
      'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);' +
      'color:#ffffff;font-size:15px;font-weight:600;' +
      'cursor:pointer;box-shadow:0 4px 16px rgba(102,126,234,0.4);' +
      'transition:all 0.2s ease;letter-spacing:0.5px;';
    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.05)';
      btn.style.boxShadow = '0 6px 24px rgba(102,126,234,0.6)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 16px rgba(102,126,234,0.4)';
    });
    btn.addEventListener('click', () => showUniversalMenu(btn));
    document.body.appendChild(btn);
    makeDraggable(btn);
  }

  function showUniversalMenu(anchor) {
    const existing = document.getElementById('oj-diff-universal-menu');
    if (existing) { existing.remove(); return; }
    const rect = anchor.getBoundingClientRect();
    const dark = isDarkMode();
    const C = getColors(dark);
    const isAtCoder = CURRENT_PLATFORM?.id === 'atcoder';
    const items = isAtCoder
      ? [{ text: '✏️ 两份代码对比', action: () => showManualInputDialog() }]
      : [
          { text: '✏️ 两份代码对比', action: () => showManualInputDialog() },
          { text: '📋 两次提交记录对比', action: () => showRecordCompareDialog() },
        ];
    const menuW = 200;
    const menu = document.createElement('div');
    menu.id = 'oj-diff-universal-menu';
    menu.style.cssText =
      'position:fixed;z-index:-1;top:0;left:0;visibility:hidden;' +
      'background:' + C.modalBg + ';border:1px solid ' + C.border + ';' +
      'border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.2);' +
      'padding:8px 0;min-width:' + menuW + 'px;';
    for (const item of items) {
      const el = document.createElement('div');
      el.textContent = item.text;
      el.style.cssText =
        'padding:10px 20px;cursor:pointer;font-size:14px;' +
        'color:' + C.textPrimary + ';transition:background 0.15s;';
      el.addEventListener('mouseenter', () => el.style.background = C.bgSecondary);
      el.addEventListener('mouseleave', () => el.style.background = 'transparent');
      el.addEventListener('click', () => { menu.remove(); item.action(); });
      menu.appendChild(el);
    }
    document.body.appendChild(menu);
    const actualH = menu.offsetHeight;
    menu.remove();
    menu.style.visibility = '';
    menu.style.zIndex = '100001';
    let ml = rect.right - menuW;
    if (ml < 4) ml = Math.max(4, rect.left);
    if (ml + menuW > window.innerWidth - 4) ml = window.innerWidth - menuW - 4;
    let mt;
    if (rect.top > actualH + 12) {
      mt = rect.top - 8 - actualH;
    } else {
      mt = rect.bottom + 8;
    }
    mt = Math.max(4, Math.min(mt, window.innerHeight - actualH - 4));
    menu.style.top = mt + 'px';
    menu.style.left = ml + 'px';
    document.body.appendChild(menu);
    const outsideClick = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', outsideClick); }
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
  }

  // ======================== 样式注入 ========================

  function injectStyles() {
    GM_addStyle(`
      @keyframes oj-diff-spin { to { transform: rotate(360deg); } }

      #oj-diff-modal-overlay,
      #oj-diff-custom-dialog,
      #oj-diff-manual-dialog {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        z-index: 150000; display: flex; align-items: center; justify-content: center;
        background: rgba(0, 0, 0, 0.5);
      }

      .oj-diff-modal {
        width: 90vw; max-width: 960px; max-height: 85vh;
        border-radius: 16px; overflow: hidden;
        display: flex; flex-direction: column;
        box-shadow: 0 16px 64px rgba(0, 0, 0, 0.3);
      }
      .oj-diff-modal.oj-diff-light { background: #ffffff; color: #24292e; }
      .oj-diff-modal.oj-diff-dark  { background: #161b22; color: #e6edf3; }

      /* Header */
      .oj-diff-header {
        display: flex; align-items: center; gap: 12px;
        padding: 14px 20px; border-bottom: 1px solid;
        flex-shrink: 0; flex-wrap: wrap;
      }
      .oj-diff-light .oj-diff-header { border-color: #e1e4e8; background: #f6f8fa; }
      .oj-diff-dark  .oj-diff-header { border-color: #30363d; background: #0d1117; }

      .oj-diff-title { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .oj-diff-light .oj-diff-title { color: #24292e; }
      .oj-diff-dark  .oj-diff-title { color: #e6edf3; }
      .oj-diff-title-icon { font-size: 20px; }

      .oj-diff-ids { display: flex; align-items: center; gap: 8px; font-size: 14px; }

      .oj-diff-record-link {
        text-decoration: none; font-weight: 600;
        padding: 2px 8px; border-radius: 4px; transition: opacity 0.2s;
      }
      a.oj-diff-record-link:hover { opacity: 0.8; }
      .oj-diff-record-link.old { color: #cb2431; background: #ffeef0; }
      .oj-diff-dark .oj-diff-record-link.old { color: #f85149; background: #3d1a1a; }
      .oj-diff-record-link.new { color: #22863a; background: #e6ffed; }
      .oj-diff-dark .oj-diff-record-link.new { color: #3fb950; background: #1b3a1f; }

      .oj-diff-arrow { color: #959da5; font-weight: 700; }

      .oj-diff-stats { margin-left: auto; display: flex; gap: 10px; font-size: 12px; font-weight: 600; flex-wrap: wrap; }
      .oj-diff-stat-added    { color: #22863a; }
      .oj-diff-stat-removed  { color: #cb2431; }
      .oj-diff-stat-unchanged{ color: #959da5; }
      .oj-diff-dark .oj-diff-stat-added    { color: #3fb950; }
      .oj-diff-dark .oj-diff-stat-removed  { color: #f85149; }
      .oj-diff-dark .oj-diff-stat-unchanged{ color: #484f58; }

      /* Theme toggle button */
      .oj-diff-theme-btn {
        height: 30px; border: 1.5px solid; border-radius: 6px;
        cursor: pointer; font-size: 12px; font-weight: 600;
        display: flex; align-items: center; gap: 4px;
        padding: 0 10px; flex-shrink: 0; transition: all 0.2s; white-space: nowrap;
      }
      .oj-diff-theme-icon { font-size: 14px; line-height: 1; }
      .oj-diff-theme-label { font-size: 11px; }

      .oj-diff-light .oj-diff-theme-btn { background: #ffffff; color: #586069; border-color: #d1d5da; }
      .oj-diff-light .oj-diff-theme-btn:hover { background: #f3f4f6; border-color: #667eea; color: #667eea; }
      .oj-diff-light .oj-diff-theme-btn.oj-diff-theme-auto  { border-color: #959da5; }
      .oj-diff-light .oj-diff-theme-btn.oj-diff-theme-light { border-color: #e8a317; color: #e8a317; background: #fffbe6; }
      .oj-diff-light .oj-diff-theme-btn.oj-diff-theme-dark  { border-color: #6e7781; color: #6e7781; background: #f0f0f0; }
      .oj-diff-dark .oj-diff-theme-btn { background: #21262d; color: #8b949e; border-color: #30363d; }
      .oj-diff-dark .oj-diff-theme-btn:hover { background: #30363d; border-color: #667eea; color: #667eea; }
      .oj-diff-dark .oj-diff-theme-btn.oj-diff-theme-auto  { border-color: #484f58; }
      .oj-diff-dark .oj-diff-theme-btn.oj-diff-theme-light { border-color: #e8a317; color: #e8a317; background: #2a2300; }
      .oj-diff-dark .oj-diff-theme-btn.oj-diff-theme-dark  { border-color: #8b949e; color: #c9d1d9; background: #21262d; }

      /* Close button */
      .oj-diff-close {
        width: 32px; height: 32px; border: none; border-radius: 8px;
        cursor: pointer; font-size: 18px;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s; flex-shrink: 0;
      }
      .oj-diff-light .oj-diff-close { background: #f0f0f0; color: #586069; }
      .oj-diff-light .oj-diff-close:hover { background: #d0d0d0; }
      .oj-diff-dark  .oj-diff-close { background: #21262d; color: #8b949e; }
      .oj-diff-dark  .oj-diff-close:hover { background: #30363d; }

      /* Body */
      .oj-diff-body { flex: 1; overflow: auto; padding: 0; }

      .oj-diff-code {
        font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
        font-size: 13px; line-height: 1.5;
        font-variant-ligatures: none;
        font-feature-settings: "liga" 0, "calt" 0;
        white-space: pre; tab-size: 4; -moz-tab-size: 4;
      }

      .oj-diff-line { display: flex; align-items: stretch; }

      .oj-diff-ln-old, .oj-diff-ln-new {
        display: inline-block; width: 3em; min-width: 3em;
        text-align: right; padding: 0 8px 0 0;
        user-select: none; font-size: 12px; flex-shrink: 0; box-sizing: border-box;
      }

      .oj-diff-marker { display: inline-block; width: 1.5em; min-width: 1.5em; text-align: center; user-select: none; font-weight: 700; flex-shrink: 0; }
      .oj-diff-marker-empty { display: inline-block; width: 1.5em; min-width: 1.5em; flex-shrink: 0; }

      .oj-diff-content { flex: 1; white-space: pre; padding-left: 4px; min-width: 0; }

      /* Collapsed lines */
      .oj-diff-collapsed { cursor: pointer; user-select: none; }
      .oj-diff-ln-collapsed { font-style: italic; opacity: 0.6; font-size: 10px; }
      .oj-diff-collapsed-btn { display: block; width: 100%; padding: 4px 16px; font-size: 11px; font-family: sans-serif; text-align: center; transition: background 0.2s; }
      .oj-diff-light .oj-diff-collapsed-btn { color: #586069; background: #f6f8fa; border-top: 1px dashed #d1d5da; border-bottom: 1px dashed #d1d5da; }
      .oj-diff-light .oj-diff-collapsed-btn:hover { background: #eaf1fb; color: #0366d6; }
      .oj-diff-dark  .oj-diff-collapsed-btn { color: #8b949e; background: #0d1117; border-top: 1px dashed #30363d; border-bottom: 1px dashed #30363d; }
      .oj-diff-dark  .oj-diff-collapsed-btn:hover { background: #161b22; color: #58a6ff; }

      /* Unchanged lines */
      .oj-diff-light .oj-diff-unchanged .oj-diff-ln-old, .oj-diff-light .oj-diff-unchanged .oj-diff-ln-new { color: #959da5; background: #f6f8fa; }
      .oj-diff-light .oj-diff-unchanged .oj-diff-content { color: #24292e; }
      .oj-diff-dark  .oj-diff-unchanged .oj-diff-ln-old, .oj-diff-dark  .oj-diff-unchanged .oj-diff-ln-new { color: #484f58; background: #161b22; }
      .oj-diff-dark  .oj-diff-unchanged .oj-diff-content { color: #e6edf3; }

      /* Removed lines */
      .oj-diff-removed { background: #ffeef0; }
      .oj-diff-light .oj-diff-removed .oj-diff-ln-old { color: #cb2431; background: #f8d7da; }
      .oj-diff-light .oj-diff-removed .oj-diff-ln-new { background: #ffeef0; }
      .oj-diff-light .oj-diff-removed .oj-diff-marker  { color: #cb2431; }
      .oj-diff-light .oj-diff-removed .oj-diff-content { color: #24292e; }
      .oj-diff-dark .oj-diff-removed { background: #3d1a1a; }
      .oj-diff-dark .oj-diff-removed .oj-diff-ln-old { color: #f85149; background: #4d2020; }
      .oj-diff-dark .oj-diff-removed .oj-diff-ln-new { background: #3d1a1a; }
      .oj-diff-dark .oj-diff-removed .oj-diff-marker  { color: #f85149; }
      .oj-diff-dark .oj-diff-removed .oj-diff-content { color: #e6edf3; }

      /* Added lines */
      .oj-diff-added { background: #e6ffed; }
      .oj-diff-light .oj-diff-added .oj-diff-ln-new { color: #22863a; background: #cdffd8; }
      .oj-diff-light .oj-diff-added .oj-diff-ln-old { background: #e6ffed; }
      .oj-diff-light .oj-diff-added .oj-diff-marker  { color: #22863a; }
      .oj-diff-light .oj-diff-added .oj-diff-content { color: #24292e; }
      .oj-diff-dark .oj-diff-added { background: #1b3a1f; }
      .oj-diff-dark .oj-diff-added .oj-diff-ln-new { color: #3fb950; background: #245028; }
      .oj-diff-dark .oj-diff-added .oj-diff-ln-old { background: #1b3a1f; }
      .oj-diff-dark .oj-diff-added .oj-diff-marker  { color: #3fb950; }
      .oj-diff-dark .oj-diff-added .oj-diff-content { color: #e6edf3; }

      /* Settings bar */
      .oj-diff-settings-bar {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 20px; border-top: 1px solid; flex-shrink: 0;
        overflow-x: auto; white-space: nowrap;
      }
      .oj-diff-light .oj-diff-settings-bar { border-color: #e1e4e8; background: #ffffff; }
      .oj-diff-dark  .oj-diff-settings-bar { border-color: #30363d; background: #161b22; }

      .oj-diff-settings-label { font-size: 12px; font-weight: 600; user-select: none; flex-shrink: 0; }
      .oj-diff-light .oj-diff-settings-label { color: #586069; }
      .oj-diff-dark  .oj-diff-settings-label { color: #8b949e; }

      /* Slider */
      .oj-diff-slider {
        -webkit-appearance: none; appearance: none; height: 4px; border-radius: 4px;
        outline: none; cursor: pointer; width: 80px; min-width: 80px; max-width: 80px; flex-shrink: 0;
      }
      .oj-diff-light .oj-diff-slider { background: #d1d5da; }
      .oj-diff-dark  .oj-diff-slider { background: #30363d; }
      .oj-diff-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
        background: #667eea; cursor: pointer; box-shadow: 0 1px 4px rgba(102,126,234,0.5); transition: transform 0.15s;
      }
      .oj-diff-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
      .oj-diff-slider::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: #667eea; cursor: pointer; border: none; }

      .oj-diff-settings-value { font-size: 12px; min-width: 36px; text-align: center; font-variant-numeric: tabular-nums; user-select: none; }
      .oj-diff-light .oj-diff-settings-value { color: #24292e; }
      .oj-diff-dark  .oj-diff-settings-value { color: #e6edf3; }

      .oj-diff-settings-divider { color: #d1d5da; user-select: none; font-size: 12px; }
      .oj-diff-dark  .oj-diff-settings-divider { color: #30363d; }

      /* Tab buttons */
      .oj-diff-tab-group { display: flex; gap: 2px; border-radius: 6px; overflow: hidden; border: 1px solid; flex-shrink: 0; }
      .oj-diff-light .oj-diff-tab-group { border-color: #d1d5da; }
      .oj-diff-dark  .oj-diff-tab-group { border-color: #30363d; }
      .oj-diff-tab-btn { padding: 3px 9px; font-size: 12px; border: none; cursor: pointer; transition: all 0.15s; font-weight: 600; background: transparent; }
      .oj-diff-light .oj-diff-tab-btn { color: #586069; }
      .oj-diff-light .oj-diff-tab-btn:hover { background: #e8f0fe; color: #667eea; }
      .oj-diff-light .oj-diff-tab-btn.active { background: #667eea; color: #fff; }
      .oj-diff-dark .oj-diff-tab-btn { color: #8b949e; }
      .oj-diff-dark .oj-diff-tab-btn:hover { background: #21262d; color: #667eea; }
      .oj-diff-dark .oj-diff-tab-btn.active { background: #667eea; color: #fff; }

      /* Collapse toggle */
      .oj-diff-collapse-toggle {
        height: 32px; border: 1.5px solid; border-radius: 6px;
        cursor: pointer; font-size: 12px; display: flex; align-items: center;
        gap: 4px; flex-shrink: 0; transition: all 0.2s;
        padding: 0 8px; background: transparent; white-space: nowrap;
      }
      .oj-diff-collapse-icon { font-size: 14px; line-height: 1; }
      .oj-diff-collapse-label { font-size: 11px; line-height: 1; }
      .oj-diff-light .oj-diff-collapse-toggle { color: #586069; border-color: #d1d5da; }
      .oj-diff-light .oj-diff-collapse-toggle:hover { background: #f3f4f6; border-color: #667eea; color: #667eea; }
      .oj-diff-light .oj-diff-collapse-toggle.active,
      .oj-diff-light .oj-diff-collapse-toggle.active:hover { border-color: #667eea; color: #667eea; background: #eaf1fb; }
      .oj-diff-light .oj-diff-collapse-toggle.partial,
      .oj-diff-light .oj-diff-collapse-toggle.partial:hover { border-color: #e8a317; color: #b08800; background: #fff8e1; }
      .oj-diff-dark  .oj-diff-collapse-toggle { color: #8b949e; border-color: #30363d; }
      .oj-diff-dark  .oj-diff-collapse-toggle:hover { background: #21262d; border-color: #667eea; color: #667eea; }
      .oj-diff-dark  .oj-diff-collapse-toggle.active,
      .oj-diff-dark  .oj-diff-collapse-toggle.active:hover { border-color: #667eea; color: #667eea; background: #1a2332; }
      .oj-diff-dark  .oj-diff-collapse-toggle.partial,
      .oj-diff-dark  .oj-diff-collapse-toggle.partial:hover { border-color: #d29922; color: #d29922; background: #261e0a; }

      /* Fold icon */
      .oj-diff-fold-icon {
        display: inline-block; vertical-align: middle;
        width: 12px; min-width: 12px; height: 1em; line-height: 1em;
        text-align: center; flex-shrink: 0;
        font-size: 8px; cursor: pointer; user-select: none;
        opacity: 0.3; transition: opacity 0.15s, color 0.15s, background 0.15s; border-radius: 2px;
      }
      .oj-diff-unchanged:hover .oj-diff-fold-icon, .oj-diff-unchanged-foldable .oj-diff-fold-icon { opacity: 0.5; }
      .oj-diff-fold-icon:hover { opacity: 1 !important; transform: scale(1.2); }
      .oj-diff-light .oj-diff-fold-icon { color: #586069; }
      .oj-diff-light .oj-diff-fold-icon:hover { color: #667eea; background: #e8eafc; }
      .oj-diff-dark  .oj-diff-fold-icon { color: #8b949e; }
      .oj-diff-dark  .oj-diff-fold-icon:hover { color: #79c0ff; background: #1c2d41; }

      .oj-diff-fold-icon-placeholder { display: inline-block; vertical-align: middle; width: 12px; min-width: 12px; flex-shrink: 0; }

      /* Footer */
      .oj-diff-footer {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 14px 20px; border-top: 1px solid; flex-shrink: 0; flex-wrap: wrap;
      }
      .oj-diff-light .oj-diff-footer { border-color: #e1e4e8; background: #f6f8fa; }
      .oj-diff-dark  .oj-diff-footer { border-color: #30363d; background: #0d1117; }
      .oj-diff-footer-left { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }

      .oj-diff-btn {
        padding: 7px 16px; border-radius: 8px; font-size: 13px;
        font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; white-space: nowrap;
      }
      .oj-diff-btn-primary { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; }
      .oj-diff-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }
      .oj-diff-btn-secondary { background: transparent; border: 1px solid; }
      .oj-diff-light .oj-diff-btn-secondary { border-color: #d1d5da; color: #586069; }
      .oj-diff-light .oj-diff-btn-secondary:hover { background: #f3f4f6; }
      .oj-diff-dark  .oj-diff-btn-secondary { border-color: #30363d; color: #8b949e; }
      .oj-diff-dark  .oj-diff-btn-secondary:hover { background: #21262d; }
      .oj-diff-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }

      /* View toggle button */
      .oj-diff-view-toggle {
        height: 32px; border: 1.5px solid; border-radius: 6px;
        cursor: pointer; font-size: 12px; display: flex; align-items: center;
        gap: 4px; flex-shrink: 0; transition: all 0.2s;
        padding: 0 8px; background: transparent; white-space: nowrap;
      }
      .oj-diff-view-icon { font-size: 14px; line-height: 1; }
      .oj-diff-view-label { font-size: 11px; line-height: 1; }
      .oj-diff-light .oj-diff-view-toggle { color: #586069; border-color: #d1d5da; }
      .oj-diff-light .oj-diff-view-toggle:hover { background: #f3f4f6; border-color: #667eea; color: #667eea; }
      .oj-diff-light .oj-diff-view-toggle.active,
      .oj-diff-light .oj-diff-view-toggle.active:hover { border-color: #667eea; color: #667eea; background: #eaf1fb; }
      .oj-diff-dark  .oj-diff-view-toggle { color: #8b949e; border-color: #30363d; }
      .oj-diff-dark  .oj-diff-view-toggle:hover { background: #21262d; border-color: #667eea; color: #667eea; }
      .oj-diff-dark  .oj-diff-view-toggle.active,
      .oj-diff-dark  .oj-diff-view-toggle.active:hover { border-color: #667eea; color: #667eea; background: #1a2332; }

      /* Split view */
      .oj-diff-split-container { display: flex; flex-direction: column; width: 100%; }

      .oj-diff-split-row {
        display: flex; align-items: stretch; min-height: 1.5em;
      }
      .oj-diff-split-collapsed {
        display: flex; align-items: stretch; cursor: pointer; user-select: none;
      }

      .oj-diff-split-half {
        display: flex; align-items: baseline; flex: 1; min-width: 0; overflow: hidden;
      }
      .oj-diff-split-half .oj-diff-content { flex: 1; white-space: pre; padding-left: 4px; min-width: 0; overflow: hidden; }
      .oj-diff-split-half .oj-diff-ln-old,
      .oj-diff-split-half .oj-diff-ln-new { flex-shrink: 0; }

      .oj-diff-split-divider { width: 2px; flex-shrink: 0; }
      .oj-diff-light .oj-diff-split-divider { background: #e1e4e8; }
      .oj-diff-dark  .oj-diff-split-divider { background: #30363d; }

      /* Split: unchanged */
      .oj-diff-light .oj-diff-split-unchanged { background: #ffffff; }
      .oj-diff-dark  .oj-diff-split-unchanged { background: #0d1117; }
      .oj-diff-light .oj-diff-split-unchanged .oj-diff-ln-old,
      .oj-diff-light .oj-diff-split-unchanged .oj-diff-ln-new { color: #959da5; background: #f6f8fa; }
      .oj-diff-light .oj-diff-split-unchanged .oj-diff-content { color: #24292e; }
      .oj-diff-dark  .oj-diff-split-unchanged .oj-diff-ln-old,
      .oj-diff-dark  .oj-diff-split-unchanged .oj-diff-ln-new { color: #484f58; background: #161b22; }
      .oj-diff-dark  .oj-diff-split-unchanged .oj-diff-content { color: #e6edf3; }

      /* Split: removed (left) */
      .oj-diff-light .oj-diff-split-removed { background: #ffeef0; }
      .oj-diff-light .oj-diff-split-removed .oj-diff-ln-old { color: #cb2431; background: #f8d7da; }
      .oj-diff-light .oj-diff-split-removed .oj-diff-marker  { color: #cb2431; }
      .oj-diff-light .oj-diff-split-removed .oj-diff-content { color: #24292e; }
      .oj-diff-dark  .oj-diff-split-removed { background: #3d1a1a; }
      .oj-diff-dark  .oj-diff-split-removed .oj-diff-ln-old  { color: #f85149; background: #4d2020; }
      .oj-diff-dark  .oj-diff-split-removed .oj-diff-marker  { color: #f85149; }
      .oj-diff-dark  .oj-diff-split-removed .oj-diff-content { color: #e6edf3; }

      /* Split: added (right) */
      .oj-diff-light .oj-diff-split-added { background: #e6ffed; }
      .oj-diff-light .oj-diff-split-added .oj-diff-ln-new { color: #22863a; background: #cdffd8; }
      .oj-diff-light .oj-diff-split-added .oj-diff-marker  { color: #22863a; }
      .oj-diff-light .oj-diff-split-added .oj-diff-content { color: #24292e; }
      .oj-diff-dark  .oj-diff-split-added { background: #1b3a1f; }
      .oj-diff-dark  .oj-diff-split-added .oj-diff-ln-new  { color: #3fb950; background: #245028; }
      .oj-diff-dark  .oj-diff-split-added .oj-diff-marker  { color: #3fb950; }
      .oj-diff-dark  .oj-diff-split-added .oj-diff-content { color: #e6edf3; }

      /* Split: empty side (placeholder) */
      .oj-diff-light .oj-diff-split-empty { background: #f6f8fa; }
      .oj-diff-dark  .oj-diff-split-empty { background: #161b22; }
      .oj-diff-split-empty .oj-diff-content { opacity: 0; pointer-events: none; }

      /* Split: collapsed */
      .oj-diff-split-collapsed .oj-diff-split-half { align-items: center; }
      .oj-diff-split-collapsed-inner { display: block; width: 100%; padding: 4px 8px; font-size: 11px; font-family: sans-serif; }
      .oj-diff-light .oj-diff-split-collapsed .oj-diff-split-half { background: #f6f8fa; border-top: 1px dashed #d1d5da; border-bottom: 1px dashed #d1d5da; }
      .oj-diff-light .oj-diff-split-collapsed .oj-diff-split-collapsed-inner { color: #586069; }
      .oj-diff-light .oj-diff-split-collapsed:hover .oj-diff-split-half { background: #eaf1fb; }
      .oj-diff-light .oj-diff-split-collapsed:hover .oj-diff-split-collapsed-inner { color: #0366d6; }
      .oj-diff-dark  .oj-diff-split-collapsed .oj-diff-split-half { background: #0d1117; border-top: 1px dashed #30363d; border-bottom: 1px dashed #30363d; }
      .oj-diff-dark  .oj-diff-split-collapsed .oj-diff-split-collapsed-inner { color: #8b949e; }
      .oj-diff-dark  .oj-diff-split-collapsed:hover .oj-diff-split-half { background: #161b22; }
      .oj-diff-dark  .oj-diff-split-collapsed:hover .oj-diff-split-collapsed-inner { color: #58a6ff; }
    `);
  }

  // ======================== 初始化 ========================

  function init() {
    injectStyles();

    if (!CURRENT_PLATFORM) return;

    const recordId = ADAPTER.getRecordIdFromUrl();
    const onRecordPage = ADAPTER.isRecordPage();

    if (onRecordPage && recordId) {
      // 记录详情页——完整功能（各平台已根据自身能力裁剪按钮）
      let debounceTimer = null;
      function scheduleInject() {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          injectCompareButton();
          injectInlineButton(recordId);
        }, 300);
      }

      const observer = new MutationObserver((mutations) => {
        let needReinject = false;
        for (const m of mutations) {
          for (const node of m.removedNodes) {
            if (node.nodeType === 1) {
              if (
                node.id === 'oj-diff-compare-btn' ||
                node.hasAttribute?.('data-oj-diff-injected') ||
                node.querySelector?.('[data-oj-diff-injected]')
              ) {
                needReinject = true;
                break;
              }
            }
          }
          if (needReinject) break;
        }
        if (needReinject) { scheduleInject(); return; }
        const hasContent =
          document.querySelector('pre') ||
          document.querySelector('code') ||
          document.querySelector('.markdown-renderer') ||
          document.querySelector('#main-container');
        if (hasContent) scheduleInject();
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => {
        injectCompareButton();
        injectInlineButton(recordId);
      }, 800);

      // 监听主题变化（重新渲染浮动按钮颜色）
      new MutationObserver(() => {
        const btn = document.getElementById('oj-diff-compare-btn');
        if (btn) { btn.remove(); injectCompareButton(); }
      }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    } else {
      // 非 record 页面——通用浮动按钮
      setTimeout(() => injectUniversalButton(), 800);

      new MutationObserver(() => {
        const btn = document.getElementById('oj-diff-universal-btn');
        if (btn) { btn.remove(); injectUniversalButton(); }
      }).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }
})();
