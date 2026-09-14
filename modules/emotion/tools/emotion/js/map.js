/* ========================================
   校园地图渲染模块 - 情绪地图（手绘卡通风格）
   负责地图绘制、地点渲染、热力图效果
   ======================================== */

const CampusMap = {
  canvas: null,
  ctx: null,
  container: null,
  locations: [],
  emotions: [],
  selectedLocation: null,
  isDragging: false,
  dragLocation: null,
  dragOffset: { x: 0, y: 0 },

  // 视图变换（缩放/平移）
  view: { scale: 1, x: 0, y: 0 },
  minScale: 0.6,
  maxScale: 3,
  isPanning: false,
  panStartScreen: { x: 0, y: 0 },
  panStartView: { x: 0, y: 0 },
  movedDuringDrag: false,
  // 双指缩放
  pinchStartDist: 0,
  pinchStartScale: 1,

  // 悬停放大
  hoveredLocation: null,
  hoverScale: 1.12,
  _hoverRaf: null,
  _touchMode: false,

  // 静态图层缓存（草地/道路/装饰只绘制一次）
  _bgCanvas: null,

  // 地图配置（16:9，与效果图比例一致）
  config: {
    width: 1200,
    height: 675,
    locationRadius: 44
  },

  // 素材版本号（与 index.html 里的 ?v= 保持一致，用于缓存穿透）
  ASSET_V: '20260912b',

  // 心情图片缓存
  moodImages: {},
  moodImagesLoaded: false,

  // 建筑素材（离线处理好的透明 PNG）
  buildingSprites: {},
  buildingSpritesLoaded: false,

  // 像素风配色（对齐效果图）
  colors: {
    grass: '#8CC63F',          // 主草地
    grassDark: '#6FA82E',      // 深绿
    grassLight: '#A5D95C',     // 浅绿斑块
    // ---- 土黄路径（效果同款的校园步道） ----
    road: '#D9C89A',           // 路面
    roadEdge: '#C0AC7C',       // 路缘
    roadLight: '#E6D9B4',      // 路面高光
    // ---- 栅栏 ----
    fence: '#C08A5A',          // 横梁
    fenceDark: '#8B5636',      // 描边
    fencePost: '#A86E44',      // 立柱
    // ---- 植被 ----
    tree: '#4E9B2E',           // 树冠
    treeDark: '#356E1E',       // 树冠暗面
    treeLight: '#79C24A',      // 树冠高光
    trunk: '#8B5A2B',          // 树干
    // ---- 建筑（手绘补充用） ----
    wall: '#D9773F',           // 砖墙
    wallLight: '#E89A5E',      // 砖墙亮面
    wallShade: '#B85E2E',      // 砖墙暗面
    roofBlue: '#3E6FA8',       // 蓝屋顶
    roofBlueLight: '#5A8FC8',
    window: '#8FC4EC',         // 窗户
    outline: '#4A3328',        // 像素风深描边
    // ---- 湖水 ----
    water: '#6FC3E8',
    waterLight: '#A8DDF2',
    sand: '#E8DCB8',
    // ---- 标签（效果图：白描边 + 深色字） ----
    labelText: '#2B2B2B',
    labelStroke: '#FFFFFF',
    labelActive: '#E8552F',
    // ---- 心情色 ----
    moodHappy: '#51CF66',
    moodCalm: '#4A90D9',
    moodNeutral: '#FFD43B',
    moodAnxious: '#FF922B',
    moodSad: '#FF6B6B'
  },

  /* 预设地点（按效果图排布）
     x = 中心横向坐标，y = 建筑底部基线，imgW = 绘制宽度 */
  presetLocations: [
    // —— 上排 ——
    { id: 'loc_gate',       name: '校门',   x: 140,  y: 210, icon: '🏫', sprite: 'gate',       imgW: 150, isPreset: true, desc: '梦想的起点' },
    { id: 'loc_teaching',   name: '教学楼', x: 455,  y: 215, icon: '📚', sprite: 'teaching',   imgW: 290, isPreset: true, desc: '知识的殿堂' },
    { id: 'loc_dorm',       name: '寝室',   x: 900,  y: 205, icon: '🏠', sprite: 'dorm',       imgW: 160, isPreset: true, desc: '温馨的小窝' },
    // —— 中排 ——
    { id: 'loc_canteen',    name: '食堂',   x: 145,  y: 415, icon: '🍜', sprite: 'canteen',    imgW: 150, isPreset: true, desc: '美食的天堂' },
    { id: 'loc_lab',        name: '实验室', x: 420,  y: 410, icon: '🔬', type: 'lab',          isPreset: true, desc: '探索未知' },
    { id: 'loc_library',    name: '图书馆', x: 805,  y: 420, icon: '📖', sprite: 'library',    imgW: 190, isPreset: true, desc: '静谧书海' },
    { id: 'loc_gym',        name: '体育馆', x: 1105, y: 415, icon: '🏀', type: 'gym',          isPreset: true, desc: '挥洒汗水' },
    // —— 下排 ——
    { id: 'loc_park',       name: '小花园', x: 145,  y: 640, icon: '🌸', type: 'garden',       isPreset: true, desc: '静享花开' },
    { id: 'loc_lake',       name: '学子湖', x: 440,  y: 635, icon: '🐟', type: 'pavilion',     isPreset: true, desc: '湖光潋滟' },
    { id: 'loc_playground', name: '操场',   x: 815,  y: 645, icon: '🏃', sprite: 'playground', imgW: 300, isPreset: true, desc: '奔跑吧青春' }
  ],

  /* 路网（三条横路 × 三条纵路，把校园切成九宫格街区） */
  roads: [
    // 上横路
    { w: 50, pts: [{ x: 8, y: 245 }, { x: 262, y: 252 }, { x: 510, y: 244 }, { x: 760, y: 252 }, { x: 1000, y: 244 }, { x: 1192, y: 250 }] },
    // 中横路
    { w: 48, pts: [{ x: 8, y: 450 }, { x: 262, y: 458 }, { x: 510, y: 449 }, { x: 760, y: 458 }, { x: 1000, y: 449 }, { x: 1192, y: 456 }] },
    // 左纵路
    { w: 46, pts: [{ x: 262, y: 58 }, { x: 258, y: 245 }, { x: 264, y: 450 }, { x: 260, y: 600 }, { x: 264, y: 692 }] },
    // 中纵路
    { w: 52, pts: [{ x: 628, y: 40 }, { x: 624, y: 245 }, { x: 630, y: 450 }, { x: 626, y: 600 }, { x: 630, y: 692 }] },
    // 右纵路
    { w: 46, pts: [{ x: 1000, y: 58 }, { x: 996, y: 245 }, { x: 1002, y: 450 }, { x: 998, y: 600 }, { x: 1002, y: 692 }] }
  ],

  /* 装饰物（树丛 / 灌木 / 花丛，全部避开建筑与道路） */
  decorations: [
    // —— 上方街区 ——
    { type: 'tree', x: 46, y: 96, size: 22 },
    { type: 'tree', x: 92, y: 74, size: 17 },
    { type: 'tree', x: 40, y: 158, size: 16 },
    { type: 'tree', x: 200, y: 96, size: 18 },
    { type: 'tree', x: 560, y: 88, size: 20 },
    { type: 'tree', x: 596, y: 128, size: 15 },
    { type: 'tree', x: 690, y: 82, size: 18 },
    { type: 'tree', x: 730, y: 124, size: 14 },
    { type: 'tree', x: 1080, y: 84, size: 20 },
    { type: 'tree', x: 1128, y: 122, size: 16 },
    { type: 'tree', x: 1156, y: 76, size: 14 },
    { type: 'tree', x: 820, y: 168, size: 15 },
    // —— 中部街区 ——
    { type: 'tree', x: 40, y: 300, size: 17 },
    { type: 'tree', x: 214, y: 312, size: 15 },
    { type: 'tree', x: 290, y: 336, size: 16 },
    { type: 'tree', x: 552, y: 320, size: 18 },
    { type: 'tree', x: 672, y: 340, size: 15 },
    { type: 'tree', x: 940, y: 316, size: 17 },
    { type: 'tree', x: 1168, y: 320, size: 15 },
    { type: 'tree', x: 1080, y: 356, size: 13 },
    // —— 下方街区 ——
    { type: 'tree', x: 44, y: 486, size: 18 },
    { type: 'tree', x: 210, y: 500, size: 15 },
    { type: 'tree', x: 300, y: 552, size: 17 },
    { type: 'tree', x: 552, y: 512, size: 16 },
    { type: 'tree', x: 590, y: 554, size: 14 },
    { type: 'tree', x: 300, y: 640, size: 15 },
    { type: 'tree', x: 560, y: 636, size: 16 },
    { type: 'tree', x: 1060, y: 512, size: 17 },
    { type: 'tree', x: 1116, y: 556, size: 14 },
    { type: 'tree', x: 1152, y: 620, size: 16 },
    { type: 'tree', x: 940, y: 612, size: 15 },
    // 灌木
    { type: 'bush', x: 150, y: 128, size: 13 },
    { type: 'bush', x: 300, y: 90, size: 12 },
    { type: 'bush', x: 640, y: 172, size: 12 },
    { type: 'bush', x: 1046, y: 160, size: 12 },
    { type: 'bush', x: 74, y: 366, size: 12 },
    { type: 'bush', x: 348, y: 386, size: 11 },
    { type: 'bush', x: 690, y: 386, size: 12 },
    { type: 'bush', x: 946, y: 388, size: 11 },
    { type: 'bush', x: 96, y: 560, size: 12 },
    { type: 'bush', x: 240, y: 600, size: 11 },
    { type: 'bush', x: 620, y: 520, size: 12 },
    { type: 'bush', x: 900, y: 484, size: 11 },
    // 花丛
    { type: 'flower', x: 118, y: 60, size: 6 },
    { type: 'flower', x: 146, y: 82, size: 5 },
    { type: 'flower', x: 676, y: 196, size: 6 },
    { type: 'flower', x: 706, y: 214, size: 5 },
    { type: 'flower', x: 1096, y: 208, size: 6 },
    { type: 'flower', x: 66, y: 248, size: 5 },
    { type: 'flower', x: 590, y: 400, size: 6 },
    { type: 'flower', x: 616, y: 386, size: 5 },
    { type: 'flower', x: 176, y: 522, size: 6 },
    { type: 'flower', x: 202, y: 540, size: 5 },
    { type: 'flower', x: 972, y: 646, size: 6 },
    { type: 'flower', x: 1092, y: 648, size: 5 }
  ],

  /**
   * 初始化地图
   */
  init(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('地图容器未找到:', containerId);
      return;
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
    this.canvas.style.cursor = 'pointer';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    if (!this.ctx) {
      console.error('Canvas 2D 上下文获取失败');
      return;
    }

    this.loadData();
    this.loadMoodImages();
    this.loadBuildingSprites();
    this.bindEvents();
    this.renderLegend();
    this.render();

    console.log('✅ 地图初始化完成，尺寸:', this.canvas.width, 'x', this.canvas.height, '地点数:', this.locations.length);
  },

  loadData() {
    const customLocations = StorageManager.load('emotion_custom_locations') || [];
    this.locations = [...this.presetLocations, ...customLocations];
    this.emotions = StorageManager.load('emotion_records') || [];

    // 初始化悬停缩放状态
    this.locations.forEach(loc => {
      if (loc._scale === undefined) loc._scale = 1;
      if (loc._targetScale === undefined) loc._targetScale = 1;
    });
  },

  /**
   * 预加载心情图片
   */
  loadMoodImages() {
    const moodList = [
      { level: 5, src: 'assets/happy.png' },
      { level: 4, src: 'assets/calm.png' },
      { level: 3, src: 'assets/nutral.png' },
      { level: 2, src: 'assets/anxious.png' },
      { level: 1, src: 'assets/sad.png' }
    ];
    let loaded = 0;
    moodList.forEach(mood => {
      const img = new Image();
      img.onload = () => {
        loaded++;
        if (loaded === moodList.length) {
          this.moodImagesLoaded = true;
          this.render();
        }
      };
      img.src = mood.src + '?v=' + this.ASSET_V;
      this.moodImages[mood.level] = img;
    });
  },

  /**
   * 加载建筑素材（已离线抠过背景的透明 PNG）
   */
  loadBuildingSprites() {
    const keys = ['gate', 'teaching', 'library', 'dorm', 'canteen', 'playground'];
    let loaded = 0;
    let failed = 0;

    keys.forEach(key => {
      const img = new Image();
      img.onload = () => {
        this.buildingSprites[key] = img;
        loaded++;
        this._checkSpritesDone(loaded, failed, keys.length);
      };
      img.onerror = () => {
        failed++;
        console.warn('建筑素材加载失败:', key);
        this._checkSpritesDone(loaded, failed, keys.length);
      };
      img.src = 'assets/buildings/' + key + '.png?v=' + this.ASSET_V;
    });
  },

  _checkSpritesDone(loaded, failed, total) {
    if (loaded + failed < total) return;
    this.buildingSpritesLoaded = loaded > 0;
    this._bgCanvas = null;          // 素材到位后重绘静态层
    this.render();
  },

  /**
   * 取得某个地点的绘制尺寸（素材按原始宽高比缩放）
   */
  getLocSize(loc) {
    const sprite = this.buildingSprites[loc.sprite];
    const w = loc.imgW || 120;

    if (sprite && sprite.width) {
      return { w, h: w * (sprite.height / sprite.width) };
    }
    // 素材未就绪时给个占位高度
    return { w, h: w * 0.58 };
  },

  bindEvents() {
    // 鼠标事件
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    window.addEventListener('mouseup', (e) => this.handleMouseUp(e));

    // 滚轮缩放
    this.canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

    // 触摸事件（移动端）
    this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));

    // 缩放控制按钮
    const zoomIn = document.getElementById('map-zoom-in');
    const zoomOut = document.getElementById('map-zoom-out');
    const zoomReset = document.getElementById('map-zoom-reset');
    if (zoomIn) zoomIn.addEventListener('click', () => this.zoomBy(1.25));
    if (zoomOut) zoomOut.addEventListener('click', () => this.zoomBy(0.8));
    if (zoomReset) zoomReset.addEventListener('click', () => this.resetView());

    // 图例折叠
    const legendToggle = document.getElementById('legend-toggle');
    if (legendToggle) {
      legendToggle.addEventListener('click', () => {
        const panel = document.getElementById('map-legend');
        if (panel) panel.classList.toggle('collapsed');
      });
    }
  },

  /**
   * 获取鼠标在画布上的像素坐标
   */
  getScreenPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height)
    };
  },

  /**
   * 屏幕坐标 → 世界坐标
   */
  screenToWorld(p) {
    return {
      x: (p.x - this.view.x) / this.view.scale,
      y: (p.y - this.view.y) / this.view.scale
    };
  },

  /**
   * 获取鼠标的世界坐标
   */
  getMousePos(e) {
    return this.screenToWorld(this.getScreenPos(e));
  },

  /**
   * 以某个屏幕点为锚点缩放
   */
  zoomAt(screenX, screenY, factor) {
    const newScale = Math.min(this.maxScale, Math.max(this.minScale, this.view.scale * factor));
    const k = newScale / this.view.scale;
    this.view.x = screenX - (screenX - this.view.x) * k;
    this.view.y = screenY - (screenY - this.view.y) * k;
    this.view.scale = newScale;
    this.clampView();
    this.render();
  },

  /**
   * 以画布中心缩放
   */
  zoomBy(factor) {
    this.zoomAt(this.config.width / 2, this.config.height / 2, factor);
  },

  /**
   * 重置视图
   */
  resetView() {
    this.view = { scale: 1, x: 0, y: 0 };
    this.render();
  },

  /**
   * 限制平移范围，避免地图完全移出视野
   */
  clampView() {
    const w = this.config.width;
    const h = this.config.height;
    const s = this.view.scale;
    const scaledW = w * s;
    const scaledH = h * s;

    // 至少保留 25% 的地图在视野内
    const minX = Math.min(0, w - scaledW) - scaledW * 0.75;
    const maxX = Math.max(0, w - scaledW) + scaledW * 0.75;
    const minY = Math.min(0, h - scaledH) - scaledH * 0.75;
    const maxY = Math.max(0, h - scaledH) + scaledH * 0.75;

    this.view.x = Math.min(maxX, Math.max(minX, this.view.x));
    this.view.y = Math.min(maxY, Math.max(minY, this.view.y));
  },

  /**
   * 滚轮缩放
   */
  handleWheel(e) {
    e.preventDefault();
    const screen = this.getScreenPos(e);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.zoomAt(screen.x, screen.y, factor);
  },

  /**
   * 触摸开始（支持双指缩放）
   */
  handleTouchStart(e) {
    // 标记为触摸设备，关闭鼠标悬停效果
    this._touchMode = true;
    this.setHoveredLocation(null);

    if (e.touches.length === 2) {
      e.preventDefault();
      const d = this.touchDistance(e.touches);
      this.pinchStartDist = d;
      this.pinchStartScale = this.view.scale;
      this.isPanning = false;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const screen = this.getScreenPos({ clientX: touch.clientX, clientY: touch.clientY });
      const world = this.screenToWorld(screen);
      const loc = this.findLocationAt(world.x, world.y);

      if (loc && !loc.isPreset) {
        this.isDragging = true;
        this.dragLocation = loc;
        this.dragOffset = { x: world.x - loc.x, y: world.y - loc.y };
      } else {
        this.isPanning = true;
        this.movedDuringDrag = false;
        this.panStartScreen = screen;
        this.panStartView = { x: this.view.x, y: this.view.y };
      }
    }
  },

  /**
   * 触摸移动
   */
  handleTouchMove(e) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const d = this.touchDistance(e.touches);
      if (this.pinchStartDist > 0) {
        const ratio = d / this.pinchStartDist;
        const targetScale = Math.min(this.maxScale, Math.max(this.minScale, this.pinchStartScale * ratio));
        const factor = targetScale / this.view.scale;
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const screen = this.getScreenPos({ clientX: cx, clientY: cy });
        this.zoomAt(screen.x, screen.y, factor);
      }
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const screen = this.getScreenPos({ clientX: touch.clientX, clientY: touch.clientY });

      if (this.isDragging && this.dragLocation) {
        e.preventDefault();
        const world = this.screenToWorld(screen);
        this.dragLocation.x = world.x - this.dragOffset.x;
        this.dragLocation.y = world.y - this.dragOffset.y;
        this.render();
      } else if (this.isPanning) {
        e.preventDefault();
        this.movedDuringDrag = true;
        this.view.x = this.panStartView.x + (screen.x - this.panStartScreen.x);
        this.view.y = this.panStartView.y + (screen.y - this.panStartScreen.y);
        this.clampView();
        this.render();
      }
    }
  },

  /**
   * 触摸结束
   */
  handleTouchEnd(e) {
    if (this.isDragging && this.dragLocation) {
      this.saveCustomLocations();
      this.isDragging = false;
      this.dragLocation = null;
    }
    if (e.touches.length === 0) {
      this.isPanning = false;
      this.pinchStartDist = 0;
    }
  },

  /**
   * 计算两个触点的距离
   */
  touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  },

  findLocationAt(x, y) {
    for (let i = this.locations.length - 1; i >= 0; i--) {
      const loc = this.locations[i];
      const size = this.getLocSize(loc);
      const halfW = size.w / 2;

      // 建筑主体包围盒（基线在 loc.y，向上生长）
      if (x >= loc.x - halfW && x <= loc.x + halfW &&
          y >= loc.y - size.h - 6 && y <= loc.y + 8) {
        return loc;
      }

      // 名称标签区域
      if (x >= loc.x - halfW - 12 && x <= loc.x + halfW + 12 &&
          y >= loc.y + 6 && y <= loc.y + 30) {
        return loc;
      }

      // 兜底：圆形范围
      const dist = Math.sqrt((x - loc.x) ** 2 + (y - loc.y) ** 2);
      if (dist <= this.config.locationRadius) {
        return loc;
      }
    }
    return null;
  },

  handleClick(e) {
    // 拖拽或平移结束时不触发选择
    if (this.movedDuringDrag || this.isDragging) {
      this.movedDuringDrag = false;
      return;
    }
    const pos = this.getMousePos(e);
    const loc = this.findLocationAt(pos.x, pos.y);
    if (loc) {
      this.selectedLocation = loc;
      const event = new CustomEvent('locationSelected', { detail: loc });
      document.dispatchEvent(event);
      this.render();
    }
  },

  handleDoubleClick(e) {
    const pos = this.getMousePos(e);
    const loc = this.findLocationAt(pos.x, pos.y);
    if (loc && !loc.isPreset) {
      const event = new CustomEvent('editCustomLocation', { detail: loc });
      document.dispatchEvent(event);
    }
  },

  handleMouseDown(e) {
    const screen = this.getScreenPos(e);
    const pos = this.screenToWorld(screen);
    const loc = this.findLocationAt(pos.x, pos.y);

    if (loc && !loc.isPreset) {
      // 拖动自定义地点
      this.isDragging = true;
      this.dragLocation = loc;
      this.dragOffset = { x: pos.x - loc.x, y: pos.y - loc.y };
      this.canvas.style.cursor = 'grabbing';
      this.setHoveredLocation(null);
    } else {
      // 平移地图
      this.isPanning = true;
      this.movedDuringDrag = false;
      this.panStartScreen = screen;
      this.panStartView = { x: this.view.x, y: this.view.y };
      this.canvas.style.cursor = 'grab';
    }
  },

  handleMouseMove(e) {
    if (this.isDragging && this.dragLocation) {
      const pos = this.getMousePos(e);
      this.dragLocation.x = pos.x - this.dragOffset.x;
      this.dragLocation.y = pos.y - this.dragOffset.y;
      this.render();
      return;
    }

    if (this.isPanning) {
      const screen = this.getScreenPos(e);
      const dx = screen.x - this.panStartScreen.x;
      const dy = screen.y - this.panStartScreen.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        this.movedDuringDrag = true;
      }
      this.view.x = this.panStartView.x + dx;
      this.view.y = this.panStartView.y + dy;
      this.clampView();
      // 平移时取消悬停
      this.setHoveredLocation(null);
      this.render();
      return;
    }

    // 触摸设备不做悬停
    if (this._touchMode) return;

    // ---- 悬停检测 ----
    const pos = this.getMousePos(e);
    const loc = this.findLocationAt(pos.x, pos.y);
    if (loc !== this.hoveredLocation) {
      this.setHoveredLocation(loc);
    }
  },

  /**
   * 鼠标移出画布
   */
  handleMouseLeave() {
    this.setHoveredLocation(null);
  },

  /**
   * 设置当前悬停地点，并驱动缩放动画
   */
  setHoveredLocation(loc) {
    if (loc === this.hoveredLocation) return;
    this.hoveredLocation = loc;

    // 光标反馈
    if (!this.isDragging && !this.isPanning) {
      this.canvas.style.cursor = loc ? 'pointer' : 'grab';
    }

    // 更新缩放目标
    let needAnimate = false;
    this.locations.forEach(item => {
      const target = (loc && item.id === loc.id) ? this.hoverScale : 1;
      if (item._targetScale !== target) {
        item._targetScale = target;
        needAnimate = true;
      }
    });

    if (needAnimate) this.startHoverAnimation();
  },

  /**
   * 启动悬停缩放动画（帧循环，缓动收敛后自动停止）
   */
  startHoverAnimation() {
    if (this._hoverRaf) return;

    const step = () => {
      let active = false;

      this.locations.forEach(loc => {
        const target = loc._targetScale === undefined ? 1 : loc._targetScale;
        const current = loc._scale === undefined ? 1 : loc._scale;
        const diff = target - current;

        if (Math.abs(diff) > 0.0015) {
          // 指数缓动，接近时自动减速
          loc._scale = current + diff * 0.26;
          active = true;
        } else {
          loc._scale = target;
        }
      });

      this.render();

      if (active) {
        this._hoverRaf = requestAnimationFrame(step);
      } else {
        this._hoverRaf = null;
      }
    };

    this._hoverRaf = requestAnimationFrame(step);
  },

  handleMouseUp() {
    if (this.isDragging && this.dragLocation) {
      this.saveCustomLocations();
      this.render();
    }
    this.isDragging = false;
    this.dragLocation = null;
    this.isPanning = false;
    this.canvas.style.cursor = 'grab';
  },

  saveCustomLocations() {
    const customLocations = this.locations.filter(l => !l.isPreset);
    StorageManager.save('emotion_custom_locations', customLocations);
  },

  getLocationMoodColor(locId) {
    const records = this.emotions.filter(e => e.locationId === locId);
    if (records.length === 0) return null;
    const now = typeof MockDate !== 'undefined' ? MockDate.now() : Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentRecords = records.filter(r => r.timestamp > weekAgo);
    if (recentRecords.length === 0) return null;
    const avg = recentRecords.reduce((sum, r) => sum + r.mood, 0) / recentRecords.length;
    if (avg >= 4.5) return this.colors.moodHappy;
    if (avg >= 3.5) return this.colors.moodCalm;
    if (avg >= 2.5) return this.colors.moodNeutral;
    if (avg >= 1.5) return this.colors.moodAnxious;
    return this.colors.moodSad;
  },

  getLocationWeather(locId) {
    const records = this.emotions.filter(e => e.locationId === locId);
    if (records.length === 0) return '';
    const now = typeof MockDate !== 'undefined' ? MockDate.now() : Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentRecords = records.filter(r => r.timestamp > weekAgo);
    if (recentRecords.length === 0) return '';
    const avg = recentRecords.reduce((sum, r) => sum + r.mood, 0) / recentRecords.length;
    if (avg >= 4.5) return '☀️';
    if (avg >= 3.5) return '⛅';
    if (avg >= 2.5) return '🌤️';
    if (avg >= 1.5) return '🌧️';
    return '⛈️';
  },

  /**
   * 获取地点当前心情等级（用于显示对应图片）
   */
  getLocationMoodLevel(locId) {
    const records = this.emotions.filter(e => e.locationId === locId);
    if (records.length === 0) return null;
    const now = typeof MockDate !== 'undefined' ? MockDate.now() : Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const recentRecords = records.filter(r => r.timestamp > weekAgo);
    if (recentRecords.length === 0) return null;
    const avg = recentRecords.reduce((sum, r) => sum + r.mood, 0) / recentRecords.length;
    if (avg >= 4.5) return 5;
    if (avg >= 3.5) return 4;
    if (avg >= 2.5) return 3;
    if (avg >= 1.5) return 2;
    return 1;
  },

  // ==================== 绘制方法 ====================

  render() {
    const ctx = this.ctx;
    const w = this.config.width;
    const h = this.config.height;

    ctx.clearRect(0, 0, w, h);

    // 画布外围底色
    ctx.fillStyle = this.colors.grassDark;
    ctx.fillRect(0, 0, w, h);

    // 静态图层只绘制一次（草地 / 湖 / 道路 / 栅栏 / 植被）
    if (!this._bgCanvas) this.buildStaticLayer();

    // ---- 应用视图变换（世界坐标层） ----
    ctx.save();
    ctx.translate(this.view.x, this.view.y);
    ctx.scale(this.view.scale, this.view.scale);

    if (this._bgCanvas) {
      ctx.drawImage(this._bgCanvas, 0, 0);
    } else {
      this.drawBackground(ctx, w, h);
      this.drawLake(ctx);
      this.drawRoads(ctx);
      this.drawFence(ctx, w, h);
      this.drawDecorations(ctx);
    }

    this.locations.forEach(loc => this.drawLocation(ctx, loc));

    ctx.restore();
  },

  /**
   * 把不随交互变化的图层烘焙到离屏画布
   */
  buildStaticLayer() {
    const w = this.config.width;
    const h = this.config.height;

    if (!this._bgCanvas) {
      this._bgCanvas = document.createElement('canvas');
      this._bgCanvas.width = w;
      this._bgCanvas.height = h;
    }

    const c = this._bgCanvas.getContext('2d');
    if (!c) {
      this._bgCanvas = null;
      return;
    }

    c.clearRect(0, 0, w, h);
    this.drawBackground(c, w, h);
    this.drawLake(c);
    this.drawRoads(c);
    this.drawFence(c, w, h);
    this.drawDecorations(c);
  },

  /**
   * 渲染 HTML 图例
   */
  renderLegend() {
    const container = document.getElementById('map-legend');
    if (!container) return;

    const items = [
      { img: 'assets/happy.png',   label: '开心' },
      { img: 'assets/calm.png',    label: '平静' },
      { img: 'assets/nutral.png',  label: '一般' },
      { img: 'assets/anxious.png', label: '焦虑' },
      { img: 'assets/sad.png',     label: '低落' }
    ];

    const v = '?v=' + this.ASSET_V;

    container.innerHTML = `
      <div class="legend-header">
        <span class="legend-title">心情图例</span>
        <button class="legend-toggle" id="legend-toggle" title="折叠/展开">▾</button>
      </div>
      <div class="legend-list">
        ${items.map(item => `
          <div class="legend-row">
            <img class="legend-row-img" src="${item.img}${v}" alt="${item.label}">
            <span class="legend-row-label">${item.label}</span>
          </div>
        `).join('')}
      </div>
    `;

    const toggle = container.querySelector('#legend-toggle');
    if (toggle) {
      container.addEventListener('click', () => {
        container.classList.toggle('collapsed');
      });
    }
  },

  /* ---------- 基础图元 ---------- */

  /**
   * 带描边的矩形（像素风基元）
   */
  px(ctx, x, y, w, h, fill, stroke, lw) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 2.5;
      ctx.lineJoin = 'round';
      ctx.strokeRect(x, y, w, h);
    }
  },

  box(ctx, x, y, w, h, fill, stroke, lw, r) {
    this.roundRect(ctx, x, y, w, h, r || 0);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 2;
      ctx.stroke();
    }
  },

  /**
   * 多圆并集
   */
  blob(ctx, circles, fill) {
    ctx.beginPath();
    circles.forEach(c => {
      ctx.moveTo(c[0] + c[2], c[1]);
      ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2);
    });
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
  },

  /**
   * 多圆并集 + 描边（用放大的底层模拟外描边，避免内部接缝）
   */
  blobOutlined(ctx, circles, fill, outline, pad) {
    this.blob(ctx, circles.map(c => [c[0], c[1], c[2] + (pad || 3)]), outline);
    this.blob(ctx, circles, fill);
  },

  /* ---------- 背景 / 栅栏 ---------- */

  /**
   * 草地：主色 + 柔和浅斑（对齐效果图）
   */
  drawBackground(ctx, w, h) {
    ctx.fillStyle = this.colors.grass;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = this.colors.grassLight;
    [
      [90, 70, 150, 82], [430, 52, 170, 74], [800, 70, 160, 80],
      [1120, 60, 150, 70], [60, 330, 140, 78], [380, 350, 160, 74],
      [900, 350, 150, 76], [1160, 340, 130, 70], [120, 600, 150, 80],
      [520, 600, 170, 76], [960, 590, 160, 78], [700, 200, 130, 64]
    ].forEach(p => {
      ctx.beginPath();
      ctx.ellipse(p[0], p[1], p[2], p[3], 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  },

  /**
   * 木质栅栏（效果图同款的上下围栏）
   */
  drawFence(ctx, w, h) {
    const C = this.colors;
    const top = 20;
    const bottom = h - 20;

    // 上下横梁
    this.px(ctx, 0, top - 4, w, 8, C.fence, C.fenceDark, 2);
    this.px(ctx, 0, bottom - 4, w, 8, C.fence, C.fenceDark, 2);

    // 立柱
    for (let x = 4; x < w; x += 40) {
      this.px(ctx, x, top - 13, 10, 26, C.fencePost, C.fenceDark, 2);
      this.px(ctx, x, bottom - 13, 10, 26, C.fencePost, C.fenceDark, 2);
    }

    // 左右短围栏（只覆盖上下一段，避免太封闭）
    [top, bottom].forEach(y => {
      this.px(ctx, 0, y - 13, 10, 26, C.fencePost, C.fenceDark, 2);
      this.px(ctx, w - 10, y - 13, 10, 26, C.fencePost, C.fenceDark, 2);
    });
  },

  /**
   * 学子湖
   */
  drawLake(ctx) {
    const cx = 440, cy = 545, rx = 104, ry = 62;

    // 岸边沙地
    ctx.save();
    ctx.fillStyle = this.colors.sand;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, rx + 12, ry + 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,122,40,0.4)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();

    // 水面
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = this.colors.water;
    ctx.fill();
    ctx.strokeStyle = 'rgba(74,122,40,0.45)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 波纹
    ctx.save();
    ctx.strokeStyle = this.colors.waterLight;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    [[-52, -20, 32], [4, 6, 36], [-20, 28, 24], [36, -26, 22]].forEach(a => {
      ctx.beginPath();
      ctx.moveTo(cx + a[0], cy + a[1]);
      ctx.quadraticCurveTo(cx + a[0] + a[2] / 2, cy + a[1] - 7, cx + a[0] + a[2], cy + a[1]);
      ctx.stroke();
    });
    ctx.restore();

    // 荷叶
    [[-40, 14, 12], [30, 22, 9], [48, -8, 8]].forEach(p => {
      ctx.beginPath();
      ctx.ellipse(cx + p[0], cy + p[1], p[2], p[2] * 0.7, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#4E9B2E';
      ctx.fill();
      ctx.strokeStyle = 'rgba(74,122,40,0.5)';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    });
  },

  /* ---------- 道路 ---------- */

  tracePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
      return;
    }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  },

  /**
   * 土黄步道（效果图同款）
   */
  drawRoads(ctx) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 路缘
    ctx.strokeStyle = this.colors.roadEdge;
    this.roads.forEach(r => {
      ctx.lineWidth = r.w + 7;
      this.tracePath(ctx, r.pts);
      ctx.stroke();
    });

    // 路面
    ctx.strokeStyle = this.colors.road;
    this.roads.forEach(r => {
      ctx.lineWidth = r.w;
      this.tracePath(ctx, r.pts);
      ctx.stroke();
    });

    // 中央浅色高光
    ctx.strokeStyle = this.colors.roadLight;
    this.roads.forEach(r => {
      ctx.lineWidth = Math.max(4, r.w * 0.22);
      this.tracePath(ctx, r.pts);
      ctx.stroke();
    });

    ctx.restore();
  },

  /* ---------- 植被 ---------- */

  drawDecorations(ctx) {
    this.decorations.forEach(d => {
      switch (d.type) {
        case 'tree':   this.drawTree(ctx, d.x, d.y, d.size); break;
        case 'bush':   this.drawBush(ctx, d.x, d.y, d.size); break;
        case 'flower': this.drawFlower(ctx, d.x, d.y, d.size); break;
      }
    });
  },

  /**
   * 卡通树（深色描边，对齐效果图）
   */
  drawTree(ctx, x, y, s) {
    const C = this.colors;

    // 树干
    this.px(ctx, x - s * 0.13, y - s * 0.16, s * 0.26, s * 0.54, C.trunk, C.outline, 2);

    // 树冠（并集 + 外描边）
    this.blobOutlined(ctx, [
      [x, y - s * 0.46, s * 0.62],
      [x - s * 0.48, y - s * 0.18, s * 0.46],
      [x + s * 0.48, y - s * 0.18, s * 0.46]
    ], C.tree, C.outline, s * 0.11);

    // 亮面 / 暗面
    this.blob(ctx, [[x - s * 0.22, y - s * 0.62, s * 0.26]], C.treeLight);
    this.blob(ctx, [[x + s * 0.32, y - s * 0.16, s * 0.26]], C.treeDark);
  },

  drawBush(ctx, x, y, s) {
    const C = this.colors;
    this.blobOutlined(ctx, [
      [x, y, s], [x - s * 0.66, y + s * 0.14, s * 0.72], [x + s * 0.66, y + s * 0.14, s * 0.72]
    ], C.tree, C.outline, s * 0.2);
    this.blob(ctx, [[x - s * 0.2, y - s * 0.26, s * 0.4]], C.treeLight);
  },

  drawFlower(ctx, x, y, s) {
    const petals = ['#E8552F', '#F2C14E', '#E86A92', '#C77DFF'];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      const px = x + Math.cos(a) * s;
      const py = y + Math.sin(a) * s;
      this.px(ctx, px - s * 0.55, py - s * 0.55, s * 1.1, s * 1.1, petals[i], this.colors.outline, 1.6);
    }
    this.px(ctx, x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84, '#FFE066', this.colors.outline, 1.6);
  },

  /* ---------- 地点 ---------- */

  drawLocation(ctx, loc) {
    const isSelected = this.selectedLocation && this.selectedLocation.id === loc.id;
    const isHovered = this.hoveredLocation && this.hoveredLocation.id === loc.id;
    const moodColor = this.getLocationMoodColor(loc.id);
    const moodLevel = this.getLocationMoodLevel(loc.id);
    const scale = loc._scale === undefined ? 1 : loc._scale;
    const cx = loc.x;
    const by = loc.y;
    const size = this.getLocSize(loc);

    // ---- 悬停缩放（以建筑底部为锚点） ----
    ctx.save();
    if (scale !== 1 || isHovered) {
      ctx.translate(cx, by);
      if (isHovered) ctx.translate(0, -3.5);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -by);
    }

    // ---- 情绪光晕 ----
    if (moodColor) {
      ctx.save();
      const r = Math.max(size.w * 0.62, 70);
      const g = ctx.createRadialGradient(cx, by - size.h * 0.5, 8, cx, by - size.h * 0.5, r);
      g.addColorStop(0, this.hexToRGBA(moodColor, 0.34));
      g.addColorStop(0.55, this.hexToRGBA(moodColor, 0.13));
      g.addColorStop(1, this.hexToRGBA(moodColor, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, by - size.h * 0.5, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ---- 选中虚线光圈 ----
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = '#E8552F';
      ctx.lineWidth = 2.6;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -(Date.now() / 60) % 15;
      ctx.beginPath();
      ctx.ellipse(cx, by - size.h * 0.42, size.w * 0.66, size.h * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ---- 地面投影 ----
    ctx.save();
    ctx.fillStyle = 'rgba(58,102,28,0.20)';
    ctx.beginPath();
    ctx.ellipse(cx, by - 2, size.w * 0.40, size.h * 0.09 + 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ---- 建筑 ----
    ctx.imageSmoothingEnabled = true;
    this.drawBuilding(ctx, loc, cx, by, size);

    // ---- 心情徽章 ----
    if (moodLevel && this.moodImagesLoaded && this.moodImages[moodLevel]) {
      this.drawMoodBadge(ctx, cx + size.w * 0.46, by - size.h - 2, this.moodImages[moodLevel], moodColor);
    }

    // ---- 名称标签 ----
    this.drawLabel(ctx, cx, by + 22, loc.name, isSelected, moodColor);

    ctx.restore();
  },

  /**
   * 心情徽章（圆形裁剪的素材图）
   */
  drawMoodBadge(ctx, x, y, img, moodColor) {
    const r = 17;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r + 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = moodColor || this.colors.outline;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  },

  /**
   * 建筑分发：有素材用素材，没有的用 canvas 绘制
   */
  drawBuilding(ctx, loc, cx, by, size) {
    const sprite = this.buildingSprites[loc.sprite];

    if (sprite) {
      ctx.drawImage(sprite, cx - size.w / 2, by - size.h, size.w, size.h);
      return;
    }

    switch (loc.type) {
      case 'gym':      return this.bGym(ctx, cx, by);
      case 'lab':      return this.bLab(ctx, cx, by);
      case 'garden':   return this.bGarden(ctx, cx, by);
      case 'pavilion': return this.bPavilion(ctx, cx, by);
      default:
        // 素材尚未加载完：画个占位框，避免闪烁
        if (loc.sprite) {
          ctx.save();
          ctx.globalAlpha = 0.28;
          this.px(ctx, cx - size.w / 2, by - size.h, size.w, size.h,
            '#FFFFFF', this.colors.outline, 2);
          ctx.restore();
        }
    }
  },

  /**
   * 体育馆（像素风拱顶）
   */
  bGym(ctx, cx, by) {
    const C = this.colors;
    const o = C.outline;
    const w = 118, h = 42;
    const x = cx - w / 2;
    const y = by - 5 - h;

    this.px(ctx, x - 6, by - 5, w + 12, 5, C.wallShade, o, 2);
    this.px(ctx, x, y, w, h, C.wall, o, 3);
    this.px(ctx, x, y + 4, w, 5, C.wallLight, null);

    // 拱顶
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.quadraticCurveTo(cx, y - 34, x + w + 6, y);
    ctx.closePath();
    ctx.fillStyle = C.roofBlue;
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 拱顶高光
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - 6, y);
    ctx.quadraticCurveTo(cx, y - 34, x + w + 6, y);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = C.roofBlueLight;
    ctx.fillRect(cx - 26, y - 30, 22, 26);
    ctx.restore();

    // 窗
    for (let i = 0; i < 3; i++) {
      this.px(ctx, x + 14 + i * 32, y + 15, 18, 13, C.window, o, 2);
    }

    // 门
    this.px(ctx, cx - 13, by - 21, 26, 16, '#6B4A2E', o, 2.5);
  },

  /**
   * 实验室（像素风方楼 + 天线）
   */
  bLab(ctx, cx, by) {
    const C = this.colors;
    const o = C.outline;
    const w = 104, h = 48;
    const x = cx - w / 2;
    const y = by - 5 - h;

    this.px(ctx, x - 6, by - 5, w + 12, 5, C.wallShade, o, 2);
    this.px(ctx, x, y, w, h, C.wall, o, 3);
    this.px(ctx, x, y + 4, w, 5, C.wallLight, null);

    // 平屋顶
    this.px(ctx, x - 7, y - 10, w + 14, 11, C.roofBlue, o, 3);
    this.px(ctx, x - 3, y - 8, w + 6, 4, C.roofBlueLight, null);

    // 窗 3×2
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 3; c++) {
        this.px(ctx, x + 12 + c * 28, y + 12 + r * 17, 16, 12, C.window, o, 2);
      }
    }

    // 门
    this.px(ctx, cx - 12, by - 20, 24, 15, '#6B4A2E', o, 2.5);

    // 天线
    const ax = cx + 34;
    ctx.strokeStyle = o;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, y - 10);
    ctx.lineTo(ax, y - 30);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ax, y - 33, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#E8552F';
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  },

  /**
   * 小花园（像素风花坛 + 两棵树）
   */
  bGarden(ctx, cx, by) {
    const C = this.colors;
    const o = C.outline;

    // 花坛
    this.px(ctx, cx - 62, by - 26, 124, 26, '#B98A5C', o, 3);
    this.px(ctx, cx - 58, by - 34, 116, 10, C.treeDark, o, 2.5);

    // 花
    const petal = ['#E8552F', '#F2C14E', '#E86A92', '#C77DFF'];
    [[-44, -40], [-28, -44], [-12, -46], [4, -44], [20, -41], [36, -37], [50, -34]]
      .forEach((p, i) => {
        this.px(ctx, cx + p[0] - 5, by + p[1], 11, 11, petal[i % petal.length], o, 2);
      });

    // 两侧树
    this.drawTree(ctx, cx - 78, by - 24, 17);
    this.drawTree(ctx, cx + 78, by - 24, 16);
  },

  /**
   * 湖边凉亭（像素风）
   */
  bPavilion(ctx, cx, by) {
    const C = this.colors;
    const o = C.outline;

    // 基座
    this.px(ctx, cx - 34, by - 12, 68, 12, '#D9C89A', o, 3);

    // 柱子
    [-20, -7, 7, 20].forEach(dx => {
      this.px(ctx, cx + dx - 3.5, by - 40, 7, 28, '#C98B5C', o, 2);
    });

    // 下层屋檐
    ctx.beginPath();
    ctx.moveTo(cx - 46, by - 40);
    ctx.lineTo(cx + 46, by - 40);
    ctx.lineTo(cx + 24, by - 58);
    ctx.lineTo(cx - 24, by - 58);
    ctx.closePath();
    ctx.fillStyle = '#C0392B';
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 上层屋檐
    ctx.beginPath();
    ctx.moveTo(cx - 32, by - 57);
    ctx.lineTo(cx + 32, by - 57);
    ctx.lineTo(cx + 15, by - 74);
    ctx.lineTo(cx - 15, by - 74);
    ctx.closePath();
    ctx.fillStyle = '#E8552F';
    ctx.fill();
    ctx.strokeStyle = o;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 宝顶
    this.px(ctx, cx - 5, by - 86, 10, 12, '#F2C14E', o, 2.5);
  },

  /**
   * 标签（效果图风格：白色描边 + 深色粗体字）
   */
  drawLabel(ctx, x, y, text, isSelected, moodColor) {
    ctx.save();
    ctx.font = 'bold 21px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    // 白色描边
    ctx.lineWidth = 7;
    ctx.strokeStyle = this.colors.labelStroke;
    ctx.strokeText(text, x, y);

    // 深色字
    ctx.fillStyle = isSelected ? this.colors.labelActive : this.colors.labelText;
    ctx.fillText(text, x, y);

    // 情绪色点
    if (moodColor) {
      const tw = ctx.measureText(text).width;
      const dx = x - tw / 2 - 13;
      ctx.beginPath();
      ctx.arc(dx, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = moodColor;
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.restore();
  },

  // ==================== 工具方法 ====================

  /**
   * 绘制圆角矩形（兼容性好）
   */
  roundRect(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  },

  /**
   * Hex 颜色转 RGBA
   */
  hexToRGBA(hex, alpha) {
    if (!hex || hex.charAt(0) !== '#') return `rgba(0,0,0,${alpha})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  },

  // ==================== 数据操作 ====================

  addCustomLocation(name, icon, x, y) {
    const newLoc = {
      id: generateId('loc'),
      name,
      icon,
      x: x || this.config.width / 2,
      y: y || this.config.height / 2,
      isPreset: false,
      desc: '自定义地点',
      _scale: 1,
      _targetScale: 1
    };
    this.locations.push(newLoc);
    this.saveCustomLocations();
    this.render();
    return newLoc;
  },

  removeCustomLocation(locId) {
    this.locations = this.locations.filter(l => l.id !== locId);
    this.saveCustomLocations();
    if (this.selectedLocation && this.selectedLocation.id === locId) {
      this.selectedLocation = null;
    }
    if (this.hoveredLocation && this.hoveredLocation.id === locId) {
      this.hoveredLocation = null;
    }
    this.render();
  },

  updateCustomLocation(locId, updates) {
    const loc = this.locations.find(l => l.id === locId);
    if (loc && !loc.isPreset) {
      Object.assign(loc, updates);
      this.saveCustomLocations();
      this.render();
    }
  },

  refresh() {
    this.loadData();
    // 数据重载后原对象已失效，清理悬停引用
    this.hoveredLocation = null;
    this.render();
  }
};
