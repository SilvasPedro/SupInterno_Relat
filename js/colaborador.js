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

// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ============================================================
// 2. FUNÇÕES GLOBAIS (PARA O HTML ACESSAR)
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

// Confirma leitura do feedback (chamado na tela de Feedbacks)
window.confirmRead = async (docId) => {
    if (!confirm("Deseja marcar este apontamento como lido?")) return;
    try {
        const docRef = doc(db, "occurrences", docId);
        await updateDoc(docRef, { read: true, readAt: new Date() });
        alert("Confirmação registrada!");
        if (auth.currentUser) {
            loadMyOccurrences(auth.currentUser.uid); // Atualiza Timeline
            loadFullHistory(auth.currentUser.uid);   // Atualiza Tabela
        }
    } catch (error) {
        console.error("Erro ao confirmar leitura:", error);
        alert("Erro ao salvar: " + error.message);
    }
};

window.closeMetricModal = () => {
    document.getElementById('modal-metric-details').style.display = 'none';
};

// ============================================================
// 3. LÓGICA PRINCIPAL (AUTH & CARREGAMENTO)
// ============================================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.innerText = user.email;

        loadMyMetrics(user.uid);      // Dashboard
        loadMyOccurrences(user.uid);  // Timeline Feedbacks
        loadFullHistory(user.uid);    // Histórico Completo (Tabelas)
    } else {
        window.location.href = "index.html";
    }
});

// ============================================================
// 4. MÓDULO DE MÉTRICAS (CARDS E GRÁFICOS)
// ============================================================

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
    if (previous === undefined || previous === null) {
        return { icon: '─', label: 'Sem histórico', class: 'trend-neutral' };
    }
    
    let isPositive = false;
    if (type === 'inverse') {
        isPositive = current < previous;
    } else {
        isPositive = current > previous;
    }

    if (current === previous) return { icon: '─', label: 'Estável', class: 'trend-neutral' };

    return isPositive 
        ? { icon: '▲', label: 'Melhorou', class: 'trend-positive' } 
        : { icon: '▼', label: 'Piorou', class: 'trend-negative' }; 
}

async function loadMyMetrics(uid) {
    const container = document.getElementById('cards-container');
    if (container) container.innerHTML = "<p>Carregando métricas...</p>";

    try {
        // 1. Busca Métricas Individuais
        const qUser = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const snapUser = await getDocs(qUser);
        let userRawData = [];
        snapUser.forEach(doc => userRawData.push(doc.data()));
        userRawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        // 2. Busca Métricas do Setor
        let sectorRawData = [];
        try {
            const qSector = query(collection(db, "sector_metrics")); 
            const snapSector = await getDocs(qSector);
            snapSector.forEach(doc => sectorRawData.push(doc.data()));
            sectorRawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
        } catch (errSector) { console.warn(errSector); }

        const userData = userRawData.length > 0 ? userRawData[userRawData.length - 1] : {};
        const sectorCurr = sectorRawData.length > 0 ? sectorRawData[sectorRawData.length - 1] : {};
        const sectorPrev = sectorRawData.length > 1 ? sectorRawData[sectorRawData.length - 2] : null;

        updateCardsHTML(sectorCurr, sectorPrev, userData);

        if (userRawData.length > 0) {
            let labels = [];
            let dataMonitoria = [];
            let dataAtendimentos = [];
            
            userRawData.forEach(d => {
                const dataFmt = d.weekStart.split('-').reverse().slice(0, 2).join('/');
                labels.push(dataFmt);
                dataMonitoria.push(d.notaMonitoria || 0);
                const total = (d.atendimentosFinalizados || 0) + (d.atendimentosHuggy || 0);
                dataAtendimentos.push(total);
            });
            renderCharts(labels, dataMonitoria, dataAtendimentos);
        } else {
             if(container) container.innerHTML += "<br><small>Sem dados individuais para gráficos.</small>";
        }

    } catch (error) {
        console.error("Erro Metrics:", error);
        if (container) container.innerText = "Erro ao carregar dados.";
    }
}

function updateCardsHTML(sectorCurr, sectorPrev, userData) {
    const container = document.getElementById('cards-container');
    if (!container) return;
    
    if (!sectorCurr) sectorCurr = {};
    if (!userData) userData = {};

    const currTmrSec = timeToSeconds(sectorCurr.tmr);
    const prevTmrSec = sectorPrev ? timeToSeconds(sectorPrev.tmr) : null;
    const trendTMR = getTrendInfo(currTmrSec, prevTmrSec, 'inverse');

    const currFcr = sectorCurr.fcr || 0;
    const prevFcr = sectorPrev ? sectorPrev.fcr : null;
    const trendFCR = getTrendInfo(currFcr, prevFcr, 'direct');

    const currRein = sectorCurr.reincidencia || 0;
    const prevRein = sectorPrev ? sectorPrev.reincidencia : null;
    const trendRein = getTrendInfo(currRein, prevRein, 'inverse');

    const totalAtendimentos = (userData.atendimentosFinalizados || 0) + (userData.atendimentosHuggy || 0);

    container.innerHTML = `
        <h3 style="margin-bottom: 15px; color: var(--color-taupe); font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
            🚀 Performance da Equipe
        </h3>
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
                    <h1 style="font-size: 2.5em; margin: 10px 0; color: #17a2b8">${currFcr}%</h1>
                    <span style="font-size:1.2em; color:${trendFCR.class === 'trend-positive' ? '#28a745' : (trendFCR.class === 'trend-negative' ? '#dc3545' : '#ccc')}">${trendFCR.icon}</span>
                </div>
                <p>Média do Setor</p>
            </div>
            <div class="metric-card" style="border-left: 5px solid #dc3545;">
                <h3>🔄 Reincidência (Equipe)</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <h1 style="font-size: 2.5em; margin: 10px 0; color: #dc3545">${currRein}%</h1>
                    <span style="font-size:1.2em; color:${trendRein.class === 'trend-positive' ? '#28a745' : (trendRein.class === 'trend-negative' ? '#dc3545' : '#ccc')}">${trendRein.icon}</span>
                </div>
                <p>Média do Setor</p>
            </div>
        </div>

        <hr style="border: 0; border-top: 1px dashed #ddd; margin: 10px 0 30px 0;">

        <h3 style="margin-bottom: 15px; color: var(--color-taupe); font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
            👤 Meu Desempenho
        </h3>
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

    if (ctx1) {
        new Chart(ctx1, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Nota Semanal',
                    data: monitoria,
                    borderColor: '#28a745',
                    tension: 0.3,
                    fill: true,
                    backgroundColor: 'rgba(40, 167, 69, 0.1)'
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
        });
    }

    if (ctx2) {
        new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Volume Total',
                    data: atendimentos,
                    backgroundColor: '#007bff'
                }]
            },
            options: { responsive: true }
        });
    }
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
        const querySnapshot = await getDocs(q);
        
        let docs = [];
        querySnapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => new Date(b.date) - new Date(a.date)); 

        listContainer.innerHTML = ""; 

        if (docs.length === 0) {
            listContainer.innerHTML = `<p style="padding:20px; text-align:center;">Nenhum feedback registrado.</p>`;
            return;
        }

        docs.forEach(item => {
            const dateStr = item.date ? item.date.split('-').reverse().join('/') : '-';
            const isPositive = item.type === 'positive';
            const cardClass = isPositive ? 'positive' : 'negative';
            const icon = isPositive ? '<span style="color:#28a745">👍 Elogio</span>' : '<span style="color:#dc3545">⚠️ Ponto de Atenção</span>';
            
            let footerHtml = '';
            if (item.read) {
                const readDate = item.readAt ? new Date(item.readAt.seconds * 1000).toLocaleDateString() : '';
                footerHtml = `<div style="text-align:right; border-top:1px solid #eee; padding-top:10px; color:green; font-size:12px;">✔ Lido em ${readDate}</div>`;
            } else {
                footerHtml = `<div style="text-align:right; border-top:1px solid #eee; padding-top:10px;"><button onclick="confirmRead('${item.id}')" style="background:#dc3545; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">Marcar como Ciente</button></div>`;
            }

            listContainer.innerHTML += `
                <div class="timeline-card ${cardClass}">
                    <div class="card-header">
                        <div class="card-title">${icon} | ${item.title}</div>
                        <div class="card-date">${dateStr}</div>
                    </div>
                    <div class="card-body">${item.description}</div>
                    ${footerHtml}
                </div>
            `;
        });

    } catch (error) {
        console.error("Erro Feedbacks:", error);
        listContainer.innerHTML = "<p>Erro ao carregar lista.</p>";
    }
}

// ============================================================
// 6. HISTÓRICO COMPLETO (TABELAS) - CORRIGIDO
// ============================================================
window.loadFullHistory = async (uid) => {
    // --- PARTE 1: MÉTRICAS ---
    const tbodyMetrics = document.getElementById('history-metrics-body');
    if (tbodyMetrics) {
        tbodyMetrics.innerHTML = '<tr><td colspan="6">Carregando...</td></tr>';
        try {
            const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
            const snap = await getDocs(q);
            let data = [];
            snap.forEach(d => data.push(d.data()));
            data.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
            
            tbodyMetrics.innerHTML = "";
            if(data.length === 0) {
                 tbodyMetrics.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro.</td></tr>';
            } else {
                data.forEach(m => {
                    const dateFmt = m.weekStart.split('-').reverse().join('/');
                    tbodyMetrics.innerHTML += `
                        <tr>
                            <td>${dateFmt}</td>
                            <td>${m.notaMonitoria}</td>
                            <td>${m.tmaTelefonia}</td>
                            <td>${m.tmaHuggy}</td>
                            <td>${(m.atendimentosFinalizados||0) + (m.atendimentosHuggy||0)}</td>
                            <td>-</td>
                        </tr>`;
                });
            }
        } catch(e) { console.error(e); }
    }

    // --- PARTE 2: FEEDBACKS (O CÓDIGO QUE FALTAVA) ---
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
                tbodyOccur.innerHTML = '<tr><td colspan="5" style="text-align:center;">Nenhum feedback registrado.</td></tr>';
            } else {
                docs.forEach(item => {
                    const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';
                    const typeLabel = item.type === 'positive' 
                        ? '<span style="color:#28a745; font-weight:bold;">Positiva</span>' 
                        : '<span style="color:#dc3545; font-weight:bold;">Negativa</span>';
                    
                    const statusLabel = item.read 
                        ? '<span style="color:#28a745; background:#e8f5e9; padding:2px 8px; border-radius:10px; font-size:12px;">Lido</span>' 
                        : `<button onclick="confirmRead('${item.id}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;">Marcar Ciente</button>`;

                    tbodyOccur.innerHTML += `
                        <tr>
                            <td>${dateFmt}</td>
                            <td>${typeLabel}</td>
                            <td>${item.title}</td>
                            <td style="font-size:13px; color:#555;">${item.description}</td>
                            <td>${statusLabel}</td>
                        </tr>
                    `;
                });
            }
        } catch(e) { 
            console.error(e); 
            tbodyOccur.innerHTML = '<tr><td colspan="5">Erro ao carregar dados.</td></tr>';
        }
    }
};