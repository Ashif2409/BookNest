const User = require('../db/models/user.model')
const bcrypt=require('bcryptjs');
const OTPModel = require('../db/models/OTP.model');
const generateOTP=require('../utils/generateOTP');
const UploadAndReturnUrl = require('../Service/Cloudinary');
const fs = require('fs');
const { client } = require('../Service/redis');

const loginUser = async (req, res) => {
  const {
      username,
      password
  } = req.body;

  try {
      let user;
      const cachedUser = await client.get(`user:${username}`);

      if (cachedUser) {
          const userData = JSON.parse(cachedUser);
          user = new User(userData);
          user._id = userData._id; 
      } else {
          user = await User.findOne({
              username
          });
          if (user) {
              await client.set(`user:${username}`, JSON.stringify(user), {
                  EX: 3600
              });
          }
      }

      if (!user) {
          return res.status(401).json({
              message: 'Invalid username or password'
          });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
          return res.status(401).json({
              message: 'Invalid username or password'
          });
      }

      const token = await user.generateAuthToken();

      // Update book borrow fines
      user.bookBorrow.forEach(borrow => {
          if (borrow && borrow.Due_Date) {
              const dueDate = new Date(borrow.Due_Date);
              const today = new Date();
              const differenceInDays = Math.ceil((today - dueDate) / (1000 * 3600 * 24));

              if (differenceInDays > 1) {
                  borrow.fine = (differenceInDays - 1) * 5;
              } else {
                  borrow.fine = 0;
              }
          }
      });

      await user.save(); 

      res.status(200).json({
          user,
          token
      });

  } catch (error) {
      console.error('Error during login:', error);
      res.status(500).json({
          message: 'Internal server error'
      });
  }
};


const signupUser = async (req, res) => {
  const {
      username,
      password,
      role,
      name,
      email
  } = req.body;

  try {
      const cachedUser = await client.get(`user:${username}`);
      if (cachedUser) {
          if (req.file) {
              fs.unlink(req.file.path, (err) => {
                  if (err) console.error('Error deleting file:', err);
              });
          }
          return res.status(401).json({
              message: "User with this username already exists"
          });
      }
   
    //if user with email already exist
      const existingUserEmail = await User.findOne({ email });
        if (existingUserEmail) {
            console.log(`User with email ${email} already exists.`);
            return res.status(409).json({ message: 'User with this email already exists' });
        }
    
      const existingUser = await User.findOne({ username });
      if (existingUser) {
          await client.set(`user:${username}`, JSON.stringify(existingUser), { EX: 3600 });
          if (req.file) {
              fs.unlink(req.file.path, (err) => {
                  if (err) console.error('Error deleting file:', err);
              });
          }
          return res.status(401).json({
              message: "User with this username already exists"
          });
      }

      let imagePath = null;
      let profileUrl = null;
      if (req.file) {
          imagePath = req.file.path;
          console.log(imagePath);
          profileUrl = await UploadAndReturnUrl(imagePath, 'User');
      }

      const otp = generateOTP();
      const sendOTP = new OTPModel({
          email,
          otp,
      });
      await sendOTP.save();

      const newUser = new User({
          username,
          password,
          profile: profileUrl || '',
          name,
          email,
          role,
          bookBorrow: [],
      });

      await newUser.save();
      await client.set(`user:${username}`, JSON.stringify(newUser), { EX: 3600 });

      if (imagePath) {
          fs.unlink(imagePath, (err) => {
              if (err) console.error('Error deleting file:', err);
          });
      }

      res.status(201).json({
          message: "OTP has been sent to the registered email",
          user: newUser
      });
  } catch (error) {
      console.error('Error during signup:', error);

      if (req.file) {
          fs.unlink(req.file.path, (err) => {
              if (err) console.error('Error deleting file:', err);
          });
      }

      res.status(500).json({
          message: 'Internal server error'
      });
  }
};



const verifyOTP = async(req,res)=>{
    const user=req.user;
    const {otp}=req.body;
    try {
      const OTP=await OTPModel.findOne({email:user.email});
      if (!OTP || otp!==OTP.otp) {
        user.tokens=[];
        await User.findByIdAndDelete(user._id);
        return res.status(400).json({ message: "Invalid OTP or OTP not found." });
      }
     await user.save();
      res.status(200).send(user);
    } catch (error) {
      res.status(500).json({message:"Error during validating error"});
    }
}

const logoutUser= async (req,res)=>{
  try {
    const token=req.token
    const tokens=req.user.tokens.filter(tkn=>tkn.token!==token);
    req.user.tokens=tokens;
    await req.user.save();
    res.status(200).send({message:"Logout Succesfully ",user:req.user});
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
}

const logoutAllUser= async (req,res)=>{
  try {
    const user=req.user;
      user.tokens=[];
      await user.save();
      res.send("Successfully logout")
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
}

const checkDueDate=async(req,res)=>{
  const user=req.user;
  try {
      const borrowBooks=user.bookBorrow;
      let todayDate = new Date();
      const booksDetail=[]
      const oneDay = 24 * 60 * 60 * 1000;
      booksDetail.push(borrowBooks.map((book)=>{
          if(book.Due_Date-todayDate<=oneDay && book.Due_Date>=0){
              return {
                  bookname,
                  Due_Date
              };
          }
      }))
      booksDetail.forEach(detail=>{
          user.notification.push({
              text:`Due date for book: ${booksDetail.bookname} is ${detail.Due_Date}`
          })
      })
      await user.save();
  } catch (error) {
      throw error("Error calculating error");
  }

}

const getAllNotification=(req,res)=>{
  const user = req.user;
  try {
    const notifications = user.notification;
    if(!notifications)notifications=[]
    res.send(notifications);
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
}

const deleteNotification = async (req, res) => {
  const user = req.user;
  const id = req.params.id;
  try {
    const filteredNotifications = user.notification.filter(notif => notif._id.toString() !== id);

    user.notification = filteredNotifications;
    
    await user.save();
    
    res.status(200).json(filteredNotifications);
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).send("Internal Server Error");
  }
};

const forgetPassword = async (req, res) => {
  const {
      username
  } = req.body;
  try {
      let user = await User.findOne({
              username
          });
          
      if (user) {
          const email = user.email;
          const otp = generateOTP();
          const SendOTP = new OTPModel({
              email,
              otp
          });
          await SendOTP.save();
         await user.generateAuthToken();
          res.status(200).json({message:"OTP is been send to the register email address"});
      } else {
          res.status(404).send("Username not found");
      }
  } catch (error) {
      console.error('Error during password reset:', error);
      res.status(500).send(error);
  }
}

const verifyOTPPassword=async(req,res)=>{
  const {otp}=req.body;
  const user = req.user;
  try {
    const OTP= await OTPModel.findOne({email:user.email});
    if(!OTP || OTP.otp!==otp){
      user.tokens=[];
      return res.status(400).json({ message: "Invalid OTP or OTP not found." });
    }
    res.status(200).json({"message":"Enter new Password"});
  } catch (error) {
    res.status(500).json({message:"Error verifing the otp"});
  }
}

const resetPassword=async(req,res)=>{
  const {password}=req.body;
  const user=req.user;
  try {
    user.password=password;
    await user.save();
    return res.send("Password Reset successfully");
  } catch (error) {
    res.status(500).json({message:"Error reseting the password"});
  }
}

const editProfile = async (req, res) => {
  const {
      username,
      name
  } = req.body;
  const user = req.user;
  try {
      if (username) {

          let user;
          const cachedUser = await client.get(`user:${username}`);

          if (cachedUser) {
              const userData = JSON.parse(cachedUser);
              user = new User(userData);
              user._id = userData._id;
          } else {
              user = await User.findOne({
                  username
              });
              if (user) {
                  await client.set(`user:${username}`, JSON.stringify(user), {
                      EX: 3600
                  });
                  return res.status(400).json({
                      message: "User with this username already exist"
                  });

              }
          }
          user.username = username;
          await client.del(`user:${user.username}`);
          await client.set(`user:${username}`, JSON.stringify(user), {
              EX: 3600
          });
      }
      if (name) {
          user.name = name
      }
      await user.save();
      res.status(200).send(user);
  } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({
          "message": "Error updating Profile"
      })
  }
}

const editPassword=async(req,res)=>{
  const {oldPassword,newPassword}=req.body;
  const user=req.user;
  try {
    const isMatch=await bcrypt.compare(oldPassword,user.password);
    if(!isMatch){
      return res.status(400).json({message:"Old password is wrong"});
    }
    user.password=newPassword;
   await user.save();
   return res.status(200).json({message:"Password updated Successfully"})
  } catch (error) {
    console.log(error);
    return res.status(500).json({message:"Can't change the password"});
  }
}

const editProfilePic=async(req,res)=>{
  const user=req.user;
  const ImgPath=req.file.path;
  console.log(ImgPath);
  try {
  if(!ImgPath){
    return res.status(404).json({message:"Please add profile picture"})
  }
    const imgUrl= await UploadAndReturnUrl(ImgPath,'User');
    user.profile=imgUrl;
   await user.save();
   fs.unlinkSync(ImgPath);
    res.send("Successfull profile is updated");
  } catch (error) {
    res.status(500).send("Error updating profile");
  }
}

const finePayment = async (req, res) => {
  const user = req.user;
  const { bookId } = req.body;
  
  try {
    const borrowBook = user.bookBorrow.find(borrowBook =>
      borrowBook._id.toString() === bookId.toString() && borrowBook.fine > 0
    );
 
    if (!borrowBook) {
      return res.status(404).json({ message: "No dues available for this book" });
    }

    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: "Payment screenshot is required" });
    }

    const imagePath = req.file.path;
    const imageUrl = await UploadAndReturnUrl(imagePath, 'Payment-screenshot');
    
    borrowBook.paymentSS = imageUrl;
    borrowBook.fine=0;
    borrowBook.returned=true;
    await user.save();
    fs.unlinkSync(imagePath);
    res.status(200).json({ message: "Payment recorded successfully", user });
  } catch (error) {
    console.error("Error processing fine payment:", error);
    res.status(500).json({ message: "Error processing fine payment" });
  }
};

const getUserProfile = async (req, res) => {
  const user = req.user;
  try {
    const {_doc,...otherField} = user;
    const {tokens, __v, createdAt, updatedAt,password, ...sharingFields} = _doc;

    return res.send(sharingFields);
  } catch (error) {
    console.error("Error getting user profile:", error);
    return res.status(500).json({ message: "Error getting user profile" });
  }
};

module.exports = { loginUser, 
                signupUser ,
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
                getUserProfile
              }
