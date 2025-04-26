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
    let books = [];

    if (booksDetail) {
      books = JSON.parse(booksDetail);
    } else {
      books = await ReqBook.find();
      await client.set('req_book', JSON.stringify(books), { EX: 3600 });
    }

    // Always return an array, even if empty
    res.status(200).json({ books });

  } catch (error) {
    console.error("Error in fetching requested books:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};




const deleteReqBook = async (req, res) => {
  const { _id } = req.body;

  try {
    const requestedBook = await ReqBook.findById(_id);

    if (!requestedBook) {
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.error('Failed to delete file:', err);
        }
      }
      return res.status(404).json({ message: "Requested book not found" });
    }

    // Delete the requested book
    const deletedBook = await ReqBook.findByIdAndDelete(_id);

    // Clean up any related cache
    await client.del('req_book');

    // Optionally update users who requested the book
    if (deletedBook && deletedBook.userRequested) {
      await Promise.all(
        deletedBook.userRequested.map(user => checkAvailableBook(user, deletedBook.bookname))
      );
    }

    // Clean up uploaded file if present
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting uploaded file:', err);
      }
    }

    res.status(200).json({ message: "Requested book deleted successfully" });
  } catch (error) {
    console.error("Error deleting requested book:", error);

    // Attempt to delete the file in case of an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting file on failure:', err);
      }
    }

    res.status(500).json({ message: "Failed to delete requested book" });
  }
};





const addBookToLib = async (req, res) => {
  const { bookname, author, number_of_copies, genre, language } = req.body;

  try {
    // Check if the book already exists in the cache
    const cachedBooks = await client.get(`bookname:${bookname}`);
    let existingBook;

    // If book exists in cache
    if (cachedBooks) {
      existingBook = JSON.parse(cachedBooks);

      // If there's an image file, delete it after getting the cache
      if (req.file) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (err) {
          console.log("Error deleting image:", err);
        }
      }
    } else {
      // If the book doesn't exist in cache, look for it in the database
      existingBook = await BookDetails.findOne({ bookname });

      // If found, cache it
      if (existingBook) {
        await client.set(`bookname:${bookname}`, JSON.stringify(existingBook), { EX: 3600 });

        // If there's an image file, delete it after caching the book
        if (req.file) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (err) {
            console.log("Error deleting image:", err);
          }
        }
      }
    }

    // If book already exists, increment the number of copies
    if (existingBook) {
      existingBook.number_of_copies += 1;
      await BookDetails.updateOne({ _id: existingBook._id }, { number_of_copies: existingBook.number_of_copies });
    } else {
      // If the book doesn't exist, create a new book entry
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

      // Save the new book
      await book.save();
      await client.set(`bookname:${book.bookname}`, JSON.stringify(book), { EX: 3600 });

      // Clean up the uploaded image after saving
      try {
        fs.unlinkSync(imagePath);
      } catch (err) {
        console.error('Failed to delete file:', err);
      }
    }

    // ✅ Invalidate all related cached book lists
    const pattern = `books:*`; // match all query-based caches
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys); // delete the matched keys
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
    // Check if the user is cached
    const cachedUser = await client.get(`userById:${userId}`);
    let user = null;

    if (cachedUser) {
      // If user is cached, parse the cached data
      user = JSON.parse(cachedUser);
    } else {
      // If not cached, fetch the user from the database
      user = await User.findById(userId);
      if (user) {
        // Cache the user data for 1 hour (3600 seconds)
        await client.set(`userById:${userId}`, JSON.stringify(user), { EX: 3600 });
      }
    }

    // Check if the user exists
    if (!user) {
      return res.status(404).send("User not found");
    }

    // Update the user's role to Admin
    user.role = "Admin";

    // Call the admin verification function (assuming it handles specific admin verification logic)
    adminVerification(userId);

    // Save the updated user
    await user.save();

    // Remove the cached data after the user role is updated to reflect the change
    await client.del(`userById:${userId}`);

    // Return success response
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


    for (let user of users) {

      user.bookBorrow = user.bookBorrow.map((book) => {
        if (book.returned === true && book.verifyReturn === false) {
          book.verifyReturn = true;
        }
        return book;
      });

      await user.save();

      // Delete user cache
      try {
        await client.del(`userById:${user._id}`);
      } catch (err) {
        console.error(`❌ Failed to delete cache userById:${user._id}`, err);
      }

      // Delete all related bookname caches
      const uniqueBookNames = [
        ...new Set(
          user.bookBorrow
            .filter((b) => b.returned === true && b.verifyReturn === true)
            .map((b) => b.bookname)
        )
      ];


      for (let bookName of uniqueBookNames) {
        try {
          await client.del(`bookname:${bookName}`);
        } catch (err) {
          console.error(`❌ Failed to delete cache bookname:${bookName}`, err);
        }
      }
    }

    // After updating users

    const filterFieldsUser = users.map((user) => {
      const { _doc } = user;
      const { _id, username, profile, name, email, bookBorrow } = _doc;
      const filterData = bookBorrow.filter(book => {
        return book.returned === true && book.verifyReturn === false;
      });
      return { _id, username, profile, name, email, filterData };
    });


    res.status(200).json(filterFieldsUser);

  } catch (error) {
    console.error("❗ Error fetching users", error);
    res.status(500).json({ message: 'Error fetching users' });
  }
};




const verifyReturnBook = async (req, res) => {
  const { userId, bookId } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    const bookIndex = user.bookBorrow.findIndex(book => book._id.toString() === bookId.toString());
    if (bookIndex === -1) {
      return res.status(404).send("Book not found in user's borrowed list");
    }

    user.bookBorrow[bookIndex].verifyReturn = true;

    // Get bookname before updating
    const bookname = user.bookBorrow[bookIndex].bookname;

    // Update the book in the database
    await User.updateOne(
      { _id: user._id, "bookBorrow._id": bookId },
      { $set: { "bookBorrow.$.verifyReturn": true } }
    );

    // ❌ Remove user cache
    await client.del(`userById:${userId}`);

    // ✅ Also remove book cache
    await client.del(`bookname:${bookname}`);

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
    let users;
    const usersCaching = await client.get('userdue');

    if (usersCaching) {
      users = JSON.parse(usersCaching);
    } else {
      users = await User.find();
      if (users) {
        await client.set('userdue', JSON.stringify(users), { EX: 3600 });
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

    // If there are overdue users, update the cache with only overdue users
    if (overdueUsers.length > 0) {
      await client.set('userdue', JSON.stringify(overdueUsers), { EX: 3600 });
    }

    // Safely destructure and exclude unnecessary fields
    const sharingDetails = overdueUsers.map(user => {
      // Check if '_doc' exists
      const userDoc = user._doc || user; // If _doc exists, use it; otherwise, use user directly
      const { tokens, __v, notification, createdAt, updatedAt, password, ...sharingFields } = userDoc;

      return sharingFields;
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