require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const main = require('./db/connection');
const app = express();
const port = process.env.PORT || 8000;

// middlewares
app.use(cors());
app.use(bodyParser.json());

// Database Connection
main().catch(err => console.log(err));

// Routes
const userRoutes = require('./Routes/Users.routes');
const bookRoutes = require('./Routes/Book.routes');
const adminRoutes = require('./Routes/Admin.routes');
const dueDateCheck = require('./Service/node-cron');

dueDateCheck();
app.use('/user', userRoutes);
app.use('/book', bookRoutes);
app.use('/admin', adminRoutes);

//redis connection
const {connectToRedis} = require('./Service/redis');
connectToRedis()

app.listen(port, () => console.log(`Server is running on port ${port}`));
