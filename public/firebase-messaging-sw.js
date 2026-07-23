// Importa os scripts do Firebase compatíveis com Service Workers
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyDyJHliLhSH5Oxq9iS5m1WA2yfFNgfQQAE",
    authDomain: "prodigyapp-73141.firebaseapp.com",
    projectId: "prodigyapp-73141",
    storageBucket: "prodigyapp-73141.firebasestorage.app",
    messagingSenderId: "573565202933",
    appId: "1:573565202933:web:65794d32184aeeab1430bc",
    measurementId: "G-SLMR72TY9F"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Lida com as notificações quando o app está em SEGUNDO PLANO
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Notificação recebida em segundo plano ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.png' 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});