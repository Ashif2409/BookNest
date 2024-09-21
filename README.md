# BookNest Backend

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
   git clone https://github.com/your-username/booknest-backend.git
   cd booknest-backend
