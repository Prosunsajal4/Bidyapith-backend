const express = require("express");
const cors = require("cors");
require("dotenv").config();
// JWT removed: using Firebase token verification instead of custom JWTs
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

// allow overriding the firebase admin key path via env, default to existing file
const serviceAccountPath =
  process.env.FIREBASE_KEY_PATH || "./Bidyapith_main_firebase_key.json";
const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    console.log("after token validation", userInfo);
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
const fileStore = require('./utils/fileStore');
(function bootstrapFromFile() {
  const snapshot = fileStore.load();
  if (snapshot && snapshot.courses && Array.isArray(snapshot.courses)) {
    inMemoryDB.courses = snapshot.courses;
    inMemoryDB.enrollments = Array.isArray(snapshot.enrollments) ? snapshot.enrollments : [];
    inMemoryDB.users = Array.isArray(snapshot.users) ? snapshot.users : [];
    console.log(`💾 Loaded ${inMemoryDB.courses.length} courses from file store`);
  }
})();


// Seed dataset (mirrors public/skills.json)
const seedCourses = [
  {
    _id: "seed-1",
    skillName: "Beginner Guitar Lessons",
    providerName: "Alex Martin",
    providerEmail: "alex@skillswap.com",
    price: 20,
    rating: 4.8,
    slotsAvailable: 3,
    description: "Acoustic guitar classes for complete beginners.",
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
    description: "Conversational English sessions for non-native speakers.",
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
    description: "Learn the fundamentals of photography and camera handling.",
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
    description: "Learn to cook simple and delicious everyday meals.",
    image:
      "https://www.foodandwine.com/thmb/zvIodldq4U1v4k-ZWMhZ7Dj86UI=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/FAW-recipes-mushroom-and-chicken-risotto-hero-08-3152f227840748b3afd35efc5d27da67.jpg",
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
    description: "Learn HTML, CSS, and JavaScript to build your first website.",
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
    description: "Create eye-catching social media graphics using Canva.",
    image: "https://images.pexels.com/photos/267389/pexels-photo-267389.jpeg",
    category: "Design",
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
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      if (!result) return res.status(404).send({ message: "Course not found" });
      return res.send(result);
    } catch (e) {
      return res.status(400).send({ message: "Invalid course id" });
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

app.patch("/products/:id", async (req, res) => {
  const id = req.params.id;
  const updatedProduct = req.body || {};

  if (productsCollection) {
    try {
      const query = { _id: new ObjectId(id) };
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
  inMemoryDB.courses[idx] = { ...inMemoryDB.courses[idx], ...updatedProduct };
  fileStore.save(inMemoryDB);
  res.send({ acknowledged: true, modifiedCount: 1 });
});

app.delete("/products/:id", async (req, res) => {
  const id = req.params.id;
  if (productsCollection) {
    try {
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      return res.send(result);
    } catch (e) {
      return res.status(400).send({ message: "Invalid course id" });
    }
  }
  // In-memory fallback
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

// ENROLL in a course (POST /bids)
app.post("/bids", async (req, res) => {
  if (!dbReady) {
    console.log("⚠️ Database not ready, returning mock success");
    return res.send({
      acknowledged: true,
      insertedId: "mock-" + Date.now(),
      message: "Enrollment recorded (DB pending connection)",
    });
  }

  console.log("🎓 POST /bids - Enrolling in course:", req.body);
  const newEnrollment = req.body;

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

app.delete("/bids/:id", async (req, res) => {
  const id = req.params.id;
  if (bidsCollection) {
    try {
      const query = { _id: new ObjectId(id) };
      const result = await bidsCollection.deleteOne(query);
      return res.send(result);
    } catch (e) {
      return res.status(400).send({ message: "Invalid bid id" });
    }
  }
  // In-memory fallback
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

      if (objectIds.length) {
        courses = await productsCollection
          .find({ _id: { $in: objectIds } })
          .toArray();
      }
    } else {
      // In-memory fallback
      courses = inMemoryDB.courses.filter((c) => courseIds.includes(c._id));
    }

    console.log(`✅ Returning ${courses.length} enrolled courses`);

    // map courses by their id string for easy lookup
    const courseMap = new Map(courses.map((c) => [c._id.toString(), c]));

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
