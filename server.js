import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static("public")); // phục vụ index.html, admin.html từ thư mục public

// Route gốc: trả về index.html khi truy cập domain chính (fix lỗi Cannot GET /)
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "./public" });
});

// =============================================
// 📌 HÀM ĐỌC / GHI DATABASE
// =============================================
function db() {
    return JSON.parse(fs.readFileSync("database.json", "utf8"));
}
function save(data) {
    fs.writeFileSync("database.json", JSON.stringify(data, null, 2));
}

// Function to check and update expired pending to failed (12 hours = 43200000 ms)
function updateExpired(data, type) {
  const now = Date.now();
  const array = type === 'deposits' ? data.deposits : data.withdraws;
  array.forEach(item => {
    if (item.status === "pending" && (now - item.time) > 43200000) {
      item.status = "failed";
    }
  });
  save(data);
}

// =============================================
// 📌 ĐĂNG KÝ – ĐĂNG NHẬP (THÊM REF)
// =============================================
app.post("/api/register", (req, res) => {
    const { username, password, refCode } = req.body;
    const data = db();

    if (data.users[username])
        return res.json({ error: "Username đã tồn tại!" });

    data.users[username] = {
        password,
        balance: 0,
        referredBy: refCode || null, // Lưu người giới thiệu (username của người mời)
        refCode: username // Mã ref của chính mình là username
    };

    save(data);
    res.json({ success: true });
});

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    const data = db();
    const u = data.users[username];

    if (!u) return res.json({ error: "Sai username!" });
    if (password !== u.password) return res.json({ error: "Sai mật khẩu!" });

    res.json({
        username,
        balance: u.balance
    });
});

// =============================================
// 📌 NẠP TIỀN
// =============================================
app.post("/api/deposit", (req, res) => {
    const { user, amount, robux, type } = req.body;

    const data = db();

    const newDep = {
        id: Date.now(),
        user,
        amount,
        robux,
        type,
        status: "pending",
        time: Date.now()
    };

    data.deposits.push(newDep);
    save(data);

    res.json({ success: true, deposit: newDep });
});

// =============================================
// 📌 RÚT ROBUX
// =============================================
app.post("/api/withdraw", (req, res) => {
    const { user, robux, to } = req.body;

    const data = db();

    const current = data.users[user];

    if (!current)
        return res.json({ error: "Không tìm thấy user!" });

    if (current.balance < robux)
        return res.json({ error: "Không đủ số dư!" });

    const w = {
        id: Date.now(),
        user,
        robux,
        to,
        status: "pending",
        time: Date.now()
    };

    data.withdraws.push(w);
    save(data);

    res.json({ success: true, withdraw: w });
});

// =============================================
// 📌 LỊCH SỬ NẠP / RÚT
// =============================================
app.get("/api/history/:username", (req, res) => {
    const name = req.params.username;
    const data = db();
    updateExpired(data, 'deposits');
    updateExpired(data, 'withdraws');
    res.json({
        deposits: data.deposits.filter(x => x.user === name),
        withdraws: data.withdraws.filter(x => x.user === name)
    });
});

// =============================================
// 📌 ADMIN GET LIST (đơn chờ duyệt)
// =============================================
app.get("/api/admin/orders", (req, res) => {
    if (req.headers.authorization !== "admin_token") {
        return res.json({ error: "Unauthorized" });
    }
    const data = db();
    updateExpired(data, 'deposits');
    updateExpired(data, 'withdraws');
    res.json({
        deposits: data.deposits.filter(x => x.status === "pending"),
        withdraws: data.withdraws.filter(x => x.status === "pending")
    });
});

// =============================================
// 📌 ADMIN DUYỆT NẠP (THÊM BONUS REF)
// =============================================
app.post("/api/admin/approve/deposit", (req, res) => {
    if (req.headers.authorization !== "admin_token") {
        return res.json({ error: "Unauthorized" });
    }
    const { id } = req.body;
    const data = db();

    const d = data.deposits.find(x => x.id === id);
    if (!d) return res.json({ error: "Không tìm thấy đơn!" });

    d.status = "success";
    data.users[d.user].balance += d.robux;

    // Bonus ref: Nếu user được ref và đây là đơn nạp ĐẦU TIÊN
    const user = data.users[d.user];
    if (user.referredBy) {
        const hasDepositBefore = data.deposits.some(dep => 
            dep.user === d.user && 
            dep.status === "success" && 
            dep.id !== id
        );
        if (!hasDepositBefore) { // Đơn đầu tiên
            const referrer = data.users[user.referredBy];
            if (referrer) {
                referrer.balance += 50;
                console.log(`Bonus 50 Robux cho ${user.referredBy} từ user ${d.user}`);
            }
        }
    }

    save(data);
    res.json({ success: true });
});

// =============================================
// 📌 ADMIN DUYỆT RÚT
// =============================================
app.post("/api/admin/approve/withdraw", (req, res) => {
    if (req.headers.authorization !== "admin_token") {
        return res.json({ error: "Unauthorized" });
    }
    const { id } = req.body;
    const data = db();

    const w = data.withdraws.find(x => x.id === id);
    if (!w) return res.json({ error: "Không tìm thấy đơn!" });

    w.status = "success";
    data.users[w.user].balance -= w.robux;

    save(data);
    res.json({ success: true });
});

// =============================================
// 📌 ADMIN XOÁ ĐƠN
// =============================================
app.post("/api/admin/reject", (req, res) => {
    if (req.headers.authorization !== "admin_token") {
        return res.json({ error: "Unauthorized" });
    }
    const { id, type } = req.body;
    const data = db();

    if (type === "deposit")
        data.deposits = data.deposits.filter(x => x.id !== id);

    if (type === "withdraw")
        data.withdraws = data.withdraws.filter(x => x.id !== id);

    save(data);
    res.json({ success: true });
});

// =============================================
// 📌 GET/SET TỶ GIÁ ROBUX
// =============================================
app.get("/api/rate", (req, res) => {
    const data = db();
    res.json({ rate: data.rate || 65 });
});

app.post("/api/admin/set_rate", (req, res) => {
    if (req.headers.authorization !== "admin_token") {
        return res.json({ error: "Unauthorized" });
    }
    const { rate } = req.body;
    const data = db();
    data.rate = parseInt(rate);
    save(data);
    res.json({ success: true });
});

// =============================================
// 📌 ADMIN LOGIN (dùng meohia / 071103)
// =============================================
app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    const data = db();
    if (username === "meohia" && password === "071103") {
        res.json({ token: "admin_token" });
    } else {
        res.json({ error: "Sai tài khoản hoặc mật khẩu!" });
    }
});

// =============================================
// 📌 RUN SERVER (fix port cho Railway)
// =============================================
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`SERVER RUNNING ON PORT ${port}`));
