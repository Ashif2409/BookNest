const multer = require('multer');
const path = require('path');

const imgPath = path.join(__dirname, '../public/profileImg');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const filename=file.originalname
    if(!/\.jpe?g$|\.png$/i.test(filename)){
      return cb(new Error('Please upload a JPEG or PNG image'), null);
    }
    cb(null, imgPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
