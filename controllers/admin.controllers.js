const User = require('../db/models/user.model');
const BookDetails = require('../db/models/book.model');
const ReqBook = require('../db/models/req.model');
const { checkAvailableBook, confirmReturnBook, adminVerification } = require('../utils/checkDueDateAndReqBook');
const UploadAndReturnUrl = require('../Service/Cloudinary');
const fs = require('fs');
const { client } = require('../Service/redis');

const viewUserBooks = async (req, res) => {
  const { userId } = req.body;

  try {
    const cachedUser = await client.get(`userById:${userId}`);
    let user=null;

    if (cachedUser) {
      user = JSON.parse(cachedUser);
      return res.status(200).json({ books:user.bookBorrow });
    } else {
      const user = await User.findById(userId );
      if (user) {      
        await client.set(`userById:${userId}`, JSON.stringify(user), {
          EX: 3600 
        });
        return res.status(200).json({ books:user.bookBorrow });
      } else {
        return res.json({ message: "User not found", books: [] });
      }
    }

  } catch (error) {
    console.error("Error fetching user books:", error);
    res.status(500).json({ message: "Error fetching books" });
  }
}


const getUsersWhoBorrowedBook = async (req, res) => {
  const { bookName } = req.body;
  try {
    const cachedBooks=await client.get(`bookname:${bookName}`);
    let book=null;
    if(cachedBooks){
      book=JSON.parse(cachedBooks);
    }else{
       book = await BookDetails.findOne({ bookname: bookName });
       if(book){
         await client.set(`bookname:${bookName}`,JSON.stringify(book),{EX:3600});
       }
    }
    if (book) {
      const users = await Promise.all(book.borrower.map(async (user) => {
        const userCaching=await client.get(`userById:${user}`);
        if(userCaching){
          return JSON.parse(userCaching);
        }else{
          const userById= await User.findById(user);
          if(userById){
            await client.set(`userById:${user}`,JSON.stringify(userById),{EX:3600});
          }
          return userById;
        }
      }));
      if(cachedBooks){
        return res.status(200).send(users);
      }
      return res.status(200).send(users)
    } else {
      res.status(400).json({ message: "No book found" })
    }
  } catch(error) {
    console.log(error)
    res.status(500).send("Error fetching users")
  }
}

const viewReqBooks = async (req, res) => {
  try {
    const booksDetail = await client.get('req_book');
    let books;
    
    if (booksDetail) {
      books = JSON.parse(booksDetail);
    } else {
      books = await ReqBook.find();
      if(books){
        await client.set('req_book', JSON.stringify(books),{EX:3600});
      }
    }
    
    if (books && books.length > 0) {
      res.status(200).json({ books: books });
    } else {
      res.status(404).json({ message: "No book found" });
    }
  } catch (error) {
    console.error("Error in fetching books:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
}


const deleteReqBook = async (req, res) => {
  const { _id } = req.body;

  try {
    const requestedBook = await ReqBook.findById(_id);

    if (!requestedBook) {
      if(req.file){
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Failed to delete file:', err);
        }
      }
      return res.status(404).json({ message: "Requested book not found" });
    }

    const cachedBooks = await client.get(`bookname:${requestedBook.bookname}`);
    let existingBook;

    if (cachedBooks) {
      existingBook = JSON.parse(cachedBooks);
    } else {
      existingBook = await BookDetails.findOne({ bookname: requestedBook.bookname });
    }

    let BookImageUrl;

    if (existingBook) {
      existingBook.number_of_copies++;
      const newExistingBook = await existingBook.save();
      await client.set(`bookname:${requestedBook.bookname}`, JSON.stringify(newExistingBook), { EX: 3600 });
    } else {
      // If the book doesn't exist, check if a file was uploaded
      if (req.file) {
        const imagePath = req.file.path;
        BookImageUrl = await UploadAndReturnUrl(imagePath, 'Book');
        
        const newBook = new BookDetails({
          bookname: requestedBook.bookname,
          author: requestedBook.author,
          genre: requestedBook.genre,
          language: requestedBook.language,
          coverPhoto: BookImageUrl,
          number_of_copies: requestedBook.number_of_copies,
        });

        const updatedBook = await newBook.save();
        await client.set(`bookname:${updatedBook.bookname}`, JSON.stringify(updatedBook), { EX: 3600 });

        // Delete the uploaded file after it's been processed
        try {
          fs.unlinkSync(imagePath);
        } catch (err) {
          console.error('Failed to delete file:', err);
        }
      } else {
        return res.status(400).json({ message: "Image file is required when adding a new book" });
      }
    }

    const deletedBook = await ReqBook.findByIdAndDelete(_id);
    if (deletedBook && deletedBook.userRequested) {
      await Promise.all(
        deletedBook.userRequested.map(user => checkAvailableBook(user, deletedBook.bookname))
      );
    }

    await client.del('req_book');

    res.status(200).json({ message: "Requested book deleted and added to library" });
  } catch (error) {
    console.error("Error deleting book:", error);

    // Attempt to delete the file in case of an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting file on failure:', err);
      }
    }

    res.status(500).json({ message: "Failed to add book in Library DB" });
  }
};




const addBookToLib = async (req, res) => {
  const { bookname, author, number_of_copies, genre, language } = req.body;

  try {
    const cachedBooks = await client.get(`bookname:${bookname}`);
    let existingBook;
    
    if (cachedBooks) {
      existingBook = JSON.parse(cachedBooks);

      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.log("Error deleting image:", err);
        }
      }
    } else {
      existingBook = await BookDetails.findOne({ bookname });

      if (existingBook) {
        await client.set(`bookname:${bookname}`, JSON.stringify(existingBook), { EX: 3600 });

        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (err) {
            console.log("Error deleting image:", err);
          }
        }
      }
    }

    if (existingBook) {
      // If the book already exists, increment the number of copies
      existingBook.number_of_copies += 1;
      await BookDetails.updateOne({ _id: existingBook._id }, { number_of_copies: existingBook.number_of_copies });
    } else {
      // If the book doesn't exist, upload the image and save the new book details
      const imagePath = req.file.path;
      const BookImageUrl = await UploadAndReturnUrl(imagePath, 'Book');

      const book = new BookDetails({
        bookname,
        author,
        genre,
        language,
        coverPhoto: BookImageUrl,
        number_of_copies,
      });

      await book.save();
      await client.set(`bookname:${book.bookname}`, JSON.stringify(book), { EX: 3600 });

      // Clean up the uploaded image after successful upload and save
      try {
        fs.unlinkSync(imagePath);
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    }

    res.send(`${bookname} is added to the library`);
  } catch (error) {
    console.log(error);

    // Attempt to delete the image file if it exists in case of any error
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting file on failure:', err);
      }
    }

    res.status(500).send("Unable to add the book");
  }
};

 


const approveAdmin = async (req, res) => {
  const userId = req.params.id;

  try {
    const cachedUser = await client.get(`userById:${userId}`);
    let user=null;
    if(cachedUser){
      user=JSON.parse(cachedUser);
    }else{
      user = await User.findById(userId);
      if(user){
        await client.set(`userById:${userId}`,JSON.stringify(user),{EX:3600});
      }
    }

    if (!user) {
      return res.status(404).send("User not found");
    }

    user.role = "Admin";
    adminVerification(userId);
    await user.save();

    res.status(200).json({ message: "Role updated to Admin successfully", user });
  } catch (error) {
    console.error("Error updating role:", error.message);
    res.status(500).json({ message: "Unable to change the role to admin" });
  }
};

const ReturnBooks = async (req, res) => {
  try {
    const users = await User.find({
      bookBorrow: {
        $elemMatch: {
          returned: true,
          verifyReturn: false
        }
      }
    });
    const filterFieldsUser = users.map((user) => {
      const { _doc, ...otherParams } = user;
      const { _id, username, profile, name, email, bookBorrow, tokens, notification, createdAt, updatedAt, __v, password, ...sharingDetails } = _doc;
      const filterData = bookBorrow.filter(book => {
        if (book.returned == true && book.verifyReturn == false) {
          return true;
        }
      })
      return { _id, username, profile, name, email, filterData };
    })
    res.status(200).json(filterFieldsUser);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }

}

const verifyReturnBook = async (req, res) => {
  const { userId, bookId } = req.body;

  try {
    const userCaching = await client.get(`userById:${userId}`);
    let user = null;
    
    if (userCaching) {
      user = JSON.parse(userCaching);
    } else {
      user = await User.findById(userId);
      if (user) {
        await client.set(`userById:${userId}`, JSON.stringify(user), { EX: 3600 });
      }
    }

    if (!user) {
      return res.status(404).send("User not found");
    }

    const bookIndex = user.bookBorrow.findIndex(book => book._id.toString() === bookId.toString());

    if (bookIndex === -1) {
      return res.status(404).send("Book not found in user's borrowed list");
    }

    user.bookBorrow[bookIndex].verifyReturn = true;
    confirmReturnBook(user._id, user.bookBorrow[bookIndex].bookname);

    await User.updateOne(
      { _id: user._id, "bookBorrow._id": bookId },
      { $set: { "bookBorrow.$.verifyReturn": true } }
    );

    await client.set(`userById:${userId}`, JSON.stringify(user), { EX: 3600 });

    const { _doc, ...otherField } = user;
    const { tokens, notification, password, createdAt, updatedAt, __v, ...fieldNeeded } = _doc;
    res.status(200).send(fieldNeeded);
  } catch (error) {
    console.error("Error verifying book:", error);
    res.status(500).send("Error verifying book");
  }
};


const usersWithOverdueBooks = async (req, res) => {
  try {
    const usersCaching = await client.get('users');
    let users;

    if (usersCaching) {
      users = JSON.parse(usersCaching);
    } else {
      users = await User.find();
      if (users) {
        await client.set('users', JSON.stringify(users),{EX:3600});
      }
    }

    if (!users || users.length === 0) {
      return res.status(404).send({ error: 'No users found.' });
    }

    const today = new Date();
    const overdueUsers = [];

    for (const user of users) {
      try {
        for (const element of user.bookBorrow) {
          const dueDate = new Date(element.Due_Date);
          const isOverdue = today > dueDate && element.returned === false;

          if (isOverdue) {
            overdueUsers.push(user);
            break; 
          }
        }
      } catch (innerError) {
        console.error(`Error processing user ${user._id}:`, innerError);
      }
    }

    const sharingDetails = overdueUsers.map(user => {
      if(usersCaching){
        return users;
      }else{
        const { _doc, ...otherField } = user;
        const { tokens, __v, notification, createdAt, updatedAt, password, ...sharingFields } = _doc;
        return sharingFields;
      }
    });
    return res.status(200).json(sharingDetails);
  } catch (error) {
    console.error('Error fetching users with overdue books:', error);
    return res.status(500).send({ error: 'An error occurred while fetching users with overdue books.' });
  }
};



module.exports = {
  viewUserBooks,
  getUsersWhoBorrowedBook,
  viewReqBooks,
  deleteReqBook,
  addBookToLib,
  approveAdmin,
  ReturnBooks,
  verifyReturnBook,
  usersWithOverdueBooks
}