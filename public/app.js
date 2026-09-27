/*
  ============================================================
  TEAMSPACE
  Firebase Authentication + Realtime Database
  ============================================================

  FEATURES
  - User registration/login
  - Private real-time messaging
  - Chat / People / Groups navigation
  - Chat workspace shows only existing conversations
  - People workspace shows all registered users
  - Groups workspace shows only user's groups
  - User profile viewing
  - User profile editing
  - Profile photo support
  - Group details
  - Group member list
  - Online/offline presence
  - Last seen
  - Dark mode
  - Photo sharing without Firebase Storage
  - Browser-side photo compression
  - Responsive desktop/tablet/mobile layout
  - Independently scrollable people/chats/groups
  - Independently scrollable messages
  - Log out
  - Delete account

  GROUP UX
  - Clicking a group in Groups opens the conversation
  - Group details are NOT opened from the Groups list
  - Clicking the group name/header while inside the group
    conversation opens Group Details
  ============================================================
*/


/*
  ============================================================
  FIREBASE CONFIGURATION
  ============================================================
*/

const firebaseConfig = {
  apiKey: "AIzaSyBTj01QDxQJEp2iU_bTKvqV2TjxBg3cxlE",
  authDomain: "teams-3d363.firebaseapp.com",
  databaseURL: "https://teams-3d363-default-rtdb.firebaseio.com",
  projectId: "teams-3d363",
  storageBucket: "teams-3d363.firebasestorage.app",
  messagingSenderId: "702399693714",
  appId: "1:702399693714:web:5ed8f61810f9de455c374b",
  measurementId: "G-6RECH0R5EV"
};


if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.database();


/*
  ============================================================
  DOM ELEMENTS
  ============================================================
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
  Group header information area.
  This is the clickable area when a group conversation
  is currently open.
*/
const chatHeaderInfo =
  document.getElementById("chatHeaderInfo") ||
  document.querySelector(".chat-header-info");

const themeToggle = document.getElementById("themeToggle");
const imageButton = document.getElementById("imageButton");
const imageInput = document.getElementById("imageInput");
const uploadStatus = document.getElementById("uploadStatus");

const logoutBtn = document.getElementById("logoutBtn");
const deleteAccountBtn =
  document.getElementById("deleteAccountBtn");

const refreshUsers =
  document.getElementById("refreshUsers");

let chatNav =
  document.getElementById("chatNav");

let peopleNav =
  document.getElementById("peopleNav");

let groupsNav =
  document.getElementById("groupsNav");

let listTitle =
  document.getElementById("listTitle");


/*
  ============================================================
  APPLICATION STATE
  ============================================================
*/

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

let presenceConnectionRef = null;
let presenceConnectionCallback = null;

let selectedPresenceRef = null;
let selectedPresenceCallback = null;

const activeListeners = [];


/*
  ============================================================
  BASIC HELPERS
  ============================================================
*/

function initials(name) {

  const value =
    String(name || "").trim();

  if (!value) {
    return "?";
  }

  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      part =>
        part.charAt(0).toUpperCase()
    )
    .join("");

}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function formatTime(value) {

  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}


function formatDate(value) {

  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString(
    [],
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );

}


function formatLastSeen(timestamp) {

  if (!timestamp) {
    return "Last seen unavailable";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Last seen unavailable";
  }

  const difference =
    Math.max(
      0,
      Date.now() - date.getTime()
    );

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) {
    return "Last seen just now";
  }

  if (difference < hour) {

    const minutes =
      Math.floor(difference / minute);

    return (
      "Last seen " +
      minutes +
      " minute" +
      (minutes === 1 ? "" : "s") +
      " ago"
    );

  }

  if (difference < day) {

    const hours =
      Math.floor(difference / hour);

    return (
      "Last seen " +
      hours +
      " hour" +
      (hours === 1 ? "" : "s") +
      " ago"
    );

  }

  return (
    "Last seen " +
    date.toLocaleDateString(
      [],
      {
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    ) +
    " at " +
    date.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )
  );

}


function setError(message) {

  if (authError) {
    authError.textContent = message || "";
  }

}


function firebaseError(error) {

  const messages = {

    "auth/email-already-in-use":
      "An account with this email already exists.",

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/weak-password":
      "Your password must be at least 6 characters.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/user-not-found":
      "No account was found with that email.",

    "auth/wrong-password":
      "Incorrect email or password.",

    "auth/too-many-requests":
      "Too many attempts. Please wait and try again.",

    "auth/network-request-failed":
      "Network error. Check your internet connection.",

    "auth/operation-not-allowed":
      "Email/password sign-in is not enabled in Firebase.",

    "auth/requires-recent-login":
      "For security, please sign out and sign in again before deleting your account.",

    "database/permission-denied":
      "Firebase denied this operation. Check your Realtime Database rules.",

    "database/network-error":
      "A database network error occurred.",

    "database/unavailable":
      "The database is temporarily unavailable."

  };

  return (
    messages[error?.code] ||
    error?.message ||
    "Something went wrong. Please try again."
  );

}


function showAuth() {

  if (authScreen) {
    authScreen.classList.remove("hidden");
  }

  if (appScreen) {
    appScreen.classList.add("hidden");
  }

}


function showApplication() {

  if (authScreen) {
    authScreen.classList.add("hidden");
  }

  if (appScreen) {
    appScreen.classList.remove("hidden");
  }

}


function makeChatId(uid1, uid2) {

  return [
    uid1,
    uid2
  ]
    .sort()
    .join("_");

}


/*
  ============================================================
  GROUP HEADER INTERACTION
  ============================================================
*/

function setGroupHeaderClickable(enabled) {

  if (!chatHeaderInfo) {
    return;
  }

  chatHeaderInfo.classList.toggle(
    "group-header-clickable",
    enabled
  );

  chatHeaderInfo.setAttribute(
    "role",
    enabled ? "button" : "presentation"
  );

  chatHeaderInfo.setAttribute(
    "tabindex",
    enabled ? "0" : "-1"
  );

  chatHeaderInfo.setAttribute(
    "aria-label",
    enabled
      ? "Open group details"
      : ""
  );

}


function openSelectedGroupDetails() {

  if (
    !selectedGroup ||
    !currentUser
  ) {

    return;

  }

  openGroupDetails(
    selectedGroup
  );

}


if (chatHeaderInfo) {

  chatHeaderInfo.addEventListener(
    "click",
    event => {

      /*
        Only groups can open details from
        the chat header.

        Private chat headers do nothing.
      */

      if (!selectedGroup) {
        return;
      }

      /*
        Ignore clicks that originate from
        interactive controls if any are
        later added to the header.
      */

      if (
        event.target.closest(
          "button, a, input"
        )
      ) {

        return;

      }

      openSelectedGroupDetails();

    }
  );


  chatHeaderInfo.addEventListener(
    "keydown",
    event => {

      if (!selectedGroup) {
        return;
      }

      if (
        event.key === "Enter" ||
        event.key === " "
      ) {

        event.preventDefault();

        openSelectedGroupDetails();

      }

    }
  );

}


/*
  ============================================================
  ENSURE WORKSPACE NAVIGATION
  ============================================================
*/

function ensureWorkspaceNavigation() {

  const sidebarSections =
    document.querySelectorAll(
      ".sidebar-section"
    );

  if (!sidebarSections.length) {
    return;
  }

  chatNav =
    document.getElementById("chatNav");

  peopleNav =
    document.getElementById("peopleNav");

  groupsNav =
    document.getElementById("groupsNav");

  listTitle =
    document.getElementById("listTitle");

  const workspaceSection =
    sidebarSections[0];

  const oldNavButtons =
    workspaceSection.querySelectorAll(
      ".nav-item"
    );

  if (!chatNav && oldNavButtons[0]) {

    oldNavButtons[0].id =
      "chatNav";

    chatNav =
      oldNavButtons[0];

  }

  if (!peopleNav && oldNavButtons[1]) {

    oldNavButtons[1].id =
      "peopleNav";

    peopleNav =
      oldNavButtons[1];

  }

  if (!groupsNav) {

    groupsNav =
      document.createElement("button");

    groupsNav.id =
      "groupsNav";

    groupsNav.className =
      "nav-item";

    groupsNav.type =
      "button";

    groupsNav.innerHTML =
      "<span>👥</span> Groups";

    workspaceSection.appendChild(
      groupsNav
    );

  }

  if (chatNav) {

    chatNav.innerHTML =
      "<span>💬</span> Chat";

    chatNav.type =
      "button";

  }

  if (peopleNav) {

    peopleNav.innerHTML =
      "<span>👥</span> People";

    peopleNav.type =
      "button";

  }

  if (!listTitle) {

    const contactsSection =
      document.querySelector(
        ".contacts-section"
      );

    const sectionTitle =
      contactsSection?.querySelector(
        ".section-title"
      );

    if (sectionTitle) {

      const existingSpan =
        sectionTitle.querySelector("span");

      if (existingSpan) {

        existingSpan.id =
          "listTitle";

        listTitle =
          existingSpan;

      } else {

        const span =
          document.createElement("span");

        span.id =
          "listTitle";

        span.textContent =
          "Chats";

        sectionTitle.prepend(span);

        listTitle =
          span;

      }

    }

  }

}


ensureWorkspaceNavigation();


/*
  ============================================================
  DYNAMIC STYLES
  ============================================================
*/

function installDynamicStyles() {

  if (
    document.getElementById(
      "teamspaceDynamicStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "teamspaceDynamicStyles";

  style.textContent = `

    html,
    body {
      width: 100%;
      min-width: 0;
      min-height: 100%;
      margin: 0;
    }

    body {
      overflow: hidden;
    }

    .app {
      width: 100%;
      height: 100dvh;
      min-height: 100vh;
      display: flex;
      min-width: 0;
      overflow: hidden;
    }

    .sidebar {
      min-width: 0 !important;
      min-height: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      flex-direction: column !important;
    }

    .chat-area {
      min-width: 0 !important;
      min-height: 0 !important;
      flex: 1 1 auto !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      position: relative;
    }

    .sidebar-section {
      min-width: 0;
    }

    .contacts-section {
      min-height: 0 !important;
      flex: 1 1 auto !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }

    .contacts-section .section-title {
      flex: 0 0 auto;
    }

    #userList {
      min-width: 0;
      min-height: 0 !important;
      flex: 1 1 auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      padding-bottom: 10px;
    }

    #messages {
      min-width: 0 !important;
      min-height: 0 !important;
      flex: 1 1 auto !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      scroll-behavior: smooth;
      scrollbar-width: thin;
    }

    .chat-header {
      flex: 0 0 auto;
      min-width: 0;
    }

    .composer {
      flex: 0 0 auto;
      min-width: 0;
    }

    .chat-header-info {
      min-width: 0;
      overflow: hidden;
      transition: opacity .15s ease;
    }

    .chat-header-info h2,
    .chat-header-info p {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /*
      Group header is clickable ONLY while
      a group conversation is open.
    */

    #chatHeaderInfo.group-header-clickable {
      cursor: pointer;
      user-select: none;
    }

    #chatHeaderInfo.group-header-clickable:hover {
      opacity: .82;
    }

    #chatHeaderInfo.group-header-clickable:focus-visible {
      outline: 2px solid #1f5eff;
      outline-offset: 4px;
      border-radius: 6px;
    }

    .user-item {
      min-width: 0;
      cursor: pointer;
    }

    .user-info {
      min-width: 0;
      overflow: hidden;
    }

    .user-info strong,
    .user-info span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .profile-clickable {
      cursor: pointer;
      position: relative;
      z-index: 2;
    }

    .profile-clickable:hover {
      transform: scale(1.02);
    }

    .profile-clickable {
      transition: transform .15s ease;
    }

    .message-row {
      max-width: 100%;
      box-sizing: border-box;
    }

    .message {
      max-width: min(75%, 650px);
      overflow-wrap: anywhere;
      word-break: break-word;
      box-sizing: border-box;
    }

    .message-body {
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .chat-image {
      display: block;
      max-width: min(320px, 100%);
      max-height: 360px;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 12px;
      cursor: pointer;
      margin-bottom: 5px;
    }

    .sidebar-top {
      position: relative;
      flex-shrink: 0;
    }

    .theme-toggle {
      position: absolute;
      right: 12px;
      top: 12px;
      width: 38px;
      height: 38px;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.06);
      transition: .2s ease;
      z-index: 5;
    }

    .theme-toggle:hover {
      transform: scale(1.05);
    }

    .image-button {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 20px;
      background: transparent;
      transition: .2s ease;
    }

    .image-button:hover {
      background: rgba(0,0,0,.08);
    }

    .image-button:disabled {
      opacity: .55;
      cursor: not-allowed;
    }

    .upload-status {
      display: none;
      position: absolute;
      bottom: 70px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20,20,20,.92);
      color: white;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 13px;
      z-index: 20;
      white-space: nowrap;
      max-width: 90%;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #teamspaceGroupButton {
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .teamspace-group-item {
      cursor: pointer;
    }

    #chatNav,
    #peopleNav,
    #groupsNav {
      width: 100%;
    }

    #chatNav span,
    #peopleNav span,
    #groupsNav span {
      display: inline-flex;
      width: 24px;
      justify-content: center;
      flex-shrink: 0;
    }

    .account-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    .account-btn {
      width: 34px;
      height: 34px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      transition: .2s ease;
    }

    .logout-btn,
    .delete-account-btn {
      background: transparent;
    }

    .logout-btn:hover {
      background: rgba(0,0,0,.08);
    }

    .delete-account-btn:hover {
      background: rgba(220,38,38,.12);
    }

    .no-users {
      padding: 20px 14px;
      text-align: center;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }

    .teamspace-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      background: rgba(0,0,0,.58);
    }

    .teamspace-modal {
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 16px;
      padding: 24px;
      box-sizing: border-box;
      background: #fff;
      color: #222;
      box-shadow: 0 20px 60px rgba(0,0,0,.25);
    }

    .teamspace-modal-header {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }

    .teamspace-modal-avatar {
      width: 64px;
      height: 64px;
      min-width: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #1f5eff;
      color: #fff;
      font-size: 22px;
      font-weight: 700;
    }

    .teamspace-modal-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .teamspace-modal h2,
    .teamspace-modal h3 {
      margin-top: 0;
    }

    .teamspace-modal-close {
      margin-left: auto;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: rgba(0,0,0,.07);
      cursor: pointer;
      font-size: 20px;
      flex-shrink: 0;
    }

    .teamspace-modal-close:hover {
      background: rgba(0,0,0,.13);
    }

    .teamspace-detail-row {
      padding: 12px 0;
      border-bottom: 1px solid rgba(128,128,128,.2);
    }

    .teamspace-detail-label {
      font-size: 12px;
      font-weight: 700;
      opacity: .65;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .teamspace-detail-value {
      font-size: 15px;
      overflow-wrap: anywhere;
    }

    .teamspace-member {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border-radius: 10px;
      margin-bottom: 5px;
    }

    .teamspace-member:hover {
      background: rgba(128,128,128,.08);
    }

    .teamspace-small-avatar {
      width: 40px;
      height: 40px;
      min-width: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1f5eff;
      color: #fff;
      font-weight: 700;
      overflow: hidden;
    }

    .teamspace-small-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .teamspace-member-info {
      min-width: 0;
    }

    .teamspace-member-info strong,
    .teamspace-member-info span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .teamspace-modal-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      flex-wrap: wrap;
      margin-top: 20px;
    }

    .teamspace-modal-btn {
      border: none;
      border-radius: 9px;
      padding: 10px 16px;
      cursor: pointer;
      font-weight: 600;
    }

    .teamspace-primary-btn {
      background: #1f5eff;
      color: #fff;
    }

    .teamspace-secondary-btn {
      background: rgba(128,128,128,.12);
      color: inherit;
    }

    .teamspace-danger-btn {
      background: #dc2626;
      color: #fff;
    }

    .teamspace-form-group {
      margin-bottom: 16px;
    }

    .teamspace-form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 600;
    }

    .teamspace-form-input {
      width: 100%;
      box-sizing: border-box;
      padding: 11px 12px;
      border: 1px solid #ccc;
      border-radius: 9px;
      font: inherit;
    }

    .teamspace-profile-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }

    .teamspace-profile-preview-avatar {
      width: 90px;
      height: 90px;
      border-radius: 50%;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1f5eff;
      color: white;
      font-size: 30px;
      font-weight: 700;
    }

    .teamspace-profile-preview-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .teamspace-photo-label {
      display: inline-block;
      padding: 8px 13px;
      border-radius: 8px;
      background: rgba(31,94,255,.1);
      color: #1f5eff;
      cursor: pointer;
      font-weight: 600;
    }

    .teamspace-photo-label input {
      display: none;
    }

    body.dark-mode {
      background: #0f172a !important;
      color: #e5e7eb !important;
    }

    body.dark-mode .sidebar,
    body.dark-mode .chat-area,
    body.dark-mode .messages,
    body.dark-mode .profile,
    body.dark-mode .sidebar-section,
    body.dark-mode .sidebar-top {
      background: #111827 !important;
      color: #e5e7eb !important;
    }

    body.dark-mode .chat-header {
      background: #111827 !important;
      color: #e5e7eb !important;
      border-color: #374151 !important;
    }

    body.dark-mode .auth-screen {
      background: #0f172a !important;
    }

    body.dark-mode .auth-card {
      background: #111827 !important;
      color: #e5e7eb !important;
    }

    body.dark-mode label,
    body.dark-mode .section-title,
    body.dark-mode .profile-info,
    body.dark-mode .chat-header h2,
    body.dark-mode .chat-header p {
      color: #e5e7eb !important;
    }

    body.dark-mode input,
    body.dark-mode textarea,
    body.dark-mode select {
      background: #1f2937 !important;
      color: #f9fafb !important;
      border-color: #4b5563 !important;
    }

    body.dark-mode input::placeholder,
    body.dark-mode textarea::placeholder {
      color: #9ca3af !important;
    }

    body.dark-mode .nav-item,
    body.dark-mode .user-item {
      color: #e5e7eb !important;
    }

    body.dark-mode .user-item:hover,
    body.dark-mode .nav-item:hover {
      background: #1f2937 !important;
    }

    body.dark-mode .user-item.selected,
    body.dark-mode .nav-item.active {
      background: #26344d !important;
    }

    body.dark-mode .message {
      background: #1f2937 !important;
      color: #f3f4f6 !important;
    }

    body.dark-mode .message-row.mine .message {
      background: #2563eb !important;
      color: #ffffff !important;
    }

    body.dark-mode .message-time {
      color: #cbd5e1 !important;
    }

    body.dark-mode .empty-chat {
      color: #cbd5e1 !important;
    }

    body.dark-mode .empty-chat h2 {
      color: #f3f4f6 !important;
    }

    body.dark-mode .composer {
      background: #111827 !important;
      border-color: #374151 !important;
    }

    body.dark-mode .image-button {
      color: #e5e7eb !important;
    }

    body.dark-mode .image-button:hover,
    body.dark-mode .theme-toggle:hover {
      background: #374151 !important;
    }

    body.dark-mode .theme-toggle {
      background: #374151 !important;
      color: #ffffff !important;
    }

    body.dark-mode .no-users {
      color: #cbd5e1 !important;
    }

    body.dark-mode .tab {
      color: #d1d5db !important;
    }

    body.dark-mode .tab.active {
      color: #ffffff !important;
    }

    body.dark-mode .error {
      color: #fca5a5 !important;
    }

    body.dark-mode .account-btn {
      color: #e5e7eb !important;
    }

    body.dark-mode .delete-account-btn:hover {
      background: rgba(248,113,113,.15);
    }

    body.dark-mode .teamspace-modal {
      background: #1f2937;
      color: #f9fafb;
    }

    body.dark-mode .teamspace-modal-close,
    body.dark-mode .teamspace-secondary-btn {
      background: #374151;
      color: #fff;
    }

    body.dark-mode .teamspace-detail-row {
      border-color: #374151;
    }

    body.dark-mode .teamspace-form-input {
      background: #111827;
      color: #fff;
      border-color: #4b5563;
    }

    body.dark-mode .teamspace-member:hover {
      background: #374151;
    }

    @media (max-width: 760px) {

      body {
        overflow: hidden;
      }

      .app {
        height: 100dvh;
        min-height: 100dvh;
        flex-direction: column;
      }

      .sidebar {
        flex: 0 0 42%;
        width: 100%;
        max-width: none;
        min-height: 0 !important;
        max-height: 50dvh;
        border-right: none !important;
        border-bottom: 1px solid rgba(128,128,128,.2);
      }

      .chat-area {
        flex: 1 1 58%;
        width: 100%;
        min-height: 0 !important;
      }

      .message {
        max-width: 88%;
      }

      .chat-image {
        max-width: min(260px, 75vw);
      }

    }

    @media (max-width: 480px) {

      .sidebar {
        flex-basis: 40%;
        max-height: 46dvh;
      }

      .chat-area {
        flex-basis: 60%;
      }

      .message {
        max-width: 92%;
      }

      .chat-image {
        max-width: 70vw;
      }

      .teamspace-modal-overlay {
        padding: 10px;
      }

      .teamspace-modal {
        padding: 18px;
        max-height: 94vh;
      }

    }

  `;

  document.head.appendChild(style);

}

installDynamicStyles();


/*
  ============================================================
  DARK MODE
  ============================================================
*/

function applyTheme(theme) {

  const dark =
    theme === "dark";

  document.body.classList.toggle(
    "dark-mode",
    dark
  );

  if (themeToggle) {

    themeToggle.textContent =
      dark ? "☀️" : "🌙";

    themeToggle.title =
      dark
        ? "Switch to light mode"
        : "Switch to dark mode";

    themeToggle.setAttribute(
      "aria-label",
      dark
        ? "Switch to light mode"
        : "Switch to dark mode"
    );

  }

}


function loadTheme() {

  const savedTheme =
    localStorage.getItem(
      "teamspaceTheme"
    ) || "light";

  applyTheme(savedTheme);

}

loadTheme();


if (themeToggle) {

  themeToggle.addEventListener(
    "click",
    () => {

      const isDark =
        document.body.classList.contains(
          "dark-mode"
        );

      const newTheme =
        isDark ? "light" : "dark";

      localStorage.setItem(
        "teamspaceTheme",
        newTheme
      );

      applyTheme(newTheme);

    }
  );

}


/*
  ============================================================
  LISTENER CLEANUP
  ============================================================
*/

function clearMessageListener() {

  if (
    messageListener &&
    activeMessagePath
  ) {

    db.ref(
      activeMessagePath
    ).off(
      "value",
      messageListener
    );

  }

  messageListener = null;
  activeMessagePath = null;

}


function clearSelectedPresenceListener() {

  if (
    selectedPresenceRef &&
    selectedPresenceCallback
  ) {

    selectedPresenceRef.off(
      "value",
      selectedPresenceCallback
    );

  }

  selectedPresenceRef = null;
  selectedPresenceCallback = null;

}


function clearPresenceListeners() {

  clearSelectedPresenceListener();

  activeListeners
    .filter(
      item =>
        item.type === "presence"
    )
    .forEach(
      item => {

        item.ref.off(
          item.event,
          item.callback
        );

      }
    );

  for (
    let i = activeListeners.length - 1;
    i >= 0;
    i--
  ) {

    if (
      activeListeners[i].type ===
      "presence"
    ) {

      activeListeners.splice(
        i,
        1
      );

    }

  }

}


function clearAllListeners() {

  if (usersListener) {

    usersListener.ref.off(
      "value",
      usersListener.callback
    );

  }

  if (groupsListener) {

    groupsListener.ref.off(
      "value",
      groupsListener.callback
    );

  }

  usersListener = null;
  groupsListener = null;

  clearMessageListener();
  clearPresenceListeners();

  activeListeners.forEach(
    item => {

      item.ref.off(
        item.event,
        item.callback
      );

    }
  );

  activeListeners.length = 0;

}


/*
  ============================================================
  EMPTY CHAT
  ============================================================
*/

function renderEmptyChat(
  title,
  description
) {

  if (!messagesBox) {
    return;
  }

  messagesBox.innerHTML = `

    <div class="empty-chat">

      <div class="empty-icon">
        💬
      </div>

      <h2>
        ${escapeHtml(title)}
      </h2>

      <p>
        ${escapeHtml(description)}
      </p>

    </div>

  `;

}


/*
  ============================================================
  PROFILE UI
  ============================================================
*/

function getProfilePhoto(profile) {

  return (
    profile?.photoURL ||
    profile?.photo ||
    ""
  );

}


function setAvatarElement(
  element,
  profile,
  fallbackName
) {

  if (!element) {
    return;
  }

  const photo =
    getProfilePhoto(profile);

  const name =
    profile?.name ||
    fallbackName ||
    "User";

  element.innerHTML =
    "";

  if (photo) {

    const img =
      document.createElement("img");

    img.src =
      photo;

    img.alt =
      name;

    img.style.width =
      "100%";

    img.style.height =
      "100%";

    img.style.objectFit =
      "cover";

    element.appendChild(
      img
    );

  } else {

    element.textContent =
      initials(name);

  }

}


function updateProfileUI() {

  const myName =
    document.getElementById(
      "myName"
    );

  const myEmail =
    document.getElementById(
      "myEmail"
    );

  const myAvatar =
    document.getElementById(
      "myAvatar"
    );

  if (myName) {

    myName.textContent =
      currentProfile?.name ||
      currentUser?.email ||
      "";

  }

  if (myEmail) {

    myEmail.textContent =
      currentUser?.email ||
      "";

  }

  setAvatarElement(
    myAvatar,
    currentProfile,
    currentUser?.email
  );

  const profileArea =
    document.querySelector(
      ".profile"
    );

  if (profileArea) {

    profileArea.classList.add(
      "profile-clickable"
    );

    profileArea.title =
      "Open your profile";

  }

}


function attachOwnProfileClick() {

  const profileArea =
    document.querySelector(
      ".profile"
    );

  if (!profileArea) {
    return;
  }

  if (
    profileArea.dataset.profileHandlerAttached ===
    "true"
  ) {
    return;
  }

  profileArea.dataset.profileHandlerAttached =
    "true";

  profileArea.addEventListener(
    "click",
    event => {

      if (
        event.target.closest(
          "#logoutBtn, #deleteAccountBtn, .account-btn"
        )
      ) {

        return;

      }

      openOwnProfileModal();

    }
  );

}


/*
  ============================================================
  MODAL HELPERS
  ============================================================
*/

function removeTeamspaceModal() {

  document
    .querySelectorAll(
      ".teamspace-modal-overlay"
    )
    .forEach(
      modal => modal.remove()
    );

}


function createModal(
  title
) {

  removeTeamspaceModal();

  const overlay =
    document.createElement(
      "div"
    );

  overlay.className =
    "teamspace-modal-overlay";

  const modal =
    document.createElement(
      "div"
    );

  modal.className =
    "teamspace-modal";

  modal.innerHTML = `

    <div
      style="
        display:flex;
        align-items:center;
        gap:10px;
        margin-bottom:18px
      "
    >

      <h2 style="margin:0">
        ${escapeHtml(title)}
      </h2>

      <button
        class="teamspace-modal-close"
        type="button"
        aria-label="Close"
      >
        ×
      </button>

    </div>

    <div class="teamspace-modal-content"></div>

  `;

  overlay.appendChild(
    modal
  );

  document.body.appendChild(
    overlay
  );

  const closeButton =
    modal.querySelector(
      ".teamspace-modal-close"
    );

  closeButton.addEventListener(
    "click",
    () => overlay.remove()
  );

  overlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        overlay
      ) {

        overlay.remove();

      }

    }
  );

  return {
    overlay,
    modal,
    content:
      modal.querySelector(
        ".teamspace-modal-content"
      )
  };

}


/*
  ============================================================
  PROFILE PHOTO COMPRESSION
  ============================================================
*/

function compressProfilePhoto(
  file
) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload =
        event => {

          const image =
            new Image();

          image.onload =
            () => {

              const maxSize =
                500;

              let width =
                image.width;

              let height =
                image.height;

              if (
                width >
                  maxSize ||
                height >
                  maxSize
              ) {

                const ratio =
                  Math.min(
                    maxSize / width,
                    maxSize / height
                  );

                width =
                  Math.round(
                    width * ratio
                  );

                height =
                  Math.round(
                    height * ratio
                  );

              }

              const canvas =
                document.createElement(
                  "canvas"
                );

              canvas.width =
                width;

              canvas.height =
                height;

              const context =
                canvas.getContext(
                  "2d"
                );

              if (!context) {

                reject(
                  new Error(
                    "Image compression is not supported."
                  )
                );

                return;

              }

              context.drawImage(
                image,
                0,
                0,
                width,
                height
              );

              let quality =
                0.78;

              let dataUrl =
                canvas.toDataURL(
                  "image/jpeg",
                  quality
                );

              const maxBytes =
                250 * 1024;

              while (
                dataUrl.length >
                  maxBytes &&
                quality >
                  0.35
              ) {

                quality -=
                  0.07;

                dataUrl =
                  canvas.toDataURL(
                    "image/jpeg",
                    quality
                  );

              }

              resolve(
                dataUrl
              );

            };

          image.onerror =
            () => {

              reject(
                new Error(
                  "The selected photo could not be opened."
                )
              );

            };

          image.src =
            event.target.result;

        };

      reader.onerror =
        () => {

          reject(
            new Error(
              "Unable to read the selected photo."
            )
          );

        };

      reader.readAsDataURL(
        file
      );

    }
  );

}


/*
  ============================================================
  EDIT OWN PROFILE
  ============================================================
*/

function openOwnProfileModal() {

  if (!currentUser) {
    return;
  }

  const modal =
    createModal(
      "My Profile"
    );

  const photo =
    getProfilePhoto(
      currentProfile
    );

  modal.content.innerHTML = `

    <div class="teamspace-profile-preview">

      <div
        id="teamspaceProfilePreview"
        class="teamspace-profile-preview-avatar"
      >
      </div>

      <label class="teamspace-photo-label">

        Change profile photo

        <input
          id="teamspaceProfilePhoto"
          type="file"
          accept="image/*"
        >

      </label>

    </div>

    <div class="teamspace-form-group">

      <label for="teamspaceProfileName">
        Full name
      </label>

      <input
        id="teamspaceProfileName"
        class="teamspace-form-input"
        type="text"
        maxlength="80"
        value="${escapeHtml(
          currentProfile?.name ||
          currentUser.email ||
          ""
        )}"
      >

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Email
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          currentUser.email ||
          ""
        )}
      </div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Member since
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          formatDate(
            currentProfile?.createdAt
          ) ||
          "Not available"
        )}
      </div>

    </div>

    <div
      id="teamspaceProfileError"
      style="
        color:#dc2626;
        min-height:20px;
        margin-top:12px
      "
    ></div>

    <div class="teamspace-modal-actions">

      <button
        id="teamspaceCancelProfile"
        class="teamspace-modal-btn teamspace-secondary-btn"
        type="button"
      >
        Cancel
      </button>

      <button
        id="teamspaceSaveProfile"
        class="teamspace-modal-btn teamspace-primary-btn"
        type="button"
      >
        Save Changes
      </button>

    </div>

  `;

  const preview =
    document.getElementById(
      "teamspaceProfilePreview"
    );

  const photoInput =
    document.getElementById(
      "teamspaceProfilePhoto"
    );

  const nameElement =
    document.getElementById(
      "teamspaceProfileName"
    );

  const errorElement =
    document.getElementById(
      "teamspaceProfileError"
    );

  const saveButton =
    document.getElementById(
      "teamspaceSaveProfile"
    );

  const cancelButton =
    document.getElementById(
      "teamspaceCancelProfile"
    );

  function updatePreview(
    imageUrl
  ) {

    preview.innerHTML =
      "";

    if (imageUrl) {

      const img =
        document.createElement(
          "img"
        );

      img.src =
        imageUrl;

      img.alt =
        "Profile photo";

      preview.appendChild(
        img
      );

    } else {

      preview.textContent =
        initials(
          nameElement.value ||
          currentProfile?.name
        );

    }

  }

  updatePreview(photo);

  nameElement.addEventListener(
    "input",
    () => {

      if (
        !getProfilePhoto(
          currentProfile
        )
      ) {

        updatePreview("");

      }

    }
  );

  photoInput.addEventListener(
    "change",
    async event => {

      const file =
        event.target.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {

        errorElement.textContent =
          "Please select an image.";

        return;

      }

      if (
        file.size >
        5 * 1024 * 1024
      ) {

        errorElement.textContent =
          "Profile photo must be 5 MB or smaller.";

        return;

      }

      try {

        errorElement.textContent =
          "Processing photo...";

        const compressed =
          await compressProfilePhoto(
            file
          );

        updatePreview(
          compressed
        );

        preview.dataset.newPhoto =
          compressed;

        errorElement.textContent =
          "";

      } catch (error) {

        console.error(
          "Profile photo error:",
          error
        );

        errorElement.textContent =
          error.message;

      }

    }
  );

  cancelButton.addEventListener(
    "click",
    () => modal.overlay.remove()
  );

  saveButton.addEventListener(
    "click",
    async () => {

      const name =
        nameElement.value.trim();

      if (!name) {

        errorElement.textContent =
          "Please enter your name.";

        return;

      }

      if (name.length > 80) {

        errorElement.textContent =
          "Your name must be 80 characters or less.";

        return;

      }

      saveButton.disabled =
        true;

      saveButton.textContent =
        "Saving...";

      errorElement.textContent =
        "";

      try {

        const updates = {
          name
        };

        if (
          preview.dataset.newPhoto
        ) {

          updates.photoURL =
            preview.dataset.newPhoto;

        }

        await db.ref(
          "users/" +
          currentUser.uid
        ).update(
          updates
        );

        await currentUser.updateProfile({

          displayName:
            name,

          ...(updates.photoURL
            ? {
                photoURL:
                  updates.photoURL
              }
            : {})

        });

        currentProfile = {

          ...currentProfile,

          ...updates

        };

        updateProfileUI();

        attachOwnProfileClick();

        availableUsers =
          availableUsers.map(
            user =>
              user.uid ===
              currentUser.uid
                ? {
                    ...user,
                    ...updates
                  }
                : user
          );

        chattedUsers =
          chattedUsers.map(
            user =>
              user.uid ===
              currentUser.uid
                ? {
                    ...user,
                    ...updates
                  }
                : user
          );

        if (
          currentWorkspace ===
          "chat"
        ) {

          renderChatList();

        } else if (
          currentWorkspace ===
          "people"
        ) {

          renderUsers();

        }

        if (
          selectedUser?.uid ===
          currentUser.uid
        ) {

          selectedUser = {
            ...selectedUser,
            ...updates
          };

        }

        modal.overlay.remove();

      } catch (error) {

        console.error(
          "Profile update error:",
          error
        );

        errorElement.textContent =
          firebaseError(error);

      } finally {

        saveButton.disabled =
          false;

        saveButton.textContent =
          "Save Changes";

      }

    }
  );

}


/*
  ============================================================
  VIEW OTHER USER PROFILE
  ============================================================
*/

function openUserProfileModal(
  user
) {

  if (!user) {
    return;
  }

  const modal =
    createModal(
      user.name ||
      "User Profile"
    );

  modal.content.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:center;
        margin-bottom:20px
      "
    >

      <div
        id="teamspaceUserProfileAvatar"
        class="teamspace-profile-preview-avatar"
      ></div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Name
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          user.name ||
          "Unnamed user"
        )}
      </div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Email
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          user.email ||
          ""
        )}
      </div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Member since
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          formatDate(
            user.createdAt
          ) ||
          "Not available"
        )}
      </div>

    </div>

    <div
      id="teamspaceUserProfileStatus"
      class="teamspace-detail-row"
    >

      <div class="teamspace-detail-label">
        Status
      </div>

      <div class="teamspace-detail-value">
        Checking...
      </div>

    </div>

    <div class="teamspace-modal-actions">

      <button
        id="teamspaceProfileChat"
        class="teamspace-modal-btn teamspace-primary-btn"
        type="button"
      >
        💬 Start Chat
      </button>

    </div>

  `;

  const avatar =
    document.getElementById(
      "teamspaceUserProfileAvatar"
    );

  setAvatarElement(
    avatar,
    user,
    user.name
  );

  const statusValue =
    modal.content.querySelector(
      "#teamspaceUserProfileStatus .teamspace-detail-value"
    );

  const presenceRef =
    db.ref(
      "presence/" +
      user.uid
    );

  const presenceCallback =
    snapshot => {

      const presence =
        snapshot.val();

      if (
        presence?.state ===
        "online"
      ) {

        statusValue.textContent =
          "● Online";

      } else {

        statusValue.textContent =
          formatLastSeen(
            presence?.lastChanged
          );

      }

    };

  presenceRef.on(
    "value",
    presenceCallback
  );

  const cleanupPresence =
    () => {

      presenceRef.off(
        "value",
        presenceCallback
      );

    };

  const closeButton =
    modal.modal.querySelector(
      ".teamspace-modal-close"
    );

  closeButton.onclick =
    () => {

      cleanupPresence();
      modal.overlay.remove();

    };

  modal.overlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        modal.overlay
      ) {

        cleanupPresence();
        modal.overlay.remove();

      }

    }
  );

  document
    .getElementById(
      "teamspaceProfileChat"
    )
    .addEventListener(
      "click",
      () => {

        cleanupPresence();

        modal.overlay.remove();

        selectUser(
          user
        );

      }
    );

}


/*
  ============================================================
  GROUP DETAILS
  ============================================================
*/

async function openGroupDetails(
  group
) {

  if (
    !group ||
    !currentUser
  ) {

    return;

  }

  /*
    Safety:
    Group details should only be opened for
    the group currently selected in the chat.
  */

  if (
    !selectedGroup ||
    selectedGroup.id !== group.id
  ) {

    return;

  }

  const modal =
    createModal(
      group.name ||
      "Group Details"
    );

  modal.content.innerHTML = `

    <div
      style="
        display:flex;
        justify-content:center;
        margin-bottom:18px
      "
    >

      <div
        class="teamspace-profile-preview-avatar"
      >
        ${escapeHtml(
          initials(group.name) ||
          "G"
        )}
      </div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Group name
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          group.name ||
          "Unnamed group"
        )}
      </div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Members
      </div>

      <div class="teamspace-detail-value">
        ${group.memberCount || 0}
      </div>

    </div>

    <div class="teamspace-detail-row">

      <div class="teamspace-detail-label">
        Created
      </div>

      <div class="teamspace-detail-value">
        ${escapeHtml(
          formatDate(
            group.createdAt
          ) ||
          "Not available"
        )}
      </div>

    </div>

    <h3 style="margin-top:22px">
      Group Members
    </h3>

    <div id="teamspaceGroupMembers">
      Loading members...
    </div>

    <div
      id="teamspaceGroupDetailsError"
      style="
        color:#dc2626;
        margin-top:10px
      "
    ></div>

    <div class="teamspace-modal-actions">

      <button
        id="teamspaceCloseGroupDetails"
        class="teamspace-modal-btn teamspace-secondary-btn"
        type="button"
      >
        Close
      </button>

      <button
        id="teamspaceOpenGroupChat"
        class="teamspace-modal-btn teamspace-primary-btn"
        type="button"
      >
        💬 Back to Group Chat
      </button>

    </div>

  `;

  const membersBox =
    document.getElementById(
      "teamspaceGroupMembers"
    );

  const errorBox =
    document.getElementById(
      "teamspaceGroupDetailsError"
    );

  try {

    const members =
      Object.keys(
        group.members || {}
      );

    if (!members.length) {

      membersBox.textContent =
        "No members found.";

    } else {

      const memberSnapshots =
        await Promise.all(
          members.map(
            uid =>
              db.ref(
                "users/" +
                uid
              ).once("value")
          )
        );

      membersBox.innerHTML =
        "";

      memberSnapshots.forEach(
        snapshot => {

          const profile =
            snapshot.val();

          if (!profile) {
            return;
          }

          const member =
            document.createElement(
              "div"
            );

          member.className =
            "teamspace-member";

          const avatar =
            document.createElement(
              "div"
            );

          avatar.className =
            "teamspace-small-avatar";

          setAvatarElement(
            avatar,
            profile,
            profile.name
          );

          const info =
            document.createElement(
              "div"
            );

          info.className =
            "teamspace-member-info";

          const name =
            document.createElement(
              "strong"
            );

          name.textContent =
            profile.name ||
            "Unnamed user";

          const email =
            document.createElement(
              "span"
            );

          email.textContent =
            profile.email ||
            "";

          info.appendChild(
            name
          );

          info.appendChild(
            email
          );

          if (
            profile.uid ===
            group.createdBy
          ) {

            const creator =
              document.createElement(
                "small"
              );

            creator.textContent =
              "Group creator";

            creator.style.display =
              "block";

            creator.style.opacity =
              ".65";

            info.appendChild(
              creator
            );

          }

          member.appendChild(
            avatar
          );

          member.appendChild(
            info
          );

          member.style.cursor =
            "pointer";

          member.addEventListener(
            "click",
            () => {

              if (
                profile.uid ===
                currentUser.uid
              ) {

                openOwnProfileModal();

              } else {

                openUserProfileModal(
                  profile
                );

              }

            }
          );

          membersBox.appendChild(
            member
          );

        }
      );

    }

  } catch (error) {

    console.error(
      "Group details error:",
      error
    );

    errorBox.textContent =
      firebaseError(error);

  }

  document
    .getElementById(
      "teamspaceCloseGroupDetails"
    )
    .addEventListener(
      "click",
      () => modal.overlay.remove()
    );

  document
    .getElementById(
      "teamspaceOpenGroupChat"
    )
    .addEventListener(
      "click",
      () => {

        modal.overlay.remove();

        /*
          The group conversation is already open.
          No details are opened here.
        */

        selectGroup(
          group
        );

      }
    );

}


/*
  ============================================================
  MAKE OWN PROFILE CLICKABLE
  ============================================================
*/

attachOwnProfileClick();


/*
  ============================================================
  AUTHENTICATION TABS
  ============================================================
*/

document
  .querySelectorAll(".tab")
  .forEach(
    tab => {

      tab.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(".tab")
            .forEach(
              item =>
                item.classList.remove(
                  "active"
                )
            );

          tab.classList.add(
            "active"
          );

          authMode =
            tab.dataset.mode;

          if (nameGroup) {

            nameGroup.classList.toggle(
              "hidden",
              authMode !== "register"
            );

          }

          if (authButton) {

            authButton.textContent =
              authMode === "register"
                ? "Create account"
                : "Sign in";

          }

          if (passwordInput) {

            passwordInput.autocomplete =
              authMode === "register"
                ? "new-password"
                : "current-password";

          }

          setError("");

        }
      );

    }
  );


/*
  ============================================================
  REGISTER / LOGIN
  ============================================================
*/

if (authForm) {

  authForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      setError("");

      const email =
        emailInput?.value.trim() ||
        "";

      const password =
        passwordInput?.value ||
        "";

      const name =
        nameInput?.value.trim() ||
        "";

      if (!email || !password) {

        setError(
          "Please enter your email and password."
        );

        return;

      }

      if (
        authMode === "register" &&
        !name
      ) {

        setError(
          "Please enter your full name."
        );

        return;

      }

      if (
        authMode === "register" &&
        name.length > 80
      ) {

        setError(
          "Your name must be 80 characters or less."
        );

        return;

      }

      if (authButton) {

        authButton.disabled =
          true;

        authButton.textContent =
          authMode === "register"
            ? "Creating account..."
            : "Signing in...";

      }

      try {

        if (
          authMode === "register"
        ) {

          const credential =
            await auth.createUserWithEmailAndPassword(
              email,
              password
            );

          await credential.user.updateProfile({
            displayName: name
          });

          await db.ref(
            "users/" +
            credential.user.uid
          ).set({

            uid:
              credential.user.uid,

            name,

            email:
              credential.user.email,

            createdAt:
              firebase.database
                .ServerValue.TIMESTAMP

          });

        } else {

          await auth.signInWithEmailAndPassword(
            email,
            password
          );

        }

      } catch (error) {

        console.error(
          "Authentication error:",
          error
        );

        setError(
          firebaseError(error)
        );

      } finally {

        if (authButton) {

          authButton.disabled =
            false;

          authButton.textContent =
            authMode === "register"
              ? "Create account"
              : "Sign in";

        }

      }

    }
  );

}


/*
  ============================================================
  PRESENCE
  ============================================================
*/

function startPresence() {

  if (!currentUser) {
    return;
  }

  stopPresenceListener();

  const uid =
    currentUser.uid;

  presenceConnectionRef =
    db.ref(".info/connected");

  presenceConnectionCallback =
    snapshot => {

      if (snapshot.val() !== true) {
        return;
      }

      const presenceRef =
        db.ref(
          "presence/" +
          uid
        );

      const onlineData = {

        state:
          "online",

        lastChanged:
          firebase.database
            .ServerValue.TIMESTAMP

      };

      const offlineData = {

        state:
          "offline",

        lastChanged:
          firebase.database
            .ServerValue.TIMESTAMP

      };

      presenceRef
        .onDisconnect()
        .set(
          offlineData
        )
        .then(
          () =>
            presenceRef.set(
              onlineData
            )
        )
        .catch(
          error =>
            console.error(
              "Presence error:",
              error
            )
        );

    };

  presenceConnectionRef.on(
    "value",
    presenceConnectionCallback
  );

}


async function markCurrentUserOffline() {

  if (!currentUser) {
    return;
  }

  try {

    await db.ref(
      "presence/" +
      currentUser.uid
    ).set({

      state:
        "offline",

      lastChanged:
        firebase.database
          .ServerValue.TIMESTAMP

    });

  } catch (error) {

    console.error(
      "Unable to update offline status:",
      error
    );

  }

}


function stopPresenceListener() {

  if (
    presenceConnectionRef &&
    presenceConnectionCallback
  ) {

    presenceConnectionRef.off(
      "value",
      presenceConnectionCallback
    );

  }

  presenceConnectionRef = null;
  presenceConnectionCallback = null;

}


function listenToUserPresence(user) {

  if (!user) {
    return;
  }

  clearSelectedPresenceListener();

  const presenceRef =
    db.ref(
      "presence/" +
      user.uid
    );

  const callback =
    snapshot => {

      if (
        !selectedUser ||
        selectedUser.uid !==
        user.uid
      ) {

        return;

      }

      const presence =
        snapshot.val();

      if (
        presence?.state ===
        "online"
      ) {

        if (chatStatus) {

          chatStatus.textContent =
            "● Online";

          chatStatus.classList.add(
            "online"
          );

          chatStatus.classList.remove(
            "offline"
          );

        }

      } else {

        if (chatStatus) {

          chatStatus.textContent =
            formatLastSeen(
              presence?.lastChanged
            );

          chatStatus.classList.remove(
            "online"
          );

          chatStatus.classList.add(
            "offline"
          );

        }

      }

    };

  selectedPresenceRef =
    presenceRef;

  selectedPresenceCallback =
    callback;

  presenceRef.on(
    "value",
    callback
  );

}


/*
  ============================================================
  CREATE GROUP BUTTON
  ============================================================
*/

function createGroupInterface() {

  if (
    document.getElementById(
      "teamspaceGroupButton"
    )
  ) {

    return;

  }

  if (!userList) {
    return;
  }

  const sidebar =
    userList.parentElement;

  if (!sidebar) {
    return;
  }

  const groupButton =
    document.createElement(
      "button"
    );

  groupButton.id =
    "teamspaceGroupButton";

  groupButton.type =
    "button";

  groupButton.className =
    "teamspace-group-button";

  groupButton.textContent =
    "+ Create Group";

  Object.assign(
    groupButton.style,
    {

      width: "100%",
      marginBottom: "10px",
      padding: "10px 14px",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      fontWeight: "600",
      background: "#1f5eff",
      color: "#fff",
      display: "none",
      boxSizing: "border-box"

    }
  );

  groupButton.addEventListener(
    "click",
    openCreateGroupModal
  );

  sidebar.insertBefore(
    groupButton,
    userList
  );

}


/*
  ============================================================
  WORKSPACE NAVIGATION
  ============================================================
*/

function setWorkspace(workspace) {

  const validWorkspaces = [
    "chat",
    "people",
    "groups"
  ];

  if (
    !validWorkspaces.includes(
      workspace
    )
  ) {

    workspace =
      "chat";

  }

  currentWorkspace =
    workspace;

  if (chatNav) {

    chatNav.classList.toggle(
      "active",
      workspace === "chat"
    );

  }

  if (peopleNav) {

    peopleNav.classList.toggle(
      "active",
      workspace === "people"
    );

  }

  if (groupsNav) {

    groupsNav.classList.toggle(
      "active",
      workspace === "groups"
    );

  }

  if (listTitle) {

    listTitle.textContent = {

      chat: "Chats",
      people: "People",
      groups: "Groups"

    }[workspace];

  }

  const groupButton =
    document.getElementById(
      "teamspaceGroupButton"
    );

  if (groupButton) {

    groupButton.style.display =
      workspace === "groups"
        ? "block"
        : "none";

  }

  if (workspace === "chat") {

    renderChatList();

  } else if (
    workspace === "people"
  ) {

    renderUsers();

  } else {

    renderGroups();

  }

}


if (chatNav) {

  chatNav.addEventListener(
    "click",
    () => setWorkspace("chat")
  );

}

if (peopleNav) {

  peopleNav.addEventListener(
    "click",
    () => setWorkspace("people")
  );

}

if (groupsNav) {

  groupsNav.addEventListener(
    "click",
    () => setWorkspace("groups")
  );

}


/*
  ============================================================
  CREATE GROUP MODAL
  ============================================================
*/

function openCreateGroupModal() {

  document
    .getElementById(
      "teamspaceGroupModal"
    )
    ?.remove();

  const overlay =
    document.createElement(
      "div"
    );

  overlay.id =
    "teamspaceGroupModal";

  overlay.className =
    "teamspace-modal-overlay";

  const modal =
    document.createElement(
      "div"
    );

  modal.className =
    "teamspace-modal";

  modal.innerHTML = `

    <h2 style="margin-top:0">
      Create Group
    </h2>

    <label
      for="teamspaceGroupName"
      style="
        display:block;
        margin-bottom:6px;
        font-weight:600
      "
    >
      Group name
    </label>

    <input
      id="teamspaceGroupName"
      class="teamspace-form-input"
      type="text"
      maxlength="80"
      placeholder="Group Name"
      style="margin-bottom:18px"
    >

    <label
      style="
        display:block;
        margin-bottom:8px;
        font-weight:600
      "
    >
      Select members
    </label>

    <div
      id="teamspaceMemberSelection"
      style="
        max-height:250px;
        overflow-y:auto;
        border:1px solid #ddd;
        border-radius:8px;
        padding:8px
      "
    ></div>

    <div
      id="teamspaceGroupError"
      style="
        color:#c62828;
        margin-top:12px;
        min-height:20px
      "
    ></div>

    <div class="teamspace-modal-actions">

      <button
        id="teamspaceCancelGroup"
        class="teamspace-modal-btn teamspace-secondary-btn"
        type="button"
      >
        Cancel
      </button>

      <button
        id="teamspaceCreateGroup"
        class="teamspace-modal-btn teamspace-primary-btn"
        type="button"
      >
        Create Group
      </button>

    </div>

  `;

  overlay.appendChild(
    modal
  );

  document.body.appendChild(
    overlay
  );

  const memberSelection =
    document.getElementById(
      "teamspaceMemberSelection"
    );

  if (!availableUsers.length) {

    memberSelection.textContent =
      "No other registered users are available.";

  } else {

    availableUsers.forEach(
      user => {

        const label =
          document.createElement(
            "label"
          );

        Object.assign(
          label.style,
          {

            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px",
            cursor: "pointer",
            borderRadius: "6px"

          }
        );

        const checkbox =
          document.createElement(
            "input"
          );

        checkbox.type =
          "checkbox";

        checkbox.value =
          user.uid;

        const info =
          document.createElement(
            "span"
          );

        const strong =
          document.createElement(
            "strong"
          );

        strong.textContent =
          user.name ||
          "Unnamed user";

        const email =
          document.createElement(
            "small"
          );

        email.textContent =
          user.email ||
          "";

        info.appendChild(
          strong
        );

        info.appendChild(
          document.createElement(
            "br"
          )
        );

        info.appendChild(
          email
        );

        label.appendChild(
          checkbox
        );

        label.appendChild(
          info
        );

        memberSelection.appendChild(
          label
        );

      }
    );

  }

  document
    .getElementById(
      "teamspaceCancelGroup"
    )
    .addEventListener(
      "click",
      () => overlay.remove()
    );

  document
    .getElementById(
      "teamspaceCreateGroup"
    )
    .addEventListener(
      "click",
      createGroup
    );

  overlay.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        overlay
      ) {

        overlay.remove();

      }

    }
  );

}


async function createGroup() {

  const nameElement =
    document.getElementById(
      "teamspaceGroupName"
    );

  const errorElement =
    document.getElementById(
      "teamspaceGroupError"
    );

  const button =
    document.getElementById(
      "teamspaceCreateGroup"
    );

  if (
    !nameElement ||
    !errorElement ||
    !button ||
    !currentUser
  ) {

    return;

  }

  const name =
    nameElement.value.trim();

  const checked =
    document.querySelectorAll(
      "#teamspaceMemberSelection input[type='checkbox']:checked"
    );

  const memberIds = [
    currentUser.uid,
    ...Array.from(
      checked
    ).map(
      input => input.value
    )
  ];

  errorElement.textContent =
    "";

  if (!name) {

    errorElement.textContent =
      "Please enter a group name.";

    return;

  }

  if (name.length > 80) {

    errorElement.textContent =
      "Group name must be 80 characters or less.";

    return;

  }

  if (memberIds.length < 2) {

    errorElement.textContent =
      "Select at least one other member.";

    return;

  }

  button.disabled =
    true;

  button.textContent =
    "Creating...";

  try {

    const groupRef =
      db.ref("groups").push();

    const groupId =
      groupRef.key;

    const members = {};

    memberIds.forEach(
      uid => {
        members[uid] = true;
      }
    );

    const group = {

      id:
        groupId,

      name,

      createdBy:
        currentUser.uid,

      createdAt:
        firebase.database
          .ServerValue.TIMESTAMP,

      members

    };

    await groupRef.set(
      group
    );

    overlayRemoveIfExists(
      "teamspaceGroupModal"
    );

    /*
      Switch to Groups first.
    */

    setWorkspace(
      "groups"
    );

    /*
      Open the group conversation.
      DO NOT open group details here.
    */

    selectGroup({

      ...group,

      createdAt:
        Date.now(),

      memberCount:
        memberIds.length

    });

  } catch (error) {

    console.error(
      "Create group error:",
      error
    );

    errorElement.textContent =
      firebaseError(error);

  } finally {

    button.disabled =
      false;

    button.textContent =
      "Create Group";

  }

}


function overlayRemoveIfExists(
  id
) {

  document
    .getElementById(id)
    ?.remove();

}


/*
  ============================================================
  LISTEN TO USERS
  ============================================================
*/

function listenToUsers() {

  if (!currentUser) {
    return;
  }

  const ref =
    db.ref("users");

  const callback =
    snapshot => {

      const users = [];

      snapshot.forEach(
        child => {

          const user =
            child.val();

          if (
            user &&
            child.key !==
            currentUser.uid
          ) {

            users.push({

              ...user,

              uid:
                child.key

            });

          }

        }
      );

      availableUsers =
        users.sort(
          (a, b) =>
            String(
              a.name || ""
            ).localeCompare(
              String(
                b.name || ""
              )
            )
        );

      loadChattedUsers();

      if (
        currentWorkspace ===
        "people"
      ) {

        renderUsers();

      }

    };

  usersListener = {
    ref,
    callback
  };

  ref.on(
    "value",
    callback,
    error => {

      console.error(
        "Users listener error:",
        error
      );

      if (userList) {

        userList.textContent =
          firebaseError(error);

      }

    }
  );

}


async function loadChattedUsers() {

  if (
    !currentUser ||
    !availableUsers.length
  ) {

    chattedUsers = [];

    if (
      currentWorkspace ===
      "chat"
    ) {

      renderChatList();

    }

    return;

  }

  try {

    const snapshot =
      await db.ref(
        "privateChats"
      ).once(
        "value"
      );

    const ids =
      new Set();

    /*
      Do not try to split chat IDs.
      Instead compare each known user against
      the generated private chat ID.
    */

    availableUsers.forEach(
      user => {

        const chatId =
          makeChatId(
            currentUser.uid,
            user.uid
          );

        const chatSnapshot =
          snapshot.child(
            chatId
          );

        if (
          chatSnapshot
            .child("messages")
            .exists()
        ) {

          ids.add(
            user.uid
          );

        }

      }
    );

    chattedUsers =
      availableUsers
        .filter(
          user =>
            ids.has(
              user.uid
            )
        )
        .sort(
          (a, b) =>
            String(
              a.name || ""
            ).localeCompare(
              String(
                b.name || ""
              )
            )
        );

    if (
      currentWorkspace ===
      "chat"
    ) {

      renderChatList();

    }

  } catch (error) {

    console.error(
      "Unable to load chats:",
      error
    );

    if (
      currentWorkspace ===
      "chat"
    ) {

      renderChatList();

    }

  }

}


/*
  ============================================================
  USER LIST ITEM
  ============================================================
*/

function createUserListItem(
  user
) {

  if (!userList) {
    return;
  }

  const item =
    document.createElement(
      "div"
    );

  item.className =
    "user-item";

  item.dataset.id =
    user.uid;

  if (
    selectedUser?.uid ===
    user.uid
  ) {

    item.classList.add(
      "selected"
    );

  }

  const avatar =
    document.createElement(
      "div"
    );

  avatar.className =
    "user-avatar";

  avatar.classList.add(
    "profile-clickable"
  );

  setAvatarElement(
    avatar,
    user,
    user.name
  );

  avatar.title =
    "View profile";

  const info =
    document.createElement(
      "div"
    );

  info.className =
    "user-info";

  const name =
    document.createElement(
      "strong"
    );

  name.textContent =
    user.name ||
    "Unnamed user";

  name.classList.add(
    "profile-clickable"
  );

  name.title =
    "View profile";

  const email =
    document.createElement(
      "span"
    );

  email.textContent =
    user.email ||
    "";

  info.appendChild(
    name
  );

  info.appendChild(
    email
  );

  item.appendChild(
    avatar
  );

  item.appendChild(
    info
  );

  /*
    Clicking the main row opens
    the conversation.
  */

  item.addEventListener(
    "click",
    () => {

      selectUser(
        user
      );

    }
  );

  /*
    Clicking avatar/name opens
    profile instead.
  */

  avatar.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      openUserProfileModal(
        user
      );

    }
  );

  name.addEventListener(
    "click",
    event => {

      event.stopPropagation();

      openUserProfileModal(
        user
      );

    }
  );

  userList.appendChild(
    item
  );

}


/*
  ============================================================
  RENDER CHAT LIST
  ============================================================
*/

function renderChatList() {

  if (!userList) {
    return;
  }

  userList.innerHTML =
    "";

  if (!chattedUsers.length) {

    userList.innerHTML = `

      <div class="no-users">

        No conversations yet.

        <br><br>

        Go to <strong>People</strong>
        and select someone to start chatting.

      </div>

    `;

    return;

  }

  chattedUsers.forEach(
    user => {

      createUserListItem(
        user
      );

    }
  );

}


function renderUsers() {

  if (!userList) {
    return;
  }

  userList.innerHTML =
    "";

  if (!availableUsers.length) {

    userList.innerHTML = `

      <div class="no-users">

        No other accounts yet.

      </div>

    `;

    return;

  }

  availableUsers.forEach(
    user => {

      createUserListItem(
        user
      );

    }
  );

}


/*
  ============================================================
  GROUPS
  ============================================================
*/

function listenToGroups() {

  if (!currentUser) {
    return;
  }

  const ref =
    db.ref("groups");

  const callback =
    snapshot => {

      const groups = [];

      snapshot.forEach(
        child => {

          const group =
            child.val();

          if (
            group?.members?.[
              currentUser.uid
            ]
          ) {

            const memberCount =
              Object.keys(
                group.members ||
                {}
              ).length;

            groups.push({

              ...group,

              id:
                child.key,

              memberCount

            });

          }

        }
      );

      groups.sort(
        (a, b) =>
          (b.createdAt || 0) -
          (a.createdAt || 0)
      );

      groupCache =
        Object.fromEntries(
          groups.map(
            group => [
              group.id,
              group
            ]
          )
        );

      /*
        If the currently selected group still
        exists, refresh the selected group
        object with the newest database data.
      */

      if (selectedGroup?.id) {

        const updatedSelectedGroup =
          groupCache[
            selectedGroup.id
          ];

        if (updatedSelectedGroup) {

          selectedGroup =
            updatedSelectedGroup;

          /*
            If the group conversation is currently
            open, update the header information.
          */

          if (
            chatUserName &&
            selectedUser === null
          ) {

            chatUserName.textContent =
              updatedSelectedGroup.name ||
              "Group";

          }

          if (
            chatStatus &&
            selectedUser === null
          ) {

            const count =
              updatedSelectedGroup.memberCount ||
              0;

            chatStatus.textContent =
              count +
              " member" +
              (
                count === 1
                  ? ""
                  : "s"
              );

          }

        }

      }

      if (
        currentWorkspace ===
        "groups"
      ) {

        renderGroups();

      }

    };

  groupsListener = {
    ref,
    callback
  };

  ref.on(
    "value",
    callback,
    error => {

      console.error(
        "Groups listener error:",
        error
      );

      if (
        currentWorkspace ===
        "groups" &&
        userList
      ) {

        userList.textContent =
          firebaseError(error);

      }

    }
  );

}


function renderGroups() {

  if (!userList) {
    return;
  }

  userList.innerHTML =
    "";

  const groups =
    Object.values(
      groupCache
    );

  if (!groups.length) {

    const empty =
      document.createElement(
        "div"
      );

    empty.className =
      "no-users";

    empty.innerHTML = `
      No groups yet.
      <br><br>
      Use <strong>+ Create Group</strong>
      to create your first group.
    `;

    userList.appendChild(
      empty
    );

    return;

  }

  groups.forEach(
    group => {

      const item =
        document.createElement(
          "div"
        );

      item.className =
        "user-item teamspace-group-item";

      item.dataset.groupId =
        group.id;

      if (
        selectedGroup?.id ===
        group.id
      ) {

        item.classList.add(
          "selected"
        );

      }

      const avatar =
        document.createElement(
          "div"
        );

      avatar.className =
        "user-avatar";

      avatar.textContent =
        initials(
          group.name
        ) ||
        "G";

      const info =
        document.createElement(
          "div"
        );

      info.className =
        "user-info";

      const name =
        document.createElement(
          "strong"
        );

      name.textContent =
        group.name ||
        "Unnamed group";

      const count =
        document.createElement(
          "span"
        );

      count.textContent =
        group.memberCount +
        " member" +
        (
          group.memberCount === 1
            ? ""
            : "s"
        );

      info.appendChild(
        name
      );

      info.appendChild(
        count
      );

      item.appendChild(
        avatar
      );

      item.appendChild(
        info
      );

      /*
        IMPORTANT:
        Clicking the group in the Groups list
        opens the group conversation ONLY.

        It does NOT open Group Details.
      */

      item.addEventListener(
        "click",
        () => {

          selectGroup(
            group
          );

        }
      );

      userList.appendChild(
        item
      );

    }
  );

}


/*
  ============================================================
  SELECT PRIVATE CHAT
  ============================================================
*/

function selectUser(
  user
) {

  if (
    !user ||
    !currentUser
  ) {

    return;

  }

  selectedUser =
    user;

  selectedGroup =
    null;

  /*
    Private chat header must NOT be clickable
    for group details.
  */

  setGroupHeaderClickable(
    false
  );

  clearMessageListener();
  clearPresenceListeners();

  document
    .querySelectorAll(
      ".user-item"
    )
    .forEach(
      item => {

        item.classList.toggle(
          "selected",
          item.dataset.id ===
          user.uid
        );

      }
    );

  if (chatUserName) {

    chatUserName.textContent =
      user.name ||
      "User";

  }

  if (chatStatus) {

    chatStatus.textContent =
      "Checking status...";

    chatStatus.classList.remove(
      "online",
      "offline"
    );

  }

  if (chatUserAvatar) {

    setAvatarElement(
      chatUserAvatar,
      user,
      user.name
    );

  }

  if (messageForm) {

    messageForm.classList.remove(
      "hidden"
    );

  }

  listenToUserPresence(
    user
  );

  if (messageInput) {
    messageInput.focus();
  }

  const chatId =
    makeChatId(
      currentUser.uid,
      user.uid
    );

  listenToMessages(
    "privateChats/" +
    chatId +
    "/messages",
    false
  );

}


/*
  ============================================================
  SELECT GROUP CHAT
  ============================================================
*/

function selectGroup(
  group
) {

  if (
    !group ||
    !currentUser
  ) {

    return;

  }

  /*
    Accept either a complete group object
    or a group ID.
  */

  if (typeof group === "string") {

    group =
      groupCache[group];

  }

  if (!group) {
    return;
  }

  /*
    Make sure the latest cached version is
    used whenever possible.
  */

  if (
    group.id &&
    groupCache[group.id]
  ) {

    group = {
      ...groupCache[group.id],
      ...group
    };

  }

  selectedGroup =
    group;

  selectedUser =
    null;

  /*
    IMPORTANT:
    A group conversation can now be opened
    without opening Group Details.
  */

  setGroupHeaderClickable(
    true
  );

  clearMessageListener();
  clearPresenceListeners();

  document
    .querySelectorAll(
      ".user-item"
    )
    .forEach(
      item => {

        item.classList.toggle(
          "selected",
          item.dataset.groupId ===
          group.id
        );

      }
    );

  if (chatUserName) {

    chatUserName.textContent =
      group.name ||
      "Group";

  }

  if (chatStatus) {

    const count =
      group.memberCount ||
      Object.keys(
        group.members ||
        {}
      ).length ||
      0;

    chatStatus.textContent =
      count +
      " member" +
      (
        count === 1
          ? ""
          : "s"
      );

    chatStatus.classList.remove(
      "online",
      "offline"
    );

  }

  if (chatUserAvatar) {

    chatUserAvatar.innerHTML =
      "";

    chatUserAvatar.textContent =
      initials(
        group.name
      ) ||
      "G";

  }

  if (messageForm) {

    messageForm.classList.remove(
      "hidden"
    );

  }

  if (messageInput) {
    messageInput.focus();
  }

  /*
    Listen to the group messages.
  */

  listenToMessages(
    "groups/" +
    group.id +
    "/messages",
    true
  );

}


/*
  ============================================================
  REAL-TIME MESSAGE LISTENER
  ============================================================
*/

function listenToMessages(
  path,
  isGroup
) {

  clearMessageListener();

  activeMessagePath =
    path;

  const ref =
    db.ref(path)
      .limitToLast(200);

  messageListener =
    snapshot => {

      const messages = [];

      snapshot.forEach(
        child => {

          const message =
            child.val();

          if (message) {

            messages.push({

              ...message,

              id:
                child.key

            });

          }

        }
      );

      messages.sort(
        (a, b) =>
          (a.createdAt || 0) -
          (b.createdAt || 0)
      );

      if (
        !isGroup &&
        messages.length &&
        selectedUser
      ) {

        ensureUserInChatList(
          selectedUser
        );

      }

      renderMessages(
        messages,
        isGroup
      );

    };

  ref.on(
    "value",
    messageListener,
    error => {

      console.error(
        "Message listener error:",
        error
      );

      renderEmptyChat(
        "Unable to load messages",
        firebaseError(error)
      );

    }
  );

}


function ensureUserInChatList(
  user
) {

  if (!user) {
    return;
  }

  const exists =
    chattedUsers.some(
      item =>
        item.uid ===
        user.uid
    );

  if (!exists) {

    chattedUsers.push(
      user
    );

    chattedUsers.sort(
      (a, b) =>
        String(
          a.name || ""
        ).localeCompare(
          String(
            b.name || ""
          )
        )
    );

  }

  if (
    currentWorkspace ===
    "chat"
  ) {

    renderChatList();

  }

}


/*
  ============================================================
  RENDER MESSAGES
  ============================================================
*/

function renderMessages(
  messages,
  isGroup
) {

  if (!messagesBox) {
    return;
  }

  const distanceFromBottom =
    messagesBox.scrollHeight -
    messagesBox.scrollTop -
    messagesBox.clientHeight;

  const shouldScroll =
    !messagesBox.children.length ||
    distanceFromBottom < 180;

  messagesBox.innerHTML =
    "";

  if (!messages.length) {

    if (isGroup) {

      renderEmptyChat(
        "Start the group conversation",
        "Send the first message to " +
        (
          selectedGroup?.name ||
          "the group"
        ) +
        "."
      );

    } else {

      renderEmptyChat(
        "Start a conversation",
        "Send " +
        (
          selectedUser?.name ||
          "this person"
        ) +
        " your first message."
      );

    }

    return;

  }

  messages.forEach(
    message => {

      const mine =
        message.senderId ===
        currentUser?.uid;

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "message-row" +
        (
          mine
            ? " mine"
            : ""
        );

      const bubble =
        document.createElement(
          "div"
        );

      bubble.className =
        "message";

      if (
        isGroup &&
        !mine
      ) {

        const sender =
          document.createElement(
            "div"
          );

        sender.style.cssText =
          "font-weight:700;font-size:12px;margin-bottom:4px";

        sender.textContent =
          message.senderName ||
          "User";

        bubble.appendChild(
          sender
        );

      }

      if (
        message.type === "image" &&
        message.imageUrl
      ) {

        const image =
          document.createElement(
            "img"
          );

        image.className =
          "chat-image";

        image.src =
          message.imageUrl;

        image.alt =
          message.imageName ||
          "Shared photo";

        image.loading =
          "lazy";

        image.addEventListener(
          "click",
          () =>
            openImageViewer(
              message.imageUrl,
              message.imageName ||
              "TeamSpace Photo"
            )
        );

        bubble.appendChild(
          image
        );

        if (message.body) {

          const caption =
            document.createElement(
              "div"
            );

          caption.className =
            "message-body";

          caption.textContent =
            message.body;

          bubble.appendChild(
            caption
          );

        }

      } else {

        const body =
          document.createElement(
            "div"
          );

        body.className =
          "message-body";

        body.textContent =
          message.body ||
          "";

        bubble.appendChild(
          body
        );

      }

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

      bubble.appendChild(
        time
      );

      row.appendChild(
        bubble
      );

      messagesBox.appendChild(
        row
      );

    }
  );

  requestAnimationFrame(
    () => {

      if (shouldScroll) {

        messagesBox.scrollTop =
          messagesBox.scrollHeight;

      }

    }
  );

}


/*
  ============================================================
  IMAGE VIEWER
  ============================================================
*/

function openImageViewer(
  imageUrl,
  imageName
) {

  const newWindow =
    window.open(
      "",
      "_blank"
    );

  if (!newWindow) {
    return;
  }

  const safeUrl =
    String(
      imageUrl || ""
    ).replaceAll(
      '"',
      "&quot;"
    );

  const safeName =
    escapeHtml(
      imageName ||
      "TeamSpace Photo"
    );

  newWindow.document.write(
    `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${safeName}</title>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1"
      >
      <style>
        html,
        body {
          margin:0;
          width:100%;
          min-height:100%;
          background:#111;
        }

        body {
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
        }

        img {
          max-width:96vw;
          max-height:96vh;
          width:auto;
          height:auto;
          object-fit:contain;
        }
      </style>
    </head>

    <body>

      <img
        src="${safeUrl}"
        alt="${safeName}"
      >

    </body>
    </html>
    `
  );

  newWindow.document.close();

}


/*
  ============================================================
  SEND TEXT MESSAGE
  ============================================================
*/

if (messageForm) {

  messageForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const body =
        messageInput?.value.trim() ||
        "";

      if (
        !body ||
        !currentUser
      ) {
        return;
      }

      if (
        !selectedUser &&
        !selectedGroup
      ) {
        return;
      }

      if (body.length > 5000) {

        alert(
          "Messages must be 5000 characters or less."
        );

        return;

      }

      const originalBody =
        body;

      messageInput.value =
        "";

      const message = {

        senderId:
          currentUser.uid,

        senderName:
          currentProfile?.name ||
          currentUser.email,

        type:
          "text",

        body,

        createdAt:
          firebase.database
            .ServerValue.TIMESTAMP

      };

      try {

        let messageRef;

        if (selectedGroup) {

          messageRef =
            db.ref(
              "groups/" +
              selectedGroup.id +
              "/messages"
            ).push();

        } else {

          const chatId =
            makeChatId(
              currentUser.uid,
              selectedUser.uid
            );

          messageRef =
            db.ref(
              "privateChats/" +
              chatId +
              "/messages"
            ).push();

        }

        await messageRef.set(
          message
        );

        if (selectedUser) {

          ensureUserInChatList(
            selectedUser
          );

        }

      } catch (error) {

        console.error(
          "Send message error:",
          error
        );

        if (messageInput) {
          messageInput.value =
            originalBody;
        }

        alert(
          firebaseError(error)
        );

      }

    }
  );

}


if (messageInput) {

  messageInput.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        if (
          messageForm &&
          typeof messageForm.requestSubmit ===
          "function"
        ) {

          messageForm.requestSubmit();

        }

      }

    }
  );

}


/*
  ============================================================
  PHOTO COMPRESSION
  ============================================================
*/

function compressImage(
  file
) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload =
        event => {

          const image =
            new Image();

          image.onload =
            () => {

              const maxWidth =
                900;

              const maxHeight =
                900;

              let width =
                image.width;

              let height =
                image.height;

              if (
                width > maxWidth ||
                height > maxHeight
              ) {

                const ratio =
                  Math.min(
                    maxWidth / width,
                    maxHeight / height
                  );

                width =
                  Math.round(
                    width * ratio
                  );

                height =
                  Math.round(
                    height * ratio
                  );

              }

              const canvas =
                document.createElement(
                  "canvas"
                );

              canvas.width =
                width;

              canvas.height =
                height;

              const context =
                canvas.getContext(
                  "2d"
                );

              if (!context) {

                reject(
                  new Error(
                    "Your browser does not support image compression."
                  )
                );

                return;

              }

              context.fillStyle =
                "#ffffff";

              context.fillRect(
                0,
                0,
                width,
                height
              );

              context.drawImage(
                image,
                0,
                0,
                width,
                height
              );

              let quality =
                0.78;

              let dataUrl =
                canvas.toDataURL(
                  "image/jpeg",
                  quality
                );

              const maxBytes =
                450 * 1024;

              while (
                dataUrl.length >
                  maxBytes &&
                quality > 0.35
              ) {

                quality -=
                  0.07;

                dataUrl =
                  canvas.toDataURL(
                    "image/jpeg",
                    quality
                  );

              }

              resolve({

                dataUrl,

                width:
                  canvas.width,

                height:
                  canvas.height,

                size:
                  dataUrl.length

              });

            };

          image.onerror =
            () => {

              reject(
                new Error(
                  "The selected image could not be opened."
                )
              );

            };

          image.src =
            event.target.result;

        };

      reader.onerror =
        () => {

          reject(
            new Error(
              "Unable to read the selected photo."
            )
          );

        };

      reader.readAsDataURL(
        file
      );

    }
  );

}


/*
  ============================================================
  SEND PHOTO
  ============================================================
*/

async function sendPhoto(
  file
) {

  if (
    !file ||
    !currentUser
  ) {
    return;
  }

  if (
    !selectedUser &&
    !selectedGroup
  ) {

    alert(
      "Select a conversation first."
    );

    return;

  }

  if (
    !file.type.startsWith("image/")
  ) {

    alert(
      "Please select an image file."
    );

    return;

  }

  if (
    file.size >
    10 * 1024 * 1024
  ) {

    alert(
      "Photo must be 10 MB or smaller."
    );

    return;

  }

  if (imageButton) {
    imageButton.disabled =
      true;
  }

  if (uploadStatus) {

    uploadStatus.style.display =
      "block";

    uploadStatus.textContent =
      "Compressing photo...";

  }

  try {

    const compressed =
      await compressImage(
        file
      );

    const estimatedBytes =
      Math.round(
        compressed.dataUrl.length *
        0.75
      );

    if (
      estimatedBytes >
      500 * 1024
    ) {

      throw new Error(
        "The photo is still too large after compression. Please choose another photo."
      );

    }

    if (uploadStatus) {
      uploadStatus.textContent =
        "Sending photo...";
    }

    let conversationPath;

    if (selectedGroup) {

      conversationPath =
        "groups/" +
        selectedGroup.id +
        "/messages";

    } else {

      const chatId =
        makeChatId(
          currentUser.uid,
          selectedUser.uid
        );

      conversationPath =
        "privateChats/" +
        chatId +
        "/messages";

    }

    const message = {

      senderId:
        currentUser.uid,

      senderName:
        currentProfile?.name ||
        currentUser.email,

      type:
        "image",

      imageUrl:
        compressed.dataUrl,

      imageName:
        file.name,

      imageWidth:
        compressed.width,

      imageHeight:
        compressed.height,

      createdAt:
        firebase.database
          .ServerValue.TIMESTAMP

    };

    const messageRef =
      db.ref(
        conversationPath
      ).push();

    await messageRef.set(
      message
    );

    if (selectedUser) {

      ensureUserInChatList(
        selectedUser
      );

    }

    if (uploadStatus) {

      uploadStatus.textContent =
        "Photo sent ✓";

      setTimeout(
        () => {

          if (uploadStatus) {

            uploadStatus.style.display =
              "none";

          }

        },
        1200
      );

    }

  } catch (error) {

    console.error(
      "Photo sending error:",
      error
    );

    if (uploadStatus) {
      uploadStatus.style.display =
        "none";
    }

    alert(
      "Unable to send photo: " +
      firebaseError(error)
    );

  } finally {

    if (imageInput) {
      imageInput.value =
        "";
    }

    if (imageButton) {
      imageButton.disabled =
        false;
    }

  }

}


if (imageButton) {

  imageButton.addEventListener(
    "click",
    () => {

      if (
        !selectedUser &&
        !selectedGroup
      ) {

        alert(
          "Select a conversation first."
        );

        return;

      }

      imageInput?.click();

    }
  );

}


if (imageInput) {

  imageInput.addEventListener(
    "change",
    event => {

      const file =
        event.target.files?.[0];

      if (file) {
        sendPhoto(file);
      }

    }
  );

}


/*
  ============================================================
  REFRESH
  ============================================================
*/

if (refreshUsers) {

  refreshUsers.addEventListener(
    "click",
    async () => {

      if (!currentUser) {
        return;
      }

      refreshUsers.disabled =
        true;

      try {

        const usersSnapshot =
          await db.ref(
            "users"
          ).once("value");

        const users = [];

        usersSnapshot.forEach(
          child => {

            const user =
              child.val();

            if (
              user &&
              child.key !==
              currentUser.uid
            ) {

              users.push({

                ...user,

                uid:
                  child.key

              });

            }

          }
        );

        availableUsers =
          users.sort(
            (a, b) =>
              String(
                a.name || ""
              ).localeCompare(
                String(
                  b.name || ""
                )
              )
          );

        const groupsSnapshot =
          await db.ref(
            "groups"
          ).once("value");

        const groups = [];

        groupsSnapshot.forEach(
          child => {

            const group =
              child.val();

            if (
              group?.members?.[
                currentUser.uid
              ]
            ) {

              groups.push({

                ...group,

                id:
                  child.key,

                memberCount:
                  Object.keys(
                    group.members ||
                    {}
                  ).length

              });

            }

          }
        );

        groups.sort(
          (a, b) =>
            (b.createdAt || 0) -
            (a.createdAt || 0)
        );

        groupCache =
          Object.fromEntries(
            groups.map(
              group => [
                group.id,
                group
              ]
            )
          );

        await loadChattedUsers();

        if (
          currentWorkspace ===
          "people"
        ) {

          renderUsers();

        } else if (
          currentWorkspace ===
          "groups"
        ) {

          renderGroups();

        } else {

          renderChatList();

        }

      } catch (error) {

        console.error(
          "Refresh error:",
          error
        );

        if (userList) {

          userList.textContent =
            firebaseError(error);

        }

      } finally {

        refreshUsers.disabled =
          false;

      }

    }
  );

}


/*
  ============================================================
  LOG OUT
  ============================================================
*/

if (logoutBtn) {

  logoutBtn.addEventListener(
    "click",
    async () => {

      const confirmed =
        window.confirm(
          "Are you sure you want to log out of TeamSpace?"
        );

      if (!confirmed) {
        return;
      }

      logoutBtn.disabled =
        true;

      try {

        await markCurrentUserOffline();

        stopPresenceListener();

        clearAllListeners();

        await auth.signOut();

      } catch (error) {

        console.error(
          "Sign out error:",
          error
        );

        alert(
          firebaseError(error)
        );

      } finally {

        logoutBtn.disabled =
          false;

      }

    }
  );

}


/*
  ============================================================
  DELETE ACCOUNT
  ============================================================
*/

async function deleteAccount() {

  if (!currentUser) {
    return;
  }

  const firstConfirm =
    window.confirm(
      "DELETE ACCOUNT\n\n" +
      "This will permanently delete your TeamSpace account and profile.\n\n" +
      "This action cannot be undone.\n\n" +
      "Do you want to continue?"
    );

  if (!firstConfirm) {
    return;
  }

  const secondConfirm =
    window.confirm(
      "FINAL CONFIRMATION\n\n" +
      "Your TeamSpace account will be permanently deleted.\n\n" +
      "Click OK only if you are absolutely sure."
    );

  if (!secondConfirm) {
    return;
  }

  const password =
    window.prompt(
      "For security, enter your current TeamSpace password to confirm account deletion:"
    );

  if (password === null) {
    return;
  }

  if (!password) {

    alert(
      "Password is required to delete the account."
    );

    return;

  }

  if (deleteAccountBtn) {

    deleteAccountBtn.disabled =
      true;

    deleteAccountBtn.textContent =
      "⏳";

  }

  try {

    const user =
      currentUser;

    const uid =
      user.uid;

    const email =
      user.email;

    const credential =
      firebase.auth.EmailAuthProvider.credential(
        email,
        password
      );

    await user.reauthenticateWithCredential(
      credential
    );

    await db.ref(
      "presence/" +
      uid
    ).set({

      state:
        "offline",

      lastChanged:
        firebase.database
          .ServerValue.TIMESTAMP

    });

    const groupsSnapshot =
      await db.ref(
        "groups"
      ).once("value");

    const updates = {};

    groupsSnapshot.forEach(
      child => {

        const group =
          child.val();

        if (
          group?.members?.[uid]
        ) {

          updates[
            "groups/" +
            child.key +
            "/members/" +
            uid
          ] = null;

        }

      }
    );

    updates[
      "users/" +
      uid
    ] = null;

    updates[
      "presence/" +
      uid
    ] = null;

    await db.ref().update(
      updates
    );

    await user.delete();

    currentUser =
      null;

    currentProfile =
      null;

    selectedUser =
      null;

    selectedGroup =
      null;

    availableUsers =
      [];

    chattedUsers =
      [];

    groupCache =
      {};

    clearAllListeners();

    stopPresenceListener();

    setGroupHeaderClickable(
      false
    );

    showAuth();

    setError(
      "Your TeamSpace account has been permanently deleted."
    );

    if (authForm) {
      authForm.reset();
    }

    authMode =
      "login";

    if (nameGroup) {
      nameGroup.classList.add(
        "hidden"
      );
    }

    if (authButton) {
      authButton.textContent =
        "Sign in";
    }

    document
      .querySelectorAll(".tab")
      .forEach(
        tab => {

          tab.classList.toggle(
            "active",
            tab.dataset.mode ===
            "login"
          );

        }
      );

  } catch (error) {

    console.error(
      "Delete account error:",
      error
    );

    if (
      error.code ===
      "auth/requires-recent-login"
    ) {

      alert(
        "For security, Firebase requires a recent login before deleting this account.\n\nPlease log out, sign in again, and then choose Delete Account."
      );

    } else {

      alert(
        "Unable to delete your account:\n\n" +
        firebaseError(error)
      );

    }

  } finally {

    if (deleteAccountBtn) {

      deleteAccountBtn.disabled =
        false;

      deleteAccountBtn.textContent =
        "🗑";

    }

  }

}


if (deleteAccountBtn) {

  deleteAccountBtn.addEventListener(
    "click",
    deleteAccount
  );

}


/*
  ============================================================
  RESET CHAT INTERFACE
  ============================================================
*/

function resetChatInterface() {

  selectedUser =
    null;

  selectedGroup =
    null;

  clearMessageListener();
  clearSelectedPresenceListener();

  /*
    Reset group header behavior.
  */

  setGroupHeaderClickable(
    false
  );

  if (chatUserName) {

    chatUserName.textContent =
      "Select a contact";

  }

  if (chatStatus) {

    chatStatus.textContent =
      "Choose someone from your contacts to start chatting.";

    chatStatus.classList.remove(
      "online",
      "offline"
    );

  }

  if (chatUserAvatar) {

    chatUserAvatar.innerHTML =
      "";

  }

  if (messageForm) {

    messageForm.classList.add(
      "hidden"
    );

  }

  renderEmptyChat(
    "Your conversations",
    "Select a person from People to start chatting."
  );

}


/*
  ============================================================
  START APPLICATION
  ============================================================
*/

async function startApp(
  user
) {

  clearAllListeners();

  currentUser =
    user;

  try {

    const profileSnapshot =
      await db.ref(
        "users/" +
        user.uid
      ).once(
        "value"
      );

    currentProfile =
      profileSnapshot.val();

    if (!currentProfile) {

      currentProfile = {

        uid:
          user.uid,

        name:
          user.displayName ||
          user.email ||
          "User",

        email:
          user.email ||
          "",

        createdAt:
          firebase.database
            .ServerValue.TIMESTAMP

      };

      await db.ref(
        "users/" +
        user.uid
      ).set(
        currentProfile
      );

    }

    updateProfileUI();

    createGroupInterface();

    attachOwnProfileClick();

    showApplication();

    resetChatInterface();

    chattedUsers =
      [];

    currentWorkspace =
      "chat";

    setWorkspace(
      "chat"
    );

    startPresence();

    listenToUsers();

    listenToGroups();

  } catch (error) {

    console.error(
      "Unable to initialize app:",
      error
    );

    showAuth();

    setError(
      firebaseError(error)
    );

  }

}


/*
  ============================================================
  FIREBASE AUTH STATE
  ============================================================
*/

auth.onAuthStateChanged(
  async user => {

    if (user) {

      await startApp(
        user
      );

    } else {

      stopPresenceListener();

      clearAllListeners();

      currentUser =
        null;

      currentProfile =
        null;

      selectedUser =
        null;

      selectedGroup =
        null;

      availableUsers =
        [];

      chattedUsers =
        [];

      groupCache =
        {};

      currentWorkspace =
        "chat";

      setGroupHeaderClickable(
        false
      );

      if (userList) {

        userList.innerHTML =
          "";

      }

      showAuth();

    }

  }
);