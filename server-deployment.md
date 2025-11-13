client.close();
await client.db("admin").command({pinf : 1});
