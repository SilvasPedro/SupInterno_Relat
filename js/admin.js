/**
 * ============================================================================
 * ERP GESTÃO DE COLABORADORES - MÓDULO ADMINISTRATIVO
 * ============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    getDoc, 
    deleteDoc, 
    updateDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// IMPORTAÇÃO DOS GRÁFICOS (ESSENCIAL)
import { renderDashboardCharts } from "./charts.js";

// 1. CONFIGURAÇÃO
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
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

// --- ESTADO GLOBAL ---
let usersCache = {};        
let allMetricsCache = [];   
let globalAggregatedData = []; 
let isEditingMetric = false; 
let editingMetricId = null;  

// ============================================================
// 2. AUTH & INICIALIZAÇÃO
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);
            
            if (docSnap.exists() && docSnap.data().cargo === 'admin') {
                document.getElementById('admin-name').innerText = "Gestor: " + (docSnap.data().nome || "Admin");
                
                loadCollaborators();       
                loadUserSelectOptions();   
                loadOccurrenceUserSelect(); 
                loadDashboardData(); 

            } else {
                alert("Acesso restrito.");
                await signOut(auth);
                window.location.href = "index.html";
            }
        } catch (error) {
            console.error("Erro auth:", error);
        }
    } else {
        window.location.href = "index.html";
    }
});

// ============================================================
// 3. UTILITÁRIOS GERAIS
// ============================================================
window.showSection = (sectionId) => {
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('section-' + sectionId);
    if(target) target.style.display = 'block';
    if (sectionId !== 'lancamentos' && isEditingMetric) resetMetricFormState();
};

window.openModal = () => document.getElementById('modal-new-user').style.display = 'block';
window.closeModal = () => document.getElementById('modal-new-user').style.display = 'none';

window.logout = () => {
    if(confirm("Sair do sistema?")) signOut(auth).then(() => window.location.href = "index.html");
};

// ============================================================
// 4. GESTÃO DE COLABORADORES
// ============================================================
async function loadCollaborators() {
    const listBody = document.getElementById('colaboradores-list');
    listBody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

    try {
        const q = await getDocs(collection(db, "users"));
        listBody.innerHTML = ""; 

        q.forEach((docSnap) => {
            const user = docSnap.data();
            usersCache[docSnap.id] = user.nome;

            if (user.cargo !== 'admin') { 
                listBody.innerHTML += `
                    <tr>
                        <td>${user.nome}</td>
                        <td>${user.cargo}</td>
                        <td>${user.departamento || '-'}</td>
                        <td><span style="color:green;font-weight:bold;">Ativo</span></td>
                        <td><button onclick="openHistory('${docSnap.id}', '${user.nome}')" style="cursor:pointer;border:none;background:none;">📂 Histórico</button></td>
                    </tr>`;
            }
        });
    } catch (e) { listBody.innerHTML = "<tr><td colspan='5'>Erro ao carregar.</td></tr>"; }
}

const formAddUser = document.getElementById('form-add-user');
if (formAddUser) {
    formAddUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nome = document.getElementById('new-name').value;
        const email = document.getElementById('new-email').value;
        const cargo = document.getElementById('new-cargo').value;
        const dept = document.getElementById('new-dept').value;

        try {
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, "mudar123");
            await setDoc(doc(db, "users", userCred.user.uid), {
                nome, email, cargo, departamento: dept, primeiroAcesso: true, dataCadastro: new Date()
            });
            alert("Cadastrado com sucesso!");
            closeModal();
            loadCollaborators();
            loadUserSelectOptions();
            loadOccurrenceUserSelect();
            signOut(secondaryAuth);
        } catch (error) { alert("Erro: " + error.message); }
    });
}

// ============================================================
// 5. DASHBOARD - LÓGICA DE AGREGAÇÃO E KPIs
// ============================================================

async function loadDashboardData() {
    console.log("Calculando Dashboard...");
    
    // 1. Busca dados
    if (allMetricsCache.length === 0) {
        try {
            const q = await getDocs(collection(db, "weekly_metrics"));
            allMetricsCache = []; 
            q.forEach(doc => allMetricsCache.push(doc.data()));
        } catch (e) { console.error(e); return; }
    }

    if (allMetricsCache.length === 0) { resetKpis(); return; }

    // 2. Agregação por Usuário
    const userStats = {};

    allMetricsCache.forEach(entry => {
        const uid = entry.userId;
        const name = entry.userName;

        if (!userStats[uid]) {
            userStats[uid] = {
                name: name,
                count: 0,
                accTmaTel: 0,
                accTmaChat: 0,
                accMonitoria: 0,
                accFinalizados: 0
            };
        }

        userStats[uid].count += 1;
        userStats[uid].accTmaTel += (entry.tmaTelefonia || 0);
        userStats[uid].accTmaChat += (entry.tmaHuggy || 0);
        userStats[uid].accMonitoria += (entry.notaMonitoria || 0);
        userStats[uid].accFinalizados += (entry.atendimentosFinalizados || 0);
    });

    globalAggregatedData = Object.values(userStats).map(u => ({
        name: u.name,
        avgTmaTel: (u.accTmaTel / u.count).toFixed(2),
        avgTmaChat: (u.accTmaChat / u.count).toFixed(2),
        avgMonitoria: (u.accMonitoria / u.count).toFixed(1),
        avgVolume: (u.accFinalizados / u.count).toFixed(0), 
        totalVolume: u.accFinalizados
    }));

    // 3. Renderiza KPIs
    processGlobalKPIs(globalAggregatedData);
    
    // 4. Renderiza Gráficos (CHAMADA CORRIGIDA)
    renderDashboardCharts(globalAggregatedData, allMetricsCache);
}

function processGlobalKPIs(users) {
    if(users.length === 0) { resetKpis(); return; }

    const sumTmaTel = users.reduce((acc, u) => acc + parseFloat(u.avgTmaTel), 0);
    const teamTmaTel = (sumTmaTel / users.length).toFixed(2);
    updateCard('kpi-team-tel', teamTmaTel + " min");

    const sumTmaChat = users.reduce((acc, u) => acc + parseFloat(u.avgTmaChat), 0);
    const teamTmaChat = (sumTmaChat / users.length).toFixed(2);
    updateCard('kpi-team-chat', teamTmaChat + " min");

    const grandTotalVol = users.reduce((acc, u) => acc + u.totalVolume, 0);
    const teamAvgVol = (grandTotalVol / users.length).toFixed(0);
    updateCard('kpi-team-vol', teamAvgVol);

    const bestQa = [...users].sort((a, b) => b.avgMonitoria - a.avgMonitoria)[0];
    updateCard('kpi-best-qa', bestQa.avgMonitoria);
    updateCard('kpi-best-qa-name', bestQa.name.split(' ')[0]);

    const maxTel = [...users].sort((a, b) => b.avgTmaTel - a.avgTmaTel)[0];
    updateCard('kpi-max-tel', maxTel.avgTmaTel + " min");
    updateCard('kpi-max-tel-name', maxTel.name.split(' ')[0]);

    const maxChat = [...users].sort((a, b) => b.avgTmaChat - a.avgTmaChat)[0];
    updateCard('kpi-max-chat', maxChat.avgTmaChat + " min");
    updateCard('kpi-max-chat-name', maxChat.name.split(' ')[0]);
}

function updateCard(id, val) {
    const el = document.getElementById(id);
    if(el) el.innerText = val;
}

function resetKpis() {
    ['kpi-team-tel','kpi-team-chat','kpi-team-vol','kpi-best-qa','kpi-max-tel','kpi-max-chat'].forEach(id => updateCard(id, '--'));
}

// ============================================================
// 6. MODAL DE DETALHES & OUTRAS FUNÇÕES
// ============================================================
window.openDetailModal = (type) => {
    const modal = document.getElementById('modal-kpi-details');
    const title = document.getElementById('modal-kpi-title');
    const tbody = document.getElementById('modal-kpi-body');
    const thVal = document.getElementById('modal-kpi-col-value');
    
    modal.style.display = 'block';
    tbody.innerHTML = "";
    
    let data = [...globalAggregatedData];

    if (type === 'team-tel') {
        title.innerText = "TMA Telefonia (Todos)";
        thVal.innerText = "Média (min)";
        data.sort((a, b) => b.avgTmaTel - a.avgTmaTel);
        data.forEach(u => appendRow(tbody, u.name, u.avgTmaTel));
    
    } else if (type === 'team-chat') {
        title.innerText = "TMA Chat (Todos)";
        thVal.innerText = "Média (min)";
        data.sort((a, b) => b.avgTmaChat - a.avgTmaChat);
        data.forEach(u => appendRow(tbody, u.name, u.avgTmaChat));

    } else if (type === 'team-vol') {
        title.innerText = "Volume Total Acumulado";
        thVal.innerText = "Total Atendimentos";
        data.sort((a, b) => b.totalVolume - a.totalVolume);
        data.forEach(u => appendRow(tbody, u.name, u.totalVolume));

    } else if (type === 'best-qa') {
        title.innerText = "Ranking de Qualidade";
        thVal.innerText = "Nota Média";
        data.sort((a, b) => b.avgMonitoria - a.avgMonitoria);
        data.forEach((u, i) => appendRow(tbody, `${i+1}º ${u.name}`, u.avgMonitoria, i===0));

    } else if (type === 'max-tel') {
        title.innerText = "Ranking TMA Telefonia (Ofensores)";
        thVal.innerText = "Tempo Médio";
        data.sort((a, b) => b.avgTmaTel - a.avgTmaTel);
        data.forEach((u, i) => appendRow(tbody, u.name, u.avgTmaTel, i===0));

    } else if (type === 'max-chat') {
        title.innerText = "Ranking TMA Chat (Ofensores)";
        thVal.innerText = "Tempo Médio";
        data.sort((a, b) => b.avgTmaChat - a.avgTmaChat);
        data.forEach((u, i) => appendRow(tbody, u.name, u.avgTmaChat, i===0));
    }
};

function appendRow(tbody, name, val, isHighlight=false) {
    const style = isHighlight ? "color:var(--color-main-red); font-weight:bold;" : "";
    tbody.innerHTML += `<tr><td>${name}</td><td style="${style}">${val}</td></tr>`;
}

window.forceDashboardRefresh = async () => {
    allMetricsCache = [];
    resetKpis();
    await loadDashboardData();
    alert("Dados atualizados!");
};

// ... (MANTENHA O RESTO DAS FUNÇÕES DE CADASTRO E HISTÓRICO IGUAIS AO ARQUIVO ANTERIOR) ...
// (Para economizar espaço aqui, as funções loadUserSelectOptions, loadOccurrenceUserSelect, 
// submits de formulário e histórico não foram alteradas e devem continuar no arquivo).
// Certifique-se de copiar as funções de formulário que estavam no código anterior.

// SE PRECISAR DAS FUNÇÕES FINAIS NOVAMENTE, ME AVISE.