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
app.use(express.static(path.join(__dirname, 'public')));

// ============ 数据存储 ============
const DATA_FILE = path.join(__dirname, 'data.json');

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
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('读取数据失败:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('保存数据失败:', e);
  }
}

const db = loadData();

// 生成 ID
function genId() {
  return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
}

// 计算志愿者统计
function calcStats(vol) {
  const totalHours = (vol.hoursRecords || []).reduce((s, r) => s + r.hours, 0);
  const totalPoints = totalHours * 10;
  const usedPoints = (vol.redeemRecords || []).reduce((s, r) => s + r.cost, 0);
  return { totalHours, totalPoints, usedPoints, balance: totalPoints - usedPoints };
}

// ============ API 路由 ============

// --- 奖品 ---
// 获取所有奖品
app.get('/api/prizes', (req, res) => {
  res.json(db.prizes);
});

// 添加奖品（管理员）
app.post('/api/prizes', (req, res) => {
  const { name, desc, cost, emoji } = req.body;
  if (!name || !cost || cost <= 0) {
    return res.status(400).json({ error: '名称和积分不能为空' });
  }
  const prize = {
    id: genId(),
    name,
    desc: desc || '',
    cost: parseInt(cost),
    emoji: emoji || '🎁',
    locked: false
  };
  db.prizes.push(prize);
  saveData();
  res.json({ success: true, prize });
});

// 更新奖品
app.put('/api/prizes/:id', (req, res) => {
  const id = req.params.id;
  const prize = db.prizes.find(p => String(p.id) === String(id));
  if (!prize) return res.status(404).json({ error: '奖品不存在' });

  const { name, desc, cost, emoji } = req.body;
  if (name) prize.name = name;
  if (desc !== undefined) prize.desc = desc;
  if (cost) prize.cost = parseInt(cost);
  if (emoji) prize.emoji = emoji;
  prize.locked = false;
  saveData();
  res.json({ success: true, prize });
});

// 删除奖品
app.delete('/api/prizes/:id', (req, res) => {
  const id = req.params.id;
  db.prizes = db.prizes.filter(p => String(p.id) !== String(id));
  saveData();
  res.json({ success: true });
});

// --- 志愿者 ---
// 注册/登录志愿者
app.post('/api/volunteer/register', (req, res) => {
  const { name, sid } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '请输入姓名' });
  }

  // 查找已存在的志愿者
  let vol = db.volunteers.find(v => v.name === name.trim() && (v.sid || '') === (sid || '').trim());

  if (vol) {
    res.json({ success: true, volunteer: vol, isNew: false });
  } else {
    vol = {
      id: genId(),
      name: name.trim(),
      sid: (sid || '').trim(),
      hoursRecords: [],
      redeemRecords: [],
      createdAt: Date.now()
    };
    db.volunteers.push(vol);
    saveData();
    res.json({ success: true, volunteer: vol, isNew: true });
  }
});

// 获取志愿者详情
app.get('/api/volunteer/:id', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });
  const stats = calcStats(vol);
  res.json({ ...vol, stats });
});

// 添加时长记录
app.post('/api/volunteer/:id/hours', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });

  const { activity, date, hours } = req.body;
  if (!activity || !activity.trim()) return res.status(400).json({ error: '请输入活动名称' });
  if (!date) return res.status(400).json({ error: '请选择日期' });
  if (!hours || hours <= 0) return res.status(400).json({ error: '请输入有效时长' });

  const record = {
    id: genId(),
    activity: activity.trim(),
    date,
    hours: parseFloat(hours),
    points: parseFloat(hours) * 10,
    createdAt: Date.now()
  };
  vol.hoursRecords.unshift(record);
  saveData();
  res.json({ success: true, record, stats: calcStats(vol) });
});

// 删除时长记录
app.delete('/api/volunteer/:id/hours/:recordId', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });

  vol.hoursRecords = vol.hoursRecords.filter(r => r.id !== req.params.recordId);
  saveData();
  res.json({ success: true, stats: calcStats(vol) });
});

// 兑换奖品
app.post('/api/volunteer/:id/redeem', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });

  const { prizeId } = req.body;
  const prize = db.prizes.find(p => String(p.id) === String(prizeId));
  if (!prize || prize.locked) return res.status(400).json({ error: '奖品不可用' });

  const stats = calcStats(vol);
  if (stats.balance < prize.cost) {
    return res.status(400).json({ error: '积分不足' });
  }

  const record = {
    id: genId(),
    date: new Date().toISOString().split('T')[0],
    prizeId: prize.id,
    prizeName: prize.name,
    cost: prize.cost,
    createdAt: Date.now()
  };
  vol.redeemRecords.unshift(record);
  saveData();
  res.json({ success: true, record, stats: calcStats(vol) });
});

// 撤销兑换
app.delete('/api/volunteer/:id/redeem/:recordId', (req, res) => {
  const vol = db.volunteers.find(v => v.id === req.params.id);
  if (!vol) return res.status(404).json({ error: '志愿者不存在' });

  vol.redeemRecords = vol.redeemRecords.filter(r => r.id !== req.params.recordId);
  saveData();
  res.json({ success: true, stats: calcStats(vol) });
});

// --- 管理员接口 ---
// 管理员登录
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === db.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: '密码错误' });
  }
});

// 获取所有志愿者
app.get('/api/admin/volunteers', (req, res) => {
  const list = db.volunteers.map(v => ({
    ...v,
    stats: calcStats(v)
  }));
  // 按积分降序
  list.sort((a, b) => b.stats.totalPoints - a.stats.totalPoints);
  res.json(list);
});

// 获取统计数据
app.get('/api/admin/stats', (req, res) => {
  let totalHours = 0, totalPoints = 0, totalRedeem = 0;
  db.volunteers.forEach(v => {
    const s = calcStats(v);
    totalHours += s.totalHours;
    totalPoints += s.totalPoints;
    totalRedeem += s.usedPoints;
  });
  res.json({
    totalVols: db.volunteers.length,
    totalHours,
    totalPoints,
    totalRedeem
  });
});

// 获取排行榜
app.get('/api/admin/ranking', (req, res) => {
  const byPoints = [...db.volunteers].map(v => ({
    id: v.id, name: v.name, sid: v.sid,
    ...calcStats(v)
  })).sort((a, b) => b.totalPoints - a.totalPoints);

  const byHours = [...db.volunteers].map(v => ({
    id: v.id, name: v.name, sid: v.sid,
    ...calcStats(v)
  })).sort((a, b) => b.totalHours - a.totalHours);

  res.json({ byPoints, byHours });
});

// 获取所有兑换记录
app.get('/api/admin/redeem-records', (req, res) => {
  let all = [];
  db.volunteers.forEach(v => {
    (v.redeemRecords || []).forEach(r => {
      all.push({ ...r, volName: v.name });
    });
  });
  all.sort((a, b) => b.createdAt - a.createdAt);
  res.json(all);
});

// 删除志愿者
app.delete('/api/admin/volunteer/:id', (req, res) => {
  db.volunteers = db.volunteers.filter(v => v.id !== req.params.id);
  saveData();
  res.json({ success: true });
});

// 导出全部数据
app.get('/api/admin/export', (req, res) => {
  res.json({
    version: 1,
    exportTime: new Date().toLocaleString('zh-CN'),
    volunteers: db.volunteers,
    prizes: db.prizes
  });
});

// 清空所有数据
app.delete('/api/admin/clear-all', (req, res) => {
  db.volunteers = [];
  db.prizes = JSON.parse(JSON.stringify(DEFAULT_DATA.prizes));
  saveData();
  res.json({ success: true });
});

// 修改管理员密码
app.post('/api/admin/change-password', (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (oldPassword !== db.adminPassword) {
    return res.status(401).json({ error: '原密码错误' });
  }
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: '新密码至少4位' });
  }
  db.adminPassword = newPassword;
  saveData();
  res.json({ success: true });
});

// 所有其他路由返回前端页面
app.get('/health', (req, res) => { res.json({ status: 'ok' }); });

app.get('*', (req, res) => {
  const p1 = path.join(__dirname, 'public', 'index.html');
  const p2 = path.join(__dirname, 'index.html');
  if (fs.existsSync(p1)) res.sendFile(p1);
  else if (fs.existsSync(p2)) res.sendFile(p2);
  else res.status(404).send('Not found');
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ 志愿者积分管理平台已启动`);
  console.log(`📱 访问地址: http://localhost:${PORT}`);
  console.log(`🛠️ 管理员默认密码: admin123`);
});
