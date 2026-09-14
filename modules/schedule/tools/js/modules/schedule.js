/**
 * 课表管理模块
 * 处理课程数据、ICS 解析、WebCal 订阅等功能
 */
const ScheduleManager = {
  dataKey: 'schedule_data',

  init() {
    const savedData = StorageManager.load(this.dataKey);
    if (!Array.isArray(savedData) || savedData.length === 0) return savedData || [];

    // 读取时也要合并：旧版本把同一门课按周存了几十条，只在 save() 里去重
    // 意味着「不重新导入就永远看到叠在一起的一堆模块」。这里顺手回写完成迁移。
    const clean = this.dedupeCourses(savedData);
    if (clean.length !== savedData.length) {
      console.log(`🧹 读取时自动合并重复：${savedData.length} 条 → ${clean.length} 门`);
      StorageManager.save(this.dataKey, clean);   // 直接写，绕开 save() 防止递归
    }
    return clean;
  },

  save(courses) {
    StorageManager.save(this.dataKey, this.dedupeCourses(courses));
  },

  /**
   * 课程名归一：去空格、去掉「(第3周)」这类周次后缀和长编号，
   * 避免同一门课因写法细微差别被拆成多组。
   */
  normName(name) {
    return String(name || '未命名课程')
      .replace(/\s+/g, '')
      .replace(/[（(]\s*(第)?\s*\d+\s*(周|班|组)?\s*[)）]\s*$/, '')
      .replace(/[_#-]\d{4,}$/, '')
      .toLowerCase();
  },

  /** 时间归一到 5 分钟桶：08:05 / 8:5 / 08:00 的细碎差别不该拆出两个模块 */
  timeBucket(t) {
    const [h, m] = String(t || '0:0').split(':').map(Number);
    return Math.round(((h || 0) * 60 + (m || 0)) / 5) * 5;
  },

  /**
   * 合并重复课程。
   * ICS 常把同一门课的每一周写成一条独立事件（HDU 就是 20 条），
   * 直接入库会导致同一时间格里叠出十几个一模一样的模块。
   * 按 (归一课名|星期|起止时间) 归并（地点差异并入同一门课），
   * 再用事件日期反推起始周、持续周数与单双周属性。
   */
  dedupeCourses(list) {
    if (!Array.isArray(list) || list.length === 0) return [];

    // 学期锚点 = 最早事件所在周的周一
    const dated = list.filter(c => c.eventDate);
    let anchor = null;
    if (dated.length > 1) {
      const times = dated.map(c => new Date(c.eventDate + 'T00:00:00').getTime());
      const min = new Date(Math.min(...times));
      const dow = min.getDay();                      // 0=周日
      min.setDate(min.getDate() + (dow === 0 ? -6 : 1 - dow));
      anchor = min;
    }

    const weekIndexOf = (dateStr) => {
      const t = new Date(dateStr + 'T00:00:00').getTime();
      return Math.floor((t - anchor.getTime()) / (7 * 24 * 3600 * 1000)) + 1;
    };

    const groups = new Map();
    for (const c of list) {
      if (!c) continue;
      const key = `${this.normName(c.name)}|${c.day}|${this.timeBucket(c.startTime)}|${this.timeBucket(c.endTime)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    const out = [];
    for (const arr of groups.values()) {
      const base = { ...arr[0] };
      delete base.eventDate;
      base.id = base.id || generateId();

      const explicitWeekType = arr.map(a => a.weekType).find(w => w && w !== '每周');

      if (anchor && dated.length > 1) {
        const weeks = [...new Set(
          arr.filter(c => c.eventDate).map(c => weekIndexOf(c.eventDate))
        )].sort((a, b) => a - b);

        if (weeks.length > 0) {
          base.startWeek = weeks[0];
          base.durationWeeks = weeks[weeks.length - 1] - weeks[0] + 1;
          base.sessionsPerCycle = weeks.length;

          const diffs = weeks.slice(1).map((w, i) => w - weeks[i]);
          const alternating = diffs.length > 0 && diffs.every(d => d === 2);
          if (explicitWeekType) {
            base.weekType = explicitWeekType;
          } else if (alternating) {
            base.weekType = weeks[0] % 2 === 1 ? '单周' : '双周';
          } else {
            base.weekType = '每周';
          }
        }
      } else {
        // 没有事件日期（早期存下来的数据）：把各条记录自带的周区间取并集，
        // 否则合并后只剩第一条的「第1周/1周」，第 2 周一起这门课就凭空消失了。
        const ranges = arr.map(a => {
          const s = parseInt(a.startWeek) || 1;
          const d = Math.max(1, parseInt(a.durationWeeks) || 1);
          return [s, s + d - 1];
        });
        const sw = Math.min(...ranges.map(r => r[0]));
        const ew = Math.max(...ranges.map(r => r[1]));
        base.startWeek = sw;
        base.durationWeeks = Math.max(1, ew - sw + 1);
        base.sessionsPerCycle = arr.length;
        if (explicitWeekType) base.weekType = explicitWeekType;
      }

      out.push(base);
    }

    const mergedSameCourse = this.mergeOverlappingSameCourse(out);

    if (mergedSameCourse.length !== list.length) {
      console.log(`🧹 去重合并：${list.length} 条事件 → ${mergedSameCourse.length} 个课程模块`);
    }
    return mergedSameCourse;
  },

  /**
   * 第二遍清洗：同名课程在同一天的时间段若重叠或紧挨着（≤10 分钟），
   * 并成一条最宽区间。HDU 的 ICS 会把一次 2 学时写成
   * 「08:00-08:50」和「08:00-09:40」两条，不并就会在同一格里叠出两个模块。
   */
  mergeOverlappingSameCourse(list) {
    const fmt = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const buckets = new Map();

    for (const c of list) {
      const key = `${this.normName(c.name)}|${c.day}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(c);
    }

    const out = [];
    for (const arr of buckets.values()) {
      arr.sort((a, b) => this.timeBucket(a.startTime) - this.timeBucket(b.startTime));
      for (const raw of arr) {
        const c = { ...raw };
        const s = this.timeBucket(c.startTime);
        const e = Math.max(this.timeBucket(c.endTime), s + 5);
        const hit = out.find(m =>
          this.normName(m.name) === this.normName(c.name) && m.day === c.day &&
          this.timeBucket(c.startTime) <= this.timeBucket(m.endTime) + 10);

        if (hit) {
          hit.endTime = fmt(Math.max(this.timeBucket(hit.endTime), e));
          hit.startWeek = Math.min(parseInt(hit.startWeek) || 1, parseInt(c.startWeek) || 1);
          const hitEnd = (parseInt(hit.startWeek) || 1) + (parseInt(hit.durationWeeks) || 16) - 1;
          const cEnd = (parseInt(c.startWeek) || 1) + (parseInt(c.durationWeeks) || 16) - 1;
          hit.durationWeeks = Math.max(1, Math.max(hitEnd, cEnd) - (parseInt(hit.startWeek) || 1) + 1);
          if (!hit.location && c.location) hit.location = c.location;
          if (!hit.teacher && c.teacher) hit.teacher = c.teacher;
        } else {
          c.startTime = fmt(s);
          c.endTime = fmt(e);
          out.push(c);
        }
      }
    }
    return out;
  },

  addCourse(course) {
    const schedule = this.init();
    course.id = generateId();
    course.createdAt = Date.now();
    schedule.push(course);
    this.save(schedule);
    return course;
  },

  updateCourse(id, updates) {
    const schedule = this.init();
    const index = schedule.findIndex(c => c.id === id);
    if (index !== -1) {
      schedule[index] = { ...schedule[index], ...updates };
      this.save(schedule);
      return schedule[index];
    }
    return null;
  },

  deleteCourse(id) {
    let schedule = this.init();
    const initialLength = schedule.length;
    schedule = schedule.filter(c => c.id !== id);
    if (schedule.length < initialLength) {
      this.save(schedule);
      showToast('课程已删除', 'success');
      return true;
    }
    return false;
  },

  getCoursesByDay(day) {
    const schedule = this.init();
    return schedule.filter(c => c.day === day).sort((a, b) => compareTime(a.startTime, b.startTime));
  },

  getAllCourses() {
    return this.init();
  },

  /**
   * 常见大学节次时间表（用于把 "第1-2节" 转成具体时间）
   */
  periodTimes: {
    1: ['08:00', '08:50'], 2: ['08:55', '09:45'], 3: ['10:00', '10:50'], 4: ['10:55', '11:45'],
    5: ['14:00', '14:50'], 6: ['14:55', '15:45'], 7: ['16:00', '16:50'], 8: ['16:55', '17:45'],
    9: ['18:30', '19:20'], 10: ['19:25', '20:15'], 11: ['20:20', '21:10'], 12: ['21:15', '22:05']
  },

  /**
   * 把 "周三" / "Wednesday" / 3 / "3" 统一成 ISO 数字 1=周一 ... 7=周日
   */
  normalizeDay(value) {
    if (value === undefined || value === null) return null;
    const map = { '日': 7, '天': 7, '周': 0, '星期': 0 };
    const cn = ['一', '二', '三', '四', '五', '六', '日'];

    if (typeof value === 'number') return value >= 1 && value <= 7 ? value : null;

    const s = String(value).trim();
    if (/^[1-7]$/.test(s)) return parseInt(s, 10);

    // 匹配 周X / 星期X / 礼拜X
    const m = s.match(/(?:周|星期|礼拜|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i);
    if (m) {
      const en = s.toLowerCase();
      const enMap = { sunday: 7, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
      for (const k in enMap) if (en.includes(k)) return enMap[k];
      for (let i = 0; i < cn.length; i++) {
        if (s.includes(cn[i])) return i + 1;   // 一→1 ... 六→6, 日→7
      }
      if (s.includes('日') || s.includes('天')) return 7;
    }
    if (map[s]) return map[s] || null;
    return null;
  },

  /**
   * 把 "8:5" / "0805" / "8点" 统一成 "HH:mm"
   */
  normalizeTime(value) {
    if (!value) return null;
    const s = String(value).trim();
    let m = s.match(/(\d{1,2})[:：.点](\d{1,2})/);
    if (m) {
      const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
      if (h > 23 || mi > 59) return null;
      return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
    m = s.match(/^(\d{1,2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      return h <= 23 ? `${String(h).padStart(2, '0')}:00` : null;
    }
    m = s.match(/^(\d{2})(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
      if (h <= 23 && mi <= 59) return s;
    }
    return null;
  },

  /**
   * 从 "第1-2节" / "1-2节" / "3,4节" 解析出起止时间
   */
  periodsToTime(value) {
    if (!value) return null;
    const s = String(value);
    let m = s.match(/(\d+)\s*[-~至到]\s*(\d+)\s*节?/);
    if (!m) m = s.match(/第?(\d+)\s*节/);
    if (!m) return null;
    const startP = parseInt(m[1], 10);
    const endP = parseInt(m[2] || m[1], 10);
    const st = this.periodTimes[startP];
    const en = this.periodTimes[endP];
    if (!st || !en) return null;
    return { startTime: st[0], endTime: en[1] };
  },

  /**
   * 批量规范化 AI 返回的课程数组
   * 兼容各种中英文字段别名与时间写法，丢弃无法定位时间的条目
   */
  normalizeCourses(list) {
    this.lastSkipped = [];
    if (!Array.isArray(list)) return [];
    const pick = (obj, keys) => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k];
      }
      return null;
    };

    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;

      const name = pick(raw, ['name', 'courseName', 'course_name', 'title', '课程名称', '课程', 'nameOfCourse']);
      const dayRaw = pick(raw, ['day', 'weekday', 'weekDay', 'dayOfWeek', 'courseDay', '星期', '周', 'dayofweek']);
      const day = this.normalizeDay(dayRaw);

      // 时间：优先显式起止，其次 "08:00-09:40" 合并串，最后节次
      let startTime = this.normalizeTime(pick(raw, ['startTime', 'start', 'start_time', 'beginTime', '开始时间', 'from']));
      let endTime = this.normalizeTime(pick(raw, ['endTime', 'end', 'end_time', 'finishTime', '结束时间', 'to']));

      if (!startTime || !endTime) {
        const range = pick(raw, ['time', 'timeRange', 'courseTime', '时间', '上课时间']);
        if (range) {
          const parts = String(range).split(/\s*[-~至到—]\s*/).filter(Boolean);
          if (parts.length >= 2) {
            startTime = startTime || this.normalizeTime(parts[0]);
            endTime = endTime || this.normalizeTime(parts[parts.length - 1]);
          }
        }
      }
      if (!startTime || !endTime) {
        const periods = pick(raw, ['period', 'periods', 'sections', '节次', '第几节', 'classes']);
        const conv = this.periodsToTime(periods);
        if (conv) {
          startTime = startTime || conv.startTime;
          endTime = endTime || conv.endTime;
        }
      }
      // 有开始无结束 → 默认 90 分钟（两节课）
      if (startTime && !endTime) {
        const [h, mnt] = startTime.split(':').map(Number);
        const total = h * 60 + mnt + 90;
        endTime = `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
      }

      // 支持一门课每周多天：day: [1,3] 或 "周一、周三"
      let days = [];
      if (Array.isArray(dayRaw)) {
        days = dayRaw.map(d => this.normalizeDay(d)).filter(Boolean);
      } else if (dayRaw !== null && /[,、和与&\/]/.test(String(dayRaw))) {
        days = String(dayRaw).split(/[,、和与&\/]+/).map(p => this.normalizeDay(p)).filter(Boolean);
      } else {
        const single = this.normalizeDay(dayRaw);
        days = single ? [single] : [];
      }

      const location = pick(raw, ['location', 'room', 'classroom', 'place', 'address', '地点', '教室', '上课地点']) || '';
      const teacher = pick(raw, ['teacher', 'teacherName', 'instructor', 'professor', '老师', '教师', '授课教师']) || '';

      let weekType = pick(raw, ['weekType', 'week_type', 'weeks', 'type', '周次']) || '每周';
      weekType = String(weekType);
      if (/单/.test(weekType)) weekType = '单周';
      else if (/双/.test(weekType)) weekType = '双周';
      else if (/隔/.test(weekType)) weekType = '隔周';
      else weekType = '每周';
      // 课程名里带 (单)/（双周） 也识别
      if (name && /[(（【\[]\s*(单|双)/.test(String(name))) {
        weekType = /单/.test(String(name)) ? '单周' : '双周';
      }

      // AI 常把「周一第1-2节」整串塞进一个字段 → 再从 time/节次/课程名里抢救一次
      if (days.length === 0 || !startTime) {
        const blob = [raw.time, raw.timeRange, raw.courseTime, raw.periods, raw.period,
          raw['时间'], raw['节次'], raw['上课时间'], name]
          .filter(v => v !== undefined && v !== null && String(v).trim() !== '').join(' ');

        if (days.length === 0) {
          const dm = blob.match(/周[一二三四五六日天]|星期[一二三四五六日天]|(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*/i);
          const rescued = dm && this.normalizeDay(dm[0]);
          if (rescued) { days = [rescued]; }
        }
        if (!startTime) {
          const conv = this.periodsToTime(blob);
          if (conv) { startTime = conv.startTime; endTime = conv.endTime; }
        }
      }

      // 无法定位到某天某时 → 跳过（记下来，识别弹窗要告诉用户到底缺了什么）
      if (!name || days.length === 0 || !startTime) {
        const missing = [!name ? '课程名称' : null, days.length === 0 ? '星期' : null, !startTime ? '时间' : null]
          .filter(Boolean).join('、');
        console.warn(`⚠️ 跳过无法解析的条目（缺${missing}）:`, raw);
        this.lastSkipped.push({ raw, missing, name: name || '(无名)' });
        continue;
      }

      // 多天课程展开为多条记录
      for (const d of [...new Set(days)]) {
        out.push({
          id: generateId(),
          name: String(name).trim(),
          day: d,
          startTime,
          endTime,
          location: String(location).trim(),
          teacher: String(teacher).trim(),
          credits: parseFloat(raw.credits ?? raw.credit ?? raw.学分) || 0,
          weekType,
          startWeek: parseInt(raw.startWeek ?? raw.beginWeek ?? 1, 10) || 1,
          durationWeeks: parseInt(raw.durationWeeks ?? raw.duration ?? raw.weeks ?? 16, 10) || 16,
          // 必须透传：合并重复课时要靠它反推起始周与单双周
          eventDate: raw.eventDate || null
        });
      }
    }
    return out;
  },

  getTotalHours() {
    const courses = this.getAllCourses();
    let totalMinutes = 0;
    courses.forEach(course => {
      const [startH, startM] = course.startTime.split(':').map(Number);
      const [endH, endM] = course.endTime.split(':').map(Number);
      const minutes = (endH - startH) * 60 + (endM - startM);
      totalMinutes += Math.max(0, minutes);
    });
    return Math.round(totalMinutes / 60 * 10) / 10;
  },

  getDaysWithClasses() {
    const courses = this.getAllCourses();
    return new Set(courses.map(c => c.day)).size;
  },

  parseICSFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const courses = this.parseICSContent(e.target.result);
          resolve(courses);
        } catch (error) {
          console.error('ICS 解析失败:', error);
          showToast('ICS 解析失败，请检查文件格式', 'error');
          resolve([]);
        }
      };
      reader.readAsText(file);
    });
  },

  /**
   * 从 ICS 文本解析课程（公开方法）
   * 支持带属性参数的写法，例如 DTSTART;TZID=Asia/Shanghai:20261116T080500
   */
  parseICSContent(text) {
    try {
      // 兼容 \r\n 换行，并还原 ICS 的折叠行（以空格开头的续行）
      const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const lines = [];
      for (const raw of rawLines) {
        if (/^[ \t]/.test(raw) && lines.length > 0) {
          lines[lines.length - 1] += raw.slice(1);
        } else {
          lines.push(raw);
        }
      }

      const courses = [];
      let currentEvent = null;

      // 取出 "KEY;PARAM=xxx:VALUE" 中的 KEY 和 VALUE
      const splitProp = (line) => {
        const idx = line.indexOf(':');
        if (idx === -1) return null;
        const keyPart = line.substring(0, idx).split(';')[0].trim().toUpperCase();
        const value = line.substring(idx + 1).replace(/\\,/g, ',').replace(/\\n/gi, '\n');
        return { key: keyPart, value };
      };

      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;

        if (line.toUpperCase() === 'BEGIN:VEVENT') {
          currentEvent = {};
          continue;
        }
        if (line.toUpperCase() === 'END:VEVENT') {
          if (currentEvent && currentEvent.summary && currentEvent.dtstart) {
            const course = this.convertICSEventToCourse(currentEvent);
            if (course) courses.push(course);
          }
          currentEvent = null;
          continue;
        }

        if (!currentEvent) continue;

        const prop = splitProp(line);
        if (!prop) continue;

        if (prop.key === 'SUMMARY') currentEvent.summary = prop.value;
        else if (prop.key === 'DTSTART') currentEvent.dtstart = prop.value;
        else if (prop.key === 'DTEND') currentEvent.dtend = prop.value;
        else if (prop.key === 'LOCATION') currentEvent.location = prop.value;
        else if (prop.key === 'DESCRIPTION') currentEvent.description = prop.value;
      }

      return courses;
    } catch (error) {
      console.error('ICS 解析错误:', error);
      return [];
    }
  },

  /**
   * 将 ICS 事件转换为课程对象
   * 返回的 day 采用 ISO 规范：1=周一 ... 7=周日
   */
  convertICSEventToCourse(event) {
    try {
      const parseICSDate = (str) => {
        if (!str) return null;
        // 形如 20261116T080500 / 20261116T080500Z / 2026-11-16
        const m = String(str).match(/(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
        if (!m) return null;
        return {
          year: +m[1], month: +m[2], day: +m[3],
          hour: m[4] ? +m[4] : 0,
          minute: m[5] ? +m[5] : 0
        };
      };

      const start = parseICSDate(event.dtstart);
      if (!start) return null;

      const dateObj = new Date(start.year, start.month - 1, start.day);
      const jsDay = dateObj.getDay();          // 0=周日, 1=周一 ... 6=周六
      const isoDay = jsDay === 0 ? 7 : jsDay;  // 转成 1=周一 ... 7=周日

      const startTime = `${String(start.hour).padStart(2, '0')}:${String(start.minute).padStart(2, '0')}`;
      const end = parseICSDate(event.dtend);
      const endTime = end
        ? `${String(end.hour).padStart(2, '0')}:${String(end.minute).padStart(2, '0')}`
        : '17:00';

      // 从 DESCRIPTION 中提取授课老师
      let teacher = '';
      if (event.description) {
        const t = event.description.match(/(?:授课老师|教师|老师)[：:]\s*([^\n\\]+)/);
        if (t) teacher = t[1].trim();
      }

      return {
        id: generateId(),
        name: (event.summary || '未命名课程').trim(),
        day: isoDay,
        startTime,
        endTime,
        location: (event.location || '').trim(),
        teacher,
        credits: 0,
        weekType: '每周',
        startWeek: 1,
        durationWeeks: 20,
        eventDate: `${start.year}-${String(start.month).padStart(2, '0')}-${String(start.day).padStart(2, '0')}`
      };
    } catch (error) {
      console.error('ICS 转换失败:', error);
      return null;
    }
  }
};

window.ScheduleManager = ScheduleManager;
