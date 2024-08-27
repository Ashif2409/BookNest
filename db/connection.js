const mongoose=require('mongoose')
async function main() {
    await mongoose.connect(process.env.MONGODB_URL_PRODUCTION);
    console.log("Database Connection is successful");
  }
module.exports=main