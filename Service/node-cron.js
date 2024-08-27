const cron = require('node-cron');
const User = require('../db/models/user.model');
const {dueDateMail} = require('./Nodemailer');
const FINE_PER_DAY=process.env.FINE_PER_DAY;
const dueDateCheck = ()=>{

  cron.schedule('0 0 * * *', async () => {
    try {
      const users = await User.find();
      const today = new Date();
      for (const user of users) {
        const notificationsToAdd = [];
      for (const element of user.bookBorrow) {
        const dueDate = new Date(element.Due_Date);
        const timeDifference = dueDate.getTime() - today.getTime();
        if (timeDifference <= 24 * 60 * 60 * 1000 && timeDifference > 0 && element.returned==false) {
          notificationsToAdd.push({
            text: `Tomorrow is the last date to return ${element.book}. Kindly renew or return the book.`,
            time: new Date()
          });
        }else if(timeDifference<0 && element.returned==false){
          const overdueDays = Math.ceil((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));
          const fineAmount = overdueDays * FINE_PER_DAY;
          await dueDateMail(user.email,user.name,element.bookname,fineAmount);
          notificationsToAdd.push({
            text: `The due date for ${element.book} has passed. Please return it immediately.`,
            time: new Date()
          });
        }
      }
      
      if (notificationsToAdd.length > 0) {
        user.notification.push(...notificationsToAdd);
        await user.save();  
      }
    }
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});
}

module.exports = dueDateCheck;
