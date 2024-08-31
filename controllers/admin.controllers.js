const User = require('../db/models/user.model');
const BookDetails = require('../db/models/book.model');
const ReqBook = require('../db/models/req.model');
const { checkAvailableBook, confirmReturnBook, adminVerification } = require('../utils/checkDueDateAndReqBook');
const UploadAndReturnUrl = require('../Service/Cloudinary');
const fs = require('fs');
const { client } = require('../Service/redis');

const viewUserBooks = async (req, res) => {
  const { username } = req.body;

  try {
    const cachedUserBooks = await client.get(`user_borrowBook:${username}`);
    let books;

    if (cachedUserBooks) {
      books = JSON.parse(cachedUserBooks);
    } else {
      const user = await User.findOne({ username });

      if (user) {
        books = user.bookBorrow;        
        await client.set(`user_borrowBook:${username}`, JSON.stringify(books), {
          EX: 3600 
        });
      } else {
        return res.json({ message: "User not found", books: [] });
      }
    }

    return res.status(200).json({ books });
  } catch (error) {
    console.error("Error fetching user books:", error);
    res.status(500).json({ message: "Error fetching books" });
  }
}


const getUsersWhoBorrowedBook = async (req, res) => {
  const { bookName } = req.body;
  try {
    const book = await BookDetails.findOne({ bookname: bookName });
    if (book) {
      const users = await Promise.all(book.borrower.map(async (user) => {
        return await User.findById(user)
      }));
      const { _doc, ...otherField } = user;
      const { tokens, __v, notification, createdAt, updatedAt, password, ...sharingFields } = _doc;

      res.status(200).json(sharingFields)
    } else {
      res.status(400).json({ message: "No book found" })
    }
  } catch {
    res.status(500).send("Error fetching users")
  }
}

const viewReqBooks = async (req, res) => {
  try {
    const books = await ReqBook.find();
    if (books) {
      res.status(200).json({ books: books });
    } else {
      res.status(400).json({ messsage: "No book found" })
    }
  } catch {
    console.log("Error in fetching");
  }

}

const deleteReqBook = async (req, res) => {
  const { _id } = req.body;

  try {
    const requestedBook = await ReqBook.findById(_id);

    if (!requestedBook) {
      return res.status(404).json({ message: "Requested book not found" });
    }

    const existingBook = await BookDetails.findOne({ bookname: requestedBook.bookname });
    if (!existingBook) {
      const imagePath = req.file.path;
      const BookImageUrl = await UploadAndReturnUrl(imagePath, 'Book');

      const newBook = new BookDetails({
        bookname: requestedBook.bookname,
        author: requestedBook.author,
        genre: requestedBook.genre,
        language: requestedBook.language,
        coverPhoto: BookImageUrl,
        number_of_copies: requestedBook.number_of_copies
      });
      await newBook.save();
      fs.unlinkSync(imagePath);
      const deletedBook = await ReqBook.findByIdAndDelete(_id);
      if (deletedBook && deletedBook.userRequested) {
        await Promise.all(
          deletedBook.userRequested.map(user => checkAvailableBook(user, deletedBook.bookname))
        );
      }
    }

    res.status(200).json({ message: "Requested book deleted and added to library" });
  } catch (error) {
    console.error("Error deleting book:", error);
    res.status(500).json({ message: "Failed to add book in Library DB" });
  }
};

const addBookToLib = async (req, res) => {
  const { bookname, author, number_of_copies, genre, language } = req.body;
  try {
    const existingBook = await BookDetails.findOne({ bookname });
    if (existingBook) {
      existingBook.number_of_copies++;
      await existingBook.save();
    } else {
      const imagePath = req.file.path;
      const BookImageUrl = await UploadAndReturnUrl(imagePath, 'Book');
      const book = new BookDetails({
        bookname,
        author,
        genre,
        language,
        coverPhoto: BookImageUrl,
        number_of_copies,
      })
      await book.save();
      fs.unlinkSync(imagePath);
    }
    res.send(bookname + ' is added to the library');
  } catch (error) {
    res.status(500).send("Won't able to add book");
  }
}

const approveAdmin = async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findById(userId);

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
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).send("User not found");
    }

    const bookIndex = user.bookBorrow.findIndex(book => book._id.toString() === bookId.toString());

    if (bookIndex === -1) {
      return res.status(404).send("Book not found in user's borrowed list");
    }

    user.bookBorrow[bookIndex].verifyReturn = true;
    confirmReturnBook(user._id, user.bookBorrow[bookIndex].bookname);
    await user.save();
    const { _doc, ...otherField } = user
    const { tokens, notification, password, createdAt, updatedAt, __v, ...fieldNeeded } = _doc
    res.status(200).send(fieldNeeded);
  } catch (error) {
    console.error("Error verifying book:", error);
    res.status(500).send("Error verifying book");
  }
};

const usersWithOverdueBooks = async (req, res) => {
  try {
    const users = await User.find();
    const today = new Date();
    const overdueUsers = [];

    for (const user of users) {
      for (const element of user.bookBorrow) {
        const dueDate = new Date(element.Due_Date);
        const isOverdue = today > dueDate && element.returned === false;

        if (isOverdue) {
          overdueUsers.push(user);
          break; 
        }
      }
    }
    const sharingDetails=overdueUsers.map(user=>{
      const { _doc, ...otherField } =user;
        const { tokens, __v, notification, createdAt, updatedAt, password, ...sharingFields } = _doc;
        return sharingFields
    })

      return res.status(200).json(sharingDetails)
  } catch (error) {
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