const User = require('../db/models/user.model')


const checkAvailableBook=async (id,book)=>{
    const user=await User.findById(id);
    user.notification.push({
        text:`Requested Book: ${book} now available in Library`,
        time: new Date()
    })
    await user.save()
}



module.exports={
    checkAvailableBook
}