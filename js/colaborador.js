import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// 1. CONFIGURAÇÃO
// ============================================================
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

// Cache local
let metricsHistoryCache = [];

// ============================================================
// 2. FUNÇÕES GLOBAIS DE NAVEGAÇÃO
// ============================================================

window.showSection = (sectionId) => {
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));

    const activeLink = document.querySelector(`.nav-links li[onclick*="'${sectionId}'"]`);
    if (activeLink) activeLink.classList.add('active');

    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';
};

window.closeMetricModal = () => {
    const modal = document.getElementById('modal-metric-details');
    if (modal) modal.style.display = 'none';
};

window.logout = () => {
    signOut(auth).then(() => window.location.href = "index.html");
};

// ============================================================
// 3. CONFIRMAÇÃO DE LEITURA
// ============================================================
window.confirmRead = async (docId) => {
    if (!confirm("Deseja marcar este apontamento como lido?")) return;
    try {
        const docRef = doc(db, "occurrences", docId);
        await updateDoc(docRef, { read: true, readAt: new Date() });
        alert("Confirmação registrada!");
        if (auth.currentUser) {
            loadMyOccurrences(auth.currentUser.uid);
            loadFullHistory(auth.currentUser.uid);
        }
    } catch (error) {
        alert("Erro ao salvar: " + error.message);
    }
};

// ============================================================
// 4. DETALHES DE MÉTRICA (MODAL)
// ============================================================
window.openMetricDetail = (id) => {
    const modal = document.getElementById('modal-metric-details');
    const content = document.getElementById('metric-modal-content');
    const data = metricsHistoryCache.find(m => m.id === id);

    if (!data) return alert("Erro: Dados não encontrados.");

    // Formatação de valores
    const dateFmt = data.weekStart.split('-').reverse().join('/');
    const finalizados = data.atendimentosFinalizados || 0;
    const notaMonitoria = data.notaMonitoria || 0;
    
    // Telefonia
    const ligRecebidas = data.ligacoesRecebidas || 0;
    const ligPerdidas = data.ligacoesPerdidas || 0;
    const tmaTel = data.tmaTelefonia || 0;
    const tmeTel = data.tmeTelefonia || 0;
    
    // Chat
    const volChat = data.atendimentosHuggy || 0;
    const tmaChat = data.tmaHuggy || 0;

    const monitoriaColor = notaMonitoria >= 90 ? '#28a745' : (notaMonitoria >= 70 ? '#ffc107' : '#dc3545');

    content.innerHTML = `
        <div style="text-align: center; margin-bottom: 25px;">
            <h3 style="color: var(--color-dark-brown); font-size: 18px; margin: 0;">📅 Semana: ${dateFmt}</h3>
            <p style="color: #666; font-size: 13px; margin-top: 5px;">Resumo de produtividade e qualidade</p>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px;">
            <div style="background: #e8f5e9; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #c8e6c9;">
                <div style="font-size: 12px; text-transform: uppercase; color: #1b5e20; font-weight: bold; letter-spacing: 0.5px;">✅ Finalizados</div>
                <div style="font-size: 32px; font-weight: 800; color: #28a745; margin-top: 5px;">${finalizados}</div>
            </div>
            <div style="background: #fff8e1; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #ffecb3;">
                <div style="font-size: 12px; text-transform: uppercase; color: #ff6f00; font-weight: bold; letter-spacing: 0.5px;">🏆 Monitoria</div>
                <div style="font-size: 32px; font-weight: 800; color: ${monitoriaColor}; margin-top: 5px;">${notaMonitoria}</div>
            </div>
        </div>
        `;
    modal.style.display = 'block';
};

// ============================================================
// 5. INICIALIZAÇÃO E AUTH
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('user-name').innerText = user.email;
        loadMyMetrics(user.uid);
        loadMyOccurrences(user.uid);
        loadFullHistory(user.uid);
    } else {
        window.location.href = "index.html";
    }
});

function timeToSeconds(timeStr) {
    if(!timeStr || typeof timeStr !== 'string') return 0;
    const p = timeStr.split(':');
    let s = 0, m = 1;
    while (p.length > 0) { s += m * parseInt(p.pop(), 10); m *= 60; }
    return s;
}

function getTrendInfo(current, previous, type) {
    if (previous === undefined || previous === null) return { icon: '─', class: 'trend-neutral' };
    const isPositive = type === 'inverse' ? current < previous : current > previous;
    if (current === previous) return { icon: '─', class: 'trend-neutral' };
    return isPositive ? { icon: '▲', class: 'trend-positive' } : { icon: '▼', class: 'trend-negative' }; 
}

// ============================================================
// 6. DASHBOARD (CARDS E GRÁFICOS)
// ============================================================
async function loadMyMetrics(uid) {
    const container = document.getElementById('cards-container');
    if (container) container.innerHTML = "<p>Carregando métricas...</p>";

    try {
        // 1. Métricas Semanais
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

        // 3. Auditorias (QA)
        let auditData = { total: 0, conforme: 0, perc: 0 };
        try {
            const qAudit = query(collection(db, "audits"), where("collaboratorId", "==", uid));
            const snapAudit = await getDocs(qAudit);
            snapAudit.forEach(doc => {
                auditData.total++;
                if (doc.data().status === 'Conforme') auditData.conforme++;
            });
            if(auditData.total > 0) {
                auditData.perc = ((auditData.conforme / auditData.total) * 100).toFixed(1);
            }
        } catch(err) { console.error("Erro audits", err); }

        // --- CÁLCULO DE MÉDIAS GERAIS ---
        let averages = { monitoria: 0, tmaTel: 0, tmaChat: 0, volSemanal: 0 };
        if (userRawData.length > 0) {
            let sumMon = 0, sumTmaTel = 0, sumTmaChat = 0, sumVol = 0;
            userRawData.forEach(d => {
                sumMon += Number(d.notaMonitoria || 0);
                sumTmaTel += Number(d.tmaTelefonia || 0);
                sumTmaChat += Number(d.tmaHuggy || 0);
                sumVol += (Number(d.atendimentosFinalizados || 0) + Number(d.atendimentosHuggy || 0));
            });
            const count = userRawData.length;
            averages.monitoria = (sumMon / count).toFixed(1);
            averages.tmaTel = (sumTmaTel / count).toFixed(2);
            averages.tmaChat = (sumTmaChat / count).toFixed(2);
            averages.volSemanal = (sumVol / count).toFixed(0);
        }

        const userData = userRawData.length > 0 ? userRawData[userRawData.length - 1] : {};
        const sectorCurr = sectorRawData.length > 0 ? sectorRawData[sectorRawData.length - 1] : {};
        const sectorPrev = sectorRawData.length > 1 ? sectorRawData[sectorRawData.length - 2] : null;

        // Atualiza Cards com as novas médias
        updateCardsHTML(sectorCurr, sectorPrev, userData, averages, auditData);

        if (userRawData.length > 0) {
            let labels = [], dataMonitoria = [], dataAtendimentos = [];
            userRawData.forEach(d => {
                labels.push(d.weekStart.split('-').reverse().slice(0, 2).join('/'));
                dataMonitoria.push(d.notaMonitoria || 0);
                dataAtendimentos.push((d.atendimentosFinalizados || 0) + (d.atendimentosHuggy || 0));
            });
            renderCharts(labels, dataMonitoria, dataAtendimentos);
        }
    } catch (error) { console.error(error); }
}

function updateCardsHTML(sectorCurr, sectorPrev, userData, averages, auditData) {
    const container = document.getElementById('cards-container');
    if (!container) return;
    
    sectorCurr = sectorCurr || {};
    userData = userData || {};
    averages = averages || { monitoria: 0, tmaTel: 0, tmaChat: 0, volSemanal: 0 };

    const trendTMR = getTrendInfo(timeToSeconds(sectorCurr.tmr), sectorPrev ? timeToSeconds(sectorPrev.tmr) : null, 'inverse');
    const totalAtendimentosLastWeek = (userData.atendimentosFinalizados || 0) + (userData.atendimentosHuggy || 0);

    // Definição da cor da conformidade
    const confColor = auditData.perc >= 90 ? '#28a745' : (auditData.perc >= 80 ? '#ffc107' : '#dc3545');

    container.innerHTML = `
        <h3 style="margin-bottom: 15px; color: var(--color-taupe); font-size: 14px; text-transform: uppercase;">🚀 KPIs do Setor</h3>
        <div class="metrics-grid">
            <div class="metric-card" style="border-left: 5px solid #6f42c1;">
                <h3>⏱️ TMR Global</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <h1 style="font-size: 2.5em; margin: 10px 0; color: #6f42c1">${sectorCurr.tmr || '--:--'}</h1>
                    <span style="font-size:1.2em;" class="${trendTMR.class}">${trendTMR.icon}</span>
                </div>
            </div>
            <div class="metric-card" style="border-left: 5px solid #17a2b8;">
                <h3>🎯 FCR Global</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0; color: #17a2b8">${sectorCurr.fcr || 0}%</h1>
            </div>
            <div class="metric-card" style="border-left: 5px solid #6f42c1;">
                <h3>🔁 Reincidência</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0; color: #6f42c1">${sectorCurr.reincidencia || 0}%</h1>
            </div>
        </div>

        <hr style="border: 0; border-top: 1px dashed #ddd; margin: 10px 0 30px 0;">

        <h3 style="margin-bottom: 15px; color: var(--color-main-red); font-size: 14px; text-transform: uppercase;">📊 Minhas Médias (Histórico) & Qualidade</h3>
        <div class="metrics-grid">
            <div class="metric-card" style="border-left: 5px solid #28a745;">
                <h3>Média Monitoria</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${averages.monitoria}</h1>
            </div>
            <div class="metric-card" style="border-left: 5px solid #007bff;">
                <h3>Média TMA Tel</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${averages.tmaTel} <small style="font-size:0.4em; color:#666;">min</small></h1>
            </div>
             <div class="metric-card" style="border-left: 5px solid #6610f2;">
                <h3>Média TMA Chat</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${averages.tmaChat} <small style="font-size:0.4em; color:#666;">min</small></h1>
            </div>
            <div class="metric-card" style="border-left: 5px solid ${confColor}; background: #fffbfb;">
                <h3>✅ Conformidade QA</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0; color: ${confColor};">${auditData.perc}%</h1>
                <p style="font-size:11px; color:#666;">Baseado em ${auditData.total} auditorias</p>
            </div>
        </div>

        <hr style="border: 0; border-top: 1px dashed #ddd; margin: 10px 0 30px 0;">

        <h3 style="margin-bottom: 15px; color: var(--color-taupe); font-size: 14px; text-transform: uppercase;">👤 Meu Desempenho (Última Semana)</h3>
        <div class="metrics-grid">
            <div class="metric-card" style="border-left: 5px solid #28a745;">
                <h3>Monitoria</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${userData.notaMonitoria || 0}</h1>
            </div>
            <div class="metric-card" style="border-left: 5px solid #007bff;">
                <h3>TMA Telefonia</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${userData.tmaTelefonia || 0}</h1>
            </div>
            <div class="metric-card" style="border-left: 5px solid #ffc107;">
                <h3>Total Finalizados</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${totalAtendimentosLastWeek}</h1>
            </div>
        </div>
    `;
}

function renderCharts(labels, monitoria, atendimentos) {
    const ctx1 = document.getElementById('chartMonitoria');
    const ctx2 = document.getElementById('chartProdutividade');
    // Destrói gráficos antigos se existirem para evitar sobreposição
    if (window.myChart1) window.myChart1.destroy();
    if (window.myChart2) window.myChart2.destroy();

    if (ctx1) {
        window.myChart1 = new Chart(ctx1, { 
            type: 'line', 
            data: { 
                labels, 
                datasets: [{ label: 'Nota Semanal', data: monitoria, borderColor: '#28a745', tension: 0.3, fill: true, backgroundColor: 'rgba(40, 167, 69, 0.1)' }] 
            }, 
            options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } } 
        });
    }
    if (ctx2) {
        window.myChart2 = new Chart(ctx2, { 
            type: 'bar', 
            data: { 
                labels, 
                datasets: [{ label: 'Volume Total', data: atendimentos, backgroundColor: '#007bff' }] 
            }, 
            options: { responsive: true } 
        });
    }
}

// Mantém as outras funções (loadMyOccurrences, loadFullHistory) iguais ao arquivo original
// Apenas garanta que o arquivo termine com elas. Como o JS module tem escopo fechado, 
// o código acima substitui todo o arquivo js/colaborador.js para garantir que as variáveis novas funcionem.
// Adicione abaixo as funções restantes do seu arquivo original (loadMyOccurrences e loadFullHistory)
// Se já estiverem no arquivo, apenas substitua a função loadMyMetrics e updateCardsHTML.
// Para facilitar, incluirei as funções restantes aqui para um copy-paste completo.

async function loadMyOccurrences(uid) {
    const listContainer = document.getElementById('feedbacks-list');
    if(!listContainer) return;
    listContainer.innerHTML = `<div style="text-align:center; padding:40px;"><i class="material-icons spinning">sync</i> Carregando...</div>`;

    try {
        const q = query(collection(db, "occurrences"), where("userId", "==", uid));
        const snap = await getDocs(q);
        let docs = [];
        snap.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => new Date(b.date) - new Date(a.date)); 

        listContainer.innerHTML = ""; 
        if (docs.length === 0) {
            listContainer.innerHTML = `<p style="padding:20px; text-align:center;">Nenhum feedback registrado.</p>`;
            return;
        }

        docs.forEach(item => {
            const dateStr = item.date ? item.date.split('-').reverse().join('/') : '-';
            let iconClass, typeClass;
            if (item.type === 'positive') { iconClass = '<span style="color:#28a745">👍 Elogio</span>'; typeClass = 'positive'; } 
            else if (item.type === 'neutral') { iconClass = '<span style="color:#6c757d">ℹ️ Orientação</span>'; typeClass = 'neutral'; } 
            else { iconClass = '<span style="color:#dc3545">⚠️ Ponto de Atenção</span>'; typeClass = 'negative'; }

            let metaInfo = "";
            if (item.origin || item.protocol) {
                metaInfo = `<div style="margin-bottom: 12px; font-size: 12px; color: #555; background: #f8f9fa; padding: 6px 10px; border-radius: 4px; display: inline-block;">`;
                if(item.origin) metaInfo += `<strong style="margin-right:10px;">🔍 Origem: ${item.origin}</strong>`;
                if(item.protocol) metaInfo += `<strong>🆔 Protocolo: ${item.protocol}</strong>`;
                metaInfo += `</div>`;
            }

            const footerHtml = item.read 
                ? `<div style="text-align:right; border-top:1px solid #eee; padding-top:10px; color:green; font-size:12px;">✔ Lido em ${new Date(item.readAt.seconds * 1000).toLocaleDateString()}</div>`
                : `<div style="text-align:right; border-top:1px solid #eee; padding-top:10px;"><button onclick="confirmRead('${item.id}')" style="background:#dc3545; color:white; border:none; padding:8px 15px; border-radius:4px; cursor:pointer;">Marcar como Ciente</button></div>`;

            listContainer.innerHTML += `
                <div class="timeline-card ${typeClass}">
                    <div class="card-header">
                        <div class="card-title">${iconClass} | ${item.title}</div>
                        <div class="card-date">${dateStr}</div>
                    </div>
                    ${metaInfo} <div class="card-body">${item.description}</div>
                    ${footerHtml}
                </div>`;
        });
    } catch (error) { listContainer.innerHTML = "<p>Erro ao carregar lista.</p>"; }
}

window.loadFullHistory = async (uid) => {
    const tbodyMetrics = document.getElementById('history-metrics-body');
    if (tbodyMetrics) {
        tbodyMetrics.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
        try {
            const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
            const snap = await getDocs(q);
            metricsHistoryCache = [];
            snap.forEach(d => metricsHistoryCache.push({ id: d.id, ...d.data() }));
            metricsHistoryCache.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
            
            tbodyMetrics.innerHTML = "";
            if(metricsHistoryCache.length === 0) tbodyMetrics.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro.</td></tr>';
            else {
                metricsHistoryCache.forEach(m => {
                    const dateFmt = m.weekStart.split('-').reverse().join('/');
                    const totalVol = (m.atendimentosFinalizados||0) + (m.atendimentosHuggy||0);
                    tbodyMetrics.innerHTML += `<tr><td>${dateFmt}</td><td>${m.notaMonitoria}</td><td>${m.tmaTelefonia}</td><td>${m.tmaHuggy}</td><td>${totalVol}</td><td><button onclick="openMetricDetail('${m.id}')" style="background: #17a2b8; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer;"><i class="material-icons" style="font-size: 16px;">visibility</i></button></td></tr>`;
                });
            }
        } catch(e) {}
    }
    // Parte de ocorrências omitida pois já carregada em loadMyOccurrences, mas pode manter se usar tabelas separadas.
};