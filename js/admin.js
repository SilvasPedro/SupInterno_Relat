// Mantenha os imports de funções específicas do CDN, mas REMOVA initializeApp, getAuth e getFirestore
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import {
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

// --- IMPORTAÇÃO CENTRALIZADA (NOVO) ---
import { auth, db } from "./config/firebase_config.js";

// --- MÓDULOS EXTERNOS ---
import { renderDashboardCharts } from "./charts.js";
import "./history.js";
import { loadCollaboratorsHub } from "./hub.js";



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
        if (li.getAttribute('onclick') && li.getAttribute('onclick').includes(sectionId)) {
            li.classList.add('active');
        }
    });

    // 3. Mostra a seção alvo
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';

    // 4. Ações específicas por tela
if (sectionId === 'colaboradores') {
        loadCollaboratorsHub(); // <--- CHAMA O HUB NOVO
        window.renderHubAnalytics(); // <--- ADICIONE ESTA LINHA AQUI
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

    // 1. Busca Auditorias para cálculo de Conformidade
    let allAudits = [];
    try {
        const qAudits = await getDocs(collection(db, "audits"));
        qAudits.forEach(doc => allAudits.push(doc.data()));
    } catch (e) { console.error("Erro audits", e); }

    // 2. Cálculo Global: Soma todos os 'Conforme' dividido pelo Total de Auditorias
    let globalAuditTotal = 0;
    let globalAuditConforme = 0;

    allAudits.forEach(audit => {
        globalAuditTotal++;
        if (audit.status === 'Conforme') {
            globalAuditConforme++;
        }
    });

    // Regra de 3 simples para a %
    const globalQaPercent = globalAuditTotal > 0
        ? ((globalAuditConforme / globalAuditTotal) * 100).toFixed(1)
        : 0;

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

    processGlobalKPIs(globalAggregatedData, globalQaPercent);

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
        if (key === 'fcr') {
            if (currVal > prevVal) trend.style.color = "#28a745";
            else if (currVal < prevVal) trend.style.color = "#dc3545";
        }
    }
}

let gaugeChartInstance = null;

function renderQaGauge(value, color) {
    const ctx = document.getElementById('gaugeQA');
    if (!ctx) return;

    if (gaugeChartInstance) {
        gaugeChartInstance.data.datasets[0].data = [value, 100 - value];
        gaugeChartInstance.data.datasets[0].backgroundColor = [color, '#f0f0f0'];
        gaugeChartInstance.update();
    } else {
        gaugeChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [value, 100 - value],
                    backgroundColor: [color, '#f0f0f0'],
                    borderWidth: 0,
                    circumference: 180, // Corta pela metade
                    rotation: 270       // Gira para virar um arco para cima
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%', // Espessura do anel
                plugins: { tooltip: { enabled: false }, legend: { display: false } },
                animation: { animateRotate: true, animateScale: false }
            }
        });
    }
}

function processGlobalKPIs(users, globalQaPercent) {
    if (users.length === 0) { resetKpis(); return; }

    // Calcula médias apenas de quem tem métricas lançadas (KPIs de tempo/volume)
    const usersWithMetrics = users.filter(u => u.avgVolume > 0 || u.avgTmaTel > 0);
    let avgTmaTel = 0, avgTmaChat = 0, avgVol = 0;

    if (usersWithMetrics.length > 0) {
        avgTmaTel = (usersWithMetrics.reduce((acc, u) => acc + parseFloat(u.avgTmaTel), 0) / usersWithMetrics.length).toFixed(2);
        avgTmaChat = (usersWithMetrics.reduce((acc, u) => acc + parseFloat(u.avgTmaChat), 0) / usersWithMetrics.length).toFixed(2);
        avgVol = (usersWithMetrics.reduce((acc, u) => acc + parseFloat(u.avgVolume), 0) / usersWithMetrics.length).toFixed(0);
    }

    updateCard('kpi-team-tel', avgTmaTel + " min");
    updateCard('kpi-team-chat', avgTmaChat + " min");
    updateCard('kpi-team-vol', avgVol);

    // --- CORREÇÃO DINÂMICA DO CARD QA ---
// --- LÓGICA DO CARD QA (GAUGE) ---
    const numVal = parseFloat(globalQaPercent) || 0;
    let color = '#dc3545'; // 1% até 74%: Vermelho

    if (numVal >= 90) {
        color = '#28a745'; // 90% para cima: Verde
    } else if (numVal >= 75) {
        color = '#ffc107'; // 75% até 89%: Amarelo
    }

    // Atualiza o texto central do velocímetro
    const qaText = document.getElementById('kpi-team-qa-text');
    if (qaText) {
        qaText.innerText = numVal.toFixed(1) + "%";
        qaText.style.color = color;
    }

    // Renderiza/Atualiza o gráfico do Chart.js
    renderQaGauge(numVal, color);

    // --- Rankings ---
 const bestMonitoria = [...users].sort((a, b) => b.avgMonitoria - a.avgMonitoria)[0];
    if (bestMonitoria) {
        // IMPORTANTE: Aqui invertemos a ordem! O NOME vai para o h1 e a NOTA vai para o parágrafo
        updateCard('kpi-best-qa-name', bestMonitoria.name.split(' ').slice(0, 2).join(' '));
        updateCard('kpi-best-qa', bestMonitoria.avgMonitoria);
    }

    const maxTel = [...users].sort((a, b) => b.avgTmaTel - a.avgTmaTel)[0];
    if (maxTel) {
        updateCard('kpi-max-tel', maxTel.avgTmaTel + " min");
        updateCard('kpi-max-tel-name', maxTel.name.split(' ').slice(0, 2).join(' '));
    }
    const maxChat = [...users].sort((a, b) => b.avgTmaChat - a.avgTmaChat)[0];
    if (maxChat) {
        updateCard('kpi-max-chat', maxChat.avgTmaChat + " min");
        updateCard('kpi-max-chat-name', maxChat.name.split(' ').slice(0, 2).join(' '));
    }
}


function updateCard(id, val) { const el = document.getElementById(id); if (el) el.innerText = val; }
function resetKpis() {
    ['kpi-team-tel', 'kpi-team-chat', 'kpi-team-vol', 'kpi-best-qa', 'kpi-max-tel', 'kpi-max-chat', 'kpi-team-qa'].forEach(id => updateCard(id, '--'));
}
window.forceDashboardRefresh = async () => { allMetricsCache = []; resetKpis(); await loadDashboardData(); alert("Dados atualizados!"); };

// ============================================================
// 5. MODAIS DE DETALHES (Visão Admin)
// ============================================================
window.openDetailModal = (type) => {
    const modal = document.getElementById('modal-kpi-details');
    const title = document.getElementById('modal-kpi-title');
    const tbody = document.getElementById('modal-kpi-body');
    const thVal = document.getElementById('modal-kpi-col-value');

    if (!modal) return;
    modal.style.display = 'block';
    tbody.innerHTML = "";

    let data = [...globalAggregatedData];
    let header = "Valor";
    let sortFn, valKey;

    switch (type) {
        case 'team-qa': // <--- NOVO CASE
            title.innerText = "Ranking de Qualidade (QA)";
            header = "Nota Média";
            valKey = 'avgMonitoria';
            sortFn = (a, b) => b.avgMonitoria - a.avgMonitoria;
            break;
        case 'team-tel': title.innerText = "TMA Telefonia"; header = "Média (min)"; valKey = 'avgTmaTel'; sortFn = (a, b) => b.avgTmaTel - a.avgTmaTel; break;
        case 'team-chat': title.innerText = "TMA Chat"; header = "Média (min)"; valKey = 'avgTmaChat'; sortFn = (a, b) => b.avgTmaChat - a.avgTmaChat; break;
        case 'team-vol': title.innerText = "Produtividade"; header = "Média Finalizados"; valKey = 'avgVolume'; sortFn = (a, b) => b.avgVolume - a.avgVolume; break;
        case 'best-qa': title.innerText = "Qualidade (Top)"; header = "Nota Média"; valKey = 'avgMonitoria'; sortFn = (a, b) => b.avgMonitoria - a.avgMonitoria; break;
        case 'max-tel': title.innerText = "Ranking TMA Tel"; header = "Tempo Médio"; valKey = 'avgTmaTel'; sortFn = (a, b) => b.avgTmaTel - a.avgTmaTel; break;
        case 'max-chat': title.innerText = "Ranking TMA Chat"; header = "Tempo Médio"; valKey = 'avgTmaChat'; sortFn = (a, b) => b.avgTmaChat - a.avgTmaChat; break;
    }

    thVal.innerText = header;
    data.sort(sortFn);
    data.forEach((u, i) => {
        tbody.innerHTML += `<tr><td>${i + 1}º ${u.name}</td><td>${u[valKey]}</td></tr>`;
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
            // Removido: atendimentosAbertos
            // Removido: ligacoesRealizadas

            // Campos mantidos:
            atendimentosFinalizados: Number(document.getElementById('at-finalizados').value),
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
            if (document.getElementById('section-all-occurrences').style.display === 'block') {
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
    if (btn) { btn.innerText = "Salvar Métricas da Semana"; btn.style.backgroundColor = ""; }
    const sel = document.getElementById('metric-user-select');
    const dat = document.getElementById('metric-date');
    if (sel) sel.disabled = false; if (dat) dat.disabled = false;
    document.getElementById('form-metrics').reset();
}

// ============================================================
// 7. LISTAS E RELATÓRIOS
// ============================================================

// A. Histórico do Setor (Corrigido)
let sectorMetricsCache = [];
let chartSectorInstance = null;

// A. Função para carregar histórico e preencher cache, tabela, gráfico e metas
window.loadSectorHistory = async () => {
    const tbody = document.getElementById('sector-history-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Carregando dados...</td></tr>";

    try {
        const q = await getDocs(collection(db, "sector_metrics"));
        sectorMetricsCache = [];
        q.forEach(doc => sectorMetricsCache.push(doc.data()));
        sectorMetricsCache.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart)); // Mais recentes primeiro

        // Preenche o mês atual no gráfico por padrão, se estiver vazio
        const hoje = new Date();
        const mesAtual = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0');
        if(!document.getElementById('filter-chart-month').value) {
            document.getElementById('filter-chart-month').value = mesAtual;
        }

        window.filterSectorHistory();
        window.renderSectorChart();
        window.loadKpiTargets();
    } catch (e) {
        console.error(e);
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Erro ao carregar dados.</td></tr>";
    }
};

// B. Filtra e renderiza a tabela compacta
window.filterSectorHistory = () => {
    const tbody = document.getElementById('sector-history-body');
    const monthFilter = document.getElementById('filter-history-month').value; // Formato YYYY-MM
    
    let filtrado = sectorMetricsCache;
    if (monthFilter) {
        filtrado = sectorMetricsCache.filter(d => d.weekStart.startsWith(monthFilter));
    }

    tbody.innerHTML = "";
    if (filtrado.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center; color:#666;'>Nenhum registro encontrado para este período.</td></tr>";
        return;
    }

    filtrado.forEach(d => {
        const dateFmt = d.weekStart.split('-').reverse().join('/');
        tbody.innerHTML += `
            <tr>
                <td><strong>${dateFmt}</strong></td>
                <td>${d.tmr}</td>
                <td><span style="color: #28a745; font-weight: bold;">${d.fcr}%</span></td>
                <td><span style="color: #dc3545; font-weight: bold;">${d.reincidência || d.reincidencia}%</span></td>
                <td style="text-align: center;">
                    <button onclick="deleteSectorKPI('${d.weekStart}')" class="action-btn btn-delete" style="margin: 0 auto; width: 30px; height: 30px;" title="Excluir">
                        <i class="material-icons" style="font-size: 16px;">delete</i>
                    </button>
                </td>
            </tr>`;
    });
};

// C. Renderiza o Gráfico de Evolução (Filtro por mês)
window.renderSectorChart = () => {
    const ctx = document.getElementById('chartSectorEvolution');
    if (!ctx) return;

    const monthFilter = document.getElementById('filter-chart-month').value;
    let filtrado = sectorMetricsCache;
    
    if (monthFilter) {
        filtrado = sectorMetricsCache.filter(d => d.weekStart.startsWith(monthFilter));
    }

    // Ordena do mais antigo pro mais novo para o gráfico fazer sentido cronológico (esquerda -> direita)
    filtrado.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

    const labels = filtrado.map(d => d.weekStart.split('-').reverse().slice(0,2).join('/'));
    const dataFCR = filtrado.map(d => parseFloat(d.fcr));
    const dataRein = filtrado.map(d => parseFloat(d.reincidência || d.reincidencia));

    if (chartSectorInstance) chartSectorInstance.destroy();

    chartSectorInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'FCR (%)',
                    data: dataFCR,
                    borderColor: '#28a745',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Reincidência (%)',
                    data: dataRein,
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });
};

// D. Evento de Salvar Lançamento direto desta tela
const formNewHistory = document.getElementById('form-new-sector-metrics');
if (formNewHistory) {
    formNewHistory.addEventListener('submit', async (e) => {
        e.preventDefault();
        const weekStart = document.getElementById('history-kpi-date').value;
        const data = {
            weekStart, 
            createdAt: new Date(),
            tmr: document.getElementById('history-kpi-tmr').value,
            fcr: Number(document.getElementById('history-kpi-fcr').value),
            reincidencia: Number(document.getElementById('history-kpi-reincidencia').value)
        };
        try {
            await setDoc(doc(db, "sector_metrics", weekStart), data);
            window.showNotification("KPIs salvos com sucesso!", "success"); // Usando o Toastify que já existe no seu projeto
            formNewHistory.reset();
            window.loadSectorHistory(); // Atualiza tabela e gráfico
            if(typeof loadDashboardData === "function") loadDashboardData(); // Atualiza dashboard principal se existir
        } catch (error) { 
            window.showNotification("Erro ao salvar: " + error.message, "error"); 
        }
    });
}

// E. Lógica das Metas (Cola)
window.loadKpiTargets = async () => {
    try {
        const snap = await getDoc(doc(db, "configs", "kpi_targets"));
        if (snap.exists()) {
            const d = snap.data();
            document.getElementById('target-tmr').value = d.tmr || '00:20:00';
            document.getElementById('target-fcr').value = d.fcr || 80;
            document.getElementById('target-rein').value = d.reincidencia || 20;
        }
    } catch(e) { console.error("Erro ao carregar metas", e); }
};

const formTargets = document.getElementById('form-kpi-targets');
if (formTargets) {
    formTargets.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            tmr: document.getElementById('target-tmr').value,
            fcr: Number(document.getElementById('target-fcr').value),
            reincidencia: Number(document.getElementById('target-rein').value)
        };
        try {
            await setDoc(doc(db, "configs", "kpi_targets"), data);
            window.showNotification("Metas atualizadas com sucesso!", "success");
        } catch (error) {
            window.showNotification("Erro ao atualizar metas: " + error.message, "error");
        }
    });
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
    if (dataList.length === 0) { tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Nenhum registro encontrado.</td></tr>"; return; }

    dataList.forEach(item => {
        const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';

        // Cores da borda lateral baseada no tipo
        let borderStyle = "5px solid #ccc";
        let typeIcon = "❓";

        if (item.type === 'positive') { borderStyle = "5px solid #28a745"; typeIcon = "👍"; }
        else if (item.type === 'neutral') { borderStyle = "5px solid #ffc107"; typeIcon = "ℹ️"; }
        else if (item.type === 'negative') { borderStyle = "5px solid #dc3545"; typeIcon = "👎"; }

        const statusBadge = item.read
            ? '<span style="color:#28a745; background:#e8f5e9; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Lido</span>'
            : '<span style="color:#d63384; background:#f3e5f5; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold;">Pendente</span>';

        // TRUNCAR DESCRIÇÃO PARA NÃO QUEBRAR O LAYOUT
        const descShort = item.description.length > 50 ? item.description.substring(0, 50) + "..." : item.description;

        tbody.innerHTML += `
            <tr>
                <td style="border-left: ${borderStyle}; font-weight:bold; color:#555;">${dateFmt}</td>
                <td style="font-size: 15px; font-weight: 600;">${item.userName}</td>
                <td style="font-size: 20px; text-align:center;">${typeIcon}</td>
                <td>${item.title}</td>
                <td style="color:#666; font-size:13px;">${descShort}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="action-group">
                        <button onclick="viewOccurrence('${item.id}')" class="action-btn" style="background: var(--color-taupe); color: white;" title="Ver Completo">
                            <i class="material-icons" style="font-size: 18px;">visibility</i>
                        </button>
                        <button onclick="prepareEditOccurrence('${item.id}')" class="action-btn" style="background: #ffc107; color: #333;" title="Editar">
                            <i class="material-icons" style="font-size: 18px;">edit</i>
                        </button>
                        <button onclick="deleteOccurrence('${item.id}')" class="action-btn" style="background: #dc3545; color: white;" title="Excluir">
                            <i class="material-icons" style="font-size: 18px;">delete</i>
                        </button>
                    </div>
                </td>
            </tr>`;
    });
};

// B. FUNÇÃO DE VISUALIZAR (NOVA)
window.viewOccurrence = (id) => {
    const item = occurrencesCache.find(o => o.id === id);
    if (!item) return;

    const modal = document.getElementById('modal-view-occurrence');
    const content = document.getElementById('view-occur-content');

    let color = item.type === 'positive' ? '#28a745' : (item.type === 'negative' ? '#dc3545' : '#ffc107');
    const dateFmt = item.date.split('-').reverse().join('/');

    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
            <div>
                <small style="color:#999;">COLABORADOR</small>
                <div style="font-size:18px; font-weight:bold;">${item.userName}</div>
            </div>
            <div style="text-align:right;">
                <small style="color:#999;">DATA</small>
                <div style="font-size:16px;">${dateFmt}</div>
            </div>
        </div>
        
        <div style="background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:20px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div><small style="color:#999;">ORIGEM</small><br><strong>${item.origin || 'Não informado'}</strong></div>
            <div><small style="color:#999;">PROTOCOLO</small><br><strong>${item.protocol || '---'}</strong></div>
        </div>

        <div style="border-left: 5px solid ${color}; padding-left: 15px; margin-bottom: 20px;">
            <h3 style="color:${color}; margin:0 0 10px 0;">${item.title}</h3>
            <p style="line-height:1.6; color:#444; white-space: pre-line;">${item.description}</p>
        </div>
        
        <div style="font-size:12px; color:#999; text-align:right;">
            ID do Registro: ${item.id}
        </div>
    `;
    modal.style.display = 'block';
};

// C. FUNÇÃO DE DELETAR (NOVA)
window.deleteOccurrence = async (id) => {
    if (!confirm("⚠️ Tem certeza absoluta que deseja excluir este feedback? Esta ação não pode ser desfeita.")) return;

    try {
        await deleteDoc(doc(db, "occurrences", id));
        alert("Ocorrência excluída com sucesso.");
        // Atualiza cache e tabela
        loadAllOccurrences();
    } catch (e) {
        alert("Erro ao excluir: " + e.message);
    }
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
        if (snap.exists()) {
            prepareEditMetric(docId); // Atalho: Abre o formulário de edição preenchido para visualização
        }
    } catch (e) { alert("Erro ao abrir."); }
};

window.prepareEditMetric = async (id) => {
    const snap = await getDoc(doc(db, "weekly_metrics", id));
    if (!snap.exists()) return;
    const data = snap.data();

    showSection('lancamentos');

    const sel = document.getElementById('metric-user-select');
    if (sel) { sel.value = data.userId; sel.disabled = true; }

    const dat = document.getElementById('metric-date');
    if (dat) { dat.value = data.weekStart; dat.disabled = true; }

    // Campos atualizados conforme novo HTML
    document.getElementById('at-finalizados').value = data.atendimentosFinalizados;
    document.getElementById('lig-recebidas').value = data.ligacoesRecebidas || 0;
    // Removido: lig-realizadas
    document.getElementById('lig-perdidas').value = data.ligacoesPerdidas || 0;
    document.getElementById('tma-tel').value = data.tmaTelefonia;
    document.getElementById('tme-tel').value = data.tmeTelefonia || 0;
    // Removido: at-abertos
    document.getElementById('at-huggy').value = data.atendimentosHuggy;
    document.getElementById('tma-huggy').value = data.tmaHuggy;
    document.getElementById('nota-monitoria').value = data.notaMonitoria;

    isEditingMetric = true;
    editingMetricId = id;

    const btn = document.querySelector('#form-metrics button[type="submit"]');
    if (btn) {
        btn.innerText = "Atualizar Dados";
        btn.style.backgroundColor = "#ffc107";
        btn.style.color = "#333";
    }
};

// D. FUNÇÃO DE EDITAR (ATUALIZADA COM ORIGEM/PROTOCOLO)
window.prepareEditOccurrence = (id) => {
    const item = occurrencesCache.find(o => o.id === id);
    if (!item) return;

    document.getElementById('edit-occur-id').value = item.id;
    document.getElementById('edit-occur-date').value = item.date;
    document.getElementById('edit-occur-title').value = item.title;
    document.getElementById('edit-occur-desc').value = item.description;

    // Novos Campos
    document.getElementById('edit-occur-protocol').value = item.protocol || '';
    document.getElementById('edit-occur-origin').value = item.origin || 'Sistema/ERP'; // Default se vazio
    document.getElementById('edit-occur-type-select').value = item.type;

    document.getElementById('modal-edit-occurrence').style.display = 'block';
};

window.saveEditedOccurrence = async (event) => {
    event.preventDefault();

    const id = document.getElementById('edit-occur-id').value;

    const updatedData = {
        date: document.getElementById('edit-occur-date').value,
        title: document.getElementById('edit-occur-title').value,
        description: document.getElementById('edit-occur-desc').value,
        type: document.getElementById('edit-occur-type-select').value,
        origin: document.getElementById('edit-occur-origin').value,
        protocol: document.getElementById('edit-occur-protocol').value
    };

    try {
        await updateDoc(doc(db, "occurrences", id), updatedData);
        alert("Atualizado com sucesso!");
        closeEditModal();
        loadAllOccurrences(); // Recarrega a tabela
    } catch (e) {
        alert("Erro: " + e.message);
    }
};

window.closeEditModal = () => { document.getElementById('modal-edit-occurrence').style.display = 'none'; };
window.saveEditedOccurrence = async (event) => {
    event.preventDefault();

    // Pega o ID (campo oculto)
    const id = document.getElementById('edit-occur-id').value;

    // Verifica se os elementos existem antes de pegar o valor para evitar o erro
    const typeSelect = document.getElementById('edit-occur-type-select');
    const originInput = document.getElementById('edit-occur-origin');
    const protocolInput = document.getElementById('edit-occur-protocol');

    const updatedData = {
        date: document.getElementById('edit-occur-date').value,
        title: document.getElementById('edit-occur-title').value,
        description: document.getElementById('edit-occur-desc').value,

        // Novos campos com verificação de segurança
        type: typeSelect ? typeSelect.value : 'neutral',
        origin: originInput ? originInput.value : 'Sistema/ERP',
        protocol: protocolInput ? protocolInput.value : ''
    };

    try {
        await updateDoc(doc(db, "occurrences", id), updatedData);
        alert("Atualizado com sucesso!");

        closeEditModal();

        // Atualiza a tabela se a função existir
        if (typeof loadAllOccurrences === 'function') {
            loadAllOccurrences();
        }
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar: " + e.message);
    }
};

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('toggle-icon');
    const logo = document.getElementById('sidebar-logo'); // Busca a imagem da logo

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        icon.innerText = 'menu';
        // Troca para a logo reduzida (usando o favicon do seu projeto)
        logo.src = 'assets/favicon.png';
        logo.style.width = '40px'; // Garante o tamanho reduzido via JS também
    } else {
        icon.innerText = 'menu_open';
        // Volta para a logo principal
        logo.src = 'assets/logo.png';
        logo.style.width = '150px'; // Volta para a proporção normal
    }
};

window.renderHubAnalytics = async () => {
    try {
        const q = await getDocs(collection(db, "users"));
        let total = 0;
        let turnos = {};
        let cargos = {};

        q.forEach(docSnap => {
            const data = docSnap.data();
            if(data.cargo !== 'admin') { // Ignora admins da contagem
                total++;
                let t = data.turno || 'Não Informado';
                let c = data.cargo || 'Não Informado';
                turnos[t] = (turnos[t] || 0) + 1;
                cargos[c] = (cargos[c] || 0) + 1;
            }
        });

        // Atualiza o número total
        document.getElementById('hub-total-colab').innerText = total;

        // Gráfico de Turnos (Doughnut)
        const ctxTurnos = document.getElementById('hubChartTurnos');
        if (ctxTurnos && window.hubChartT) window.hubChartT.destroy();
        if (ctxTurnos) {
            window.hubChartT = new Chart(ctxTurnos, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(turnos),
                    datasets: [{ 
                        data: Object.values(turnos), 
                        backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1'],
                        borderWidth: 1
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: {size: 11} } } } 
                }
            });
        }

        // Gráfico de Cargos (Pie)
        const ctxCargos = document.getElementById('hubChartCargos');
        if (ctxCargos && window.hubChartC) window.hubChartC.destroy();
        if (ctxCargos) {
            window.hubChartC = new Chart(ctxCargos, {
                type: 'pie',
                data: {
                    labels: Object.keys(cargos),
                    datasets: [{ 
                        data: Object.values(cargos), 
                        backgroundColor: ['#17a2b8', '#fd7e14', '#20c997', '#e83e8c', '#6610f2'],
                        borderWidth: 1
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: {size: 11} } } } 
                }
            });
        }
    } catch (e) {
        console.error("Erro ao gerar gráficos do hub:", e);
    }
};