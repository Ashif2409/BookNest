const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

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
  returned: {
    type: Boolean,
    default: false
  },
  verifyReturn: {
    type: Boolean,
    default: false
  },
  paymentSS: {
    type: String,
  },
  IssueDate:{
  type:Date,
  required:true
  },
  bookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Books',
    required: true
  }
});

const notificationSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true
  },
  time: {
    type: Date,
    required: true
  }
});

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },
  profile: String,
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  createdForVerification: {
    type: Date,
    default: function () {
      return this.isVerified ? null : new Date();
    },
    index: { expireAfterSeconds: 600 }, // TTL: 10 minutes
  },
  bookBorrow: [bookBorrowSchema],
  role: {
    type: String,
    enum: ['Student', 'Admin'],
    default: 'Student'
  },
  notification: {
    type: [notificationSchema],
    default: []
  },
  tokens: [{
    token: {
      type: String,
      required: true
    }
  }]
}, {
  timestamps: true,
});


// Hash password before saving
userSchema.pre('save', async function (next) {
  const user = this;

  if (user.isModified('password')) {
    const hashPass = await bcrypt.hash(user.password, 8);
    user.password = hashPass;
  }

  next();
});

// Hide sensitive info when returning user object
userSchema.methods.toJSON = function () {
  const user = this;
  const userObject = user.toObject();

  delete userObject.password;
  delete userObject.__v;
  delete userObject.updatedAt;
  delete userObject.createdAt;

  return userObject;
};

// Generate a new auth token and save
userSchema.methods.generateAuthToken = async function () {
  const user = this;

  const token = jwt.sign(
    { userId: user._id.toString(), username: user.username },
    process.env.JWT_SECRET || 'LibManSys'
  );

  user.tokens.push({ token });
  await user.save();

  return token;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
