import express from "express";
import mongoose from "mongoose"; // Cần npm install mongoose
import cors from "cors";
import path from "path";

const app = express();
app.use(express.json());
app.use(cors());

// Phục vụ file tĩnh
app.use(express.static("."));

// Route gốc: index.html
app.get("/", (req, res) => {
  const filePath = path.join(process.cwd(), "index.html");
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Lỗi gửi index.html:", err);
      res.status(404).send("Không tìm thấy index.html");
    }
  });
});

// Route admin.html
app.get("/admin.html", (req, res) => {
  const filePath = path.join(process.cwd(), "admin.html");
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error("Lỗi gửi admin.html:", err);
      res.status(404).send("Không tìm thấy admin.html");
    }
  });
});

// Kết nối MongoDB (lấy URI từ environment variables trên Railway)
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("Thiếu MONGO_URI trong environment variables!");
  process.exit(1);
}

mongoose.connect(uri)
  .then(() => console.log("MongoDB connected! Data lưu vĩnh viễn."))
  .catch(err => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Định nghĩa Models cho MongoDB
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: String,
  balance: { type: Number, default: 0 },
  referredBy: String,
  refCode: String
});

const DepositSchema = new mongoose.Schema({
  id: Number,
  user: String,
  amount: Number,
  robux: Number,
  type: String,
  seri: String,
  code: String,
  cardType: String,
  status: { type: String, default: "pending" },
  time: Number
});

const WithdrawSchema = new mongoose.Schema({
  id: Number,
  user: String,
  robux: Number,
  to: String,
  status: { type: String, default: "pending" },
  time: Number
});

const RateSchema = new mongoose.Schema({
  rate: { type: Number, default: 65 }
});

const User = mongoose.model("User", UserSchema);
const Deposit = mongoose.model("Deposit", DepositSchema);
const Withdraw = mongoose.model("Withdraw", WithdrawSchema);
const Rate = mongoose.model("Rate", RateSchema);

// Hàm lấy data (tương đương db() cũ)
async function getData() {
  const users = await User.find({});
  const deposits = await Deposit.find({});
  const withdraws = await Withdraw.find({});
  const rateDoc = await Rate.findOne({});

  const usersObj = users.reduce((acc, u) => {
    acc[u.username] = u.toObject();
    return acc;
  }, {});

  return {
    users: usersObj,
    deposits,
    withdraws,
    rate: rateDoc ? rateDoc.rate : 65
  };
}

// Hàm lưu data (tương đương save(data) cũ)
async function saveData(data) {
  try {
    // Lưu users
    for (const [username, userData] of Object.entries(data.users)) {
      await User.findOneAndUpdate({ username }, userData, { upsert: true });
    }
    // Lưu deposits
    await Deposit.deleteMany({});
    if (data.deposits.length > 0) await Deposit.insertMany(data.deposits);
    // Lưu withdraws
    await Withdraw.deleteMany({});
    if (data.withdraws.length > 0) await Withdraw.insertMany(data.withdraws);
    // Lưu rate
    await Rate.findOneAndUpdate({}, { rate: data.rate }, { upsert: true });
  } catch (err) {
    console.error("Lỗi save MongoDB:", err);
  }
}

// Cập nhật expired pending → failed (dùng MongoDB)
async function updateExpired(type) {
  const data = await getData();
  const now = Date.now();
  const array = type === 'deposits' ? data.deposits : data.withdraws;

  array.forEach(item => {
    if (item.status === "pending" && (now - item.time) > 43200000) {
      item.status = "failed";
    }
  });

  await saveData(data);
}

// Các route (chuyển sang async/await)
app.post("/api/register", async (req, res) => {
  const { username, password, refCode } = req.body;
  const data = await getData();

  if (data.users[username]) return res.json({ error: "Username đã tồn tại!" });

  data.users[username] = {
    username,
    password,
    balance: 0,
    referredBy: refCode || null,
    refCode: username
  };

  await saveData(data);
  res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const data = await getData();
  const u = data.users[username];

  if (!u) return res.json({ error: "Sai username!" });
  if (password !== u.password) return res.json({ error: "Sai mật khẩu!" });

  res.json({
    username: u.username,
    balance: u.balance
  });
});

app.post("/api/deposit", async (req, res) => {
  const { user, amount, robux, type, seri, code, cardType } = req.body;
  const data = await getData();

  const newDep = {
    id: Date.now(),
    user,
    amount,
    robux,
    type,
    seri: seri || null,
    code: code || null,
    cardType: cardType || null,
    status: "pending",
    time: Date.now()
  };

  data.deposits.push(newDep);
  await saveData(data);

  res.json({ success: true, deposit: newDep });
});

app.post("/api/withdraw", async (req, res) => {
  const { user, robux, to } = req.body;
  const data = await getData();

  const current = data.users[user];
  if (!current) return res.json({ error: "Không tìm thấy user!" });
  if (current.balance < robux) return res.json({ error: "Không đủ số dư!" });

  const w = {
    id: Date.now(),
    user,
    robux,
    to,
    status: "pending",
    time: Date.now()
  };

  data.withdraws.push(w);
  await saveData(data);

  res.json({ success: true, withdraw: w });
});

app.get("/api/history/:username", async (req, res) => {
  const name = req.params.username;
  const data = await getData();
  await updateExpired('deposits');
  await updateExpired('withdraws');
  res.json({
    deposits: data.deposits.filter(x => x.user === name),
    withdraws: data.withdraws.filter(x => x.user === name)
  });
});

app.get("/api/admin/orders", async (req, res) => {
  if (req.headers.authorization !== "admin_token") {
    return res.json({ error: "Unauthorized" });
  }
  const data = await getData();
  await updateExpired('deposits');
  await updateExpired('withdraws');
  res.json({
    deposits: data.deposits.filter(x => x.status === "pending"),
    withdraws: data.withdraws.filter(x => x.status === "pending")
  });
});

app.post("/api/admin/approve/deposit", async (req, res) => {
  if (req.headers.authorization !== "admin_token") {
    return res.json({ error: "Unauthorized" });
  }
  const { id } = req.body;
  const data = await getData();

  const d = data.deposits.find(x => x.id === id);
  if (!d) return res.json({ error: "Không tìm thấy đơn!" });

  let finalRobux = d.robux;
  if (d.type === "card" && d.cardType) {
    const cardTypeUpper = d.cardType.toUpperCase();
    let discountPercent = 0;
    if (cardTypeUpper === "VIETTEL" || cardTypeUpper === "MOBIFONE") discountPercent = 20;
    else if (cardTypeUpper === "VINAPHONE" || cardTypeUpper === "ZING" || cardTypeUpper === "GATE") discountPercent = 15;
    const realValue = Math.floor(d.amount * (100 - discountPercent) / 100);
    finalRobux = Math.floor(realValue / 10000 * (data.rate || 65));
  }

  d.status = "success";
  d.robux = finalRobux;
  data.users[d.user].balance += finalRobux;

  const user = data.users[d.user];
  if (user.referredBy) {
    const hasDepositBefore = data.deposits.some(dep => 
      dep.user === d.user && dep.status === "success" && dep.id !== id
    );
    if (!hasDepositBefore) {
      const referrer = data.users[user.referredBy];
      if (referrer) {
        referrer.balance += 50;
        console.log(`Bonus 50 Robux cho ${user.referredBy} từ user ${d.user}`);
      }
    }
  }

  await saveData(data);
  res.json({ success: true });
});

app.post("/api/admin/approve/withdraw", async (req, res) => {
  if (req.headers.authorization !== "admin_token") {
    return res.json({ error: "Unauthorized" });
  }
  const { id } = req.body;
  const data = await getData();

  const w = data.withdraws.find(x => x.id === id);
  if (!w) return res.json({ error: "Không tìm thấy đơn!" });

  w.status = "success";
  data.users[w.user].balance -= w.robux;

  await saveData(data);
  res.json({ success: true });
});

app.post("/api/admin/reject", async (req, res) => {
  if (req.headers.authorization !== "admin_token") {
    return res.json({ error: "Unauthorized" });
  }
  const { id, type } = req.body;
  const data = await getData();

  if (type === "deposit")
    data.deposits = data.deposits.filter(x => x.id !== id);

  if (type === "withdraw")
    data.withdraws = data.withdraws.filter(x => x.id !== id);

  await saveData(data);
  res.json({ success: true });
});

app.get("/api/rate", async (req, res) => {
  const data = await getData();
  res.json({ rate: data.rate });
});

app.post("/api/admin/set_rate", async (req, res) => {
  if (req.headers.authorization !== "admin_token") {
    return res.json({ error: "Unauthorized" });
  }
  const { rate } = req.body;
  const data = await getData();
  data.rate = parseInt(rate);
  await saveData(data);
  res.json({ success: true });
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "meohia" && password === "071103") {
    res.json({ token: "admin_token" });
  } else {
    res.json({ error: "Sai tài khoản hoặc mật khẩu!" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SERVER RUNNING ON PORT ${port}`));
