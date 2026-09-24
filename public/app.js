const API_BASE_URL = window.location.hostname === "localhost"
  ? ""
  : "https://teams-88mx.onrender.com";

let currentUser = null;
let selectedUser = null;
let socket = null;
let authMode = "login";
let authToken = null;

const TOKEN_KEY = "teamspace_token";

// DOM elements
const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");
const authForm = document.getElementById("authForm");
const authError = document.getElementById("authError");
const authButton = document.getElementById("authButton");
const nameGroup = document.getElementById("nameGroup");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const userList = document.getElementById("userList");
const messagesBox = document.getElementById("messages");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const chatUserName = document.getElementById("chatUserName");
const chatStatus = document.getElementById("chatStatus");
const chatUserAvatar = document.getElementById("chatUserAvatar");

// Authentication token helpers
function getToken() {
  return authToken || localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
  if (!token) return false;

  authToken = token;
  localStorage.setItem(TOKEN_KEY, token);
  return true;
}

function removeToken() {
  authToken = null;
  localStorage.removeItem(TOKEN_KEY);
}

// General helpers
function initials(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

function formatTime(dateString) {
  const raw = String(dateString || "");
  let date;

  if (raw.includes("T")) {
    date = new Date(raw);
  } else {
    date = new Date(raw.replace(" ", "T") + "Z");
  }

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// API helper
async function api(url, options = {}, tokenOverride = null) {
  const fullUrl = API_BASE_URL + url;
  const token = tokenOverride || getToken();

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = "Bearer " + token;
  }

  const config = {
    ...options,
    credentials: "include",
    headers
  };

  const response = await fetch(fullUrl, config);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    // Do not clear an existing token on a failed login/register request.
    const isAuthRequest =
      url === "/api/login" || url === "/api/register";

    if (response.status === 401 && token && !isAuthRequest) {
      removeToken();
    }

    throw new Error(
      data.error || "Request failed (" + response.status + ")"
    );
  }

  return data;
}

// Login and register tabs
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(item => {
      item.classList.remove("active");
    });

    tab.classList.add("active");
    authMode = tab.dataset.mode;

    nameGroup.classList.toggle(
      "hidden",
      authMode !== "register"
    );

    authButton.textContent =
      authMode === "register" ? "Create account" : "Sign in";

    passwordInput.autocomplete =
      authMode === "register" ? "new-password" : "current-password";

    authError.textContent = "";
  });
});

// Login and registration
authForm.addEventListener("submit", async event => {
  event.preventDefault();

  authError.textContent = "";
  authButton.disabled = true;

  const originalText = authButton.textContent;
  authButton.textContent =
    authMode === "register" ? "Creating account..." : "Signing in...";

  try {
    const endpoint =
      authMode === "register" ? "/api/register" : "/api/login";

    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value
    };

    if (authMode === "register") {
      payload.name = nameInput.value.trim();
    }

    // Login/register requests do not need an existing token.
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    }, null);

    if (!data.token) {
      throw new Error(
        "The server did not return an authentication token. Please try again."
      );
    }

    if (!saveToken(data.token)) {
      throw new Error("Could not save the authentication token.");
    }

    if (!data.user) {
      throw new Error("The server did not return the user profile.");
    }

    currentUser = data.user;
    console.log("Authentication token saved successfully.");

    // Pass the freshly received token directly into the app.
    await showApp(data.token);

  } catch (error) {
    console.error("Sign-in or registration error:", error);
    authError.textContent = error.message || "Unable to sign in.";
  } finally {
    authButton.disabled = false;
    authButton.textContent = originalText;
  }
});

// Show the main application
async function showApp(tokenOverride = null) {
  if (!currentUser) {
    throw new Error("Unable to open TeamSpace: user profile is missing.");
  }

  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  document.getElementById("myName").textContent =
    currentUser.name || "";

  document.getElementById("myEmail").textContent =
    currentUser.email || "";

  document.getElementById("myAvatar").textContent =
    initials(currentUser.name);

  // Load contacts with the newly received token before connecting sockets.
  await loadUsers(tokenOverride);
  connectSocket(tokenOverride);
}

// Socket.IO connection
function connectSocket(tokenOverride = null) {
  const token = tokenOverride || getToken();

  if (!token) {
    console.warn("No authentication token available for Socket.IO.");
    return;
  }

  if (socket) return;

  if (typeof io !== "function") {
    console.error(
      "Socket.IO client did not load. Check the Socket.IO script in index.html."
    );
    return;
  }

  socket = io(API_BASE_URL, {
    auth: { token },
    withCredentials: true
  });

  socket.on("connect", () => {
    console.log("Connected to TeamSpace real-time server.");
  });

  socket.on("connect_error", error => {
    console.error("Socket.IO error:", error.message);
  });

  socket.on("new-message", message => {
    if (
      selectedUser &&
      Number(message.senderId) === Number(selectedUser.id)
    ) {
      renderMessages([message], true);
    }
  });

  socket.on("message-sent", message => {
    console.log("Message sent successfully:", message);
  });

  socket.on("disconnect", reason => {
    console.log("Disconnected from TeamSpace:", reason);
  });
}

// Load contacts
async function loadUsers(tokenOverride = null) {
  try {
    const data = await api("/api/users", {}, tokenOverride);

    userList.innerHTML = "";

    if (!data.users || !data.users.length) {
      userList.innerHTML = `
        <div class="no-users">
          No other accounts yet.<br><br>
          Open an Incognito/private browser window
          and create a second account to test messaging.
        </div>
      `;
      return;
    }

    data.users.forEach(user => {
      const item = document.createElement("div");
      item.className = "user-item";
      item.dataset.id = user.id;

      const avatar = document.createElement("div");
      avatar.className = "user-avatar";
      avatar.textContent = initials(user.name);

      const info = document.createElement("div");
      info.className = "user-info";

      const name = document.createElement("strong");
      name.textContent = user.name;

      const email = document.createElement("span");
      email.textContent = user.email;

      info.appendChild(name);
      info.appendChild(email);
      item.appendChild(avatar);
      item.appendChild(info);

      item.addEventListener("click", () => {
        selectUser(user);
      });

      userList.appendChild(item);
    });

  } catch (error) {
    console.error("Unable to load users:", error);

    const message = String(error.message || "");

    if (
      message.toLowerCase().includes("session has expired") ||
      message.toLowerCase().includes("logged in") ||
      message.toLowerCase().includes("authentication") ||
      message.toLowerCase().includes("unauthorized")
    ) {
      handleAuthenticationFailure();
      return;
    }

    userList.innerHTML = `
      <div class="no-users">
        Unable to load contacts.<br>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

// Select a contact and load conversation
async function selectUser(user) {
  selectedUser = user;

  document.querySelectorAll(".user-item").forEach(item => {
    item.classList.toggle(
      "selected",
      Number(item.dataset.id) === Number(user.id)
    );
  });

  chatUserName.textContent = user.name || "";
  chatStatus.textContent = user.email || "";
  chatUserAvatar.textContent = initials(user.name);

  messageForm.classList.remove("hidden");
  messageInput.focus();

  try {
    const data = await api("/api/messages/" + encodeURIComponent(user.id));

    messagesBox.innerHTML = "";
    renderMessages(data.messages || [], false);

  } catch (error) {
    console.error("Unable to load messages:", error);

    messagesBox.innerHTML = `
      <div class="empty-chat">
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

// Render chat messages
function renderMessages(messages, append) {
  if (!append) {
    messagesBox.innerHTML = "";
  }

  if (!messages.length && !append) {
    messagesBox.innerHTML = `
      <div class="empty-chat">
        <div class="empty-icon">👋</div>
        <h2>Start a conversation</h2>
        <p>
          Send ${escapeHtml(selectedUser ? selectedUser.name : "this person")}
          your first message.
        </p>
      </div>
    `;
    return;
  }

  messages.forEach(message => {
    const mine =
      Number(message.senderId) === Number(currentUser.id);

    const row = document.createElement("div");
    row.className = "message-row" + (mine ? " mine" : "");

    const bubble = document.createElement("div");
    bubble.className = "message";

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = message.body || "";

    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = formatTime(message.createdAt);

    bubble.appendChild(body);
    bubble.appendChild(time);
    row.appendChild(bubble);
    messagesBox.appendChild(row);
  });

  messagesBox.scrollTop = messagesBox.scrollHeight;
}

// Send a message
messageForm.addEventListener("submit", async event => {
  event.preventDefault();

  const body = messageInput.value.trim();

  if (!body || !selectedUser) return;

  messageInput.value = "";

  try {
    const data = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        receiverId: selectedUser.id,
        body
      })
    });

    if (data.message) {
      renderMessages([data.message], true);
    }

  } catch (error) {
    console.error("Unable to send message:", error);
    messageInput.value = body;
    alert(error.message);
  }
});

// Enter sends; Shift+Enter inserts a line break.
messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

// Refresh contacts
document.getElementById("refreshUsers").addEventListener("click", () => {
  loadUsers();
});

// Log out
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch (error) {
    console.error("Logout request failed:", error);
  } finally {
    removeToken();

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    currentUser = null;
    selectedUser = null;

    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");

    authForm.reset();
    authError.textContent = "";
    authMode = "login";

    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.remove("active");
    });

    const loginTab = document.querySelector(
      '.tab[data-mode="login"]'
    );

    if (loginTab) {
      loginTab.classList.add("active");
    }

    nameGroup.classList.add("hidden");
    authButton.textContent = "Sign in";
  }
});

// Handle expired/invalid authentication
function handleAuthenticationFailure() {
  removeToken();

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentUser = null;
  selectedUser = null;

  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");

  authError.textContent =
    "Your session has expired. Please sign in again.";
}

// Initialize app and restore existing login if a token is stored.
async function init() {
  const storedToken = localStorage.getItem(TOKEN_KEY);

  if (storedToken) {
    authToken = storedToken;
  }

  const token = getToken();

  if (!token) {
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
    return;
  }

  try {
    const data = await api("/api/me", {}, token);

    currentUser = data.user;
    await showApp(token);

  } catch (error) {
    console.error("Authentication check failed:", error);
    removeToken();

    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
}

init();