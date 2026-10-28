import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut } from "firebase/auth";

// Tạo project tại https://console.firebase.google.com
// Authentication > Sign-in method > bật Google + Anonymous
// Project settings > Your apps > Web app > copy config vào .env (xem .env.example)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const auth = getAuth(initializeApp(firebaseConfig));
export const loginGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());
export const loginGuest = () => signInAnonymously(auth);
export const logout = () => signOut(auth);
