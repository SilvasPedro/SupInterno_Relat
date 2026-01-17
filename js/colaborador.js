import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// 1. CONFIGURAÇÃO (PREENCHA COM SEUS DADOS)
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

// A. Navegação entre abas
window.showSection = (sectionId) => {
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));

    // Atualiza menu visualmente (opcional, simples)
    // Nota: Para destacar o menu corretamente, precisaria passar o 'this' do click, 
    // mas o foco aqui é a navegação funcionar.

    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';
};

// B. Logout
window.logout = () => {
    signOut(auth).then(() => window.location.href = "index.html");
};

// C. Confirmar Leitura de Ocorrência
window.confirmRead = async (docId) => {
    if (!confirm("Deseja marcar este apontamento como lido?")) return;

    try {
        const docRef = doc(db, "occurrences", docId);
        await updateDoc(docRef, {
            read: true,
            readAt: new Date()
        });
        alert("Confirmação registrada!");
        if (auth.currentUser) loadMyOccurrences(auth.currentUser.uid);
    } catch (error) {
        console.error("Erro ao confirmar leitura:", error);
        alert("Erro ao salvar: " + error.message);
    }
};

// D. Mostrar Detalhes (CORREÇÃO DO BUG)
window.showMetricDetails = (rec, real, perd, tme) => {
    const msg = `📞 DETALHES DE TELEFONIA:\n\n` +
        `• Recebidas (Atendidas): ${rec}\n` +
        `• Realizadas (Atendidas): ${real}\n` +
        `• Perdidas: ${perd}\n` +
        `• TME (Espera): ${tme}`;
    alert(msg);
};

// ============================================================
// 3. LÓGICA PRINCIPAL (AUTH & CARREGAMENTO)
// ============================================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const nameEl = document.getElementById('user-name');
        if (nameEl) nameEl.innerText = user.email;

        // Carrega os módulos
        loadMyMetrics(user.uid);
        loadMyOccurrences(user.uid);

        // Deixa a tabela pronta (ou carrega quando clica na aba, mas aqui garante os dados)
        // O HTML chama loadFullHistory() sem argumentos, que pega o current user.
    } else {
        window.location.href = "index.html";
    }
});

// ============================================================
// 4. MÓDULO DE MÉTRICAS (GRÁFICOS)
// ============================================================
async function loadMyMetrics(uid) {
    const container = document.getElementById('cards-container');
    if (container) container.innerHTML = "<p>Carregando métricas...</p>";

    try {
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);

        let rawData = [];
        querySnapshot.forEach((doc) => rawData.push(doc.data()));
        rawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        if (rawData.length === 0) {
            if (container) container.innerHTML = "<p>Nenhuma métrica lançada ainda.</p>";
            return;
        }

        let labels = [];
        let dataMonitoria = [];
        let dataAtendimentos = [];

        rawData.forEach(d => {
            const dataFmt = d.weekStart.split('-').reverse().slice(0, 2).join('/');
            labels.push(dataFmt);
            dataMonitoria.push(d.notaMonitoria);
            const total = (d.atendimentosFinalizados || 0) + (d.atendimentosHuggy || 0);
            dataAtendimentos.push(total);
        });

        updateCardsHTML(rawData[rawData.length - 1]);
        renderCharts(labels, dataMonitoria, dataAtendimentos);

    } catch (error) {
        console.error("Erro Metrics:", error);
        if (container) container.innerText = "Erro ao carregar dados.";
    }
}

function updateCardsHTML(data) {
    const container = document.getElementById('cards-container');
    if (!container) return;
    const totalAtendimentos = (data.atendimentosFinalizados || 0) + (data.atendimentosHuggy || 0);

    container.innerHTML = `
        <div class="metric-card" style="border-left: 5px solid #28a745;">
            <h3>Nota Monitoria</h3>
            <h1 style="font-size: 3em; margin: 10px 0;">${data.notaMonitoria || 0}</h1>
            <p>Semana de ${data.weekStart}</p>
        </div>
        <div class="metric-card" style="border-left: 5px solid #007bff;">
            <h3>TMA Telefonia</h3>
            <h1 style="font-size: 3em; margin: 10px 0;">${data.tmaTelefonia || 0}</h1>
            <p>Minutos</p>
        </div>
        <div class="metric-card" style="border-left: 5px solid #ffc107;">
            <h3>Total Atendimentos</h3>
            <h1 style="font-size: 3em; margin: 10px 0;">${totalAtendimentos}</h1>
            <p>Chamados + Chat</p>
        </div>
    `;
}

let chartInstance1 = null;
let chartInstance2 = null;

function renderCharts(labels, monitoria, atendimentos) {
    const ctx1 = document.getElementById('chartMonitoria');
    const ctx2 = document.getElementById('chartProdutividade');

    if (ctx1) {
        if (chartInstance1) chartInstance1.destroy();
        chartInstance1 = new Chart(ctx1, {
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
        if (chartInstance2) chartInstance2.destroy();
        chartInstance2 = new Chart(ctx2, {
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
    if (!listContainer) return;
    listContainer.innerHTML = "<p>Carregando histórico...</p>";

    try {
        const q = query(collection(db, "occurrences"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);

        let docs = [];
        querySnapshot.forEach(doc => docs.push({ id: doc.id, ...doc.data() }));
        docs.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (docs.length === 0) {
            listContainer.innerHTML = "<p>Nenhum registro encontrado.</p>";
            return;
        }

        listContainer.innerHTML = "";

        docs.forEach(item => {
            const dateStr = item.date ? item.date.split('-').reverse().join('/') : '-';
            const isPositive = item.type === 'positive';
            const cardClass = isPositive ? 'positive' : 'negative';
            const icon = isPositive ? '👏' : '⚠️';

            let footerHtml = '';
            if (item.read) {
                const readDate = item.readAt ? new Date(item.readAt.seconds * 1000).toLocaleDateString() : 'data desc.';
                footerHtml = `<span class="status-lido" style="color: green; display: flex; align-items: center; justify-content: flex-end; gap:5px;"><i class="material-icons" style="font-size:16px">check_circle</i> Lido em ${readDate}</span>`;
            } else {
                footerHtml = `<div style="text-align: right;"><button onclick="confirmRead('${item.id}')" class="btn-ciente">Marcar como Ciente</button></div>`;
            }

            const html = `
                <div class="timeline-card ${cardClass}">
                    <div class="card-header">
                        <h3 class="card-title">${icon} ${item.title}</h3>
                        <span class="card-date">${dateStr}</span>
                    </div>
                    <div class="card-body">${item.description}</div>
                    ${footerHtml}
                </div>
            `;
            listContainer.innerHTML += html;
        });

    } catch (error) {
        console.error("Erro Feedbacks:", error);
        listContainer.innerHTML = "Erro ao carregar lista.";
    }
}

// ============================================================
// 6. MÓDULO: HISTÓRICO COMPLETO (COM MODAL ESTILIZADO)
// ============================================================

// Variável para guardar os dados da tabela e usar no modal
let historyMetricsCache = [];

window.loadFullHistory = async (uid) => {
    if (!uid) {
        const user = auth.currentUser;
        if (user) uid = user.uid;
        else return;
    }

    const tbodyMetrics = document.getElementById('history-metrics-body');
    const tbodyOccur = document.getElementById('history-occurrences-body');

    if (tbodyMetrics) tbodyMetrics.innerHTML = "<tr><td colspan='6'>Carregando dados...</td></tr>";

    try {
        // --- 1. BUSCAR MÉTRICAS ---
        const qMetrics = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const snapMetrics = await getDocs(qMetrics);

        historyMetricsCache = []; // Limpa cache antigo
        snapMetrics.forEach(d => historyMetricsCache.push(d.data()));

        // Ordena: Mais recente primeiro
        historyMetricsCache.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));

        if (tbodyMetrics) {
            tbodyMetrics.innerHTML = "";
            if (historyMetricsCache.length === 0) {
                tbodyMetrics.innerHTML = "<tr><td colspan='6'>Nenhum registro encontrado.</td></tr>";
            } else {
                // Renderiza a tabela usando o INDEX do array para identificar o item
                historyMetricsCache.forEach((m, index) => {
                    const dataFmt = m.weekStart ? m.weekStart.split('-').reverse().join('/') : '-';
                    const volTotal = (m.atendimentosFinalizados || 0) + (m.atendimentosHuggy || 0);

                    const row = `
                        <tr>
                            <td><strong>${dataFmt}</strong></td>
                            <td><span style="color: ${m.notaMonitoria >= 90 ? 'green' : 'inherit'}; font-weight:bold;">${m.notaMonitoria}</span></td>
                            <td>${m.tmaTelefonia || '-'} min</td>
                            <td>${m.tmaHuggy || '-'} min</td>
                            <td>${volTotal}</td>
                            <td>
                                <button onclick="openMetricDetail(${index})" 
                                style="padding:6px 12px; font-size:11px; background:var(--color-taupe); border:none; color:white; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:5px;">
                                    <i class="material-icons" style="font-size:12px">visibility</i> Ver Tudo
                                </button>
                            </td>
                        </tr>
                    `;
                    tbodyMetrics.innerHTML += row;
                });
            }
        }

        // --- 2. BUSCAR OCORRÊNCIAS (Código mantido igual) ---
        const qOccur = query(collection(db, "occurrences"), where("userId", "==", uid));
        const snapOccur = await getDocs(qOccur);
        let listOccur = [];
        snapOccur.forEach(d => listOccur.push(d.data()));
        listOccur.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (tbodyOccur) {
            tbodyOccur.innerHTML = "";
            if (listOccur.length === 0) {
                tbodyOccur.innerHTML = "<tr><td colspan='5'>Nenhum feedback.</td></tr>";
            } else {
                listOccur.forEach(o => {
                    const dataFmt = o.date ? o.date.split('-').reverse().join('/') : '-';
                    const isPos = o.type === 'positive';
                    const icon = isPos ? '👍' : '⚠️';
                    const colorStyle = isPos ? 'color:green;' : 'color:var(--color-main-red);';
                    const status = o.read ? '<span style="color:green">✅ Lido</span>' : '<span style="color:orange">Pend.</span>';

                    const row = `
                        <tr>
                            <td>${dataFmt}</td>
                            <td style="${colorStyle} font-weight:bold;">${icon} ${isPos ? 'Elogio' : 'Melhoria'}</td>
                            <td>${o.title}</td>
                            <td style="font-size:13px; color:#666; max-width: 300px;">${o.description}</td>
                            <td>${status}</td>
                        </tr>
                    `;
                    tbodyOccur.innerHTML += row;
                });
            }
        }

    } catch (error) {
        console.error("Erro histórico:", error);
        if (tbodyMetrics) tbodyMetrics.innerHTML = "<tr><td colspan='6' style='color:red'>Erro ao carregar.</td></tr>";
    }
};

// --- FUNÇÕES DO MODAL DE DETALHES ---

window.openMetricDetail = (index) => {
    const data = historyMetricsCache[index];
    if (!data) return;

    const modal = document.getElementById('modal-metric-details');
    const content = document.getElementById('metric-modal-content');
    
    // Formata Data
    const dataFmt = data.weekStart.split('-').reverse().join('/');

    // HTML Interno do Modal
    content.innerHTML = `
        <div style="grid-column: span 2; background: #fff; border: 1px solid #e0e0e0; border-radius: 10px; padding: 15px; display:flex; justify-content: space-around; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.02);">
            <div style="text-align:center;">
                <p style="margin:0; font-size:11px; color:#666; text-transform:uppercase; letter-spacing:1px;">📂 Atendimentos Abertos</p>
                <p style="margin:5px 0 0 0; font-size:24px; font-weight:bold; color:#28a745;">${data.atendimentosAbertos || 0}</p>
            </div>
            
            <div style="height: 40px; border-left: 1px solid #eee;"></div> <div style="text-align:center;">
                <p style="margin:0; font-size:11px; color:#666; text-transform:uppercase; letter-spacing:1px;">✅ Atendimentos Finalizados</p>
                <p style="margin:5px 0 0 0; font-size:24px; font-weight:bold; color:#28a745;">${data.atendimentosFinalizados || 0}</p>
            </div>
        </div>

        <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; border-left: 4px solid #007bff;">
            <h4 style="color: #007bff; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">📞 Telefonia</h4>
            <p><strong>Recebidas:</strong> ${data.ligacoesRecebidas || 0}</p>
            <p><strong>Realizadas:</strong> ${data.ligacoesRealizadas || 0}</p>
            <p><strong>Perdidas:</strong> <span style="color:red">${data.ligacoesPerdidas || 0}</span></p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px dashed #ccc;">
            <p><strong>TMA (Tempo Médio):</strong> ${data.tmaTelefonia || 0} min</p>
            <p><strong>TME (Espera):</strong> ${data.tmeTelefonia || 0} min</p>
        </div>

        <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; border-left: 4px solid #28a745;">
            <h4 style="color: #28a745; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">💬 Chat & Qualidade</h4>
            <p><strong>Atendimentos Chat:</strong> ${data.atendimentosHuggy || 0}</p>
            <p><strong>TMA Chat:</strong> ${data.tmaHuggy || 0} min</p>
            <hr style="margin: 10px 0; border: 0; border-top: 1px dashed #ccc;">
            <p><strong>Monitoria:</strong> <span style="font-size: 1.2em; font-weight: bold;">${data.notaMonitoria || 0}</span></p>
            <p style="font-size: 0.9em; color: #666; margin-top: 5px;">Semana de ${dataFmt}</p>
        </div>
    `;

    modal.style.display = 'block';
};

window.closeMetricModal = () => {
    document.getElementById('modal-metric-details').style.display = 'none';
};