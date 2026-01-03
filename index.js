const express = require("express");
const cors = require("cors");
require("dotenv").config();
// JWT removed: using Firebase token verification instead of custom JWTs
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

// Stripe initialization
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// allow overriding the firebase admin key path via env, default to existing file
const serviceAccountPath =
  process.env.FIREBASE_KEY_PATH || "./Bidyapith_main_firebase_key.json";

let firebaseAdminReady = false;
try {
  if (admin.apps && admin.apps.length) {
    firebaseAdminReady = true;
  } else {
    // Prefer env var for serverless deployments (Vercel)
    const serviceAccountJson =
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FB_SERVICE_KEY;
    if (serviceAccountJson) {
      const parseServiceAccount = (raw) => {
        const trimmed = String(raw || "").trim();
        if (!trimmed) throw new Error("empty service account value");

        try {
          return JSON.parse(trimmed);
        } catch {}

        // Some platforms store secrets as base64(JSON)
        try {
          const decoded = Buffer.from(trimmed, "base64").toString("utf8");
          return JSON.parse(decoded);
        } catch {}

        throw new Error("service account must be JSON or base64-encoded JSON");
      };

      const serviceAccount = parseServiceAccount(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseAdminReady = true;
    } else {
      // Fallback to local file path. This file is intentionally gitignored.
      const serviceAccount = require(serviceAccountPath);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseAdminReady = true;
    }
  }
} catch (e) {
  firebaseAdminReady = false;
  console.error(
    "❌ Firebase Admin SDK init failed. Set FIREBASE_SERVICE_ACCOUNT_JSON (preferred) / FB_SERVICE_KEY, or FIREBASE_KEY_PATH.",
    e?.message
  );
}

// middleware
app.use(cors());
app.use(express.json());

// Request logger to trace all incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const logger = (req, res, next) => {
  console.log("logging information");
  next();
};

const verifyFireBaseToken = async (req, res, next) => {
  if (!firebaseAdminReady) {
    return res.status(500).send({
      message:
        "Firebase Admin is not configured on the server. Set FIREBASE_SERVICE_ACCOUNT_JSON (preferred) / FB_SERVICE_KEY, or FIREBASE_KEY_PATH and restart the backend.",
    });
  }
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  // verify token
  try {
    const userInfo = await admin.auth().verifyIdToken(token);
    req.token_email = userInfo.email;
    if (process.env.NODE_ENV !== "production") {
      console.log("after token validation", {
        email: userInfo.email,
        uid: userInfo.uid,
      });
    }
    next();
  } catch {
    console.log("invalid token");
    return res.status(401).send({ message: "unauthorized access" });
  }
};

// verifyJWTToken removed: using Firebase ID tokens instead

// Support full connection string from env (MONGODB_URI) or fall back to DB_USER/DB_PASS
let uri = process.env.MONGODB_URI || "";
if (!uri) {
  const user = process.env.DB_USER;
  const pass = process.env.DB_PASS;
  if (user && pass) {
    // Add recommended options for Atlas
    uri = `mongodb+srv://${user}:${pass}@cluster0.vyznij5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
  }
}
// Default to local dev if nothing provided
if (!uri) {
  uri = "mongodb://127.0.0.1:27017/smart_db";
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10000, // 10 second timeout
  socketTimeoutMS: 45000,
  // Try to improve TLS compatibility with Atlas on some Node/OpenSSL combos
  tls: uri.startsWith("mongodb+srv://") ? true : undefined,
});

// Shared collection holders and readiness flag
let productsCollection = null;
let bidsCollection = null;
let usersCollection = null;
let dbReady = true; // Start with true to enable in-memory mode immediately

// In-memory storage for development (fallback if MongoDB fails)
const inMemoryDB = {
  courses: [],
  enrollments: [],
  users: [],
};

// File persistence when MongoDB is unavailable
const fileStore = require("./utils/fileStore");
(function bootstrapFromFile() {
  const snapshot = fileStore.load();
  if (snapshot && snapshot.courses && Array.isArray(snapshot.courses)) {
    inMemoryDB.courses = snapshot.courses;
    inMemoryDB.enrollments = Array.isArray(snapshot.enrollments)
      ? snapshot.enrollments
      : [];
    inMemoryDB.users = Array.isArray(snapshot.users) ? snapshot.users : [];
    console.log(
      `💾 Loaded ${inMemoryDB.courses.length} courses from file store`
    );
  }
})();

// Seed dataset (30 courses for portfolio)
const seedCourses = [
  {
    _id: "seed-1",
    skillName: "Beginner Guitar Lessons",
    providerName: "Alex Martin",
    providerEmail: "alex@skillswap.com",
    price: 20,
    rating: 4.8,
    slotsAvailable: 3,
    description:
      "Acoustic guitar classes for complete beginners. Learn chords, strumming patterns, and play your first songs.",
    image: "https://images.pexels.com/photos/164821/pexels-photo-164821.jpeg",
    category: "Music",
    created_at: new Date(),
  },
  {
    _id: "seed-2",
    skillName: "Spoken English Practice",
    providerName: "Sara Hossain",
    providerEmail: "sara@skillswap.com",
    price: 10,
    rating: 4.6,
    slotsAvailable: 5,
    description:
      "Conversational English sessions for non-native speakers. Improve fluency and confidence.",
    image: "https://images.pexels.com/photos/3861969/pexels-photo-3861969.jpeg",
    category: "Language",
    created_at: new Date(),
  },
  {
    _id: "seed-3",
    skillName: "Basic Photography Workshop",
    providerName: "John Ray",
    providerEmail: "john@skillswap.com",
    price: 15,
    rating: 4.7,
    slotsAvailable: 4,
    description:
      "Learn the fundamentals of photography and camera handling. Master composition and lighting.",
    image: "https://images.pexels.com/photos/3184323/pexels-photo-3184323.jpeg",
    category: "Art",
    created_at: new Date(),
  },
  {
    _id: "seed-4",
    skillName: "Cooking for Beginners",
    providerName: "Nadia Rahman",
    providerEmail: "nadia@skillswap.com",
    price: 12,
    rating: 4.9,
    slotsAvailable: 6,
    description:
      "Learn to cook simple and delicious everyday meals. From basics to impressive dishes.",
    image: "https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg",
    category: "Cooking",
    created_at: new Date(),
  },
  {
    _id: "seed-5",
    skillName: "Web Development Basics",
    providerName: "Rahul Das",
    providerEmail: "rahul@skillswap.com",
    price: 25,
    rating: 4.8,
    slotsAvailable: 5,
    description:
      "Learn HTML, CSS, and JavaScript to build your first website. Hands-on projects included.",
    image: "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg",
    category: "Technology",
    created_at: new Date(),
  },
  {
    _id: "seed-6",
    skillName: "Graphic Design with Canva",
    providerName: "Lina Chowdhury",
    providerEmail: "lina@skillswap.com",
    price: 8,
    rating: 4.5,
    slotsAvailable: 10,
    description:
      "Create eye-catching social media graphics using Canva. No design experience needed.",
    image: "https://images.pexels.com/photos/267389/pexels-photo-267389.jpeg",
    category: "Design",
    created_at: new Date(),
  },
  {
    _id: "seed-7",
    skillName: "Python Programming",
    providerName: "Amit Sharma",
    providerEmail: "amit@skillswap.com",
    price: 30,
    rating: 4.9,
    slotsAvailable: 8,
    description:
      "Master Python from scratch. Learn syntax, data structures, and build real projects.",
    image: "https://images.pexels.com/photos/1181671/pexels-photo-1181671.jpeg",
    category: "Technology",
    created_at: new Date(),
  },
  {
    _id: "seed-8",
    skillName: "Digital Marketing Fundamentals",
    providerName: "Priya Patel",
    providerEmail: "priya@skillswap.com",
    price: 22,
    rating: 4.7,
    slotsAvailable: 12,
    description:
      "Learn SEO, social media marketing, and PPC advertising to grow any business online.",
    image: "https://images.pexels.com/photos/905163/pexels-photo-905163.jpeg",
    category: "Business",
    created_at: new Date(),
  },
  {
    _id: "seed-9",
    skillName: "Yoga for Beginners",
    providerName: "Maya Singh",
    providerEmail: "maya@skillswap.com",
    price: 15,
    rating: 4.8,
    slotsAvailable: 15,
    description:
      "Start your yoga journey with basic poses, breathing techniques, and meditation.",
    image: "https://images.pexels.com/photos/3822622/pexels-photo-3822622.jpeg",
    category: "Health",
    created_at: new Date(),
  },
  {
    _id: "seed-10",
    skillName: "Piano Lessons",
    providerName: "David Chen",
    providerEmail: "david@skillswap.com",
    price: 28,
    rating: 4.6,
    slotsAvailable: 4,
    description:
      "Learn piano from basics to intermediate level. Read music and play classical pieces.",
    image: "https://images.pexels.com/photos/1246437/pexels-photo-1246437.jpeg",
    category: "Music",
    created_at: new Date(),
  },
  {
    _id: "seed-11",
    skillName: "Japanese Language Course",
    providerName: "Yuki Tanaka",
    providerEmail: "yuki@skillswap.com",
    price: 18,
    rating: 4.9,
    slotsAvailable: 6,
    description:
      "Learn Japanese from hiragana to conversational level. Includes cultural insights.",
    image: "https://images.pexels.com/photos/5428836/pexels-photo-5428836.jpeg",
    category: "Language",
    created_at: new Date(),
  },
  {
    _id: "seed-12",
    skillName: "Watercolor Painting",
    providerName: "Emma Wilson",
    providerEmail: "emma@skillswap.com",
    price: 16,
    rating: 4.7,
    slotsAvailable: 8,
    description:
      "Master watercolor techniques. Paint beautiful landscapes and portraits.",
    image: "https://images.pexels.com/photos/1183992/pexels-photo-1183992.jpeg",
    category: "Art",
    created_at: new Date(),
  },
  {
    _id: "seed-13",
    skillName: "Baking Masterclass",
    providerName: "Sophie Baker",
    providerEmail: "sophie@skillswap.com",
    price: 20,
    rating: 4.8,
    slotsAvailable: 10,
    description:
      "Learn to bake bread, cakes, and pastries like a professional.",
    image: "https://images.pexels.com/photos/1775043/pexels-photo-1775043.jpeg",
    category: "Cooking",
    created_at: new Date(),
  },
  {
    _id: "seed-14",
    skillName: "React.js Development",
    providerName: "Kevin Brown",
    providerEmail: "kevin@skillswap.com",
    price: 35,
    rating: 4.9,
    slotsAvailable: 7,
    description:
      "Build modern web apps with React.js. Hooks, Redux, and real-world projects.",
    image:
      "https://images.pexels.com/photos/11035471/pexels-photo-11035471.jpeg",
    category: "Technology",
    created_at: new Date(),
  },
  {
    _id: "seed-15",
    skillName: "UI/UX Design Principles",
    providerName: "Anna Lee",
    providerEmail: "anna@skillswap.com",
    price: 25,
    rating: 4.6,
    slotsAvailable: 9,
    description:
      "Learn user interface and experience design. Figma, prototyping, and user research.",
    image: "https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg",
    category: "Design",
    created_at: new Date(),
  },
  {
    _id: "seed-16",
    skillName: "Public Speaking Mastery",
    providerName: "Michael Ford",
    providerEmail: "michael@skillswap.com",
    price: 19,
    rating: 4.8,
    slotsAvailable: 12,
    description:
      "Overcome stage fright and deliver powerful presentations with confidence.",
    image: "https://images.pexels.com/photos/2774556/pexels-photo-2774556.jpeg",
    category: "Business",
    created_at: new Date(),
  },
  {
    _id: "seed-17",
    skillName: "Fitness & Strength Training",
    providerName: "James Miller",
    providerEmail: "james@skillswap.com",
    price: 22,
    rating: 4.7,
    slotsAvailable: 20,
    description:
      "Build muscle and improve fitness with personalized workout plans.",
    image: "https://images.pexels.com/photos/841130/pexels-photo-841130.jpeg",
    category: "Health",
    created_at: new Date(),
  },
  {
    _id: "seed-18",
    skillName: "Violin for Beginners",
    providerName: "Isabella Romano",
    providerEmail: "isabella@skillswap.com",
    price: 32,
    rating: 4.5,
    slotsAvailable: 3,
    description:
      "Start your violin journey. Learn proper technique and play beautiful melodies.",
    image: "https://images.pexels.com/photos/111287/pexels-photo-111287.jpeg",
    category: "Music",
    created_at: new Date(),
  },
  {
    _id: "seed-19",
    skillName: "Spanish Language Course",
    providerName: "Carlos Garcia",
    providerEmail: "carlos@skillswap.com",
    price: 14,
    rating: 4.8,
    slotsAvailable: 10,
    description:
      "Learn Spanish for travel or work. From basics to conversational fluency.",
    image: "https://images.pexels.com/photos/4386426/pexels-photo-4386426.jpeg",
    category: "Language",
    created_at: new Date(),
  },
  {
    _id: "seed-20",
    skillName: "Oil Painting Techniques",
    providerName: "Vincent Moore",
    providerEmail: "vincent@skillswap.com",
    price: 24,
    rating: 4.9,
    slotsAvailable: 5,
    description:
      "Master oil painting from canvas preparation to creating stunning artworks.",
    image: "https://images.pexels.com/photos/1269968/pexels-photo-1269968.jpeg",
    category: "Art",
    created_at: new Date(),
  },
  {
    _id: "seed-21",
    skillName: "Italian Cuisine Cooking",
    providerName: "Marco Rossi",
    providerEmail: "marco@skillswap.com",
    price: 26,
    rating: 4.7,
    slotsAvailable: 8,
    description:
      "Cook authentic Italian dishes. Pasta, risotto, pizza and more from scratch.",
    image: "https://images.pexels.com/photos/1279330/pexels-photo-1279330.jpeg",
    category: "Cooking",
    created_at: new Date(),
  },
  {
    _id: "seed-22",
    skillName: "Node.js Backend Development",
    providerName: "Chris Anderson",
    providerEmail: "chris@skillswap.com",
    price: 32,
    rating: 4.8,
    slotsAvailable: 6,
    description:
      "Build scalable backend APIs with Node.js, Express, and MongoDB.",
    image: "https://images.pexels.com/photos/546819/pexels-photo-546819.jpeg",
    category: "Technology",
    created_at: new Date(),
  },
  {
    _id: "seed-23",
    skillName: "Logo Design Workshop",
    providerName: "Sarah Kim",
    providerEmail: "sarah@skillswap.com",
    price: 18,
    rating: 4.6,
    slotsAvailable: 11,
    description:
      "Create professional logos and brand identities using Adobe Illustrator.",
    image: "https://images.pexels.com/photos/1779487/pexels-photo-1779487.jpeg",
    category: "Design",
    created_at: new Date(),
  },
  {
    _id: "seed-24",
    skillName: "Financial Planning Basics",
    providerName: "Robert Taylor",
    providerEmail: "robert@skillswap.com",
    price: 20,
    rating: 4.9,
    slotsAvailable: 15,
    description:
      "Learn personal finance, budgeting, investing, and retirement planning.",
    image: "https://images.pexels.com/photos/4386431/pexels-photo-4386431.jpeg",
    category: "Business",
    created_at: new Date(),
  },
  {
    _id: "seed-25",
    skillName: "Meditation & Mindfulness",
    providerName: "Lisa Zen",
    providerEmail: "lisa@skillswap.com",
    price: 12,
    rating: 4.8,
    slotsAvailable: 25,
    description:
      "Reduce stress and improve focus with guided meditation techniques.",
    image: "https://images.pexels.com/photos/3822621/pexels-photo-3822621.jpeg",
    category: "Health",
    created_at: new Date(),
  },
  {
    _id: "seed-26",
    skillName: "Drums & Percussion",
    providerName: "Tony Beat",
    providerEmail: "tony@skillswap.com",
    price: 24,
    rating: 4.7,
    slotsAvailable: 4,
    description:
      "Learn drum basics, rhythm patterns, and play along with your favorite songs.",
    image: "https://images.pexels.com/photos/995301/pexels-photo-995301.jpeg",
    category: "Music",
    created_at: new Date(),
  },
  {
    _id: "seed-27",
    skillName: "French Language Course",
    providerName: "Marie Dupont",
    providerEmail: "marie@skillswap.com",
    price: 16,
    rating: 4.6,
    slotsAvailable: 8,
    description:
      "Learn French for travel, culture, or career. Pronunciation and grammar included.",
    image:
      "https://images.pexels.com/photos/2363/france-landmark-lights-night.jpg",
    category: "Language",
    created_at: new Date(),
  },
  {
    _id: "seed-28",
    skillName: "Digital Illustration",
    providerName: "Alex Art",
    providerEmail: "alexart@skillswap.com",
    price: 22,
    rating: 4.8,
    slotsAvailable: 7,
    description: "Create stunning digital art using Procreate and Photoshop.",
    image: "https://images.pexels.com/photos/1762851/pexels-photo-1762851.jpeg",
    category: "Art",
    created_at: new Date(),
  },
  {
    _id: "seed-29",
    skillName: "Thai Cooking Class",
    providerName: "Siri Thongchai",
    providerEmail: "siri@skillswap.com",
    price: 18,
    rating: 4.9,
    slotsAvailable: 6,
    description:
      "Cook authentic Thai dishes. Pad Thai, green curry, tom yum and more.",
    image: "https://images.pexels.com/photos/699953/pexels-photo-699953.jpeg",
    category: "Cooking",
    created_at: new Date(),
  },
  {
    _id: "seed-30",
    skillName: "Mobile App Development",
    providerName: "Dev Kumar",
    providerEmail: "dev@skillswap.com",
    price: 38,
    rating: 4.8,
    slotsAvailable: 5,
    description:
      "Build iOS and Android apps with React Native. Deploy to app stores.",
    image: "https://images.pexels.com/photos/607812/pexels-photo-607812.jpeg",
    category: "Technology",
    created_at: new Date(),
  },
];

function seedIfEmpty() {
  // If MongoDB connected, do not seed automatically (avoid duplicate data)
  if (productsCollection) return;
  if (inMemoryDB.courses.length === 0) {
    inMemoryDB.courses = seedCourses.map((c) => ({ ...c }));
    fileStore.save(inMemoryDB);
    console.log(`🌱 Seeded ${inMemoryDB.courses.length} in-memory courses`);
  }
}

// Connect to MongoDB
async function connectDB() {
  console.log("🔄 Attempting to connect to MongoDB...");
  try {
    await client.connect();
    console.log("🔗 MongoDB client connected!");
    const db = client.db("smart_db");
    productsCollection = db.collection("courses");
    bidsCollection = db.collection("enrollments");
    usersCollection = db.collection("users");
    dbReady = true;
    console.log(
      "✅ MongoDB connected! Collections ready: courses, enrollments, users"
    );
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // If MongoDB courses collection is empty, seed it with starter data
    const count = await productsCollection.countDocuments();
    if (count === 0) {
      console.log("📭 MongoDB courses collection is empty. Seeding...");
      // Use in-memory courses if they exist (e.g. loaded from storage.json), else use seedCourses
      const toSeed =
        inMemoryDB.courses.length > 0 ? inMemoryDB.courses : seedCourses;
      // Convert _id strings to proper format for insertion
      const toInsert = toSeed.map((c) => {
        const doc = { ...c };
        // Remove string _id so MongoDB generates ObjectId, but keep original as legacyId
        if (typeof doc._id === "string") {
          doc.legacyId = doc._id;
          delete doc._id;
        }
        return doc;
      });
      const result = await productsCollection.insertMany(toInsert);
      console.log(`🌱 Seeded ${result.insertedCount} courses into MongoDB`);
    }
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    console.log("⚠️  Running in IN-MEMORY MODE (data won't persist)");
    dbReady = true; // Enable routes with in-memory storage
  }
}

// Start DB connection (non-blocking)
console.log("📞 Calling connectDB()...");
connectDB();
// Immediately seed in-memory list so frontend cards appear
seedIfEmpty();

// ============================================
// ROUTES - ALL REGISTERED BEFORE SERVER START
// ============================================

app.get("/", (req, res) => {
  res.send("Smart server is running");
});

// Basic health check endpoint
app.get("/ping", (req, res) => {
  res.send("pong");
});

// DB status debug endpoint
app.get("/debug/db-status", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send({ message: "not found" });
  }
  res.send({
    uri: uri.replace(/:\w+@/, ":***@"), // mask password in logs
    productsCollection: Boolean(productsCollection),
    bidsCollection: Boolean(bidsCollection),
    usersCollection: Boolean(usersCollection),
    dbReady,
    node: process.version,
  });
});

// Debug helpers (non-prod): seed and clear in-memory data
app.get("/debug/seed-course", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send({ message: "not found" });
  }
  const course = {
    _id: "mem-course-" + Date.now(),
    name: "Seeded Course",
    price: 99,
    email: "seed@example.com",
    created_at: new Date(),
  };
  inMemoryDB.courses.push(course);
  fileStore.save(inMemoryDB);
  res.send({ message: "seeded", course });
});

app.get("/debug/clear", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send({ message: "not found" });
  }
  inMemoryDB.courses = [];
  inMemoryDB.enrollments = [];
  inMemoryDB.users = [];
  fileStore.save(inMemoryDB);
  res.send({ message: "cleared" });
});

// USERS APIs
app.post("/users", async (req, res) => {
  if (!dbReady) return res.status(503).send({ message: "Database not ready" });

  const newUser = req.body;
  const email = req.body.email;
  const query = { email: email };
  const existingUser = await usersCollection.findOne(query);

  if (existingUser) {
    res.send({
      message: "user already exits. do not need to insert again",
    });
  } else {
    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  }
});

// COURSES/PRODUCTS APIs - GET all courses
app.get("/products", async (req, res) => {
  console.log("📚 GET /products - query:", req.query);
  const email = req.query.email;
  const query = {};
  if (email) {
    query.email = email;
  }

  if (productsCollection) {
    const cursor = productsCollection.find(query);
    const result = await cursor.toArray();
    console.log(`✅ Returning ${result.length} courses`);
    return res.send(result);
  }

  // In-memory fallback
  const result = inMemoryDB.courses.filter((c) =>
    query.email ? c.email === query.email : true
  );
  console.log(`✅ (memory) Returning ${result.length} courses`);
  res.send(result);
});

// GET latest courses (top 6 by creation date)
app.get("/latest-products", async (req, res) => {
  console.log("🔥 GET /latest-products");
  if (productsCollection) {
    const cursor = productsCollection.find().sort({ created_at: -1 }).limit(6);
    const result = await cursor.toArray();
    console.log(`✅ Returning ${result.length} latest courses`);
    return res.send(result);
  }
  // In-memory fallback - latest 6 by created_at
  const sorted = [...inMemoryDB.courses].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
  const result = sorted.slice(0, 6);
  console.log(`✅ (memory) Returning ${result.length} latest courses`);
  res.send(result);
});

// GET single course by ID
app.get("/products/:id", async (req, res) => {
  const id = req.params.id;
  console.log("🔍 GET /products/:id -", id);

  if (productsCollection) {
    try {
      // Try to find by ObjectId first
      let result = null;
      try {
        const query = { _id: new ObjectId(id) };
        result = await productsCollection.findOne(query);
      } catch {
        // id is not a valid ObjectId, try legacyId
      }

      // If not found by _id, try legacyId
      if (!result) {
        result = await productsCollection.findOne({ legacyId: id });
      }

      if (!result) return res.status(404).send({ message: "Course not found" });
      return res.send(result);
    } catch (e) {
      console.error("products/:id error:", e);
      return res.status(500).send({ message: "Server error" });
    }
  }
  // In-memory fallback
  const result = inMemoryDB.courses.find((c) => String(c._id) === String(id));
  if (!result) return res.status(404).send({ message: "Course not found" });
  res.send(result);
});

// POST new course (public, no auth for now)
app.post("/products", async (req, res) => {
  console.log("➕ POST /products - Creating course:", req.body);
  const newProduct = req.body || {};
  newProduct.created_at = new Date();

  if (productsCollection) {
    const result = await productsCollection.insertOne(newProduct);
    console.log("✅ Course created:", result.insertedId);
    return res.send(result);
  }
  // In-memory fallback
  newProduct._id = "mem-course-" + Date.now();
  inMemoryDB.courses.push(newProduct);
  fileStore.save(inMemoryDB);
  console.log("✅ (memory) Course created:", newProduct._id);
  res.send({ acknowledged: true, insertedId: newProduct._id });
});

// Add a course on behalf of the signed-in Firebase user
// Client must send Authorization: Bearer <idToken>
app.post("/my-courses", verifyFireBaseToken, async (req, res) => {
  if (!dbReady) return res.status(503).send({ message: "Database not ready" });

  try {
    const ownerEmail = req.token_email;
    if (!ownerEmail)
      return res.status(401).send({ message: "unauthorized access" });

    console.log("➕ POST /my-courses - User adding course:", ownerEmail);
    const newCourse = req.body || {};

    // enforce owner and timestamps on server
    newCourse.email = ownerEmail;
    newCourse.providerEmail = ownerEmail;
    newCourse.created_at = new Date();

    // Use MongoDB or in-memory fallback
    if (productsCollection) {
      const result = await productsCollection.insertOne(newCourse);
      console.log("✅ Course added successfully:", result.insertedId);
      res.send(result);
    } else {
      // In-memory fallback
      newCourse._id = "mem-course-" + Date.now();
      inMemoryDB.courses.push(newCourse);
      console.log("✅ Course saved in-memory:", newCourse._id);
      res.send({
        acknowledged: true,
        insertedId: newCourse._id,
      });
    }
  } catch (err) {
    console.error("my-courses POST error", err);
    res.status(500).send({ message: "internal server error" });
  }
});

app.patch("/products/:id", verifyFireBaseToken, async (req, res) => {
  const id = req.params.id;
  const updatedProduct = req.body || {};

  if (productsCollection) {
    try {
      const query = { _id: new ObjectId(id) };
      const existing = await productsCollection.findOne(query);
      if (!existing)
        return res.status(404).send({ message: "Course not found" });

      const ownerEmail = existing.email || existing.providerEmail;
      if (!ownerEmail || ownerEmail !== req.token_email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const update = {
        $set: {
          name: updatedProduct.name,
          price: updatedProduct.price,
        },
      };
      const result = await productsCollection.updateOne(query, update);
      return res.send(result);
    } catch (e) {
      return res.status(400).send({ message: "Invalid course id" });
    }
  }
  // In-memory fallback
  const idx = inMemoryDB.courses.findIndex((c) => String(c._id) === String(id));
  if (idx === -1) return res.status(404).send({ message: "Course not found" });
  {
    const existing = inMemoryDB.courses[idx];
    const ownerEmail = existing?.email || existing?.providerEmail;
    if (!ownerEmail || ownerEmail !== req.token_email) {
      return res.status(403).send({ message: "forbidden access" });
    }
  }
  inMemoryDB.courses[idx] = { ...inMemoryDB.courses[idx], ...updatedProduct };
  fileStore.save(inMemoryDB);
  res.send({ acknowledged: true, modifiedCount: 1 });
});

app.delete("/products/:id", verifyFireBaseToken, async (req, res) => {
  const id = req.params.id;
  if (productsCollection) {
    try {
      const query = { _id: new ObjectId(id) };
      const existing = await productsCollection.findOne(query);
      if (!existing)
        return res.status(404).send({ message: "Course not found" });

      const ownerEmail = existing.email || existing.providerEmail;
      if (!ownerEmail || ownerEmail !== req.token_email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const result = await productsCollection.deleteOne(query);
      return res.send(result);
    } catch (e) {
      return res.status(400).send({ message: "Invalid course id" });
    }
  }
  // In-memory fallback
  {
    const existing = inMemoryDB.courses.find(
      (c) => String(c._id) === String(id)
    );
    if (!existing) return res.status(404).send({ message: "Course not found" });
    const ownerEmail = existing?.email || existing?.providerEmail;
    if (!ownerEmail || ownerEmail !== req.token_email) {
      return res.status(403).send({ message: "forbidden access" });
    }
  }
  const prevLen = inMemoryDB.courses.length;
  inMemoryDB.courses = inMemoryDB.courses.filter(
    (c) => String(c._id) !== String(id)
  );
  const deletedCount = prevLen - inMemoryDB.courses.length;
  fileStore.save(inMemoryDB);
  res.send({ acknowledged: true, deletedCount });
});

// bids endpoint now verifies Firebase ID token sent in Authorization: "Bearer <idToken>"
app.get("/bids", verifyFireBaseToken, async (req, res) => {
  const email = req.query.email;
  const query = {};
  if (email) {
    query.buyer_email = email;
  }

  // verify user has access to see this data
  if (email && email !== req.token_email) {
    return res.status(403).send({ message: "forbidden access" });
  }

  if (bidsCollection) {
    const cursor = bidsCollection.find(query);
    const result = await cursor.toArray();
    return res.send(result);
  }
  // In-memory fallback
  const result = inMemoryDB.enrollments.filter((e) =>
    query.buyer_email ? e.buyer_email === query.buyer_email : true
  );
  res.send(result);
});

app.get("/products/bids/:productId", verifyFireBaseToken, async (req, res) => {
  const productId = req.params.productId;
  const query = { product: productId };

  if (bidsCollection) {
    const cursor = bidsCollection.find(query).sort({ bid_price: -1 });
    const result = await cursor.toArray();
    return res.send(result);
  }
  // In-memory fallback
  const result = inMemoryDB.enrollments
    .filter((e) => String(e.product) === String(productId))
    .sort((a, b) => (b.bid_price || 0) - (a.bid_price || 0));
  res.send(result);
});

// ============================================
// STRIPE PAYMENT ROUTES
// ============================================

// Create Payment Intent for course enrollment
app.post("/create-payment-intent", verifyFireBaseToken, async (req, res) => {
  const { price, courseId, courseName } = req.body;

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ STRIPE_SECRET_KEY not configured");
    return res.status(500).send({ message: "Payment service not configured" });
  }

  if (!price || price <= 0) {
    return res.status(400).send({ message: "Invalid price" });
  }

  // Convert to cents (Stripe uses smallest currency unit)
  const amount = Math.round(price * 100);

  console.log("💳 Creating payment intent:", {
    amount,
    courseId,
    courseName,
    email: req.token_email,
  });

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: "usd",
      metadata: {
        courseId: courseId || "",
        courseName: courseName || "",
        userEmail: req.token_email || "",
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log("✅ Payment intent created:", paymentIntent.id);

    res.send({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("❌ Payment intent error:", error.message);
    res.status(500).send({ message: error.message });
  }
});

// Get payment history for user
app.get("/payments", verifyFireBaseToken, async (req, res) => {
  const userEmail = req.token_email;

  try {
    let payments = [];
    if (bidsCollection) {
      // Find enrollments with payment info
      payments = await bidsCollection
        .find({ buyer_email: userEmail, payment_status: "paid" })
        .sort({ paid_at: -1 })
        .toArray();
    } else {
      payments = inMemoryDB.enrollments.filter(
        (e) => e.buyer_email === userEmail && e.payment_status === "paid"
      );
    }
    res.send(payments);
  } catch (error) {
    console.error("payments error:", error);
    res.status(500).send({ message: "Failed to fetch payments" });
  }
});

// Confirm payment and enroll (called after successful Stripe payment)
app.post("/confirm-payment", verifyFireBaseToken, async (req, res) => {
  const { paymentIntentId, courseId } = req.body;
  const userEmail = req.token_email;

  console.log("🔐 Confirming payment:", {
    paymentIntentId,
    courseId,
    userEmail,
  });

  if (!paymentIntentId || !courseId) {
    return res.status(400).send({ message: "Missing payment or course info" });
  }

  try {
    // Verify payment with Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== "succeeded") {
      console.log("❌ Payment not successful:", paymentIntent.status);
      return res.status(400).send({ message: "Payment not completed" });
    }

    console.log("✅ Payment verified with Stripe");

    // Check if already enrolled
    let existingEnrollment = null;
    if (bidsCollection) {
      existingEnrollment = await bidsCollection.findOne({
        buyer_email: userEmail,
        product: courseId,
      });
    } else {
      existingEnrollment = inMemoryDB.enrollments.find(
        (e) => e.buyer_email === userEmail && e.product === courseId
      );
    }

    if (existingEnrollment) {
      console.log("⚠️ Already enrolled, updating payment status");
      // Update existing enrollment with payment info
      if (bidsCollection) {
        await bidsCollection.updateOne(
          { _id: existingEnrollment._id },
          {
            $set: {
              payment_status: "paid",
              payment_intent_id: paymentIntentId,
              amount_paid: paymentIntent.amount / 100,
              paid_at: new Date(),
            },
          }
        );
      }
      return res.send({
        message: "Payment confirmed",
        enrollment: existingEnrollment,
      });
    }

    // Create new enrollment with payment info
    const newEnrollment = {
      product: courseId,
      buyer_email: userEmail,
      enrolled_at: new Date(),
      payment_status: "paid",
      payment_intent_id: paymentIntentId,
      amount_paid: paymentIntent.amount / 100,
      paid_at: new Date(),
    };

    if (bidsCollection) {
      const result = await bidsCollection.insertOne(newEnrollment);
      console.log("✅ Enrollment created with payment:", result.insertedId);
      res.send({
        message: "Payment confirmed and enrolled",
        insertedId: result.insertedId,
      });
    } else {
      newEnrollment._id = "mem-" + Date.now();
      inMemoryDB.enrollments.push(newEnrollment);
      fileStore.save(inMemoryDB);
      console.log("✅ Enrollment saved in-memory:", newEnrollment._id);
      res.send({
        message: "Payment confirmed and enrolled",
        insertedId: newEnrollment._id,
      });
    }
  } catch (error) {
    console.error("❌ Payment confirmation error:", error.message);
    res.status(500).send({ message: error.message });
  }
});

// ENROLL in a course (POST /bids)
app.post("/bids", verifyFireBaseToken, async (req, res) => {
  if (!dbReady) {
    console.log("⚠️ Database not ready, returning mock success");
    return res.send({
      acknowledged: true,
      insertedId: "mock-" + Date.now(),
      message: "Enrollment recorded (DB pending connection)",
    });
  }

  console.log("🎓 POST /bids - Enrolling in course:", req.body);
  const newEnrollment = { ...(req.body || {}) };

  // enforce buyer identity on server (ignore spoofed buyer_email)
  newEnrollment.buyer_email = req.token_email;

  // Add enrollment timestamp
  newEnrollment.enrolled_at = new Date();

  // Use MongoDB or in-memory fallback
  if (bidsCollection) {
    const result = await bidsCollection.insertOne(newEnrollment);
    console.log("✅ Enrollment successful:", result.insertedId);
    res.send(result);
  } else {
    // In-memory fallback
    newEnrollment._id = "mem-" + Date.now();
    inMemoryDB.enrollments.push(newEnrollment);
    fileStore.save(inMemoryDB);
    console.log("✅ Enrollment saved in-memory:", newEnrollment._id);
    res.send({
      acknowledged: true,
      insertedId: newEnrollment._id,
    });
  }
});

app.delete("/bids/:id", verifyFireBaseToken, async (req, res) => {
  const id = req.params.id;
  if (bidsCollection) {
    try {
      const query = { _id: new ObjectId(id) };
      const existing = await bidsCollection.findOne(query);
      if (!existing)
        return res.status(404).send({ message: "Enrollment not found" });
      if (existing.buyer_email && existing.buyer_email !== req.token_email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const result = await bidsCollection.deleteOne(query);
      return res.send(result);
    } catch (e) {
      return res.status(400).send({ message: "Invalid bid id" });
    }
  }
  // In-memory fallback
  {
    const existing = inMemoryDB.enrollments.find(
      (e) => String(e._id) === String(id)
    );
    if (!existing)
      return res.status(404).send({ message: "Enrollment not found" });
    if (existing.buyer_email && existing.buyer_email !== req.token_email) {
      return res.status(403).send({ message: "forbidden access" });
    }
  }
  const prevLen = inMemoryDB.enrollments.length;
  inMemoryDB.enrollments = inMemoryDB.enrollments.filter(
    (e) => String(e._id) !== String(id)
  );
  const deletedCount = prevLen - inMemoryDB.enrollments.length;
  fileStore.save(inMemoryDB);
  res.send({ acknowledged: true, deletedCount });
});

// DEBUG: list all in-memory enrollments (no auth) - dev only
app.get("/debug/bids", (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).send({ message: "not found" });
  }
  res.send(inMemoryDB.enrollments);
});

// Return courses/products added by the currently signed-in Firebase user
app.get("/my-courses", verifyFireBaseToken, async (req, res) => {
  if (!dbReady) return res.status(503).send({ message: "Database not ready" });

  try {
    const ownerEmail = req.token_email;
    if (!ownerEmail)
      return res.status(401).send({ message: "unauthorized access" });

    // Use MongoDB or in-memory fallback
    let result = [];
    if (productsCollection) {
      const query = { email: ownerEmail };
      const cursor = productsCollection.find(query);
      result = await cursor.toArray();
    } else {
      // In-memory fallback
      result = inMemoryDB.courses.filter((c) => c.email === ownerEmail);
    }
    res.send(result);
  } catch (err) {
    console.error("my-courses error", err);
    res.status(500).send({ message: "internal server error" });
  }
});

// Return courses the signed-in user has enrolled in (based on enrollments collection)
// Response: array of course objects with enrollment info
app.get("/enrolled-courses", verifyFireBaseToken, async (req, res) => {
  if (!dbReady) {
    console.log("⚠️ Database not ready, returning empty array");
    return res.send([]);
  }

  try {
    const userEmail = req.token_email;
    if (!userEmail)
      return res.status(401).send({ message: "unauthorized access" });

    console.log("📖 GET /enrolled-courses for user:", userEmail);

    // Use MongoDB or in-memory fallback
    let enrollments = [];
    if (bidsCollection) {
      const enrollmentsCursor = bidsCollection.find({ buyer_email: userEmail });
      enrollments = await enrollmentsCursor.toArray();
    } else {
      // In-memory fallback
      enrollments = inMemoryDB.enrollments.filter(
        (e) => e.buyer_email === userEmail
      );
    }

    console.log(`Found ${enrollments.length} enrollments`);

    // collect course ids referenced in enrollments
    const courseIds = enrollments.map((e) => e.product).filter(Boolean);

    let courses = [];
    if (productsCollection) {
      // convert ids that look like ObjectId strings to ObjectId
      const objectIds = courseIds
        .map((id) => {
          try {
            return new ObjectId(id);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Also collect legacy IDs (string IDs like "seed-1") for backward compatibility
      const legacyIds = courseIds.filter((id) => {
        try {
          new ObjectId(id);
          return false; // It's a valid ObjectId, not a legacy ID
        } catch {
          return true; // It's a legacy ID
        }
      });

      // Build query: match by _id OR by legacyId
      const orConditions = [];
      if (objectIds.length) {
        orConditions.push({ _id: { $in: objectIds } });
      }
      if (legacyIds.length) {
        orConditions.push({ legacyId: { $in: legacyIds } });
      }

      if (orConditions.length) {
        courses = await productsCollection
          .find({ $or: orConditions })
          .toArray();
      }
    } else {
      // In-memory fallback
      courses = inMemoryDB.courses.filter((c) => courseIds.includes(c._id));
    }

    console.log(`✅ Returning ${courses.length} enrolled courses`);

    // map courses by their id string for easy lookup (both _id and legacyId)
    const courseMap = new Map();
    for (const c of courses) {
      courseMap.set(c._id.toString(), c);
      if (c.legacyId) {
        courseMap.set(c.legacyId, c);
      }
    }

    const result = enrollments
      .map((enrollment) => {
        const courseId = enrollment.product ? String(enrollment.product) : null;
        const course = courseId ? courseMap.get(courseId) || null : null;
        return {
          ...course,
          enrollment_id: enrollment._id,
          enrolled_at: enrollment.enrolled_at,
        };
      })
      .filter((item) => item._id); // Only return items with valid course data

    res.send(result);
  } catch (err) {
    console.error("enrolled-courses error", err);
    res.status(500).send({ message: "internal server error" });
  }
});

app.listen(port, () => {
  console.log(`Smart server is running on port: ${port}`);
  try {
    const routes = [];
    if (app._router && Array.isArray(app._router.stack)) {
      app._router.stack
        .filter((layer) => layer.route)
        .forEach((layer) => {
          const methods = Object.keys(layer.route.methods)
            .filter((m) => layer.route.methods[m])
            .map((m) => m.toUpperCase())
            .join(",");
          routes.push(`${methods} ${layer.route.path}`);
        });
    }
    console.log("Registered routes:");
    routes.forEach((r) => console.log(" -", r));
  } catch (e) {
    console.log("Could not list routes:", e.message);
  }
});

// client.connect()
//     .then(() => {
//         app.listen(port, () => {
//             console.log(`Smart server is running now on port: ${port}`)
//         })

//     })
//     .catch(console.dir)
