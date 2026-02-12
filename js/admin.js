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

// --- MÓDULOS EXTERNOS ---
import { renderDashboardCharts } from "./charts.js";
import "./history.js"; // Mantém compatibilidade com histórico legado
import { loadCollaboratorsHub } from "./hub.js"; // <--- NOVO HUB DE CARDS

// 1. CONFIGURAÇÃO FIREBASE
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
let allMetricsCache = [];
let globalAggregatedData = [];
let isEditingMetric = false;
let editingMetricId = null;
let occurrencesCache = [];
let chart3PStatusInstance = null;
let chart3PTimelineInstance = null;

// ============================================================
// 2. AUTH & INICIALIZAÇÃO
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            if (docSnap.exists() && docSnap.data().cargo === 'admin') {
                const adminEl = document.getElementById('admin-name');
                if (adminEl) adminEl.innerText = "Gestor: " + (docSnap.data().nome || "Admin");

                // Carregamentos iniciais
                loadUserSelectOptions();
                loadOccurrenceUserSelect();
                loadDashboardData(); // Carrega KPIs principais

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
// 3. NAVEGAÇÃO E UTILITÁRIOS
// ============================================================
window.showSection = (sectionId) => {
    // 1. Esconde todas as seções
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    
    // 2. Atualiza menu ativo
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    // Pequeno hack para achar o LI pai do onclick
    const allLinks = document.querySelectorAll('.nav-links li');
    allLinks.forEach(li => {
        if(li.getAttribute('onclick') && li.getAttribute('onclick').includes(sectionId)) {
            li.classList.add('active');
        }
    });

    // 3. Mostra a seção alvo
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';

    // 4. Ações específicas por tela
    if (sectionId === 'colaboradores') {
        loadCollaboratorsHub(); // <--- CHAMA O HUB NOVO
    }

    if (sectionId !== 'lancamentos' && isEditingMetric) resetMetricFormState();
};

window.logout = () => {
    if (confirm("Sair do sistema?")) signOut(auth).then(() => window.location.href = "index.html");
};

window.openModal = () => document.getElementById('modal-new-user').style.display = 'block';
window.closeModal = () => document.getElementById('modal-new-user').style.display = 'none';

function timeToSeconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return 0;
    const p = timeStr.split(':');
    let s = 0, m = 1;
    while (p.length > 0) {
        s += m * parseInt(p.pop(), 10);
        m *= 60;
    }
    return s;
}

// ============================================================
// 4. DASHBOARD - LÓGICA DE KPIs (SETOR E EQUIPE)
// ============================================================
async function loadDashboardData() {
    console.log("Calculando Dashboard Completo...");

    // A. Busca Dados Individuais (Métricas Semanais)
    if (allMetricsCache.length === 0) {
        try {
            const q = await getDocs(collection(db, "weekly_metrics"));
            allMetricsCache = [];
            q.forEach(doc => allMetricsCache.push(doc.data()));
        } catch (e) { console.error(e); }
    }

    // B. Busca Dados do Setor (KPIs Globais)
    let sectorMetrics = [];
    try {
        const qSector = await getDocs(collection(db, "sector_metrics"));
        qSector.forEach(doc => sectorMetrics.push(doc.data()));
        // Ordenação segura por data
        sectorMetrics.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
    } catch (e) { console.error("Erro ao buscar KPIs do setor", e); }

    // C. Processa KPIs do Setor (TMR, FCR, Reincidência) no DOM
    if (sectorMetrics.length > 0) {
        const curr = sectorMetrics[sectorMetrics.length - 1]; // Última semana
        const prev = sectorMetrics.length > 1 ? sectorMetrics[sectorMetrics.length - 2] : null;

        updateSectorKPI(curr, prev, 'tmr', 'kpi-sector-tmr', 'trend-tmr', true); // true = formato tempo
        updateSectorKPI(curr, prev, 'fcr', 'kpi-sector-fcr', 'trend-fcr', false);
        updateSectorKPI(curr, prev, 'reincidencia', 'kpi-sector-rein', 'trend-rein', false);
    }

    // D. Processa Dados da Equipe (Cards Superiores)
    if (allMetricsCache.length === 0) { resetKpis(); return; }

    const userStats = {};
    allMetricsCache.forEach(entry => {
        const uid = entry.userId;
        if (!userStats[uid]) {
            userStats[uid] = {
                name: entry.userName, count: 0,
                accTmaTel: 0, accTmaChat: 0, accMonitoria: 0, accFinalizados: 0
            };
        }
        userStats[uid].count++;
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
        avgVolume: (u.accFinalizados / u.count).toFixed(1), 
        totalVolume: u.accFinalizados
    }));

    processGlobalKPIs(globalAggregatedData);

    if (typeof renderDashboardCharts === "function") {
        renderDashboardCharts(globalAggregatedData, allMetricsCache);
    }
}

// Auxiliar para atualizar cards de setor com setas
function updateSectorKPI(curr, prev, key, elId, trendId, isTime) {
    const el = document.getElementById(elId);
    const trend = document.getElementById(trendId);
    if (!el) return;

    // Valor atual
    let val = curr[key] || (isTime ? "--:--" : 0);
    if (!isTime) val += "%";
    el.innerText = val;

    // Tendência
    if (prev && trend) {
        let currVal = isTime ? timeToSeconds(curr[key]) : curr[key];
        let prevVal = isTime ? timeToSeconds(prev[key]) : prev[key];

        if (currVal > prevVal) {
            trend.innerHTML = "▲"; 
            trend.style.color = "#dc3545"; // Vermelho se subir (geralmente ruim para tempo/reincidencia, adaptar se necessario)
        } else if (currVal < prevVal) {
            trend.innerHTML = "▼"; 
            trend.style.color = "#28a745"; // Verde se descer
        } else {
            trend.innerHTML = "─"; 
            trend.style.color = "#ccc";
        }
        
        // Exceção: FCR subir é bom
        if(key === 'fcr') {
             if (currVal > prevVal) trend.style.color = "#28a745";
             else if (currVal < prevVal) trend.style.color = "#dc3545";
        }
    }
}

function processGlobalKPIs(users) {
    if (users.length === 0) { resetKpis(); return; }

    const calcAvg = (k) => (users.reduce((acc, u) => acc + parseFloat(u[k]), 0) / users.length).toFixed(1);
    const calcAvgTime = (k) => (users.reduce((acc, u) => acc + parseFloat(u[k]), 0) / users.length).toFixed(2);

    updateCard('kpi-team-tel', calcAvgTime('avgTmaTel') + " min");
    updateCard('kpi-team-chat', calcAvgTime('avgTmaChat') + " min");
    updateCard('kpi-team-vol', parseFloat(calcAvg('avgVolume')).toFixed(0));

    // Rankings
    const bestQa = [...users].sort((a, b) => b.avgMonitoria - a.avgMonitoria)[0];
    if (bestQa) { updateCard('kpi-best-qa', bestQa.avgMonitoria); updateCard('kpi-best-qa-name', bestQa.name.split(' ')[0]); }

    const maxTel = [...users].sort((a, b) => b.avgTmaTel - a.avgTmaTel)[0];
    if (maxTel) { updateCard('kpi-max-tel', maxTel.avgTmaTel + " min"); updateCard('kpi-max-tel-name', maxTel.name.split(' ')[0]); }

    const maxChat = [...users].sort((a, b) => b.avgTmaChat - a.avgTmaChat)[0];
    if (maxChat) { updateCard('kpi-max-chat', maxChat.avgTmaChat + " min"); updateCard('kpi-max-chat-name', maxChat.name.split(' ')[0]); }
}

function updateCard(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }
function resetKpis() { ['kpi-team-tel', 'kpi-team-chat', 'kpi-team-vol', 'kpi-best-qa', 'kpi-max-tel', 'kpi-max-chat'].forEach(id => updateCard(id, '--')); }
window.forceDashboardRefresh = async () => { allMetricsCache = []; resetKpis(); await loadDashboardData(); alert("Dados atualizados!"); };

// ============================================================
// 5. MODAIS DE DETALHES (Visão Admin)
// ============================================================
window.openDetailModal = (type) => {
    const modal = document.getElementById('modal-kpi-details');
    const title = document.getElementById('modal-kpi-title');
    const tbody = document.getElementById('modal-kpi-body');
    const thVal = document.getElementById('modal-kpi-col-value');

    modal.style.display = 'block';
    tbody.innerHTML = "";

    let data = [...globalAggregatedData];
    let header = "Valor";
    let sortFn, valKey;

    switch(type) {
        case 'team-tel': title.innerText = "TMA Telefonia"; header = "Média (min)"; valKey = 'avgTmaTel'; sortFn = (a,b)=>b.avgTmaTel - a.avgTmaTel; break;
        case 'team-chat': title.innerText = "TMA Chat"; header = "Média (min)"; valKey = 'avgTmaChat'; sortFn = (a,b)=>b.avgTmaChat - a.avgTmaChat; break;
        case 'team-vol': title.innerText = "Produtividade"; header = "Média Finalizados"; valKey = 'avgVolume'; sortFn = (a,b)=>b.avgVolume - a.avgVolume; break;
        case 'best-qa': title.innerText = "Qualidade"; header = "Nota Média"; valKey = 'avgMonitoria'; sortFn = (a,b)=>b.avgMonitoria - a.avgMonitoria; break;
        case 'max-tel': title.innerText = "Ranking TMA Tel"; header = "Tempo Médio"; valKey = 'avgTmaTel'; sortFn = (a,b)=>b.avgTmaTel - a.avgTmaTel; break;
        case 'max-chat': title.innerText = "Ranking TMA Chat"; header = "Tempo Médio"; valKey = 'avgTmaChat'; sortFn = (a,b)=>b.avgTmaChat - a.avgTmaChat; break;
    }

    thVal.innerText = header;
    data.sort(sortFn);
    data.forEach((u, i) => {
        tbody.innerHTML += `<tr><td>${i+1}º ${u.name}</td><td>${u[valKey]}</td></tr>`;
    });
};

// ============================================================
// 6. FORMULÁRIOS (Métricas, Setor, Ocorrências)
// ============================================================

// A. Carregar Selects
async function loadUserSelectOptions() {
    const select = document.getElementById('metric-user-select');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    try {
        const q = await getDocs(collection(db, "users"));
        const usersList = [];
        q.forEach(d => { if (d.data().cargo !== 'admin') usersList.push({ id: d.id, nome: d.data().nome }); });
        usersList.sort((a, b) => a.nome.localeCompare(b.nome));
        usersList.forEach(u => select.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    } catch (e) { console.error(e); }
}

async function loadOccurrenceUserSelect() {
    const select = document.getElementById('occur-user-select');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';
    try {
        const q = await getDocs(collection(db, "users"));
        const usersList = [];
        q.forEach(d => { if (d.data().cargo !== 'admin') usersList.push({ id: d.id, nome: d.data().nome }); });
        usersList.sort((a, b) => a.nome.localeCompare(b.nome));
        usersList.forEach(u => select.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    } catch (e) { console.error(e); }
}

// B. Submit Métricas Individuais
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
            ligacoesRealizadas: Number(document.getElementById('lig-realizadas').value || 0),
            ligacoesRecebidas: Number(document.getElementById('lig-recebidas').value || 0),
            ligacoesPerdidas: Number(document.getElementById('lig-perdidas').value || 0),
            tmeTelefonia: Number(document.getElementById('tme-tel').value || 0),
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
            allMetricsCache = [];
        } catch (e) { alert("Erro: " + e.message); }
    });
}

// C. Submit KPIs Setor
const formSector = document.getElementById('form-sector-metrics');
if (formSector) {
    formSector.addEventListener('submit', async (e) => {
        e.preventDefault();
        const weekStart = document.getElementById('sector-date').value;
        const data = {
            weekStart, createdAt: new Date(),
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

// D. Submit Ocorrências (ATUALIZADO)
const formOccur = document.getElementById('form-ocorrencias');
if (formOccur) {
    // Clone para remover listeners antigos e evitar duplicação
    const newForm = formOccur.cloneNode(true);
    formOccur.parentNode.replaceChild(newForm, formOccur);
    
    newForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const uid = document.getElementById('occur-user-select').value;
        const typeEl = document.querySelector('input[name="occur-type"]:checked');
        
        // Novos Campos
        const origin = document.getElementById('occur-origin').value;
        const protocol = document.getElementById('occur-protocol').value;

        if (!uid || !typeEl || !origin) return alert("Preencha todos os campos obrigatórios.");
        
        try {
            const sel = document.getElementById('occur-user-select');
            
            // Salva no Firebase com os novos campos
            await setDoc(doc(collection(db, "occurrences")), {
                userId: uid,
                userName: sel.options[sel.selectedIndex].text,
                date: document.getElementById('occur-date').value,
                type: typeEl.value,
                origin: origin,       // Salva a origem (Sistema, Presencial...)
                protocol: protocol,   // Salva o protocolo (ou vazio)
                title: document.getElementById('occur-title').value,
                description: document.getElementById('occur-desc').value,
                read: false,
                createdAt: new Date()
            });
            
            alert("Feedback registrado com sucesso!");
            newForm.reset();
            
            // Opcional: Recarregar lista se estiver aberta
            if(document.getElementById('section-all-occurrences').style.display === 'block') {
                loadAllOccurrences();
            }

        } catch (e) { 
            console.error(e);
            alert("Erro ao registrar: " + e.message); 
        }
    });
}

function resetMetricFormState() {
    isEditingMetric = false; editingMetricId = null;
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    if(btn) { btn.innerText = "Salvar Métricas da Semana"; btn.style.backgroundColor = ""; }
    const sel = document.getElementById('metric-user-select');
    const dat = document.getElementById('metric-date');
    if(sel) sel.disabled = false; if(dat) dat.disabled = false;
    document.getElementById('form-metrics').reset();
}

// ============================================================
// 7. LISTAS E RELATÓRIOS
// ============================================================

// A. Histórico do Setor (Corrigido)
window.loadSectorHistory = async () => {
    const tbody = document.getElementById('sector-history-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";
    
    try {
        const q = await getDocs(collection(db, "sector_metrics"));
        let docs = [];
        q.forEach(doc => docs.push(doc.data()));
        docs.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
        
        tbody.innerHTML = "";
        if (docs.length === 0) { tbody.innerHTML = "<tr><td colspan='5'>Vazio.</td></tr>"; return; }
        
        docs.forEach(d => {
            const dateFmt = d.weekStart.split('-').reverse().join('/');
            tbody.innerHTML += `
                <tr>
                    <td>${dateFmt}</td>
                    <td>${d.tmr}</td>
                    <td>${d.fcr}%</td>
                    <td>${d.reincidência || d.reincidencia}%</td>
                    <td>
                        <button onclick="prepareEditSectorKPI('${d.weekStart}')" class="action-btn btn-edit"><i class="material-icons">edit</i></button>
                        <button onclick="deleteSectorKPI('${d.weekStart}')" class="action-btn btn-delete"><i class="material-icons">delete</i></button>
                    </td>
                </tr>`;
        });
    } catch (e) { tbody.innerHTML = "<tr><td colspan='5'>Erro.</td></tr>"; }
}

window.deleteSectorKPI = async (id) => { 
    if (!confirm("Tem certeza?")) return; 
    await deleteDoc(doc(db, "sector_metrics", id)); 
    loadSectorHistory(); loadDashboardData(); 
}

window.prepareEditSectorKPI = async (id) => { 
    const docSnap = await getDoc(doc(db, "sector_metrics", id)); 
    if (!docSnap.exists()) return; 
    const data = docSnap.data(); 
    showSection('lancamentos'); 
    document.getElementById('sector-date').value = data.weekStart; 
    document.getElementById('kpi-tmr').value = data.tmr; 
    document.getElementById('kpi-fcr').value = data.fcr; 
    document.getElementById('kpi-reincidencia').value = data.reincidência || data.reincidencia; 
    window.scrollTo(0, 0); 
}

// B. Lista de Ocorrências
window.loadAllOccurrences = async () => {
    const tbody = document.getElementById('all-occurrences-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='7'>Carregando...</td></tr>";
    try {
        const q = await getDocs(collection(db, "occurrences"));
        occurrencesCache = [];
        q.forEach(docSnap => occurrencesCache.push({ id: docSnap.id, ...docSnap.data() }));
        occurrencesCache.sort((a, b) => new Date(b.date) - new Date(a.date));
        applyOccurrenceFilters();
    } catch (error) { console.error(error); }
};

window.applyOccurrenceFilters = () => {
    const nameFilter = document.getElementById('filter-occur-name').value.toLowerCase();
    const typeFilter = document.getElementById('filter-occur-type').value;
    const dateFilter = document.getElementById('filter-occur-date').value;
    
    const filteredData = occurrencesCache.filter(item => {
        const matchName = nameFilter ? (item.userName || '').toLowerCase().includes(nameFilter) : true;
        const matchType = typeFilter !== 'all' ? item.type === typeFilter : true;
        const matchDate = dateFilter ? item.date === dateFilter : true;
        return matchName && matchType && matchDate;
    });
    renderOccurrencesTable(filteredData);
};

window.renderOccurrencesTable = (dataList) => {
    const tbody = document.getElementById('all-occurrences-body');
    tbody.innerHTML = "";
    if (dataList.length === 0) { tbody.innerHTML = "<tr><td colspan='7'>Nenhum registro.</td></tr>"; return; }

    dataList.forEach(item => {
        const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';
        let rowStyle = item.type === 'positive' ? 'border-left:4px solid green' : (item.type === 'negative' ? 'border-left:4px solid red' : 'border-left:4px solid gray');
        
        tbody.innerHTML += `
            <tr style="${rowStyle}">
                <td>${dateFmt}</td>
                <td><strong>${item.userName}</strong></td>
                <td>${item.type}</td>
                <td>${item.title}</td>
                <td>${item.description.substring(0,60)}...</td>
                <td>${item.read ? 'Lido' : 'Pendente'}</td>
                <td><button onclick="prepareEditOccurrence('${item.id}')" class="action-btn btn-edit"><i class="material-icons">edit</i></button></td>
            </tr>`;
    });
};

window.clearOccurrenceFilters = () => {
    document.getElementById('filter-occur-name').value = '';
    document.getElementById('filter-occur-type').value = 'all';
    document.getElementById('filter-occur-date').value = '';
    applyOccurrenceFilters();
};

// C. Relatório Detalhado
window.loadRelatorioDetalhado = async () => {
    const container = document.getElementById('relatorio-detalhado-content');
    const selectFilter = document.getElementById('filter-date-select');
    if (!container) return;
    container.innerHTML = "<p>Carregando...</p>";
    if (allMetricsCache.length === 0) await loadDashboardData();

    const uniqueDates = [...new Set(allMetricsCache.map(item => item.weekStart))];
    uniqueDates.sort((a, b) => new Date(b) - new Date(a));

    selectFilter.innerHTML = `<option value="all">Todas as Datas</option>`;
    uniqueDates.forEach(date => {
        selectFilter.innerHTML += `<option value="${date}">${date.split('-').reverse().join('/')}</option>`;
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

    Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
        const records = groups[date];
        const htmlRows = records.map(r => `
            <tr>
                <td>${r.userName}</td>
                <td>${r.notaMonitoria}</td>
                <td>${r.tmaTelefonia}</td>
                <td>${r.tmaHuggy}</td>
                <td>${r.atendimentosFinalizados}</td>
                <td><button onclick="viewMetricDetailAdmin('${r.userId}_${r.weekStart}')" class="action-btn"><i class="material-icons">visibility</i></button></td>
            </tr>
        `).join('');
        
        container.innerHTML += `
            <div class="metric-card" style="margin-bottom:20px;">
                <h3>🗓️ ${date.split('-').reverse().join('/')}</h3>
                <table class="data-table"><thead><tr><th>Nome</th><th>QA</th><th>TMA Tel</th><th>TMA Chat</th><th>Vol</th><th>Ver</th></tr></thead><tbody>${htmlRows}</tbody></table>
            </div>`;
    });
};

// ============================================================
// 8. FUNÇÕES AUXILIARES DE EDIÇÃO (MODAIS FLUTUANTES)
// ============================================================
window.viewMetricDetailAdmin = async (docId) => {
    // Reutiliza o modal de detalhes existente para exibir dados crus se necessário, ou cria um alert simples por enquanto
    // Idealmente você já tem o modal 'modal-metric-view-admin' no HTML.
    // Lógica simplificada:
    const docRef = doc(db, "weekly_metrics", docId);
    try {
        const snap = await getDoc(docRef);
        if(snap.exists()) {
             prepareEditMetric(docId); // Atalho: Abre o formulário de edição preenchido para visualização
        }
    } catch(e) { alert("Erro ao abrir."); }
};

window.prepareEditMetric = async (id) => {
    const snap = await getDoc(doc(db, "weekly_metrics", id));
    if (!snap.exists()) return;
    const data = snap.data();
    showSection('lancamentos');
    const sel = document.getElementById('metric-user-select');
    if(sel) { sel.value = data.userId; sel.disabled = true; }
    const dat = document.getElementById('metric-date');
    if(dat) { dat.value = data.weekStart; dat.disabled = true; }

    document.getElementById('at-abertos').value = data.atendimentosAbertos;
    document.getElementById('at-finalizados').value = data.atendimentosFinalizados;
    document.getElementById('lig-recebidas').value = data.ligacoesRecebidas || 0;
    document.getElementById('lig-realizadas').value = data.ligacoesRealizadas || 0;
    document.getElementById('lig-perdidas').value = data.ligacoesPerdidas || 0;
    document.getElementById('tma-tel').value = data.tmaTelefonia;
    document.getElementById('tme-tel').value = data.tmeTelefonia || 0;
    document.getElementById('at-huggy').value = data.atendimentosHuggy;
    document.getElementById('tma-huggy').value = data.tmaHuggy;
    document.getElementById('nota-monitoria').value = data.notaMonitoria;

    isEditingMetric = true; editingMetricId = id;
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    if(btn) { btn.innerText = "Atualizar Dados"; btn.style.backgroundColor = "#ffc107"; btn.style.color = "#333"; }
};

window.prepareEditOccurrence = (id) => {
    const item = occurrencesCache.find(o => o.id === id);
    if (!item) return;
    document.getElementById('edit-occur-id').value = item.id;
    document.getElementById('edit-occur-date').value = item.date;
    document.getElementById('edit-occur-title').value = item.title;
    document.getElementById('edit-occur-desc').value = item.description;
    const radios = document.getElementsByName('edit-occur-type');
    for (const r of radios) { if (r.value === item.type) r.checked = true; }
    document.getElementById('modal-edit-occurrence').style.display = 'block';
};

window.closeEditModal = () => { document.getElementById('modal-edit-occurrence').style.display = 'none'; };
window.saveEditedOccurrence = async (event) => {
    event.preventDefault();
    const id = document.getElementById('edit-occur-id').value;
    const date = document.getElementById('edit-occur-date').value;
    const title = document.getElementById('edit-occur-title').value;
    const desc = document.getElementById('edit-occur-desc').value;
    const type = document.querySelector('input[name="edit-occur-type"]:checked').value;
    try {
        await updateDoc(doc(db, "occurrences", id), { date, title, description: desc, type });
        alert("Atualizado!"); closeEditModal(); loadAllOccurrences();
    } catch (e) { alert("Erro: " + e.message); }
};

