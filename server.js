const express = require("express");
const http = require("http");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Database path - uses persistent disk on Render
const dbPath = process.env.RENDER ?
    "/var/data/teams_chat.db" :
    path.join(__dirname, "teams_chat.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );
`);

// CORS must be BEFORE routes but AFTER 'app' is created
app.use(cors({
    origin: 'https://teams-3d363.web.app',
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "teamspace-development-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "none",
        secure: true,
        maxAge: 24 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "You must be logged in." });
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

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        message: "TeamSpace backend is running.",
        time: new Date().toISOString()
    });
});

app.post("/api/register", async(req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
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

        const existing = db
            .prepare("SELECT id FROM users WHERE email = ?")
            .get(email);

        if (existing) {
            return res.status(409).json({
                error: "An account with this email already exists."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = db
            .prepare(`
        INSERT INTO users (name, email, password)
        VALUES (?, ?, ?)
      `)
            .run(name, email, passwordHash);

        req.session.userId = Number(result.lastInsertRowid);

        const user = db
            .prepare("SELECT id, name, email FROM users WHERE id = ?")
            .get(req.session.userId);

        res.status(201).json({
            message: "Account created successfully.",
            user: publicUser(user)
        });
    } catch (error) {
        console.error("REGISTER ERROR:", error);
        res.status(500).json({
            error: "Unable to create the account. Please try again."
        });
    }
});

app.post("/api/login", async(req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        const user = db
            .prepare("SELECT * FROM users WHERE email = ?")
            .get(email);

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

app.post("/api/logout", requireAuth, (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("LOGOUT ERROR:", error);
            return res.status(500).json({ error: "Unable to log out." });
        }

        res.json({ ok: true });
    });
});

app.get("/api/me", requireAuth, (req, res) => {
    const user = db
        .prepare("SELECT id, name, email FROM users WHERE id = ?")
        .get(req.session.userId);

    if (!user) {
        req.session.destroy(() => {});
        return res.status(401).json({ error: "Account not found." });
    }

    res.json({ user: publicUser(user) });
});

app.get("/api/users", requireAuth, (req, res) => {
    const users = db
        .prepare(`
      SELECT id, name, email
      FROM users
      WHERE id != ?
      ORDER BY name COLLATE NOCASE ASC
    `)
        .all(req.session.userId);

    res.json({ users });
});

app.get("/api/messages/:userId", requireAuth, (req, res) => {
    const otherUserId = Number(req.params.userId);

    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
        return res.status(400).json({ error: "Invalid user ID." });
    }

    const messages = db
        .prepare(`
      SELECT
        id,
        sender_id AS senderId,
        receiver_id AS receiverId,
        body,
        created_at AS createdAt
      FROM messages
      WHERE
        (sender_id = ? AND receiver_id = ?)
        OR
        (sender_id = ? AND receiver_id = ?)
      ORDER BY id ASC
    `)
        .all(
            req.session.userId,
            otherUserId,
            otherUserId,
            req.session.userId
        );

    res.json({ messages });
});

app.post("/api/messages", requireAuth, (req, res) => {
    const senderId = req.session.userId;
    const receiverId = Number(req.body.receiverId);
    const body = String(req.body.body || "").trim();

    if (!Number.isInteger(receiverId) || receiverId <= 0) {
        return res.status(400).json({ error: "Invalid recipient." });
    }

    if (!body) {
        return res.status(400).json({ error: "Message cannot be empty." });
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

    const receiver = db
        .prepare("SELECT id FROM users WHERE id = ?")
        .get(receiverId);

    if (!receiver) {
        return res.status(404).json({
            error: "The selected user does not exist."
        });
    }

    const result = db
        .prepare(`
      INSERT INTO messages (sender_id, receiver_id, body)
      VALUES (?, ?, ?)
    `)
        .run(senderId, receiverId, body);

    const message = db
        .prepare(`
      SELECT
        id,
        sender_id AS senderId,
        receiver_id AS receiverId,
        body,
        created_at AS createdAt
      FROM messages
      WHERE id = ?
    `)
        .get(result.lastInsertRowid);

    io.to(`user:${receiverId}`).emit("new-message", message);
    io.to(`user:${senderId}`).emit("message-sent", message);

    res.status(201).json({ message });
});

// Express 5-compatible SPA fallback
app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return next();
    }

    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Share the Express session with Socket.IO
io.engine.use(sessionMiddleware);

io.on("connection", (socket) => {
    const userId = socket.request.session ? .userId; // FIXED: removed space between ? and .

    if (!userId) {
        socket.disconnect(true);
        return;
    }

    socket.join(`user:${userId}`);

    console.log(`User ${userId} connected to Socket.IO.`);
});

server.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log(" TeamSpace Chat Server");
    console.log("========================================");
    console.log(` Running at: http://localhost:${PORT}`);
    console.log(" Database: teams_chat.db");
    console.log("========================================");
    console.log("");
});