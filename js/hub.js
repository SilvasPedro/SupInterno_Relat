import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getFirestore, collection, getDocs, doc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { 
    getAuth, createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

// Configuração Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCWve8E4PIwEeBf5nATJnFnlJkSe9YkbPE",
    authDomain: "suporte-interno-ece8c.firebaseapp.com",
    projectId: "suporte-interno-ece8c",
    storageBucket: "suporte-interno-ece8c.firebasestorage.app",
    messagingSenderId: "154422890108",
    appId: "1:154422890108:web:efe6f03bc4c55dc11483f9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Cache global para evitar erros de aspas no HTML
window.usersCache = {};

// ============================================================
// 1. CARREGAR GRID DE COLABORADORES
// ============================================================
export async function loadCollaboratorsHub() {
    const grid = document.getElementById('colaboradores-grid');
    if (!grid) return;

    grid.innerHTML = "<p style='padding:20px; color:#666;'>Carregando colaboradores...</p>";

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let usersList = [];
        window.usersCache = {}; // Limpa cache

        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            // Salva no cache global usando o ID como chave
            window.usersCache[docSnap.id] = { id: docSnap.id, ...user };

            if (user.cargo !== 'admin' && user.email !== 'admin@hubdesk.com') {
                usersList.push(window.usersCache[docSnap.id]);
            }
        });

        usersList.sort((a, b) => a.nome.localeCompare(b.nome));

        grid.innerHTML = "";
        
        if (usersList.length === 0) {
            grid.innerHTML = "<p>Nenhum colaborador cadastrado.</p>";
            return;
        }

        usersList.forEach((user) => {
            const initials = user.nome ? user.nome.charAt(0).toUpperCase() : '?';
            const avatarHtml = user.photoUrl 
                ? `<img src="${user.photoUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:3px solid var(--color-cream); margin: 0 auto 10px; display:block;">`
                : `<div class="collab-avatar">${initials}</div>`;

            // AQUI ESTÁ A CORREÇÃO DO BOTÃO:
            // Usamos a classe .btn-edit-card (definida no CSS acima)
            // E passamos apenas o ID para a função buscar do cache
            grid.innerHTML += `
                <div class="collab-card">
                    <button class="btn-edit-card" onclick="window.openEditCollaborator('${user.id}')" title="Editar ${user.nome}">
                        <i class="material-icons" style="font-size: 16px;">edit</i>
                    </button>

                    <div class="collab-header">
                        ${avatarHtml}
                        <div class="collab-name">${user.nome}</div>
                        <div class="collab-role">${user.cargo || 'Sem Cargo'}</div>
                    </div>
                    <div class="collab-body">
                        <span class="collab-dept">${user.departamento || 'Geral'}</span> | 
                        <span style="font-size:11px; color:#666;">${user.turno || 'Turno N/A'}</span>
                        <div class="collab-status">
                            <i class="material-icons" style="font-size:14px;">check_circle</i> Ativo
                        </div>
                    </div>
                    <div class="collab-footer">
                        <button class="btn-view-analysis" onclick="window.openCollaboratorAnalytics('${user.id}', '${user.nome}')">
                            VER ANÁLISE COMPLETA
                        </button>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error("Erro ao carregar Hub:", e);
        grid.innerHTML = "<p>Erro ao carregar lista.</p>";
    }
}

// ============================================================
// 2. CONTROLE DO MODAL (ABRIR/FECHAR)
// ============================================================

window.openNewCollaboratorModal = () => {
    const modal = document.getElementById('modal-novo-colaborador');
    if(!modal) return alert("Erro: Modal não encontrado no HTML");
    
    modal.style.display = 'block';
    document.getElementById('form-colaborador').reset();
    document.getElementById('edit-user-id').value = ""; 
    document.getElementById('modal-colaborador-title').innerText = "Novo Colaborador";
    
    document.getElementById('group-colab-password').style.display = 'block';
    document.getElementById('colab-senha').required = true;
    document.getElementById('colab-email').disabled = false;
};

// Nova função que busca do Cache pelo ID (Segura)
window.openEditCollaborator = (userId) => {
    const user = window.usersCache[userId];
    if (!user) return alert("Erro: Usuário não encontrado no cache.");

    const modal = document.getElementById('modal-novo-colaborador');
    if(!modal) return alert("Erro: Modal não encontrado");

    modal.style.display = 'block';
    document.getElementById('modal-colaborador-title').innerText = "Editar Colaborador";
    document.getElementById('edit-user-id').value = user.id;

    // Preenche campos com verificação de nulo
    document.getElementById('colab-nome').value = user.nome || "";
    document.getElementById('colab-email').value = user.email || "";
    document.getElementById('colab-cargo').value = user.cargo || "";
    document.getElementById('colab-depto').value = user.departamento || "";
    document.getElementById('colab-turno').value = user.turno || "";

    document.getElementById('group-colab-password').style.display = 'none';
    document.getElementById('colab-senha').required = false;
    document.getElementById('colab-email').disabled = true;
};

window.closeCollabModal = () => {
    document.getElementById('modal-novo-colaborador').style.display = 'none';
};

// ============================================================
// 3. SALVAR (Lógica Mantida)
// ============================================================
window.handleSaveCollaborator = async () => {
    const btn = document.getElementById('btn-save-colab');
    const originalText = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const id = document.getElementById('edit-user-id').value;
    const nome = document.getElementById('colab-nome').value;
    const email = document.getElementById('colab-email').value;
    const cargo = document.getElementById('colab-cargo').value;
    const departamento = document.getElementById('colab-depto').value;
    const turno = document.getElementById('colab-turno').value;
    const senha = document.getElementById('colab-senha').value;

    try {
        if (id) {
            // Edição
            const userRef = doc(db, "users", id);
            await updateDoc(userRef, { nome, cargo, departamento, turno });
            alert("Dados atualizados com sucesso!");
        } else {
            // Novo
            if (senha.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
            
            const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
            const newUserId = userCredential.user.uid;

            await setDoc(doc(db, "users", newUserId), {
                nome, email, cargo, departamento, turno,
                createdAt: new Date().toISOString(), photoUrl: ""
            });
            alert("Colaborador cadastrado com sucesso!");
        }

        window.closeCollabModal();
        loadCollaboratorsHub();

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};