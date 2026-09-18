const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 静态文件：优先 public/，回退到根目录
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
} else {
  app.use(express.static(__dirname));
}

// ============ 数据存储 ============
const DATA_FILE = path.join(__dirname, 'data.json');
const DEFAULT_PASSWORD = 'qy2026';

const DEFAULT_DATA = {
  volunteers: [],
  prizes: [
    { id: 1, name: '甜咪巴斯克奥利奥生巧巴斯克', desc: '原价12.8元 · 半价6元', cost: 50, emoji: '🍰', locked: false },
    { id: 2, name: '瑞幸咖啡券', desc: '价值9.9元', cost: 90, emoji: '☕', locked: false },
    { id: 3, name: '更多神秘奖品', desc: '敬请期待...', cost: 0, emoji: '🔒', locked: true }
  ],
  adminPassword: 'admin123'
};

function loadData() {
  try { if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')); } catch (e) { console.error('读取数据失败:', e); }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}
function saveData() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error('保存数据失败:', e); } }
const db = loadData();
function genId() { return Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
function calcStats(vol) {
  const totalHours = (vol.hoursRecords || []).reduce((s, r) => s + r.hours, 0);
  const totalPoints = totalHours * 10;
  const usedPoints = (vol.redeemRecords || []).reduce((s, r) => s + r.cost, 0);
  return { totalHours, totalPoints, usedPoints, balance: totalPoints - usedPoints };
}

// ============ API ============
app.get('/api/prizes', (req, res) => res.json(db.prizes));
app.post('/api/prizes', (req, res) => {
  const { name, desc, cost, emoji } = req.body;
  if (!name || !cost || cost <= 0) return res.status(400).json({ error: '名称和积分不能为空' });
  const prize = { id: genId(), name, desc: desc || '', cost: parseInt(cost), emoji: emoji || '🎁', locked: false };
  db.prizes.push(prize); saveData(); res.json({ success: true, prize });
});
app.put('/api/prizes/:id', (req, res) => {
  const prize = db.prizes.find(p => String(p.id) === String(req.params.id));
  if (!prize) return res.status(404).json({ error: '奖品不存在' });
  const { name, desc, cost, emoji } = req.body;
  if (name) prize.name = name; if (desc !== undefined) prize.desc = desc;
  if (cost) prize.cost = parseInt(cost); if (emoji) prize.emoji = emoji;
  prize.locked = false; saveData(); res.json({ success: true, prize });
});
app.delete('/api/prizes/:id', (req, res) => { db.prizes = db.prizes.filter(p => String(p.id) !== String(req.params.id)); saveData(); res.json({ success: true }); });

app.post('/api/volunteer/register', (req, res) => {
  const { name, sid, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: '请输入姓名' });
  if (!sid || !sid.trim()) return res.status(400).json({ error: '请输入学号' });
  if (!password) return res.status(400).json({ error: '请输入密码' });
  let vol = db.volunteers.find(v => v.sid === sid.trim());
  if (vol) return res.status(400).json({ error: '该学号已注册，请直接登录' });
  vol = { id: genId(), name: name.trim(), sid: sid.trim(), password, hoursRecords: [], redeemRecords: [], createdAt: Date.now() };
  db.volunteers.push(vol); saveData(); res.json({ success: true, volunteer: { id: vol.id, name: vol.name, sid: vol.sid }, isNew: true });
});
app.post('/api/volunteer/login', (req, res) => {
  const { sid, password } = req.body;
  if (!sid || !password) return res.status(400).json({ error: '请输入学号和密码' });
  const vol = db.volunteers.find(v => v.sid === sid.trim());
  if (!vol) return res.status(404).json({ error: '该学号未注册' });
  if (vol.password !== password) return res.status(401).json({ error: '密码错误' });
  res.json({ success: true, volunteer: { id: vol.id, name: vol.name, sid: vol.sid } });
});
app.post('/api/volunteer/:id/change-password', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  const { oldPassword, newPassword } = req.body;
  if (vol.password !== oldPassword) return res.status(401).json({ error: '原密码错误' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  vol.password = newPassword; saveData(); res.json({ success: true });
});
app.get('/api/volunteer/:id', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  res.json({ id: vol.id, name: vol.name, sid: vol.sid, hoursRecords: vol.hoursRecords || [], redeemRecords: vol.redeemRecords || [], stats: calcStats(vol) });
});
app.post('/api/volunteer/:id/hours', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  const { activity, date, hours } = req.body;
  if (!activity || !activity.trim()) return res.status(400).json({ error: '请输入活动名称' });
  if (!date) return res.status(400).json({ error: '请选择日期' });
  if (!hours || hours <= 0) return res.status(400).json({ error: '请输入有效时长' });
  const record = { id: genId(), activity: activity.trim(), date, hours: parseFloat(hours), points: parseFloat(hours) * 10, createdAt: Date.now() };
  vol.hoursRecords.unshift(record); saveData(); res.json({ success: true, record, stats: calcStats(vol) });
});
app.delete('/api/volunteer/:id/hours/:recordId', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  vol.hoursRecords = vol.hoursRecords.filter(r => r.id !== req.params.recordId); saveData(); res.json({ success: true, stats: calcStats(vol) });
});
app.post('/api/volunteer/:id/redeem', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  const { prizeId } = req.body;
  const prize = db.prizes.find(p => String(p.id) === String(prizeId));
  if (!prize || prize.locked) return res.status(400).json({ error: '奖品不可用' });
  const stats = calcStats(vol);
  if (stats.balance < prize.cost) return res.status(400).json({ error: '积分不足' });
  const record = { id: genId(), date: new Date().toISOString().split('T')[0], prizeId: prize.id, prizeName: prize.name, cost: prize.cost, status: 'pending', createdAt: Date.now() };
  vol.redeemRecords.unshift(record); saveData(); res.json({ success: true, record, stats: calcStats(vol) });
});
app.delete('/api/volunteer/:id/redeem/:recordId', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  const record = vol.redeemRecords.find(r => r.id === req.params.recordId);
  if (record && record.status === 'redeemed') return res.status(400).json({ error: '已核销的兑换不可撤销' });
  vol.redeemRecords = vol.redeemRecords.filter(r => r.id !== req.params.recordId); saveData(); res.json({ success: true, stats: calcStats(vol) });
});

app.post('/api/admin/login', (req, res) => { if (req.body.password === db.adminPassword) res.json({ success: true }); else res.status(401).json({ error: '密码错误' }); });
app.get('/api/admin/volunteers', (req, res) => {
  const list = db.volunteers.map(v => ({ id: v.id, name: v.name, sid: v.sid, hoursRecords: v.hoursRecords || [], redeemRecords: v.redeemRecords || [], stats: calcStats(v) }));
  list.sort((a, b) => b.stats.totalPoints - a.stats.totalPoints); res.json(list);
});
app.get('/api/admin/stats', (req, res) => {
  let totalHours = 0, totalPoints = 0, totalRedeem = 0;
  db.volunteers.forEach(v => { const s = calcStats(v); totalHours += s.totalHours; totalPoints += s.totalPoints; totalRedeem += s.usedPoints; });
  res.json({ totalVols: db.volunteers.length, totalHours, totalPoints, totalRedeem });
});
app.get('/api/admin/ranking', (req, res) => {
  const byPoints = [...db.volunteers].map(v => ({ id: v.id, name: v.name, sid: v.sid, ...calcStats(v) })).sort((a, b) => b.totalPoints - a.totalPoints);
  const byHours = [...db.volunteers].map(v => ({ id: v.id, name: v.name, sid: v.sid, ...calcStats(v) })).sort((a, b) => b.totalHours - a.totalHours);
  res.json({ byPoints, byHours });
});
app.get('/api/admin/redeem-records', (req, res) => {
  let all = []; db.volunteers.forEach(v => { (v.redeemRecords || []).forEach(r => { all.push({ ...r, volName: v.name, volSid: v.sid }); }); });
  all.sort((a, b) => b.createdAt - a.createdAt); res.json(all);
});
app.post('/api/admin/redeem/:recordId/verify', (req, res) => {
  for (const vol of db.volunteers) { const record = (vol.redeemRecords || []).find(r => r.id === req.params.recordId); if (record) { record.status = 'redeemed'; record.verifiedAt = Date.now(); saveData(); return res.json({ success: true, record }); } }
  res.status(404).json({ error: '兑换记录不存在' });
});
app.post('/api/admin/redeem/:recordId/unverify', (req, res) => {
  for (const vol of db.volunteers) { const record = (vol.redeemRecords || []).find(r => r.id === req.params.recordId); if (record) { record.status = 'pending'; delete record.verifiedAt; saveData(); return res.json({ success: true, record }); } }
  res.status(404).json({ error: '兑换记录不存在' });
});
app.delete('/api/admin/volunteer/:id', (req, res) => { db.volunteers = db.volunteers.filter(v => v.id !== req.params.id); saveData(); res.json({ success: true }); });

// CSV导出（不需要额外依赖，Excel可直接打开）
app.get('/api/admin/export/excel', (req, res) => {
  const BOM = '\uFEFF';
  let csv = BOM + '序号,姓名,学号,志愿时长(小时),累计积分,已用积分,剩余积分\n';
  db.volunteers.forEach((v, i) => { const s = calcStats(v); csv += `${i+1},${v.name},${v.sid},${s.totalHours.toFixed(1)},${s.totalPoints},${s.usedPoints},${s.balance}\n`; });
  csv += '\n\n时长明细\n姓名,学号,活动名称,日期,时长(小时),获得积分\n';
  db.volunteers.forEach(v => { (v.hoursRecords || []).forEach(r => { csv += `${v.name},${v.sid},${r.activity},${r.date},${r.hours},${r.points}\n`; }); });
  csv += '\n\n兑换记录\n姓名,学号,奖品名称,消耗积分,兑换日期,状态\n';
  db.volunteers.forEach(v => { (v.redeemRecords || []).forEach(r => { csv += `${v.name},${v.sid},${r.prizeName},${r.cost},${r.date},${r.status === 'redeemed' ? '已核销' : '待核销'}\n`; }); });
  const filename = encodeURIComponent(`志愿者数据_${new Date().toISOString().split('T')[0]}.csv`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.send(csv);
});

app.get('/api/admin/export', (req, res) => res.json({ version: 2, exportTime: new Date().toLocaleString('zh-CN'), volunteers: db.volunteers, prizes: db.prizes }));
app.delete('/api/admin/clear-all', (req, res) => { db.volunteers = []; db.prizes = JSON.parse(JSON.stringify(DEFAULT_DATA.prizes)); saveData(); res.json({ success: true }); });
app.post('/api/admin/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (oldPassword !== db.adminPassword) return res.status(401).json({ error: '原密码错误' });
  if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新密码至少4位' });
  db.adminPassword = newPassword; saveData(); res.json({ success: true });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('*', (req, res) => {
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  if (fs.existsSync(p1)) res.sendFile(p1);
  else if (fs.existsSync(p2)) res.sendFile(p2);
  else res.status(404).send('Not found');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 青羽引领志愿者管理平台已启动`);
  console.log(`📱 访问地址: http://localhost:${PORT}`);
  console.log(`🛠️ 管理员默认密码: admin123`);
  console.log(`🙋 志愿者初始密码: ${DEFAULT_PASSWORD}`);
});
