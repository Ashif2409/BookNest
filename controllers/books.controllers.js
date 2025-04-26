const BookDetails = require("../db/models/book.model")
const ReqBook = require("../db/models/req.model")
const User = require("../db/models/user.model")
const { client } = require("../Service/redis")

// Get books with pagination and filtering
const getBooks = async (req, res) => {
  const { limit = 10, page = 1 } = req.query;
  const { bookname, author, genre, language } = req.body;

  const safeRedisOperation = async (operation, fallback) => {
    try {
      return await operation();
    } catch (redisError) {
      console.error("Redis operation failed:", redisError);
      return fallback;
    }
  };

  try {
    const query = {};

    if (bookname) query.bookname = { $regex: bookname, $options: "i" };
    if (author) query.author = { $regex: author, $options: "i" };
    if (genre) query.genre = genre;
    if (language) query.language = language;
    query.number_of_copies = { $gt: 0 };

    // Create cache key based on query, not on page/limit
    const cacheKey = `books:${JSON.stringify(query)}`;

    // Try getting from Redis cache
    const cachedData = await safeRedisOperation(() => client.get(cacheKey), null);
    if (cachedData) {
      const books = JSON.parse(cachedData);
      const paginatedBooks = books.slice((page - 1) * limit, page * limit);
      return res.status(200).send({ books: paginatedBooks });
    }

    // Query MongoDB and cache the full result
    const booksFromDB = await BookDetails.find(query).exec();

    // Cache the full filtered result for later use
    await safeRedisOperation(() => client.set(cacheKey, JSON.stringify(booksFromDB), { EX: 3600 }), null);

    const paginatedBooks = booksFromDB.slice((page - 1) * limit, page * limit);

    if (paginatedBooks.length > 0) {
      res.status(200).send({ books: paginatedBooks });
    } else {
      res.status(404).send({ message: "No books available" });
    }
  } catch (error) {
    console.error("Error fetching books:", error);
    res.status(500).send({ message: "Internal server error" });
  }
};

// Get book by ID
const getBookById = async (req, res) => {
  const { id } = req.params

  try {
    const cacheKey = `bookId:${id}`

    // Try to get book from Redis cache
    let cachedBook = null
    try {
      cachedBook = await client.get(cacheKey)
    } catch (redisError) {
      console.error("Redis error during book cache retrieval by ID:", redisError)
    }

    if (cachedBook) {
      const parsedBook = JSON.parse(cachedBook)
      return res.status(200).json({ book: parsedBook, fromCache: true })
    }

    // Fallback to MongoDB if not found in cache
    const book = await BookDetails.findById(id)
    if (!book) {
      return res.status(404).json({ message: "Book not found" })
    }

    // Store in Redis for future requests
    try {
      await client.set(cacheKey, JSON.stringify(book), { EX: 3600 }) // 1 hour expiration
    } catch (redisError) {
      console.error("Redis error during book cache set by ID:", redisError)
    }

    res.status(200).json({ book, fromCache: false })
  } catch (error) {
    console.error("Error fetching book by ID:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// Issue books to users
const issueBooks = async (req, res) => {
  const { book } = req.body;
  const user = req.user;

  try {
    const countUnreturnedBooks = (user, book) => {
      if (!user || !user.bookBorrow) return 0;
      return user.bookBorrow.filter(
        (userBook) => userBook.bookname === book && !userBook.returned
      ).length;
    };

    if (countUnreturnedBooks(user, book) >= 2) {
      return res.status(400).json({
        message: "You can't borrow more than 2 copies of the same book",
      });
    }

    let cachedBook = null;
    try {
      cachedBook = await client.get(`bookname:${book}`);
    } catch (redisError) {
      console.error("Redis error during book cache retrieval:", redisError);
    }

    let issueBook;
    if (cachedBook) {
      const issueBookDetail = JSON.parse(cachedBook);
      issueBook = new BookDetails(issueBookDetail);
      issueBook._id = issueBookDetail._id;
    } else {
      issueBook = await BookDetails.findOne({ bookname: book });
      if (issueBook) {
        try {
          await client.set(`bookname:${book}`, JSON.stringify(issueBook), { EX: 3600 });
        } catch (redisError) {
          console.error("Redis error during book cache setting:", redisError);
        }
      }
    }

    if (!issueBook || issueBook.number_of_copies === 0) {
      try {
        await client.del(`bookname:${book}`);
      } catch (redisError) {
        console.error("Redis error during book cache deletion:", redisError);
      }
      return res.status(404).json({
        message: "Book not available for borrowing",
        books: user.bookBorrow,
      });
    }

    if (
      user.bookBorrow.some(
        (borrowedBook) => borrowedBook.bookname === book && !borrowedBook.returned
      )
    ) {
      return res.status(409).json({
        message: "You cannot borrow the same book again before returning it",
      });
    }

    const hasPendingFine = user.bookBorrow.some((borrowedBook) => borrowedBook.fine > 0);
    if (hasPendingFine) {
      return res.status(400).json({
        message: "First pay the outstanding fines before borrowing more books.",
      });
    }

    issueBook.number_of_copies--;
    issueBook.bookIssuedCount++;
    issueBook.borrower.push(user._id);
    await issueBook.save();

    try {
      await client.set(`bookname:${book}`, JSON.stringify(issueBook), { EX: 3600 });
    } catch (redisError) {
      console.error("Redis error during book cache setting:", redisError);
    }

    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - 1);
    const dueDate = currentDate.toISOString().split("T")[0];

    user.bookBorrow.push({
      bookname: book,
      Due_Date: dueDate,
      fine: 0,
      IssueDate: new Date().toISOString().split("T")[0],
      bookId: issueBook._id,
    });

    await user.save();

    // ✅ Delete user cache to ensure fresh data in viewUserBooks
    try {
      await client.del(`userById:${user._id}`);
    } catch (redisError) {
      console.error("Redis error during user cache deletion:", redisError);
    }

    res.status(200).json({
      message: "Book issued successfully",
      books: user.bookBorrow,
    });
  } catch (error) {
    console.error("Error issuing book:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Return books
const returnBook = async (req, res) => {
  const { bookId } = req.body;
  const user = req.user;

  try {
    const borrowedBook = user.bookBorrow.find(
      (userBook) => userBook.bookId.toString() === bookId && !userBook.returned
    );

    if (!borrowedBook) {
      return res.status(404).json({ message: "Book not found in user's borrowed list" });
    }

    if (borrowedBook.fine > 0) {
      return res.status(400).json({ message: `Please pay the fine of ${borrowedBook.fine} first` });
    }

    borrowedBook.returned = true;
    await user.save();

    // Invalidate user cache
    try {
      await client.del('users');
    } catch (redisError) {
      console.error("Redis error during user cache deletion:", redisError);
    }

    let cachedBook = null;
    try {
      cachedBook = await client.get(`book:${bookId}`);
      await client.del(`book:${bookId}`);
      await client.del(`books`);
    } catch (redisError) {
      console.error("Redis error during book cache retrieval:", redisError);
    }

    let issueBook;

    if (cachedBook) {
      issueBook = JSON.parse(cachedBook);
    } else {
      issueBook = await BookDetails.findByIdAndUpdate(
        bookId,
        { $inc: { number_of_copies: 1 }, $pull: { borrower: user._id } },
        { new: true }
      );
    }

    if (!issueBook) {
      return res.status(404).json({ message: "Book not found in library" });
    }

    // If book was cached, also update database
    if (cachedBook) {
      await BookDetails.updateOne(
        { _id: bookId },
        { $inc: { number_of_copies: 1 }, $pull: { borrower: user._id } }
      );
    }

    // Cache the updated book again
    try {
      await client.set(`book:${bookId}`, JSON.stringify(issueBook), { EX: 3600 });
    } catch (redisError) {
      console.error("Redis error during book cache setting:", redisError);
    }

    res.status(200).json({ message: "Book returned successfully" });

  } catch (error) {
    console.error("Error returning book:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};




// Request a book
const reqBook = async (req, res) => {
  const { bookname, author, genre, language } = req.body
  try {
    if (!bookname || !author) {
      return res.status(400).send("Give a valid author and bookname")
    }

    let cachedBook = null
    try {
      cachedBook = await client.get(`bookname:${bookname}`)
    } catch (redisError) {
      console.error("Redis error during book cache retrieval:", redisError)
      // Continue execution without failing
    }
    let existingBook

    if (cachedBook) {
      const issueBookDetail = JSON.parse(cachedBook)
      existingBook = new BookDetails(issueBookDetail)
      existingBook._id = issueBookDetail._id
    } else {
      existingBook = await BookDetails.findOne({ bookname })
      if (existingBook) {
        try {
          await client.set(`bookname:${bookname}`, JSON.stringify(existingBook), { EX: 3600 })
        } catch (redisError) {
          console.error("Redis error during book cache setting:", redisError)
          // Continue execution without failing
        }
      }
    }

    if (existingBook && existingBook.number_of_copies > 0) {
      return res.status(200).json({ message: "Book is already available in Library", book: existingBook })
    }

    const requestedBook = await ReqBook.findOne({ bookname, author })

    if (requestedBook && requestedBook.userRequested.some((userId) => userId.equals(req.user._id))) {
      return res.status(400).send("You have already requested this book")
    }

    if (requestedBook) {
      if (!requestedBook.userRequested) requestedBook.userRequested = []
      requestedBook.userRequested.push(req.user._id)
      requestedBook.number_of_request += 1
      await requestedBook.save()
      return res.status(200).json({ message: "Book is added to requested book DB", book: requestedBook })
    } else {
      const newReqBook = new ReqBook({
        bookname,
        author,
        number_of_request: 1,
        genre,
        language,
        userRequested: [req.user._id],
      })
      const savedBook = await newReqBook.save()
      try {
        await client.del("req_book")
      } catch (redisError) {
        console.error("Redis error during req_book cache deletion:", redisError)
        // Continue execution without failing
      }
      return res.status(200).json({ message: "Book request added", book: savedBook })
    }
  } catch (error) {
    console.error("Error adding/updating book:", error)
    return res.status(500).json({ message: "Failed to add/update book request" })
  }
}

// Get most issued books
const getMostIssuedBooks = async (req, res) => {
  const { limit = 10, page = 1 } = req.query

  try {
    const cacheKey = `mostIssuedBooks:limit=${limit}:page=${page}`
    let cachedData = null
    try {
      cachedData = await client.get(cacheKey)
    } catch (redisError) {
      console.error("Redis error during mostIssuedBooks cache retrieval:", redisError)
      // Continue execution without failing
    }

    if (cachedData) {
      return res.status(200).send(JSON.parse(cachedData))
    }

    const userCount = await User.countDocuments()
    const mostIssuedBooks = await BookDetails.find()
      .sort({ bookIssuedCount: -1 })
      .limit(Number.parseInt(limit))
      .skip((Number.parseInt(page) - 1) * Number.parseInt(limit))

    try {
      await client.set(cacheKey, JSON.stringify(mostIssuedBooks), { EX: 3600 })
    } catch (redisError) {
      console.error("Redis error during mostIssuedBooks cache setting:", redisError)
      // Continue execution without failing
    }

    return res.status(200).send({
      mostIssuedBooks,
      totalBooks: userCount,
      totalPages: Math.ceil(userCount / limit),
      currentPage: Number.parseInt(page),
    })
  } catch (error) {
    console.error("Error fetching most issued books:", error)
    res.status(500).send({ message: "Internal server error" })
  }
}

const getUserBooksById = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from request parameters

    // Find the user by their ID and populate the bookBorrow array
    const user = await User.findById(userId).populate({
      path: 'bookBorrow.bookId', // Populate the bookId field from bookBorrow
      select: 'bookname Due_Date fine returned verifyReturn IssueDate' // You can select specific fields from the Books collection
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get the bookBorrow details
    const bookBorrowDetails = user.bookBorrow.map(book => ({
      bookname: book.bookId.bookname,
      Due_Date: book.Due_Date,
      fine: book.fine,
      returned: book.returned,
      verifyReturn: book.verifyReturn,
      IssueDate: book.IssueDate,
      bookId: book.bookId._id,
    }));

    return res.status(200).json(bookBorrowDetails); // Send the book borrow details in response

  } catch (error) {
    console.error("Error fetching user books:", error);
    return res.status(500).json({ message: "Failed to fetch user books" }); // Send error response
  }
};


module.exports = {
  getBooks,
  issueBooks,
  returnBook,
  reqBook,
  getMostIssuedBooks,
  getBookById,
  getUserBooksById
}
