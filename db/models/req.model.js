const mongoose = require('mongoose')

const reqBookSchema = new mongoose.Schema({
  bookname: {
    type: String,
    required: true
  },
  author: {
    type: String,
    required: true
  },
  genre:{
    type: String,
    required:true,
    enum:["Fiction","Non-fiction","Poetry","Drama"]
  },
  language:{
    type:String,
    enum: ["English","Hindi","Bengoli","Gujarati","Tamil","Telugu","Urdu","Marathi"],
    required: true
  },
  number_of_request: {
    type: Number,
    default: 0
  },
  userRequested:[ { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }]
}, {
  timestamps: true 
});


reqBookSchema.methods.toJSON = function () {
  const book = this;
  const bookObj = book.toObject();
  delete bookObj.__v;
  delete bookObj.updatedAt;
  return bookObj;
}


const ReqBook = mongoose.model('reqBooks', reqBookSchema);
module.exports = ReqBook