import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getMessaging } from "firebase/messaging";

// Substitua pelos seus dados reais do console
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDyJHliLhSH5Oxq9iS5m1WA2yfFNgfQQAE",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "prodigyapp-73141.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "prodigyapp-73141",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "prodigyapp-73141.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "573565202933",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:573565202933:web:65794d32184aeeab1430bc",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-SLMR72TY9F"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta as instâncias para usar nos componentes
export const db = getFirestore(app);
export const messaging = getMessaging(app);
export const auth = getAuth(app);