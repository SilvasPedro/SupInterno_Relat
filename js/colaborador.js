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

// Cache local para abrir o modal sem recarregar do banco
let metricsHistoryCache = [];

// ============================================================
// 2. FUNÇÕES GLOBAIS
// ============================================================

window.showSection = (sectionId) => {
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';
};

window.logout = () => {
    signOut(auth).then(() => window.location.href = "index.html");
};

// Confirma leitura de feedback
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

// --- VISUALIZAÇÃO DETALHADA (NOVA) ---
window.openMetricDetail = (id) => {
    const modal = document.getElementById('modal-metric-details');
    const content = document.getElementById('metric-modal-content');
    
    // Busca o dado no cache local
    const data = metricsHistoryCache.find(m => m.id === id);

    if (!data) {
        alert("Erro: Dados não encontrados para visualização.");
        return;
    }

    const dateFmt = data.weekStart.split('-').reverse().join('/');

    // Monta o Layout do Modal (Grid bonita)
    content.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 5px solid #007bff;">
                <h3 style="color: #007bff; margin-bottom: 15px; border-bottom: 1px solid #e9ecef; padding-bottom: 5px;">
                    <i class="material-icons" style="vertical-align: bottom; font-size: 20px;">phone</i> Telefonia
                </h3>
                <p><strong>Recebidas:</strong> ${data.ligacoesRecebidas || 0}</p>
                <p><strong>Realizadas:</strong> ${data.ligacoesRealizadas || 0}</p>
                <p><strong>Perdidas:</strong> <span style="color:${(data.ligacoesPerdidas > 0) ? 'red' : 'inherit'}; font-weight:bold;">${data.ligacoesPerdidas || 0}</span></p>
                <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                <p><strong>TMA:</strong> ${data.tmaTelefonia || 0} min</p>
                <p><strong>TME:</strong> ${data.tmeTelefonia || 0} seg </p>
            </div>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 5px solid #28a745;">
                <h3 style="color: #28a745; margin-bottom: 15px; border-bottom: 1px solid #e9ecef; padding-bottom: 5px;">
                    <i class="material-icons" style="vertical-align: bottom; font-size: 20px;">chat</i> Chat & Qualidade
                </h3>
                <p><strong>Vol. Huggy:</strong> ${data.atendimentosHuggy || 0}</p>
                <p><strong>TMA Chat:</strong> ${data.tmaHuggy || 0} min</p>
                <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                <p style="font-size:1.1em;"><strong>Monitoria:</strong> <span style="background: #e8f5e9; padding: 2px 8px; border-radius: 4px; color: #1b5e20; font-weight:bold;">${data.notaMonitoria || 0}</span></p>
            </div>

        </div>

        <div style="margin-top: 20px; background: #332D27; color: #FAE1C0; padding: 20px; border-radius: 8px; text-align: center;">
            <h3 style="margin:0; font-size:18px;">
                Semana de ${dateFmt} • Total Finalizado: ${(data.atendimentosFinalizados || 0) + (data.atendimentosHuggy || 0)}
            </h3>
            <p style="margin-top:5px; font-size:13px; opacity:0.8;">Atendimentos Abertos (Pendentes): ${data.atendimentosAbertos || 0}</p>
        </div>
    `;

    modal.style.display = 'block';
};

window.closeMetricModal = () => {
    document.getElementById('modal-metric-details').style.display = 'none';
};

// ============================================================
// 3. LÓGICA PRINCIPAL
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

// Funções Auxiliares (Tempo e Tendência)
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

function getTrendInfo(current, previous, type) {
    if (previous === undefined || previous === null) return { icon: '─', label: 'Neutro', class: 'trend-neutral' };
    const isPositive = type === 'inverse' ? current < previous : current > previous;
    if (current === previous) return { icon: '─', label: 'Estável', class: 'trend-neutral' };
    return isPositive 
        ? { icon: '▲', label: 'Melhorou', class: 'trend-positive' } 
        : { icon: '▼', label: 'Piorou', class: 'trend-negative' }; 
}

// ============================================================
// 4. CARDS DE PERFORMANCE (DASHBOARD)
// ============================================================
async function loadMyMetrics(uid) {
    const container = document.getElementById('cards-container');
    if (container) container.innerHTML = "<p>Carregando métricas...</p>";

    try {
        const qUser = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const snapUser = await getDocs(qUser);
        let userRawData = [];
        snapUser.forEach(doc => userRawData.push(doc.data()));
        userRawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        let sectorRawData = [];
        try {
            const qSector = query(collection(db, "sector_metrics")); 
            const snapSector = await getDocs(qSector);
            snapSector.forEach(doc => sectorRawData.push(doc.data()));
            sectorRawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
        } catch (err) { console.warn(err); }

        const userData = userRawData.length > 0 ? userRawData[userRawData.length - 1] : {};
        const sectorCurr = sectorRawData.length > 0 ? sectorRawData[sectorRawData.length - 1] : {};
        const sectorPrev = sectorRawData.length > 1 ? sectorRawData[sectorRawData.length - 2] : null;

        updateCardsHTML(sectorCurr, sectorPrev, userData);

        if (userRawData.length > 0) {
            let labels = [], dataMonitoria = [], dataAtendimentos = [];
            userRawData.forEach(d => {
                labels.push(d.weekStart.split('-').reverse().slice(0, 2).join('/'));
                dataMonitoria.push(d.notaMonitoria || 0);
                dataAtendimentos.push((d.atendimentosFinalizados || 0) + (d.atendimentosHuggy || 0));
            });
            renderCharts(labels, dataMonitoria, dataAtendimentos);
        } else {
             if(container) container.innerHTML += "<br><small>Sem dados para gráficos.</small>";
        }
    } catch (error) { console.error("Erro Metrics:", error); }
}

function updateCardsHTML(sectorCurr, sectorPrev, userData) {
    const container = document.getElementById('cards-container');
    if (!container) return;
    
    // Tratamento de nulos
    sectorCurr = sectorCurr || {};
    userData = userData || {};

    const trendTMR = getTrendInfo(timeToSeconds(sectorCurr.tmr), sectorPrev ? timeToSeconds(sectorPrev.tmr) : null, 'inverse');
    const trendFCR = getTrendInfo(sectorCurr.fcr || 0, sectorPrev ? sectorPrev.fcr : null, 'direct');
    const trendRein = getTrendInfo(sectorCurr.reincidencia || 0, sectorPrev ? sectorPrev.reincidencia : null, 'inverse');

    const totalAtendimentos = (userData.atendimentosFinalizados || 0) + (userData.atendimentosHuggy || 0);

    container.innerHTML = `
        <h3 style="margin-bottom: 15px; color: var(--color-taupe); font-size: 14px; text-transform: uppercase;">🚀 Performance da Equipe</h3>
        <div class="metrics-grid">
            <div class="metric-card" style="border-left: 5px solid #6f42c1;">
                <h3>⏱️ TMR (Equipe)</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <h1 style="font-size: 2.5em; margin: 10px 0; color: #6f42c1">${sectorCurr.tmr || '--:--'}</h1>
                    <span style="font-size:1.2em; color:${trendTMR.class === 'trend-positive' ? '#28a745' : (trendTMR.class === 'trend-negative' ? '#dc3545' : '#ccc')}">${trendTMR.icon}</span>
                </div>
                <p>Média do Setor</p>
            </div>
            <div class="metric-card" style="border-left: 5px solid #17a2b8;">
                <h3>🎯 FCR (Equipe)</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <h1 style="font-size: 2.5em; margin: 10px 0; color: #17a2b8">${sectorCurr.fcr || 0}%</h1>
                    <span style="font-size:1.2em; color:${trendFCR.class === 'trend-positive' ? '#28a745' : (trendFCR.class === 'trend-negative' ? '#dc3545' : '#ccc')}">${trendFCR.icon}</span>
                </div>
                <p>Média do Setor</p>
            </div>
            <div class="metric-card" style="border-left: 5px solid #dc3545;">
                <h3>🔄 Reincidência (Equipe)</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <h1 style="font-size: 2.5em; margin: 10px 0; color: #dc3545">${sectorCurr.reincidencia || 0}%</h1>
                    <span style="font-size:1.2em; color:${trendRein.class === 'trend-positive' ? '#28a745' : (trendRein.class === 'trend-negative' ? '#dc3545' : '#ccc')}">${trendRein.icon}</span>
                </div>
                <p>Média do Setor</p>
            </div>
        </div>
        <hr style="border: 0; border-top: 1px dashed #ddd; margin: 10px 0 30px 0;">
        <h3 style="margin-bottom: 15px; color: var(--color-taupe); font-size: 14px; text-transform: uppercase;">👤 Meu Desempenho</h3>
        <div class="metrics-grid">
            <div class="metric-card" style="border-left: 5px solid #28a745;">
                <h3>Minha Monitoria</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${userData.notaMonitoria || 0}</h1>
                <p>Qualidade Individual</p>
            </div>
            <div class="metric-card" style="border-left: 5px solid #007bff;">
                <h3>Meu TMA Telefonia</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${userData.tmaTelefonia || 0}</h1>
                <p>Minutos</p>
            </div>
            <div class="metric-card" style="border-left: 5px solid #ffc107;">
                <h3>Meus Atendimentos</h3>
                <h1 style="font-size: 2.5em; margin: 10px 0;">${totalAtendimentos}</h1>
                <p>Total Realizado</p>
            </div>
        </div>
    `;
}

function renderCharts(labels, monitoria, atendimentos) {
    const ctx1 = document.getElementById('chartMonitoria');
    const ctx2 = document.getElementById('chartProdutividade');
    if (ctx1) new Chart(ctx1, { type: 'line', data: { labels, datasets: [{ label: 'Nota Semanal', data: monitoria, borderColor: '#28a745', tension: 0.3, fill: true, backgroundColor: 'rgba(40, 167, 69, 0.1)' }] }, options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } } });
    if (ctx2) new Chart(ctx2, { type: 'bar', data: { labels, datasets: [{ label: 'Volume Total', data: atendimentos, backgroundColor: '#007bff' }] }, options: { responsive: true } });
}

// ============================================================
// 5. MÓDULO DE OCORRÊNCIAS (TIMELINE)
// ============================================================
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
            const isPositive = item.type === 'positive';
            const icon = isPositive ? '<span style="color:#28a745">👍 Elogio</span>' : '<span style="color:#dc3545">⚠️ Ponto de Atenção</span>';
            const footerHtml = item.read 
                ? `<div style="text-align:right; border-top:1px solid #eee; padding-top:10px; color:green; font-size:12px;">✔ Lido em ${new Date(item.readAt.seconds * 1000).toLocaleDateString()}</div>`
                : `<div style="text-align:right; border-top:1px solid #eee; padding-top:10px;"><button onclick="confirmRead('${item.id}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Marcar como Ciente</button></div>`;

            listContainer.innerHTML += `
                <div class="timeline-card ${isPositive ? 'positive' : 'negative'}">
                    <div class="card-header"><div class="card-title">${icon} | ${item.title}</div><div class="card-date">${dateStr}</div></div>
                    <div class="card-body">${item.description}</div>${footerHtml}
                </div>`;
        });
    } catch (error) { listContainer.innerHTML = "<p>Erro ao carregar lista.</p>"; }
}

// ============================================================
// 6. HISTÓRICO COMPLETO (TABELAS)
// ============================================================
window.loadFullHistory = async (uid) => {
    // --- 1. MÉTRICAS (COM BOTÃO DE DETALHES) ---
    const tbodyMetrics = document.getElementById('history-metrics-body');
    if (tbodyMetrics) {
        tbodyMetrics.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
        try {
            const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
            const snap = await getDocs(q);
            metricsHistoryCache = []; // Limpa cache
            snap.forEach(d => metricsHistoryCache.push({ id: d.id, ...d.data() }));
            
            // Ordena
            metricsHistoryCache.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
            
            tbodyMetrics.innerHTML = "";
            if(metricsHistoryCache.length === 0) {
                 tbodyMetrics.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro.</td></tr>';
            } else {
                metricsHistoryCache.forEach(m => {
                    const dateFmt = m.weekStart.split('-').reverse().join('/');
                    const totalVol = (m.atendimentosFinalizados||0) + (m.atendimentosHuggy||0);
                    
                    tbodyMetrics.innerHTML += `
                        <tr>
                            <td>${dateFmt}</td>
                            <td>${m.notaMonitoria}</td>
                            <td>${m.tmaTelefonia}</td>
                            <td>${m.tmaHuggy}</td>
                            <td>${totalVol}</td>
                            <td>
                                <button onclick="openMetricDetail('${m.id}')" 
                                        style="background: #17a2b8; color: white; border: none; border-radius: 4px; padding: 5px 10px; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                                    <i class="material-icons" style="font-size: 16px;">visibility</i>
                                </button>
                            </td>
                        </tr>`;
                });
            }
        } catch(e) { console.error(e); }
    }

    // --- 2. FEEDBACKS ---
    const tbodyOccur = document.getElementById('history-occurrences-body');
    if (tbodyOccur) {
        tbodyOccur.innerHTML = '<tr><td colspan="5">Carregando...</td></tr>';
        try {
            const q = query(collection(db, "occurrences"), where("userId", "==", uid));
            const snap = await getDocs(q);
            let docs = [];
            snap.forEach(d => docs.push({id: d.id, ...d.data()}));
            docs.sort((a,b) => new Date(b.date) - new Date(a.date));

            tbodyOccur.innerHTML = "";
            if (docs.length === 0) {
                tbodyOccur.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum feedback.</td></tr>';
            } else {
                docs.forEach(item => {
                    const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';
                    const typeLabel = item.type === 'positive' ? '<span style="color:#28a745; font-weight:bold;">Positiva</span>' : '<span style="color:#dc3545; font-weight:bold;">Negativa</span>';
                    const statusLabel = item.read ? '<span style="color:#28a745; background:#e8f5e9; padding:2px 8px; border-radius:10px; font-size:12px;">Lido</span>' : `<button onclick="confirmRead('${item.id}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Marcar Ciente</button>`;
                    
                    tbodyOccur.innerHTML += `<tr><td>${dateFmt}</td><td>${typeLabel}</td><td>${item.title}</td><td style="font-size:13px; color:#555;">${item.description}</td><td>${statusLabel}</td></tr>`;
                });
            }
        } catch(e) { console.error(e); }
    }
};