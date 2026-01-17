/**
 * ============================================================================
 * ERP GESTÃO DE COLABORADORES - MÓDULO ADMINISTRATIVO COMPLETO
 * Versão: 3.0 (KPIs Específicos e Detalhamento)
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

// 1. CONFIGURAÇÃO (MANTENHA A SUA)
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
let allMetricsCache = [];   // Cache dos dados brutos
let globalAggregatedData = []; // Cache dos dados calculados (Médias)
let isEditingMetric = false; 
let editingMetricId = null;  
let adminChart1 = null;
let adminChart2 = null;

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
                
                // Inicializa Módulos
                loadCollaborators();       
                loadUserSelectOptions();   
                loadOccurrenceUserSelect(); 
                loadDashboardData(); // Carrega os KPIs

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
    
    // Reset form se sair da edição
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

// A. Carregar e Calcular Dados
async function loadDashboardData() {
    console.log("Calculando Dashboard...");
    
    // 1. Busca dados (se cache vazio)
    if (allMetricsCache.length === 0) {
        try {
            const q = await getDocs(collection(db, "weekly_metrics"));
            allMetricsCache = []; 
            q.forEach(doc => allMetricsCache.push(doc.data()));
        } catch (e) { console.error(e); return; }
    }

    if (allMetricsCache.length === 0) { resetKpis(); return; }

    // 2. Agregação por Usuário (Calcula Médias Históricas)
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
                accFinalizados: 0 // Soma de Tel + Chat Finalizados
            };
        }

        userStats[uid].count += 1;
        userStats[uid].accTmaTel += (entry.tmaTelefonia || 0);
        userStats[uid].accTmaChat += (entry.tmaHuggy || 0);
        userStats[uid].accMonitoria += (entry.notaMonitoria || 0);
        userStats[uid].accFinalizados += (entry.atendimentosFinalizados || 0);
    });

    // Gera lista consolidada
    globalAggregatedData = Object.values(userStats).map(u => ({
        name: u.name,
        avgTmaTel: (u.accTmaTel / u.count).toFixed(2),
        avgTmaChat: (u.accTmaChat / u.count).toFixed(2),
        avgMonitoria: (u.accMonitoria / u.count).toFixed(1),
        // Média de volume por semana (Produtividade média semanal)
        // Se quiser volume TOTAL acumulado, tire o / u.count
        avgVolume: (u.accFinalizados / u.count).toFixed(0), 
        totalVolume: u.accFinalizados // Volume total histórico
    }));

    // 3. Renderiza
    processGlobalKPIs(globalAggregatedData);
    // renderGlobalCharts(globalAggregatedData); // (Opcional: se tiver os canvas no HTML)
}

// B. Processar os 6 Cards Específicos
function processGlobalKPIs(users) {
    if(users.length === 0) { resetKpis(); return; }

    // 1. TMA Equipe Telefonia (Média das médias)
    const sumTmaTel = users.reduce((acc, u) => acc + parseFloat(u.avgTmaTel), 0);
    const teamTmaTel = (sumTmaTel / users.length).toFixed(2);
    updateCard('kpi-team-tel', teamTmaTel + " min");

    // 2. TMA Equipe Chat (Média das médias)
    const sumTmaChat = users.reduce((acc, u) => acc + parseFloat(u.avgTmaChat), 0);
    const teamTmaChat = (sumTmaChat / users.length).toFixed(2);
    updateCard('kpi-team-chat', teamTmaChat + " min");

    // 3. Média Finalizados da Equipe (Média de produtividade por agente)
    // Soma o volume total de todos e divide pelo número de agentes
    const grandTotalVol = users.reduce((acc, u) => acc + u.totalVolume, 0);
    const teamAvgVol = (grandTotalVol / users.length).toFixed(0);
    updateCard('kpi-team-vol', teamAvgVol);

    // 4. Melhor Qualidade
    const bestQa = [...users].sort((a, b) => b.avgMonitoria - a.avgMonitoria)[0];
    updateCard('kpi-best-qa', bestQa.avgMonitoria);
    updateCard('kpi-best-qa-name', bestQa.name.split(' ')[0]);

    // 5. Maior TMA Telefonia
    const maxTel = [...users].sort((a, b) => b.avgTmaTel - a.avgTmaTel)[0];
    updateCard('kpi-max-tel', maxTel.avgTmaTel + " min");
    updateCard('kpi-max-tel-name', maxTel.name.split(' ')[0]);

    // 6. Maior TMA Chat
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

// C. Modal de Detalhes (Clique no Card)
window.openDetailModal = (type) => {
    const modal = document.getElementById('modal-kpi-details');
    const title = document.getElementById('modal-kpi-title');
    const tbody = document.getElementById('modal-kpi-body');
    const thVal = document.getElementById('modal-kpi-col-value');
    
    modal.style.display = 'block';
    tbody.innerHTML = "";
    
    let data = [...globalAggregatedData]; // Cópia para ordenar

    // Configuração da Tabela baseada no card clicado
    if (type === 'team-tel') {
        title.innerText = "TMA Telefonia (Todos)";
        thVal.innerText = "Média (min)";
        data.sort((a, b) => b.avgTmaTel - a.avgTmaTel); // Do maior para menor
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

// D. Refresh Manual
window.forceDashboardRefresh = async () => {
    allMetricsCache = [];
    resetKpis();
    await loadDashboardData();
    alert("Dados atualizados!");
};

// ============================================================
// 6. FORMULÁRIOS E CADASTROS (MÉTRICAS E OCORRÊNCIAS)
// ============================================================

// Select de Usuários para Métricas
async function loadUserSelectOptions() {
    const select = document.getElementById('metric-user-select');
    if(!select) return;
    select.innerHTML = '<option value="">Selecione...</option>'; 
    
    // Fallback simples se cache vazio
    const q = await getDocs(collection(db, "users"));
    q.forEach(d => {
        if(d.data().cargo !== 'admin') {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.innerText = d.data().nome;
            select.appendChild(opt);
        }
    });
}

// Select de Usuários para Ocorrências
async function loadOccurrenceUserSelect() {
    const select = document.getElementById('occur-user-select');
    if(!select) return;
    select.innerHTML = '<option value="">Selecione...</option>'; 
    
    // Reutiliza lógica de busca
    const q = await getDocs(collection(db, "users"));
    q.forEach(d => {
        if(d.data().cargo !== 'admin') {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.innerText = d.data().nome;
            select.appendChild(opt);
        }
    });
}

// Submit Métricas
const formMetrics = document.getElementById('form-metrics');
if (formMetrics) {
    formMetrics.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('metric-user-select').value;
        const weekStart = document.getElementById('metric-date').value;
        
        // Pega nome do select
        const sel = document.getElementById('metric-user-select');
        const userName = sel.options[sel.selectedIndex].text;

        const data = {
            userId, userName, weekStart, createdAt: new Date(),
            atendimentosAbertos: Number(document.getElementById('at-abertos').value),
            atendimentosFinalizados: Number(document.getElementById('at-finalizados').value),
            ligacoesRealizadas: Number(document.getElementById('lig-realizadas').value),
            ligacoesRecebidas: Number(document.getElementById('lig-recebidas').value),
            ligacoesPerdidas: Number(document.getElementById('lig-perdidas').value),
            tmeTelefonia: Number(document.getElementById('tme-tel').value),
            tmaTelefonia: Number(document.getElementById('tma-tel').value),
            atendimentosHuggy: Number(document.getElementById('at-huggy').value),
            tmaHuggy: Number(document.getElementById('tma-huggy').value),
            notaMonitoria: Number(document.getElementById('nota-monitoria').value)
        };

        try {
            if (isEditingMetric) {
                await updateDoc(doc(db, "weekly_metrics", editingMetricId), data);
                alert("Atualizado!");
                resetMetricFormState();
            } else {
                await setDoc(doc(db, "weekly_metrics", `${userId}_${weekStart}`), data);
                alert("Salvo!");
                formMetrics.reset();
            }
            // Limpa cache para forçar recálculo na dashboard
            allMetricsCache = [];
        } catch (e) { alert("Erro: " + e.message); }
    });
}

function resetMetricFormState() {
    isEditingMetric = false;
    editingMetricId = null;
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Salvar Métricas";
    btn.style.backgroundColor = "";
    document.getElementById('metric-user-select').disabled = false;
    document.getElementById('metric-date').disabled = false;
    document.getElementById('form-metrics').reset();
}

// Submit Ocorrências
const formOccur = document.getElementById('form-ocorrencias');
if (formOccur) {
    const newForm = formOccur.cloneNode(true);
    formOccur.parentNode.replaceChild(newForm, formOccur);
    
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = document.getElementById('occur-user-select').value;
        const typeEl = document.querySelector('input[name="occur-type"]:checked');
        
        if(!uid || !typeEl) return alert("Preencha todos os campos.");

        try {
            const sel = document.getElementById('occur-user-select');
            await setDoc(doc(collection(db, "occurrences")), {
                userId: uid,
                userName: sel.options[sel.selectedIndex].text,
                date: document.getElementById('occur-date').value,
                type: typeEl.value,
                title: document.getElementById('occur-title').value,
                description: document.getElementById('occur-desc').value,
                read: false, createdAt: new Date()
            });
            alert("Feedback registrado!");
            newForm.reset();
        } catch (e) { alert("Erro: " + e.message); }
    });
}

// ============================================================
// 7. HISTÓRICO GERENCIAL (EDITAR/EXCLUIR)
// ============================================================
window.openHistory = async (uid, nome) => {
    document.getElementById('modal-user-history').style.display = 'block';
    document.getElementById('history-user-name').innerText = "Histórico: " + nome;
    loadHistoryData(uid, 'weekly_metrics', 'history-metrics-list');
    loadHistoryData(uid, 'occurrences', 'history-occurrences-list');
};

window.closeHistoryModal = () => document.getElementById('modal-user-history').style.display = 'none';

async function loadHistoryData(uid, colName, divId) {
    const div = document.getElementById(divId);
    div.innerHTML = "Carregando...";
    const q = query(collection(db, colName), where("userId", "==", uid));
    const snap = await getDocs(q);
    
    if(snap.empty) { div.innerHTML = "<p>Vazio.</p>"; return; }
    
    div.innerHTML = "";
    snap.forEach(d => {
        const data = d.data();
        let title = colName === 'weekly_metrics' ? `Semana ${data.weekStart}` : data.title;
        
        div.innerHTML += `
            <div class="history-item">
                <div class="history-info"><strong>${title}</strong></div>
                <div class="history-actions">
                    ${colName === 'weekly_metrics' ? `<button class="btn-icon btn-edit" onclick="prepareEditMetric('${d.id}')">✏️</button>` : ''}
                    <button class="btn-icon btn-delete" onclick="deleteItem('${colName}', '${d.id}', '${uid}')">🗑️</button>
                </div>
            </div>`;
    });
}

window.deleteItem = async (col, id, uid) => {
    if(confirm("Excluir permanentemente?")) {
        await deleteDoc(doc(db, col, id));
        // Recarrega lista e limpa cache global
        loadHistoryData(uid, col, col === 'weekly_metrics' ? 'history-metrics-list' : 'history-occurrences-list');
        allMetricsCache = []; 
    }
};

window.prepareEditMetric = async (id) => {
    const snap = await getDoc(doc(db, "weekly_metrics", id));
    if(!snap.exists()) return;
    const data = snap.data();
    
    closeHistoryModal();
    showSection('lancamentos');
    
    // Preenche Form
    document.getElementById('metric-user-select').value = data.userId;
    document.getElementById('metric-date').value = data.weekStart;
    document.getElementById('at-abertos').value = data.atendimentosAbertos;
    document.getElementById('at-finalizados').value = data.atendimentosFinalizados;
    document.getElementById('lig-realizadas').value = data.ligacoesRealizadas;
    document.getElementById('lig-recebidas').value = data.ligacoesRecebidas;
    document.getElementById('lig-perdidas').value = data.ligacoesPerdidas;
    document.getElementById('tme-tel').value = data.tmeTelefonia;
    document.getElementById('tma-tel').value = data.tmaTelefonia;
    document.getElementById('at-huggy').value = data.atendimentosHuggy;
    document.getElementById('tma-huggy').value = data.tmaHuggy;
    document.getElementById('nota-monitoria').value = data.notaMonitoria;

    // Bloqueia chaves
    document.getElementById('metric-user-select').disabled = true;
    document.getElementById('metric-date').disabled = true;

    // Modo Edição
    isEditingMetric = true;
    editingMetricId = id;
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Atualizar Dados";
    btn.style.backgroundColor = "#ffc107";
    btn.style.color = "#333";
};