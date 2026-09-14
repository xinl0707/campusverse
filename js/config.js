/* ============================================================
   CampusVerse · 双界校园 —— 全站唯一配置文件
   ------------------------------------------------------------
   ⚠️ 合并部署已完成（最终成品/server.js 统一服务器）：
   四个模块现在跑在同一个 Node 服务里，前端只需认路径，
   所有入口地址集中在这里，改路径也只改这一个文件。
   ============================================================ */

/** 站点信息（名称/标语改这里，全站自动生效） */
const SITE_NAME_EN = 'CampusVerse';
const SITE_NAME_CN = '双界校园';
const SITE_SLOGAN  = '虚拟与真实，都是你的校园';

/**
 * 四大模块入口配置（合并后版本 v7.0 · 已接入真实路径）
 * - 路径由 server.js 的 MOUNTS 挂载，四个模块互不冲突（不再抢 3000 端口、不再抢 /tools/）；
 * - 留空字符串 '' 或 '#' → 视为未接入，点击弹提示，绝不死链；
 * - 双击 file:// 打开预览时点击一律弹提示（见 main.js），要看真效果请跑 node server.js。
 *
 * ⚠️ 路径里"多出来的一层"不是笔误：挂载点是各组项目根目录，页面在它下面一两层，
 *    且页面用 ../common/、../../common/ 引用公共资源，这一层去掉就会 404。
 */
const MODULE_ENTRY = {
  simulator: '/simulator/simulator/',    // 挂载 模拟器组/main/    → 页面 main/simulator/index.html
  emotion:   '/emotion/tools/emotion/',  // 挂载 模块A 根目录       → 页面 tools/emotion/index.html
  schedule:  '/schedule/tools/',         // 挂载 模块B 根目录       → 页面 tools/index.html
  diary:     '/diary/tools/'             // 挂载 模块C 根目录       → 页面 tools/index.html
};

/** 跳转方式：'_self' 当前页跳转（定稿）；改 '_blank' 则新标签页打开 */
const MODULE_TARGET = '_self';

/** 四合一工作台地址（顶部导航与页脚入口共用） */
const WORKBENCH_ENTRY = '/workbench/';
