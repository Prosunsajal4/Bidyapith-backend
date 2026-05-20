client.close();
await client.db("admin").command({ping : 1});
