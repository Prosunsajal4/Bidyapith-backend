# Bidyapith Backend

This backend supports MongoDB via a connection string (`MONGODB_URI`) and falls back to in-memory mode if the database is unavailable.

## Quick start

1. Copy `.env.example` to `.env` and set `MONGODB_URI`.
2. Start MongoDB (choose one):

   - Local (Docker):
     - Install Docker Desktop
     - Run:
       ```powershell
       docker run -d --name mongo -p 27017:27017 -v C:\\mongo-data:/data/db mongo:7
       ```
     - Then set `MONGODB_URI=mongodb://127.0.0.1:27017/smart_db` in `.env`.
   - Atlas:
     - Add your IP to Network Access (or 0.0.0.0/0 for testing)
     - Create a database user and note the password
     - Set `MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/smart_db?retryWrites=true&w=majority`

3. Install deps:

   ```powershell
   cd Bidyapith-backend
   npm install
   ```

4. Run:
   ```powershell
   npm start
   ```

## Node.js version note (TLS with Atlas)

With Node 22 on Windows, some users see TLS handshake errors with Atlas:

```
SSL routines: ssl3_read_bytes: tlsv1 alert internal error
```

If you hit this, switch to Node 20 LTS using nvm-windows:

```powershell
choco install nvm -y  # or install from https://github.com/coreybutler/nvm-windows
nvm install 20.16.0
nvm use 20.16.0
node -v
```

Then retry the connection test:

```powershell
npm run mongo:test
```

## Debug endpoints

- GET `/ping` — quick health check
- GET `/debug/db-status` — shows whether DB collections are ready
- GET `/debug/seed-course` — seed one in-memory course (dev only)
- GET `/debug/clear` — clear in-memory data

## Test the DB connection

```powershell
npm run mongo:test
```

This will connect using your `.env` and report success/failure.

## Environment

See `.env.example` for all available variables.
