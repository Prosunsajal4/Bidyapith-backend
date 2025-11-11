require("dotenv").config();
const { MongoClient, ServerApiVersion } = require("mongodb");

(async () => {
  let uri = process.env.MONGODB_URI || "";
  if (!uri) {
    const user = process.env.DB_USER;
    const pass = process.env.DB_PASS;
    if (user && pass) {
      uri = `mongodb+srv://${user}:${pass}@cluster0.vyznij5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
    }
  }
  if (!uri) uri = `mongodb://127.0.0.1:27017/smart_db`;
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 20000,
    tls: uri.startsWith("mongodb+srv://") ? true : undefined,
  });

  console.log("Connecting to:", uri.replace(/:\\w+@/, ":***@"));
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Mongo ping OK");
  } catch (err) {
    console.error(
      "❌ Mongo connection failed:",
      err && (err.stack || err.message || err)
    );
    process.exitCode = 1;
  } finally {
    try {
      await client.close();
    } catch {}
  }
})();
