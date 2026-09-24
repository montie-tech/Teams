require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

/*
TeamSpace PostgreSQL Configuration
*/

const databaseUrl = process.env.DATABASE_URL || "";

const isLocalDatabase =
  databaseUrl.includes("localhost") ||
  databaseUrl.includes("127.0.0.1");

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,

      ...(isLocalDatabase
        ? {}
        : {
            ssl: {
              rejectUnauthorized: false
            }
          })
    }
  : {
      host: process.env.PGHOST || "localhost",
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || "teamspace",
      user: process.env.PGUSER || "postgres",
      password: process.env.PGPASSWORD || ""
    };

const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

const PORT = Number(process.env.PORT || 3000);

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  "teamspace-development-jwt-secret-change-this";

/*
CORS
*/

const allowedOrigins = [
  "https://teams-3d363.web.app",
  "https://teams-3d363.firebaseapp.com",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ]
};

app.use(cors(corsOptions));

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

/*
JWT Authentication
*/

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function requireAuth(req, res, next) {
  try {
    const authHeader =
      req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "You must be logged in."
      });
    }

    const token =
      authHeader.substring(7).trim();

    if (!token) {
      return res.status(401).json({
        error: "You must be logged in."
      });
    }

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.userId = decoded.userId;

    next();
  } catch (error) {
    console.error(
      "AUTHENTICATION ERROR:",
      error.message
    );

    return res.status(401).json({
      error:
        "Your session has expired. Please sign in again."
    });
  }
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

/*
Database Tables
*/

async function initializeDatabase() {
  /*
  Groups
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS groups (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      created_by INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /*
  Group Members
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_members (
      group_id INTEGER NOT NULL
        REFERENCES groups(id)
        ON DELETE CASCADE,

      user_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      joined_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      role VARCHAR(20) NOT NULL
        DEFAULT 'member'
        CHECK (role IN ('owner', 'member')),

      PRIMARY KEY (group_id, user_id)
    );
  `);

  /*
  Group Messages
  */

  await pool.query(`
    CREATE TABLE IF NOT EXISTS group_messages (
      id SERIAL PRIMARY KEY,

      group_id INTEGER NOT NULL
        REFERENCES groups(id)
        ON DELETE CASCADE,

      sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

      body TEXT NOT NULL,

      created_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
    );
  `);

  /*
  Indexes
  */

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_members_user_id
    ON group_members(user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_members_group_id
    ON group_members(group_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_group_messages_group_id
    ON group_messages(group_id, id);
  `);

  console.log(
    "Group database tables ready."
  );
}

/*
Health Check
*/

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      message:
        "TeamSpace backend is running.",
      database: "PostgreSQL",
      authentication: "JWT",
      groups: true,
      time: new Date().toISOString()
    });
  } catch (error) {
    console.error(
      "HEALTH CHECK DATABASE ERROR:",
      error
    );

    res.status(500).json({
      ok: false,
      message:
        "Backend is running, but PostgreSQL is unavailable."
    });
  }
});

/*
Register
*/

app.post("/api/register", async (req, res) => {
  try {
    const name =
      String(req.body.name || "").trim();

    const email =
      String(req.body.email || "")
        .trim()
        .toLowerCase();

    const password =
      String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({
        error:
          "Full name, email and password are required."
      });
    }

    if (name.length < 2) {
      return res.status(400).json({
        error:
          "Please enter a valid full name."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "Password must be at least 6 characters."
      });
    }

    const existing = await pool.query(
      `
      SELECT id
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error:
          "An account with this email already exists."
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO users
        (name, email, password)
      VALUES
        ($1, $2, $3)
      RETURNING
        id,
        name,
        email,
        created_at
      `,
      [
        name,
        email,
        passwordHash
      ]
    );

    const user = result.rows[0];

    const token =
      createToken(user);

    res.status(201).json({
      message:
        "Account created successfully.",
      token,
      user: publicUser(user)
    });
  } catch (error) {
    console.error(
      "REGISTER ERROR:",
      error
    );

    if (error.code === "23505") {
      return res.status(409).json({
        error:
          "An account with this email already exists."
      });
    }

    res.status(500).json({
      error:
        "Unable to create the account. Please try again."
    });
  }
});

/*
Login
*/

app.post("/api/login", async (req, res) => {
  try {
    const email =
      String(req.body.email || "")
        .trim()
        .toLowerCase();

    const password =
      String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        error:
          "Email and password are required."
      });
    }

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE email = $1
      `,
      [email]
    );

    const user =
      result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password
      ))
    ) {
      return res.status(401).json({
        error:
          "Invalid email or password."
      });
    }

    const token =
      createToken(user);

    res.json({
      message:
        "Login successful.",
      token,
      user: publicUser(user)
    });
  } catch (error) {
    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({
      error:
        "Unable to sign in. Please try again."
    });
  }
});

/*
Logout
*/

app.post(
  "/api/logout",
  requireAuth,
  (req, res) => {
    res.json({
      ok: true,
      message:
        "Logged out successfully."
    });
  }
);

/*
Current User
*/

app.get(
  "/api/me",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            email
          FROM users
          WHERE id = $1
          `,
          [req.userId]
        );

      const user =
        result.rows[0];

      if (!user) {
        return res.status(401).json({
          error:
            "Account not found."
        });
      }

      res.json({
        user: publicUser(user)
      });
    } catch (error) {
      console.error(
        "ME ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to retrieve your account."
      });
    }
  }
);

/*
Users
*/

app.get(
  "/api/users",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            email
          FROM users
          WHERE id != $1
          ORDER BY LOWER(name) ASC
          `,
          [req.userId]
        );

      res.json({
        users: result.rows
      });
    } catch (error) {
      console.error(
        "USERS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to retrieve users."
      });
    }
  }
);

/*
Private Messages
*/

app.get(
  "/api/messages/:userId",
  requireAuth,
  async (req, res) => {
    try {
      const otherUserId =
        Number(req.params.userId);

      if (
        !Number.isInteger(
          otherUserId
        ) ||
        otherUserId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid user ID."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            id,
            sender_id AS "senderId",
            receiver_id AS "receiverId",
            body,
            created_at AS "createdAt"
          FROM messages
          WHERE
            (
              sender_id = $1
              AND receiver_id = $2
            )
            OR
            (
              sender_id = $2
              AND receiver_id = $1
            )
          ORDER BY id ASC
          `,
          [
            req.userId,
            otherUserId
          ]
        );

      res.json({
        messages:
          result.rows
      });
    } catch (error) {
      console.error(
        "MESSAGES GET ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to retrieve messages."
      });
    }
  }
);

app.post(
  "/api/messages",
  requireAuth,
  async (req, res) => {
    try {
      const senderId =
        req.userId;

      const receiverId =
        Number(
          req.body.receiverId
        );

      const body =
        String(
          req.body.body || ""
        ).trim();

      if (
        !Number.isInteger(
          receiverId
        ) ||
        receiverId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid recipient."
        });
      }

      if (!body) {
        return res.status(400).json({
          error:
            "Message cannot be empty."
        });
      }

      if (body.length > 5000) {
        return res.status(400).json({
          error:
            "Message is too long. Maximum is 5000 characters."
        });
      }

      if (
        receiverId === senderId
      ) {
        return res.status(400).json({
          error:
            "You cannot send a private message to yourself."
        });
      }

      const receiverResult =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
          `,
          [receiverId]
        );

      if (
        receiverResult.rows
          .length === 0
      ) {
        return res.status(404).json({
          error:
            "The selected user does not exist."
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO messages
            (
              sender_id,
              receiver_id,
              body
            )
          VALUES
            ($1, $2, $3)
          RETURNING
            id,
            sender_id AS "senderId",
            receiver_id AS "receiverId",
            body,
            created_at AS "createdAt"
          `,
          [
            senderId,
            receiverId,
            body
          ]
        );

      const message =
        result.rows[0];

      io.to(
        `user:${receiverId}`
      ).emit(
        "new-message",
        message
      );

      io.to(
        `user:${senderId}`
      ).emit(
        "message-sent",
        message
      );

      res.status(201).json({
        message
      });
    } catch (error) {
      console.error(
        "MESSAGE SEND ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to send message."
      });
    }
  }
);

/*
Groups - List Groups
*/

app.get(
  "/api/groups",
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            g.id,
            g.name,
            g.created_by AS "createdBy",
            g.created_at AS "createdAt",
            COUNT(gm.user_id)::int
              AS "memberCount"
          FROM groups g
          INNER JOIN group_members gm
            ON gm.group_id = g.id
          WHERE EXISTS (
            SELECT 1
            FROM group_members my_membership
            WHERE
              my_membership.group_id = g.id
              AND my_membership.user_id = $1
          )
          GROUP BY
            g.id,
            g.name,
            g.created_by,
            g.created_at
          ORDER BY
            LOWER(g.name) ASC
          `,
          [req.userId]
        );

      res.json({
        groups:
          result.rows
      });
    } catch (error) {
      console.error(
        "GROUPS GET ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to retrieve groups."
      });
    }
  }
);

/*
Create Group
*/

app.post(
  "/api/groups",
  requireAuth,
  async (req, res) => {
    let client;

    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const description =
        String(
          req.body.description || ""
        ).trim();

      let memberIds =
        Array.isArray(
          req.body.memberIds
        )
          ? req.body.memberIds
          : [];

      if (!name) {
        return res.status(400).json({
          error:
            "Group name is required."
        });
      }

      if (name.length > 150) {
        return res.status(400).json({
          error:
            "Group name cannot exceed 150 characters."
        });
      }

      if (description.length > 500) {
        return res.status(400).json({
          error:
            "Group description cannot exceed 500 characters."
        });
      }

      memberIds =
        memberIds
          .map(id => Number(id))
          .filter(
            id =>
              Number.isInteger(id) &&
              id > 0
          );

      memberIds = [
        ...new Set(memberIds)
      ];

      const currentUserId =
        Number(req.userId);

      if (
        !memberIds.includes(
          currentUserId
        )
      ) {
        memberIds.push(
          currentUserId
        );
      }

      if (memberIds.length < 2) {
        return res.status(400).json({
          error:
            "A group must contain at least two users."
        });
      }

      if (memberIds.length > 200) {
        return res.status(400).json({
          error:
            "A group can contain a maximum of 200 users."
        });
      }

      client =
        await pool.connect();

      const usersResult =
        await client.query(
          `
          SELECT id
          FROM users
          WHERE id = ANY($1::int[])
          `,
          [memberIds]
        );

      if (
        usersResult.rows.length !==
        memberIds.length
      ) {
        return res.status(400).json({
          error:
            "One or more selected users do not exist."
        });
      }

      await client.query(
        "BEGIN"
      );

      const groupResult =
        await client.query(
          `
          INSERT INTO groups
            (
              name,
              created_by
            )
          VALUES
            ($1, $2)
          RETURNING
            id,
            name,
            created_by AS "createdBy",
            created_at AS "createdAt"
          `,
          [
            name,
            currentUserId
          ]
        );

      const group =
        groupResult.rows[0];

      for (
        const userId
        of memberIds
      ) {
        await client.query(
          `
          INSERT INTO group_members
            (
              group_id,
              user_id,
              role
            )
          VALUES
            (
              $1,
              $2,
              $3
            )
          ON CONFLICT
            (group_id, user_id)
          DO NOTHING
          `,
          [
            group.id,
            userId,
            userId === currentUserId
              ? "owner"
              : "member"
          ]
        );
      }

      await client.query(
        "COMMIT"
      );

      const membersResult =
        await pool.query(
          `
          SELECT
            u.id,
            u.name,
            u.email,
            gm.role
          FROM users u
          INNER JOIN group_members gm
            ON gm.user_id = u.id
          WHERE
            gm.group_id = $1
          ORDER BY
            LOWER(u.name) ASC
          `,
          [group.id]
        );

      const responseGroup = {
        ...group,
        description,
        memberCount:
          membersResult.rows.length,
        members:
          membersResult.rows
      };

      for (
        const member
        of membersResult.rows
      ) {
        io.to(
          `user:${member.id}`
        ).emit(
          "group-created",
          responseGroup
        );
      }

      res.status(201).json({
        group:
          responseGroup
      });
    } catch (error) {
      if (client) {
        try {
          await client.query(
            "ROLLBACK"
          );
        } catch {}
      }

      console.error(
        "GROUP CREATE ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to create the group."
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

/*
Group Members
*/

app.get(
  "/api/groups/:groupId/members",
  requireAuth,
  async (req, res) => {
    try {
      const groupId =
        Number(
          req.params.groupId
        );

      if (
        !Number.isInteger(
          groupId
        ) ||
        groupId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid group ID."
        });
      }

      const membership =
        await pool.query(
          `
          SELECT 1
          FROM group_members
          WHERE
            group_id = $1
            AND user_id = $2
          `,
          [
            groupId,
            req.userId
          ]
        );

      if (
        membership.rows.length ===
        0
      ) {
        return res.status(403).json({
          error:
            "You are not a member of this group."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            u.id,
            u.name,
            u.email,
            gm.role,
            CASE
              WHEN g.created_by = u.id
              THEN true
              ELSE false
            END AS "isAdmin"
          FROM users u
          INNER JOIN group_members gm
            ON gm.user_id = u.id
          INNER JOIN groups g
            ON g.id = gm.group_id
          WHERE
            gm.group_id = $1
          ORDER BY
            LOWER(u.name) ASC
          `,
          [groupId]
        );

      res.json({
        members:
          result.rows
      });
    } catch (error) {
      console.error(
        "GROUP MEMBERS ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to retrieve group members."
      });
    }
  }
);

/*
Group Messages
*/

app.get(
  "/api/groups/:groupId/messages",
  requireAuth,
  async (req, res) => {
    try {
      const groupId =
        Number(
          req.params.groupId
        );

      if (
        !Number.isInteger(
          groupId
        ) ||
        groupId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid group ID."
        });
      }

      const membership =
        await pool.query(
          `
          SELECT 1
          FROM group_members
          WHERE
            group_id = $1
            AND user_id = $2
          `,
          [
            groupId,
            req.userId
          ]
        );

      if (
        membership.rows.length ===
        0
      ) {
        return res.status(403).json({
          error:
            "You are not a member of this group."
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            gm.id,
            gm.group_id AS "groupId",
            gm.sender_id AS "senderId",
            u.name AS "senderName",
            gm.body,
            gm.created_at AS "createdAt"
          FROM group_messages gm
          INNER JOIN users u
            ON u.id = gm.sender_id
          WHERE
            gm.group_id = $1
          ORDER BY
            gm.id ASC
          `,
          [groupId]
        );

      res.json({
        messages:
          result.rows
      });
    } catch (error) {
      console.error(
        "GROUP MESSAGES GET ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to retrieve group messages."
      });
    }
  }
);

/*
Send Group Message
*/

app.post(
  "/api/groups/:groupId/messages",
  requireAuth,
  async (req, res) => {
    try {
      const groupId =
        Number(
          req.params.groupId
        );

      const senderId =
        Number(req.userId);

      const body =
        String(
          req.body.body || ""
        ).trim();

      if (
        !Number.isInteger(
          groupId
        ) ||
        groupId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid group ID."
        });
      }

      if (!body) {
        return res.status(400).json({
          error:
            "Message cannot be empty."
        });
      }

      if (body.length > 5000) {
        return res.status(400).json({
          error:
            "Message is too long. Maximum is 5000 characters."
        });
      }

      const membership =
        await pool.query(
          `
          SELECT 1
          FROM group_members
          WHERE
            group_id = $1
            AND user_id = $2
          `,
          [
            groupId,
            senderId
          ]
        );

      if (
        membership.rows.length ===
        0
      ) {
        return res.status(403).json({
          error:
            "You are not a member of this group."
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO group_messages
            (
              group_id,
              sender_id,
              body
            )
          VALUES
            (
              $1,
              $2,
              $3
            )
          RETURNING
            id,
            group_id AS "groupId",
            sender_id AS "senderId",
            body,
            created_at AS "createdAt"
          `,
          [
            groupId,
            senderId,
            body
          ]
        );

      const message =
        result.rows[0];

      const senderResult =
        await pool.query(
          `
          SELECT name
          FROM users
          WHERE id = $1
          `,
          [senderId]
        );

      message.senderName =
        senderResult.rows[0]?.name ||
        "User";

      const membersResult =
        await pool.query(
          `
          SELECT user_id
          FROM group_members
          WHERE group_id = $1
          `,
          [groupId]
        );

      for (
        const member
        of membersResult.rows
      ) {
        io.to(
          `user:${member.user_id}`
        ).emit(
          "group-message",
          message
        );
      }

      res.status(201).json({
        message
      });
    } catch (error) {
      console.error(
        "GROUP MESSAGE SEND ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to send group message."
      });
    }
  }
);

/*
Leave Group
*/

app.post(
  "/api/groups/:groupId/leave",
  requireAuth,
  async (req, res) => {
    try {
      const groupId =
        Number(
          req.params.groupId
        );

      if (
        !Number.isInteger(
          groupId
        ) ||
        groupId <= 0
      ) {
        return res.status(400).json({
          error:
            "Invalid group ID."
        });
      }

      const groupResult =
        await pool.query(
          `
          SELECT
            id,
            name,
            created_by
          FROM groups
          WHERE id = $1
          `,
          [groupId]
        );

      const group =
        groupResult.rows[0];

      if (!group) {
        return res.status(404).json({
          error:
            "Group not found."
        });
      }

      if (
        Number(group.created_by) ===
        Number(req.userId)
      ) {
        return res.status(400).json({
          error:
            "The group creator cannot leave the group."
        });
      }

      const result =
        await pool.query(
          `
          DELETE FROM group_members
          WHERE
            group_id = $1
            AND user_id = $2
          `,
          [
            groupId,
            req.userId
          ]
        );

      if (
        result.rowCount === 0
      ) {
        return res.status(403).json({
          error:
            "You are not a member of this group."
        });
      }

      io.to(
        `user:${req.userId}`
      ).emit(
        "group-left",
        {
          groupId
        }
      );

      res.json({
        ok: true,
        message:
          "You left the group."
      });
    } catch (error) {
      console.error(
        "LEAVE GROUP ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Unable to leave the group."
      });
    }
  }
);

/*
Socket.IO
*/

const io = new Server(
  server,
  {
    cors: {
      origin: allowedOrigins,
      credentials: true,
      methods: [
        "GET",
        "POST"
      ]
    }
  }
);

io.use(
  (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token;

      if (!token) {
        return next(
          new Error(
            "Authentication required."
          )
        );
      }

      const decoded =
        jwt.verify(
          token,
          JWT_SECRET
        );

      socket.userId =
        decoded.userId;

      next();
    } catch (error) {
      console.error(
        "SOCKET AUTH ERROR:",
        error.message
      );

      next(
        new Error(
          "Authentication failed."
        )
      );
    }
  }
);

io.on(
  "connection",
  async socket => {
    const userId =
      Number(socket.userId);

    socket.join(
      `user:${userId}`
    );

    console.log(
      `User ${userId} connected to Socket.IO.`
    );

    /*
    Automatically join all groups
    that the user belongs to.
    */

    try {
      const groupsResult =
        await pool.query(
          `
          SELECT group_id
          FROM group_members
          WHERE user_id = $1
          `,
          [userId]
        );

      for (
        const group
        of groupsResult.rows
      ) {
        socket.join(
          `group:${group.group_id}`
        );
      }

      console.log(
        `User ${userId} joined ${groupsResult.rows.length} group room(s).`
      );
    } catch (error) {
      console.error(
        "SOCKET INITIAL GROUP JOIN ERROR:",
        error.message
      );
    }

    /*
    Manual group join
    */

    socket.on(
      "join-group",
      async groupId => {
        try {
          const numericGroupId =
            Number(groupId);

          if (
            !Number.isInteger(
              numericGroupId
            ) ||
            numericGroupId <= 0
          ) {
            return;
          }

          const membership =
            await pool.query(
              `
              SELECT 1
              FROM group_members
              WHERE
                group_id = $1
                AND user_id = $2
              `,
              [
                numericGroupId,
                userId
              ]
            );

          if (
            membership.rows.length >
            0
          ) {
            socket.join(
              `group:${numericGroupId}`
            );

            console.log(
              `User ${userId} joined Socket.IO group ${numericGroupId}.`
            );
          }
        } catch (error) {
          console.error(
            "SOCKET GROUP JOIN ERROR:",
            error.message
          );
        }
      }
    );

    /*
    Leave group room
    */

    socket.on(
      "leave-group",
      groupId => {
        const numericGroupId =
          Number(groupId);

        if (
          Number.isInteger(
            numericGroupId
          ) &&
          numericGroupId > 0
        ) {
          socket.leave(
            `group:${numericGroupId}`
          );
        }
      }
    );

    /*
    Disconnect
    */

    socket.on(
      "disconnect",
      () => {
        console.log(
          `User ${userId} disconnected from Socket.IO.`
        );
      }
    );
  }
);

/*
Static Frontend
*/

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);

/*
SPA Fallback
*/

app.get(
  "/{*splat}",
  (req, res, next) => {
    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "index.html"
      )
    );
  }
);

/*
Database + Server Startup
*/

async function startServer() {
  try {
    console.log("");
    console.log(
      "Connecting to PostgreSQL..."
    );

    if (databaseUrl) {
      console.log(
        `Database URL detected: ${
          isLocalDatabase
            ? "Local PostgreSQL"
            : "Online PostgreSQL"
        }`
      );

      console.log(
        `SSL: ${
          isLocalDatabase
            ? "Disabled"
            : "Enabled"
        }`
      );
    } else {
      console.log(
        "Using individual PostgreSQL environment variables."
      );
    }

    await pool.query(
      "SELECT 1"
    );

    console.log(
      "PostgreSQL connection successful."
    );

    await initializeDatabase();

    console.log("");
    console.log(
      "========================================"
    );
    console.log(
      " TeamSpace Chat Server"
    );
    console.log(
      "========================================"
    );
    console.log(
      " PostgreSQL connection successful."
    );
    console.log(
      ` Running on port: ${PORT}`
    );
    console.log(
      " Database: PostgreSQL"
    );
    console.log(
      " Authentication: JWT"
    );
    console.log(
      " Private Chat: Enabled"
    );
    console.log(
      " Group Chat: Enabled"
    );
    console.log(
      " Maximum Group Size: 200"
    );
    console.log(
      "========================================"
    );
    console.log("");

    server.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `TeamSpace server listening on port ${PORT}`
        );
      }
    );
  } catch (error) {
    console.error("");
    console.error(
      "========================================"
    );
    console.error(
      " DATABASE CONNECTION FAILED"
    );
    console.error(
      "========================================"
    );
    console.error(
      error.message
    );
    console.error("");

    if (
      isLocalDatabase
    ) {
      console.error(
        "Local PostgreSQL connection failed."
      );
      console.error(
        "Check that PostgreSQL is running and that DATABASE_URL in .env is correct."
      );
    } else {
      console.error(
        "Online PostgreSQL connection failed."
      );
      console.error(
        "Check your DATABASE_URL and database provider settings."
      );
    }

    console.error("");

    process.exit(1);
  }
}

startServer();

/*
Graceful Shutdown
*/

process.on(
  "SIGTERM",
  async () => {
    console.log(
      "SIGTERM received. Closing server..."
    );

    await pool.end();

    process.exit(0);
  }
);

process.on(
  "SIGINT",
  async () => {
    console.log(
      "SIGINT received. Closing server..."
    );

    await pool.end();

    process.exit(0);
  }
);