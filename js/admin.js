/**
 * ============================================================================
 * ERP GESTÃO DE COLABORADORES - MÓDULO ADMINISTRATIVO
 * ============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- IMPORTAÇÕES DOS MÓDULOS AUXILIARES ---
import { renderDashboardCharts } from "./charts.js"; 
import "./history.js"; 

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

function timeToSeconds(timeStr) {
    if(!timeStr || typeof timeStr !== 'string') return 0;
    const p = timeStr.split(':');
    let s = 0, m = 1;
    while (p.length > 0) {
        s += m * parseInt(p.pop(), 10);
        m *= 60;
    }
    return s;
}

// ============================================================
// 4. GESTÃO DE COLABORADORES (ORDEM ALFABÉTICA)
// ============================================================
async function loadCollaborators() {
    const listBody = document.getElementById('colaboradores-list');
    listBody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

    try {
        const q = await getDocs(collection(db, "users"));
        
        let usersList = [];

        q.forEach((docSnap) => {
            const user = docSnap.data();
            usersCache[docSnap.id] = user.nome;

            if (user.cargo !== 'admin') { 
                usersList.push({
                    id: docSnap.id,
                    ...user
                });
            }
        });

        usersList.sort((a, b) => a.nome.localeCompare(b.nome));

        listBody.innerHTML = ""; 

        usersList.forEach((user) => {
            listBody.innerHTML += `
                <tr>
                    <td>${user.nome}</td>
                    <td>${user.cargo}</td>
                    <td>${user.departamento || '-'}</td>
                    <td><span style="color:green;font-weight:bold;">Ativo</span></td>
                    <td>
                        <button onclick="openHistory('${user.id}', '${user.nome}')" style="cursor:pointer;border:none;background:none; color:#007bff; font-weight:bold;">
                            📂 Histórico
                        </button>
                    </td>
                </tr>`;
        });

    } catch (e) { 
        console.error(e);
        listBody.innerHTML = "<tr><td colspan='5'>Erro ao carregar.</td></tr>"; 
    }
}

// ============================================================
// 5. DASHBOARD - LÓGICA DE AGREGAÇÃO E KPIs
// ============================================================

async function loadDashboardData() {
    console.log("Calculando Dashboard Completo...");

    // 1. Busca Dados Individuais
    if (allMetricsCache.length === 0) {
        try {
            const q = await getDocs(collection(db, "weekly_metrics"));
            allMetricsCache = []; 
            q.forEach(doc => allMetricsCache.push(doc.data()));
        } catch (e) { console.error(e); return; }
    }

    // 2. Busca Dados do Setor
    let sectorMetrics = [];
    try {
        const qSector = await getDocs(collection(db, "sector_metrics"));
        qSector.forEach(doc => sectorMetrics.push(doc.data()));
        sectorMetrics.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
    } catch (e) { console.error("Erro ao buscar KPIs do setor", e); }


    // 3. Processa KPIs do Setor
    if (sectorMetrics.length > 0) {
        const curr = sectorMetrics[sectorMetrics.length - 1]; 
        const prev = sectorMetrics.length > 1 ? sectorMetrics[sectorMetrics.length - 2] : null; 

        // TMR
        const currTmr = curr.tmr || "--:--";
        const elTmr = document.getElementById('kpi-sector-tmr');
        const trendTmr = document.getElementById('trend-tmr');
        if (elTmr) {
            elTmr.innerText = currTmr;
            elTmr.style.color = "#6f42c1";
            if (prev) {
                const cSec = timeToSeconds(curr.tmr);
                const pSec = timeToSeconds(prev.tmr);
                if (cSec > pSec) {
                    trendTmr.innerHTML = "▲"; trendTmr.style.color = "#dc3545";
                } else if (cSec < pSec) {
                    trendTmr.innerHTML = "▼"; trendTmr.style.color = "#28a745";
                } else {
                    trendTmr.innerHTML = "─"; trendTmr.style.color = "#ccc";
                }
            }
        }

        // FCR
        const currFcr = curr.fcr || 0;
        const elFcr = document.getElementById('kpi-sector-fcr');
        const trendFcr = document.getElementById('trend-fcr');
        if (elFcr) {
            elFcr.innerText = currFcr + "%";
            elFcr.style.color = "#17a2b8";
            if (prev) {
                if (currFcr > prev.fcr) {
                    trendFcr.innerHTML = "▲"; trendFcr.style.color = "#28a745";
                } else if (currFcr < prev.fcr) {
                    trendFcr.innerHTML = "▼"; trendFcr.style.color = "#dc3545";
                } else {
                    trendFcr.innerHTML = "─"; trendFcr.style.color = "#ccc";
                }
            }
        }

        // Reincidência
        const currRein = curr.reincidencia || 0;
        const elRein = document.getElementById('kpi-sector-rein');
        const trendRein = document.getElementById('trend-rein');
        if (elRein) {
            elRein.innerText = currRein + "%";
            elRein.style.color = "#dc3545";
            if (prev) {
                if (currRein > prev.reincidencia) {
                    trendRein.innerHTML = "▲"; trendRein.style.color = "#dc3545";
                } else if (currRein < prev.reincidencia) {
                    trendRein.innerHTML = "▼"; trendRein.style.color = "#28a745";
                } else {
                    trendRein.innerHTML = "─"; trendRein.style.color = "#ccc";
                }
            }
        }
    }

    // 4. Processa Dados da Equipe (CORRIGIDO CÁLCULO DE VOLUME)
    if (allMetricsCache.length === 0) { resetKpis(); return; }

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

        // --- CÁLCULO DE PRODUTIVIDADE ATUALIZADO ---
        // Volume = Chat + Ligações Realizadas + Ligações Recebidas
        const volCalls = (entry.ligacoesRealizadas || 0) + (entry.ligacoesRecebidas || 0);
        const volChat = (entry.atendimentosHuggy || 0);
        const totalVol = volCalls + volChat;

        userStats[uid].count += 1;
        userStats[uid].accTmaTel += (entry.tmaTelefonia || 0);
        userStats[uid].accTmaChat += (entry.tmaHuggy || 0);
        userStats[uid].accMonitoria += (entry.notaMonitoria || 0);
        userStats[uid].accFinalizados += totalVol; // Soma correta
    });

    globalAggregatedData = Object.values(userStats).map(u => ({
        name: u.name,
        avgTmaTel: (u.accTmaTel / u.count).toFixed(2),
        avgTmaChat: (u.accTmaChat / u.count).toFixed(2),
        avgMonitoria: (u.accMonitoria / u.count).toFixed(1),
        avgVolume: (u.accFinalizados / u.count).toFixed(0), 
        totalVolume: u.accFinalizados
    }));

    processGlobalKPIs(globalAggregatedData);
    
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
    if(bestQa){
        updateCard('kpi-best-qa', bestQa.avgMonitoria);
        updateCard('kpi-best-qa-name', bestQa.name.split(' ')[0]);
    }

    const maxTel = [...users].sort((a, b) => b.avgTmaTel - a.avgTmaTel)[0];
    if(maxTel){
        updateCard('kpi-max-tel', maxTel.avgTmaTel + " min");
        updateCard('kpi-max-tel-name', maxTel.name.split(' ')[0]);
    }

    const maxChat = [...users].sort((a, b) => b.avgTmaChat - a.avgTmaChat)[0];
    if(maxChat){
        updateCard('kpi-max-chat', maxChat.avgTmaChat + " min");
        updateCard('kpi-max-chat-name', maxChat.name.split(' ')[0]);
    }
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
// 6. MODAL DE DETALHES
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

async function loadUserSelectOptions() {
    const select = document.getElementById('metric-user-select');
    if(!select) return;
    
    // Limpa e mantém a opção padrão
    select.innerHTML = '<option value="">Selecione...</option>'; 
    
    try {
        const q = await getDocs(collection(db, "users"));
        
        // 1. Cria lista temporária
        let usersList = [];
        
        q.forEach(d => {
            const data = d.data();
            // Filtra admins fora da lista e adiciona ao array
            if(data.cargo !== 'admin') {
                usersList.push({
                    id: d.id,
                    nome: data.nome
                });
            }
        });

        // 2. Ordena a lista (A-Z)
        usersList.sort((a, b) => a.nome.localeCompare(b.nome));

        // 3. Adiciona as opções ordenadas no HTML
        usersList.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.innerText = user.nome;
            select.appendChild(opt);
        });

    } catch (error) {
        console.error("Erro ao carregar lista de usuários:", error);
    }
}

// Select de Usuários para Ocorrências (COM ORDEM ALFABÉTICA)
async function loadOccurrenceUserSelect() {
    const select = document.getElementById('occur-user-select');
    if(!select) return;
    
    select.innerHTML = '<option value="">Selecione...</option>'; 
    
    try {
        const q = await getDocs(collection(db, "users"));
        
        // 1. Cria lista temporária
        let usersList = [];
        
        q.forEach(d => {
            const data = d.data();
            if(data.cargo !== 'admin') {
                usersList.push({
                    id: d.id,
                    nome: data.nome
                });
            }
        });

        // 2. Ordena a lista (A-Z)
        usersList.sort((a, b) => a.nome.localeCompare(b.nome));

        // 3. Adiciona as opções ordenadas no HTML
        usersList.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.innerText = user.nome;
            select.appendChild(opt);
        });

    } catch (error) {
        console.error("Erro ao carregar lista de ocorrências:", error);
    }
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
            // Totais
            atendimentosAbertos: Number(document.getElementById('at-abertos').value),
            atendimentosFinalizados: Number(document.getElementById('at-finalizados').value),
            
            // Telefonia
            ligacoesRealizadas: Number(document.getElementById('lig-realizadas').value || 0),
            ligacoesRecebidas: Number(document.getElementById('lig-recebidas').value || 0),
            ligacoesPerdidas: Number(document.getElementById('lig-perdidas').value || 0),
            tmeTelefonia: Number(document.getElementById('tme-tel').value || 0),
            tmaTelefonia: Number(document.getElementById('tma-tel').value),
            
            // Chat
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
            allMetricsCache = []; 
        } catch (e) { alert("Erro: " + e.message); }
    });
}

// SUBMIT DOS KPIs DO SETOR
const formSector = document.getElementById('form-sector-metrics');
if (formSector) {
    formSector.addEventListener('submit', async (e) => {
        e.preventDefault();
        const weekStart = document.getElementById('sector-date').value;
        
        const data = {
            weekStart, 
            createdAt: new Date(),
            tmr: document.getElementById('kpi-tmr').value,
            fcr: Number(document.getElementById('kpi-fcr').value),
            reincidencia: Number(document.getElementById('kpi-reincidencia').value)
        };

        try {
            await setDoc(doc(db, "sector_metrics", weekStart), data);
            alert("KPIs do Setor salvos com sucesso!");
            formSector.reset();
        } catch (e) { alert("Erro ao salvar KPIs do Setor: " + e.message); }
    });
}

function resetMetricFormState() {
    isEditingMetric = false;
    editingMetricId = null;
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Salvar Métricas da Semana";
    btn.style.backgroundColor = ""; 
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
window.prepareEditMetric = async (id) => {
    if(typeof closeHistoryModal === 'function') closeHistoryModal();
    else document.getElementById('modal-user-history').style.display = 'none';

    const snap = await getDoc(doc(db, "weekly_metrics", id));
    if(!snap.exists()) return;
    const data = snap.data();
    
    showSection('lancamentos');
    
    // Dados Básicos
    document.getElementById('metric-user-select').value = data.userId;
    document.getElementById('metric-date').value = data.weekStart;
    
    // Totais
    document.getElementById('at-abertos').value = data.atendimentosAbertos;
    document.getElementById('at-finalizados').value = data.atendimentosFinalizados;
    
    // Telefonia (Novos Campos Visíveis)
    document.getElementById('lig-recebidas').value = data.ligacoesRecebidas || 0;
    document.getElementById('lig-realizadas').value = data.ligacoesRealizadas || 0;
    document.getElementById('lig-perdidas').value = data.ligacoesPerdidas || 0;
    document.getElementById('tma-tel').value = data.tmaTelefonia;
    document.getElementById('tme-tel').value = data.tmeTelefonia || 0;
    
    // Chat
    document.getElementById('at-huggy').value = data.atendimentosHuggy;
    document.getElementById('tma-huggy').value = data.tmaHuggy;
    document.getElementById('nota-monitoria').value = data.notaMonitoria;
    
    document.getElementById('metric-user-select').disabled = true;
    document.getElementById('metric-date').disabled = true;

    isEditingMetric = true;
    editingMetricId = id;
    
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Atualizar Dados";
    btn.style.backgroundColor = "#ffc107";
    btn.style.color = "#333";
};

// ============================================================
// 9. RELATÓRIOS E NOVAS FUNÇÕES
// ============================================================

window.loadAllOccurrences = async () => {
    const tbody = document.getElementById('all-occurrences-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='6' style='text-align:center; padding:20px;'>Carregando...</td></tr>";

    try {
        const q = await getDocs(collection(db, "occurrences"));
        let allDocs = [];
        q.forEach(docSnap => {
            allDocs.push({ id: docSnap.id, ...docSnap.data() });
        });
        allDocs.sort((a, b) => new Date(b.date) - new Date(a.date));

        tbody.innerHTML = "";
        if (allDocs.length === 0) {
            tbody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Nenhum registro.</td></tr>";
            return;
        }

        allDocs.forEach(item => {
            const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';
            
            // --- ATUALIZAÇÃO PARA SUPORTE AO NEUTRO ---
            let typeLabel, rowStyle;
            if (item.type === 'positive') {
                typeLabel = '<span style="color:#28a745; font-weight:bold;">👍 Elogio</span>';
                rowStyle = 'border-left: 4px solid #28a745;';
            } else if (item.type === 'neutral') {
                typeLabel = '<span style="color:#6c757d; font-weight:bold;">ℹ️ Informativo</span>';
                rowStyle = 'border-left: 4px solid #6c757d;';
            } else {
                typeLabel = '<span style="color:#dc3545; font-weight:bold;">👎 Advertência</span>';
                rowStyle = 'border-left: 4px solid #dc3545;';
            }
            // -------------------------------------------

            const statusLabel = item.read ? '<span style="color:#28a745;">Lido</span>' : '<span style="color:#e67e22;">Pendente</span>';

            const row = `
                <tr style="${rowStyle}">
                    <td>${dateFmt}</td>
                    <td><strong>${item.userName || 'Desconhecido'}</strong></td>
                    <td>${typeLabel}</td>
                    <td>${item.title}</td>
                    <td style="font-size: 13px; color: #555;">${item.description}</td>
                    <td>${statusLabel}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        });
    } catch (error) { console.error(error); }
};

window.loadRelatorioDetalhado = async () => {
    const container = document.getElementById('relatorio-detalhado-content');
    const selectFilter = document.getElementById('filter-date-select');
    if (!container) return;
    container.innerHTML = "<p style='padding:20px; text-align:center;'>Carregando dados...</p>";

    if (allMetricsCache.length === 0) await loadDashboardData(); 

    const uniqueDates = [...new Set(allMetricsCache.map(item => item.weekStart))];
    uniqueDates.sort((a, b) => new Date(b) - new Date(a));
    
    selectFilter.innerHTML = `<option value="all">Todas as Datas</option>`;
    uniqueDates.forEach(date => {
        const dateFormatted = date.split('-').reverse().join('/');
        const option = document.createElement('option');
        option.value = date;
        option.innerText = `Semana de ${dateFormatted}`;
        selectFilter.appendChild(option);
    });
    
    renderDetailedContent();
};

window.renderDetailedContent = () => {
    const container = document.getElementById('relatorio-detalhado-content');
    const filterValue = document.getElementById('filter-date-select').value;
    container.innerHTML = "";

    let filteredData = allMetricsCache;
    if (filterValue !== 'all') filteredData = allMetricsCache.filter(item => item.weekStart === filterValue);

    const groups = {};
    filteredData.forEach(metric => {
        if (!groups[metric.weekStart]) groups[metric.weekStart] = [];
        groups[metric.weekStart].push(metric);
    });

    const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

    sortedDates.forEach(date => {
        const records = groups[date];
        records.sort((a, b) => a.userName.localeCompare(b.userName));
        const dataFormatada = date.split('-').reverse().join('/');

        const blockHtml = `
            <div class="metric-card" style="margin-bottom: 30px; padding: 20px; border-left: 5px solid var(--color-dark-brown);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    <h3 style="color: var(--color-dark-brown); margin:0;">🗓️ ${dataFormatada}</h3>
                    <span style="font-size:12px; background:#f0f0f0; padding:4px 8px; border-radius:4px;">${records.length} Colaboradores</span>
                </div>
                <div style="overflow-x: auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Colaborador</th>
                                <th>Monitoria</th>
                                <th>TMA Tel</th>
                                <th>TMA Chat</th>
                                <th>Vol. Total</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${records.map(r => {
                                // CORREÇÃO AQUI TAMBÉM NO RELATÓRIO
                                const volCalls = (r.ligacoesRealizadas || 0) + (r.ligacoesRecebidas || 0);
                                const totalCalculado = volCalls + (r.atendimentosHuggy || 0);
                                
                                return `
                                <tr>
                                    <td><strong>${r.userName}</strong></td>
                                    <td>${r.notaMonitoria}</td>
                                    <td>${r.tmaTelefonia || '--'}</td>
                                    <td>${r.tmaHuggy || '--'}</td>
                                    <td>${totalCalculado}</td>
                                    <td>
                                        <button onclick="viewMetricDetailAdmin('${r.id || (r.userId + '_' + r.weekStart)}')" 
                                            class="action-btn btn-view" style="width:30px; height:30px; background:var(--color-taupe);">
                                            <i class="material-icons" style="font-size:16px;">visibility</i>
                                        </button>
                                    </td>
                                </tr>
                            `}).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        container.innerHTML += blockHtml;
    });
};

// FUNÇÃO DE VISUALIZAÇÃO DO ADMIN (CORRIGIDA)
// Substitua a função viewMetricDetailAdmin existente por esta versão melhorada

window.viewMetricDetailAdmin = async (docId) => {
    const modal = document.getElementById('modal-metric-view-admin');
    const content = document.getElementById('admin-metric-view-content');
    
    modal.style.display = 'block';
    content.innerHTML = "<div style='padding:20px; text-align:center; color:#666;'><i class='material-icons spinning'>sync</i> Buscando dados...</div>";

    try {
        // Tenta buscar na coleção de métricas semanais
        const ref = doc(db, "weekly_metrics", docId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            content.innerHTML = "<p style='color:red; text-align:center;'>Erro: Documento não encontrado.</p>";
            return;
        }

        const data = snap.data();
        const dataFmt = data.weekStart ? data.weekStart.split('-').reverse().join('/') : 'Data Inválida';
        
        // --- CÁLCULOS ---
        const ligRecebidas = data.ligacoesRecebidas || 0;
        const ligRealizadas = data.ligacoesRealizadas || 0;
        const ligPerdidas = data.ligacoesPerdidas || 0;
        const volChat = data.atendimentosHuggy || 0;
        
        // Total Finalizado = (Ligações Atendidas + Realizadas) + Chat
        // Nota: Não somamos perdidas no "finalizado" produtivos
        const totalFinalizados = (ligRecebidas + ligRealizadas) + volChat;
        
        const abertos = data.atendimentosAbertos || 0;

        // --- LAYOUT ---
        content.innerHTML = `
            <div style="grid-column: span 2; margin-bottom: 10px; text-align: center;">
                <h3 style="color: var(--color-dark-brown); margin: 0;">Resumo da Semana ${dataFmt}</h3>
            </div>

            <div style="grid-column: span 2; display: flex; gap: 15px; margin-bottom: 20px;">
                
                <div style="flex: 1; background: #e3f2fd; border: 1px solid #bbdefb; border-radius: 8px; padding: 15px; text-align: center;">
                    <h4 style="color: #0d47a1; margin-bottom: 5px; font-size: 14px; text-transform: uppercase;">📂 Atendimentos Abertos</h4>
                    <span style="font-size: 28px; font-weight: bold; color: #0d47a1;">${abertos}</span>
                    <p style="font-size: 12px; color: #5472d3; margin-top: 5px;">Novos chamados iniciados</p>
                </div>

                <div style="flex: 1; background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; padding: 15px; text-align: center;">
                    <h4 style="color: #1b5e20; margin-bottom: 5px; font-size: 14px; text-transform: uppercase;">✅ Total Atendimentos</h4>
                    <span style="font-size: 28px; font-weight: bold; color: #1b5e20;">${totalFinalizados}</span>
                    <p style="font-size: 12px; color: #2e7d32; margin-top: 5px;">Soma (Tel + Chat)</p>
                </div>
            </div>

            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee; border-left: 5px solid #007bff; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;">
                    <h4 style="color: #007bff; margin:0; display:flex; align-items:center; gap:5px;">
                        <i class="material-icons" style="font-size:20px;">phone</i> Telefonia
                    </h4>
                    <span style="font-size:12px; background:#e3f2fd; color:#007bff; padding:2px 8px; border-radius:10px;">Total: ${ligRecebidas + ligRealizadas}</span>
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:14px; color:#555;">
                    <div>Recebidas: <b style="color:#333;">${ligRecebidas}</b></div>
                    <div>Realizadas: <b style="color:#333;">${ligRealizadas}</b></div>
                </div>
                
                <div style="margin-top:10px; font-size:14px; color:#555;">
                    Perdidas: <span style="color:${ligPerdidas > 0 ? '#dc3545' : '#ccc'}; font-weight:bold;">${ligPerdidas}</span>
                </div>

                <hr style="border:0; border-top:1px dashed #ddd; margin:15px 0;">
                
                <div style="display:flex; justify-content:space-between; text-align:center;">
                    <div>
                        <small style="color:#999;">TMA</small><br>
                        <strong style="color:#333; font-size:16px;">${data.tmaTelefonia || 0}</strong> <small>min</small>
                    </div>
                    <div>
                        <small style="color:#999;">TME</small><br>
                        <strong style="color:#333; font-size:16px;">${data.tmeTelefonia || 0}</strong> <small>seg</small>
                    </div>
                </div>
            </div>

            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee; border-left: 5px solid #28a745; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;">
                    <h4 style="color: #28a745; margin:0; display:flex; align-items:center; gap:5px;">
                        <i class="material-icons" style="font-size:20px;">chat</i> Chat
                    </h4>
                    <span style="font-size:12px; background:#e8f5e9; color:#28a745; padding:2px 8px; border-radius:10px;">Total: ${volChat}</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span style="color:#555;">Vol. Huggy:</span>
                    <strong style="font-size:18px; color:#333;">${volChat}</strong>
                </div>

                 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span style="color:#555;">TMA Chat:</span>
                    <strong>${data.tmaHuggy || 0} <small style="font-weight:normal;">min</small></strong>
                </div>

                <hr style="border:0; border-top:1px dashed #ddd; margin:15px 0;">

                <div style="background: #f9f9f9; padding:10px; border-radius:6px; text-align:center;">
                    <small style="color:#666; text-transform:uppercase;">Nota de Monitoria</small><br>
                    <span style="font-size: 24px; font-weight: bold; color: ${data.notaMonitoria >= 90 ? '#28a745' : (data.notaMonitoria >= 70 ? '#ffc107' : '#dc3545')}">
                        ${data.notaMonitoria || 0}
                    </span>
                </div>
            </div>
        `;

    } catch (e) {
        console.error(e);
        content.innerHTML = "<p>Erro ao carregar detalhes: " + e.message + "</p>";
    }
};

// ============================================================
// 10. HISTÓRICO DE KPIs DO SETOR
// ============================================================
window.loadSectorHistory = async () => {
    const tbody = document.getElementById('sector-history-body');
    if(!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";
    try {
        const q = await getDocs(collection(db, "sector_metrics"));
        let docs = [];
        q.forEach(doc => docs.push(doc.data()));
        docs.sort((a,b) => new Date(b.weekStart) - new Date(a.weekStart));
        tbody.innerHTML = "";
        if(docs.length === 0){ tbody.innerHTML = "<tr><td colspan='5'>Nenhum KPI de setor lançado.</td></tr>"; return; }
        docs.forEach(d => {
            const dateFmt = d.weekStart.split('-').reverse().join('/');
            tbody.innerHTML += `<tr><td>${dateFmt}</td><td style="color:#6f42c1; font-weight:bold;">${d.tmr}</td><td style="color:#17a2b8;">${d.fcr}%</td><td style="color:#dc3545;">${d.reincidência || d.reincidencia}%</td><td style="display:flex; gap:10px;"><button onclick="prepareEditSectorKPI('${d.weekStart}')" class="action-btn btn-edit"><i class="material-icons">edit</i></button><button onclick="deleteSectorKPI('${d.weekStart}')" class="action-btn btn-delete"><i class="material-icons">delete</i></button></td></tr>`;
        });
    } catch(e) { console.error(e); tbody.innerHTML = "<tr><td colspan='5'>Erro ao carregar lista.</td></tr>"; }
}
window.deleteSectorKPI = async (id) => { if(!confirm("Tem certeza?")) return; try { await deleteDoc(doc(db, "sector_metrics", id)); alert("Excluído!"); loadSectorHistory(); loadDashboardData(); } catch(e) { alert("Erro: " + e.message); } }
window.prepareEditSectorKPI = async (id) => { try { const docSnap = await getDoc(doc(db, "sector_metrics", id)); if(!docSnap.exists()) return; const data = docSnap.data(); showSection('lancamentos'); document.getElementById('sector-date').value = data.weekStart; document.getElementById('kpi-tmr').value = data.tmr; document.getElementById('kpi-fcr').value = data.fcr; document.getElementById('kpi-reincidencia').value = data.reincidência || data.reincidencia; alert(`Dados da semana ${data.weekStart} carregados.`); window.scrollTo(0,0); } catch(e) { console.error(e); } }