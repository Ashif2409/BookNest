const mongoose=require('mongoose');
const {otpSend} = require('../../Service/Nodemailer')
const OTPSchema=mongoose.Schema({
    email:{
        type:String,
        required: true,
    },
    otp:{
        type: Number,
        required:true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 60 * 5, 
      },
});

async function SendVerificationCode(email,otp){
    try {
        otpSend(email,otp);
    } catch (error) {
        console.log("Error sending the otp");
    }
}

OTPSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            const existingOTP = await mongoose.model('OTP').findOne({ email: this.email });
            
            if (existingOTP) {
                await mongoose.model('OTP').deleteOne({ email: this.email });
            }

            await SendVerificationCode(this.email, this.otp);
        } catch (error) {
            return next(error); // Handle error
        }
    }
    next();
});

const OTPModel=mongoose.model('OTP',OTPSchema);

module.exports = OTPModel