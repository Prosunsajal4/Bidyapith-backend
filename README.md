# 🚀 Bidyapith Backend API

<div align="center">

![Bidyapith API](https://img.shields.io/badge/Bidyapith-Backend%20API-d72050?style=for-the-badge&logo=node.js&logoColor=white)

[![Live API](https://img.shields.io/badge/⚡%20Live%20API-Vercel-000000?style=for-the-badge&logo=vercel)](https://bidyapith-backend-og5l8aweg-prosuns-projects.vercel.app)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)

**RESTful API for Bidyapith Online Learning Platform**

[⚡ Live API](https://bidyapith-backend-og5l8aweg-prosuns-projects.vercel.app) • [🌐 Frontend](https://bidyapith.web.app)

</div>

---

## ✨ Features

| Feature                   | Description                 |
| ------------------------- | --------------------------- |
| 🔐 **Firebase Auth**      | Token-based authentication  |
| 📚 **Course CRUD**        | Full course management      |
| 👨‍🎓 **Enrollments**        | Student enrollment tracking |
| 💳 **Stripe Payments**    | Secure payment processing   |
| 🗄️ **MongoDB Atlas**      | Cloud database              |
| 🌱 **30 Seed Courses**    | Pre-populated data          |
| 🔄 **In-Memory Fallback** | Works without DB            |

---

## 🛠️ Tech Stack

```
Runtime:        Node.js 18+
Framework:      Express.js 4.21
Database:       MongoDB Atlas
Authentication: Firebase Admin SDK
Payments:       Stripe
Deployment:     Vercel (Serverless)
```

---

## 📡 API Endpoints

### Public Routes

| Method | Endpoint           | Description          |
| ------ | ------------------ | -------------------- |
| `GET`  | `/`                | Server status        |
| `GET`  | `/ping`            | Health check         |
| `GET`  | `/products`        | Get all courses (30) |
| `GET`  | `/products/:id`    | Get course by ID     |
| `GET`  | `/latest-products` | Get top 6 courses    |

### Protected Routes (Requires Firebase Token)

| Method   | Endpoint                 | Description           |
| -------- | ------------------------ | --------------------- |
| `POST`   | `/my-courses`            | Add new course        |
| `GET`    | `/my-courses`            | Get user's courses    |
| `GET`    | `/enrolled-courses`      | Get enrolled courses  |
| `POST`   | `/bids`                  | Enroll in course      |
| `DELETE` | `/bids/:id`              | Cancel enrollment     |
| `POST`   | `/create-payment-intent` | Create Stripe payment |
| `POST`   | `/confirm-payment`       | Confirm payment       |
| `GET`    | `/payments`              | Payment history       |

### Authentication Header

```
Authorization: Bearer <firebase_id_token>
```

---

## 🗂️ Database Schema

### Courses

```javascript
{
  skillName: String,
  providerName: String,
  providerEmail: String,
  price: Number,
  rating: Number,
  slotsAvailable: Number,
  description: String,
  image: String,
  category: String,  // Technology, Music, Art, Language, etc.
  created_at: Date
}
```

### Enrollments

```javascript
{
  product: String,        // Course ID
  buyer_email: String,
  enrolled_at: Date,
  payment_status: String, // "paid"
  amount_paid: Number,
  paid_at: Date
}
```

---

## 🌱 Seed Data (30 Courses)

| Category   | Courses                                            |
| ---------- | -------------------------------------------------- |
| Technology | Web Dev, Python, React, Node.js, Mobile App        |
| Music      | Guitar, Piano, Violin, Drums                       |
| Language   | English, Japanese, Spanish, French                 |
| Art        | Photography, Watercolor, Oil Painting, Digital Art |
| Cooking    | Basics, Baking, Italian, Thai                      |
| Design     | Canva, UI/UX, Logo Design                          |
| Business   | Digital Marketing, Public Speaking, Finance        |
| Health     | Yoga, Fitness, Meditation                          |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas account
- Firebase project
- Stripe account

### Installation

```bash
# Clone
git clone https://github.com/prosun-sajal/bidyapith-backend.git
cd bidyapith-backend

# Install
npm install

# Configure .env
PORT=3000
MONGODB_URI=mongodb+srv://...
STRIPE_SECRET_KEY=sk_test_...
FB_SERVICE_KEY=base64_encoded_firebase_json

# Run
npm start

# Deploy to Vercel
vercel --prod
```

---

## 🔧 Environment Variables

| Variable            | Required | Description                       |
| ------------------- | -------- | --------------------------------- |
| `MONGODB_URI`       | ✅       | MongoDB connection string         |
| `STRIPE_SECRET_KEY` | ✅       | Stripe secret key                 |
| `FB_SERVICE_KEY`    | ✅       | Firebase service account (base64) |
| `PORT`              | ❌       | Server port (default: 3000)       |

---

## 📝 Example Requests

```bash
# Get all courses
curl https://bidyapith-backend-og5l8aweg-prosuns-projects.vercel.app/products

# Get single course
curl https://bidyapith-backend-og5l8aweg-prosuns-projects.vercel.app/products/seed-1

# Enroll (authenticated)
curl -X POST .../bids \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"product": "course_id"}'
```

---

## 📁 Project Structure

```
Bidyapith-backend/
├── index.js           # Main server (all routes)
├── vercel.json        # Vercel config
├── package.json       # Dependencies
├── .env               # Environment variables
├── data/
│   └── storage.json   # Fallback storage
└── utils/
    └── fileStore.js   # File persistence
```

---

## 🔗 Links

- **Live API:** https://bidyapith-backend-og5l8aweg-prosuns-projects.vercel.app
- **Frontend:** https://bidyapith.web.app
- **Frontend Repo:** [Bidyapith](../Bidyapith)

---

## 👨‍💻 Author

**Prosun Sajal**

- 📧 prosunsajal123@gmail.com
- 📱 +8801911572117
- 📍 Khulna, Bangladesh

---

<div align="center">

⭐ **Star this repo if you found it helpful!**

Made with ❤️ in Bangladesh 🇧🇩

</div>
