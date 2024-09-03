const User = require('../db/models/user.model');
const { client } = require('../Service/redis');


const checkAvailableBook = async (id, book) => {
  try {
    const cachedUser = await client.get(`userById:${id}`);
    let user;
    
    if (cachedUser) {
      user = JSON.parse(cachedUser);
    } else {
      user = await User.findById(id);
      if (user) {
        await client.set(`userById:${id}`, JSON.stringify(user), { EX: 3600 });
      }
    }

    const notification = {
      text: `Requested Book: ${book} now available in Library`,
      time: new Date()
    };

    await User.updateOne({ _id: id }, { $push: { notification: notification } });

    if (cachedUser) {
      user.notification.push(notification);
      await client.set(`userById:${id}`, JSON.stringify(user), { EX: 3600 });
    }
  } catch (error) {
    console.error("Error confirming return of book:", error);
  }
};


const confirmReturnBook = async (id, book) => {
    try {
      const cachedUser = await client.get(`userById:${id}`);
      let user;
  
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      } else {
        user = await User.findById(id);
        if (user) {
          await client.set(`userById:${id}`, JSON.stringify(user), { EX: 3600 });
        }
      }
  
      const notification = {
        text: `Your Book: ${book} is returned and verified successfully`,
        time: new Date()
      };
  
      await User.updateOne({ _id: id }, { $push: { notification: notification } });

      if (cachedUser) {
        user.notification.push(notification);
        await client.set(`userById:${id}`, JSON.stringify(user), { EX: 3600 });
      }
    } catch (error) {
      console.error("Error confirming return of book:", error);
    }
  };
  

const adminVerification=async (id)=>{
    try{
    const cachedUser = await client.get(`userById:${id}`);
    let user;
    if(cachedUser){
        user=JSON.parse(cachedUser);
    }else{
         user=await User.findById(id);
        await client.set(`userById:${id}`,JSON.stringify(user),{EX:3600});
    }
   const notification={
        text:`Congratulation, you are now an Admin`,
        time: new Date()
    }
    await User.updateOne({ _id: id }, { $push: { notification: notification } });

      if (cachedUser) {
        user.notification.push(notification);
        await client.set(`userById:${id}`, JSON.stringify(user), { EX: 3600 });
      }
    } catch (error) {
      console.error("Error confirming return of book:", error);
    }
}



module.exports={
    checkAvailableBook,
    confirmReturnBook,
    adminVerification
}