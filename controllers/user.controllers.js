const User = require("../db/models/user.model")
const bcrypt = require("bcryptjs")
const OTPModel = require("../db/models/OTP.model")
const generateOTP = require("../utils/generateOTP")
const UploadAndReturnUrl = require("../Service/Cloudinary")
const fs = require("fs")
const { client } = require("../Service/redis")
const { get } = require("http")
const mongoose = require("mongoose")
// Add this helper function at the top of the file, after the imports
const safeRedisGet = async (key) => {
  try {
    return await client.get(key)
  } catch (redisError) {
    console.error(`Redis GET error for key ${key}:`, redisError)
    return null
  }
}

const safeRedisSet = async (key, value, options = {}) => {
  try {
    return await client.set(key, value, options)
  } catch (redisError) {
    console.error(`Redis SET error for key ${key}:`, redisError)
    return false
  }
}

const safeRedisDel = async (key) => {
  try {
    return await client.del(key)
  } catch (redisError) {
    console.error(`Redis DEL error for key ${key}:`, redisError)
    return false
  }
}

const loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." });
  }

  try {
    let user;
    const cachedUser = await safeRedisGet(`user:${username}`);

    if (cachedUser) {
      const userData = JSON.parse(cachedUser);
      user = User.hydrate(userData);
    } else {
      user = await User.findOne({ username }).select("+password");
      if (user) {
        await safeRedisSet(`user:${username}`, JSON.stringify(user.toObject()), {
          EX: 3600,
        });
      }
    }

    if (!user) {
      await safeRedisDel(`user:${username}`);
      return res.status(401).json({ message: "Invalid username or password" });
    }

    if (!user.isVerified) {
      await safeRedisDel(`user:${username}`);
      return res.status(403).json({ message: "Please verify your email before logging in." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await safeRedisDel(`user:${username}`);
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const token = await user.generateAuthToken();

    // Update book borrow fines
    user.bookBorrow?.forEach((borrow) => {
      if (borrow?.Due_Date) {
        const dueDate = new Date(borrow.Due_Date);
        const today = new Date();
        const differenceInDays = Math.ceil((today - dueDate) / (1000 * 3600 * 24));

        borrow.fine = differenceInDays > 1 ? (differenceInDays - 1) * 5 : 0;
      }
    });

    await user.save();

    return res.status(200).json({ user, token });
  } catch (error) {
    console.error("Error during login:", error);
    await safeRedisDel(`user:${username}`);
    return res.status(500).json({ message: "Internal server error" });
  }
};


const safeUnlink = (path) => {
  fs.unlink(path, (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.warn(`File not found during deletion: ${path}`);
      } else {
        console.error(`Error deleting file: ${path}`, err);
      }
    }
  });
};

// Signup Controller
const signupUser = async (req, res) => {
  const { username, password, role, name, email } = req.body;

  try {
    // Check in Redis cache first
    const cachedUser = await safeRedisGet(`user:${username}`);
    if (cachedUser) {
      if (req.file) safeUnlink(req.file.path);

      return res.status(401).json({
        message: "User with this username already exists",
      });
    }

    // Check email in database
    const existingUserEmail = await User.findOne({ email });
    if (existingUserEmail) {
      if (req.file) safeUnlink(req.file.path);

      return res.status(409).json({
        message: "User with this email already exists",
      });
    }

    // Check username in database
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      await safeRedisSet(`user:${username}`, JSON.stringify(existingUser), { EX: 3600 });
      if (req.file) safeUnlink(req.file.path);

      return res.status(401).json({
        message: "User with this username already exists",
      });
    }

    // Handle file upload if exists
    let imagePath = null;
    let profileUrl = null;

    if (req.file) {
      imagePath = req.file.path;
      try {
        profileUrl = await UploadAndReturnUrl(imagePath, "User");
      } catch (uploadError) {
        console.error("Error uploading image:", uploadError);
        safeUnlink(imagePath);

        return res.status(500).json({
          message: "Failed to upload profile image",
        });
      }
    }

    // Generate OTP and save
    const otp = generateOTP();
    const sendOTP = new OTPModel({ email, otp });
    await sendOTP.save();

    // Create new user
    const newUser = new User({
      username,
      password,
      profile: profileUrl || "",
      name,
      email,
      role,
      bookBorrow: [],
    });

    await newUser.save();

    // Update Redis cache
    await safeRedisDel('all_users');
    await safeRedisSet(`user:${username}`, JSON.stringify(newUser), { EX: 3600 });

    // Delete the local file after upload
    if (imagePath) safeUnlink(imagePath);

    // Generate JWT token
    const token = await newUser.generateAuthToken();

    res.status(201).json({
      message: "OTP has been sent to the registered email",
      user: newUser,
      token,
    });
  } catch (error) {
    console.error("Error during signup:", error);

    if (req.file) safeUnlink(req.file.path);

    res.status(500).json({
      message: "Internal server error",
    });
  }
};

const verifyOTP = async (req, res) => {
  const user = req.user
  const { otp } = req.body
  try {
    const OTP = await OTPModel.findOne({ email: user.email })
    if (!OTP || otp !== OTP.otp) {
      user.tokens = []
      await User.findByIdAndDelete(user._id)
      return res.status(400).json({ message: "Invalid OTP or OTP not found." })
    }
    await safeRedisDel(`user:${user.username}`)
    user.isVerified = true
    user.createdForVerification = null
    await user.save()
    await OTPModel.deleteOne({ email: user.email })
    const newToken = await user.generateAuthToken()

    return res.status(200).json({
      message: "OTP verified successfully",
      user,
      token: newToken,
    })
  } catch (error) {
    console.error("OTP Verification Error:", err)
    return res.status(500).json({ message: "Internal server error" })
  }
}

const logoutUser = async (req, res) => {
  try {
    const token = req.token
    const tokens = req.user.tokens.filter((tkn) => tkn.token !== token)
    req.user.tokens = tokens
    await req.user.save()
    await safeRedisDel(`user:${req.user.username}`)
    res.status(200).send({ message: "Logout Succesfully ", user: req.user })
  } catch (error) {
    res.status(500).send("Internal Server Error")
  }
}

const logoutAllUser = async (req, res) => {
  try {
    const user = req.user
    user.tokens = []
    await user.save()
    await safeRedisDel(`user:${user.username}`)
    res.send("Successfully logout")
  } catch (error) {
    res.status(500).send("Internal Server Error")
  }
}

const checkDueDate = async (req, res) => {
  const user = req.user
  try {
    const borrowBooks = user.bookBorrow
    const todayDate = new Date()
    const booksDetail = []
    const oneDay = 24 * 60 * 60 * 1000
    booksDetail.push(
      borrowBooks.map((book) => {
        if (book.Due_Date - todayDate <= oneDay && book.Due_Date >= 0) {
          return {
            bookname,
            Due_Date,
          }
        }
      }),
    )
    booksDetail.forEach((detail) => {
      user.notification.push({
        text: `Due date for book: ${booksDetail.bookname} is ${detail.Due_Date}`,
      })
    })
    await user.save()
  } catch (error) {
    throw error("Error calculating error")
  }
}

const getAllNotification = async (req, res) => {
  try {
    const { _id } = req.user;

    if (!_id) {
      return res.status(401).json({ message: "Unauthorized: No user ID in request" });
    }

    const user = await User.findById(_id).select('notification');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user.notification || []);
  } catch (error) {
    console.error("Error in getAllNotification:", error);
    res.status(500).send("Internal Server Error");
  }
};

const deleteNotification = async (req, res) => {
  const user = req.user;
  const id = req.params.id;

  // Validate the provided notification id
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid notification ID format' });
  }

  try {
    // Filter notifications
    const filteredNotifications = user.notification.filter((notif) => notif._id.toString() !== id);

    // If no matching notification is found
    if (filteredNotifications.length === user.notification.length) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Update user notifications
    user.notification = filteredNotifications;

    // Save the updated user
    await user.save();

    // Optional: Clear cache in Redis if needed
    await safeRedisDel(`user:${user.username}`);

    res.status(200).json(filteredNotifications);
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).send("Internal Server Error");
  }
};


const forgetPassword = async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username });

    if (user) {
      const email = user.email;
      const otp = generateOTP();
      const SendOTP = new OTPModel({ email, otp });

      await SendOTP.save();

      const token = await user.generateAuthToken(); // ✅ Generate token
      await safeRedisDel(`user:${user.username}`);  // Optional: Invalidate previous cache

      return res.status(200).json({
        message: "OTP has been sent to the registered email address",
        token, // ✅ Send token back to frontend
      });
    } else {
      return res.status(404).json({ message: "Username not found" });
    }

  } catch (error) {
    console.error("Error during password reset:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};



const verifyOTPPassword = async (req, res) => {
  const { otp } = req.body;
  const user = req.user;

  try {
    const OTP = await OTPModel.findOne({ email: user.email });

    if (!OTP || OTP.otp !== otp) {
      // Invalidate all existing tokens if OTP is incorrect
      user.tokens = [];
      await user.save();
      return res.status(400).json({ message: "Invalid OTP or OTP not found." });
    }

    // ✅ Invalidate old tokens
    user.tokens = [];
    await user.save();

    // ✅ Generate a new token after successful OTP verification
    const newToken = await user.generateAuthToken();

    return res.status(200).json({
      message: "Enter new Password",
      token: newToken, // Send this to frontend for next step (reset password)
    });
  } catch (error) {
    res.status(500).json({ message: "Error verifying the OTP" });
  }
};


const resetPassword = async (req, res) => {
  const { password } = req.body;
  const user = req.user;

  try {
    user.password = password;
    await user.save();
    await safeRedisDel(`user:${user.username}`);
    return res.send("Password Reset successfully");
  } catch (error) {
    res.status(500).json({ message: "Error resetting the password" });
  }
};


const editProfile = async (req, res) => {
  const { username, name } = req.body
  const user = req.user
  try {
    if (username) {
      let user
      const cachedUser = await safeRedisGet(`user:${username}`)

      if (cachedUser) {
        const userData = JSON.parse(cachedUser)
        user = new User(userData)
        user._id = userData._id
      } else {
        user = await User.findOne({
          username,
        })
        if (user) {
          await safeRedisSet(`user:${username}`, JSON.stringify(user), {
            EX: 3600,
          })
          return res.status(400).json({
            message: "User with this username already exist",
          })
        }
      }
      user.username = username
      await safeRedisDel(`user:${user.username}`)
      await safeRedisSet(`user:${username}`, JSON.stringify(user), {
        EX: 3600,
      })
    }
    if (name) {
      user.name = name
    }
    await user.save()
    await safeRedisDel(`user:${user.username}`)
    res.status(200).send(user)
  } catch (error) {
    console.error("Error updating profile:", error)
    res.status(500).json({
      message: "Error updating Profile",
    })
  }
}

const editPassword = async (req, res) => {
  const { oldPassword, newPassword } = req.body
  const user = req.user

  try {
    const isMatch = await bcrypt.compare(oldPassword, user.password)
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is wrong" })
    }

    user.password = newPassword
    await user.save()

    // Invalidate cache after password update
    await safeRedisDel(`user:${user.username}`)

    return res.status(200).json({ message: "Password updated Successfully" })
  } catch (error) {
    console.log(error)
    return res.status(500).json({ message: "Can't change the password" })
  }
}

const editProfilePic = async (req, res) => {
  const user = req.user
  const ImgPath = req.file.path
  try {
    if (!ImgPath) {
      return res.status(404).json({ message: "Please add profile picture" })
    }
    const imgUrl = await UploadAndReturnUrl(ImgPath, "User")
    user.profile = imgUrl
    await user.save()
    fs.unlinkSync(ImgPath)
    res.send("Successfull profile is updated")
  } catch (error) {
    res.status(500).send("Error updating profile")
  }
}

const finePayment = async (req, res) => {
  const user = req.user
  const { bookId } = req.body

  try {
    const borrowBook = user.bookBorrow.find(
      (borrowBook) => borrowBook._id.toString() === bookId.toString() && borrowBook.fine > 0,
    )

    if (!borrowBook) {
      return res.status(404).json({ message: "No dues available for this book" })
    }

    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: "Payment screenshot is required" })
    }

    const imagePath = req.file.path
    const imageUrl = await UploadAndReturnUrl(imagePath, "Payment-screenshot")

    borrowBook.paymentSS = imageUrl
    borrowBook.fine = 0
    borrowBook.returned = true
    await user.save()
    fs.unlinkSync(imagePath)
    res.status(200).json({ message: "Payment recorded successfully", user })
  } catch (error) {
    console.error("Error processing fine payment:", error)
    res.status(500).json({ message: "Error processing fine payment" })
  }
}

const getUserProfile = async (req, res) => {
  const user = req.user
  try {
    const { _doc, ...otherField } = user
    const { tokens, __v, createdAt, updatedAt, password, ...sharingFields } = _doc

    return res.send(sharingFields)
  } catch (error) {
    console.error("Error getting user profile:", error)
    return res.status(500).json({ message: "Error getting user profile" })
  }
}

const getUserProfileById = async (req, res) => {
  const { id: userId } = req.params;

  // Validate if the userId is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: 'Invalid userId format' });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { _doc, ...otherFields } = user;
    const { tokens, __v, createdAt, updatedAt, password, ...sharingFields } = _doc;

    return res.json(sharingFields); // Send back the filtered user data
  } catch (error) {
    console.error("Error getting user profile:", error);
    return res.status(500).json({ message: "Error getting user profile" });
  }
};



const getAllUsers = async (req, res) => {
  try {
    // 1) Try Redis cache
    const cacheKey = 'all_users';
    let users = null;

    try {
      const cached = await client.get(cacheKey);
      if (cached) {
        users = JSON.parse(cached);
      }
    } catch (redisErr) {
      console.error('Redis GET error in getAllUsers:', redisErr);
    }

    // 2) Cache miss → load from MongoDB
    if (!users) {
      users = await User.find().lean();
      try {
        await client.set(cacheKey, JSON.stringify(users), { EX: 3600 });
      } catch (redisErr) {
        console.error('Redis SET error in getAllUsers:', redisErr);
      }
    }

    // 3) Sanitize
    const sanitized = users.map(({ password, tokens, __v, createdAt, updatedAt, ...rest }) => rest);

    // 4) Return
    return res.status(200).json({ users: sanitized });
  } catch (err) {
    console.error('Error in getAllUsers:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  loginUser,
  signupUser,
  verifyOTP,
  logoutUser,
  logoutAllUser,
  checkDueDate,
  deleteNotification,
  getAllNotification,
  forgetPassword,
  verifyOTPPassword,
  resetPassword,
  editProfile,
  editPassword,
  editProfilePic,
  finePayment,
  getUserProfile,
  getAllUsers,
  getUserProfileById,
}
