# TeamSpace — Complete Corrected Project

This is a Microsoft Teams-inspired private messaging application.

## Technology

- HTML
- CSS
- Vanilla JavaScript
- Node.js
- Express 5
- SQLite
- Socket.IO
- bcryptjs

## Folder structure

```text
TeamSpace-Corrected/
├── package.json
├── server.js
├── README.md
├── .gitignore
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

The SQLite database `teams_chat.db` is created automatically after the server starts.

## Windows setup

Open this folder in VS Code.

Open Terminal > New Terminal.

Run:

```powershell
npm install
```

Then:

```powershell
npm start
```

You should see:

```text
========================================
 TeamSpace Chat Server
========================================
 Running at: http://localhost:3000
 Database: teams_chat.db
========================================
```

Open Chrome and go to:

```text
http://localhost:3000
```

## IMPORTANT

Do NOT double-click `public/index.html`.

Do NOT run the frontend using VS Code Live Server.

The website must be opened through:

```text
http://localhost:3000
```

The Node.js server provides both the website and the API.

## Test two users

1. Create Account A.
2. Open Chrome Incognito.
3. Go to `http://localhost:3000`.
4. Create Account B.
5. Log into Account A in normal Chrome.
6. Log into Account B in Incognito.
7. Account A should see Account B under Contacts.
8. Account B should see Account A under Contacts.
9. Send messages between the two accounts.

Messages are stored in:

```text
teams_chat.db
```

## API health test

With the server running, open:

```text
http://localhost:3000/api/health
```

You should see JSON similar to:

```json
{
  "ok": true,
  "message": "TeamSpace backend is running."
}
```

## If npm install fails

Check Node.js:

```powershell
node -v
npm -v
```

Node.js 18+ is recommended.

## Production improvements

Before publishing publicly, add:

- HTTPS
- Secure production session store
- Environment variables
- Rate limiting
- CSRF protection
- Email verification
- Password reset
- User blocking/reporting
- Group chats
- Teams
- Channels
- File uploads
- Profile pictures
- Online presence
- Typing indicators
- Push notifications
- PostgreSQL or MySQL
