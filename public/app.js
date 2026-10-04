/* =========================================================
   TEAMSPACE CHAT
   Firebase Authentication + Realtime Database
   Private Chat + Groups + Presence + Profiles
   No E2EE — plain text / data URL messages
   ========================================================= */

/* ---------------------------------------------------------
   FIREBASE CONFIGURATION
   --------------------------------------------------------- */

const firebaseConfig = {
  apiKey: "AIzaSyBTj01QDxQJEp2iU_bTKvqV2TjxBg3cxlE",
  authDomain: "teams-3d363.firebaseapp.com",
  databaseURL: "https://teams-3d363-default-rtdb.firebaseio.com",
  projectId: "teams-3d363",
  storageBucket: "teams-3d363.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();

/* ---------------------------------------------------------
   DOM REFERENCES
   --------------------------------------------------------- */

const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");

const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authName = document.getElementById("authName");
const authError = document.getElementById("authError");
const authSubmit = document.getElementById("authSubmit");
const nameGroup = document.getElementById("nameGroup");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const forgotPassword = document.getElementById("forgotPassword");

const themeToggle = document.getElementById("themeToggle");

const chatNav = document.getElementById("chatNav");
const peopleNav = document.getElementById("peopleNav");
const groupsNav = document.getElementById("groupsNav");

const listTitle = document.getElementById("listTitle");
const refreshUsers = document.getElementById("refreshUsers");

const peopleSearchWrapper = document.getElementById("peopleSearchWrapper");
const peopleSearchInput = document.getElementById("peopleSearchInput");

const userList = document.getElementById("userList");

const profileCard = document.getElementById("profileCard");
const currentUserAvatar = document.getElementById("currentUserAvatar");
const currentUserName = document.getElementById("currentUserName");
const currentUserEmail = document.getElementById("currentUserEmail");
const logoutButton = document.getElementById("logoutButton");
const deleteAccountButton = document.getElementById("deleteAccountButton");

const chatHeaderAvatar = document.getElementById("chatHeaderAvatar");
const chatHeaderInfo = document.getElementById("chatHeaderInfo");
const chatHeaderName = document.getElementById("chatHeaderName");
const chatHeaderStatus = document.getElementById("chatHeaderStatus");

const messages = document.getElementById("messages");

const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const imageButton = document.getElementById("imageButton");
const imageInput = document.getElementById("imageInput");
const uploadStatus = document.getElementById("uploadStatus");

const profileModal = document.getElementById("profileModal");
const closeProfileModalBtn = document.getElementById("closeProfileModal");
const profileModalAvatar = document.getElementById("profileModalAvatar");
const profileModalTitle = document.getElementById("profileModalTitle");
const profileModalSubtitle = document.getElementById("profileModalSubtitle");
const profileModalContent = document.getElementById("profileModalContent");

const groupProfileModal = document.getElementById("groupProfileModal");
const closeGroupProfileModalBtn = document.getElementById("closeGroupProfileModal");
const groupProfileAvatar = document.getElementById("groupProfileAvatar");
const groupProfileName = document.getElementById("groupProfileName");
const groupProfileSubtitle = document.getElementById("groupProfileSubtitle");
const groupAdminControls = document.getElementById("groupAdminControls");
const groupMembersList = document.getElementById("groupMembersList");
const leaveGroupBtn = document.getElementById("leaveGroupBtn");

/* ---------------------------------------------------------
   STATE
   --------------------------------------------------------- */

let currentUser = null;
let currentProfile = null;

let selectedUser = null;
let selectedGroup = null;

let authMode = "login";

let availableUsers = [];
let chattedUsers = [];
let groupCache = {};

let currentWorkspace = "chat";

let usersListener = null;
let groupsListener = null;

let messageListener = null;
let activeMessagePath = null;

let presenceRef = null;
let presenceConnectedRef = null;
let presenceCallback = null;

let selectedPresenceRef = null;
let selectedPresenceCallback = null;
let selectedUserOnline = false;

let lastRenderedMessages = [];
let currentGroupModalGroup = null;

/* =========================================================
   DYNAMIC STYLES
   ========================================================= */

function injectStyles() {
  if (document.getElementById("teamspaceDynamicStyles")) return;

  const style = document.createElement("style");
  style.id = "teamspaceDynamicStyles";

  style.textContent = `
    .hidden { display: none !important; }

    /* -----------------------------------------------------
       LAYOUT / MOBILE SCROLL FIX
    ----------------------------------------------------- */

    .sidebar {
      display: flex !important;
      flex-direction: column !important;
      min-height: 0 !important;
      overflow: hidden !important;
    }

    .sidebar-top,
    .sidebar > .sidebar-section:not(.contacts-section),
    #profileCard {
      flex: 0 0 auto !important;
    }

    .sidebar-section.contacts-section {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }

    #userList {
      flex: 1 1 auto !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch !important;
      overscroll-behavior: contain !important;
      touch-action: pan-y !important;
      scrollbar-width: thin;
      padding-right: 2px;
    }

    #messages {
      min-height: 0;
      flex: 1 1 auto;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      touch-action: pan-y;
      scrollbar-width: thin;
    }

    .user-list-item,
    .nav-item,
    .account-btn,
    .profile {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    /* -----------------------------------------------------
       MESSAGE BUBBLES
    ----------------------------------------------------- */

    .message-row {
      display: flex;
      justify-content: flex-start;
      padding: 3px 10px;
    }

    .message-row.mine {
      justify-content: flex-end;
    }

    .message-bubble {
      max-width: min(75%, 620px);
      padding: 9px 12px;
      border-radius: 14px;
      background: rgba(127, 127, 127, .14);
      overflow-wrap: anywhere;
    }

    .message-bubble.mine {
      background: #1f5eff;
      color: #ffffff;
    }

    .message-text {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .message-sender {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
      opacity: .8;
    }

    .message-meta {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 4px;
      margin-top: 3px;
    }

    .message-time {
      font-size: 10px;
      opacity: .7;
    }

    .message-ticks {
      display: inline-block;
      font-size: 12px;
      line-height: 1;
      letter-spacing: -2px;
      font-weight: 700;
      color: rgba(255, 255, 255, .85);
    }

    .message-row:not(.mine) .message-ticks {
      color: #8a8a8a;
    }

    .message-ticks.read {
      color: #9ad8ff;
    }

    .message-date-divider {
      text-align: center;
      margin: 14px 0;
      font-size: 11px;
      opacity: .6;
    }

    .chat-image {
      display: block;
      max-width: min(100%, 360px);
      max-height: 400px;
      border-radius: 10px;
      object-fit: contain;
    }

    .image-name {
      margin-top: 5px;
      font-size: 11px;
      opacity: .75;
    }

    .message-error {
      font-size: 12px;
      opacity: .85;
    }

    /* -----------------------------------------------------
       LISTS
    ----------------------------------------------------- */

    .empty-list {
      padding: 20px;
      text-align: center;
      opacity: .65;
    }

    .user-list-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    .user-list-item:hover,
    .user-list-item.active {
      background: rgba(31, 94, 255, .12);
    }

    .user-list-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }

    .user-list-text strong,
    .user-list-text span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .user-list-text span {
      font-size: 12px;
      opacity: .65;
    }

    /* -----------------------------------------------------
       AVATARS
    ----------------------------------------------------- */

    .profile-photo-small {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }

    .avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1f5eff;
      color: #ffffff;
      font-weight: 700;
      overflow: hidden;
    }

    /* -----------------------------------------------------
       PRESENCE
    ----------------------------------------------------- */

    .online-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 5px;
      background: #999999;
    }

    .online-dot.online {
      background: #20c55a;
    }

    /* -----------------------------------------------------
       GROUP CREATE BUTTON
    ----------------------------------------------------- */

    .teamspace-group-button {
      width: 100%;
      margin: 0 0 10px;
      padding: 10px 14px;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      background: #1f5eff;
      color: #ffffff;
      transition: opacity .2s ease, transform .2s ease;
    }

    .teamspace-group-button:hover { opacity: .92; }
    .teamspace-group-button:active { transform: scale(.98); }

    /* -----------------------------------------------------
       ERROR / SUCCESS
    ----------------------------------------------------- */

    .error { color: #d83a3a; }
    .success { color: #1fa463; }

    /* -----------------------------------------------------
       DYNAMIC MODALS
    ----------------------------------------------------- */

    .teamspace-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .teamspace-modal .modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, .55);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .teamspace-modal .modal-card {
      position: relative;
      z-index: 1;
      width: min(92vw, 520px);
      max-height: 88vh;
      overflow: auto;
      border-radius: 16px;
      background: #ffffff;
      color: #111827;
      box-shadow: 0 20px 60px rgba(0, 0, 0, .28);
      scrollbar-width: thin;
    }

    .teamspace-modal .modal-header,
    .teamspace-modal .modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid rgba(127, 127, 127, .18);
    }

    .teamspace-modal .modal-footer {
      border-top: 1px solid rgba(127, 127, 127, .18);
      border-bottom: 0;
      justify-content: flex-end;
    }

    .teamspace-modal .modal-body { padding: 20px; }

    .teamspace-modal .modal-header h2 { margin: 0; font-size: 18px; }

    .teamspace-modal .modal-close {
      border: 0;
      background: transparent;
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      color: inherit;
    }

    .teamspace-modal label {
      display: block;
      margin: 12px 0 6px;
      font-weight: 600;
      font-size: 13px;
    }

    .teamspace-modal input,
    .teamspace-modal textarea,
    .teamspace-modal select {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1px solid rgba(127, 127, 127, .3);
      border-radius: 9px;
      background: transparent;
      color: inherit;
      outline: none;
      font: inherit;
    }

    .teamspace-modal textarea {
      min-height: 90px;
      resize: vertical;
    }

    .teamspace-modal button {
      border: 0;
      border-radius: 9px;
      padding: 9px 14px;
      cursor: pointer;
      font: inherit;
    }

    body.dark .teamspace-modal .modal-card,
    body.dark-mode .teamspace-modal .modal-card {
      background: #1b2130;
      color: #e8edf7;
    }

    .group-admin-controls select { margin-bottom: 8px; }

    .profile-modal-avatar.avatar-fallback {
      background: linear-gradient(135deg, #2563eb, #d4a017);
    }

    @media (max-width: 700px) {
      .message-bubble { max-width: 86%; }
    }

    /* -----------------------------------------------------
       MOBILE: extra scroll safety
    ----------------------------------------------------- */

    @media (max-width: 760px) {
      .sidebar {
        height: 46dvh !important;
        max-height: 46dvh !important;
      }

      .chat-area {
        height: 54dvh !important;
      }

      #userList,
      #messages {
        -webkit-overflow-scrolling: touch;
      }
    }

    @media (max-width: 480px) {
      .sidebar {
        height: 48dvh !important;
        max-height: 48dvh !important;
      }

      .chat-area {
        height: 52dvh !important;
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   BASIC HELPERS
   ========================================================= */

function initials(name) {
  if (!name) return "?";

  const parts = String(name).trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "Last seen unavailable";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Last seen unavailable";

  return `Last seen ${formatDate(timestamp)} at ${formatTime(timestamp)}`;
}

function setAuthError(message) {
  if (!authError) return;
  authError.textContent = message || "";
}

function firebaseError(error) {
  if (!error) return "Something went wrong.";

  const code = error.code || "";

  const messages = {
    "auth/email-already-in-use": "This email address is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account was found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "auth/requires-recent-login": "Please sign in again before deleting your account.",
    "auth/user-disabled": "This account has been disabled.",
    "PERMISSION_DENIED": "Permission denied. Check your database rules."
  };

  return messages[code] || error.message || "Something went wrong.";
}

function makeChatId(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

function showAuth() {
  if (authScreen) authScreen.classList.remove("hidden");
  if (appScreen) appScreen.classList.add("hidden");
}

function showApp() {
  if (authScreen) authScreen.classList.add("hidden");
  if (appScreen) appScreen.classList.remove("hidden");
}

function setUploadStatus(text) {
  if (!uploadStatus) return;
  uploadStatus.textContent = text || "";
}

/* =========================================================
   THEME
   ========================================================= */

function applyTheme(theme) {
  const dark = theme === "dark";

  document.documentElement.setAttribute("data-theme", theme);
  document.body.classList.toggle("dark", dark);
  document.body.classList.toggle("dark-mode", dark);

  if (themeToggle) {
    themeToggle.textContent = dark ? "☀️" : "🌙";
    themeToggle.title = dark ? "Switch to light mode" : "Switch to dark mode";
    themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
  }
}

function initializeTheme() {
  const saved = localStorage.getItem("teamspaceTheme");

  if (saved === "dark" || saved === "light") {
    applyTheme(saved);
    return;
  }

  const prefersDark =
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  applyTheme(prefersDark ? "dark" : "light");
}

if (themeToggle) {
  themeToggle.addEventListener("click", function () {
    const isDark = document.body.classList.contains("dark");
    const next = isDark ? "light" : "dark";

    localStorage.setItem("teamspaceTheme", next);
    applyTheme(next);
  });
}

/* =========================================================
   IMAGE COMPRESSION
   ========================================================= */

function compressImage(file, maxDimension, quality) {
  maxDimension = maxDimension || 1000;
  quality = quality || 0.72;

  return new Promise(function (resolve, reject) {
    if (!file) {
      reject(new Error("No image selected."));
      return;
    }

    const reader = new FileReader();

    reader.onload = function (event) {
      const image = new Image();

      image.onload = function () {
        let width = image.width;
        let height = image.height;

        if (width > maxDimension || height > maxDimension) {
          const ratio = Math.min(maxDimension / width, maxDimension / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", quality));
      };

      image.onerror = function () {
        reject(new Error("Unable to read image."));
      };

      image.src = event.target.result;
    };

    reader.onerror = function () {
      reject(new Error("Unable to read selected file."));
    };

    reader.readAsDataURL(file);
  });
}

/* =========================================================
   AUTHENTICATION UI
   ========================================================= */

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  if (loginTab) loginTab.classList.toggle("active", authMode === "login");
  if (registerTab) registerTab.classList.toggle("active", authMode === "register");

  if (nameGroup) nameGroup.classList.toggle("hidden", authMode !== "register");

  if (authSubmit) {
    authSubmit.textContent = authMode === "register" ? "Create account" : "Sign in";
  }

  if (forgotPassword) {
    forgotPassword.classList.toggle("hidden", authMode !== "login");
  }

  setAuthError("");
}

if (loginTab) {
  loginTab.addEventListener("click", function () {
    setAuthMode("login");
  });
}

if (registerTab) {
  registerTab.addEventListener("click", function () {
    setAuthMode("register");
  });
}

if (forgotPassword) {
  forgotPassword.addEventListener("click", async function () {
    const email = authEmail && authEmail.value.trim();

    if (!email) {
      setAuthError("Enter your email address first, then tap Forgot password.");
      if (authEmail) authEmail.focus();
      return;
    }

    const originalText = forgotPassword.textContent;

    try {
      forgotPassword.disabled = true;
      forgotPassword.textContent = "Sending…";

      await auth.sendPasswordResetEmail(email);

      setAuthError("Password reset email sent. Check your inbox.");
    } catch (error) {
      console.error(error);
      setAuthError(firebaseError(error));
    } finally {
      forgotPassword.disabled = false;
      forgotPassword.textContent = originalText;
    }
  });
}

if (authForm) {
  authForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = (authEmail && authEmail.value.trim()) || "";
    const password = (authPassword && authPassword.value) || "";
    const name = (authName && authName.value.trim()) || "";

    if (!email || !password) {
      setAuthError("Please enter your email and password.");
      return;
    }

    try {
      if (authMode === "register") {
        if (!name) {
          setAuthError("Please enter your name.");
          return;
        }

        if (password.length < 6) {
          setAuthError("Password should be at least 6 characters.");
          return;
        }
      }

      if (authSubmit) authSubmit.disabled = true;

      if (authMode === "register") {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        const user = credential.user;

        await user.updateProfile({ displayName: name });

        await db.ref(`users/${user.uid}`).update({
          uid: user.uid,
          name: name,
          email: email,
          photoURL: "",
          createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        setAuthError("Account created successfully.");
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
    } catch (error) {
      console.error(error);
      setAuthError(firebaseError(error));
    } finally {
      if (authSubmit) authSubmit.disabled = false;
    }
  });
}

/* =========================================================
   LISTENER CLEANUP
   ========================================================= */

function stopMessageListener() {
  if (messageListener) {
    try {
      messageListener.ref.off("value", messageListener.callback);
    } catch (error) {
      console.warn(error);
    }
    messageListener = null;
  }

  activeMessagePath = null;
}

function stopUsersListener() {
  if (usersListener) {
    try {
      db.ref("users").off("value", usersListener);
    } catch (error) {
      console.warn(error);
    }
    usersListener = null;
  }
}

function stopGroupsListener() {
  if (groupsListener) {
    try {
      db.ref("groups").off("value", groupsListener);
    } catch (error) {
      console.warn(error);
    }
    groupsListener = null;
  }
}

function clearSelectedPresenceListener() {
  if (selectedPresenceRef && selectedPresenceCallback) {
    try {
      selectedPresenceRef.off("value", selectedPresenceCallback);
    } catch (error) {
      console.warn(error);
    }
  }

  selectedPresenceRef = null;
  selectedPresenceCallback = null;
  selectedUserOnline = false;
}

function stopPresenceListener() {
  if (presenceConnectedRef && presenceCallback) {
    try {
      presenceConnectedRef.off("value", presenceCallback);
    } catch (error) {
      console.warn(error);
    }
  }

  if (presenceRef) {
    try {
      presenceRef.onDisconnect().cancel();
    } catch (error) {
      /* ignore */
    }
  }

  presenceConnectedRef = null;
  presenceCallback = null;
}

function clearAllListeners() {
  stopMessageListener();
  stopUsersListener();
  stopGroupsListener();
  clearSelectedPresenceListener();
  stopPresenceListener();
}

/* =========================================================
   CHAT AREA HELPERS
   ========================================================= */

function renderEmptyChat(title, subtitle) {
  if (!messages) return;

  messages.innerHTML = `
    <div class="empty-chat">
      <div class="empty-icon">💬</div>
      <h2>${escapeHtml(title || "Your conversations")}</h2>
      <p>${escapeHtml(subtitle || "Select a conversation to start messaging.")}</p>
    </div>
  `;
}

function updateCurrentUserUI() {
  const profile = currentProfile || {};

  const name =
    profile.name ||
    (currentUser && currentUser.displayName) ||
    "User";

  const email =
    profile.email ||
    (currentUser && currentUser.email) ||
    "";

  if (currentUserName) currentUserName.textContent = name;
  if (currentUserEmail) currentUserEmail.textContent = email;

  if (currentUserAvatar) {
    const photoURL =
      profile.photoURL ||
      (currentUser && currentUser.photoURL) ||
      "";

    if (photoURL) {
      currentUserAvatar.innerHTML =
        `<img src="${escapeHtml(photoURL)}" alt="${escapeHtml(name)}">`;
    } else {
      currentUserAvatar.textContent = initials(name);
    }
  }
}

/* =========================================================
   PRESENCE
   ========================================================= */

function startPresence() {
  if (!currentUser) return;

  stopPresenceListener();

  presenceRef = db.ref("presence/" + currentUser.uid);
  presenceConnectedRef = db.ref(".info/connected");

  presenceCallback = function (snapshot) {
    if (snapshot.val() !== true) return;

    const offlineData = {
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    };

    const onlineData = {
      online: true,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    };

    presenceRef
      .onDisconnect()
      .set(offlineData)
      .then(function () {
        return presenceRef.set(onlineData);
      })
      .catch(function (error) {
        console.warn("Presence update failed:", error);
      });
  };

  presenceConnectedRef.on("value", presenceCallback);
}

async function markOffline() {
  if (!currentUser) return;

  try {
    await db.ref("presence/" + currentUser.uid).set({
      online: false,
      lastSeen: firebase.database.ServerValue.TIMESTAMP
    });
  } catch (error) {
    console.warn("Unable to mark offline:", error);
  }
}

function listenToUserPresence(uid) {
  clearSelectedPresenceListener();

  if (!uid) return;

  selectedPresenceRef = db.ref("presence/" + uid);

  selectedPresenceCallback = function (snapshot) {
    const presence = snapshot.val() || {};

    selectedUserOnline = presence.online === true;

    updateSelectedUserPresence(presence);

    if (selectedUser && currentWorkspace !== "groups" && lastRenderedMessages.length) {
      renderMessagesFromCurrentListener();
    }
  };

  selectedPresenceRef.on("value", selectedPresenceCallback);
}

function updateSelectedUserPresence(presence) {
  if (!chatHeaderStatus) return;

  if (presence && presence.online) {
    chatHeaderStatus.innerHTML =
      '<span class="online-dot online"></span>Online';
    return;
  }

  chatHeaderStatus.innerHTML =
    '<span class="online-dot"></span>' +
    escapeHtml(formatLastSeen(presence && presence.lastSeen));
}

/* =========================================================
   USERS
   ========================================================= */

function buildAvailableUsers(data) {
  if (!currentUser) return [];

  return Object.keys(data || {})
    .map(function (uid) {
      return Object.assign({}, data[uid] || {}, { uid: uid });
    })
    .filter(function (user) {
      return user.uid !== currentUser.uid;
    })
    .sort(function (a, b) {
      return String(a.name || a.email || "")
        .toLowerCase()
        .localeCompare(String(b.name || b.email || "").toLowerCase());
    });
}

function listenToUsers() {
  stopUsersListener();

  if (!currentUser) return;

  usersListener = function (snapshot) {
    availableUsers = buildAvailableUsers(snapshot.val() || {});

    renderUsers();

    if (currentWorkspace === "groups" && currentGroupModalGroup) {
      renderGroupAdminControls(currentGroupModalGroup);
    }
  };

  db.ref("users").on("value", usersListener);
}

async function loadChattedUsers() {
  if (!currentUser) return;

  try {
    if (!availableUsers.length) {
      const usersSnapshot = await db.ref("users").once("value");
      availableUsers = buildAvailableUsers(usersSnapshot.val() || {});
    }

    const snapshot = await db.ref("privateChats").once("value");
    const allChats = snapshot.val() || {};

    const unique = new Map();

    Object.keys(allChats).forEach(function (chatId) {
      if (chatId.indexOf(currentUser.uid) === -1) return;

      const parts = chatId.split("_");

      const otherUid = parts.find(function (uid) {
        return uid !== currentUser.uid;
      });

      if (!otherUid) return;

      const user = availableUsers.find(function (item) {
        return item.uid === otherUid;
      });

      if (user) unique.set(user.uid, user);
    });

    chattedUsers = Array.from(unique.values());

    renderUsers();
  } catch (error) {
    console.error("Unable to load chatted users:", error);
  }
}

function ensureUserInChatList(user) {
  if (!user) return;

  const exists = chattedUsers.some(function (item) {
    return item.uid === user.uid;
  });

  if (!exists) {
    chattedUsers.push(user);

    chattedUsers.sort(function (a, b) {
      return String(a.name || a.email || "").localeCompare(
        String(b.name || b.email || "")
      );
    });
  }

  renderUsers();
}

/* =========================================================
   USER LIST RENDERING
   ========================================================= */

function renderUsers() {
  if (!userList) return;

  if (currentWorkspace === "groups") {
    renderGroups();
    return;
  }

  let users = [];

  if (currentWorkspace === "people") {
    const term = (peopleSearchInput && peopleSearchInput.value.trim().toLowerCase()) || "";

    users = availableUsers.filter(function (user) {
      if (!term) return true;

      const name = String(user.name || "").toLowerCase();
      const email = String(user.email || "").toLowerCase();

      return name.indexOf(term) !== -1 || email.indexOf(term) !== -1;
    });
  } else {
    users = chattedUsers;
  }

  if (!users.length) {
    userList.innerHTML =
      currentWorkspace === "people"
        ? '<div class="empty-list">No people found.</div>'
        : '<div class="empty-list">No conversations yet.</div>';
    return;
  }

  userList.innerHTML = "";

  users.forEach(function (user) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "user-list-item";

    if (selectedUser && selectedUser.uid === user.uid) {
      row.classList.add("active");
    }

    const photo = user.photoURL
      ? `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(user.name || "User")}" class="profile-photo-small">`
      : `<div class="profile-photo-small avatar-fallback">${escapeHtml(initials(user.name || user.email))}</div>`;

    row.innerHTML = `
      ${photo}
      <div class="user-list-text">
        <strong>${escapeHtml(user.name || user.email || "User")}</strong>
        <span>${escapeHtml(user.email || "")}</span>
      </div>
    `;

    row.addEventListener("click", function () {
      selectUser(user);
    });

    row.addEventListener("contextmenu", function (event) {
      event.preventDefault();
      openUserProfile(user);
    });

    userList.appendChild(row);
  });
}

/* =========================================================
   GROUPS
   ========================================================= */

function listenToGroups() {
  stopGroupsListener();

  if (!currentUser) return;

  groupsListener = function (snapshot) {
    const data = snapshot.val() || {};

    groupCache = {};

    Object.keys(data).forEach(function (groupId) {
      const group = data[groupId];

      if (group && group.members && group.members[currentUser.uid]) {
        groupCache[groupId] = Object.assign({}, group, {
          id: group.id || groupId
        });
      }
    });

    renderGroups();
  };

  db.ref("groups").on("value", groupsListener);
}

function renderGroups() {
  if (!userList) return;
  if (currentWorkspace !== "groups") return;

  const groups = Object.values(groupCache);

  if (!groups.length) {
    userList.innerHTML =
      '<div class="empty-list">You are not a member of any groups yet.</div>';
    return;
  }

  groups.sort(function (a, b) {
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  userList.innerHTML = "";

  groups.forEach(function (group) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "user-list-item";

    if (selectedGroup && selectedGroup.id === group.id) {
      row.classList.add("active");
    }

    const memberCount = Object.keys(group.members || {}).filter(function (uid) {
      return group.members[uid];
    }).length;

    row.innerHTML = `
      <div class="profile-photo-small avatar-fallback">${escapeHtml(initials(group.name || "Group"))}</div>
      <div class="user-list-text">
        <strong>${escapeHtml(group.name || "Group")}</strong>
        <span>${memberCount} ${memberCount === 1 ? "member" : "members"}</span>
      </div>
    `;

    row.addEventListener("click", function () {
      selectGroup(group);
    });

    userList.appendChild(row);
  });
}

/* =========================================================
   GROUP CREATE BUTTON + MODAL
   ========================================================= */

function ensureGroupCreateButton() {
  let button = document.getElementById("createGroupButtonNav");

  if (button) return button;

  const parent = userList && userList.parentElement;

  if (!parent) return null;

  button = document.createElement("button");
  button.type = "button";
  button.id = "createGroupButtonNav";
  button.className = "teamspace-group-button";
  button.textContent = "+ Create Group";
  button.style.display = "none";

  parent.insertBefore(button, userList);

  button.addEventListener("click", openCreateGroupModal);

  return button;
}

function openCreateGroupModal() {
  if (!currentUser) return;
  if (document.getElementById("createGroupModal")) return;

  const modal = document.createElement("div");
  modal.id = "createGroupModal";
  modal.className = "teamspace-modal";

  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card">
      <div class="modal-header">
        <h2>Create Group</h2>
        <button type="button" class="modal-close" data-close-modal>×</button>
      </div>
      <div class="modal-body">
        <label for="groupNameInput">Group name</label>
        <input id="groupNameInput" type="text" maxlength="80" placeholder="Enter group name">

        <label for="groupDescriptionInput">Description</label>
        <textarea id="groupDescriptionInput" placeholder="Optional group description"></textarea>

        <div id="createGroupError" class="error"></div>
      </div>
      <div class="modal-footer">
        <button type="button" data-close-modal>Cancel</button>
        <button type="button" id="createGroupSubmitButton">Create Group</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll("[data-close-modal]").forEach(function (button) {
    button.addEventListener("click", function () {
      modal.remove();
    });
  });

  modal.querySelector(".modal-backdrop").addEventListener("click", function () {
    modal.remove();
  });

  const nameInput = modal.querySelector("#groupNameInput");
  const descriptionInput = modal.querySelector("#groupDescriptionInput");
  const errorElement = modal.querySelector("#createGroupError");
  const submitButton = modal.querySelector("#createGroupSubmitButton");

  nameInput.focus();

  submitButton.addEventListener("click", async function () {
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!name) {
      errorElement.textContent = "Please enter a group name.";
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Creating…";

    try {
      const groupRef = db.ref("groups").push();

      const groupData = {
        id: groupRef.key,
        name: name,
        description: description,
        createdBy: currentUser.uid,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        admins: { [currentUser.uid]: true },
        members: { [currentUser.uid]: true }
      };

      await groupRef.set(groupData);

      modal.remove();

      const created = Object.assign({}, groupData, { id: groupRef.key });

      groupCache[groupRef.key] = created;

      switchWorkspace("groups");
      selectGroup(created);
    } catch (error) {
      console.error(error);
      errorElement.textContent = firebaseError(error);
      submitButton.disabled = false;
      submitButton.textContent = "Create Group";
    }
  });
}

/* =========================================================
   GROUP DETAILS MODAL
   ========================================================= */

function closeGroupDetails() {
  if (groupProfileModal) groupProfileModal.classList.add("hidden");
  currentGroupModalGroup = null;
}

/* ---------------------------------------------------------
   Admin controls: rename + add member
   --------------------------------------------------------- */

function renderGroupAdminControls(group) {
  if (!groupAdminControls) return;

  const isAdmin = !!(group.admins && group.admins[currentUser.uid]);

  if (!isAdmin) {
    groupAdminControls.innerHTML = "";
    return;
  }

  const candidates = availableUsers.filter(function (user) {
    return !(group.members && group.members[user.uid]);
  });

  groupAdminControls.innerHTML = `
    <div class="group-admin-controls">
      <label for="groupRenameInput">Group name</label>
      <input id="groupRenameInput" type="text" maxlength="80" value="${escapeHtml(group.name || "")}">
      <button type="button" class="group-admin-save" id="groupRenameSave">Save name</button>
    </div>

    <div class="group-admin-controls">
      <label for="groupAddMemberSelect">
        Add member${candidates.length ? " (" + candidates.length + " available)" : ""}
      </label>
      ${
        candidates.length
          ? `
            <select id="groupAddMemberSelect">
              <option value="">Select a person</option>
              ${candidates
                .map(function (user) {
                  return `<option value="${escapeHtml(user.uid)}">${escapeHtml(
                    user.name || user.email || "User"
                  )}</option>`;
                })
                .join("")}
            </select>
            <button type="button" class="group-admin-save" id="groupAddMemberBtn">Add member</button>
          `
          : `<p style="opacity:.6;font-size:12px;margin:0;">Everyone is already a member.</p>`
      }
    </div>

    <div id="groupAdminError" class="error"></div>
  `;

  const renameInput = groupAdminControls.querySelector("#groupRenameInput");
  const renameSave = groupAdminControls.querySelector("#groupRenameSave");
  const addSelect = groupAdminControls.querySelector("#groupAddMemberSelect");
  const addButton = groupAdminControls.querySelector("#groupAddMemberBtn");
  const adminError = groupAdminControls.querySelector("#groupAdminError");

  /* ---- Rename ---- */
  if (renameSave && renameInput) {
    renameSave.addEventListener("click", async function () {
      const newName = renameInput.value.trim();

      if (!newName) {
        adminError.textContent = "Group name cannot be empty.";
        adminError.className = "error";
        return;
      }

      renameSave.disabled = true;
      adminError.textContent = "";

      try {
        await db.ref(`groups/${group.id}/name`).set(newName);
        group.name = newName;

        if (groupProfileName) groupProfileName.textContent = newName;

        adminError.textContent = "Group name updated.";
        adminError.className = "success";
      } catch (error) {
        adminError.textContent = firebaseError(error);
        adminError.className = "error";
      } finally {
        renameSave.disabled = false;
      }
    });
  }

  /* ---- Add member ---- */
  if (addButton && addSelect) {
    addButton.addEventListener("click", async function () {
      if (!(group.admins && group.admins[currentUser.uid])) {
        adminError.textContent = "You are no longer an admin of this group.";
        adminError.className = "error";
        return;
      }

      const uid = addSelect.value;

      if (!uid) {
        adminError.textContent = "Select a person first.";
        adminError.className = "error";
        return;
      }

      if (group.members && group.members[uid]) {
        adminError.textContent = "This person is already a member.";
        adminError.className = "error";
        return;
      }

      addButton.disabled = true;
      addButton.textContent = "Adding…";
      adminError.textContent = "";

      try {
        await db.ref(`groups/${group.id}/members/${uid}`).set(true);

        group.members = group.members || {};
        group.members[uid] = true;

        await openGroupDetails(group);
      } catch (error) {
        adminError.textContent = firebaseError(error);
        adminError.className = "error";
        addButton.disabled = false;
        addButton.textContent = "Add member";
      }
    });
  }
}

/* ---------------------------------------------------------
   Group details modal: members list + remove buttons
   --------------------------------------------------------- */

async function openGroupDetails(group) {
  if (!group || !groupProfileModal || !currentUser) return;

  currentGroupModalGroup = group;

  const memberIds = Object.keys(group.members || {}).filter(function (uid) {
    return group.members[uid];
  });

  const isAdmin = !!(group.admins && group.admins[currentUser.uid]);

  groupProfileName.textContent = group.name || "Group";
  groupProfileAvatar.textContent = "👥";
  groupProfileSubtitle.textContent =
    memberIds.length +
    (memberIds.length === 1 ? " member" : " members") +
    (group.description ? " · " + group.description : "");

  renderGroupAdminControls(group);

  groupMembersList.innerHTML = "<p>Loading members…</p>";

  groupProfileModal.classList.remove("hidden");

  /* Load member profiles */
  const profiles = [];

  for (let i = 0; i < memberIds.length; i++) {
    try {
      const snapshot = await db.ref("users/" + memberIds[i]).once("value");
      const profile = snapshot.val();

      if (profile) {
        if (!profile.uid) profile.uid = memberIds[i];
        profiles.push(profile);
      }
    } catch (error) {
      console.warn("Unable to load member profile:", error);
    }
  }

  /* Admins first, then alphabetical */
  profiles.sort(function (a, b) {
    const aAdmin = !!(group.admins && group.admins[a.uid]);
    const bAdmin = !!(group.admins && group.admins[b.uid]);
    if (aAdmin && !bAdmin) return -1;
    if (!aAdmin && bAdmin) return 1;
    return String(a.name || a.email || "").localeCompare(
      String(b.name || b.email || "")
    );
  });

  groupMembersList.innerHTML =
    profiles
      .map(function (member) {
        const memberIsAdmin = !!(group.admins && group.admins[member.uid]);
        const isMe = member.uid === currentUser.uid;

        const avatar = member.photoURL
          ? `<img src="${escapeHtml(member.photoURL)}" alt="${escapeHtml(member.name || "User")}">`
          : escapeHtml(initials(member.name || member.email));

        const removeButton =
          isAdmin && !isMe
            ? `<button type="button" class="group-member-remove" data-remove-member="${escapeHtml(member.uid)}">Remove</button>`
            : "";

        return `
          <div class="group-member">
            <div class="group-member-avatar">${avatar}</div>
            <div class="group-member-info">
              <div class="group-member-name">
                ${escapeHtml(member.name || "User")}${isMe ? ' <small style="opacity:.6">(You)</small>' : ""}
              </div>
              <div class="group-member-email">${escapeHtml(member.email || "")}</div>
            </div>
            ${memberIsAdmin ? '<span class="group-admin-badge">Admin</span>' : ""}
            ${removeButton}
          </div>
        `;
      })
      .join("") || "<p>No members.</p>";

  /* Wire up Remove buttons */
  groupMembersList
    .querySelectorAll("[data-remove-member]")
    .forEach(function (button) {
      button.addEventListener("click", async function () {
        if (!(group.admins && group.admins[currentUser.uid])) {
          alert("You are no longer an admin of this group.");
          return;
        }

        const uid = button.getAttribute("data-remove-member");
        const member = profiles.find(function (p) {
          return p.uid === uid;
        });
        const name = member
          ? member.name || member.email || "this member"
          : "this member";

        if (!window.confirm('Remove "' + name + '" from this group?')) return;

        button.disabled = true;
        button.textContent = "Removing…";

        try {
          await db.ref(`groups/${group.id}/members/${uid}`).remove();
          await db.ref(`groups/${group.id}/admins/${uid}`).remove();

          group.members = group.members || {};
          group.members[uid] = false;

          if (group.admins) {
            group.admins[uid] = false;
          }

          await openGroupDetails(group);
        } catch (error) {
          alert(firebaseError(error));
          button.disabled = false;
          button.textContent = "Remove";
        }
      });
    });
}

if (closeGroupProfileModalBtn) {
  closeGroupProfileModalBtn.addEventListener("click", closeGroupDetails);
}

if (groupProfileModal) {
  groupProfileModal.addEventListener("click", function (event) {
    if (event.target === groupProfileModal) closeGroupDetails();
  });
}

if (leaveGroupBtn) {
  leaveGroupBtn.addEventListener("click", async function () {
    const group = currentGroupModalGroup;

    if (!group || !currentUser) return;

    if (
      !window.confirm(
        'Leave "' +
          (group.name || "this group") +
          '"?\n\nYou will no longer receive messages from this group.'
      )
    ) {
      return;
    }

    leaveGroupBtn.disabled = true;
    leaveGroupBtn.textContent = "Leaving…";

    try {
      await db.ref(`groups/${group.id}/members/${currentUser.uid}`).remove();
      await db.ref(`groups/${group.id}/admins/${currentUser.uid}`).remove();

      delete groupCache[group.id];

      closeGroupDetails();

      selectedGroup = null;

      resetChatInterface();
      renderGroups();
    } catch (error) {
      alert(firebaseError(error));
      leaveGroupBtn.disabled = false;
      leaveGroupBtn.textContent = "Leave Group";
    }
  });
}

/* =========================================================
   PROFILE MODALS
   ========================================================= */

function closeProfile() {
  if (profileModal) profileModal.classList.add("hidden");
  if (profileModalContent) profileModalContent.innerHTML = "";
}

if (closeProfileModalBtn) {
  closeProfileModalBtn.addEventListener("click", closeProfile);
}

if (profileModal) {
  profileModal.addEventListener("click", function (event) {
    if (event.target === profileModal) closeProfile();
  });
}

function openOwnProfile() {
  if (!currentUser || !profileModal) return;

  const profile = currentProfile || {
    name: currentUser.displayName || "",
    email: currentUser.email || "",
    photoURL: currentUser.photoURL || ""
  };

  const name = profile.name || currentUser.displayName || "User";
  const email = profile.email || currentUser.email || "";
  const photoURL = profile.photoURL || "";

  if (photoURL) {
    profileModalAvatar.innerHTML =
      `<img src="${escapeHtml(photoURL)}" alt="${escapeHtml(name)}">`;
  } else {
    profileModalAvatar.textContent = initials(name);
  }

  profileModalTitle.textContent = "My Profile";
  profileModalSubtitle.textContent = email;

  profileModalContent.innerHTML = `
    <div class="profile-field">
      <label for="profileNameInput">Name</label>
      <input id="profileNameInput" type="text" value="${escapeHtml(name)}">
    </div>

    <div class="profile-field">
      <label for="profileEmailInput">Email</label>
      <input id="profileEmailInput" type="email" value="${escapeHtml(email)}" disabled>
    </div>

    <div class="profile-field">
      <label for="profilePhotoInput">Profile photo</label>
      <input id="profilePhotoInput" type="file" accept="image/*">
    </div>

    <button type="button" id="saveProfileButton" class="profile-save-btn">Save changes</button>

    <p id="profileMessage" class="profile-message"></p>
  `;

  profileModal.classList.remove("hidden");

  const nameInput = profileModalContent.querySelector("#profileNameInput");
  const photoInput = profileModalContent.querySelector("#profilePhotoInput");
  const saveButton = profileModalContent.querySelector("#saveProfileButton");
  const message = profileModalContent.querySelector("#profileMessage");

  saveButton.addEventListener("click", async function () {
    const newName = nameInput.value.trim();

    if (!newName) {
      message.textContent = "Name cannot be empty.";
      message.className = "profile-message error";
      return;
    }

    saveButton.disabled = true;
    message.textContent = "Saving…";
    message.className = "profile-message";

    try {
      let newPhotoURL = photoURL;

      if (photoInput.files && photoInput.files[0]) {
        newPhotoURL = await compressImage(photoInput.files[0], 500, 0.75);
      }

      await db.ref("users/" + currentUser.uid).update({
        name: newName,
        photoURL: newPhotoURL,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });

      try {
        await currentUser.updateProfile({
          displayName: newName,
          photoURL: newPhotoURL
        });
      } catch (profileError) {
        console.warn("Unable to update auth profile:", profileError);
      }

      currentProfile = Object.assign({}, currentProfile || {}, {
        uid: currentUser.uid,
        name: newName,
        photoURL: newPhotoURL,
        email: currentUser.email || ""
      });

      updateCurrentUserUI();

      message.textContent = "Profile updated.";
      message.className = "profile-message success";

      setTimeout(closeProfile, 600);
    } catch (error) {
      console.error(error);
      message.textContent = firebaseError(error);
      message.className = "profile-message error";
    } finally {
      saveButton.disabled = false;
    }
  });
}

function openUserProfile(user) {
  if (!user || !profileModal) return;

  const name = user.name || user.displayName || "User";
  const email = user.email || "";

  if (user.photoURL) {
    profileModalAvatar.innerHTML =
      `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(name)}">`;
  } else {
    profileModalAvatar.textContent = initials(name);
  }

  profileModalTitle.textContent = name;
  profileModalSubtitle.textContent = email;

  profileModalContent.innerHTML = `
    <p id="userProfilePresence" class="profile-message">Checking presence…</p>
  `;

  profileModal.classList.remove("hidden");

  const presenceElement = profileModalContent.querySelector("#userProfilePresence");

  db.ref("presence/" + user.uid)
    .once("value")
    .then(function (snapshot) {
      const presence = snapshot.val();

      if (!presence) {
        presenceElement.textContent = "Last seen unavailable";
        return;
      }

      presenceElement.textContent = presence.online
        ? "Online"
        : formatLastSeen(presence.lastSeen);
    })
    .catch(function () {
      presenceElement.textContent = "Last seen unavailable";
    });
}

/* =========================================================
   WORKSPACE NAVIGATION
   ========================================================= */

function ensureWorkspaceNavigation() {
  if (chatNav) {
    chatNav.addEventListener("click", function () {
      switchWorkspace("chat");
    });
  }

  if (peopleNav) {
    peopleNav.addEventListener("click", function () {
      switchWorkspace("people");
    });
  }

  if (groupsNav) {
    groupsNav.addEventListener("click", function () {
      switchWorkspace("groups");
    });
  }

  if (peopleSearchInput) {
    peopleSearchInput.addEventListener("input", function () {
      if (currentWorkspace === "people") renderUsers();
    });
  }

  if (refreshUsers) {
    refreshUsers.addEventListener("click", async function () {
      try {
        await loadChattedUsers();

        if (currentWorkspace === "people") renderUsers();
        if (currentWorkspace === "groups") renderGroups();
      } catch (error) {
        console.warn("Refresh failed:", error);
      }
    });
  }
}

function switchWorkspace(workspace) {
  currentWorkspace = workspace;

  selectedUser = null;
  selectedGroup = null;

  clearSelectedPresenceListener();
  stopMessageListener();

  if (chatNav) chatNav.classList.toggle("active", workspace === "chat");
  if (peopleNav) peopleNav.classList.toggle("active", workspace === "people");
  if (groupsNav) groupsNav.classList.toggle("active", workspace === "groups");

  if (listTitle) {
    listTitle.textContent =
      workspace === "chat" ? "Chats" :
      workspace === "people" ? "People" : "Groups";
  }

  if (peopleSearchWrapper) {
    peopleSearchWrapper.classList.toggle("hidden", workspace !== "people");
  }

  const createGroupButton = document.getElementById("createGroupButtonNav");

  if (createGroupButton) {
    createGroupButton.style.display = workspace === "groups" ? "" : "none";
  }

  if (messageForm) messageForm.classList.add("hidden");

  if (workspace === "chat") {
    renderUsers();
    resetChatInterface();
    return;
  }

  if (workspace === "people") {
    renderUsers();
    resetChatInterface();
    renderEmptyChat(
      "People",
      "Select a person to start a private conversation."
    );
    return;
  }

  if (workspace === "groups") {
    renderGroups();
    resetChatInterface();
    renderEmptyChat("Groups", "Select a group to start messaging.");
  }
}

/* =========================================================
   SELECT USER / GROUP
   ========================================================= */

async function selectUser(user) {
  if (!user || !currentUser) return;

  selectedUser = user;
  selectedGroup = null;

  if (currentWorkspace === "groups") {
    switchWorkspace("chat");
    selectedUser = user;
  }

  if (chatNav) chatNav.classList.add("active");
  if (groupsNav) groupsNav.classList.remove("active");
  if (peopleNav) {
    peopleNav.classList.toggle("active", currentWorkspace === "people");
  }

  if (listTitle) {
    listTitle.textContent = currentWorkspace === "people" ? "People" : "Chats";
  }

  if (chatHeaderName) {
    chatHeaderName.textContent = user.name || user.email || "User";
  }

  if (chatHeaderAvatar) {
    if (user.photoURL) {
      chatHeaderAvatar.innerHTML =
        `<img src="${escapeHtml(user.photoURL)}" alt="${escapeHtml(user.name || "User")}">`;
    } else {
      chatHeaderAvatar.textContent = initials(user.name || user.email);
    }
  }

  if (chatHeaderStatus) {
    chatHeaderStatus.textContent = "Loading…";
  }

  listenToUserPresence(user.uid);

  if (messageForm) messageForm.classList.remove("hidden");

  renderEmptyChat(user.name || user.email || "Chat", "Loading messages…");

  ensureUserInChatList(user);

  listenToMessages();

  if (messageInput) messageInput.focus();
}

function selectGroup(group) {
  if (!group || !currentUser) return;

  selectedGroup = group;
  selectedUser = null;

  clearSelectedPresenceListener();

  currentWorkspace = "groups";

  if (chatNav) chatNav.classList.remove("active");
  if (peopleNav) peopleNav.classList.remove("active");
  if (groupsNav) groupsNav.classList.add("active");

  if (listTitle) listTitle.textContent = "Groups";

  if (chatHeaderName) chatHeaderName.textContent = group.name || "Group";

  if (chatHeaderAvatar) {
    chatHeaderAvatar.textContent = initials(group.name || "Group");
  }

  if (chatHeaderStatus) {
    const memberCount = Object.keys(group.members || {}).filter(function (uid) {
      return group.members[uid];
    }).length;

    chatHeaderStatus.textContent =
      memberCount + (memberCount === 1 ? " member" : " members") +
      " · tap for info";
  }

  if (messageForm) messageForm.classList.remove("hidden");

  renderEmptyChat(group.name || "Group", "Loading messages…");

  listenToMessages();

  if (messageInput) messageInput.focus();
}

/* =========================================================
   MESSAGE PATH + LISTENER
   ========================================================= */

function getCurrentMessagePath() {
  if (selectedUser && currentUser) {
    const chatId = makeChatId(currentUser.uid, selectedUser.uid);
    return `privateChats/${chatId}/messages`;
  }

  if (selectedGroup) {
    return `groups/${selectedGroup.id}/messages`;
  }

  return null;
}

function listenToMessages() {
  stopMessageListener();

  const path = getCurrentMessagePath();

  if (!path) return;

  activeMessagePath = path;

  const ref = db.ref(path).limitToLast(300);

  const callback = async function (snapshot) {
    if (activeMessagePath !== path) return;

    const data = snapshot.val() || {};

    const messageList = Object.keys(data)
      .map(function (id) {
        return Object.assign({}, data[id] || {}, { id: id });
      })
      .sort(function (a, b) {
        return Number(a.createdAt || 0) - Number(b.createdAt || 0);
      });

    if (selectedUser && !selectedGroup) {
      await updatePrivateMessageReceipts(messageList);
    }

    if (activeMessagePath !== path) return;

    renderMessages(messageList);
  };

  ref.on("value", callback);

  messageListener = { ref: ref, callback: callback };
}

/* =========================================================
   DELIVERY / READ RECEIPTS
   ========================================================= */

async function updatePrivateMessageReceipts(messageList) {
  if (!currentUser || !selectedUser || selectedGroup) return;

  const chatId = makeChatId(currentUser.uid, selectedUser.uid);
  const updates = {};

  messageList.forEach(function (message) {
    if (!message.senderId || message.senderId === currentUser.uid) return;

    const basePath = `privateChats/${chatId}/messages/${message.id}`;

    const delivered =
      message.deliveredTo && message.deliveredTo[currentUser.uid];

    const read = message.readBy && message.readBy[currentUser.uid];

    if (!delivered) {
      updates[`${basePath}/deliveredTo/${currentUser.uid}`] = true;
    }

    if (!read) {
      updates[`${basePath}/readBy/${currentUser.uid}`] = true;
    }
  });

  if (!Object.keys(updates).length) return;

  try {
    await db.ref().update(updates);
  } catch (error) {
    console.warn("Unable to update receipts:", error);
  }
}

function getPrivateMessageStatus(message) {
  if (!message || !currentUser || !selectedUser) return null;
  if (message.senderId !== currentUser.uid) return null;

  const recipientUid = message.recipientUid || selectedUser.uid;

  if (message.readBy && message.readBy[recipientUid]) {
    return { className: "read", symbol: "✓✓", title: "Read" };
  }

  if (message.deliveredTo && message.deliveredTo[recipientUid]) {
    return { className: "delivered", symbol: "✓✓", title: "Delivered" };
  }

  return {
    className: "sent",
    symbol: "✓",
    title: selectedUserOnline ? "Sent" : "Sent — recipient offline"
  };
}

/* =========================================================
   MESSAGE RENDERING
   ========================================================= */

function renderMessagesFromCurrentListener() {
  if (Array.isArray(lastRenderedMessages)) {
    renderMessages(lastRenderedMessages);
  }
}

function renderMessages(messageList) {
  lastRenderedMessages = messageList;

  if (!messages) return;

  if (!messageList.length) {
    messages.innerHTML = `
      <div class="empty-chat">
        <div class="empty-icon">💬</div>
        <h2>${
          selectedGroup
            ? escapeHtml(selectedGroup.name || "Group")
            : escapeHtml((selectedUser && (selectedUser.name || selectedUser.email)) || "Chat")
        }</h2>
        <p>No messages yet. Start the conversation.</p>
      </div>
    `;
    return;
  }

  const container = document.createDocumentFragment();
  let previousDate = "";

  for (let i = 0; i < messageList.length; i++) {
    const message = messageList[i];

    const messageDate = formatDate(message.createdAt);

    if (messageDate && messageDate !== previousDate) {
      const divider = document.createElement("div");
      divider.className = "message-date-divider";
      divider.textContent = messageDate;
      container.appendChild(divider);
      previousDate = messageDate;
    }

    const mine = currentUser && message.senderId === currentUser.uid;

    const row = document.createElement("div");
    row.className = mine ? "message-row mine" : "message-row";

    const bubble = document.createElement("div");
    bubble.className = mine ? "message-bubble mine" : "message-bubble";

    if (selectedGroup && !mine) {
      const sender = document.createElement("div");
      sender.className = "message-sender";
      sender.textContent = message.senderName || "User";
      bubble.appendChild(sender);
    }

    if (message.type === "image") {
      const source = message.photoData || message.body || "";

      if (source) {
        const image = document.createElement("img");
        image.className = "chat-image";
        image.alt = message.imageName || "Shared image";
        image.loading = "lazy";
        image.src = source;
        bubble.appendChild(image);
      } else {
        const errorText = document.createElement("div");
        errorText.className = "message-error";
        errorText.textContent = "📷 Photo unavailable";
        bubble.appendChild(errorText);
      }

      if (message.imageName) {
        const imageName = document.createElement("div");
        imageName.className = "image-name";
        imageName.textContent = message.imageName;
        bubble.appendChild(imageName);
      }
    } else {
      const text = document.createElement("div");
      text.className = "message-text";
      text.textContent = message.body || "";
      bubble.appendChild(text);
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const time = document.createElement("span");
    time.className = "message-time";
    time.textContent = formatTime(message.createdAt);
    meta.appendChild(time);

    if (mine && selectedUser && !selectedGroup) {
      const status = getPrivateMessageStatus(message);

      if (status) {
        const ticks = document.createElement("span");
        ticks.className = "message-ticks " + status.className;
        ticks.textContent = status.symbol;
        ticks.title = status.title;
        meta.appendChild(ticks);
      }
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    container.appendChild(row);
  }

  messages.innerHTML = "";
  messages.appendChild(container);

  requestAnimationFrame(function () {
    messages.scrollTop = messages.scrollHeight;
  });
}

/* =========================================================
   SENDING — PRIVATE TEXT
   ========================================================= */

async function sendPrivateText(text) {
  if (!currentUser || !selectedUser) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  const chatId = makeChatId(currentUser.uid, selectedUser.uid);

  await db.ref(`privateChats/${chatId}/messages`).push().set({
    senderId: currentUser.uid,
    senderName:
      (currentProfile && currentProfile.name) ||
      currentUser.displayName ||
      currentUser.email ||
      "User",
    recipientUid: selectedUser.uid,
    type: "text",
    body: trimmed,
    deliveredTo: {},
    readBy: {},
    createdAt: firebase.database.ServerValue.TIMESTAMP
  });

  ensureUserInChatList(selectedUser);
}

/* =========================================================
   SENDING — GROUP TEXT
   ========================================================= */

async function sendGroupText(text) {
  if (!currentUser || !selectedGroup) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  await db.ref(`groups/${selectedGroup.id}/messages`).push().set({
    senderId: currentUser.uid,
    senderName:
      (currentProfile && currentProfile.name) ||
      currentUser.displayName ||
      currentUser.email ||
      "User",
    type: "text",
    body: trimmed,
    createdAt: firebase.database.ServerValue.TIMESTAMP
  });
}

/* =========================================================
   MESSAGE FORM
   ========================================================= */

if (messageForm) {
  messageForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!messageInput) return;

    const text = messageInput.value;

    if (!text.trim()) return;

    try {
      messageInput.disabled = true;

      if (selectedUser && !selectedGroup) {
        await sendPrivateText(text);
      } else if (selectedGroup) {
        await sendGroupText(text);
      } else {
        return;
      }

      messageInput.value = "";
    } catch (error) {
      console.error("Message send failed:", error);
      alert(firebaseError(error));
    } finally {
      messageInput.disabled = false;
      messageInput.focus();
    }
  });
}

/* =========================================================
   SENDING — PHOTO
   ========================================================= */

async function sendPhoto(file) {
  if (!file) return;

  if (!selectedUser && !selectedGroup) {
    alert("Select a conversation first.");
    return;
  }

  setUploadStatus("Preparing photo…");

  try {
    const compressed = await compressImage(file, 1000, 0.72);
    const imageName = file.name || "photo.jpg";

    if (selectedUser && !selectedGroup) {
      setUploadStatus("Sending photo…");

      const chatId = makeChatId(currentUser.uid, selectedUser.uid);

      await db.ref(`privateChats/${chatId}/messages`).push().set({
        senderId: currentUser.uid,
        senderName:
          (currentProfile && currentProfile.name) ||
          currentUser.displayName ||
          currentUser.email ||
          "User",
        recipientUid: selectedUser.uid,
        type: "image",
        photoData: compressed,
        imageName: imageName,
        deliveredTo: {},
        readBy: {},
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });

      ensureUserInChatList(selectedUser);
    } else if (selectedGroup) {
      setUploadStatus("Sending photo…");

      await db.ref(`groups/${selectedGroup.id}/messages`).push().set({
        senderId: currentUser.uid,
        senderName:
          (currentProfile && currentProfile.name) ||
          currentUser.displayName ||
          currentUser.email ||
          "User",
        type: "image",
        photoData: compressed,
        imageName: imageName,
        createdAt: firebase.database.ServerValue.TIMESTAMP
      });
    }

    setUploadStatus("");
  } catch (error) {
    console.error("Photo send failed:", error);
    setUploadStatus("Photo failed to send.");
    setTimeout(function () {
      setUploadStatus("");
    }, 3000);
    alert(firebaseError(error));
  }
}

if (imageButton) {
  imageButton.addEventListener("click", function () {
    if (imageInput) imageInput.click();
  });
}

if (imageInput) {
  imageInput.addEventListener("change", async function () {
    const file = imageInput.files && imageInput.files[0];

    if (!file) return;

    await sendPhoto(file);

    imageInput.value = "";
  });
}

/* =========================================================
   HEADER CLICKS
   ========================================================= */

if (chatHeaderInfo) {
  chatHeaderInfo.addEventListener("click", function () {
    if (selectedGroup) {
      openGroupDetails(selectedGroup);
      return;
    }

    if (selectedUser) {
      openUserProfile(selectedUser);
    }
  });
}

if (profileCard) {
  profileCard.addEventListener("click", function (event) {
    if (event.target.closest(".account-actions")) return;
    openOwnProfile();
  });
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
  try {
    await markOffline();
  } catch (error) {
    console.warn(error);
  }

  clearAllListeners();

  selectedUser = null;
  selectedGroup = null;

  try {
    await auth.signOut();
  } catch (error) {
    console.error("Logout failed:", error);
  }
}

if (logoutButton) {
  logoutButton.addEventListener("click", function (event) {
    event.stopPropagation();
    logout();
  });
}

/* =========================================================
   DELETE ACCOUNT
   ========================================================= */

async function deleteAccount() {
  if (!currentUser) return;

  if (!window.confirm(
    "Are you sure you want to permanently delete your account? This cannot be undone."
  )) return;

  if (!window.confirm(
    "All of your profile information will be deleted. Continue?"
  )) return;

  const uid = currentUser.uid;

  try {
    await markOffline();
    await db.ref("users/" + uid).remove();
    await db.ref("presence/" + uid).remove();

    await currentUser.delete();

    clearAllListeners();
  } catch (error) {
    console.error("Account deletion failed:", error);
    alert(firebaseError(error));
  }
}

if (deleteAccountButton) {
  deleteAccountButton.addEventListener("click", function (event) {
    event.stopPropagation();
    deleteAccount();
  });
}

/* =========================================================
   RESET CHAT INTERFACE
   ========================================================= */

function resetChatInterface() {
  selectedUser = null;
  selectedGroup = null;

  clearSelectedPresenceListener();
  stopMessageListener();

  lastRenderedMessages = [];

  if (chatHeaderName) chatHeaderName.textContent = "Select a contact";

  if (chatHeaderStatus) {
    chatHeaderStatus.textContent =
      "Choose someone from People to start chatting.";
  }

  if (chatHeaderAvatar) chatHeaderAvatar.innerHTML = "";

  if (messageForm) messageForm.classList.add("hidden");

  renderEmptyChat(
    "Your conversations",
    "Select a person from People to start a private chat, or open Chat to continue an existing conversation."
  );
}

/* =========================================================
   START APPLICATION
   ========================================================= */

async function startApp(user) {
  currentUser = user;

  clearAllListeners();

  try {
    const snapshot = await db.ref("users/" + user.uid).once("value");

    currentProfile = snapshot.val() || null;

    if (!currentProfile) {
      currentProfile = {
        uid: user.uid,
        name: user.displayName || user.email || "User",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: firebase.database.ServerValue.TIMESTAMP
      };

      await db.ref("users/" + user.uid).set(currentProfile);
    } else {
      if (!currentProfile.uid) currentProfile.uid = user.uid;
      if (!currentProfile.email) currentProfile.email = user.email || "";
    }

    updateCurrentUserUI();

    showApp();

    resetChatInterface();

    startPresence();

    listenToUsers();
    listenToGroups();

    await loadChattedUsers();

    ensureGroupCreateButton();

    switchWorkspace("chat");
  } catch (error) {
    console.error("Application startup failed:", error);
    alert(firebaseError(error));
  }
}

/* =========================================================
   AUTH STATE
   ========================================================= */

auth.onAuthStateChanged(async function (user) {
  if (user) {
    await startApp(user);
    return;
  }

  clearAllListeners();

  currentUser = null;
  currentProfile = null;

  selectedUser = null;
  selectedGroup = null;

  availableUsers = [];
  chattedUsers = [];
  groupCache = {};

  currentWorkspace = "chat";

  currentGroupModalGroup = null;

  lastRenderedMessages = [];

  if (userList) userList.innerHTML = "";

  closeProfile();
  closeGroupDetails();

  resetChatInterface();

  showAuth();

  setAuthMode(authMode || "login");
});

/* =========================================================
   GLOBAL HANDLERS
   ========================================================= */

window.addEventListener("error", function (event) {
  console.error("TeamSpace error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", function (event) {
  console.error("Unhandled TeamSpace promise:", event.reason);
});

window.addEventListener("beforeunload", function () {
  /* Firebase onDisconnect handles online/offline transitions. */
});

/* =========================================================
   INIT
   ========================================================= */

injectStyles();
initializeTheme();
ensureWorkspaceNavigation();
ensureGroupCreateButton();
setAuthMode("login");

console.log("TeamSpace Chat initialized.");