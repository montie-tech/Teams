/*
  ============================================================
  TEAMSPACE CHAT
  Firebase Authentication + Realtime Database
  Private chats use browser-side E2EE
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


/*
  ============================================================
  FIREBASE INITIALIZATION
  ============================================================
*/

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}


/*
  ============================================================
  FIREBASE SERVICES
  ============================================================
*/

const auth = firebase.auth();
const db = firebase.database();


/*
  ============================================================
  DOM ELEMENTS
  ============================================================
*/

const authScreen =
  document.getElementById("authScreen");

const appScreen =
  document.getElementById("appScreen");

const authForm =
  document.getElementById("authForm");

const authError =
  document.getElementById("authError");

const authButton =
  document.getElementById("authButton");

const nameGroup =
  document.getElementById("nameGroup");

const nameInput =
  document.getElementById("nameInput");

const emailInput =
  document.getElementById("emailInput");

const passwordInput =
  document.getElementById("passwordInput");

const userList =
  document.getElementById("userList");

const messagesBox =
  document.getElementById("messagesBox");

const messageForm =
  document.getElementById("messageForm");

const messageInput =
  document.getElementById("messageInput");

const chatUserName =
  document.getElementById("chatUserName");

const chatStatus =
  document.getElementById("chatStatus");

const chatUserAvatar =
  document.getElementById("chatUserAvatar");

const chatHeaderInfo =
  document.getElementById("chatHeaderInfo");

const themeToggle =
  document.getElementById("themeToggle");

const imageButton =
  document.getElementById("imageButton");

const imageInput =
  document.getElementById("imageInput");

const uploadStatus =
  document.getElementById("uploadStatus");

const logoutBtn =
  document.getElementById("logoutBtn");

const deleteAccountBtn =
  document.getElementById("deleteAccountBtn");

const refreshUsers =
  document.getElementById("refreshUsers");

const chatNav =
  document.getElementById("chatNav");

const peopleNav =
  document.getElementById("peopleNav");

const groupsNav =
  document.getElementById("groupsNav");

const listTitle =
  document.getElementById("listTitle");


/*
  ============================================================
  STATE
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
  E2EE STATE
  ============================================================
*/

let encryptionKeyPair = null;
let encryptionInitialized = false;
let publicEncryptionKey = null;


/*
  ============================================================
  GENERAL HELPERS
  ============================================================
*/

function initials(name) {

  const value =
    String(name || "User").trim();

  if (!value) {
    return "U";
  }

  const parts =
    value.split(/\s+/);

  if (parts.length === 1) {
    return parts[0]
      .substring(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}


function escapeHtml(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function formatTime(timestamp) {

  if (!timestamp) {
    return "";
  }

  return new Date(timestamp)
    .toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );
}


function formatDate(timestamp) {

  if (!timestamp) {
    return "";
  }

  return new Date(timestamp)
    .toLocaleDateString(
      [],
      {
        year: "numeric",
        month: "short",
        day: "numeric"
      }
    );
}


function formatLastSeen(timestamp) {

  if (!timestamp) {
    return "Offline";
  }

  return (
    "Last seen " +
    formatDate(timestamp) +
    " at " +
    formatTime(timestamp)
  );
}


function setError(message) {

  if (!authError) {
    return;
  }

  authError.textContent =
    message || "";
}


function firebaseError(error) {

  if (!error) {
    return "An unknown error occurred.";
  }

  const code =
    error.code || "";

  const messages = {

    "auth/email-already-in-use":
      "This email address is already registered.",

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/weak-password":
      "Password is too weak.",

    "auth/user-not-found":
      "No account was found with this email.",

    "auth/wrong-password":
      "Incorrect email or password.",

    "auth/invalid-credential":
      "Incorrect email or password.",

    "auth/too-many-requests":
      "Too many attempts. Please try again later.",

    "auth/network-request-failed":
      "Network error. Please check your internet connection.",

    "auth/requires-recent-login":
      "Please sign in again before performing this action.",

    "permission-denied":
      "Firebase denied this operation. Check your database rules."

  };

  return (
    messages[code] ||
    error.message ||
    "An unexpected Firebase error occurred."
  );
}


function showAuth() {

  authScreen?.classList.remove("hidden");
  appScreen?.classList.add("hidden");
}


function showApplication() {

  authScreen?.classList.add("hidden");
  appScreen?.classList.remove("hidden");
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
  E2EE - INDEXEDDB
  ============================================================
*/

const E2EE_DB_NAME =
  "teamspace-e2ee";

const E2EE_STORE_NAME =
  "keys";


function openEncryptionDatabase() {

  return new Promise(
    (resolve, reject) => {

      const request =
        indexedDB.open(
          E2EE_DB_NAME,
          1
        );

      request.onupgradeneeded =
        () => {

          const database =
            request.result;

          if (
            !database.objectStoreNames.contains(
              E2EE_STORE_NAME
            )
          ) {

            database.createObjectStore(
              E2EE_STORE_NAME
            );

          }
        };

      request.onsuccess =
        () => {

          resolve(
            request.result
          );

        };

      request.onerror =
        () => {

          reject(
            request.error ||
            new Error(
              "Unable to open secure key storage."
            )
          );

        };

    }
  );
}


async function savePrivateKey(
  uid,
  privateKey
) {

  const database =
    await openEncryptionDatabase();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        database.transaction(
          E2EE_STORE_NAME,
          "readwrite"
        );

      const store =
        transaction.objectStore(
          E2EE_STORE_NAME
        );

      const request =
        store.put(
          privateKey,
          uid
        );

      request.onsuccess =
        () => {

          database.close();
          resolve();

        };

      request.onerror =
        () => {

          database.close();

          reject(
            request.error
          );

        };

    }
  );
}


async function loadPrivateKey(uid) {

  const database =
    await openEncryptionDatabase();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        database.transaction(
          E2EE_STORE_NAME,
          "readonly"
        );

      const store =
        transaction.objectStore(
          E2EE_STORE_NAME
        );

      const request =
        store.get(uid);

      request.onsuccess =
        () => {

          database.close();

          resolve(
            request.result || null
          );

        };

      request.onerror =
        () => {

          database.close();

          reject(
            request.error
          );

        };

    }
  );
}


async function deletePrivateKey(uid) {

  try {

    const database =
      await openEncryptionDatabase();

    await new Promise(
      (resolve, reject) => {

        const transaction =
          database.transaction(
            E2EE_STORE_NAME,
            "readwrite"
          );

        const store =
          transaction.objectStore(
            E2EE_STORE_NAME
          );

        const request =
          store.delete(uid);

        request.onsuccess =
          resolve;

        request.onerror =
          () =>
            reject(
              request.error
            );

      }
    );

    database.close();

  } catch (error) {

    console.warn(
      "Unable to remove local encryption key:",
      error
    );

  }
}


/*
  ============================================================
  E2EE - BASE64 HELPERS
  ============================================================
*/

function arrayBufferToBase64(buffer) {

  const bytes =
    new Uint8Array(buffer);

  let binary = "";

  const chunkSize =
    0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {

    const chunk =
      bytes.subarray(
        i,
        i + chunkSize
      );

    binary +=
      String.fromCharCode(
        ...chunk
      );
  }

  return btoa(binary);
}


function base64ToArrayBuffer(base64) {

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {

    bytes[i] =
      binary.charCodeAt(i);

  }

  return bytes.buffer;
}


function stringToBase64(text) {

  return arrayBufferToBase64(
    new TextEncoder().encode(text)
  );
}


function base64ToString(base64) {

  return new TextDecoder().decode(
    new Uint8Array(
      base64ToArrayBuffer(base64)
    )
  );
}


/*
  ============================================================
  E2EE - PUBLIC KEY
  ============================================================
*/

async function exportPublicKey(publicKey) {

  const jwk =
    await crypto.subtle.exportKey(
      "jwk",
      publicKey
    );

  return JSON.stringify(jwk);
}


async function importPublicKey(publicKeyString) {

  const jwk =
    JSON.parse(publicKeyString);

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true,
    []
  );
}


/*
  ============================================================
  E2EE - KEY INITIALIZATION
  ============================================================
*/

async function initializeEncryption() {

  if (!currentUser) {
    return false;
  }

  if (
    !window.crypto ||
    !window.crypto.subtle
  ) {

    throw new Error(
      "Your browser does not support the Web Crypto API required for encrypted private chats."
    );

  }

  const uid =
    currentUser.uid;

  let privateKey =
    await loadPrivateKey(uid);


  /*
    Create a new identity when this browser
    has never generated one for this account.
  */

  if (!privateKey) {

    encryptionKeyPair =
      await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        true,
        [
          "deriveKey",
          "deriveBits"
        ]
      );

    await savePrivateKey(
      uid,
      encryptionKeyPair.privateKey
    );

    privateKey =
      encryptionKeyPair.privateKey;

    publicEncryptionKey =
      encryptionKeyPair.publicKey;

    const publicKeyString =
      await exportPublicKey(
        encryptionKeyPair.publicKey
      );

    await db.ref(
      "users/" +
      uid +
      "/publicEncryptionKey"
    ).set(
      publicKeyString
    );

  } else {

    /*
      Existing local private key.
      Load the matching public key.
    */

    const snapshot =
      await db.ref(
        "users/" +
        uid +
        "/publicEncryptionKey"
      ).once("value");

    let publicKeyString =
      snapshot.val();


    /*
      If the public key was manually deleted,
      create a replacement pair.
    */

    if (!publicKeyString) {

      encryptionKeyPair =
        await crypto.subtle.generateKey(
          {
            name: "ECDH",
            namedCurve: "P-256"
          },
          true,
          [
            "deriveKey",
            "deriveBits"
          ]
        );

      await savePrivateKey(
        uid,
        encryptionKeyPair.privateKey
      );

      privateKey =
        encryptionKeyPair.privateKey;

      publicEncryptionKey =
        encryptionKeyPair.publicKey;

      publicKeyString =
        await exportPublicKey(
          encryptionKeyPair.publicKey
        );

      await db.ref(
        "users/" +
        uid +
        "/publicEncryptionKey"
      ).set(
        publicKeyString
      );

    } else {

      encryptionKeyPair = {

        privateKey,

        publicKey:
          await importPublicKey(
            publicKeyString
          )

      };

      publicEncryptionKey =
        encryptionKeyPair.publicKey;
    }
  }

  encryptionInitialized =
    true;

  console.log(
    "TeamSpace E2EE initialized."
  );

  return true;
}


/*
  ============================================================
  E2EE - DERIVE CHAT KEY
  ============================================================
*/

async function deriveChatEncryptionKey(
  recipientUid
) {

  if (!currentUser) {

    throw new Error(
      "You are not signed in."
    );

  }

  if (!encryptionKeyPair) {
    await initializeEncryption();
  }

  const recipientSnapshot =
    await db.ref(
      "users/" +
      recipientUid +
      "/publicEncryptionKey"
    ).once("value");

  const recipientPublicKeyString =
    recipientSnapshot.val();

  if (!recipientPublicKeyString) {

    throw new Error(
      "This user has not initialized encrypted messaging yet. Ask them to sign in to TeamSpace first."
    );

  }

  const recipientPublicKey =
    await importPublicKey(
      recipientPublicKeyString
    );

  const sharedSecret =
    await crypto.subtle.deriveBits(
      {
        name: "ECDH",
        public: recipientPublicKey
      },
      encryptionKeyPair.privateKey,
      256
    );

  const hkdfKey =
    await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      "HKDF",
      false,
      ["deriveKey"]
    );

  const chatId =
    makeChatId(
      currentUser.uid,
      recipientUid
    );

  const salt =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        "TeamSpace-E2EE:" +
        chatId
      )
    );

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info:
        new TextEncoder().encode(
          "TeamSpace private chat AES-256-GCM"
        )
    },
    hkdfKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}


/*
  ============================================================
  E2EE - ENCRYPT TEXT
  ============================================================
*/

async function encryptPrivateText(
  text,
  recipientUid
) {

  const key =
    await deriveChatEncryptionKey(
      recipientUid
    );

  const iv =
    crypto.getRandomValues(
      new Uint8Array(12)
    );

  const encodedText =
    new TextEncoder().encode(text);

  const encrypted =
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      encodedText
    );

  return {

    encrypted: true,

    iv:
      arrayBufferToBase64(iv),

    ciphertext:
      arrayBufferToBase64(
        encrypted
      )

  };
}


/*
  ============================================================
  E2EE - DECRYPT TEXT
  ============================================================
*/

async function decryptPrivateText(
  message,
  senderUid
) {

  if (
    !message ||
    message.encrypted !== true
  ) {

    return message?.body || "";

  }

  try {

    const key =
      await deriveChatEncryptionKey(
        senderUid
      );

    const iv =
      new Uint8Array(
        base64ToArrayBuffer(
          message.iv
        )
      );

    const ciphertext =
      base64ToArrayBuffer(
        message.ciphertext
      );

    const decrypted =
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv
        },
        key,
        ciphertext
      );

    return new TextDecoder().decode(
      decrypted
    );

  } catch (error) {

    console.error(
      "Message decryption failed:",
      error
    );

    return "🔒 Unable to decrypt this message";
  }
}


/*
  ============================================================
  E2EE - PHOTO
  ============================================================
*/

async function encryptPrivatePhoto(
  dataUrl,
  recipientUid
) {

  return encryptPrivateText(
    dataUrl,
    recipientUid
  );
}


async function decryptPrivatePhoto(
  message,
  senderUid
) {

  return decryptPrivateText(
    message,
    senderUid
  );
}


/*
  ============================================================
  GROUP HEADER
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
    enabled
      ? "button"
      : "region"
  );

  chatHeaderInfo.setAttribute(
    "tabindex",
    enabled
      ? "0"
      : "-1"
  );
}


function openSelectedGroupDetails() {

  if (!selectedGroup) {
    return;
  }

  openGroupDetailsModal(
    selectedGroup
  );
}


if (chatHeaderInfo) {

  chatHeaderInfo.addEventListener(
    "click",
    () => {

      if (selectedGroup) {
        openSelectedGroupDetails();
      }

    }
  );

  chatHeaderInfo.addEventListener(
    "keydown",
    event => {

      if (
        (
          event.key === "Enter" ||
          event.key === " "
        ) &&
        selectedGroup
      ) {

        event.preventDefault();

        openSelectedGroupDetails();
      }

    }
  );
}


/*
  ============================================================
  WORKSPACE NAVIGATION
  ============================================================
*/

function ensureWorkspaceNavigation() {

  if (
    !chatNav ||
    !peopleNav ||
    !groupsNav
  ) {
    return;
  }

  chatNav.classList.toggle(
    "active",
    currentWorkspace === "chat"
  );

  peopleNav.classList.toggle(
    "active",
    currentWorkspace === "people"
  );

  groupsNav.classList.toggle(
    "active",
    currentWorkspace === "groups"
  );
}


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

    .hidden {
      display: none !important;
    }

    .group-header-clickable {
      cursor: pointer;
    }

    .group-header-clickable:hover {
      background: rgba(31,94,255,.06);
    }

    .message-bubble img {
      max-width: 280px;
      max-height: 360px;
      border-radius: 12px;
      display: block;
      cursor: pointer;
      object-fit: contain;
    }

    .message-meta {
      font-size: 11px;
      opacity: .65;
      margin-top: 5px;
    }

    .message-sender {
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
    }

    .message {
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
    }

    .message.mine {
      align-items: flex-end;
    }

    .message.theirs {
      align-items: flex-start;
    }

    .message-bubble {
      max-width: min(75%, 650px);
      padding: 10px 13px;
      border-radius: 15px;
      word-wrap: break-word;
      overflow-wrap: anywhere;
    }

    .message.mine .message-bubble {
      background: #1f5eff;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.theirs .message-bubble {
      background: #eeeeee;
      color: #111;
      border-bottom-left-radius: 4px;
    }

    body.dark .message.theirs .message-bubble {
      background: #252a35;
      color: #fff;
    }

    .e2ee-indicator {
      font-size: 10px;
      opacity: .65;
      margin-top: 4px;
    }

    .empty-chat {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 30px;
      opacity: .75;
    }

    .user-row,
    .group-row {
      cursor: pointer;
    }

    .security-note {
      margin-top: 10px;
      padding: 10px;
      border-radius: 10px;
      font-size: 12px;
      background: rgba(31,94,255,.08);
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0,0,0,.55);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .teamspace-modal {
      width: min(520px, 100%);
      max-height: 90vh;
      overflow: auto;
      background: white;
      color: #111;
      border-radius: 18px;
      padding: 22px;
      box-shadow: 0 20px 70px rgba(0,0,0,.3);
    }

    body.dark .teamspace-modal {
      background: #181b22;
      color: #fff;
    }

    .modal-close {
      float: right;
      border: 0;
      background: transparent;
      font-size: 22px;
      cursor: pointer;
    }

    .modal-field {
      margin: 14px 0;
    }

    .modal-field label {
      display: block;
      margin-bottom: 6px;
      font-weight: 600;
    }

    .modal-field input {
      width: 100%;
      box-sizing: border-box;
      padding: 11px;
      border-radius: 10px;
      border: 1px solid #ccc;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      margin-top: 18px;
    }

    .modal-actions button {
      flex: 1;
      padding: 11px;
      border: 0;
      border-radius: 10px;
      cursor: pointer;
    }

    .security-lock {
      margin-right: 5px;
    }

    @media(max-width:700px) {

      .message-bubble {
        max-width: 85%;
      }

      .message-bubble img {
        max-width: 230px;
      }

    }

  `;

  document.head.appendChild(style);
}


/*
  ============================================================
  DARK MODE
  ============================================================
*/

function applyTheme(theme) {

  document.body.classList.toggle(
    "dark",
    theme === "dark"
  );

  if (themeToggle) {

    themeToggle.textContent =
      theme === "dark"
        ? "☀️ Light"
        : "🌙 Dark";
  }
}


function initializeTheme() {

  const savedTheme =
    localStorage.getItem(
      "teamspaceTheme"
    );

  applyTheme(
    savedTheme || "light"
  );
}


if (themeToggle) {

  themeToggle.addEventListener(
    "click",
    () => {

      const dark =
        document.body.classList.contains(
          "dark"
        );

      const nextTheme =
        dark
          ? "light"
          : "dark";

      localStorage.setItem(
        "teamspaceTheme",
        nextTheme
      );

      applyTheme(nextTheme);

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
}


function clearAllListeners() {

  clearMessageListener();
  clearPresenceListeners();

  if (usersListener) {

    db.ref("users").off(
      "value",
      usersListener
    );
  }

  if (groupsListener) {

    db.ref("groups").off(
      "value",
      groupsListener
    );
  }

  usersListener = null;
  groupsListener = null;
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

      <div>

        <h2>
          ${escapeHtml(title)}
        </h2>

        <p>
          ${escapeHtml(description)}
        </p>

      </div>

    </div>

  `;
}


/*
  ============================================================
  PROFILE PHOTO
  ============================================================
*/

function getProfilePhoto(profile) {

  return (
    profile?.photoUrl ||
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

  if (photo) {

    element.innerHTML = `

      <img
        src="${String(photo).replaceAll('"', "&quot;")}"
        alt="${escapeHtml(
          fallbackName ||
          profile?.name ||
          "User"
        )}"
      >

    `;

  } else {

    element.textContent =
      initials(
        fallbackName ||
        profile?.name
      );
  }
}


function updateProfileUI() {

  if (!currentUser) {
    return;
  }

  const name =
    currentProfile?.name ||
    currentUser.displayName ||
    currentUser.email ||
    "User";

  const profileAvatar =
    document.getElementById(
      "profileAvatar"
    );

  const profileName =
    document.getElementById(
      "profileName"
    );

  const profileEmail =
    document.getElementById(
      "profileEmail"
    );

  setAvatarElement(
    profileAvatar,
    currentProfile,
    name
  );

  if (profileName) {
    profileName.textContent = name;
  }

  if (profileEmail) {
    profileEmail.textContent =
      currentUser.email || "";
  }
}


function attachOwnProfileClick() {

  const ownProfile =
    document.getElementById(
      "ownProfile"
    );

  if (!ownProfile) {
    return;
  }

  if (
    ownProfile.dataset.attached ===
    "true"
  ) {
    return;
  }

  ownProfile.dataset.attached =
    "true";

  ownProfile.addEventListener(
    "click",
    openOwnProfileModal
  );

  ownProfile.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter" ||
        event.key === " "
      ) {

        event.preventDefault();

        openOwnProfileModal();
      }

    }
  );
}


/*
  ============================================================
  MODALS
  ============================================================
*/

function removeTeamspaceModal() {

  document
    .querySelectorAll(
      ".modal-backdrop"
    )
    .forEach(
      element => element.remove()
    );
}


function createModal(
  title,
  content
) {

  removeTeamspaceModal();

  const backdrop =
    document.createElement("div");

  backdrop.className =
    "modal-backdrop";

  const modal =
    document.createElement("div");

  modal.className =
    "teamspace-modal";

  modal.innerHTML = `

    <button
      class="modal-close"
      type="button"
      aria-label="Close"
    >
      ×
    </button>

    <h2>
      ${escapeHtml(title)}
    </h2>

    <div>
      ${content}
    </div>

  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close =
    modal.querySelector(
      ".modal-close"
    );

  close?.addEventListener(
    "click",
    removeTeamspaceModal
  );

  backdrop.addEventListener(
    "click",
    event => {

      if (event.target === backdrop) {
        removeTeamspaceModal();
      }

    }
  );

  return modal;
}


/*
  ============================================================
  PHOTO COMPRESSION
  ============================================================
*/

function compressImage(file) {

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

              const maxWidth = 900;
              const maxHeight = 900;

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

              canvas.width = width;
              canvas.height = height;

              const context =
                canvas.getContext("2d");

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

              let quality = 0.78;

              let dataUrl =
                canvas.toDataURL(
                  "image/jpeg",
                  quality
                );

              const maxBytes =
                450 * 1024;

              while (
                dataUrl.length > maxBytes &&
                quality > 0.35
              ) {

                quality -= 0.07;

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

      reader.readAsDataURL(file);
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
          margin: 0;
          width: 100%;
          min-height: 100%;
          background: #111;
        }

        body {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        img {
          max-width: 96vw;
          max-height: 96vh;
          width: auto;
          height: auto;
          object-fit: contain;
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
  OWN PROFILE MODAL
  ============================================================
*/

async function openOwnProfileModal() {

  if (!currentUser) {
    return;
  }

  const modal =
    createModal(
      "My Profile",
      `
        <div class="modal-field">

          <label>
            Name
          </label>

          <input
            id="profileEditName"
            type="text"
            maxlength="100"
            value="${escapeHtml(
              currentProfile?.name || ""
            )}"
          >

        </div>

        <div class="modal-field">

          <label>
            Profile photo
          </label>

          <input
            id="profileEditPhoto"
            type="file"
            accept="image/*"
          >

        </div>

        <div class="security-note">

          🔒 Private messages are
          end-to-end encrypted
          on this browser.

        </div>

        <div class="modal-actions">

          <button
            id="profileCancel"
            type="button"
          >
            Cancel
          </button>

          <button
            id="profileSave"
            type="button"
          >
            Save
          </button>

        </div>
      `
    );

  modal
    .querySelector(
      "#profileCancel"
    )
    ?.addEventListener(
      "click",
      removeTeamspaceModal
    );

  modal
    .querySelector(
      "#profileSave"
    )
    ?.addEventListener(
      "click",
      async () => {

        const saveButton =
          modal.querySelector(
            "#profileSave"
          );

        const name =
          modal
            .querySelector(
              "#profileEditName"
            )
            ?.value
            .trim();

        const photoFile =
          modal
            .querySelector(
              "#profileEditPhoto"
            )
            ?.files?.[0];

        if (!name) {

          alert(
            "Please enter your name."
          );

          return;
        }

        saveButton.disabled = true;
        saveButton.textContent =
          "Saving...";

        try {

          const updates = {

            name,

            email:
              currentUser.email,

            uid:
              currentUser.uid

          };

          if (photoFile) {

            const compressed =
              await compressImage(
                photoFile
              );

            updates.photoUrl =
              compressed.dataUrl;

          } else if (
            currentProfile?.photoUrl
          ) {

            updates.photoUrl =
              currentProfile.photoUrl;

          }

          await db.ref(
            "users/" +
            currentUser.uid
          ).update(updates);

          await currentUser.updateProfile({
            displayName: name
          });

          currentProfile = {
            ...currentProfile,
            ...updates
          };

          updateProfileUI();

          removeTeamspaceModal();

        } catch (error) {

          console.error(
            "Profile update error:",
            error
          );

          alert(
            firebaseError(error)
          );

        } finally {

          saveButton.disabled =
            false;

          saveButton.textContent =
            "Save";
        }

      }
    );
}


/*
  ============================================================
  OTHER USER PROFILE
  ============================================================
*/

function openUserProfileModal(user) {

  if (!user) {
    return;
  }

  createModal(
    user.name || "User Profile",

    `
      <div
        style="
          text-align:center;
          margin-bottom:20px;
        "
      >

        <div
          class="avatar"
          style="
            width:80px;
            height:80px;
            margin:0 auto 12px;
          "
          id="otherProfileAvatar"
        ></div>

        <h3>
          ${escapeHtml(
            user.name || "User"
          )}
        </h3>

        <p>
          ${escapeHtml(
            user.email || ""
          )}
        </p>

      </div>

      <div id="profilePresenceArea">
        Loading presence...
      </div>
    `
  );

  const avatar =
    document.getElementById(
      "otherProfileAvatar"
    );

  setAvatarElement(
    avatar,
    user,
    user.name
  );

  listenToUserPresence(
    user.uid,
    document.getElementById(
      "profilePresenceArea"
    )
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

  const uid =
    currentUser.uid;

  presenceConnectionRef =
    db.ref(".info/connected");

  presenceConnectionCallback =
    snapshot => {

      if (
        snapshot.val() !== true
      ) {
        return;
      }

      const userPresenceRef =
        db.ref(
          "presence/" +
          uid
        );

      userPresenceRef
        .onDisconnect()
        .set({

          state:
            "offline",

          lastChanged:
            firebase.database
              .ServerValue.TIMESTAMP

        });

      userPresenceRef.set({

        state:
          "online",

        lastChanged:
          firebase.database
            .ServerValue.TIMESTAMP

      });

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

    console.warn(
      "Unable to mark offline:",
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


function listenToUserPresence(
  uid,
  targetElement
) {

  if (!targetElement) {
    return;
  }

  const ref =
    db.ref(
      "presence/" +
      uid
    );

  const callback =
    snapshot => {

      const presence =
        snapshot.val();

      if (
        presence?.state ===
        "online"
      ) {

        targetElement.innerHTML = `

          <div
            style="
              color:#16a34a;
              font-weight:600;
            "
          >
            ● Online
          </div>

        `;

      } else {

        targetElement.innerHTML = `

          <div>
            ${escapeHtml(
              formatLastSeen(
                presence?.lastChanged
              )
            )}
          </div>

        `;
      }
    };

  clearSelectedPresenceListener();

  selectedPresenceRef = ref;
  selectedPresenceCallback = callback;

  ref.on(
    "value",
    callback
  );
}


/*
  ============================================================
  CREATE GROUP INTERFACE
  ============================================================
*/

function createGroupInterface() {

  let button =
    document.getElementById(
      "createGroupButton"
    );

  if (!button) {

    const parent =
      document.querySelector(
        ".sidebar-actions"
      );

    if (parent) {

      button =
        document.createElement(
          "button"
        );

      button.id =
        "createGroupButton";

      button.type =
        "button";

      button.textContent =
        "+";

      button.title =
        "Create group";

      parent.appendChild(
        button
      );
    }
  }

  if (
    button &&
    button.dataset.attached !==
    "true"
  ) {

    button.dataset.attached =
      "true";

    button.addEventListener(
      "click",
      openCreateGroupModal
    );
  }
}


function openCreateGroupModal() {

  createModal(
    "Create Group",

    `
      <div class="modal-field">

        <label>
          Group name
        </label>

        <input
          id="newGroupName"
          type="text"
          maxlength="80"
          placeholder="e.g. Development Team"
        >

      </div>

      <div class="modal-actions">

        <button
          id="cancelCreateGroup"
          type="button"
        >
          Cancel
        </button>

        <button
          id="confirmCreateGroup"
          type="button"
        >
          Create Group
        </button>

      </div>
    `
  );

  document
    .getElementById(
      "cancelCreateGroup"
    )
    ?.addEventListener(
      "click",
      removeTeamspaceModal
    );

  document
    .getElementById(
      "confirmCreateGroup"
    )
    ?.addEventListener(
      "click",
      createGroup
    );
}


async function createGroup() {

  if (!currentUser) {
    return;
  }

  const input =
    document.getElementById(
      "newGroupName"
    );

  const button =
    document.getElementById(
      "confirmCreateGroup"
    );

  const name =
    input?.value.trim();

  if (!name) {

    alert(
      "Enter a group name."
    );

    return;
  }

  if (name.length > 80) {

    alert(
      "Group name must be 80 characters or less."
    );

    return;
  }

  button.disabled = true;
  button.textContent =
    "Creating...";

  try {

    const groupRef =
      db.ref("groups").push();

    const group = {

      id:
        groupRef.key,

      name,

      createdBy:
        currentUser.uid,

      createdAt:
        firebase.database
          .ServerValue.TIMESTAMP,

      members: {

        [currentUser.uid]:
          true

      }

    };

    await groupRef.set(group);

    removeTeamspaceModal();

  } catch (error) {

    console.error(
      "Create group error:",
      error
    );

    alert(
      firebaseError(error)
    );

  } finally {

    button.disabled =
      false;

    button.textContent =
      "Create Group";
  }
}


/*
  ============================================================
  GROUP DETAILS
  ============================================================
*/

async function openGroupDetailsModal(group) {

  if (!group) {
    return;
  }

  createModal(
    group.name || "Group",

    `
      <div id="groupDetailsContent">
        Loading group details...
      </div>
    `
  );

  const container =
    document.getElementById(
      "groupDetailsContent"
    );

  if (!container) {
    return;
  }

  try {

    /*
      ----------------------------------------------------------
      GET MEMBERS
      ----------------------------------------------------------
    */

    const members =
      Object.keys(
        group.members || {}
      );


    /*
      ----------------------------------------------------------
      GET ALL USERS
      ----------------------------------------------------------
    */

    const usersSnapshot =
      await db.ref(
        "users"
      ).once("value");

    const users = {};

    usersSnapshot.forEach(
      child => {

        users[child.key] =
          child.val();

      }
    );


    /*
      ----------------------------------------------------------
      CURRENT USER / ADMIN
      ----------------------------------------------------------
    */

    const currentUid =
      currentUser?.uid || "";

    const adminUid =
      group.createdBy || "";

    const isAdmin =
      currentUid === adminUid;


    /*
      ----------------------------------------------------------
      MEMBER LIST
      ----------------------------------------------------------
    */

    const memberHtml =
      members
        .map(
          uid => {

            const user =
              users[uid] || {};

            const isMemberAdmin =
              uid === adminUid;

            const isCurrentUser =
              uid === currentUid;


            /*
              Admin can remove other members.
              Admin cannot remove themselves.
            */

            const removeButton =
              isAdmin &&
              !isMemberAdmin
                ? `
                    <button
                      type="button"
                      class="group-member-remove"
                      data-remove-member="${escapeHtml(uid)}"
                    >
                      Remove
                    </button>
                  `
                : "";


            return `

              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:10px;
                  padding:10px 0;
                "
              >

                <div class="avatar">

                  ${
                    user?.photoUrl
                      ? `
                          <img
                            src="${String(
                              user.photoUrl
                            ).replaceAll(
                              '"',
                              "&quot;"
                            )}"
                            alt=""
                          >
                        `
                      : escapeHtml(
                          initials(
                            user?.name
                          )
                        )
                  }

                </div>


                <div
                  style="
                    flex:1;
                    min-width:0;
                  "
                >

                  <div
                    style="
                      display:flex;
                      align-items:center;
                      flex-wrap:wrap;
                      gap:7px;
                    "
                  >

                    <strong>
                      ${escapeHtml(
                        user?.name ||
                        "User"
                      )}
                    </strong>


                    ${
                      isMemberAdmin
                        ? `
                            <span
                              class="group-admin-badge"
                            >
                              Admin
                            </span>
                          `
                        : ""
                    }


                    ${
                      isCurrentUser
                        ? `
                            <span
                              style="
                                font-size:.68rem;
                                color:var(--muted);
                              "
                            >
                              You
                            </span>
                          `
                        : ""
                    }

                  </div>


                  <div
                    style="
                      font-size:.72rem;
                      color:var(--muted);
                      margin-top:3px;
                      word-break:break-word;
                    "
                  >
                    ${escapeHtml(
                      user?.email ||
                      ""
                    )}
                  </div>

                </div>


                ${removeButton}

              </div>

            `;

          }
        )
        .join("");


    /*
      ==========================================================
      USERS AVAILABLE TO ADD
      ==========================================================
    */

    const availableMembers =
      Object.keys(users)
        .filter(
          uid =>
            !members.includes(uid)
        );


    /*
      ----------------------------------------------------------
      ADD MEMBER LIST
      ----------------------------------------------------------
    */

    let addMembersHtml = "";


    if (isAdmin) {

      if (
        availableMembers.length === 0
      ) {

        addMembersHtml = `

          <div
            style="
              margin-top:18px;
              padding-top:15px;
              border-top:1px solid var(--border-light);
              color:var(--muted);
              font-size:.75rem;
            "
          >
            All registered users are already
            members of this group.
          </div>

        `;

      } else {

        const availableMemberHtml =
          availableMembers
            .map(
              uid => {

                const user =
                  users[uid] || {};

                return `

                  <label
                    style="
                      display:flex;
                      align-items:center;
                      gap:10px;
                      padding:8px 0;
                      cursor:pointer;
                    "
                  >

                    <input
                      type="checkbox"
                      class="group-add-member-checkbox"
                      value="${escapeHtml(uid)}"
                    >

                    <div
                      class="avatar"
                      style="
                        width:32px;
                        height:32px;
                        min-width:32px;
                      "
                    >

                      ${
                        user?.photoUrl
                          ? `
                              <img
                                src="${String(
                                  user.photoUrl
                                ).replaceAll(
                                  '"',
                                  "&quot;"
                                )}"
                                alt=""
                              >
                            `
                          : escapeHtml(
                              initials(
                                user?.name
                              )
                            )
                      }

                    </div>


                    <div
                      style="
                        flex:1;
                        min-width:0;
                      "
                    >

                      <div
                        style="
                          font-size:.78rem;
                          font-weight:700;
                        "
                      >
                        ${escapeHtml(
                          user?.name ||
                          "User"
                        )}
                      </div>

                      <div
                        style="
                          font-size:.68rem;
                          color:var(--muted);
                          word-break:break-word;
                        "
                      >
                        ${escapeHtml(
                          user?.email ||
                          ""
                        )}
                      </div>

                    </div>

                  </label>

                `;

              }
            )
            .join("");


        addMembersHtml = `

          <div
            style="
              margin-top:18px;
              padding-top:15px;
              border-top:1px solid var(--border-light);
            "
          >

            <div
              style="
                font-size:.82rem;
                font-weight:800;
                margin-bottom:8px;
              "
            >
              Add Members
            </div>


            <div
              style="
                color:var(--muted);
                font-size:.7rem;
                margin-bottom:10px;
              "
            >
              Select users to add to this group.
            </div>


            <div>
              ${availableMemberHtml}
            </div>


            <button
              type="button"
              id="addGroupMembersButton"
              class="primary-btn"
              style="
                width:100%;
                margin-top:10px;
                min-height:40px;
                border-radius:8px;
              "
            >
              Add Selected Members
            </button>

          </div>

        `;

      }

    }


    /*
      ==========================================================
      LEAVE GROUP
      ==========================================================
    */

    const leaveGroupHtml =
      currentUid &&
      members.includes(currentUid) &&
      !isAdmin
        ? `

            <div class="group-profile-actions">

              <button
                type="button"
                id="leaveGroupButton"
                class="danger-profile-btn"
              >
                Leave Group
              </button>

            </div>

          `
        : "";


    /*
      ==========================================================
      DISPLAY DETAILS
      ==========================================================
    */

    container.innerHTML = `

      <p>

        Created by:

        <strong>
          ${escapeHtml(
            users[group.createdBy]?.name ||
            "Unknown"
          )}
        </strong>


        <span
          class="group-admin-badge"
          style="margin-left:6px;"
        >
          Admin
        </span>

      </p>


      <p>
        Members:
        ${members.length}
      </p>


      <div>
        ${memberHtml}
      </div>


      ${addMembersHtml}


      ${leaveGroupHtml}

    `;


    /*
      ==========================================================
      REMOVE MEMBER
      ==========================================================
    */

    container
      .querySelectorAll(
        "[data-remove-member]"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            async () => {

              const memberUid =
                button.getAttribute(
                  "data-remove-member"
                );

              if (!memberUid) {
                return;
              }


              if (!isAdmin) {

                alert(
                  "Only the group admin can remove members."
                );

                return;
              }


              if (
                memberUid ===
                currentUid
              ) {

                alert(
                  "The group admin cannot remove themselves."
                );

                return;
              }


              const memberName =
                users[memberUid]?.name ||
                "this user";


              const confirmed =
                confirm(
                  `Remove ${memberName} from ${group.name || "this group"}?`
                );


              if (!confirmed) {
                return;
              }


              try {

                await db.ref(
                  `groups/${group.id}/members/${memberUid}`
                ).remove();


                if (
                  group.members &&
                  group.members[memberUid]
                ) {

                  delete group.members[
                    memberUid
                  ];

                }


                await openGroupDetailsModal(
                  group
                );


              } catch (error) {

                alert(
                  firebaseError(error)
                );

              }

            }
          );

        }
      );


    /*
      ==========================================================
      ADD MEMBERS
      ==========================================================
    */

    const addMembersButton =
      document.getElementById(
        "addGroupMembersButton"
      );


    if (
      addMembersButton &&
      isAdmin
    ) {

      addMembersButton.addEventListener(
        "click",
        async () => {

          const checkboxes =
            container.querySelectorAll(
              ".group-add-member-checkbox:checked"
            );


          const selectedUids =
            Array.from(
              checkboxes
            )
              .map(
                checkbox =>
                  checkbox.value
              )
              .filter(
                uid =>
                  uid &&
                  !members.includes(uid)
              );


          if (
            selectedUids.length === 0
          ) {

            alert(
              "Select at least one user to add."
            );

            return;
          }


          try {

            addMembersButton.disabled =
              true;

            addMembersButton.textContent =
              "Adding Members...";


            /*
              Build one Firebase update so all
              selected members are added together.
            */

            const updates = {};


            selectedUids.forEach(
              uid => {

                updates[
                  `groups/${group.id}/members/${uid}`
                ] = true;

              }
            );


            await db.ref().update(
              updates
            );


            /*
              Update local group object.
            */

            if (!group.members) {

              group.members = {};

            }


            selectedUids.forEach(
              uid => {

                group.members[uid] =
                  true;

              }
            );


            /*
              Reopen the details with the
              updated member list.
            */

            await openGroupDetailsModal(
              group
            );


          } catch (error) {

            addMembersButton.disabled =
              false;

            addMembersButton.textContent =
              "Add Selected Members";


            alert(
              firebaseError(error)
            );

          }

        }
      );

    }


    /*
      ==========================================================
      LEAVE GROUP
      ==========================================================
    */

    const leaveButton =
      document.getElementById(
        "leaveGroupButton"
      );


    if (leaveButton) {

      leaveButton.addEventListener(
        "click",
        async () => {

          if (!currentUid) {
            return;
          }


          if (isAdmin) {

            alert(
              "The group admin cannot leave the group."
            );

            return;
          }


          const confirmed =
            confirm(
              `Are you sure you want to leave ${group.name || "this group"}?`
            );


          if (!confirmed) {
            return;
          }


          try {

            await db.ref(
              `groups/${group.id}/members/${currentUid}`
            ).remove();


            if (
              group.members &&
              group.members[currentUid]
            ) {

              delete group.members[
                currentUid
              ];

            }


            if (
              selectedGroup &&
              selectedGroup.id === group.id
            ) {

              selectedGroup = null;

            }


            try {

              if (
                typeof renderGroups ===
                "function"
              ) {

                renderGroups();

              }

            } catch (renderError) {

              console.warn(
                "Unable to refresh group list:",
                renderError
              );

            }


            /*
              Refresh the details screen.
            */

            await openGroupDetailsModal(
              group
            );


          } catch (error) {

            alert(
              firebaseError(error)
            );

          }

        }
      );

    }

  } catch (error) {

    container.textContent =
      firebaseError(error);

  }
}/*
  ============================================================
  AUTH TABS
  ============================================================
*/

document
  .querySelectorAll(".tab")
  .forEach(
    tab => {

      tab.addEventListener(
        "click",
        () => {

          authMode =
            tab.dataset.mode ||
            "login";

          document
            .querySelectorAll(".tab")
            .forEach(
              item => {

                item.classList.toggle(
                  "active",
                  item === tab
                );

              }
            );

          if (
            authMode ===
            "register"
          ) {

            nameGroup?.classList.remove(
              "hidden"
            );

            if (authButton) {

              authButton.textContent =
                "Create account";
            }

            if (passwordInput) {

              passwordInput.autocomplete =
                "new-password";
            }

          } else {

            nameGroup?.classList.add(
              "hidden"
            );

            if (authButton) {

              authButton.textContent =
                "Sign in";
            }

            if (passwordInput) {

              passwordInput.autocomplete =
                "current-password";
            }
          }

          setError("");

        }
      );

    }
  );


/*
  ============================================================
  AUTH FORM
  ============================================================
*/

if (authForm) {

  authForm.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const email =
        emailInput?.value.trim() ||
        "";

      const password =
        passwordInput?.value ||
        "";

      const name =
        nameInput?.value.trim() ||
        "";

      setError("");

      if (!email || !password) {

        setError(
          "Email and password are required."
        );

        return;
      }

      if (
        authMode === "register" &&
        !name
      ) {

        setError(
          "Please enter your name."
        );

        return;
      }

      authButton.disabled = true;

      authButton.textContent =
        authMode === "register"
          ? "Creating account..."
          : "Signing in...";

      try {

        if (
          authMode ===
          "register"
        ) {

          const credential =
            await auth
              .createUserWithEmailAndPassword(
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

          currentUser =
            credential.user;

          await initializeEncryption();

        } else {

          await auth
            .signInWithEmailAndPassword(
              email,
              password
            );
        }

        authForm.reset();

      } catch (error) {

        console.error(
          "Authentication error:",
          error
        );

        setError(
          firebaseError(error)
        );

      } finally {

        authButton.disabled =
          false;

        authButton.textContent =
          authMode === "register"
            ? "Create account"
            : "Sign in";
      }
    }
  );
}


/*
  ============================================================
  USERS LISTENER
  ============================================================
*/

function listenToUsers() {

  if (usersListener) {

    db.ref("users").off(
      "value",
      usersListener
    );
  }

  usersListener =
    snapshot => {

      const users = [];

      snapshot.forEach(
        child => {

          const user =
            child.val();

          if (
            user &&
            child.key !==
            currentUser?.uid
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

      if (
        currentWorkspace ===
        "people"
      ) {

        renderUsers();
      }
    };

  db.ref("users").on(
    "value",
    usersListener
  );
}


/*
  ============================================================
  LOAD CHATTED USERS
  ============================================================
*/

async function loadChattedUsers() {

  if (!currentUser) {
    return;
  }

  const usersSnapshot =
    await db.ref(
      "users"
    ).once("value");

  const allUsers = {};

  usersSnapshot.forEach(
    child => {

      allUsers[child.key] = {

        ...child.val(),

        uid:
          child.key

      };
    }
  );

  const result = [];

  for (
    const uid in allUsers
  ) {

    if (
      uid ===
      currentUser.uid
    ) {
      continue;
    }

    const chatId =
      makeChatId(
        currentUser.uid,
        uid
      );

    const messagesSnapshot =
      await db.ref(
        "privateChats/" +
        chatId +
        "/messages"
      )
        .limitToLast(1)
        .once("value");

    if (
      messagesSnapshot.exists()
    ) {

      result.push(
        allUsers[uid]
      );
    }
  }

  chattedUsers =
    result;
}


/*
  ============================================================
  USER LIST
  ============================================================
*/

function renderUsers() {

  if (!userList) {
    return;
  }

  if (!availableUsers.length) {

    userList.innerHTML = `

      <div class="empty-chat">

        <div>
          No other users found.
        </div>

      </div>

    `;

    return;
  }

  userList.innerHTML =
    availableUsers
      .map(
        user => `

          <button
            type="button"
            class="user-row"
            data-user-id="${escapeHtml(
              user.uid
            )}"
          >

            <div class="avatar">

              ${
                getProfilePhoto(user)
                  ? `
                    <img
                      src="${String(
                        getProfilePhoto(user)
                      ).replaceAll(
                        '"',
                        "&quot;"
                      )}"
                      alt=""
                    >
                  `
                  : escapeHtml(
                      initials(
                        user.name
                      )
                    )
              }

            </div>

            <div>

              <strong>
                ${escapeHtml(
                  user.name ||
                  "User"
                )}
              </strong>

              <small>
                ${escapeHtml(
                  user.email ||
                  ""
                )}
              </small>

            </div>

          </button>

        `
      )
      .join("");

  userList
    .querySelectorAll(
      "[data-user-id]"
    )
    .forEach(
      row => {

        row.addEventListener(
          "click",
          () => {

            const user =
              availableUsers.find(
                item =>
                  item.uid ===
                  row.dataset.userId
              );

            if (user) {
              selectUser(user);
            }
          }
        );

        row.addEventListener(
          "contextmenu",
          event => {

            event.preventDefault();

            const user =
              availableUsers.find(
                item =>
                  item.uid ===
                  row.dataset.userId
              );

            if (user) {
              openUserProfileModal(
                user
              );
            }
          }
        );
      }
    );
}


function renderChatList() {

  if (!userList) {
    return;
  }

  if (!chattedUsers.length) {

    userList.innerHTML = `

      <div
        style="
          padding:20px;
          text-align:center;
          opacity:.7;
        "
      >

        No conversations yet.

      </div>

    `;

    return;
  }

  userList.innerHTML =
    chattedUsers
      .map(
        user => `

          <button
            type="button"
            class="user-row"
            data-user-id="${escapeHtml(
              user.uid
            )}"
          >

            <div class="avatar">

              ${
                getProfilePhoto(user)
                  ? `
                    <img
                      src="${String(
                        getProfilePhoto(user)
                      ).replaceAll(
                        '"',
                        "&quot;"
                      )}"
                      alt=""
                    >
                  `
                  : escapeHtml(
                      initials(
                        user.name
                      )
                    )
              }

            </div>

            <div>

              <strong>
                ${escapeHtml(
                  user.name ||
                  "User"
                )}
              </strong>

              <small>
                Private chat 🔒
              </small>

            </div>

          </button>

        `
      )
      .join("");

  userList
    .querySelectorAll(
      "[data-user-id]"
    )
    .forEach(
      row => {

        row.addEventListener(
          "click",
          () => {

            const user =
              chattedUsers.find(
                item =>
                  item.uid ===
                  row.dataset.userId
              );

            if (user) {
              selectUser(user);
            }
          }
        );
      }
    );
}


function ensureUserInChatList(user) {

  if (!user) {
    return;
  }

  if (
    !chattedUsers.some(
      item =>
        item.uid ===
        user.uid
    )
  ) {

    chattedUsers.push(user);
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
  GROUP LISTENER
  ============================================================
*/

function listenToGroups() {

  if (groupsListener) {

    db.ref("groups").off(
      "value",
      groupsListener
    );
  }

  groupsListener =
    snapshot => {

      const groups = [];

      snapshot.forEach(
        child => {

          const group =
            child.val();

          if (
            group?.members?.[
              currentUser?.uid
            ]
          ) {

            groups.push({

              ...group,

              id:
                child.key,

              memberCount:
                Object.keys(
                  group.members || {}
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

      if (
        currentWorkspace ===
        "groups"
      ) {

        renderGroups();
      }
    };

  db.ref("groups").on(
    "value",
    groupsListener
  );
}


/*
  ============================================================
  GROUP LIST
  ============================================================
*/

function renderGroups() {

  if (!userList) {
    return;
  }

  const groups =
    Object.values(
      groupCache
    );

  if (!groups.length) {

    userList.innerHTML = `

      <div
        style="
          padding:20px;
          text-align:center;
          opacity:.7;
        "
      >

        No groups yet.

      </div>

    `;

    return;
  }

  userList.innerHTML =
    groups
      .map(
        group => `

          <button
            type="button"
            class="group-row user-row"
            data-group-id="${escapeHtml(
              group.id
            )}"
          >

            <div class="avatar">
              👥
            </div>

            <div>

              <strong>
                ${escapeHtml(
                  group.name
                )}
              </strong>

              <small>
                ${group.memberCount || 0}
                members
              </small>

            </div>

          </button>

        `
      )
      .join("");

  userList
    .querySelectorAll(
      "[data-group-id]"
    )
    .forEach(
      row => {

        row.addEventListener(
          "click",
          () => {

            const group =
              groupCache[
                row.dataset.groupId
              ];

            if (group) {
              selectGroup(group);
            }
          }
        );
      }
    );
}


/*
  ============================================================
  WORKSPACE
  ============================================================
*/

function setWorkspace(workspace) {

  currentWorkspace =
    workspace;

  ensureWorkspaceNavigation();

  if (listTitle) {

    if (
      workspace ===
      "people"
    ) {

      listTitle.textContent =
        "People";

    } else if (
      workspace ===
      "groups"
    ) {

      listTitle.textContent =
        "Groups";

    } else {

      listTitle.textContent =
        "Conversations";
    }
  }

  if (
    workspace ===
    "people"
  ) {

    renderUsers();

  } else if (
    workspace ===
    "groups"
  ) {

    renderGroups();

  } else {

    renderChatList();
  }
}


chatNav?.addEventListener(
  "click",
  () => {

    setWorkspace("chat");

  }
);


peopleNav?.addEventListener(
  "click",
  () => {

    setWorkspace("people");

  }
);


groupsNav?.addEventListener(
  "click",
  () => {

    setWorkspace("groups");

  }
);


/*
  ============================================================
  SELECT PRIVATE USER
  ============================================================
*/

function selectUser(user) {

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

  setGroupHeaderClickable(false);

  clearMessageListener();
  clearPresenceListeners();

  if (chatUserName) {

    chatUserName.textContent =
      user.name ||
      "User";
  }

  if (chatStatus) {

    chatStatus.textContent =
      "🔒 End-to-end encrypted";

    chatStatus.classList.remove(
      "online",
      "offline"
    );
  }

  setAvatarElement(
    chatUserAvatar,
    user,
    user.name
  );

  if (messageForm) {

    messageForm.classList.remove(
      "hidden"
    );
  }

  listenToUserPresence(
    user.uid,
    chatStatus
  );

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
  SELECT GROUP
  ============================================================
*/

function selectGroup(group) {

  if (
    !group ||
    !currentUser
  ) {
    return;
  }

  if (
    typeof group ===
    "string"
  ) {

    group =
      groupCache[group];
  }

  if (!group) {
    return;
  }

  selectedGroup =
    group;

  selectedUser =
    null;

  setGroupHeaderClickable(true);

  clearMessageListener();
  clearPresenceListeners();

  if (chatUserName) {

    chatUserName.textContent =
      group.name;
  }

  if (chatStatus) {

    chatStatus.textContent =
      `${group.memberCount || 0} members`;

    chatStatus.classList.remove(
      "online",
      "offline"
    );
  }

  setAvatarElement(
    chatUserAvatar,
    null,
    "Group"
  );

  if (messageForm) {

    messageForm.classList.remove(
      "hidden"
    );
  }

  listenToMessages(
    "groups/" +
    group.id +
    "/messages",
    true
  );
}


/*
  ============================================================
  MESSAGE LISTENER
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
    async snapshot => {

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

      await renderMessages(
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


/*
  ============================================================
  RENDER MESSAGES
  ============================================================
*/

async function renderMessages(
  messages,
  isGroup
) {

  if (!messagesBox) {
    return;
  }

  if (!messages.length) {

    renderEmptyChat(
      isGroup
        ? "Group conversation"
        : "Private conversation",

      isGroup
        ? "Send a message to the group."
        : "Messages are protected with end-to-end encryption."
    );

    return;
  }

  messagesBox.innerHTML = "";

  for (
    const message of messages
  ) {

    const mine =
      message.senderId ===
      currentUser?.uid;

    const wrapper =
      document.createElement(
        "div"
      );

    wrapper.className =
      "message " +
      (
        mine
          ? "mine"
          : "theirs"
      );

    const bubble =
      document.createElement(
        "div"
      );

    bubble.className =
      "message-bubble";


    /*
      GROUP MESSAGE
    */

    if (isGroup) {

      if (!mine) {

        const sender =
          document.createElement(
            "div"
          );

        sender.className =
          "message-sender";

        sender.textContent =
          message.senderName ||
          "User";

        bubble.appendChild(
          sender
        );
      }

      if (
        message.type ===
        "image" &&
        message.imageUrl
      ) {

        const img =
          document.createElement(
            "img"
          );

        img.src =
          message.imageUrl;

        img.alt =
          message.imageName ||
          "TeamSpace Photo";

        img.addEventListener(
          "click",
          () =>
            openImageViewer(
              message.imageUrl,
              message.imageName
            )
        );

        bubble.appendChild(img);

      } else {

        const text =
          document.createElement(
            "div"
          );

        text.textContent =
          message.body ||
          "";

        bubble.appendChild(text);
      }

    }


    /*
      PRIVATE MESSAGE
    */

    else {

      if (
        message.encrypted ===
        true
      ) {

        let decryptedText =
          "Decrypting...";

        const textElement =
          document.createElement(
            "div"
          );

        textElement.textContent =
          decryptedText;

        bubble.appendChild(
          textElement
        );

        try {

          if (
            message.type ===
            "image"
          ) {

            const imageData =
              await decryptPrivatePhoto(
                message,
                message.senderId
              );

            const img =
              document.createElement(
                "img"
              );

            img.src =
              imageData;

            img.alt =
              message.imageName ||
              "Encrypted photo";

            img.addEventListener(
              "click",
              () =>
                openImageViewer(
                  imageData,
                  message.imageName
                )
            );

            textElement.remove();

            bubble.appendChild(img);

          } else {

            decryptedText =
              await decryptPrivateText(
                message,
                message.senderId
              );

            textElement.textContent =
              decryptedText;
          }

        } catch (error) {

          console.error(
            "Unable to decrypt message:",
            error
          );

          textElement.textContent =
            "🔒 Unable to decrypt this message.";
        }

      } else {

        /*
          Legacy plaintext messages.
        */

        const text =
          document.createElement(
            "div"
          );

        text.textContent =
          message.body ||
          "";

        bubble.appendChild(text);
      }
    }


    /*
      TIMESTAMP
    */

    const meta =
      document.createElement(
        "div"
      );

    meta.className =
      "message-meta";

    meta.textContent =
      formatTime(
        message.createdAt
      );

    bubble.appendChild(meta);


    /*
      ENCRYPTION INDICATOR
    */

    if (
      !isGroup &&
      message.encrypted ===
      true
    ) {

      const security =
        document.createElement(
          "div"
        );

      security.className =
        "e2ee-indicator";

      security.textContent =
        "🔒 End-to-end encrypted";

      bubble.appendChild(
        security
      );
    }

    wrapper.appendChild(
      bubble
    );

    messagesBox.appendChild(
      wrapper
    );
  }

  messagesBox.scrollTop =
    messagesBox.scrollHeight;
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

      if (
        body.length >
        5000
      ) {

        alert(
          "Messages must be 5000 characters or less."
        );

        return;
      }

      const originalBody =
        body;

      messageInput.value =
        "";

      try {

        let messageRef;


        /*
          PRIVATE CHAT
        */

        if (selectedUser) {

          if (
            !encryptionInitialized
          ) {

            await initializeEncryption();
          }

          const encrypted =
            await encryptPrivateText(
              body,
              selectedUser.uid
            );

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

          const message = {

            senderId:
              currentUser.uid,

            senderName:
              currentProfile?.name ||
              currentUser.email,

            type:
              "text",

            encrypted:
              true,

            iv:
              encrypted.iv,

            ciphertext:
              encrypted.ciphertext,

            createdAt:
              firebase.database
                .ServerValue.TIMESTAMP

          };

          await messageRef.set(
            message
          );

          ensureUserInChatList(
            selectedUser
          );
        }


        /*
          GROUP CHAT
        */

        else if (selectedGroup) {

          messageRef =
            db.ref(
              "groups/" +
              selectedGroup.id +
              "/messages"
            ).push();

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

          await messageRef.set(
            message
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
  SEND PHOTO
  ============================================================
*/

async function sendPhoto(file) {

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
    !file.type.startsWith(
      "image/"
    )
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
    imageButton.disabled = true;
  }

  if (uploadStatus) {

    uploadStatus.style.display =
      "block";

    uploadStatus.textContent =
      "Compressing photo...";
  }

  try {

    const compressed =
      await compressImage(file);

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
        selectedUser
          ? "Encrypting photo..."
          : "Sending photo...";
    }

    let messageRef;


    /*
      PRIVATE PHOTO
    */

    if (selectedUser) {

      if (
        !encryptionInitialized
      ) {

        await initializeEncryption();
      }

      const encrypted =
        await encryptPrivatePhoto(
          compressed.dataUrl,
          selectedUser.uid
        );

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

      const message = {

        senderId:
          currentUser.uid,

        senderName:
          currentProfile?.name ||
          currentUser.email,

        type:
          "image",

        encrypted:
          true,

        iv:
          encrypted.iv,

        ciphertext:
          encrypted.ciphertext,

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

      await messageRef.set(
        message
      );

      ensureUserInChatList(
        selectedUser
      );
    }


    /*
      GROUP PHOTO
    */

    else if (selectedGroup) {

      const conversationPath =
        "groups/" +
        selectedGroup.id +
        "/messages";

      messageRef =
        db.ref(
          conversationPath
        ).push();

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

      await messageRef.set(
        message
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
      imageInput.value = "";
    }

    if (imageButton) {
      imageButton.disabled = false;
    }
  }
}


/*
  ============================================================
  IMAGE BUTTON
  ============================================================
*/

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

    await deletePrivateKey(uid);

    await user.delete();

    currentUser = null;
    currentProfile = null;

    selectedUser = null;
    selectedGroup = null;

    availableUsers = [];
    chattedUsers = [];

    groupCache = {};

    encryptionKeyPair = null;
    publicEncryptionKey = null;
    encryptionInitialized = false;

    clearAllListeners();
    stopPresenceListener();

    setGroupHeaderClickable(false);

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
        "🗑 Delete Account";
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

  selectedUser = null;
  selectedGroup = null;

  clearMessageListener();
  clearSelectedPresenceListener();

  setGroupHeaderClickable(false);

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
    chatUserAvatar.innerHTML = "";
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

async function startApp(user) {

  clearAllListeners();

  currentUser =
    user;

  try {

    const profileSnapshot =
      await db.ref(
        "users/" +
        user.uid
      ).once("value");

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


    /*
      Initialize E2EE before private messaging.
    */

    await initializeEncryption();

    updateProfileUI();

    createGroupInterface();

    attachOwnProfileClick();

    showApplication();

    resetChatInterface();

    chattedUsers = [];

    currentWorkspace =
      "chat";

    setWorkspace("chat");

    startPresence();

    listenToUsers();

    listenToGroups();

    await loadChattedUsers();

    renderChatList();

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

      await startApp(user);

    } else {

      stopPresenceListener();

      clearAllListeners();

      currentUser = null;
      currentProfile = null;

      selectedUser = null;
      selectedGroup = null;

      availableUsers = [];
      chattedUsers = [];

      groupCache = {};

      encryptionKeyPair = null;
      publicEncryptionKey = null;
      encryptionInitialized = false;

      currentWorkspace =
        "chat";

      setGroupHeaderClickable(false);

      if (userList) {
        userList.innerHTML = "";
      }

      showAuth();
    }

  }
);


/*
  ============================================================
  APPLICATION INITIALIZATION
  ============================================================
*/

installDynamicStyles();

initializeTheme();

ensureWorkspaceNavigation();

createGroupInterface();