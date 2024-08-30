const mongoose=require('mongoose');

const bookSchema=new mongoose.Schema({
    bookname:{
      type: String,
      required: true
    },
    coverPhoto:{
      type: String,
    },
    bookIssuedCount:{
      type: Number,
      default: 0
    },
    author: {
      type:String,
      required: true,
    },
    genre:{
      type: String,
      required:true,
      enum:["Fiction","Non-fiction","Poetry","Drama"]
    },
    language:{
      type: String,
      required:true,
      enum: ["English","Hindi","Bengoli","Gujarati","Tamil","Telugu","Urdu","Marathi","odia"]
    },
    number_of_copies: {
      type:Number,
      default:1
    },
    borrower: [{
      type: mongoose.Schema.Types.ObjectId,
      ref:'User'
    }]
  },{
    timeseries:true,
    timestamps:true
  });

  bookSchema.methods.toJSON=function(){
    const book=this;
    const bookObj= book.toObject();
    delete bookObj.__v;
    delete bookObj.updatedAt;
    return bookObj
  }

const BookDetails = mongoose.model('Books',bookSchema);

module.exports=BookDetails