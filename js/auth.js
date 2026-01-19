import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, sendPasswordResetEmail, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- 1. CONFIGURAÇÃO DO FIREBASE ---
// COPIE E COLE SUA CONFIGURAÇÃO AQUI (Do Console do Firebase)
  const firebaseConfig = {
    apiKey: "AIzaSyCWve8E4PIwEeBf5nATJnFnlJkSe9YkbPE",
    authDomain: "suporte-interno-ece8c.firebaseapp.com",
    projectId: "suporte-interno-ece8c",
    storageBucket: "suporte-interno-ece8c.firebasestorage.app",
    messagingSenderId: "154422890108",
    appId: "1:154422890108:web:efe6f03bc4c55dc11483f9"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- 2. ELEMENTOS DO DOM ---
const loginForm = document.getElementById('login-form');
const loginBox = document.getElementById('login-box');
const firstAccessBox = document.getElementById('first-access-box');
const newPasswordForm = document.getElementById('new-password-form');
const errorMsg = document.getElementById('error-msg');
const forgotPassLink = document.getElementById('forgot-password');

// --- 3. LÓGICA DE LOGIN ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Verificar dados no Firestore
        checkUserStatus(user);

    } catch (error) {
        console.error(error);
        
        // Limpa mensagens anteriores visualmente se necessário
        // (Opcional, mas boa prática)
        
        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            errorMsg.innerText = "E-mail ou senha incorretos.";
        } else if (error.code === 'auth/user-not-found') {
            errorMsg.innerText = "Usuário não encontrado.";
        } else if (error.code === 'auth/too-many-requests') {
            errorMsg.innerText = "Muitas tentativas. Tente novamente mais tarde.";
        } else {
            errorMsg.innerText = "Erro ao entrar: " + error.message;
        }
}});

// --- 4. VERIFICAÇÃO DE STATUS E NÍVEL ---
async function checkUserStatus(user) {
    const userRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
        const userData = docSnap.data();

        // Checagem de Primeiro Acesso
        if (userData.primeiroAcesso === true) {
            // Mostra tela de troca de senha
            loginBox.style.display = 'none';
            firstAccessBox.style.display = 'block';
        } else {
            // Redirecionamento baseado no cargo (Nível de Acesso)
            redirectToDashboard(userData.cargo);
        }
    } else {
        errorMsg.innerText = "Erro: Cadastro não encontrado no banco de dados.";
        // Opcional: Deslogar o usuário se não tiver doc no banco
        signOut(auth);
    }
}

// --- 5. LÓGICA DE TROCA DE SENHA (PRIMEIRO ACESSO) ---
newPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('new-pass').value;
    const confirmPass = document.getElementById('confirm-pass').value;
    const errorBox = document.getElementById('first-access-error');

    if (newPass !== confirmPass) {
        errorBox.innerText = "As senhas não coincidem.";
        return;
    }
    if (newPass.length < 6) {
        errorBox.innerText = "A senha deve ter no mínimo 6 caracteres.";
        return;
    }

    try {
        const user = auth.currentUser;

        // 1. Atualiza senha no Authentication
        await updatePassword(user, newPass);

        // 2. Atualiza flag no Firestore para false
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            primeiroAcesso: false
        });

        alert("Senha atualizada com sucesso!");

        // 3. Re-verifica para redirecionar
        const docSnap = await getDoc(userRef);
        redirectToDashboard(docSnap.data().cargo);

    } catch (error) {
        console.error(error);
        errorBox.innerText = "Erro ao atualizar senha. Tente novamente."; // Geralmente pede re-login se demorar muito
    }
});

// --- 6. FUNÇÃO DE REDIRECIONAMENTO ---
function redirectToDashboard(cargo) {
    if (cargo === 'admin') {
        window.location.href = "admin_dashboard.html"; // Página que criaremos depois
    } else {
        window.location.href = "colaborador_dashboard.html"; // Página que criaremos depois
    }
}

// --- 7. RECUPERAÇÃO DE SENHA ---
forgotPassLink.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    if (!email) {
        errorMsg.innerText = "Preencha o campo de e-mail para recuperar a senha.";
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        alert("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (error) {
        errorMsg.innerText = "Erro ao enviar e-mail: " + error.message;
    }
});