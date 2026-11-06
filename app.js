import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, query, where, getDocs, deleteDoc, doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

// Replace these placeholder values with the config from Firebase Console.
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

const $ = (id) => document.getElementById(id);
const authSection = $("authSection");
const appSection = $("appSection");
const authForm = $("authForm");
const gallery = $("gallery");
let authMode = "login";
let currentUser = null;

function showMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle("success", success);
}
function setAuthMode(mode) {
  authMode = mode;
  $("loginTab").classList.toggle("active", mode === "login");
  $("signupTab").classList.toggle("active", mode === "signup");
  $("authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  $("authSubtitle").textContent = mode === "login"
    ? "Log in to access your image library."
    : "Sign up to start sharing your images.";
  $("authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  showMessage($("authMessage"), "");
}
$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("signupTab").addEventListener("click", () => setAuthMode("signup"));

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const button = $("authSubmit");
  button.disabled = true;
  showMessage($("authMessage"), "Please wait...");
  try {
    if (authMode === "signup") {
      await createUserWithEmailAndPassword(auth, email, password);
      showMessage($("authMessage"), "Account created successfully.", true);
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    authForm.reset();
  } catch (error) {
    showMessage($("authMessage"), friendlyError(error));
  } finally {
    button.disabled = false;
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/network-request-failed": "Network error. Check your internet connection."
  };
  return messages[error.code] || error.message || "Something went wrong.";
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  authSection.classList.toggle("hidden", !!user);
  appSection.classList.toggle("hidden", !user);
  $("logoutBtn").classList.toggle("hidden", !user);
  if (user) {
    $("userEmail").textContent = user.email;
    await loadImages();
  } else {
    gallery.innerHTML = "";
    $("imageCount").textContent = "0 images";
    $("emptyState").classList.remove("hidden");
  }
});

$("uploadForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const file = $("imageFile").files[0];
  if (!file) return;
  const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    showMessage($("uploadMessage"), "Choose a JPG, PNG, GIF or WebP image.");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showMessage($("uploadMessage"), "Image must be smaller than 5 MB.");
    return;
  }

  const button = $("uploadBtn");
  const progressWrap = $("progressWrap");
  const progressBar = $("progressBar");
  button.disabled = true;
  progressWrap.classList.remove("hidden");
  progressBar.style.width = "25%";
  showMessage($("uploadMessage"), "Uploading image...");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `users/${currentUser.uid}/${Date.now()}_${safeName}`;
  const fileRef = ref(storage, filePath);

  try {
    await uploadBytes(fileRef, file, { contentType: file.type });
    progressBar.style.width = "75%";
    const url = await getDownloadURL(fileRef);
    await addDoc(collection(db, "images"), {
      ownerUid: currentUser.uid,
      name: file.name,
      path: filePath,
      url,
      contentType: file.type,
      size: file.size,
      createdAt: serverTimestamp()
    });
    progressBar.style.width = "100%";
    $("uploadForm").reset();
    showMessage($("uploadMessage"), "Image uploaded successfully!", true);
    await loadImages();
  } catch (error) {
    showMessage($("uploadMessage"), `Upload failed: ${error.message}`);
  } finally {
    button.disabled = false;
    setTimeout(() => progressWrap.classList.add("hidden"), 900);
    setTimeout(() => { progressBar.style.width = "0"; }, 1000);
  }
});

async function loadImages() {
  if (!currentUser) return;
  gallery.innerHTML = "";
  $("emptyState").classList.add("hidden");
  try {
    const q = query(collection(db, "images"), where("ownerUid", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    const images = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    images.sort((a, b) => {
      const at = a.createdAt?.seconds || 0;
      const bt = b.createdAt?.seconds || 0;
      return bt - at;
    });
    $("imageCount").textContent = `${images.length} image${images.length === 1 ? "" : "s"}`;
    if (images.length === 0) $("emptyState").classList.remove("hidden");
    images.forEach(renderImageCard);
  } catch (error) {
    showMessage($("uploadMessage"), `Could not load gallery: ${error.message}`);
  }
}

function renderImageCard(image) {
  const card = document.createElement("article");
  card.className = "image-card";
  const img = document.createElement("img");
  img.src = image.url;
  img.alt = image.name;
  img.loading = "lazy";
  const info = document.createElement("div");
  info.className = "image-info";
  const name = document.createElement("div");
  name.className = "image-name";
  name.textContent = image.name;
  const date = document.createElement("div");
  date.className = "image-date";
  date.textContent = image.createdAt?.toDate
    ? image.createdAt.toDate().toLocaleString()
    : "Recently uploaded";
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const share = document.createElement("button");
  share.className = "button button-light";
  share.textContent = "Copy link";
  share.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(image.url);
      share.textContent = "Copied!";
      setTimeout(() => share.textContent = "Copy link", 1500);
    } catch {
      window.prompt("Copy this image link:", image.url);
    }
  });
  const remove = document.createElement("button");
  remove.className = "button button-danger";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (!confirm(`Delete "${image.name}"?`)) return;
    remove.disabled = true;
    try {
      await deleteObject(ref(storage, image.path));
      await deleteDoc(doc(db, "images", image.id));
      await loadImages();
    } catch (error) {
      alert(`Could not delete image: ${error.message}`);
      remove.disabled = false;
    }
  });
  actions.append(share, remove);
  info.append(name, date, actions);
  card.append(img, info);
  gallery.append(card);
}
