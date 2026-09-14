/**
 * 加载进度条
 *
 * 为什么要它：图片识别要二三十秒、拉订阅链接要十几秒，页面若一直没反应，
 * 用户会以为卡死，要么反复点（并发发好几个请求），要么直接关掉页面。
 *
 * 时长未知，所以条子按「预估耗时的指数曲线」往前爬，最多爬到 93% 就停住等结果
 * —— 假装 100% 再等返回，比慢慢爬更容易让人觉得坏了。
 * 完成时跳满并变绿，失败时变红，都只留一小会儿就收起，把位置让给弹窗。
 */
const BusyProgress = (() => {
const core = {
  _timer: null,
  _hideTimer: null,
  _t0: 0,
  _est: 30,          // 预估秒数，决定爬升快慢
  _forced: null,     // 手动钉死的百分比（done/fail 时用）
  _running: false,

  nodes() {
    const id = (x) => document.getElementById(x);
    return { bar: id('busyBar'), fill: id('busyFill'), text: id('busyText'),
      meta: id('busyMeta'), grid: id('uploadGrid') };
  },

  _sec() { return (Date.now() - this._t0) / 1000; },

  /** 开跑：label 是当前动作，estSeconds 是这一步大概要多久 */
  start(label, estSeconds = 30) {
    const n = this.nodes();
    if (!n.bar || !n.fill) return;        // 页面没这个节点就安静地跳过，别挡住主流程
    clearTimeout(this._hideTimer);
    if (!this._running) {
      this._t0 = Date.now();
      this._running = true;
      this._forced = null;
      if (n.grid) n.grid.classList.add('is-busy');   // 锁住三张卡片，防止连点重复提交
    }
    this._est = Math.max(2, estSeconds);
    n.bar.hidden = false;
    n.bar.classList.remove('is-done', 'is-fail');
    if (n.text && label) n.text.textContent = label;
    this._paint();
    clearInterval(this._timer);
    this._timer = setInterval(() => this._paint(), 200);
  },

  /** 换一句话（顺带把预估时长改短，进度就会爬得更快一点） */
  step(label, estSeconds) {
    if (estSeconds) this._est = Math.max(2, estSeconds);
    const n = this.nodes();
    if (!this._running) { this.start(label, estSeconds); return; }
    if (n.text && label) n.text.textContent = label;
    this._paint();
  },

  done(label) {
    const n = this.nodes();
    if (!n.bar) return;
    this._forced = 100;
    if (n.text && label) n.text.textContent = label;
    n.bar.classList.remove('is-fail');
    n.bar.classList.add('is-done');
    this._paint(`100%｜用时 ${Math.round(this._sec())}s`);
    this._stop(1000);
  },

  fail(label) {
    const n = this.nodes();
    if (!n.bar) return;
    if (n.text && label) n.text.textContent = label;
    n.bar.classList.remove('is-done');
    n.bar.classList.add('is-fail');
    this._paint(`已用 ${Math.round(this._sec())}s｜中断`);
    this._stop(1200);        // 紧接着就要弹「失败原因」窗口，条子早点收
  },

  /**
   * 包一层再画：这个方法被定时器每 200ms 调一次，抛错会刷屏成未捕获异常，
   * 所以一旦出错就自己把定时器停掉（宁可没动画，也不能拖垮识别流程）。
   */
  _paint(metaOverride) {
    try {
      this._paintNow(metaOverride);
    } catch (e) {
      clearInterval(this._timer);
      this._timer = null;
      console.warn('进度条刷新出错，已停掉动画:', e.message);
    }
  },

  _paintNow(metaOverride) {
    const n = this.nodes();
    if (!n.fill) return;
    // 起步就留 4% 的可见头寸：0% 的空条子看起来像没反应，反而更让人以为卡死
    const p = this._forced != null
      ? this._forced
      : Math.min(93, 4 + 89 * (1 - Math.exp(-1.7 * this._sec() / this._est)));
    n.fill.style.width = p.toFixed(1) + '%';
    if (n.meta) n.meta.textContent = metaOverride || `${Math.round(p)}%｜已用 ${Math.round(this._sec())}s`;
  },

  _stop(hideAfter) {
    clearInterval(this._timer);
    this._timer = null;
    this._running = false;
    this._forced = null;
    const n = this.nodes();
    if (n.grid) n.grid.classList.remove('is-busy');
    this._hideTimer = setTimeout(() => {
      if (!this._running && n.bar) { n.bar.hidden = true; n.bar.classList.remove('is-done', 'is-fail'); }
    }, hideAfter);
  }
};

// 进度条只是锦上添花：DOM 少个节点、浏览器不给定时器……都不能把识别流程带崩，
// 否则「无论成功失败都要弹窗」这条就破了。所有对外方法统一兜底。
for (const m of ['start', 'step', 'done', 'fail']) {
  const raw = core[m].bind(core);
  core[m] = (...a) => {
    try { raw(...a); } catch (e) { console.warn(`进度条 ${m}() 出错（不影响识别）:`, e.message); }
  };
}
return core;
})();

/**
 * 课表分析应用主入口
 * 处理用户交互、数据上传、结果展示等
 */
const ScheduleApp = {
  /**
   * 初始化应用
   */
  init() {
    this.bindEvents();
    this.loadSavedSchedule();
  },

  /**
   * 绑定事件监听器
   */
  bindEvents() {
    // 图片 OCR 上传
    const imageInput = document.getElementById('imageUpload');
    if (imageInput) {
      imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
    }

    // ICS 文件上传
    const icsInput = document.getElementById('icsUpload');
    if (icsInput) {
      icsInput.addEventListener('change', (e) => this.handleICSUpload(e));
    }

    // WebCal 链接导入
    const webcalBtn = document.getElementById('webcalImportBtn');
    if (webcalBtn) {
      webcalBtn.addEventListener('click', () => this.handleWebCalImport());
    }

    // 手动添加课程按钮
    const addCourseBtn = document.getElementById('addCourseBtn');
    if (addCourseBtn) {
      addCourseBtn.addEventListener('click', () => {
        console.log('手动添加按钮点击');
        this.showAddCourseModal();
      });
    }

    // 分析课表按钮
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.analyzeCurrentSchedule());
    }

    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportSchedule());
    }

    // 清空按钮
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllData());
    }
  },

  /**
   * 加载保存的课表
   */
  loadSavedSchedule() {
    const courses = ScheduleManager.getAllCourses();
    if (courses.length > 0) {
      this.renderSchedule(courses);   // 只刷新统计，分析结果等用户点「分析当前课表」
    }
  },

  /**
   * 处理 ICS 文件上传
   */
  async handleICSUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.ics') && !file.name.toLowerCase().includes('calendar')) {
      showToast('请上传 .ics 格式的日历文件', 'error');
      return;
    }

    BusyProgress.start(`正在读取 ${file.name}…`, 3);

    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      BusyProgress.step('正在解析日历事件…', 2);
      const courses = ScheduleManager.parseICSContent(text);
      BusyProgress.done(`读取完成，${courses.length} 节课`);

      if (courses.length > 0) {
        ScheduleManager.save(courses);
        // 显示课程编辑表格，让用户确认和修改
        this.showCourseTableModal(courses);
        showToast(`成功读取 ${courses.length} 门课程`, 'success');
      } else {
        showToast('未识别到课程数据，请检查文件格式', 'error');
      }

    } catch (error) {
      console.error('ICS 读取失败:', error);
      BusyProgress.fail('读取失败');
      showToast('文件解析失败，请检查文件格式', 'error');
    }

    // 重置输入
    event.target.value = '';
  },

  /**
   * 处理 WebCal 链接导入（支持 404 但仍返回内容的 URL）
   */
  async handleWebCalImport() {
    let url = document.getElementById('webcalUrl').value.trim();

    if (!url) {
      showToast('请输入订阅链接', 'warning');
      return;
    }

    // 确保 URL 有 http://或 https://前缀
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    if (!isValidURL(url)) {
      showToast('无效的 URL 格式，请检查链接是否正确', 'error');
      return;
    }

    // 后端给这次拉取留了 15 秒，进度条就按 15 秒爬
    BusyProgress.start('正在连接订阅地址，拉取课表…', 15);

    try {
      // 通过后端代理请求以绕过 CORS
      const response = await fetch('/api/fetch-ics?url=' + encodeURIComponent(url));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      BusyProgress.step('正在读取返回内容…', 4);
      const text = await response.text();
      console.log('获取到的 ICS 内容:', text.substring(0, 200) + '...');

      // 尝试解析 ICS 内容
      BusyProgress.step('正在解析课程…', 2);
      const courses = ScheduleManager.parseICSContent(text);
      console.log('解析到的课程数量:', courses.length);
      BusyProgress.done(courses.length ? `导入完成，${courses.length} 节课` : '链接里没有课程');

      if (courses.length > 0) {
        ScheduleManager.save(courses);
        this.showCourseTableModal(courses);
        showToast(`成功导入 ${courses.length} 门课程`, 'success');
        document.getElementById('webcalUrl').value = '';
      } else {
        this.showCourseTableModal(ScheduleManager.getAllCourses());
        showToast('链接返回的内容中未识别到课程，已打开课表编辑器', 'warning', 6000);
      }

    } catch (error) {
      console.error('❌ WebCal 导入失败:', error);
      BusyProgress.fail('没能从链接取到课表');

      // 导入失败时保留已有课表，仅打开编辑器供手动补充（不清空数据）
      this.showCourseTableModal(ScheduleManager.getAllCourses());
      showToast('订阅导入失败，已打开课表编辑器供你手动添加', 'warning', 6000);
    }
  },

  /**
   * 处理 PDF 上传（暂时使用图片 OCR 方式）
   */
  async handlePDFUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      showToast('请上传 PDF 格式的课表', 'error');
      return;
    }

    // 将 PDF 转换为图片后调用 OCR（需要额外库支持）
    // 暂时提示用户使用图片 OCR 功能
    showToast('PDF 识别暂不支持，建议使用拍照识别或 ICS 文件导入', 'info');

    event.target.value = '';
  },

  /**
   * 处理图片 OCR 上传
   */
  async handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      this.showOcrFailureModal({
        reason: `这种文件没法识别：${file.type || '未知格式'}`,
        detail: `文件名：${file.name}｜大小：${(file.size / 1024 / 1024).toFixed(2)} MB`,
        tips: ['只支持 JPG / PNG / WebP 图片，PDF 请先截图或导出成图片', '截图后直接在这里选那张图即可']
      });
      event.target.value = '';
      return;
    }

    // 本地能判断的问题先自己拦下来，别丢给模型后只回一句「连接失败」
    const mb = file.size / 1024 / 1024;
    if (file.size > 25 * 1024 * 1024) {
      this.showOcrFailureModal({
        reason: `图片太大（${mb.toFixed(1)} MB），连压缩都救不回来`,
        detail: `格式：${file.type}｜大小：${mb.toFixed(2)} MB｜文件名：${file.name}`,
        tips: ['用截图工具只截课表那块区域', '整页 4K 长截图建议裁成上下两半分别识别']
      });
      event.target.value = '';
      return;
    }

    BusyProgress.start(`正在读取图片（${(file.size / 1024).toFixed(0)} KB）…`, 6);

    try {
      // 手机原图/4K 截图动辄十几 MB，base64 后还要再涨 1/3：
      // 先在本地缩放到长边 1400 左右并转 JPEG，既躲开「请求体过大」，也躲开上游对极端尺寸报 500。
      const img = await this.prepareImageForOCR(file);
      this.lastOCRImageInfo = img;
      console.log(`🖼️ 送识别的图：${img.srcKB} KB → ${img.sentKB} KB${img.note ? '（' + img.note + '）' : ''}`);

      // 这一步是真正的大头：模型要先想再逐格输出，实测 25~100 秒。
      // 预估给 45s：多数情况条子爬到七八十就返回；万一很慢，它就停在 93% 等着，
      // 至少比转圈圈诚实。
      BusyProgress.step(`图片已整理好（${img.sentKB} KB），正在交给 AI 逐格识别…`, 45);
      const result = await this.performOCR(img.dataUrl);   // 失败会抛错，错误里带 reason/detail

      BusyProgress.step('正在把识别结果对齐到课表格子里…', 3);
      if (!result || !Array.isArray(result.courses)) {
        BusyProgress.fail('AI 没有返回课程数据');
        this.showOcrFailureModal({
          reason: '模型返回的内容里没有任何课程数组',
          detail: (result && result.raw) || String(result),
          tips: ['多半是图里没有可辨认的课表表格（太糊、被裁掉、字太小）', '换一张清晰图，尽量把整周拍全']
        });
        event.target.value = '';
        return;
      }

      const rawList = result.courses;
      console.log('AI 原始返回课程数:', rawList.length, rawList);

      // 规范化字段（兼容 "周三"、"1-2节"、"08:00-09:40" 等各种 AI 输出写法）
      const cleanedCourses = ScheduleManager.normalizeCourses(rawList);
      const skipped = ScheduleManager.lastSkipped || [];
      console.log('规范化后课程数:', cleanedCourses.length, cleanedCourses);

      if (cleanedCourses.length > 0) {
        BusyProgress.done(`识别完成，共 ${cleanedCourses.length} 节课`);
        // 识别成功 → 弹「和导入课表一样」的确认弹窗
        ScheduleManager.save(cleanedCourses);
        this.showCourseTableModal(ScheduleManager.getAllCourses(), { skipped });
        showToast(skipped.length
          ? `识别出 ${cleanedCourses.length} 节，另有 ${skipped.length} 条缺星期/时间被跳过`
          : `成功识别 ${cleanedCourses.length} 节课`, skipped.length ? 'warning' : 'success', 6000);
      } else {
        // AI 给了内容但一条都落不到格子 → 说清楚缺什么
        BusyProgress.fail('识别结果填不进课表');
        const said = String(result.raw || '');
        const blind = /纯黑|全黑|看不到|没有.*(内容|文字|信息)|无法识别|看不清/.test(said);
        this.showOcrFailureModal({
          reason: rawList.length === 0
            ? (blind
              ? '模型说这张图里「什么都没有」——多半是透明底/黑图或压缩过头'
              : '模型看了图，但一个格子都没认出来（返回 courses: []）')
            : `模型返回了 ${rawList.length} 条，可每一条都缺「星期 + 时间」，落不到课表格里`,
          detail: [
            `模型原话：${String(result.raw || '').replace(/\s+/g, ' ').slice(0, 260)}`,
            `返回条目：${JSON.stringify(rawList.slice(0, 4), null, 1).slice(0, 600)}`
          ].join('\n'),
          tips: [
            '把字放大：整页缩到一屏、字发虚是最常见的失败原因',
            '只截一周的表格区域（上下留一点边），识别率立刻提高',
            '课程跨很多周的长截图，裁成上下两半分别识别再合并',
            '或在「➕ 手动添加课程」里点时间段录入，一般 1 分钟填完'
          ]
        });
      }

    } catch (error) {
      console.error('OCR 识别失败:', error);
      BusyProgress.fail('识别中断');
      const info = this.lastOCRImageInfo;
      this.showOcrFailureModal({
        reason: error.message || '识别过程出错',
        detail: [
          error.detail || '',
          info ? `已发送图片：${info.sentKB} KB（原图 ${info.srcKB} KB）${info.note ? '｜' + info.note : ''}` : ''
        ].filter(Boolean).join('\n'),
        tips: this.ocrTipsFor(error.message || '')
      });
    }

    event.target.value = '';
  },

  /**
   * 按失败原因给对应的下一步 —— 每次都甩同一串通用提示，等于没提示
   */
  ocrTipsFor(reason) {
    const r = String(reason || '');
    if (/连不上后端|Failed to fetch|NetworkError|Load failed/i.test(r)) return [
      '终端里进本项目目录跑 node server.js，窗口别关',
      '启动后强刷页面：Cmd + Shift + R',
      '端口被占用时：lsof -i:3000 看看是谁占了'
    ];
    if (/MIMO_API_KEY|\.env/i.test(r)) return [
      '项目根目录 .env 里加一行 MIMO_API_KEY=sk-xxx',
      '改完 .env 必须重启 node server.js 才生效'
    ];
    if (/Key 无效|权限|401|403/i.test(r)) return ['换一个对 mimo-v2.5 有权限、且没过期的 Key'];
    if (/额度|429|频繁/i.test(r)) return ['额度或频率被限制了，等一两分钟再传一次'];
    if (/超时/i.test(r)) return ['只截一周的表格区域，图小识别就快', '别连着猛点，一次等它跑完'];
    if (/截断|max_tokens|空正文/i.test(r)) return ['把课表裁成上下两半分别识别，结果更稳', '识别时先别同时用其他 AI 功能'];
    if (/图片|尺寸|格式/i.test(r)) return ['重新截一张清晰的课表图，字别被压糊', '聊天软件压缩过的图最容易识别失败，用原图'];
    return [
      '换一张更清晰的整周课表截图再试',
      '或用「📅 导入课表」的 ICS 订阅链接：那是逐字解析，不会认错字'
    ];
  },

  /**
   * 把本地图片整理成适合送 AI 的 dataURL：缩放到长边 ~1600、铺白底、统一转 JPEG。
   *
   * 为什么一定要转 JPEG —— 实测：带透明通道的 PNG（截图工具、微信收藏、PDF 导出的图都是这类）
   * 送进 mimo 后模型看到的是「一张纯黑的图」，于是回 {"courses": []}，
   * 表面症状就是「图明明很清晰却识别不到课」。铺白底重编码成 JPEG 后立刻识别正常。
   * 尺寸两头也要夹住：几万像素的长截图和几十像素的缩略图都会让上游直接 500。
   */
  async prepareImageForOCR(file, longSide = 1600) {
    const raw = await this.fileToBase64(file);
    const info = {
      dataUrl: raw,
      srcKB: Math.round(file.size / 1024),
      sentKB: Math.round(raw.length / 1024),
      note: ''
    };
    if (typeof Image !== 'function' || !document || typeof document.createElement !== 'function') {
      info.note = '当前环境无法压缩，按原图发送';
      return info;
    }
    let objectUrl = null;
    try {
      const img = new Image();
      objectUrl = (typeof URL !== 'undefined' && URL.createObjectURL) ? URL.createObjectURL(file) : raw;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('浏览器读不出这张图，可能已损坏或格式不对'));
        img.src = objectUrl;
      });
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) throw new Error('读不到图片尺寸');

      let k = longSide / Math.max(w, h);
      k = Math.max(0.1, Math.min(k, 4));            // 大图等比缩小，糊图最多放大 4 倍
      const ow = Math.max(1, Math.round(w * k));
      const oh = Math.max(1, Math.round(h * k));

      const canvas = document.createElement('canvas');
      canvas.width = ow;
      canvas.height = oh;
      const g = canvas.getContext && canvas.getContext('2d');
      if (!g || typeof canvas.toDataURL !== 'function') throw new Error('画布不可用');
      g.fillStyle = '#fff';                          // 关键：透明底必须先铺白，否则模型看到的是黑图
      g.fillRect(0, 0, ow, oh);
      g.drawImage(img, 0, 0, ow, oh);

      // 不管原图多大都重编码：既顺手去掉 alpha，又把体积压下来
      let out = canvas.toDataURL('image/jpeg', 0.92);
      if (out.length > 9 * 1024 * 1024) out = canvas.toDataURL('image/jpeg', 0.8);
      if (out && out.indexOf('data:image/jpeg') === 0) {
        info.dataUrl = out;
        info.sentKB = Math.round(out.length / 1024);
        info.note = `${w}×${h} ${file.type.replace('image/', '')} → ${ow}×${oh} jpeg（已铺白底）`;
      } else {
        info.note = '画布导出的结果不可用，按原图发送（透明 PNG 可能被识别成黑图）';
      }
    } catch (e) {
      // 压缩失败不该让整件事失败：退回原图，让真正的原因由 AI 调用报出来
      info.note = '压缩这一步没做成（' + e.message + '），按原图发送';
    } finally {
      if (objectUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
    }
    return info;
  },

  /**
   * 识别失败专用弹窗：把「为什么失败 + 怎么办 + 数据有没有被破坏」一次说清
   */
  showOcrFailureModal(info) {
    const old = document.getElementById('ocrFailModal');
    if (old) old.remove();

    const keep = ScheduleManager.getAllCourses().length;
    const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));

    document.body.insertAdjacentHTML('beforeend', `
      <div id="ocrFailModal" class="modal-overlay">
        <div class="modal" style="max-width: 640px;">
          <div class="modal-header">
            <div class="modal-title">🖼️ 图片识别没成功</div>
            <button class="modal-close" onclick="hideModal('ocrFailModal')">&times;</button>
          </div>
          <div class="modal-body" style="padding: 18px 22px;">
            <div style="font-size: 16.5px; font-weight: 700; color: #e04a4a; line-height: 1.55;">
              ${esc(info.reason || '未知原因')}
            </div>
            ${info.detail ? `
              <details style="margin: 12px 0 4px;">
                <summary style="cursor:pointer; font-size: 14px; color: #66708a;">查看原始返回内容</summary>
                <pre style="margin-top:8px; padding:10px; background:#f7f8fb; border:1px solid #eceef4; border-radius:6px;
                            font-size:12.5px; line-height:1.5; white-space:pre-wrap; word-break:break-all;
                            max-height:220px; overflow:auto;">${esc(info.detail)}</pre>
              </details>` : ''}
            <div style="margin-top: 14px; font-size: 15.5px; color: #333a4d; font-weight: 700;">可以试试：</div>
            <ul style="margin: 6px 0 0; padding-left: 22px;">
              ${(info.tips || []).map(t => `<li style="font-size:15px; line-height:1.8; color:#55607a;">${esc(t)}</li>`).join('')}
            </ul>
            <div style="margin-top: 14px; font-size: 14px; color: #8b93a9;">
              ${keep > 0 ? `你已存的 ${keep} 节课没有被动过，仍可直接「📊 分析当前课表」。` : '本次没有写入任何数据，已有课表不受影响。'}
            </div>
            <div class="flex justify-between" style="margin-top: 18px;">
              <button class="btn btn-secondary" onclick="hideModal('ocrFailModal')">知道了</button>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" onclick="hideModal('ocrFailModal'); document.getElementById('imageUpload').click()">再试一次</button>
                <button class="btn btn-primary" onclick="hideModal('ocrFailModal'); ScheduleApp.showAddCourseModal()">手动添加课程</button>
              </div>
            </div>
          </div>
        </div>
      </div>`);
    showModal('ocrFailModal');
  },

  /**
   * 执行 OCR 识别
   */
  /**
   * 调 AI 并解析成 {courses:[...]}
   * 注意：这里绝不吞错、也不返回假课表 —— 早先版本 catch 掉一切并 return {courses:[]}，
   * 导致「后端没起 / 没配 Key / JSON 解析失败」全都被当成「没识别到课程」，用户看不到原因。
   */
  async performOCR(dataUrlOrBase64) {
    const messages = AIProxy.buildOCRPrompt(dataUrlOrBase64);
    // 低温 + 不限量：温度高了模型会「发挥」出课表上没有的课
    const response = await callAI(messages, { temperature: 0.1 });   // 失败直接往上抛，error.detail 里有后端原因

    const result = parseAiJson(response);
    if (result && Array.isArray(result.courses)) {
      result.raw = response;
      return result;
    }
    if (result && Array.isArray(result)) {
      return { courses: result, raw: response };
    }

    const err = new Error('模型回了一段内容，但不是可解析的课程 JSON');
    err.detail = String(response || '(空回复)').slice(0, 900);
    throw err;
  },

  /**
   * 将文件转换为 Base64
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /**
   * 显示课程表格编辑模态框（Excel 风格）
   */
  showCourseTableModal(courses, opts = {}) {
    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    // 识别时跳过的条目要在确认弹窗顶部说明，否则用户不知道少了几节
    const skipped = (opts.skipped || []);
    const skipBanner = skipped.length ? `
      <div style="margin:0 0 12px; padding:10px 12px; background:#fff7ed; border-left:3px solid #f59e0b;
                   border-radius:4px; font-size:14.5px; color:#8a5a00; line-height:1.7;">
        ⚠️ 有 ${skipped.length} 条识别结果缺字段被跳过：
        ${skipped.slice(0, 6).map(x => `「${x.name}」缺${x.missing}`).join('；')}
        ${skipped.length > 6 ? '……' : ''}
        <div style="font-size:13px; color:#a1710a;">可在下方清单里核对，或用「＋ 添加课程」补齐。</div>
      </div>` : ''; 

    // 底部清单：保证每门课都能被看到和编辑
    const listPanel = courses.length === 0
      ? `<div style="text-align:center; color:#999; padding:16px;">暂无课程，点击下方「＋ 添加课程」手动录入</div>`
      : courses.slice().sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime)).map(c => `
        <div style="display:flex; align-items:center; gap:8px; padding:6px 8px; border-bottom:1px solid #f0f0f0; font-size:13px;">
          <span style="width:44px; color:#667eea; font-weight:600;">${dayNames[(c.day || 1) - 1]}</span>
          <span style="width:96px; color:#666; font-variant-numeric:tabular-nums;">${c.startTime}-${c.endTime}</span>
          <span style="flex:1; font-weight:600;">${c.name || '未命名'}</span>
          <span style="color:#999;">${c.location || ''}</span>
          ${c.weekType && c.weekType !== '每周' ? `<span class="tag tag-primary" style="font-size:11px;">${c.weekType}</span>` : ''}
          ${Number(c.credits) > 0 ? `<span class="tag tag-highlight" style="font-size:11px;">${Number(c.credits)} 学分</span>` : ''}
          <button class="edit-course-btn" data-id="${c.id}"
                  style="padding:2px 10px; font-size:12px; background:#f0f0f0; border:1px solid #ddd; border-radius:4px; cursor:pointer;">编辑</button>
          <button class="delete-course-btn" data-id="${c.id}"
                  style="padding:2px 10px; font-size:12px; background:#fff0f0; color:#d33; border:1px solid #f0d0d0; border-radius:4px; cursor:pointer;">删除</button>
        </div>`).join('');

    const old = document.getElementById('courseTableModal');
    if (old) old.remove();

    const modalHTML = `
      <div id="courseTableModal" class="modal-overlay">
        <div class="modal" style="max-width: 1080px; width: 96%;">
          <div class="modal-header">
            <div class="modal-title">📋 课表确认 <span style="font-size:14px; font-weight:400; color:#888;">共 ${courses.length} 门课</span></div>
            <button class="modal-close" onclick="hideModal('courseTableModal')">&times;</button>
          </div>
          <div class="modal-body">
            ${skipBanner}
            <div id="courseTableGrid"></div>

            <details style="margin-top: 12px;">
              <summary style="cursor:pointer; font-size:13px; color:#666; padding:4px 0;">
                📖 展开课程清单（${courses.length} 条，可逐条编辑或删除）
              </summary>
              <div style="max-height: 280px; overflow-y: auto; border: 1px solid #eee; border-radius: 6px; padding: 4px; margin-top: 8px;">
                ${listPanel}
              </div>
            </details>

            <div class="flex justify-between" style="margin-top: 16px;">
              <button class="btn btn-success" onclick="hideModal('courseTableModal'); ScheduleApp.showAddCourseModal()">＋ 添加课程</button>
              <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" onclick="hideModal('courseTableModal')">稍后处理</button>
                <button class="btn btn-primary" onclick="ScheduleApp.saveCourseTable()">保存课表</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    showModal('courseTableModal');

    // 用时间轴渲染器绘制周课表（点击色块即可编辑）
    // getSource 让「周次切换」和「编辑后重绘」都读取最新数据
    ScheduleViz.createWeekGrid(courses, document.getElementById('courseTableGrid'), {
      week: ScheduleViz.weekState.current,
      compact: true,
      getSource: () => ScheduleManager.getAllCourses(),
      onEdit: (id) => this.showEditCourseModal(id)
    });

    // 绑定清单里的编辑/删除
    document.querySelectorAll('#courseTableModal .edit-course-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.showEditCourseModal(btn.getAttribute('data-id'));
      });
    });
    document.querySelectorAll('#courseTableModal .delete-course-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('确定删除这门课？')) {
          ScheduleManager.deleteCourse(btn.getAttribute('data-id'));
          this.showCourseTableModal(ScheduleManager.getAllCourses());
        }
      });
    });
  },

  /**
   * 显示编辑课程模态框
   */
  showEditCourseModal(courseId) {
    const courses = ScheduleManager.getAllCourses();
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    const modalHTML = `
      <div id="editCourseModal" class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">✏️ 编辑课程</div>
            <button class="modal-close" onclick="hideModal('editCourseModal')">&times;</button>
          </div>
          <div class="modal-body">
            <form id="editCourseForm">
              <input type="hidden" id="editCourseId" value="${course.id}">
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">课程名称</label>
                <input type="text" id="editCourseName" class="input-field" value="${course.name || ''}" required placeholder="例如：高等数学">
              </div>
              <div class="grid grid-cols-2" style="gap: 16px; margin-bottom: 16px;">
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 500;">星期</label>
                  <select id="editCourseDay" class="input-field">
                    ${[1, 2, 3, 4, 5, 6, 7].map(d => `<option value="${d}" ${course.day === d ? 'selected' : ''}>${dayNames[d - 1]}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 500;">学分 <span style="font-weight:400;color:#98a0b6;font-size:12px;">选填，用于学业权重</span></label>
                  <input type="number" id="editCourseCredits" class="input-field" value="${course.credits || ''}" placeholder="例如：4" min="1" max="10">
                </div>
              </div>
              <div class="grid grid-cols-2" style="gap: 16px; margin-bottom: 16px;">
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 500;">开始时间</label>
                  <input type="time" id="editCourseStartTime" class="input-field" value="${course.startTime || '09:00'}" required>
                </div>
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 500;">结束时间</label>
                  <input type="time" id="editCourseEndTime" class="input-field" value="${course.endTime || '10:40'}" required>
                </div>
              </div>
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">教室地点</label>
                <input type="text" id="editCourseLocation" class="input-field" value="${course.location || ''}" placeholder="例如：A101">
              </div>
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">周次类型</label>
                <select id="editCourseWeekType" class="input-field">
                  <option value="每周" ${course.weekType === '每周' ? 'selected' : ''}>每周都上课</option>
                  <option value="单周" ${course.weekType === '单周' ? 'selected' : ''}>仅单周上课</option>
                  <option value="双周" ${course.weekType === '双周' ? 'selected' : ''}>仅双周上课</option>
                  <option value="隔周" ${course.weekType === '隔周' ? 'selected' : ''}>隔周上课</option>
                </select>
              </div>
              <div class="grid grid-cols-2" style="gap: 16px; margin-bottom: 24px;">
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 500;">起始周</label>
                  <input type="number" id="editCourseStartWeek" class="input-field" value="${course.startWeek || 1}" min="1" max="20">
                </div>
                <div>
                  <label style="display: block; margin-bottom: 8px; font-weight: 500;">持续周数</label>
                  <input type="number" id="editCourseDuration" class="input-field" value="${course.durationWeeks || 16}" min="1" max="20" placeholder="例如：16">
                </div>
              </div>
              <div class="flex justify-between">
                <button type="button" class="btn btn-secondary" onclick="hideModal('editCourseModal')">取消</button>
                <button type="submit" class="btn btn-primary">保存修改</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    showModal('editCourseModal');

    // 绑定表单提交
    const form = document.getElementById('editCourseForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveEditedCourse(courseId, form);
    });
  },

  /**
   * 保存编辑的课程
   */
  saveEditedCourse(courseId, form) {
    const updates = {
      name: document.getElementById('editCourseName').value.trim(),
      day: parseInt(document.getElementById('editCourseDay').value),
      credits: parseFloat(document.getElementById('editCourseCredits').value) || 0,
      startTime: document.getElementById('editCourseStartTime').value,
      endTime: document.getElementById('editCourseEndTime').value,
      location: document.getElementById('editCourseLocation').value.trim(),
      weekType: document.getElementById('editCourseWeekType').value,
      startWeek: parseInt(document.getElementById('editCourseStartWeek')?.value) || 1,
      durationWeeks: parseInt(document.getElementById('editCourseDuration').value) || 16
    };

    ScheduleManager.updateCourse(courseId, updates);

    hideModal('editCourseModal');
    this.refreshViews();
    showToast('课程已更新', 'success');
  },

  /**
   * 编辑后刷新所有可见视图（不重新弹出模态框）
   */
  refreshViews() {
    const courses = ScheduleManager.getAllCourses();

    // 统计先刷新（它会决定周次选择器的上限）
    this.updateStatistics(courses);

    // 若课表编辑弹窗开着，只重绘其中的周课表
    const grid = document.getElementById('courseTableGrid');
    if (grid) {
      ScheduleViz.createWeekGrid(courses, grid, {
        week: ScheduleViz.weekState.current,
        compact: true,
        getSource: () => ScheduleManager.getAllCourses(),
        onEdit: (id) => this.showEditCourseModal(id)
      });
    }

    // 若分析弹窗开着，同步重绘
    const modal = document.getElementById('analysisModal');
    if (modal && modal.classList.contains('active')) {
      this.renderAnalysisModal(ScheduleManager.getAllCourses());
    }
  },

  /**
   * 重新渲染当前表格
   */
  renderCurrentTable() {
    const courses = ScheduleManager.getAllCourses();
    this.showCourseTableModal(courses);
  },

  /**
   * 保存课程表格
   */
  saveCourseTable() {
    hideModal('courseTableModal');
    this.renderSchedule(ScheduleManager.getAllCourses());
    showToast('课表已保存，点「📊 分析当前课表」查看报告', 'success');
  },

  /**
   * 渲染课表视图
   */
  renderSchedule(courses) {
    const calendarContainer = document.getElementById('calendarView');
    if (calendarContainer) {
      ScheduleViz.createCalendarView(courses, calendarContainer);
    }

    // 更新统计数据
    this.updateStatistics(courses);
  },

  /**
   * 更新统计信息
   */
  updateStatistics(courses) {
    const toMin = t => {
      const [h, m] = String(t || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const hoursOf = c => Math.max(0, toMin(c.endTime) - toMin(c.startTime)) / 60;
    // 单/双/隔周课程平均到每周只算一半
    const weeklyFactor = c => (c.weekType && c.weekType !== '每周') ? 0.5 : 1;
    // 整学期实际要上的次数
    const sessions = c => {
      const dur = parseInt(c.durationWeeks) || 16;
      return (c.weekType && c.weekType !== '每周') ? Math.ceil(dur / 2) : dur;
    };

    const weeklyHours = courses.reduce((s, c) => s + hoursOf(c) * weeklyFactor(c), 0);
    const totalHours = courses.reduce((s, c) => s + hoursOf(c) * sessions(c), 0);
    const distinctCourses = new Set(courses.map(c => (c.name || '').trim())).size;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('totalHours', `${weeklyHours.toFixed(1)}h`);
    set('totalHoursAll', `${Math.round(totalHours)}h`);
    set('totalCourses', distinctCourses);
    set('totalSessions', courses.length);

    // 学期总周数跟随实际数据，供周次选择器使用
    const maxWeek = Math.max(1, ...courses.map(c =>
      (parseInt(c.startWeek) || 1) + (parseInt(c.durationWeeks) || 16) - 1));
    ScheduleViz.weekState.total = Math.min(25, Math.max(16, maxWeek));
    ScheduleViz.weekState.current = Math.min(ScheduleViz.weekState.current, ScheduleViz.weekState.total);
  },

  /**
   * 分析当前课表：弹窗展示（上=课表，中=建议标红，下=五维雷达）
   */
  analyzeCurrentSchedule() {
    const courses = ScheduleManager.getAllCourses();
    if (courses.length === 0) {
      showToast('请先导入或添加课程', 'warning');
      return;
    }

    this.report = ScheduleAnalyzer.analyze(courses);
    showModal('analysisModal');
    this.renderAnalysisModal(courses);
  },

  /**
   * 把分析结果画进弹窗
   */
  renderAnalysisModal(courses) {
    const analysis = this.report || ScheduleAnalyzer.analyze(courses);

    // ① 课表（跟随周次切换）
    const gridEl = document.getElementById('analysisGrid');
    if (gridEl) {
      ScheduleViz.createWeekGrid(courses, gridEl, {
        compact: true,
        getSource: () => ScheduleManager.getAllCourses(),
        onEdit: (id) => this.showEditCourseModal(id)
      });
    }

    // ② 一句话结论
    const summaryEl = document.getElementById('analysisSummary');
    if (summaryEl) summaryEl.innerHTML = this.buildSummary(analysis);

    // ③ 建议（重点标红）
    const adviceEl = document.getElementById('analysisAdvice');
    if (adviceEl) adviceEl.innerHTML = this.buildAdviceHTML(analysis);

    // ④ 雷达图
    const radarEl = document.getElementById('analysisRadar');
    if (radarEl) ScheduleViz.createRadarChart(analysis.visualizationData, radarEl);
  },

  /**
   * 顶部结论句
   */
  buildSummary(analysis) {
    const v = analysis.visualizationData;
    const danger = analysis.scheduleRisks.filter(r => r.severity === 'danger');
    const warn = analysis.scheduleRisks.filter(r => r.severity === 'warning');
    let focus;
    if (danger.length) {
      focus = `最需要注意的是 <span class="hl-danger">${danger[0].label}</span>`;
    } else if (warn.length) {
      focus = `需要留意 <span class="hl-warn">${warn[0].label}</span>`;
    } else {
      focus = `作息与负荷都在<span class="hl-ok">健康区间</span>`;
    }
    return `共 <b>${v.totalCourses}</b> 门课、每周约 <b>${v.totalHours.toFixed(1)} 小时</b>、${v.weeklySessions} 节；`
      + `风险 ${analysis.scheduleRisks.length} 条，${focus}。`
      + `<div class="adv-note">在上方课表切换周次，可只看当周要上的课；点击色块能直接改课。</div>`;
  },

  /**
   * 四组建议：课程预警 / 学业权重 / 作息风险 / 碎片时间
   */
  buildAdviceHTML(analysis) {
    const groups = [
      this.advWarningGroup(analysis),
      this.advWeightGroup(analysis),
      this.advRiskGroup(analysis),
      this.advFragmentGroup(analysis)
    ];
    return groups.filter(Boolean).map(g => `
      <div class="adv ${g.wide ? 'adv-wide' : ''}">
        <div class="adv-h">${g.title}</div>
        <ul>${g.items.map(i => `<li class="${i.cls || ''}">${i.html}</li>`).join('')}</ul>
        ${g.note ? `<div class="adv-note">${g.note}</div>` : ''}
        ${g.button || ''}
      </div>`).join('');
  },

  /** ① 课程预警：单双周 / 隔周 / 短学期 */
  advWarningGroup(analysis) {
    const items = analysis.specialPatterns.map(p => {
      const names = Array.isArray(p.courses) ? p.courses.map(c => c.name || c).join('、') : '';
      const cls = p.severity === 'warning' ? 'danger' : '';
      const key = p.severity === 'warning' ? 'hl-danger' : 'hl-warn';
      // shortTerm 的 description 里已经带课名，不再重复列一遍
      const showNames = p.type !== 'shortTerm' && names;
      return {
        cls,
        html: `<span class="${key}">${p.label}</span>：${p.description}`
          + (showNames ? `<span class="adv-sub"> ${names}</span>` : '')
      };
    });

    if (items.length === 0) {
      return { title: '🗓️ 课程预警', items: [{ cls: 'ok', html: '全部课程都是<span class="hl-ok">每周固定上</span>，按表走就行，不用额外记周次。' }] };
    }
    return {
      title: '🗓️ 课程预警',
      items,
      note: '这类课最容易「跑到教室发现今天没课」，建议把它们单独设成手机日历提醒，避开连续几周的空跑。',
      button: `<button class="adv-btn" onclick="ScheduleApp.copyReminderList()">📋 复制「非常规周次」清单，去日历里新建提醒</button>`
    };
  },

  /** ② 学业权重：高学分必修课 */
  advWeightGroup(analysis) {
    const list = analysis.highWeightCourses.slice(0, 4);
    if (list.length === 0) {
      return { title: '📚 学业权重', items: [{ html: '课表里<span class="hl-warn">没有学分信息</span>，先在课程里补开学分，才能算出该重点投入哪门课。' }] };
    }
    const fmt = c => Number(c.credits) > 0
      ? `${Number(c.credits)} 学分`
      : '未填学分';
    return {
      title: '📚 学业权重（重点投入）',
      items: list.map(c => ({
        cls: 'danger',
        html: `《${c.name}》<span class="hl-danger">${fmt(c)} · 每周 ${c.weeklySessions} 节</span>`
          + `<span class="adv-sub"> ${c.reasons || '核心课程'}</span>`
      })),
      note: '这些课建议课后至少留 1 倍课时复习，别把作业压到截止日。'
        + (list.some(c => !Number(c.credits)) ? '（点课表色块补开学分，权重会算得更准）' : '')
        + (analysis.highWeightCourses.length > list.length
          ? ` 另有 ${analysis.highWeightCourses.length - list.length} 门次重点课程未列出。` : '')
    };
  },

  /** ③ 作息风险：连续早八 / 晚间满课 / 超负荷日 */
  advRiskGroup(analysis) {
    const order = { danger: 0, warning: 1, info: 2 };
    const risks = [...analysis.scheduleRisks]
      .sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3))
      .slice(0, 5);
    if (risks.length === 0) {
      return { title: '⚡ 作息风险', items: [{ cls: 'ok', html: '没有连续早八、也没有晚间连堂，<span class="hl-ok">睡眠基本安全</span>。' }] };
    }
    const key = s => (s === 'danger' ? 'hl-danger' : s === 'warning' ? 'hl-warn' : '');
    return {
      title: '⚡ 作息风险',
      wide: true,
      items: risks.map(r => ({
        cls: r.severity === 'danger' ? 'danger' : '',
        html: `<span class="${key(r.severity)}">${r.label}</span> ${r.description}`
      })),
      note: '红线那几条会实打实吃掉睡眠和运动时间：连着早八的晚上别超过 24:00，满课那天把非作业类任务往后挪。'
    };
  },

  /** ④ 碎片时间：所有空课日并成一行，只写清是哪几天几点 */
  advFragmentGroup(analysis) {
    const f = analysis.fragmentTime;
    const light = f.fragments.filter(x => x.fragmentCount <= 2);
    if (light.length === 0) {
      return { title: '⏱️ 碎片时间', items: [{ html: '课排得比较满，<span class="hl-warn">整块空档不多</span>，可以把自习固定到晚间或周末。' }] };
    }
    // 有课但很空的几天按空闲时长取前 3；完全没课的日子合并成一句
    const partly = light.filter(x => x.fragmentCount > 0)
      .sort((a, b) => b.freeHours - a.freeHours).slice(0, 3)
      .map(x => `${x.dayName} ${x.firstStart}-${x.lastEnd} 只 ${x.fragmentCount} 节（空约 ${x.freeHours}h）`);
    const free = light.filter(x => x.fragmentCount === 0).map(x => x.dayName);
    const span = [...partly, ...(free.length ? [`${free.join('、')} 全天没课`] : [])].join('、');
    return {
      title: '⏱️ 碎片时间',
      wide: true,
      items: [{
        cls: 'danger',
        html: `课少的日子：<span class="hl-danger">${span}</span> —— `
          + `这些空档<span class="hl-danger">别用刷手机填满</span>，提前定好要做的一件事（${light[0].suggestion}）即可。`
      }],
      note: f.overallSuggestion
    };
  },

  /**
   * 复制非常规周次课程清单（方便粘进日历备注）
   */
  copyReminderList() {
    const courses = ScheduleManager.getAllCourses();
    const special = courses.filter(c =>
      (c.weekType && c.weekType !== '每周') || (parseInt(c.durationWeeks) || 20) < 20);
    if (special.length === 0) {
      showToast('没有需要单独提醒的课程', 'info');
      return;
    }
    const lines = special.map(c => {
      const sw = parseInt(c.startWeek) || 1;
      const dw = parseInt(c.durationWeeks) || 16;
      const tag = c.weekType && c.weekType !== '每周' ? c.weekType : '';
      const day = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][(parseInt(c.day) || 1) - 1];
      return `${c.name} ${day} ${c.startTime}-${c.endTime}｜第${sw}-${sw + dw - 1}周${tag ? '（' + tag + '）' : ''}`;
    });
    const text = '【需要设日历提醒的课】\n' + lines.join('\n');

    const done = () => showToast('清单已复制，去日历里逐条新建提醒即可', 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this.fallbackCopy(text, done));
    } else {
      this.fallbackCopy(text, done);
    }
  },

  fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); }
    catch (e) { showToast('复制失败，请手动记录', 'error'); }
    document.body.removeChild(ta);
  },

  /**
   * 显示添加课程模态框（整周时间轴方式）
   */
  showAddCourseModal() {
    showModal('addCourseModal');

    // 等待模态框完全显示后再渲染表格
    setTimeout(() => this.renderManualScheduleTable(), 100);
  },

  /**
   * 渲染手动添加的时间轴表格
   */
  /**
   * 渲染手动添加的时间轴表格（行=节次，列=星期，一节课一个大格）
   */
  renderManualScheduleTable() {
    const tbody = document.getElementById('manualScheduleBody');
    if (!tbody) return;

    const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const periods = Object.keys(ScheduleManager.periodTimes)
      .map(Number).sort((a, b) => a - b);

    const allCourses = ScheduleManager.getAllCourses();
    const toMin = t => {
      const [h, m] = String(t || '0:0').split(':').map(Number);
      return h * 60 + (m || 0);
    };
    const courseAt = (day, period) => {
      const [s, e] = ScheduleManager.periodTimes[period];
      const mid = (toMin(s) + toMin(e)) / 2;
      return allCourses.find(c =>
        c.day === day && mid >= toMin(c.startTime) && mid < toMin(c.endTime));
    };

    let rowsHTML = '';
    for (const p of periods) {
      const [s, e] = ScheduleManager.periodTimes[p];
      rowsHTML += `<tr class="time-row" style="border-bottom: 1px solid #eee;">
        <td style="padding: 4px 8px; font-size: 11px; color: #555; text-align: center; background: #fafafa; white-space: nowrap;">
          <b>第${p}节</b><br><span style="color:#9aa0ae;">${s}</span>
        </td>
        ${[1, 2, 3, 4, 5, 6, 7].map(day => {
          const occupied = courseAt(day, p);
          return `
          <td class="time-cell ${occupied ? 'has-course' : ''}"
              data-day="${day}" data-period="${p}" data-time="${s}"
              onclick="ScheduleApp.handleTimeCellClick('${day}', '${p}', '${s}')"
              style="cursor: pointer; padding: 2px;">
            <div class="time-slot-inner" style="height: 30px; border-radius: 5px;
                 background: ${occupied ? 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' : 'transparent'};
                 border: 1px dashed ${occupied ? 'transparent' : '#e3e6ef'};">
              ${occupied ? `<span style="font-size: 10px; color: #fff; display: block; padding: 2px 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${occupied.name || ''}</span>` : ''}
            </div>
          </td>`;
        }).join('')}
      </tr>`;
    }
    tbody.innerHTML = rowsHTML;

    // 表头首列改为「节次」
    const corner = document.querySelector('#addCourseModal thead th');
    if (corner) corner.textContent = '节次 \\ 星期';

    // 填充星期下拉框
    const daySelect = document.getElementById('courseDay');
    if (daySelect && daySelect.options.length === 0) {
      daySelect.innerHTML = dayNames
        .map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
    }

    const formBox = document.getElementById('addCourseFormContainer');
    if (formBox) formBox.style.display = 'none';
    const form = document.querySelector('#courseForm');
    if (form) form.reset();

    this.bindCourseFormSubmit();
  },

  /**
   * 绑定课程表单提交事件（只绑定一次）
   */
  bindCourseFormSubmit() {
    const courseForm = document.getElementById('courseForm');
    if (!courseForm) {
      console.warn('找不到 courseForm 元素');
      return;
    }

    if (courseForm.dataset.handlerBound === 'true') {
      console.log('表单已绑定，跳过');
      return;
    }

    courseForm.dataset.handlerBound = 'true';
    courseForm.addEventListener('submit', (e) => this.handleCourseFormSubmit(e));
    console.log('表单提交事件已绑定');
  },

  /**
   * 处理节次格子点击
   * @param {string|number} day    1=周一 ... 7=周日
   * @param {string|number} period 节次序号
   * @param {string} time          该节次开始时间 HH:mm
   */
  handleTimeCellClick(day, period, time) {
    period = parseInt(period, 10);

    // 默认连上两节（第 N、N+1 节），结束时间取下一节的下课时间
    const next = ScheduleManager.periodTimes[period + 1];
    const thisPeriod = ScheduleManager.periodTimes[period];
    const endTime = next ? next[1] : (() => {
      const [h, m] = thisPeriod[1].split(':').map(Number);
      const t = h * 60 + m + 45;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    })();

    document.getElementById('tempAddedDay').value = day;
    document.getElementById('tempAddedStart').value = time;
    document.getElementById('tempAddedEnd').value = endTime;

    document.getElementById('courseDay').value = day;
    document.getElementById('courseStartTime').value = time;
    document.getElementById('courseEndTime').value = endTime;

    // 提示所选节次
    const hint = document.getElementById('selectedSlotHint');
    if (hint) hint.textContent =
      `已选：${['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][day]} 第${period}节起 ${time}-${endTime}`;

    document.getElementById('addCourseFormContainer').style.display = 'block';
    document.getElementById('courseName').focus();
  },

  /**
   * 取消添加课程
   */
  cancelAdding() {
    document.getElementById('addCourseFormContainer').style.display = 'none';
    document.querySelector('#courseForm').reset();
  },

  /**
   * 处理表单提交
   */
  handleCourseFormSubmit(e) {
    e.preventDefault();

    const course = {
      id: generateId(),
      name: document.getElementById('courseName').value.trim(),
      day: parseInt(document.getElementById('tempAddedDay').value),
      startTime: document.getElementById('courseStartTime').value,
      endTime: document.getElementById('courseEndTime').value,
      credits: parseFloat(document.getElementById('courseCredits').value) || 0,
      location: document.getElementById('courseLocation').value.trim(),
      weekType: document.getElementById('courseWeekType').value,
      startWeek: parseInt(document.getElementById('courseStartWeek')?.value) || 1,
      durationWeeks: parseInt(document.getElementById('courseDuration').value) || 16
    };

    if (!course.name) {
      showToast('请输入课程名称', 'warning');
      return;
    }

    // 保存到管理器
    ScheduleManager.addCourse(course);
    showToast(`课程 "${course.name}" 已添加`, 'success');

    // 关闭添加弹窗并清空表单
    this.cancelAdding();
    hideModal('addCourseModal');

    // 刷新课表视图、统计数字与（若开着的）编辑弹窗
    this.refreshViews();
    this.renderSchedule(ScheduleManager.getAllCourses());
    this.updateStatistics(ScheduleManager.getAllCourses());
  },

  /**
   * 导出课表
   */
  exportSchedule() {
    const courses = ScheduleManager.getAllCourses();
    if (courses.length === 0) {
      showToast('没有可导出的课程', 'warning');
      return;
    }

    const jsonData = JSON.stringify(courses, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    downloadFile(blob, `schedule_${formatDate(new Date(), 'YYYY-MM-DD')}.json`, 'application/json');
  },

  /**
   * 清空所有数据
   */
  clearAllData() {
    if (confirm('确定要清空所有课表数据吗？此操作不可恢复。')) {
      StorageManager.remove(ScheduleManager.dataKey);
      location.reload();
    }
  }
};

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  ScheduleApp.init();
});

// 导出全局对象
window.ScheduleApp = ScheduleApp;
window.BusyProgress = BusyProgress;

// 供 HTML 内联 onclick 使用的全局别名
window.cancelAdding = () => ScheduleApp.cancelAdding();
window.saveCourseTable = () => ScheduleApp.saveCourseTable();
