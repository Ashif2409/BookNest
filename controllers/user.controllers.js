const User = require('../db/models/user.model')
const bcrypt=require('bcryptjs');
const OTPModel = require('../db/models/OTP.model');
const generateOTP=require('../utils/generateOTP');
const UploadAndReturnUrl = require('../Service/Cloudinary');
const fs = require('fs')

const loginUser = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = await user.generateAuthToken();

    user.bookBorrow.forEach(borrow => {
      if (borrow && borrow.Due_Date) { 
        const dueDate = new Date(borrow.Due_Date);
        const today = new Date();
        const differenceInTime = today.getTime() - dueDate.getTime();
        const differenceInDays = Math.ceil(differenceInTime / (1000 * 3600 * 24));

        if (differenceInDays > 1) {
          borrow.fine = (differenceInDays - 1) * 5;
        } else {
          borrow.fine = 0;
        }
      }
    });

    await user.save();

    res.status(200).json({ user, token });

  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const signupUser = async (req, res) => {
  const { username, password, role,name,email } = req.body;

  User.findOne({ username: username })
    .then(async (existingUser) => {
      if (existingUser) {
        return res.status(401).json({ message: "User with this username already exists" });
      } else {
        let imagePath=null;
        let profileUrl=null;
        if(req.file){
           imagePath=req.file.path
           profileUrl=await UploadAndReturnUrl(imagePath,'User');
        }

        //generate OTP;
        const otp=generateOTP();
        const sendOTP= new OTPModel({
           email,
           otp
         })
         await sendOTP.save();

        const user = new User({
          username: username,
          password: password,
          profile: profileUrl!==null?profileUrl:'',
          name:name,
          email:email,
          role: role,
          bookBorrow: [],
        });
        if(profileUrl)fs.unlinkSync(imagePath);
        await user.save();
        res.status(201).json({"message":"OTP is been send to the register email",user})
      }
    })
    .catch(error => {
      console.error("Error finding user:", error);
      res.sendStatus(500);
    });
}

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

const forgetPassword=async(req,res)=>{
  const {email} = req.body;
  try {
    const otp=generateOTP()
    const SendOTP=new OTPModel({
      email,
      otp
    });
    await SendOTP.save();
    const user=await User.findOne({email});
    user.generateAuthToken();
    await user.save();
    res.send("OTP is been send to this email address");
  } catch (error) {
    res.status(500).send(error)
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

const editProfile=async(req,res)=>{
  const {username,name}=req.body;
  const user=req.user;
  try {
    if(username){
      const existingUser=await User.findOne({username});
      if(existingUser){
        return res.status(400).json({message:"User with this username already exist"});
      }
      user.username=username;
    }
    if(name){
      user.name=name
    }
    await user.save();
    res.status(240).send(user);
  } catch (error) {
    res.status(500).json({"message":"Error updating Profile"})
  }
}

const editPassword=async(req,res)=>{
  const {oldPassword,newPassword}=req.body;
  const user=req.user;
  try {
    const existingUser=await User.findById({_id:user._id});
    const isMatch=await bcrypt.compare(oldPassword,existingUser.password);
    if(!isMatch){
      return res.status(400).json({message:"Old password is wrong"});
    }
    user.password=newPassword;
   await user.save();
   return res.json({message:"Password updated Successfully"})
  } catch (error) {
    return res.status(500).json({message:"Can't change the password"});
  }
}

const editProfilePic=async(req,res)=>{
  const user=req.user;
  const ImgPath=req.file.path;
  try {
  if(!ImgPath){
    return res.status(404).json({message:"Please add profile picture"})
  }
    const existingUser=await User.findById(user._id);
    const imgUrl= await UploadAndReturnUrl(ImgPath,'User');
    existingUser.profile=imgUrl;
   await existingUser.save();
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