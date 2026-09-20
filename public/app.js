let currentUser = null;
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
  const date = new Date(String(dateString).replace(" ", "T") + "Z");

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function api(url, options = {}) {
  const config = {
    credentials: "same-origin",
    ...options
  };

  config.headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(url, config);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

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

    currentUser = data.user;

    await showApp();
  } catch (error) {
    console.error(error);
    authError.textContent = error.message;
  } finally {
    authButton.disabled = false;
    authButton.textContent = originalText;
  }
});

async function showApp() {
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  document.getElementById("myName").textContent = currentUser.name;
  document.getElementById("myEmail").textContent = currentUser.email;
  document.getElementById("myAvatar").textContent = initials(currentUser.name);

  if (!socket) {
    socket = io();

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
  }

  await loadUsers();
}

async function loadUsers() {
  try {
    const data = await api("/api/users");

    userList.innerHTML = "";

    if (!data.users.length) {
      userList.innerHTML = `
        <div class="no-users">
          No other accounts yet.<br><br>
          Open an Incognito/private browser window and create a second account to test messaging.
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

      item.addEventListener("click", () => selectUser(user));

      userList.appendChild(item);
    });
  } catch (error) {
    console.error(error);

    userList.innerHTML = `
      <div class="no-users">
        Unable to load contacts.<br>
        ${escapeHtml(error.message)}
      </div>
    `;
  }
}

async function selectUser(user) {
  selectedUser = user;

  document.querySelectorAll(".user-item").forEach(item => {
    item.classList.toggle(
      "selected",
      Number(item.dataset.id) === Number(user.id)
    );
  });

  chatUserName.textContent = user.name;
  chatStatus.textContent = user.email;
  chatUserAvatar.textContent = initials(user.name);

  messageForm.classList.remove("hidden");
  messageInput.focus();

  try {
    const data = await api(`/api/messages/${user.id}`);

    messagesBox.innerHTML = "";

    renderMessages(data.messages, false);
  } catch (error) {
    messagesBox.innerHTML = `
      <div class="empty-chat">
        <p>${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderMessages(messages, append) {
  if (!append) {
    messagesBox.innerHTML = "";
  }

  if (!messages.length && !append) {
    messagesBox.innerHTML = `
      <div class="empty-chat">
        <div class="empty-icon">👋</div>
        <h2>Start a conversation</h2>
        <p>Send ${escapeHtml(selectedUser.name)} your first message.</p>
      </div>
    `;
    return;
  }

  messages.forEach(message => {
    const mine =
      Number(message.senderId) === Number(currentUser.id);

    const row = document.createElement("div");
    row.className =
      `message-row${mine ? " mine" : ""}`;

    const bubble = document.createElement("div");
    bubble.className = "message";

    const body = document.createElement("div");
    body.className = "message-body";
    body.textContent = message.body;

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

messageForm.addEventListener("submit", async event => {
  event.preventDefault();

  const body = messageInput.value.trim();

  if (!body || !selectedUser) {
    return;
  }

  messageInput.value = "";

  try {
    const data = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        receiverId: selectedUser.id,
        body
      })
    });

    renderMessages([data.message], true);
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
});

messageInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    messageForm.requestSubmit();
  }
});

document
  .getElementById("refreshUsers")
  .addEventListener("click", loadUsers);

document
  .getElementById("logoutBtn")
  .addEventListener("click", async () => {
    try {
      await api("/api/logout", {
        method: "POST"
      });
    } finally {
      window.location.reload();
    }
  });

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  try {
    const data = await api("/api/me");

    currentUser = data.user;

    await showApp();
  } catch {
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
}

init();