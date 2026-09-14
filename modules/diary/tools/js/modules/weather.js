/**
 * 天气背景模块
 * 根据用户情绪动态切换天气背景和粒子效果
 */

const WeatherManager = {
  currentWeather: 'sunny',
  particles: [],
  birds: [],
  lightningTimer: null,
  
  // 天气配置
  weatherConfig: {
    sunny: {
      className: 'weather-sunny',
      particleClass: 'sun-particle',
      particleCount: 15,
      animation: 'float'
    },
    cloudy: {
      className: 'weather-cloudy',
      particleClass: 'cloud-particle',
      particleCount: 5,
      animation: 'drift'
    },
    rainy: {
      className: 'weather-rainy',
      particleClass: 'raindrop',
      particleCount: 50,
      animation: 'fall'
    },
    stormy: {
      className: 'weather-stormy',
      particleClass: 'raindrop',
      particleCount: 80,
      animation: 'fall'
    },
    rainbow: {
      className: 'weather-rainbow',
      particleClass: 'sun-particle',
      particleCount: 20,
      animation: 'float'
    }
  },
  
  /**
   * 初始化天气管理器
   */
  init() {
    // 初始不设置天气，保持白色背景，等待用户选择
    Logger.info('天气管理器已初始化');
  },
  
  /**
   * 设置天气
   * @param {string} weather - 天气类型：sunny/cloudy/rainy/stormy/rainbow
   */
  setWeather(weather) {
    if (!this.weatherConfig[weather]) {
      Logger.warn(`未知的天气类型: ${weather}`);
      return;
    }
    
    // 如果天气没变，不重复设置
    if (this.currentWeather === weather && this.particles.length > 0) {
      return;
    }
    
    this.currentWeather = weather;
    const config = this.weatherConfig[weather];
    
    // 更新 body 类名
    document.body.className = config.className;
    
    // 清除旧粒子
    this.clearParticles();
    
    // 创建新粒子
    this.createParticles(config);
    
    // 更新太阳显示
    this.updateSun(weather);
    
    // 更新小鸟
    this.updateBirds(weather);
    
    // 更新闪电效果
    this.updateLightning(weather);
    
    // 更新水洼涟漪（小雨）
    this.updateRipples(weather);
      
    // 切换环境音
    if (typeof AudioManager !== 'undefined') {
      AudioManager.setAmbientSound(weather);
    }
      
    Logger.info(`天气已切换为：${weather}`);
  },
  
  /**
   * 清除所有天气效果，恢复初始白色状态
   */
  clearAll() {
    this.currentWeather = '';
    document.body.className = '';
    this.clearParticles();
    this.updateSun('');
    this.updateLightning('');
    this.updateRipples('');
  },
  
  /**
   * 根据情绪设置天气
   * @param {string} mood - 情绪类型：positive/neutral/negative
   * @param {string} intensity - 强度：low/medium/high
   */
  setWeatherByMood(mood, intensity = 'medium') {
    let weather = 'sunny';
    
    if (mood === 'positive') {
      weather = intensity === 'high' ? 'rainbow' : 'sunny';
    } else if (mood === 'neutral') {
      weather = 'cloudy';
    } else if (mood === 'negative') {
      weather = intensity === 'high' ? 'stormy' : 'rainy';
    }
    
    this.setWeather(weather);
  },
  
  /**
   * 创建天气粒子
   * @param {Object} config - 粒子配置
   */
  createParticles(config) {
    const container = document.getElementById('weatherParticles');
    if (!container) return;
    
    const weather = this.currentWeather;
    
    if (weather === 'rainy') {
      this._createRainStreaks(container, 150);
    } else if (weather === 'stormy') {
      this._createStormRain(container, 250);
    } else if (weather === 'cloudy') {
      this._createClouds(container);
    } else {
      // sunny / rainbow: 光点漂浮（全屏覆盖）
      const particleCount = weather === 'sunny' ? 40 : 20;
      for (let i = 0; i < particleCount; i++) {
        const p = document.createElement('div');
        p.className = 'weather-particle sun-particle';
        p.style.left = `${Math.random() * 100}vw`;
        p.style.top = `${Math.random() * 100}vh`;
        p.style.animationDelay = `${Math.random() * 5}s`;
        p.style.animationDuration = `${3 + Math.random() * 5}s`;
        container.appendChild(p);
        this.particles.push(p);
      }
    }
  },
  
  /**
   * 下雨：全屏斜线短雨丝
   */
  _createRainStreaks(container, count) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'weather-particle rain-streak';
      p.style.left = `${Math.random() * 110 - 5}vw`;
      p.style.top = `${Math.random() * 100}vh`;
      p.style.animationDelay = `${Math.random() * 2}s`;
      p.style.animationDuration = `${0.4 + Math.random() * 0.4}s`;
      p.style.opacity = 0.2 + Math.random() * 0.4;
      container.appendChild(p);
      this.particles.push(p);
    }
  },
  
  /**
   * 暴风雨：全屏随机大小雨滴
   */
  _createStormRain(container, count) {
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'weather-particle storm-column';
      // 微倾斜 10-15° + 随机偏差
      const angle = 10 + Math.random() * 5 + (Math.random() > 0.8 ? (Math.random() * 8 - 4) : 0);
      p.style.setProperty('--tilt', `-${angle}deg`);
      p.style.left = `${Math.random() * 110 - 5}vw`;
      p.style.top = `${Math.random() * 100}vh`;
      p.style.animationDelay = `${Math.random() * 1.5}s`;
      p.style.animationDuration = `${0.3 + Math.random() * 0.3}s`;
      p.style.opacity = 0.3 + Math.random() * 0.5;
      container.appendChild(p);
      this.particles.push(p);
    }
  },
  
  /**
   * 多云：大小云朵混合全屏飘动
   */
  _createClouds(container) {
    // 大云 5-8 朵
    const bigCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < bigCount; i++) {
      const c = document.createElement('div');
      c.className = 'weather-particle cloud-big';
      c.style.top = `${Math.random() * 80}vh`;
      // 负延迟让云朵从动画中间开始，实现全屏随机分布
      const duration = 25 + Math.random() * 15;
      c.style.animationDuration = `${duration}s`;
      c.style.animationDelay = `-${Math.random() * duration}s`;
      c.style.opacity = 0.15 + Math.random() * 0.15;
      container.appendChild(c);
      this.particles.push(c);
    }
    // 小云 10-15 朵
    const smallCount = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < smallCount; i++) {
      const c = document.createElement('div');
      c.className = 'weather-particle cloud-small';
      c.style.top = `${Math.random() * 90}vh`;
      const duration = 15 + Math.random() * 10;
      c.style.animationDuration = `${duration}s`;
      c.style.animationDelay = `-${Math.random() * duration}s`;
      c.style.opacity = 0.1 + Math.random() * 0.2;
      container.appendChild(c);
      this.particles.push(c);
    }
  },
  
  /**
   * 清除所有粒子
   */
  clearParticles() {
    const container = document.getElementById('weatherParticles');
    if (container) {
      container.innerHTML = '';
    }
    this.particles = [];
    
    // 清除小鸟
    this.clearBirds();
    
    // 清除闪电定时器
    if (this.lightningTimer) {
      clearTimeout(this.lightningTimer);
      this.lightningTimer = null;
    }
  },
  
  /**
   * 更新小鸟（晴天专用）
   */
  updateBirds(weather) {
    if (weather === 'sunny') {
      this.createBirds(4);
    } else {
      this.clearBirds();
    }
  },
  
  /**
   * 创建像素风小鸟
   */
  createBirds(count) {
    this.clearBirds();
    const container = document.getElementById('weatherBirds');
    if (!container) return;
    
    const directions = ['from-left', 'from-right', 'from-top'];
    
    for (let i = 0; i < count; i++) {
      const dir = directions[Math.floor(Math.random() * directions.length)];
      
      const bird = document.createElement('div');
      bird.className = `pixel-bird ${dir}`;
      bird.style.animationDuration = `${10 + Math.random() * 8}s`;
      bird.style.animationDelay = `${i * 2 + Math.random() * 3}s`;
      
      // 根据出场方向设置初始位置
      if (dir === 'from-left' || dir === 'from-right') {
        bird.style.top = `${5 + Math.random() * 40}vh`;
      } else {
        bird.style.left = `${10 + Math.random() * 80}vw`;
      }
      
      // 波浪动画包裹层
      const wave = document.createElement('div');
      wave.className = 'bird-wave';
      wave.style.animationDelay = `${Math.random() * 2}s`;
      
      const wing = document.createElement('div');
      wing.className = 'bird-wing';
      wave.appendChild(wing);
      bird.appendChild(wave);
      
      container.appendChild(bird);
      this.birds.push(bird);
    }
  },
  
  /**
   * 清除小鸟
   */
  clearBirds() {
    const container = document.getElementById('weatherBirds');
    if (container) container.innerHTML = '';
    this.birds = [];
  },
  
  /**
   * 更新太阳显示
   */
  updateSun(weather) {
    const sun = document.getElementById('weatherSun');
    if (!sun) return;
    
    if (weather === 'sunny') {
      sun.classList.add('active');
    } else {
      sun.classList.remove('active');
    }
  },
  
  /**
   * 更新闪电效果
   */
  updateLightning(weather) {
    const lightning = document.getElementById('weatherLightning');
    if (!lightning) return;
    
    if (weather === 'stormy') {
      lightning.classList.add('active');
      this.startLightning(lightning);
    } else {
      lightning.classList.remove('active');
    }
  },
  
  /**
   * 启动闪电效果（随机间隔闪烁）
   */
  startLightning(element) {
    if (this.lightningTimer) {
      clearTimeout(this.lightningTimer);
    }
    
    const flash = () => {
      if (this.currentWeather !== 'stormy') return;
      
      element.classList.add('flash');
      setTimeout(() => {
        element.classList.remove('flash');
        // 有时会有双闪
        if (Math.random() > 0.5) {
          setTimeout(() => {
            element.classList.add('flash');
            setTimeout(() => element.classList.remove('flash'), 80);
          }, 100);
        }
      }, 150);
    };
    
    // 随机间隔 6-15 秒
    const scheduleNext = () => {
      const delay = 6000 + Math.random() * 9000;
      this.lightningTimer = setTimeout(() => {
        flash();
        scheduleNext();
      }, delay);
    };
    
    scheduleNext();
  },
  
  /**
   * 更新水洼涟漪（小雨专用）
   */
  updateRipples(weather) {
    const container = document.getElementById('weatherRipples');
    if (!container) return;
    
    // 清除旧涟漪
    container.innerHTML = '';
    
    if (weather === 'rainy') {
      // 创建 15-20 个随机涟漪
      const count = 15 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i++) {
        const r = document.createElement('div');
        r.className = 'ripple';
        r.style.left = `${Math.random() * 100}%`;
        r.style.top = `${Math.random() * 100}%`;
        r.style.animationDelay = `${Math.random() * 2}s`;
        r.style.animationDuration = `${1.5 + Math.random() * 1}s`;
        container.appendChild(r);
      }
    }
  }
};

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
  WeatherManager.init();
});
