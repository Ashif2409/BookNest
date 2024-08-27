const express=require('express');
const { auth, authorize } = require('../middleware/auth');
const router=express.Router();
const upload = require('../middleware/multer')
const { viewUserBooks,
        getUsersWhoBorrowedBook,
        viewReqBooks,
        addBookToLib,
        approveAdmin,
        deleteReqBook,
        ReturnBooks,
        verifyReturnBook } = require('../controllers/admin.controllers');


// router.use(auth)

router.get("/userBooks",auth,authorize(["Admin"]),viewUserBooks );

router.post("/approveAdmin/:id",auth,authorize(["Admin"]),approveAdmin);
  
router.get('/books',auth,authorize(["Admin"]),getUsersWhoBorrowedBook)
  
router.get('/getReqBooks',auth,authorize(["Admin"]),viewReqBooks)

router.delete('/delReqBooks',auth,authorize(["Admin"]),upload.single('BookProfile'),deleteReqBook);

router.post('/addbook',auth,authorize(["Admin"]),upload.single('BookProfile'),addBookToLib);

router.get('/confirmReturn',auth,authorize(["Admin"]),ReturnBooks);

router.post('/verifyReturn',auth,authorize(["Admin"]),verifyReturnBook);
  
module.exports=router