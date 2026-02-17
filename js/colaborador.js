import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// CONFIGURAÇÃO
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

// Variáveis de Gráfico globais para permitir destruição/recriação
let chartInstances = {}; 
let metricsHistoryCache = [];

// ============================================================
// NAVEGAÇÃO E UTILITÁRIOS
// ============================================================
window.showSection = (sectionId) => {
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    const activeLink = document.querySelector(`.nav-links li[onclick*="'${sectionId}'"]`);
    if (activeLink) activeLink.classList.add('active');
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';
};

window.logout = () => signOut(auth).then(() => window.location.href = "index.html");

function timeToSeconds(timeStr) {
    if(!timeStr || typeof timeStr !== 'string') return 0;
    const p = timeStr.split(':');
    let s = 0, m = 1;
    while (p.length > 0) { s += m * parseInt(p.pop(), 10); m *= 60; }
    return s;
}

// ============================================================
// LÓGICA DE DADOS (DASHBOARD)
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('user-name').innerText = user.email;
        loadDashboardData(user.uid);
        // Carrega as outras abas em background se necessário
        // loadMyOccurrences(user.uid); 
        // loadFullHistory(user.uid);
    } else {
        window.location.href = "index.html";
    }
});

async function loadDashboardData(uid) {
    try {
        // 1. Métricas Individuais (Semanais)
        const qUser = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const snapUser = await getDocs(qUser);
        let userRawData = [];
        snapUser.forEach(doc => userRawData.push(doc.data()));
        userRawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        // 2. Métricas do Setor
        let sectorRawData = [];
        try {
            const qSector = query(collection(db, "sector_metrics")); 
            const snapSector = await getDocs(qSector);
            snapSector.forEach(doc => sectorRawData.push(doc.data()));
            sectorRawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
        } catch (err) {}

        // 3. Auditorias (QA) para Gráfico e Média
        let auditsList = [];
        try {
            const qAudit = query(collection(db, "audits"), where("collaboratorId", "==", uid));
            const snapAudit = await getDocs(qAudit);
            snapAudit.forEach(doc => auditsList.push(doc.data()));
            // Ordena por data da auditoria
            auditsList.sort((a, b) => new Date(a.auditDate) - new Date(b.auditDate));
        } catch(err) { console.error("Erro audits", err); }

        // --- CÁLCULOS ---
        const sectorCurr = sectorRawData.length > 0 ? sectorRawData[sectorRawData.length - 1] : {};

        // Médias Gerais (Acumulado)
        let averages = { monitoria: 0, tmaTel: 0, tmaChat: 0, qaPerc: 0 };
        
        // Média Metrics
        if (userRawData.length > 0) {
            let sumMon = 0, sumTel = 0, sumChat = 0;
            userRawData.forEach(d => {
                sumMon += Number(d.notaMonitoria || 0);
                sumTel += Number(d.tmaTelefonia || 0);
                sumChat += Number(d.tmaHuggy || 0);
            });
            averages.monitoria = (sumMon / userRawData.length).toFixed(1);
            averages.tmaTel = (sumTel / userRawData.length).toFixed(2);
            averages.tmaChat = (sumChat / userRawData.length).toFixed(2);
        }

        // Média QA (Baseado no total de auditorias)
        if (auditsList.length > 0) {
            const conformes = auditsList.filter(a => a.status === 'Conforme').length;
            averages.qaPerc = ((conformes / auditsList.length) * 100).toFixed(1);
        }

        // --- RENDERIZAÇÃO ---
        updateDashboardCards(sectorCurr, averages, auditsList.length);
        processAndRenderCharts(userRawData, auditsList);

    } catch (error) { console.error("Erro dashboard:", error); }
}

function updateDashboardCards(sectorData, averages, totalAudits) {
    const sectorContainer = document.getElementById('sector-kpi-container');
    const personalContainer = document.getElementById('personal-kpi-container');

    // 1. Renderiza KPIs do Setor (Topo)
    if(sectorContainer) {
        sectorContainer.innerHTML = `
            <div class="modern-card">
                <div class="card-decoration" style="background: #6f42c1;"></div>
                <div class="card-icon"><i class="material-icons">timer</i></div>
                <h3>TMR Global</h3>
                <div class="value" style="color: #6f42c1;">${sectorData.tmr || '--:--'}</div>
                <div class="sub-text">Tempo Médio Resolução</div>
            </div>
            <div class="modern-card">
                <div class="card-decoration" style="background: #17a2b8;"></div>
                <div class="card-icon"><i class="material-icons">track_changes</i></div>
                <h3>FCR Global</h3>
                <div class="value" style="color: #17a2b8;">${sectorData.fcr || 0}%</div>
                <div class="sub-text">First Call Resolution</div>
            </div>
            <div class="modern-card">
                <div class="card-decoration" style="background: #dc3545;"></div>
                <div class="card-icon"><i class="material-icons">loop</i></div>
                <h3>Reincidência</h3>
                <div class="value" style="color: #dc3545;">${sectorData.reincidencia || 0}%</div>
                <div class="sub-text">Taxa de Retorno</div>
            </div>
        `;
    }

    // 2. Renderiza Médias Pessoais (Meio)
    if(personalContainer) {
        // Cor dinâmica para conformidade
        const qaColor = averages.qaPerc >= 90 ? '#28a745' : (averages.qaPerc >= 80 ? '#ffc107' : '#dc3545');

        personalContainer.innerHTML = `
            <div class="modern-card">
                <div class="card-decoration" style="background: #28a745;"></div>
                <div class="card-icon"><i class="material-icons">star</i></div>
                <h3>Média Monitoria</h3>
                <div class="value">${averages.monitoria}</div>
                <div class="sub-text">Histórico Geral</div>
            </div>
            <div class="modern-card">
                <div class="card-decoration" style="background: #007bff;"></div>
                <div class="card-icon"><i class="material-icons">phone</i></div>
                <h3>Média TMA Tel</h3>
                <div class="value">${averages.tmaTel} <small style="font-size:0.5em; color:#999;">min</small></div>
            </div>
            <div class="modern-card">
                <div class="card-decoration" style="background: #6610f2;"></div>
                <div class="card-icon"><i class="material-icons">chat</i></div>
                <h3>Média TMA Chat</h3>
                <div class="value">${averages.tmaChat} <small style="font-size:0.5em; color:#999;">min</small></div>
            </div>
            <div class="modern-card">
                <div class="card-decoration" style="background: ${qaColor};"></div>
                <div class="card-icon"><i class="material-icons">verified</i></div>
                <h3>Conformidade QA</h3>
                <div class="value" style="color: ${qaColor};">${averages.qaPerc}%</div>
                <div class="sub-text">Baseado em ${totalAudits} auditorias</div>
            </div>
        `;
    }
}

// ============================================================
// GRÁFICOS (Chart.js)
// ============================================================
function processAndRenderCharts(metricsHistory, auditHistory) {
    // 1. Dados para os 3 primeiros gráficos (baseados em Weekly Metrics)
    const labels = metricsHistory.map(d => d.weekStart.split('-').reverse().slice(0, 2).join('/'));
    const dataMon = metricsHistory.map(d => d.notaMonitoria || 0);
    const dataTel = metricsHistory.map(d => d.tmaTelefonia || 0);
    const dataChat = metricsHistory.map(d => d.tmaHuggy || 0);

    // 2. Dados para o gráfico de QA (Agrupamento Semanal Customizado)
    const qaChartData = processQAData(auditHistory);

    // Renderizar
    renderLineChart('chartEvoMonitoria', labels, 'Monitoria', dataMon, '#28a745');
    renderLineChart('chartEvoTel', labels, 'TMA Telefonia', dataTel, '#007bff');
    renderLineChart('chartEvoChat', labels, 'TMA Chat', dataChat, '#6610f2');
    
    // Gráfico QA (Labels e Data podem ser diferentes pois as datas de auditoria variam)
    renderLineChart('chartEvoQA', qaChartData.labels, 'Conformidade (%)', qaChartData.values, '#dc3545', true);
}

function processQAData(audits) {
    // Agrupa auditorias por "Ano-Semana" ou "Mês/Ano" para simplificar a visualização
    // Aqui vamos agrupar por Data da Auditoria (dd/mm) ordenado
    
    // Se houver muitas auditorias no mesmo dia, faz a média do dia.
    // Se quiser por semana, precisa de lógica de ISO Week. Vamos fazer por DATA para precisão.
    
    if (audits.length === 0) return { labels: [], values: [] };

    const groups = {};
    
    audits.forEach(a => {
        // Usa a data da auditoria como chave (YYYY-MM-DD)
        const dateKey = a.auditDate; 
        if (!groups[dateKey]) groups[dateKey] = { total: 0, conformes: 0 };
        
        groups[dateKey].total++;
        if (a.status === 'Conforme') groups[dateKey].conformes++;
    });

    const sortedDates = Object.keys(groups).sort();
    
    const labels = sortedDates.map(d => d.split('-').reverse().slice(0, 2).join('/'));
    const values = sortedDates.map(d => {
        return ((groups[d].conformes / groups[d].total) * 100).toFixed(1);
    });

    return { labels, values };
}

function renderLineChart(canvasId, labels, labelName, dataValues, color, isPercentage = false) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // Destrói instância anterior se existir
    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: labelName,
                data: dataValues,
                borderColor: color,
                backgroundColor: color + '20', // Transparência
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: color,
                pointRadius: 4,
                tension: 0.3, // Curva suave
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#333',
                    bodyColor: '#333',
                    borderColor: '#ddd',
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { borderDash: [2, 4], color: '#f0f0f0' },
                    ticks: { color: '#888' },
                    max: isPercentage ? 100 : undefined
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#888', maxRotation: 45, minRotation: 45 }
                }
            }
        }
    });
}