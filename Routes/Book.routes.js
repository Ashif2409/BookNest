const express=require('express');
const router=express.Router();
const { auth } = require('../middleware/auth');
const { getBooks,
     issueBooks,
      returnBook,
       reqBook,
       getMostIssuedBooks} = require('../controllers/books.controllers');


router.use(auth);
router.get('/topBooks',getMostIssuedBooks);
router.get('/books' ,getBooks);
router.post('/issueBook', issueBooks);
router.post('/returnBook', returnBook);
router.post('/reqBook', reqBook);

module.exports=router