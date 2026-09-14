/**
 * 课表分析模块
 * 提供智能分析：特殊上课模式、作息风险、碎片时间等
 */
const ScheduleAnalyzer = {
  /**
   * 完整课表分析入口
   * @param {Array} courses - 课程数组
   * @returns {Object} 分析报告
   */
  analyze(courses) {
    const report = {
      specialPatterns: this.detectSpecialPatterns(courses),
      highWeightCourses: this.identifyHighWeightCourses(courses),
      scheduleRisks: this.detectScheduleRisks(courses),
      fragmentTime: this.analyzeFragmentTime(courses),
      visualizationData: this.prepareVisualizationData(courses)
    };
    // 传入已算好的 report：generateRecommendations 早先是反过来调 analyze()，
    // 两者互相调用会直接爆栈，点「分析课表」因此毫无反应。
    report.recommendations = this.generateRecommendations(courses, report);
    return report;
  },

  /**
   * 检测特殊上课模式
   * @param {Array} courses - 课程数组
   * @returns {Array} 特殊模式列表
   */
  detectSpecialPatterns(courses) {
    const patterns = [];

    // 单双周识别
    const singleWeekCourses = courses.filter(c => c.weekType === '单周');
    const doubleWeekCourses = courses.filter(c => c.weekType === '双周');

    if (singleWeekCourses.length > 0) {
      patterns.push({
        type: 'singleWeek',
        label: '单周开课',
        description: `${singleWeekCourses.length} 门课程仅在单周上课`,
        courses: singleWeekCourses.map(c => c.name),
        severity: 'info'
      });
    }

    if (doubleWeekCourses.length > 0) {
      patterns.push({
        type: 'doubleWeek',
        label: '双周开课',
        description: `${doubleWeekCourses.length} 门课程仅在双周上课`,
        courses: doubleWeekCourses.map(c => c.name),
        severity: 'info'
      });
    }

    // 短期课程：按课名去重，逐门算出真实的结束周
    const shortByCourse = new Map();
    courses.filter(c => (parseInt(c.durationWeeks) || 20) < 10).forEach(c => {
      const sw = parseInt(c.startWeek) || 1;
      const dw = parseInt(c.durationWeeks) || 1;
      const prev = shortByCourse.get(c.name);
      const end = sw + dw - 1;
      if (!prev || end > prev.endWeek) shortByCourse.set(c.name, { startWeek: sw, endWeek: end });
    });
    if (shortByCourse.size > 0) {
      patterns.push({
        type: 'shortTerm',
        label: '短学期课程',
        description: [...shortByCourse.entries()]
          .map(([n, r]) => `${n} 第${r.startWeek}-${r.endWeek}周`).join('、'),
        courses: [...shortByCourse.keys()],
        severity: 'warning'
      });
    }

    // 隔周开课
    const everyOtherWeek = courses.filter(c => c.weekType === '隔周');
    if (everyOtherWeek.length > 0) {
      patterns.push({
        type: 'everyOtherWeek',
        label: '隔周开课',
        description: `${everyOtherWeek.length} 门课程采用隔周上课模式`,
        courses: everyOtherWeek.map(c => c.name),
        severity: 'info'
      });
    }

    return patterns;
  },

  /**
   * 识别高权重必修课
   * @param {Array} courses - 课程数组
   * @returns {Array} 高权重课程列表
   */
  identifyHighWeightCourses(courses) {
    const weightKeywords = ['必修', '核心', '专业基础', '学位', '专业'];
    const result = new Map();

    for (const course of courses) {
      const name = (course.name || '').trim();
      if (!name) continue;

      let score = 0;
      const reasons = [];

      const hit = weightKeywords.filter(k => name.includes(k));
      if (hit.length) {
        score += 3 * hit.length;
        reasons.push(`含「${hit.join('/')}」`);
      }

      if (course.credits) {
        if (course.credits >= 4) { score += 4; reasons.push(`${course.credits} 学分（高学分）`); }
        else if (course.credits >= 3) { score += 2; reasons.push(`${course.credits} 学分`); }
        else { score += 1; }
      }

      const toMin = t => {
        const [h, m] = String(t || '0:0').split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const minutes = Math.max(0, toMin(course.endTime) - toMin(course.startTime));
      if (minutes >= 180) { score += 2; reasons.push('单次课时 ≥3 小时'); }

      if (score >= 4) {
        const prev = result.get(name);
        if (!prev || score > prev.weightScore) {
          result.set(name, { ...course, weightScore: score, reasons: [...new Set(reasons)].join('，') });
        }
      }
    }

    return [...result.values()]
      .map(c => {
        const sessions = courses.filter(x => (x.name || '').trim() === c.name).length;
        return { ...c, weeklySessions: sessions };
      })
      .sort((a, b) => b.weightScore - a.weightScore);
  },

  /**
   * 检测作息风险
   * 早八阈值：08:30 前上课；晚间阈值：20:30 后下课
   */
  detectScheduleRisks(courses) {
    const risks = [];
    const toMin = t => {
      const [h, m] = String(t || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

    const onDay = d => courses.filter(c => c.day === d);
    const isEarly = c => toMin(c.startTime) <= toMin('08:30');
    const isLate = c => toMin(c.endTime) >= toMin('20:30');

    // 把按天判断的函数转成周一~周日的布尔数组，再求最长连续段
    const longestRun = (predicate) => {
      const flags = [];
      for (let d = 1; d <= 7; d++) flags.push(onDay(d).some(predicate));
      let best = 0, cur = 0, bestEnd = -1;
      flags.forEach((f, i) => {
        cur = f ? cur + 1 : 0;
        if (cur > best) { best = cur; bestEnd = i; }
      });
      const days = [];
      if (best > 0) for (let i = bestEnd - best + 1; i <= bestEnd; i++) days.push(DAY_NAMES[i]);
      return { length: best, days };
    };

    // ① 连续早八
    const earlyRun = longestRun(isEarly);
    const earlyCount = courses.filter(isEarly).length;
    if (earlyRun.length >= 3) {
      risks.push({
        type: 'earlyMorning',
        label: '连续早八预警',
        description: `${earlyRun.days.join('、')} 连续 ${earlyRun.length} 天都要上早八。`
          + `睡眠容易被长期压缩，建议前一晚固定 23:00 前入睡，并把早餐提前备好。`,
        severity: 'danger'
      });
    } else if (earlyCount > 0) {
      risks.push({
        type: 'earlyMorning',
        label: '有早八课程',
        description: `一周共 ${earlyCount} 次早八（${[...new Set(courses.filter(isEarly).map(c => c.name))].join('、')}），`
          + `集中在 ${earlyRun.days.join('、')}，注意别熬夜。`,
        severity: 'warning'
      });
    }

    // ② 晚间满课
    const lateRun = longestRun(isLate);
    const lateCount = courses.filter(isLate).length;
    if (lateRun.length >= 2) {
      risks.push({
        type: 'lateEvening',
        label: '晚间满课透支风险',
        description: `${lateRun.days.join('、')} 连续 ${lateRun.length} 天要上到 20:30 以后，`
          + `作业和复习时间会被挤掉，建议把白天的大块空档预留出来。`,
        severity: 'danger'
      });
    } else if (lateCount >= 1) {
      risks.push({
        type: 'lateEvening',
        label: '晚间有课',
        description: `有 ${lateCount} 次课程在 20:30 后结束，回宿舍时间较晚，注意人身与财物安全。`,
        severity: 'info'
      });
    }

    // ③ 超负荷学习日（单天 > 8 小时）—— 多天合并成一条，只列时间
    const heavy = [];
    for (let d = 1; d <= 7; d++) {
      const list = onDay(d);
      const minutes = list.reduce((s, c) => s + Math.max(0, toMin(c.endTime) - toMin(c.startTime)), 0);
      if (minutes > 480) {
        const first = list.reduce((m, c) => Math.min(m, toMin(c.startTime)), 1440);
        const last = list.reduce((m, c) => Math.max(m, toMin(c.endTime)), 0);
        heavy.push(`${DAY_NAMES[d - 1]} ${fmt(first)}-${fmt(last)} ${(minutes / 60).toFixed(1)}h`);
      }
    }
    if (heavy.length) {
      risks.push({
        type: 'longDay',
        label: heavy.length === 1 ? '超负荷学习日' : '超负荷学习日（合并）',
        description: `${heavy.join('；')}。单天超过 8 小时，下午效率会明显下降，建议课间离开工位活动。`,
        severity: 'warning',
        items: heavy
      });
    }

    // ④ 超长空档 —— 同样合并成一条，逐日列明具体时段
    const gaps = [];
    for (let d = 1; d <= 7; d++) {
      const list = onDay(d).sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
      for (let i = 0; i < list.length - 1; i++) {
        const gap = toMin(list[i + 1].startTime) - toMin(list[i].endTime);
        if (gap >= 150) {
          gaps.push({
            text: `${DAY_NAMES[d - 1]} ${list[i].endTime}-${list[i + 1].startTime} ${(gap / 60).toFixed(1)}h`,
            min: gap
          });
        }
      }
    }
    if (gaps.length) {
      // 只留最长的 3 处，其余折算成「等 N 处」，避免一行写十几段
      gaps.sort((a, b) => b.min - a.min);
      const shown = gaps.slice(0, 3).map(g => g.text).join('；');
      const more = gaps.length > 3 ? ` 等 ${gaps.length} 处` : '';
      risks.push({
        type: 'longGap',
        label: '超长空档',
        description: `${shown}${more}。来回宿舍不划算，建议留在图书馆/自习室。`,
        severity: 'info',
        items: gaps
      });
    }

    return risks;
  },

  /**
   * 分析碎片时间
   * @param {Array} courses - 课程数组
   * @returns {Object} 碎片时间分析
   */
  analyzeFragmentTime(courses) {
    const fragments = [];
    const hours = 9; // 9 小时教学时段
    const maxCoursesPerSlot = 2;

    for (let day = 1; day <= 7; day++) {
      const dayCourses = courses.filter(c => c.day === day).sort(
        (a, b) => compareTime(a.startTime, b.startTime)
      );

      if (dayCourses.length <= maxCoursesPerSlot) {
        const toMin2 = t => {
          const [h, m] = String(t || '0:0').split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        const fmt2 = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        // 空白天（0 节课）也要报，但不能按首尾课算跨度
        const busy = dayCourses.length
          ? toMin2(dayCourses[dayCourses.length - 1].endTime) - toMin2(dayCourses[0].startTime)
          : 0;

        fragments.push({
          day,
          dayName: this.getDayName(day),
          fragmentCount: dayCourses.length,
          firstStart: dayCourses.length ? dayCourses[0].startTime : '',
          lastEnd: dayCourses.length ? dayCourses[dayCourses.length - 1].endTime : '',
          freeHours: Math.max(0, Math.round((busy - dayCourses.reduce((s, c) => s + toMin2(c.endTime) - toMin2(c.startTime), 0)) / 30) / 2),
          type: '大量碎片',
          description: `只有 ${dayCourses.length} 节课`,
          suggestion: this.getStudySuggestions(dayCourses.length)
        });
      } else if (dayCourses.length > maxCoursesPerSlot) {
        // 计算课程间的空隙
        const gaps = this.calculateGaps(dayCourses);
        const smallGaps = gaps.filter(gap => gap.duration <= 60);

        if (smallGaps.length >= 2) {
          fragments.push({
            day,
            dayName: this.getDayName(day),
            fragmentCount: smallGaps.length,
            type: '零散间隙',
            description: `课间间隙过于零散 (${smallGaps.length}个≤1 小时的空闲)`,
            suggestion: '建议提前规划好每个间隙的学习内容，避免无效等待'
          });
        }
      }
    }

    return {
      hasFragments: fragments.length > 0,
      totalFragmentDays: fragments.length,
      fragments,
      overallSuggestion: fragments.length > 2
        ? '本周有多天存在碎片时间，建议使用番茄工作法高效利用'
        : '整体课表安排较为紧凑，继续保持节奏'
    };
  },

  /**
   * 获取学习建议
   * @param {number} classCount - 课程数量
   * @returns {string}
   */
  getStudySuggestions(classCount) {
    const suggestions = [
      '预习下节课内容',
      '复习已学知识点',
      '完成课后作业',
      '阅读专业文献',
      '练习编程题目',
      '整理学习笔记',
      '进行小组讨论',
      '准备实验报告'
    ];

    if (classCount === 0) return '充分利用全天时间自主学习';
    if (classCount === 1) return suggestions[0];
    if (classCount === 2) return suggestions.slice(0, 2).join('和');
    return '根据兴趣选择 2-3 项学习内容';
  },

  /**
   * 计算课程间隔
   * @param {Array} courses - 当天课程
   * @returns {Array} 间隔数组
   */
  calculateGaps(courses) {
    const gaps = [];
    for (let i = 0; i < courses.length - 1; i++) {
      const currentEnd = courses[i].endTime;
      const nextStart = courses[i + 1].startTime;

      const [endH, endM] = currentEnd.split(':').map(Number);
      const [nextH, nextM] = nextStart.split(':').map(Number);

      const gapMinutes = (nextH * 60 + nextM) - (endH * 60 + endM);

      gaps.push({
        index: i,
        between: [courses[i].name, courses[i + 1].name],
        duration: gapMinutes,
        durationStr: this.formatDuration(gapMinutes)
      });
    }
    return gaps;
  },

  /**
   * 格式化时长
   * @param {number} minutes - 分钟数
   * @returns {string}
   */
  formatDuration(minutes) {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
  },

  /**
   * 获取星期名称
   * @param {number} day - 1-7
   * @returns {string}
   */
  getDayName(day) {
    const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    return names[day - 1] || '';
  },

  /**
   * 查找连续天数
   * @param {Array} courses - 课程数组
   * @param {number} count - 需要的条件计数
   * @returns {number}
   */
  findConsecutiveDays(courses, count) {
    const days = new Set();
    courses.forEach(c => days.add(c.day));
    return days.size;
  },

  /**
   * 检查是否有连续几天满足条件
   * @param {Array} courses - 课程数组
   * @param {number} targetDay - 目标日
   * @param {Function} condition - 条件函数
   * @returns {boolean}
   */
  hasConsecutiveDays(courses, targetDay, condition) {
    let count = 0;
    for (let d = 1; d <= 7; d++) {
      const dayCourses = courses.filter(c => c.day === d);
      if (dayCourses.some(condition)) {
        count++;
      } else {
        if (count >= 3) return true;
        count = 0;
      }
    }
    return count >= 3;
  },

  /**
   * 生成可视化数据
   * @param {Array} courses - 课程数组
   * @returns {Object}
   */
  /**
   * 生成可视化数据与五维雷达
   * 五维：学习强度 / 作息压力 / 课程权重 / 时间碎片化 / 晚间负荷
   */
  prepareVisualizationData(courses) {
    const toMin = t => {
      const [h, m] = String(t || '0:0').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const hoursOf = c => Math.max(0, toMin(c.endTime) - toMin(c.startTime)) / 60;
    // 单/双/隔周课程摊薄到每周只算一半
    const factor = c => (c.weekType && c.weekType !== '每周') ? 0.5 : 1;

    const weeklyHours = courses.reduce((s, c) => s + hoursOf(c) * factor(c), 0);

    const dayDistribution = {};
    for (let i = 1; i <= 7; i++) dayDistribution[i] = courses.filter(c => c.day === i).length;

    const timeDistribution = { morning: 0, afternoon: 0, evening: 0 };
    courses.forEach(c => {
      const h = Math.floor(toMin(c.startTime) / 60);
      if (h < 12) timeDistribution.morning++;
      else if (h < 18) timeDistribution.afternoon++;
      else timeDistribution.evening++;
    });

    const earlyCount = courses.filter(c => toMin(c.startTime) <= toMin('08:30')).length;
    const lateCount = courses.filter(c => toMin(c.endTime) >= toMin('20:30')).length;
    const busyDays = Object.values(dayDistribution).filter(n => n > 0).length || 1;
    const heavyDays = Object.values(dayDistribution).filter(n => n >= 4).length;

    // 高权重课程占比（必修 / 高学分）
    const weightMap = this.identifyHighWeightCourses(courses);
    const weightRatio = courses.length ? weightMap.length / courses.length : 0;

    const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

    return {
      totalHours: Math.round(weeklyHours * 10) / 10,
      totalCourses: new Set(courses.map(c => (c.name || '').trim())).size,
      weeklySessions: courses.length,
      dayDistribution,
      timeDistribution,
      radarData: {
        labels: ['学习强度', '作息压力', '课程权重', '时间碎片化', '晚间负荷'],
        values: [
          clamp(weeklyHours / 25 * 100),                       // 每周 25 小时视为满格
          clamp((earlyCount / busyDays) * 50 + (heavyDays / 5) * 50),
          clamp(weightRatio * 100),
          clamp((7 - busyDays) / 7 * 100 * 0.6 + heavyDays / 5 * 100 * 0.4),
          clamp((lateCount / busyDays) * 100)
        ]
      }
    };
  },

  /**
   * 生成综合建议
   * @param {Array} courses - 课程数组
   * @returns {Array} 建议列表
   */
  generateRecommendations(courses, precomputed) {
    const recs = [];
    // 复用调用方已经算好的结果，缺省时只算需要的三项，绝不回调 analyze()
    const analysis = precomputed || {
      specialPatterns: this.detectSpecialPatterns(courses),
      scheduleRisks: this.detectScheduleRisks(courses),
      fragmentTime: this.analyzeFragmentTime(courses)
    };

    if (analysis.specialPatterns.some(p => p.type === 'shortTerm')) {
      recs.push({
        type: 'urgent',
        title: '短期课程抓紧完成',
        content: '部分课程即将结束，请尽快完成相关作业和项目'
      });
    }

    if (analysis.scheduleRisks.some(r => r.severity === 'danger')) {
      recs.push({
        type: 'health',
        title: '注意身体健康',
        content: '课表显示作息可能存在较大压力，请注意合理安排休息时间'
      });
    }

    if (analysis.fragmentTime.totalFragmentDays > 2) {
      recs.push({
        type: 'productivity',
        title: '高效利用碎片时间',
        content: '建议制定详细学习计划，充分利用每一块空闲时间'
      });
    }

    recs.push({
      type: 'general',
      title: '保持良好学习习惯',
      content: '定期复习、积极参与课堂讨论、主动寻求帮助'
    });

    return recs;
  }
};

window.ScheduleAnalyzer = ScheduleAnalyzer;
