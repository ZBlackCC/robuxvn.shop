const express = require("express");
const fs = require("fs");
const app = express();
app.use(express.json());
app.use(express.static("."));

const DB = "db.json";
let data = {users:[], orders:[], nextId:1};
if(fs.existsSync(DB)) data = JSON.parse(fs.readFileSync(DB));

// === CẤU HÌNH MÀY SỬA Ở ĐÂY ===
const CFG = {
  admin: {username:"admin", password:"123456"}, // ← đổi pass admin
  bank: {name:"MB Bank", stk:"1903xxxxxxxxx", owner:"NGUYEN VAN A"},
  price100: 450 // 450đ = 100 Robux
};
// ==============================

app.post("/reg", (req,res)=>{
  const {u,p}=req.body;
  if(data.users.find(x=>x.username===u)) return res.json({msg:"User đã tồn tại"});
  data.users.push({username:u,password:p,balance:0});
  save(); res.json({msg:"Đăng ký OK"});
});

app.post("/login", (req,res)=>{
  const {u,p}=req.body;
  const user = data.users.find(x=>x.username===u && x.password===p);
  if(!user) return res.json({msg:"Sai user/pass"});
  res.json({ok:true,user});
});

app.post("/qr", (req,res)=>{
  const {amount,user}=req.body;
  const desc = `NAP ${user} ${Date.now()}`;
  const bank = CFG.bank.name.toLowerCase().replace(" ","-");
  const qr = `https://img.vietqr.io/image/${bank}-${CFG.bank.stk}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(desc)}`;
  res.json({qr, desc});
});

app.post("/rut", (req,res)=>{
  const {user,rbxUser,robux}=req.body;
  const cost = Math.ceil(robux/100)*CFG.price100;
  const u = data.users.find(x=>x.username===user);
  if(u.balance < cost) return res.json({msg:"Số dư không đủ"});
  data.orders.push({id:data.nextId++, user, rbxUser, robux, cost, status:"pending", time:Date.now()});
  save();
  res.json({msg:"Đã gửi yêu cầu rút! Chờ admin duyệt"});
});

app.get("/admin", (req,res)=>res.sendFile(__dirname+"/admin.html"));

function save(){fs.writeFileSync(DB,JSON.stringify(data));}
app.listen(3000,()=>{console.log("Shop chạy http://localhost:3000")});
