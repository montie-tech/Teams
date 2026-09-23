const API_BASE_URL = window.location.hostname === "localhost"
  ? ""
  : "https://teams-88mx.onrender.com";let currentUser = null;

let selectedUser = null;
let socket = null;
let authMode = "login";

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

/*
  ========================================
  Authentication Token
  ========================================
*/

const TOKEN_KEY = "teamspace_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function saveToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

/*
  ========================================
  Helpers
  ========================================
*/

function initials(name) {
  return String(name)
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

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/*
  ========================================
  API Helper
  ========================================
*/

async function api(url, options = {}) {
  const fullUrl = `${API_BASE_URL}${url}`;

  const token = getToken();

  const headers = {
    ...(options.body
      ? {
          "Content-Type": "application/json"
        }
      : {}),
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
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
    if (response.status === 401) {
      removeToken();
    }

    throw new Error(
      data.error ||
        `Request failed (${response.status})`
    );
  }

  return data;
}

/*
  ========================================
  Login / Register Tabs
  ========================================
*/

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
      authMode === "register"
        ? "Create account"
        : "Sign in";

    passwordInput.autocomplete =
      authMode === "register"
        ? "new-password"
        : "current-password";

    authError.textContent = "";
  });
});

/*
  ========================================
  Login / Registration
  ========================================
*/

authForm.addEventListener("submit", async event => {
  event.preventDefault();

  authError.textContent = "";
  authButton.disabled = true;

  const originalText = authButton.textContent;

  authButton.textContent =
    authMode === "register"
      ? "Creating account..."
      : "Signing in...";

  try {
    const endpoint =
      authMode === "register"
        ? "/api/register"
        : "/api/login";

    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value
    };

    if (authMode === "register") {
      payload.name = nameInput.value.trim();
    }

    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    /*
      Save the JWT returned by Render.
    */
    saveToken(data.token);

    currentUser = data.user;

    /*
      Show the TeamSpace application.
    */
    await showApp();
  } catch (error) {
    console.error(error);

    authError.textContent =
      error.message;
  } finally {
    authButton.disabled = false;
    authButton.textContent = originalText;
  }
});

/*
  ========================================
  Show Application
  ========================================
*/

async function showApp() {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  document.getElementById("myName").textContent =
    currentUser.name;

  document.getElementById("myEmail").textContent =
    currentUser.email;

  document.getElementById("myAvatar").textContent =
    initials(currentUser.name);

  /*
    Connect Socket.IO using JWT.
  */
  connectSocket();

  /*
    Load all registered users except yourself.
  */
  await loadUsers();
}

/*
  ========================================
  Socket.IO
  ========================================
*/

function connectSocket() {
  const token = getToken();

  if (!token) {
    console.warn(
      "No authentication token available for Socket.IO."
    );
    return;
  }

  /*
    Don't create duplicate connections.
  */
  if (socket) {
    return;
  }

  socket = io(API_BASE_URL, {
    auth: {
      token
    },
    withCredentials: true
  });

  socket.on("connect", () => {
    console.log(
      "Connected to TeamSpace real-time server."
    );
  });

  socket.on("connect_error", error => {
    console.error(
      "Socket.IO error:",
      error.message
    );
  });

  socket.on("new-message", message => {
    /*
      Only display the message immediately if
      the sender is the currently selected person.
    */
    if (
      selectedUser &&
      Number(message.senderId) ===
        Number(selectedUser.id)
    ) {
      renderMessages([message], true);
    }
  });

  socket.on("message-sent", message => {
    /*
      The sender already renders the response
      returned by POST /api/messages.

      Therefore we don't render this event again,
      otherwise the sender would see duplicates.
    */
    console.log(
      "Message sent successfully:",
      message
    );
  });

  socket.on("disconnect", reason => {
    console.log(
      "Disconnected from TeamSpace real-time server:",
      reason
    );
  });
}

/*
  ========================================
  Load Users
  ========================================
*/

async function loadUsers() {
  try {
    const data = await api("/api/users");

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
    console.error(
      "Unable to load users:",
      error
    );

    /*
      If the JWT expired or is invalid,
      return to login.
    */
    if (
      error.message.includes("session has expired") ||
      error.message.includes("logged in")
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

/*
  ========================================
  Select User
  ========================================
*/

async function selectUser(user) {
  selectedUser = user;

  document.querySelectorAll(".user-item").forEach(item => {
    item.classList.toggle(
      "selected",
      Number(item.dataset.id) ===
        Number(user.id)
    );
  });

  chatUserName.textContent =
    user.name;

  chatStatus.textContent =
    user.email;

  chatUserAvatar.textContent =
    initials(user.name);

  messageForm.classList.remove("hidden");

  messageInput.focus();

  try {
    const data = await api(
      `/api/messages/${user.id}`
    );

    messagesBox.innerHTML = "";

    renderMessages(
      data.messages,
      false
    );
  } catch (error) {
    console.error(
      "Unable to load messages:",
      error
    );

    messagesBox.innerHTML = `
      <div class="empty-chat">
        <p>
          ${escapeHtml(error.message)}
        </p>
      </div>
    `;
  }
}

/*
  ========================================
  Render Messages
  ========================================
*/

function renderMessages(messages, append) {
  if (!append) {
    messagesBox.innerHTML = "";
  }

  if (!messages.length && !append) {
    messagesBox.innerHTML = `
      <div class="empty-chat">
        <div class="empty-icon">👋</div>

        <h2>
          Start a conversation
        </h2>

        <p>
          Send
          ${escapeHtml(selectedUser.name)}
          your first message.
        </p>
      </div>
    `;

    return;
  }

  messages.forEach(message => {
    const mine =
      Number(message.senderId) ===
      Number(currentUser.id);

    const row =
      document.createElement("div");

    row.className =
      `message-row${mine ? " mine" : ""}`;

    const bubble =
      document.createElement("div");

    bubble.className = "message";

    const body =
      document.createElement("div");

    body.className =
      "message-body";

    body.textContent =
      message.body;

    const time =
      document.createElement("div");

    time.className =
      "message-time";

    time.textContent =
      formatTime(
        message.createdAt
      );

    bubble.appendChild(body);
    bubble.appendChild(time);

    row.appendChild(bubble);

    messagesBox.appendChild(row);
  });

  messagesBox.scrollTop =
    messagesBox.scrollHeight;
}

/*
  ========================================
  Send Message
  ========================================
*/

messageForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const body =
      messageInput.value.trim();

    if (!body || !selectedUser) {
      return;
    }

    /*
      Clear input immediately.
    */
    messageInput.value = "";

    try {
      const data = await api(
        "/api/messages",
        {
          method: "POST",

          body: JSON.stringify({
            receiverId:
              selectedUser.id,

            body
          })
        }
      );

      /*
        Render the message returned by
        the backend.
      */
      renderMessages(
        [data.message],
        true
      );
    } catch (error) {
      console.error(
        "Unable to send message:",
        error
      );

      /*
        Restore the text if sending fails.
      */
      messageInput.value = body;

      alert(error.message);
    }
  }
);

/*
  ========================================
  Enter to Send
  ========================================
*/

messageInput.addEventListener(
  "keydown",
  event => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      messageForm.requestSubmit();
    }
  }
);

/*
  ========================================
  Refresh Users
  ========================================
*/

document
  .getElementById("refreshUsers")
  .addEventListener(
    "click",
    loadUsers
  );

/*
  ========================================
  Logout
  ========================================
*/

document
  .getElementById("logoutBtn")
  .addEventListener(
    "click",
    async () => {
      try {
        /*
          Tell the backend about logout.
        */
        await api(
          "/api/logout",
          {
            method: "POST"
          }
        );
      } catch (error) {
        console.error(
          "Logout request failed:",
          error
        );
      } finally {
        /*
          JWT is stored in localStorage,
          so we must remove it ourselves.
        */
        removeToken();

        /*
          Close Socket.IO.
        */
        if (socket) {
          socket.disconnect();
          socket = null;
        }

        currentUser = null;
        selectedUser = null;

        /*
          Return to login screen.
        */
        appScreen.classList.add(
          "hidden"
        );

        authScreen.classList.remove(
          "hidden"
        );

        authForm.reset();

        authError.textContent = "";

        /*
          Reset to login mode.
        */
        authMode = "login";

        document
          .querySelectorAll(".tab")
          .forEach(tab => {
            tab.classList.remove(
              "active"
            );
          });

        const loginTab =
          document.querySelector(
            '.tab[data-mode="login"]'
          );

        if (loginTab) {
          loginTab.classList.add(
            "active"
          );
        }

        nameGroup.classList.add(
          "hidden"
        );

        authButton.textContent =
          "Sign in";
      }
    }
  );

/*
  ========================================
  Escape HTML
  ========================================
*/

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
  ========================================
  Authentication Failure
  ========================================
*/

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

/*
  ========================================
  Application Initialization
  ========================================
*/

async function init() {
  const token = getToken();

  /*
    No token means the user has not logged in.
  */
  if (!token) {
    authScreen.classList.remove(
      "hidden"
    );

    appScreen.classList.add(
      "hidden"
    );

    return;
  }

  try {
    /*
      Verify the JWT with Render.
    */
    const data =
      await api("/api/me");

    currentUser =
      data.user;

    await showApp();
  } catch (error) {
    console.error(
      "Authentication check failed:",
      error
    );

    removeToken();

    authScreen.classList.remove(
      "hidden"
    );

    appScreen.classList.add(
      "hidden"
    );
  }
}

init();