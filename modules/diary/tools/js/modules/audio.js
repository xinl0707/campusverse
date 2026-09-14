/**
 * 音频管理模块
 * 处理 BGM、环境音播放和音量控制
 */

const AudioManager = {
  bgm: null,
  ambient: null,
  bgmVolume: 0.15,
  ambientVolume: 0.5,
  isPlaying: false,
  currentWeather: 'sunny',
  userInteracted: false,
  
  // 天气环境音映射
  // ⚠️ 合并部署修正：原为 '/tools/assets/audio/xxx.wav' 根绝对路径，
  // 整站合并后本模块挂在 /diary/ 前缀下会 404，故改为相对本页的路径
  // （页面位于 /diary/tools/，相对路径解析回 /diary/tools/assets/audio/）。
  ambientSounds: {
    sunny: 'assets/audio/sunny.wav',
    cloudy: 'assets/audio/cloudy.wav',
    rainy: 'assets/audio/rainy.wav',
    stormy: 'assets/audio/stormy.wav',
    rainbow: 'assets/audio/rainbow.wav'
  },
  
  /**
   * 初始化音频管理器
   */
  init() {
    // 创建 BGM 音频对象
    this.bgm = new Audio('assets/audio/bgm.ogg');
    this.bgm.loop = true;
    this.bgm.volume = this.bgmVolume;
    
    // 创建环境音音频对象
    this.ambient = new Audio();
    this.ambient.loop = true;
    this.ambient.volume = this.ambientVolume;
    
    // 绑定事件
    this.bindEvents();
    
    // 尝试自动播放（需要用户交互后才能播放）
    this.setupAutoPlay();
    
    Logger.info('音频管理器已初始化');
  },
  
  /**
   * 绑定事件
   */
  bindEvents() {
    // 音量控制按钮
    const volumeToggle = document.getElementById('volumeToggle');
    const volumePanel = document.getElementById('volumePanel');
    const bgmSlider = document.getElementById('bgmVolume');
    const bgmVolVal = document.getElementById('bgmVolVal');
    const ambientSlider = document.getElementById('ambientVolume');
    const ambientVolVal = document.getElementById('ambientVolVal');
    
    if (volumeToggle) {
      volumeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        volumePanel.classList.toggle('show');
      });
    }
    
    // BGM 音量滑块
    if (bgmSlider) {
      bgmSlider.addEventListener('input', () => {
        this.bgmVolume = bgmSlider.value / 100;
        if (this.bgm) this.bgm.volume = this.bgmVolume;
        bgmVolVal.textContent = `${bgmSlider.value}%`;
      });
    }
    
    // 环境音音量滑块
    if (ambientSlider) {
      ambientSlider.addEventListener('input', () => {
        this.ambientVolume = ambientSlider.value / 100;
        if (this.ambient) this.ambient.volume = this.ambientVolume;
        ambientVolVal.textContent = `${ambientSlider.value}%`;
      });
    }
    
    // 点击面板外部关闭
    document.addEventListener('click', (e) => {
      if (volumePanel && volumeToggle) {
        if (!volumePanel.contains(e.target) && !volumeToggle.contains(e.target)) {
          volumePanel.classList.remove('show');
        }
      }
    });
  },
  
  /**
   * 设置自动播放
   * 浏览器要求用户交互后才能播放音频
   */
  setupAutoPlay() {
    const startPlaying = () => {
      if (this.userInteracted) return;
      this.userInteracted = true;
      
      // BGM 不自动播放，仅在雨后彩虹时播放
      
      // 播放环境音（设置当前天气对应的环境音）
      const currentWeather = (typeof WeatherManager !== 'undefined') 
        ? WeatherManager.currentWeather : 'sunny';
      this.setAmbientSound(currentWeather);
      
      document.removeEventListener('click', startPlaying);
      document.removeEventListener('touchstart', startPlaying);
    };
    
    document.addEventListener('click', startPlaying);
    document.addEventListener('touchstart', startPlaying, { passive: true });
  },
  
  /**
   * 播放 BGM
   */
  play() {
    if (!this.bgm) return;
    
    this.bgm.play()
      .then(() => {
        this.isPlaying = true;
        Logger.info('BGM 开始播放');
      })
      .catch((error) => {
        Logger.warn('BGM 播放失败:', error.message);
      });
  },
  
  /**
   * 暂停 BGM
   */
  pause() {
    if (!this.bgm) return;
    
    this.bgm.pause();
    this.isPlaying = false;
    Logger.info('BGM 已暂停');
  },
  
  /**
   * 切换播放/暂停
   */
  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  },
  
  /**
   * 设置 BGM 音量
   * @param {number} volume - 音量 0-1
   */
  setBgmVolume(volume) {
    this.bgmVolume = Math.max(0, Math.min(1, volume));
    if (this.bgm) {
      this.bgm.volume = this.bgmVolume;
    }
  },
  
  /**
   * 设置环境音音量
   * @param {number} volume - 音量 0-1
   */
  setAmbientVolume(volume) {
    this.ambientVolume = Math.max(0, Math.min(1, volume));
    if (this.ambient) {
      this.ambient.volume = this.ambientVolume;
    }
  },
  
  /**
   * 切换环境音
   * @param {string} weather - 天气类型：sunny/cloudy/rainy/stormy/rainbow
   */
  setAmbientSound(weather) {
    if (!this.ambientSounds[weather]) {
      Logger.warn(`未知的天气类型：${weather}`);
      return;
    }
    
    // 如果天气没变，不重复切换
    if (this.currentWeather === weather && this.ambient.src) {
      // 如果还没播放过且用户已交互，尝试播放
      if (this.userInteracted && this.ambient.paused) {
        this.ambient.play().catch(() => {});
      }
      return;
    }
    
    this.currentWeather = weather;
    const audioPath = this.ambientSounds[weather];
    
    // 切换音频源
    this.ambient.src = audioPath;
    // 暴风雨满音量，多云再减半，其他天气正常
    let volumeBoost;
    if (weather === 'stormy') volumeBoost = 2.5;
    else if (weather === 'cloudy') volumeBoost = 0.25;
    else volumeBoost = 0.5;
    this.ambient.volume = Math.min(1.0, this.ambientVolume * volumeBoost);
    
    // 只有用户交互后才播放
    if (this.userInteracted) {
      this.ambient.play().catch((error) => {
        Logger.warn('环境音播放失败:', error.message);
      });
    }
    
    Logger.info(`环境音已切换为：${weather}`);
  },
  
  /**
   * 播放环境音
   */
  playAmbient() {
    if (!this.ambient || !this.ambient.src) return;
    
    this.ambient.play()
      .then(() => {
        Logger.info('环境音开始播放');
      })
      .catch((error) => {
        Logger.warn('环境音播放失败:', error.message);
      });
  },
  
  /**
   * 暂停环境音
   */
  pauseAmbient() {
    if (!this.ambient) return;
    
    this.ambient.pause();
    Logger.info('环境音已暂停');
  },
  
  /**
   * 启用并播放 BGM
   */
  enableBgm() {
    if (!this.bgm || this.isPlaying) return;
    this.bgm.play()
      .then(() => {
        this.isPlaying = true;
        Logger.info('BGM 开始播放');
      })
      .catch((error) => {
        Logger.warn('BGM 播放失败:', error.message);
      });
  },
  
  /**
   * 禁用并暂停 BGM
   */
  disableBgm() {
    if (!this.bgm || !this.isPlaying) return;
    this.bgm.pause();
    this.isPlaying = false;
    Logger.info('BGM 已停止');
  }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  AudioManager.init();
});
