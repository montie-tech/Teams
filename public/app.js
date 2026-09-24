const API_BASE_URL = window.location.hostname === "localhost"
  ? ""
  : "https://teams-88mx.onrender.com";

let currentUser = null;
let selectedUser = null;
let selectedGroup = null;
let socket = null;
let authMode = "login";
let authToken = null;
let availableUsers = [];

const TOKEN_KEY = "teamspace_token";

/*
DOM elements
*/

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
Authentication token helpers
*/

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

/*
General helpers
*/

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

/*
API helper
*/

async function api(url, options = {}, tokenOverride = null) {
  const fullUrl = API_BASE_URL + url;
  const token = tokenOverride || getToken();

  const headers = {
    ...(options.body
      ? { "Content-Type": "application/json" }
      : {}),
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
    const isAuthRequest =
      url === "/api/login" ||
      url === "/api/register";

    if (response.status === 401 && token && !isAuthRequest) {
      removeToken();
    }

    throw new Error(
      data.error ||
      "Request failed (" + response.status + ")"
    );
  }

  return data;
}

/*
Login and register tabs
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
Login and registration
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

    const data = await api(
      endpoint,
      {
        method: "POST",
        body: JSON.stringify(payload)
      },
      null
    );

    if (!data.token) {
      throw new Error(
        "The server did not return an authentication token."
      );
    }

    saveToken(data.token);

    if (!data.user) {
      throw new Error(
        "The server did not return the user profile."
      );
    }

    currentUser = data.user;

    await showApp(data.token);

  } catch (error) {
    console.error(
      "Sign-in or registration error:",
      error
    );

    authError.textContent =
      error.message ||
      "Unable to sign in.";
  } finally {
    authButton.disabled = false;
    authButton.textContent = originalText;
  }
});

/*
Create group interface
*/

function createGroupInterface() {
  if (document.getElementById("teamspaceGroupButton")) {
    return;
  }

  const sidebar =
    userList.parentElement;

  const groupButton =
    document.createElement("button");

  groupButton.id =
    "teamspaceGroupButton";

  groupButton.type = "button";

  groupButton.textContent =
    "+ Create Group";

  groupButton.style.width = "100%";
  groupButton.style.marginBottom = "12px";
  groupButton.style.padding = "10px 14px";
  groupButton.style.border = "none";
  groupButton.style.borderRadius = "8px";
  groupButton.style.cursor = "pointer";
  groupButton.style.fontWeight = "600";

  groupButton.addEventListener(
    "click",
    openCreateGroupModal
  );

  sidebar.insertBefore(
    groupButton,
    userList
  );

  const groupsTitle =
    document.createElement("div");

  groupsTitle.id =
    "teamspaceGroupsTitle";

  groupsTitle.textContent =
    "Groups";

  groupsTitle.style.fontWeight = "700";
  groupsTitle.style.margin = "16px 0 8px";

  sidebar.insertBefore(
    groupsTitle,
    userList
  );

  const groupsList =
    document.createElement("div");

  groupsList.id =
    "teamspaceGroupsList";

  sidebar.insertBefore(
    groupsList,
    userList
  );
}

/*
Create Group Modal
*/

function openCreateGroupModal() {
  const existing =
    document.getElementById(
      "teamspaceGroupModal"
    );

  if (existing) {
    existing.remove();
  }

  const overlay =
    document.createElement("div");

  overlay.id =
    "teamspaceGroupModal";

  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background =
    "rgba(0, 0, 0, 0.55)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent =
    "center";
  overlay.style.zIndex = "9999";
  overlay.style.padding = "20px";

  const modal =
    document.createElement("div");

  modal.style.background = "#fff";
  modal.style.width = "100%";
  modal.style.maxWidth = "480px";
  modal.style.maxHeight = "90vh";
  modal.style.overflowY = "auto";
  modal.style.borderRadius = "14px";
  modal.style.padding = "24px";
  modal.style.boxSizing = "border-box";

  modal.innerHTML = `
    <h2 style="margin-top:0;">
      Create Group
    </h2>

    <label style="display:block;margin-bottom:6px;font-weight:600;">
      Group name
    </label>

    <input
      id="teamspaceGroupName"
      type="text"
      maxlength="150"
      placeholder="e.g. Development Team"
      style="
        width:100%;
        box-sizing:border-box;
        padding:12px;
        border:1px solid #ccc;
        border-radius:8px;
        margin-bottom:18px;
      "
    >

    <label style="display:block;margin-bottom:8px;font-weight:600;">
      Select members
    </label>

    <div
      id="teamspaceMemberSelection"
      style="
        max-height:250px;
        overflow-y:auto;
        border:1px solid #ddd;
        border-radius:8px;
        padding:8px;
      "
    ></div>

    <div
      id="teamspaceGroupError"
      style="
        color:#c62828;
        margin-top:12px;
        min-height:20px;
      "
    ></div>

    <div style="
      display:flex;
      gap:10px;
      justify-content:flex-end;
      margin-top:18px;
    ">
      <button
        id="teamspaceCancelGroup"
        type="button"
        style="
          padding:10px 16px;
          border:1px solid #ccc;
          background:#fff;
          border-radius:8px;
          cursor:pointer;
        "
      >
        Cancel
      </button>

      <button
        id="teamspaceCreateGroup"
        type="button"
        style="
          padding:10px 16px;
          border:none;
          background:#1f5eff;
          color:#fff;
          border-radius:8px;
          cursor:pointer;
          font-weight:600;
        "
      >
        Create Group
      </button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const memberSelection =
    document.getElementById(
      "teamspaceMemberSelection"
    );

  if (!availableUsers.length) {
    memberSelection.innerHTML = `
      <div style="padding:15px;text-align:center;">
        No other users are available.
      </div>
    `;
  } else {
    availableUsers.forEach(user => {
      const label =
        document.createElement("label");

      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.gap = "10px";
      label.style.padding = "10px";
      label.style.cursor = "pointer";
      label.style.borderRadius = "6px";

      label.innerHTML = `
        <input
          type="checkbox"
          value="${user.id}"
        >

        <span>
          <strong>
            ${escapeHtml(user.name)}
          </strong>
          <br>
          <small>
            ${escapeHtml(user.email)}
          </small>
        </span>
      `;

      memberSelection.appendChild(label);
    });
  }

  document
    .getElementById("teamspaceCancelGroup")
    .addEventListener("click", () => {
      overlay.remove();
    });

  document
    .getElementById("teamspaceCreateGroup")
    .addEventListener(
      "click",
      createGroup
    );

  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });
}

/*
Create group
*/

async function createGroup() {
  const nameInputElement =
    document.getElementById(
      "teamspaceGroupName"
    );

  const errorElement =
    document.getElementById(
      "teamspaceGroupError"
    );

  const createButton =
    document.getElementById(
      "teamspaceCreateGroup"
    );

  const name =
    nameInputElement.value.trim();

  const checked =
    document.querySelectorAll(
      "#teamspaceMemberSelection input[type='checkbox']:checked"
    );

  const memberIds =
    Array.from(checked).map(
      checkbox => Number(checkbox.value)
    );

  errorElement.textContent = "";

  if (!name) {
    errorElement.textContent =
      "Please enter a group name.";

    return;
  }

  if (!memberIds.length) {
    errorElement.textContent =
      "Select at least one other user.";

    return;
  }

  createButton.disabled = true;
  createButton.textContent =
    "Creating...";

  try {
    const data = await api(
      "/api/groups",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          memberIds
        })
      }
    );

    document
      .getElementById(
        "teamspaceGroupModal"
      )
      ?.remove();

    await loadGroups();

    if (data.group) {
      selectGroup(data.group);
    }

  } catch (error) {
    console.error(
      "Create group error:",
      error
    );

    errorElement.textContent =
      error.message ||
      "Unable to create group.";

    createButton.disabled = false;
    createButton.textContent =
      "Create Group";
  }
}

/*
Load groups
*/

async function loadGroups() {
  const groupsList =
    document.getElementById(
      "teamspaceGroupsList"
    );

  if (!groupsList) return;

  try {
    const data =
      await api("/api/groups");

    groupsList.innerHTML = "";

    if (
      !data.groups ||
      !data.groups.length
    ) {
      groupsList.innerHTML = `
        <div
          style="
            padding:8px;
            font-size:13px;
            opacity:.7;
          "
        >
          No groups yet.
        </div>
      `;

      return;
    }

    data.groups.forEach(group => {
      const item =
        document.createElement("div");

      item.className =
        "user-item teamspace-group-item";

      item.dataset.groupId =
        group.id;

      const avatar =
        document.createElement("div");

      avatar.className =
        "user-avatar";

      avatar.textContent =
        initials(group.name) || "G";

      const info =
        document.createElement("div");

      info.className =
        "user-info";

      const name =
        document.createElement("strong");

      name.textContent =
        group.name;

      const members =
        document.createElement("span");

      members.textContent =
        group.memberCount +
        " member" +
        (Number(group.memberCount) === 1
          ? ""
          : "s");

      info.appendChild(name);
      info.appendChild(members);

      item.appendChild(avatar);
      item.appendChild(info);

      item.addEventListener(
        "click",
        () => selectGroup(group)
      );

      groupsList.appendChild(item);
    });

  } catch (error) {
    console.error(
      "Unable to load groups:",
      error
    );

    groupsList.innerHTML = `
      <div style="padding:8px;color:#c62828;">
        Unable to load groups.
      </div>
    `;
  }
}

/*
Select group
*/

async function selectGroup(group) {
  selectedGroup = group;
  selectedUser = null;

  document
    .querySelectorAll(".user-item")
    .forEach(item => {
      item.classList.remove(
        "selected"
      );
    });

  const groupItem =
    document.querySelector(
      `.teamspace-group-item[data-group-id="${group.id}"]`
    );

  if (groupItem) {
    groupItem.classList.add(
      "selected"
    );
  }

  chatUserName.textContent =
    group.name || "Group";

  chatStatus.textContent =
    group.memberCount +
    " member" +
    (Number(group.memberCount) === 1
      ? ""
      : "s");

  chatUserAvatar.textContent =
    initials(group.name) || "G";

  messageForm.classList.remove(
    "hidden"
  );

  messageInput.focus();

  if (socket) {
    socket.emit(
      "join-group",
      group.id
    );
  }

  try {
    const data = await api(
      "/api/groups/" +
      encodeURIComponent(group.id) +
      "/messages"
    );

    messagesBox.innerHTML = "";

    renderGroupMessages(
      data.messages || [],
      false
    );

  } catch (error) {
    console.error(
      "Unable to load group messages:",
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
Render group messages
*/

function renderGroupMessages(
  messages,
  append
) {
  if (!append) {
    messagesBox.innerHTML = "";
  }

  if (
    !messages.length &&
    !append
  ) {
    messagesBox.innerHTML = `
      <div class="empty-chat">
        <div class="empty-icon">👥</div>
        <h2>Start the group conversation</h2>
        <p>
          Send the first message to
          ${escapeHtml(
            selectedGroup?.name || "the group"
          )}.
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
      "message-row" +
      (mine ? " mine" : "");

    const bubble =
      document.createElement("div");

    bubble.className =
      "message";

    if (!mine) {
      const sender =
        document.createElement("div");

      sender.style.fontWeight =
        "700";

      sender.style.fontSize =
        "12px";

      sender.style.marginBottom =
        "4px";

      sender.textContent =
        message.senderName ||
        "User";

      bubble.appendChild(sender);
    }

    const body =
      document.createElement("div");

    body.className =
      "message-body";

    body.textContent =
      message.body || "";

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
Show main application
*/

async function showApp(
  tokenOverride = null
) {
  if (!currentUser) {
    throw new Error(
      "Unable to open TeamSpace: user profile is missing."
    );
  }

  authScreen.classList.add(
    "hidden"
  );

  appScreen.classList.remove(
    "hidden"
  );

  document.getElementById(
    "myName"
  ).textContent =
    currentUser.name || "";

  document.getElementById(
    "myEmail"
  ).textContent =
    currentUser.email || "";

  document.getElementById(
    "myAvatar"
  ).textContent =
    initials(currentUser.name);

  createGroupInterface();

  await loadUsers(
    tokenOverride
  );

  await loadGroups();

  connectSocket(
    tokenOverride
  );
}

/*
Socket.IO connection
*/

function connectSocket(
  tokenOverride = null
) {
  const token =
    tokenOverride || getToken();

  if (!token) {
    console.warn(
      "No authentication token available for Socket.IO."
    );

    return;
  }

  if (socket) return;

  if (typeof io !== "function") {
    console.error(
      "Socket.IO client did not load. Check index.html."
    );

    return;
  }

  socket = io(
    API_BASE_URL,
    {
      auth: {
        token
      },
      withCredentials: true
    }
  );

  socket.on(
    "connect",
    () => {
      console.log(
        "Connected to TeamSpace real-time server."
      );

      if (selectedGroup) {
        socket.emit(
          "join-group",
          selectedGroup.id
        );
      }
    }
  );

  socket.on(
    "connect_error",
    error => {
      console.error(
        "Socket.IO error:",
        error.message
      );
    }
  );

  socket.on(
    "new-message",
    message => {
      if (
        selectedUser &&
        Number(message.senderId) ===
          Number(selectedUser.id)
      ) {
        renderMessages(
          [message],
          true
        );
      }
    }
  );

  socket.on(
    "message-sent",
    message => {
      console.log(
        "Private message sent:",
        message
      );
    }
  );

  socket.on(
    "group-message",
    message => {
      if (
        selectedGroup &&
        Number(message.groupId) ===
          Number(selectedGroup.id)
      ) {
        renderGroupMessages(
          [message],
          true
        );
      }
    }
  );

  socket.on(
    "group-created",
    group => {
      loadGroups();
    }
  );

  socket.on(
    "group-left",
    data => {
      if (
        selectedGroup &&
        Number(selectedGroup.id) ===
          Number(data.groupId)
      ) {
        selectedGroup = null;
        messagesBox.innerHTML = `
          <div class="empty-chat">
            <p>
              You left this group.
            </p>
          </div>
        `;

        chatUserName.textContent =
          "Select a conversation";

        chatStatus.textContent = "";

        chatUserAvatar.textContent =
          "";

        messageForm.classList.add(
          "hidden"
        );
      }

      loadGroups();
    }
  );

  socket.on(
    "disconnect",
    reason => {
      console.log(
        "Disconnected from TeamSpace:",
        reason
      );
    }
  );
}

/*
Load contacts
*/

async function loadUsers(
  tokenOverride = null
) {
  try {
    const data =
      await api(
        "/api/users",
        {},
        tokenOverride
      );

    availableUsers =
      data.users || [];

    userList.innerHTML = "";

    if (!availableUsers.length) {
      userList.innerHTML = `
        <div class="no-users">
          No other accounts yet.<br><br>
          Open an Incognito/private browser window
          and create a second account to test messaging.
        </div>
      `;

      return;
    }

    availableUsers.forEach(
      user => {
        const item =
          document.createElement("div");

        item.className =
          "user-item";

        item.dataset.id =
          user.id;

        const avatar =
          document.createElement("div");

        avatar.className =
          "user-avatar";

        avatar.textContent =
          initials(user.name);

        const info =
          document.createElement("div");

        info.className =
          "user-info";

        const name =
          document.createElement(
            "strong"
          );

        name.textContent =
          user.name;

        const email =
          document.createElement(
            "span"
          );

        email.textContent =
          user.email;

        info.appendChild(name);
        info.appendChild(email);

        item.appendChild(avatar);
        item.appendChild(info);

        item.addEventListener(
          "click",
          () => selectUser(user)
        );

        userList.appendChild(item);
      }
    );

  } catch (error) {
    console.error(
      "Unable to load users:",
      error
    );

    const message =
      String(
        error.message || ""
      );

    if (
      message
        .toLowerCase()
        .includes("session has expired") ||
      message
        .toLowerCase()
        .includes("logged in") ||
      message
        .toLowerCase()
        .includes("authentication") ||
      message
        .toLowerCase()
        .includes("unauthorized")
    ) {
      handleAuthenticationFailure();
      return;
    }

    userList.innerHTML = `
      <div class="no-users">
        Unable to load contacts.<br>
        ${escapeHtml(
          error.message
        )}
      </div>
    `;
  }
}

/*
Select private contact
*/

async function selectUser(user) {
  selectedUser = user;
  selectedGroup = null;

  document
    .querySelectorAll(".user-item")
    .forEach(item => {
      item.classList.toggle(
        "selected",
        Number(item.dataset.id) ===
          Number(user.id)
      );
    });

  document
    .querySelectorAll(
      ".teamspace-group-item"
    )
    .forEach(item => {
      item.classList.remove(
        "selected"
      );
    });

  chatUserName.textContent =
    user.name || "";

  chatStatus.textContent =
    user.email || "";

  chatUserAvatar.textContent =
    initials(user.name);

  messageForm.classList.remove(
    "hidden"
  );

  messageInput.focus();

  try {
    const data =
      await api(
        "/api/messages/" +
        encodeURIComponent(
          user.id
        )
      );

    messagesBox.innerHTML = "";

    renderMessages(
      data.messages || [],
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
          ${escapeHtml(
            error.message
          )}
        </p>
      </div>
    `;
  }
}

/*
Render private messages
*/

function renderMessages(
  messages,
  append
) {
  if (!append) {
    messagesBox.innerHTML = "";
  }

  if (
    !messages.length &&
    !append
  ) {
    messagesBox.innerHTML = `
      <div class="empty-chat">
        <div class="empty-icon">👋</div>
        <h2>Start a conversation</h2>
        <p>
          Send
          ${escapeHtml(
            selectedUser
              ? selectedUser.name
              : "this person"
          )}
          your first message.
        </p>
      </div>
    `;

    return;
  }

  messages.forEach(
    message => {
      const mine =
        Number(message.senderId) ===
        Number(currentUser.id);

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "message-row" +
        (mine ? " mine" : "");

      const bubble =
        document.createElement(
          "div"
        );

      bubble.className =
        "message";

      const body =
        document.createElement(
          "div"
        );

      body.className =
        "message-body";

      body.textContent =
        message.body || "";

      const time =
        document.createElement(
          "div"
        );

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
    }
  );

  messagesBox.scrollTop =
    messagesBox.scrollHeight;
}

/*
Send message
*/

messageForm.addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const body =
      messageInput.value.trim();

    if (!body) return;

    if (
      !selectedUser &&
      !selectedGroup
    ) {
      return;
    }

    messageInput.value = "";

    try {
      if (selectedGroup) {
        const data =
          await api(
            "/api/groups/" +
            encodeURIComponent(
              selectedGroup.id
            ) +
            "/messages",
            {
              method: "POST",
              body: JSON.stringify({
                body
              })
            }
          );

        /*
        The server sends the group message
        through Socket.IO. We only render
        immediately if Socket.IO is not
        connected, preventing duplicates.
        */

        if (
          data.message &&
          (!socket ||
            !socket.connected)
        ) {
          renderGroupMessages(
            [data.message],
            true
          );
        }

      } else if (selectedUser) {
        const data =
          await api(
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

        if (data.message) {
          renderMessages(
            [data.message],
            true
          );
        }
      }

    } catch (error) {
      console.error(
        "Unable to send message:",
        error
      );

      messageInput.value =
        body;

      alert(
        error.message
      );
    }
  }
);

/*
Enter sends; Shift+Enter inserts
a line break.
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
Refresh contacts
*/

document
  .getElementById(
    "refreshUsers"
  )
  .addEventListener(
    "click",
    async () => {
      await loadUsers();
      await loadGroups();
    }
  );

/*
Log out
*/

document
  .getElementById(
    "logoutBtn"
  )
  .addEventListener(
    "click",
    async () => {
      try {
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
        removeToken();

        if (socket) {
          socket.disconnect();
          socket = null;
        }

        currentUser = null;
        selectedUser = null;
        selectedGroup = null;

        appScreen.classList.add(
          "hidden"
        );

        authScreen.classList.remove(
          "hidden"
        );

        authForm.reset();
        authError.textContent =
          "";

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
Handle expired authentication
*/

function handleAuthenticationFailure() {
  removeToken();

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentUser = null;
  selectedUser = null;
  selectedGroup = null;

  appScreen.classList.add(
    "hidden"
  );

  authScreen.classList.remove(
    "hidden"
  );

  authError.textContent =
    "Your session has expired. Please sign in again.";
}

/*
Initialize app
*/

async function init() {
  const storedToken =
    localStorage.getItem(
      TOKEN_KEY
    );

  if (storedToken) {
    authToken = storedToken;
  }

  const token = getToken();

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
    const data =
      await api(
        "/api/me",
        {},
        token
      );

    currentUser =
      data.user;

    await showApp(token);

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