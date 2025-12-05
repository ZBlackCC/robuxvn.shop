// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname)); // phục vụ file tĩnh: index.html, admin.html, v.v.

// Database (file JSON)
const DB_FILE = path.join(__dirname, 'database.json');

let db = {
  users: {},
  napHistory: [],
  rutHistory: [],
  adminPassword: "admin123" // đổi pass ở đây
};

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE));
  } catch (e) {
    console.log("Lỗi đọc DB, dùng mặc định");
  }
}

// Auto save mỗi 10 giây
setInterval(() => {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log("Đã lưu database");
}, 10000);

// API: Lấy dữ liệu người dùng
app.get('/api/user/:username', (req, res) => {
  const { username } = req.params;
  const user = db.users[username] || { username, balance: 0 };
  res.json(user);
});

// API: Nạp QR (tự động)
app.post('/api/nap/qr', (req, res) => {
  const { username, amount } = req.body;
  const robux = Math.floor(amount / 10000 * 65);

  if (!db.users[username]) db.users[username] = { username, balance: 0 };
  db.users[username].balance += robux;

  db.napHistory.push({
    id: Date.now(),
    user: username,
    amount,
    robux,
    method: "QR Bank",
    status: "success",
    time: new Date().toISOString()
  });

  res.json({ success: true, robux });
});

// API: Nạp thẻ cào (chờ duyệt)
app.post('/api/nap/card', (req, res) => {
  const { username, amount, seri, code, cardType } = req.body;
  const robux = Math.floor(amount / 10000 * 65);

  const orderId = Date.now();
  db.napHistory.push({
    id: orderId,
    user: username,
    amount,
    robux,
    seri,
    code,
    cardType,
    method: "Thẻ cào",
    status: "pending",
    time: new Date().toISOString()
  });

  res.json({ success: true, message: "Đã gửi thẻ, chờ duyệt!" });
});

// API: Rút Robux (chờ duyệt)
app.post('/api/rut', (req, res) => {
  const { username, robux, to } = req.body;

  if (!db.users[username] || db.users[username].balance < robux) {
    return res.json({ success: false, message: "Số dư không đủ!" });
  }

  const orderId = Date.now();
  db.rutHistory.push({
    id: orderId,
    user: username,
    robux,
    to,
    status: "pending",
    time: new Date().toISOString()
  });

  res.json({ success: true });
});

// API: Admin login
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === db.adminPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false });
  }
});

// API: Lấy danh sách đơn chờ duyệt
app.get('/api/admin/orders', (req, res) => {
  const pendingNap = db.napHistory.filter(o => o.status === "pending");
  const pendingRut = db.rutHistory.filter(o => o.status === "pending");
  res.json({ nap: pendingNap, rut: pendingRut });
});

// API: Duyệt nạp thẻ
app.post('/api/admin/approve/nap', (req, res) => {
  const { id } = req.body;
  const order = db.napHistory.find(o => o.id == id);
  if (!order || order.status !== "pending") return res.json({ success: false });

  order.status = "success";
  const user = order.user;
  if (!db.users[user]) db.users[user] = { username: user, balance: 0 };
  db.users[user].balance += order.robux;

  res.json({ success: true });
});

// API: Duyệt rút Robux
app.post('/api/admin/approve/rut', (req, res) => {
  const { id } = req.body;
  const order = db.rutHistory.find(o => o.id == id);
  if (!order || order.status !== "pending") return res.json({ success: false });

  const user = db.users[order.user];
  if (user && user.balance >= order.robux) {
    user.balance -= order.robux;
    order.status = "success";
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "Không đủ số dư" });
  }
});

// API: Từ chối đơn
app.post('/api/admin/reject', (req, res) => {
  const { id, type } = req.body;
  if (type === "nap") {
    const idx = db.napHistory.findIndex(o => o.id == id);
    if (idx > -1) db.napHistory.splice(idx, 1);
  } else {
    const idx = db.rutHistory.findIndex(o => o.id == id);
    if (idx > -1) db.rutHistory.splice(idx, 1);
  }
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server chạy tại: http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html (pass: admin123)`);
});
