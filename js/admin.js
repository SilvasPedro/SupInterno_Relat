/**
 * ============================================================================
 * ERP GESTÃO DE COLABORADORES - MÓDULO ADMINISTRATIVO (CLEAN VERSION)
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
    updateDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- IMPORTAÇÕES DOS MÓDULOS AUXILIARES ---
import { renderDashboardCharts } from "./charts.js"; // Gráficos
import "./history.js"; // Histórico e Visualização (Carrega as funções globais)

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
                
                // Inicializa os módulos
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
    
    // Se sair da tela de lançamentos, reseta o formulário de edição
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
                        <td>
                            <button onclick="openHistory('${docSnap.id}', '${user.nome}')" style="cursor:pointer;border:none;background:none; color:#007bff; font-weight:bold;">
                                📂 Histórico
                            </button>
                        </td>
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
    
    // 1. Busca dados (se cache vazio)
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
        userStats[uid].accFinalizados += (entry.atendimentosFinalizados || 0); // Ajuste conforme sua regra de negócio para volume
    });

    globalAggregatedData = Object.values(userStats).map(u => ({
        name: u.name,
        avgTmaTel: (u.accTmaTel / u.count).toFixed(2),
        avgTmaChat: (u.accTmaChat / u.count).toFixed(2),
        avgMonitoria: (u.accMonitoria / u.count).toFixed(1),
        avgVolume: (u.accFinalizados / u.count).toFixed(0), 
        totalVolume: u.accFinalizados
    }));

    // 3. Renderiza KPIs (Cards)
    processGlobalKPIs(globalAggregatedData);
    
    // 4. Renderiza Gráficos (Chama o módulo charts.js)
    if (typeof renderDashboardCharts === "function") {
        renderDashboardCharts(globalAggregatedData, allMetricsCache);
    }
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

window.forceDashboardRefresh = async () => {
    allMetricsCache = [];
    resetKpis();
    await loadDashboardData();
    alert("Dados atualizados!");
};

// ============================================================
// 6. MODAL DE DETALHES (DRILL-DOWN DOS KPIS)
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

// ============================================================
// 7. FORMULÁRIOS E CADASTROS
// ============================================================

// Select de Usuários para Métricas
async function loadUserSelectOptions() {
    const select = document.getElementById('metric-user-select');
    if(!select) return;
    select.innerHTML = '<option value="">Selecione...</option>'; 
    
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

// SUBMIT: Métricas (Inserir e Editar)
const formMetrics = document.getElementById('form-metrics');
if (formMetrics) {
    formMetrics.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('metric-user-select').value;
        const weekStart = document.getElementById('metric-date').value;
        
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
                alert("Atualizado com sucesso!");
                resetMetricFormState();
            } else {
                await setDoc(doc(db, "weekly_metrics", `${userId}_${weekStart}`), data);
                alert("Salvo com sucesso!");
                formMetrics.reset();
            }
            allMetricsCache = []; // Limpa cache para atualizar dash
        } catch (e) { alert("Erro: " + e.message); }
    });
}

function resetMetricFormState() {
    isEditingMetric = false;
    editingMetricId = null;
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Salvar Métricas da Semana";
    btn.style.backgroundColor = ""; // Volta cor original
    
    document.getElementById('metric-user-select').disabled = false;
    document.getElementById('metric-date').disabled = false;
    document.getElementById('form-metrics').reset();
}

// SUBMIT: Ocorrências
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
// 8. FUNÇÕES DE SUPORTE AO HISTÓRICO (EDITAR)
// ============================================================
// Esta função é chamada PELO history.js quando clica no lápis
window.prepareEditMetric = async (id) => {
    // Fecha o modal de histórico
    if(typeof closeHistoryModal === 'function') closeHistoryModal();
    else document.getElementById('modal-user-history').style.display = 'none';

    // Busca dados para preencher
    const snap = await getDoc(doc(db, "weekly_metrics", id));
    if(!snap.exists()) return;
    const data = snap.data();
    
    // Muda para tela de lançamentos
    showSection('lancamentos');
    
    // Preenche Campos
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

    // Trava chaves primárias
    document.getElementById('metric-user-select').disabled = true;
    document.getElementById('metric-date').disabled = true;

    // Ativa Modo Edição
    isEditingMetric = true;
    editingMetricId = id;
    
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Atualizar Dados";
    btn.style.backgroundColor = "#ffc107"; // Amarelo
    btn.style.color = "#333";
};

// ============================================================
// 9. RELATÓRIO GERAL DE OCORRÊNCIAS (NOVA FUNCIONALIDADE)
// ============================================================

window.loadAllOccurrences = async () => {
    const tbody = document.getElementById('all-occurrences-body');
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>Carregando todas as ocorrências...</td></tr>";

    try {
        // 1. Busca todas as ocorrências na coleção 'occurrences'
        // Nota: Como o firebase não permite ordenação complexa sem índice composto as vezes,
        // vamos buscar tudo e ordenar via JavaScript para garantir.
        const q = await getDocs(collection(db, "occurrences"));
        
        let allDocs = [];
        q.forEach(docSnap => {
            allDocs.push({ id: docSnap.id, ...docSnap.data() });
        });

        // 2. Ordena pela data (Mais recente primeiro)
        allDocs.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 3. Renderiza na tabela
        tbody.innerHTML = "";

        if (allDocs.length === 0) {
            tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Nenhum registro encontrado no sistema.</td></tr>";
            return;
        }

        allDocs.forEach(item => {
            // Formatação de Data
            const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';
            
            // Definição de Ícones e Cores
            const isPos = item.type === 'positive';
            const typeLabel = isPos 
                ? '<span style="color:#28a745; font-weight:bold;">👍 Elogio</span>' 
                : '<span style="color:#dc3545; font-weight:bold;">👎 Advertência</span>';
            
            // Status de Leitura
            const statusLabel = item.read 
                ? '<span style="color:#28a745; background:#e8f5e9; padding:2px 8px; border-radius:10px; font-size:12px;">Lido</span>' 
                : '<span style="color:#e67e22; background:#fff3e0; padding:2px 8px; border-radius:10px; font-size:12px;">Pendente</span>';

            const row = `
                <tr style="border-left: 4px solid ${isPos ? '#28a745' : '#dc3545'};">
                    <td>${dateFmt}</td>
                    <td><strong>${item.userName || 'Desconhecido'}</strong></td>
                    <td>${typeLabel}</td>
                    <td>${item.title}</td>
                    <td style="font-size: 13px; color: #555; line-height: 1.4;">${item.description}</td>
                    <td>${statusLabel}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });

    } catch (error) {
        console.error("Erro ao carregar relatório:", error);
        tbody.innerHTML = `<tr><td colspan='6' style='color:red; text-align:center;'>Erro ao carregar dados: ${error.message}</td></tr>`;
    }
};