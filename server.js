const express = require("express");
const fs = require("fs");
const app = express();
app.use(express.json());
app.use(express.static("."));

let db = {users:[{username:"admin",password:"123456",balance:999999,isAdmin:true}], orders:[], nextId:1};
if(fs.existsSync("db.json")) db = JSON.parse(fs.readFileSync("db.json"));

app.post("/register", (req,res)=>{
  const {username,password} = req.body;
  if(db.users.find(u=>u.username===username)) return res.json({msg:"User đã tồn tại"});
  db.users.push({username,password,balance:0,isAdmin:false});
  save(); res.json({msg:"Đăng ký thành công!"});
});

app.post("/login", (req,res)=>{
  const {username,password} = req.body;
  const user = db.users.find(u=>u.username===username && u.password===password);
  if(!user) return res.json({success:false,msg:"Sai tài khoản hoặc mật khẩu"});
  res.json({success:true,user:{username:user.username,balance:user.balance}});
});

app.post("/qr", (req,res)=>{
  const {amount,user} = req.body;
  const desc = `NAP ${user} ${Date.now()}`;
  const qr = `https://img.vietqr.io/image/mb-1903xxxxxxx-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(desc)}`;
  res.json({qr,desc});
});

// Admin panel
app.get("/admin", (req,res)=>{
  res.send(`<h1>ADMIN PANEL</h1><p>User: admin | Pass: 123456</p><pre>${JSON.stringify(db, null, 2)}</pre>`);
});

function save(){fs.writeFileSync("db.json",JSON.stringify(db));}
app.listen(3000,()=>{console.log("Shop chạy http://localhost:3000")});
