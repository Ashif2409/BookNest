const BookDetails = require('../db/models/book.model')
const ReqBook = require('../db/models/req.model');
const User = require('../db/models/user.model');
const { client } = require('../Service/redis');

const getBooks = async (req, res) => {
  const { limit = 10, page = 1, } = req.query;
  const { bookname, author, genre, language, available } = req.body;
  try {
    const query = {};
    if (bookname) query.bookname = { $regex: bookname, $options: 'i' };
    if (author) query.author = { $regex: author, $options: 'i' };
    if (genre) query.genre = genre;
    if (language) query.language = language;
    if (available !== undefined) {
      if (available === 'true') {
        query.number_of_copies = { $gt: 0 };
      } else if (available === 'false') {
        query.number_of_copies = 0;
      }
    }

    const skip = (page - 1) * limit;
    const books = await BookDetails.find(query)
      .limit(limit)
      .skip(skip)
      .exec();

    if (books.length > 0) {
      res.status(200).send({ books });
    } else {
      res.status(404).send({ message: "No books available" });
    }
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

const issueBooks = async (req, res) => {
  const { book } = req.body;
  const user = req.user;

  try {
    const countUnreturnedBooks = (user, book) => {
      if (!user || !user.bookBorrow) return 0; 
      return user.bookBorrow.filter(userBook => userBook.bookname === book && !userBook.returned).length;
    };

    if (countUnreturnedBooks(user, book) >= 2) {
      return res.status(400).json({ message: "You can't borrow more than 2 copies of the same book" });
    }

    let cachedBook = await client.get(`bookname:${book}`);
    let issueBook;

    if (cachedBook) {
      const issueBookDetail = JSON.parse(cachedBook);
      issueBook = new BookDetails(issueBookDetail);
      issueBook._id = issueBookDetail._id;
    } else {
      issueBook = await BookDetails.findOne({ bookname: book });
      if (issueBook) {
        await client.set(`bookname:${book}`, JSON.stringify(issueBook), { EX: 3600 });
      }
    }

    if (!issueBook || issueBook.number_of_copies === 0) {
      return res.status(404).json({ message: "Book not available for borrowing", books: user.bookBorrow });
    }

    if (user.bookBorrow.some(borrowedBook => borrowedBook.bookname === book && !borrowedBook.returned)) {
      return res.status(409).json({ message: "You cannot borrow the same book again before returning it" });
    }

    const hasPendingFine = user.bookBorrow.some(borrowedBook => borrowedBook.fine > 0);
    if (hasPendingFine) {
      return res.status(400).json({ message: "First pay the outstanding fines before borrowing more books." });
    }

    issueBook.number_of_copies--;
    issueBook.bookIssuedCount++;
    issueBook.borrower.push(user._id);

    await client.set(`bookname:${book}`, JSON.stringify(issueBook), { EX: 3600 });

    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 7);
    const dueDate = currentDate.toISOString().split('T')[0];

    user.bookBorrow.push({
      bookname: book,
      Due_Date: dueDate,
      fine: 0,
    });

    await user.save();
    res.status(200).json({ message: 'Book issued successfully', books: user.bookBorrow });
  } catch (error) {
    console.error('Error issuing book:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};


const returnBook = async (req, res) => {
  const { book } = req.body;
  const user = req.user;

  try {
    const borrowedBook = user.bookBorrow.find(userBook => userBook.bookname === book && !userBook.returned);

    if (!borrowedBook) {
      return res.status(404).json({ message: "Book not found in user's borrowed list" });
    }

    if (borrowedBook.fine > 0) {
      return res.status(400).json({ message: `Please pay the fine of ${borrowedBook.fine} first` });
    }

    borrowedBook.returned = true;
    await user.save();

    let cachedBook = await client.get(`bookname:${book}`);
    let issueBook;

    if (cachedBook) {
      issueBook = JSON.parse(cachedBook);
    } else {
      issueBook = await BookDetails.findOneAndUpdate(
        { bookname: book },
        { $inc: { number_of_copies: 1 }, $pull: { borrower: user._id } },
        { new: true }
      );
      if (issueBook) {
        await client.set(`bookname:${book}`, JSON.stringify(issueBook), { EX: 3600 });
      }
    }

    if (!issueBook) {
      return res.status(404).json({ message: "Book not found in library" });
    }

    // If we had to use the cached data, we need to manually update number_of_copies and borrower array
    if (cachedBook) {
      issueBook.number_of_copies++;
      await BookDetails.updateOne(
        { bookname: book },
        { $inc: { number_of_copies: 1 }, $pull: { borrower: user._id } }
      );
      await client.set(`bookname:${book}`, JSON.stringify(issueBook), { EX: 3600 });
    }

    res.status(200).json({ message: "Successfully returned", books: user.bookBorrow });

  } catch (error) {
    console.error('Error returning book:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};




const reqBook = async (req, res) => {
  const { bookname, author, genre, language } = req.body;
  try {
    if (!bookname || !author) {
      return res.status(400).send("Give a valid author and bookname")
    }

    let cachedBook = await client.get(`bookname:${bookname}`);
    let existingBook;

    if (cachedBook) {
      const issueBookDetail = JSON.parse(cachedBook);
      existingBook = new BookDetails(issueBookDetail);
      existingBook._id = issueBookDetail._id;
    } else {
      issueBook = await BookDetails.findOne({ bookname: bookname });
      if (existingBook) {
        await client.set(`bookname:${bookname}`, JSON.stringify(existingBook), { EX: 3600 });
      }
    }


    if (existingBook && existingBook.number_of_copies > 0) {
      return res.status(200).json({ message: "Book is already available in Library", book: existingBook });
    }

    const requestedBook = await ReqBook.findOne({ bookname: bookname, author: author });

    if (requestedBook && requestedBook.userRequested.some(userId => userId.equals(req.user._id))) {
      return res.status(400).send("You have already requested this book");
    }

    if (requestedBook) {
      if (!requestedBook.userRequested) requestedBook.userRequested = [];
      requestedBook.userRequested.push(req.user._id)
      requestedBook.number_of_request += 1;
      await requestedBook.save();
      return res.status(200).json({ message: "Book is been added to Requested book DB", book: requestedBook });
    } else {
      const newReqBook = new ReqBook({
        bookname: bookname,
        author: author,
        number_of_request: 1,
        genre,
        language,
        userRequested: [req.user._id]
      });
      const savedBook = await newReqBook.save();
      client.del('req_book');
      return res.status(200).json({ message: "Book request added", book: savedBook });
    }
  } catch (error) {
    console.error("Error adding/updating book:", error);
    return res.status(500).json({ message: "Failed to add/update book request" });
  }
}

const getMostIssuedBooks = async (req, res) => {
  const { limit = 10, page = 1 } = req.query;

  try {
    const cacheKey = `mostIssuedBooks:limit=${limit}:page=${page}`;
    const cachedData = await client.get(cacheKey);

    if (cachedData) {
      console.log('Serving from cache');
      return res.status(200).send(JSON.parse(cachedData));
    }

    const userCount = await User.countDocuments();
    const books = await BookDetails.find();

    const bookIssuedPercentage = books.map(book => {
      return {
        issuePercentage: parseFloat((book.bookIssuedCount / userCount).toFixed(2)),
        book
      };
    });

    bookIssuedPercentage.sort((a, b) => b.issuePercentage - a.issuePercentage);

    const skip = (page - 1) * limit;
    const paginatedBooks = bookIssuedPercentage.slice(skip, skip + parseInt(limit));

    await client.set(cacheKey, JSON.stringify(paginatedBooks), { EX: 3600 });

    return res.status(200).send(paginatedBooks);
  } catch (error) {
    console.error("Error getting books:", error);
    return res.status(500).send("Error getting books");
  }
};


module.exports = { getBooks, issueBooks, returnBook, reqBook,getMostIssuedBooks }