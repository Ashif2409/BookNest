const mongoose = require('mongoose');
const jwt=require('jsonwebtoken')
const bcrypt=require('bcryptjs');
const { type } = require('express/lib/response');

const bookBorrowSchema = new mongoose.Schema({
  bookname: {
    type: String,
    required: true
  },
  Due_Date: {
    type: Date,
    required: true,
  },
  fine: {
    type: Number,
    default: 0
  },
  returned:{
    type: Boolean,
    default: false
  },
  verifyReturn:{
    type:Boolean,
    default:false
  },
  paymentSS:{
    type: String,
  }
})

const notificationSchema = new mongoose.Schema({
  text:{
    type: String,
    required: true
  },
  time:{
    type: Date,
    required: true
  }
})

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  profile:{
    type: String
  },
  name:{
    type: String,
    required: true,
  },
  email:{
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
  },
  bookBorrow: {
    type:[bookBorrowSchema],
  },
  role:{
    type:String,
    enum:['Student','Admin'],
    default:'Student'
  },
  notification:{
    type:[notificationSchema],
    default:[]
  },
  tokens: [{
    token: {
      type: String,
      required: true
    }
  }]
}, {
  timestamps: true, 
})

userSchema.pre('save',async function(next){
  const user=this;
  if(user.isModified('password')){
    const hashPass=await bcrypt.hash(user.password, 8);
    user.password=hashPass;
  }
  if (user.isNew) {
    const token = jwt.sign({ userId: user._id.toString(), username: user.username }, 'LibManSys');
    user.tokens.push({ token }); 
  }
   next();
})

userSchema.methods.toJSON = function () {
  const user = this;
  const userObject = user.toObject();
  delete userObject.password;
  delete userObject.__v;
  delete userObject.updatedAt;
  delete userObject.createdAt;
  return userObject;
};

userSchema.methods.generateAuthToken = async function () {
  const user = this;

    const token= jwt.sign({ userId: user._id.toString(), username: user.username }, 'LibManSys');
    user.tokens=[...user.tokens,{token}]
    user.token=token
    await user.save()
    return token; 
}

const User = mongoose.model('User', userSchema);
module.exports = User

