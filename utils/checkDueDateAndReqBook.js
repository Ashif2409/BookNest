const User = require('../db/models/user.model')


const checkAvailableBook=async (id,book)=>{
    const user=await User.findById(id);
    user.notification.push({
        text:`Requested Book: ${book} now available in Library`,
        time: new Date()
    })
    await user.save()
}

const confirmReturnBook=async (id,book)=>{
    const user=await User.findById(id);
    user.notification.push({
        text:`Your Book: ${book} is returned and verified successfully`,
        time: new Date()
    })
    await user.save()
}

const adminVerification=async (id)=>{
    const user=await User.findById(id);
    user.notification.push({
        text:`Congratulation, you are now an Admin`,
        time: new Date()
    })
    await user.save()
}



module.exports={
    checkAvailableBook,
    confirmReturnBook,
    adminVerification
}