require("dotenv").config()
const express = require("express")
const cors = require("cors")
const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")

const app = express()
const SECRET = process.env.JWT_SECRET || "tipstormsecret"

/* ================= MIDDLEWARE ================= */

app.use(express.json())
app.use(cors({
  origin: [
    "https://tipstorm-frontend.vercel.app",
    "http://localhost:3000"
  ],
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
  credentials: true
}))

app.use((req,res,next)=>{
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*")
  res.header("Access-Control-Allow-Methods","GET,POST,PUT,DELETE,OPTIONS")
  res.header("Access-Control-Allow-Headers","Content-Type,Authorization")
  res.header("Access-Control-Allow-Credentials","true")
  if(req.method === "OPTIONS") return res.sendStatus(204)
  next()
})

/* ================= HEALTH ================= */

app.get("/", (req,res)=>{
  res.json({status:"Tipstorm API running"})
})

/* ================= DATABASE ================= */

mongoose.connect(process.env.MONGO_URI)
.then(()=>console.log("MongoDB connected"))
.catch(err=>{
  console.error("MongoDB error:",err)
})

/* ================= SCHEMAS ================= */

const userSchema = new mongoose.Schema({
  email:{type:String,required:true,unique:true},
  password:{type:String,required:true},
  role:{type:String,default:"user"},
  premium:{type:Boolean,default:false},
  plan:{type:String,default:"free"},
  expiresAt:{type:Date,default:null}
},{timestamps:true})

const gameSchema = new mongoose.Schema({
  home:String,
  away:String,
  odds:Number,
  overUnder:mongoose.Schema.Types.Mixed,
  result:{type:String,default:"pending"}
})

const slipSchema = new mongoose.Schema({
  date:String,
  access:{type:String,default:"free"},
  totalOdds:Number,
  games:[gameSchema]
},{timestamps:true})

const requestSchema = new mongoose.Schema({
  email:String,
  plan:String,
  message:String,
  status:{type:String,default:"pending"},
  createdAt:{type:Date,default:Date.now}
})

const User = mongoose.model("User",userSchema)
const Slip = mongoose.model("Slip",slipSchema)
const SubscriptionRequest = mongoose.model("SubscriptionRequest",requestSchema)

/* ================= AUTO EXPIRE PREMIUM ================= */

app.use(async(req,res,next)=>{
  try{
    const now = new Date()
    await User.updateMany(
      {premium:true,expiresAt:{$lt:now}},
      {premium:false,plan:"free",expiresAt:null}
    )
  }catch(err){
    console.log("Expire check error",err)
  }
  next()
})

/* ================= VERIFY ADMIN ================= */

function verifyAdmin(req,res,next){
  try{
    const token = req.headers.authorization?.split(" ")[1]
    if(!token){
      return res.status(403).json({success:false,message:"No token"})
    }

    const decoded = jwt.verify(token,SECRET)
    if(decoded.role !== "admin"){
      return res.status(403).json({success:false,message:"Not admin"})
    }

    req.user = decoded
    next()
  }catch(err){
    return res.status(403).json({success:false,message:"Token invalid"})
  }
}

/* ================= REGISTER ================= */

app.post("/register",async(req,res)=>{
  try{
    const {email,password} = req.body
    if(!email || !password){
      return res.status(400).json({success:false,message:"Missing fields"})
    }

    const exists = await User.findOne({email})
    if(exists){
      return res.status(400).json({success:false,message:"User exists"})
    }

    const hashed = bcrypt.hashSync(password,10)
    await User.create({email,password:hashed})

    res.json({success:true})
  }catch(err){
    console.error("Register error:",err)
    res.status(500).json({success:false})
  }
})

/* ================= LOGIN ================= */

app.post("/login",async(req,res)=>{
  try{
    const {email,password} = req.body
    const user = await User.findOne({email})

    if(!user){
      return res.status(404).json({success:false,message:"User not found"})
    }

    const match = bcrypt.compareSync(password,user.password)
    if(!match){
      return res.status(401).json({success:false,message:"Wrong password"})
    }

    const token = jwt.sign(
      {id:user._id,role:user.role},
      SECRET,
      {expiresIn:"7d"}
    )

    res.json({
      success:true,
      token,
      user:{
        email:user.email,
        role:user.role,
        plan:user.plan,
        premium:user.premium
      }
    })
  }catch(err){
    console.error("Login error:",err)
    res.status(500).json({success:false,message:"Server error"})
  }
})

/* ================= PROFILE ================= */

app.get("/profile",async(req,res)=>{
  try{
    const token = req.headers.authorization?.split(" ")[1]
    if(!token){
      return res.status(401).json({success:false})
    }

    const decoded = jwt.verify(token,SECRET)
    const user = await User.findById(decoded.id)

    if(!user){
      return res.status(404).json({success:false})
    }

    res.json({
      success:true,
      user:{
        email:user.email,
        role:user.role,
        plan:user.plan,
        premium:user.premium,
        expiresAt:user.expiresAt
      }
    })
  }catch(err){
    res.status(401).json({success:false})
  }
})

/* ================= CREATE SLIP ================= */

app.post("/slips",verifyAdmin,async(req,res)=>{
  try{
    const {date,games,access} = req.body

    if(!games || games.length === 0){
      return res.status(400).json({success:false,message:"No games"})
    }

    const totalOdds = games.reduce(
      (acc,g)=> acc * (parseFloat(g.odds) || 1),
      1
    )

    const slip = await Slip.create({
      date,
      access,
      totalOdds,
      games: games.map(g => ({
        home: g.home,
        away: g.away,
        odds: parseFloat(g.odds) || 1,
        overUnder: g.overUnder,
        result: g.result || "pending"
      }))
    })

    res.json({success:true,slip})
  }catch(err){
    console.error("Slip error:",err)
    res.status(500).json({success:false})
  }
})

/* ================= GET SLIPS (TABLE READY) ================= */

app.get("/slips",async(req,res)=>{
  try{
    const token = req.headers.authorization?.split(" ")[1]
    let user = null

    if(token){
      try{
        const decoded = jwt.verify(token,SECRET)
        user = await User.findById(decoded.id)
      }catch{}
    }

    const page = parseInt(req.query.page) || 1
    const limit = parseInt(req.query.limit) || 10
    const skip = (page-1) * limit

    const total = await Slip.countDocuments()
    const slips = await Slip.find()
      .sort({createdAt:-1})
      .skip(skip)
      .limit(limit)

    const filtered = slips.map(slip=>{
      if(slip.access === "vip" && (!user || !user.premium)){
        return {
          _id: slip._id,
          date: slip.date,
          access: slip.access,
          games: [{home:"🔒 VIP LOCKED", away:"", odds:"", overUnder:"", result:""}]
        }
      }
      return slip
    })

    res.json({
      success:true,
      slips:filtered,
      pages:Math.ceil(total/limit)
    })
  }catch(err){
    console.error("Get slips error:",err)
    res.status(500).json({success:false})
  }
})

/* ================= USERS ================= */

app.get("/all-users", verifyAdmin, async(req,res)=>{
  const users = await User.find()
  res.json({success:true, users})
})

/* ================= REQUESTS ================= */

app.get("/subscription-requests", verifyAdmin, async(req,res)=>{
  const requests = await SubscriptionRequest.find()
  res.json({success:true, requests})
})

app.post("/approve-request", verifyAdmin, async(req,res)=>{
  const { requestId } = req.body
  const reqDoc = await SubscriptionRequest.findById(requestId)

  if(!reqDoc) return res.status(404).json({success:false})

  const user = await User.findOne({ email: reqDoc.email })
  if(user){
    let duration = 30
    if(reqDoc.plan === "weekly") duration = 7
    if(reqDoc.plan === "monthly") duration = 30
    if(reqDoc.plan === "vip") duration = 30

    user.plan = reqDoc.plan
    user.premium = true
    user.expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
    await user.save()
  }

  reqDoc.status = "approved"
  await reqDoc.save()

  res.json({success:true})
})

/* ================= SERVER ================= */

const PORT = process.env.PORT || 5000
app.listen(PORT,()=>{
  console.log(`Tipstorm server running on ${PORT}`)
}) 
