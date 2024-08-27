const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, 
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});


async function dueDateMail(RecipientMail,Recipient,Book,Amount) {
  const info = await transporter.sendMail({
    from: `<${process.env.SMTP_USER}>`, 
    to: `<${RecipientMail}>`, 
    subject: "Overdue Book Notice and Accruing Fine", 
    text: `Dear ${Recipient},
    I hope you're doing well. I'm writing to remind you that the due date for the book titled ${Book} has passed. As per our policy, a fine of ₹10 is applied for each day the book is overdue.
    As of today, the total fine stands at ₹${Amount}. Please return the book as soon as possible to avoid further charges.
    If you have any concerns or need to discuss the matter, feel free to reach out.
    Thank you for your understanding and prompt action.
    Best regards`, 
  });

  console.log("Message sent: %s", info.messageId);
}

async function otpSend(RecipientMail,otp){
  const info = await transporter.sendMail({
    from: `<${process.env.SMTP_USER}>`, 
    to: `<${RecipientMail}>`, 
    subject: "Verification Email", 
    text: `<h1>Please confirm your OTP</h1>
       <p>Here is your OTP code: ${otp}</p>`, 
  });
  console.log("OTP sent: %s", info.messageId);
}
module.exports = {dueDateMail,otpSend};
