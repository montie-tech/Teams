const express = require("express");
const http = require("http");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/*
  ========================================
  TeamSpace PostgreSQL Configuration
  ========================================

  Local PostgreSQL:
    PGHOST=localhost
    PGPORT=5432
    PGDATABASE=teamspace
    PGUSER=postgres
    PGPASSWORD=your_password

  Render:
    DATABASE_URL=your_online_postgresql_url
*/

const isProduction = process.env.NODE_ENV === "production";

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false
      }
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "teamspace",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD
    };

const pool = new Pool(poolConfig);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || true,
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

/*
  ========================================
  Middleware
  ========================================
*/

app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
  secret:
    process.env.SESSION_SECRET ||
    "teamspace-development-secret-change-in-production",

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,

    /*
      Firebase frontend and Render backend are different
      domains in production, so SameSite=None is required.
    */
    sameSite: isProduction ? "none" : "lax",

    secure: isProduction,

    maxAge: 24 * 60 * 60 * 1000
  }
});

app.use(sessionMiddleware);

/*
  Serve frontend files if this Express server
  is also serving the public folder.
*/
app.use(express.static(path.join(__dirname, "public")));

/*
  ========================================
  Helper Functions
  ========================================
*/

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "You must be logged in."
    });
  }

  next();
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

/*
  ========================================
  Health Check
  ========================================
*/

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      message: "TeamSpace backend is running.",
      database: "PostgreSQL",
      time: new Date().toISOString()
    });
  } catch (error) {
    console.error("HEALTH CHECK DATABASE ERROR:", error);

    res.status(500).json({
      ok: false,
      message: "Backend is running, but PostgreSQL is unavailable."
    });
  }
});

/*
  ========================================
  Register
  ========================================
*/

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "Full name, email and password are required."
      });
    }

    if (name.length < 2) {
      return res.status(400).json({
        error: "Please enter a valid full name."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters."
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users (name, email, password)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, created_at
      `,
      [name, email, passwordHash]
    );

    const user = result.rows[0];

    req.session.userId = user.id;

    res.status(201).json({
      message: "Account created successfully.",
      user: publicUser(user)
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);

    /*
      PostgreSQL unique constraint protection.
    */
    if (error.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    res.status(500).json({
      error: "Unable to create the account. Please try again."
    });
  }
});

/*
  ========================================
  Login
  ========================================
*/

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    req.session.userId = user.id;

    res.json({
      message: "Login successful.",
      user: publicUser(user)
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    res.status(500).json({
      error: "Unable to sign in. Please try again."
    });
  }
});

/*
  ========================================
  Logout
  ========================================
*/

app.post("/api/logout", requireAuth, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("LOGOUT ERROR:", error);

      return res.status(500).json({
        error: "Unable to log out."
      });
    }

    res.json({
      ok: true
    });
  });
});

/*
  ========================================
  Current User
  ========================================
*/

app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, email
      FROM users
      WHERE id = $1
      `,
      [req.session.userId]
    );

    const user = result.rows[0];

    if (!user) {
      req.session.destroy(() => {});

      return res.status(401).json({
        error: "Account not found."
      });
    }

    res.json({
      user: publicUser(user)
    });
  } catch (error) {
    console.error("ME ERROR:", error);

    res.status(500).json({
      error: "Unable to retrieve your account."
    });
  }
});

/*
  ========================================
  Users
  ========================================
*/

app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT id, name, email
      FROM users
      WHERE id != $1
      ORDER BY LOWER(name) ASC
      `,
      [req.session.userId]
    );

    res.json({
      users: result.rows
    });
  } catch (error) {
    console.error("USERS ERROR:", error);

    res.status(500).json({
      error: "Unable to retrieve users."
    });
  }
});

/*
  ========================================
  Messages
  ========================================
*/

app.get("/api/messages/:userId", requireAuth, async (req, res) => {
  try {
    const otherUserId = Number(req.params.userId);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      return res.status(400).json({
        error: "Invalid user ID."
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        body,
        created_at AS "createdAt"
      FROM messages
      WHERE
        (sender_id = $1 AND receiver_id = $2)
        OR
        (sender_id = $2 AND receiver_id = $1)
      ORDER BY id ASC
      `,
      [req.session.userId, otherUserId]
    );

    res.json({
      messages: result.rows
    });
  } catch (error) {
    console.error("MESSAGES GET ERROR:", error);

    res.status(500).json({
      error: "Unable to retrieve messages."
    });
  }
});

/*
  ========================================
  Send Message
  ========================================
*/

app.post("/api/messages", requireAuth, async (req, res) => {
  try {
    const senderId = req.session.userId;
    const receiverId = Number(req.body.receiverId);
    const body = String(req.body.body || "").trim();

    if (!Number.isInteger(receiverId) || receiverId <= 0) {
      return res.status(400).json({
        error: "Invalid recipient."
      });
    }

    if (!body) {
      return res.status(400).json({
        error: "Message cannot be empty."
      });
    }

    if (body.length > 5000) {
      return res.status(400).json({
        error: "Message is too long. Maximum is 5000 characters."
      });
    }

    if (receiverId === senderId) {
      return res.status(400).json({
        error: "You cannot send a private message to yourself."
      });
    }

    const receiverResult = await pool.query(
      "SELECT id FROM users WHERE id = $1",
      [receiverId]
    );

    if (receiverResult.rows.length === 0) {
      return res.status(404).json({
        error: "The selected user does not exist."
      });
    }

    const result = await pool.query(
      `
      INSERT INTO messages (sender_id, receiver_id, body)
      VALUES ($1, $2, $3)
      RETURNING
        id,
        sender_id AS "senderId",
        receiver_id AS "receiverId",
        body,
        created_at AS "createdAt"
      `,
      [senderId, receiverId, body]
    );

    const message = result.rows[0];

    /*
      Send real-time message to recipient.
    */
    io.to(`user:${receiverId}`).emit("new-message", message);

    /*
      Send confirmation to sender.
    */
    io.to(`user:${senderId}`).emit("message-sent", message);

    res.status(201).json({
      message
    });
  } catch (error) {
    console.error("MESSAGE SEND ERROR:", error);

    res.status(500).json({
      error: "Unable to send message."
    });
  }
});

/*
  ========================================
  SPA Fallback
  ========================================
*/

app.get("/{*splat}", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/*
  ========================================
  Socket.IO
  ========================================
*/

io.engine.use(sessionMiddleware);

io.on("connection", (socket) => {
  const userId = socket.request.session?.userId;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  socket.join(`user:${userId}`);

  console.log(`User ${userId} connected to Socket.IO.`);
});

/*
  ========================================
  Database + Server Startup
  ========================================
*/

async function startServer() {
  try {
    await pool.query("SELECT 1");

    console.log("");
    console.log("========================================");
    console.log(" TeamSpace Chat Server");
    console.log("========================================");
    console.log(" PostgreSQL connection successful.");
    console.log(` Running on port: ${PORT}`);
    console.log(" Database: PostgreSQL");
    console.log("========================================");
    console.log("");

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`TeamSpace server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("");
    console.error("========================================");
    console.error(" DATABASE CONNECTION FAILED");
    console.error("========================================");
    console.error(error.message);
    console.error("");
    console.error(
      "Check your PostgreSQL settings, especially PGPASSWORD or DATABASE_URL."
    );
    console.error("");
    process.exit(1);
  }
}

startServer();

/*
  ========================================
  Graceful Shutdown
  ========================================
*/

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing server...");

  await pool.end();

  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received. Closing server...");

  await pool.end();

  process.exit(0);
});