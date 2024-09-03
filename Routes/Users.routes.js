const express=require('express');
const router=express.Router();
const { auth } = require('../middleware/auth');
const upload = require('../middleware/multer');
const { loginUser,
     signupUser,
     verifyOTP,
     logoutAllUser,
     deleteNotification,
     forgetPassword,
     getAllNotification,
     logoutUser,
     verifyOTPPassword,
     resetPassword,
     editProfile,
     editProfilePic,
     editPassword,
     finePayment,
     getUserProfile} = require('../controllers/user.controllers');

router.post('/login',loginUser);
router.post('/signup',upload.single('Avatar'),signupUser);
router.post('/forget-password',forgetPassword);


router.post('/verify-otp',auth,verifyOTP);
router.post('/verifyOTP',auth,verifyOTPPassword);
router.post('/resetPassword',auth,resetPassword);
router.post('/logout',auth,logoutUser);



router.patch('/editProfilePic',auth,upload.single('Avatar'),editProfilePic); 
router.patch('/editProfile',auth,editProfile);
router.get('/profile',auth,getUserProfile);
router.patch('/editPassword',auth,editPassword);
router.post('/fine-payment',auth,upload.single('Screenshot'),finePayment);


router.delete('/notification/:id',auth,deleteNotification);
router.get('/notification',auth,getAllNotification);
router.post('/logout/alldevice',auth,logoutAllUser);
  
module.exports=router