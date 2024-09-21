



  <div style="display: flex; align-items: center;">
    <h1 style="margin-right: 10px;">BookNest Backend</h1>
    <img src="https://pingwings.ca/wp-content/uploads/2020/12/story-time.gif" alt="Story Time" width="100" height="100" />
</div>

BookNest is a Library Management System, a sanctuary for the curious mind.  
This repository contains the backend code for the **BookNest** application, a library management system that handles user authentication, book management, fine payments, notifications, and administrative tasks like book approvals and returns.


## Features

- User authentication: signup, login, OTP verification, password reset, and logout.
- Profile management: edit profile details and profile pictures.
- Book management: issue and return books, request new books.
- Fine payments with screenshot upload.
- Notification system for overdue books and other updates.
- Admin functionalities: approving admins, viewing borrowed books, verifying and returning books.
- Redis for caching, Cloudinary for image storage (profile pictures, book covers), and email notifications using Nodemailer.
- **Docker** for containerizing the application and managing the development/production environment.

## Tech Stack

- **Node.js**: Runtime environment.
- **Express**: Web framework.
- **MongoDB**: Database for storing user, book, and request data.
- **Redis**: Caching for session management.
- **Multer**: For handling file uploads (profile pictures, book covers).
- **Cloudinary**: Image storage and management.
- **Nodemailer**: For email notifications and password reset functionality.
- **bcryptjs**: For password hashing.
- **JWT**: For secure token-based authentication.
- **Docker**: For containerization and environment consistency.

## Project Setup

### Prerequisites

- **Node.js** >= 14
- **MongoDB** installed locally or a cloud instance (e.g., MongoDB Atlas)
- **Redis** installed and running locally or through a cloud service
- **Cloudinary** account for storing images
- **Gmail** account for sending emails (can be customized for other SMTP services)
- **Docker** and **Docker Compose** installed

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Ashif2409/BookNest.git

2. Install dependencies:
    npm install

3. Set up your environment variables in a .env file:
   - CLOUD_NAME=your_cloudinary_cloud_name
   - API_KEY=your_cloudinary_api_key
   - API_SECRET_KEY=your_cloudinary_api_secret
   - FINE_PER_DAY=your_fine_per_day_value
   - SMTP_HOST=your_smtp_host
   - SMTP_PORT=your_smtp_port
   - SMTP_USER=your_smtp_user
   - SMTP_PASSWORD=your_smtp_password
   - PORT=your_port
   - MONGODB_URL_PRODUCTION=your_production_db_url
   - REDIS_HOST=your_redis_host
   - REDIS_PORT=your_redis_port

   ### Running with Docker
   1.Make sure Docker and Docker Compose are installed on your machine.
   2.Build the Docker containers:
     docker-compose up --build
   3.To run the containers in the background (detached mode):
     docker-compose up -d
   4.The application should now be running on the port defined in your .env file (default is port 8000).

   ## API Endpoints

### User Routes

- `POST /login` - Login user
- `POST /signup` - Sign up a new user (with profile picture upload)
- `POST /forget-password` - Request password reset
- `POST /verify-otp` - Verify OTP for authentication
- `PATCH /editProfilePic` - Update profile picture
- `PATCH /editProfile` - Edit user profile
- `GET /profile` - Get user profile information
- `POST /logout` - Logout from the current device
- `POST /logout/alldevice` - Logout from all devices
- `POST /fine-payment` - Submit fine payment (with screenshot upload)

### Book Routes

- `GET /topBooks` - Get the most issued books
- `GET /books` - Get all available books
- `POST /issueBook` - Issue a book
- `POST /returnBook` - Return a book
- `POST /reqBook` - Request a new book

### Admin Routes

- `GET /userBooks` - View books issued by users
- `POST /approveAdmin/:id` - Approve a new admin
- `GET /getReqBooks` - View requested books
- `DELETE /delReqBooks` - Delete requested books
- `POST /addbook` - Add a new book to the library
- `POST /verifyReturn` - Verify book return
- `GET /user-with-overdue` - View users with overdue books

## Dependencies

- `bcryptjs`: Password hashing.
- `body-parser`: Middleware for parsing request bodies.
- `cloudinary`: Cloud image storage and management.
- `cors`: Enabling CORS for cross-origin requests.
- `dotenv`: Environment variable management.
- `express`: Web framework.
- `jsonwebtoken`: JWT for secure authentication.
- `mongoose`: ODM for MongoDB.
- `multer`: File upload handling.
- `nodemailer`: Sending emails via SMTP.
- `redis`: Redis client for caching.

   
