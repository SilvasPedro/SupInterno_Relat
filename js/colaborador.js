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
    if(!confirm("Deseja marcar este apontamento como lido?")) return;

    try {
        const docRef = doc(db, "occurrences", docId);
        await updateDoc(docRef, {
            read: true,
            readAt: new Date()
        });
        alert("Confirmação registrada!");
        if(auth.currentUser) loadMyOccurrences(auth.currentUser.uid);
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
        if(nameEl) nameEl.innerText = user.email;

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
    if(container) container.innerHTML = "<p>Carregando métricas...</p>";

    try {
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);
        
        let rawData = [];
        querySnapshot.forEach((doc) => rawData.push(doc.data()));
        rawData.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        if (rawData.length === 0) {
            if(container) container.innerHTML = "<p>Nenhuma métrica lançada ainda.</p>";
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
        if(container) container.innerText = "Erro ao carregar dados.";
    }
}

function updateCardsHTML(data) {
    const container = document.getElementById('cards-container');
    if(!container) return;
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
    if(!listContainer) return;
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
// 6. MÓDULO: HISTÓRICO COMPLETO (TABELAS)
// ============================================================
window.loadFullHistory = async (uid) => {
    // Se o HTML chamar sem argumentos, pega do Auth
    if (!uid) {
        const user = auth.currentUser;
        if (user) uid = user.uid;
        else return;
    }

    const tbodyMetrics = document.getElementById('history-metrics-body');
    const tbodyOccur = document.getElementById('history-occurrences-body');

    if (tbodyMetrics) tbodyMetrics.innerHTML = "<tr><td colspan='6'>Carregando dados...</td></tr>";
    if (tbodyOccur) tbodyOccur.innerHTML = "<tr><td colspan='5'>Carregando dados...</td></tr>";

    try {
        // --- MÉTRICAS ---
        const qMetrics = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const snapMetrics = await getDocs(qMetrics);
        let listMetrics = [];
        snapMetrics.forEach(d => listMetrics.push(d.data()));
        listMetrics.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));

        if (tbodyMetrics) {
            tbodyMetrics.innerHTML = "";
            if (listMetrics.length === 0) {
                tbodyMetrics.innerHTML = "<tr><td colspan='6'>Nenhum registro encontrado.</td></tr>";
            } else {
                listMetrics.forEach(m => {
                    const dataFmt = m.weekStart ? m.weekStart.split('-').reverse().join('/') : '-';
                    const volTotal = (m.atendimentosFinalizados || 0) + (m.atendimentosHuggy || 0);
                    
                    // CORREÇÃO: Passamos os valores numéricos para a função auxiliar
                    // Isso evita quebra de linha dentro do HTML
                    const row = `
                        <tr>
                            <td><strong>${dataFmt}</strong></td>
                            <td><span style="color: ${m.notaMonitoria >= 90 ? 'green' : 'inherit'}; font-weight:bold;">${m.notaMonitoria}</span></td>
                            <td>${m.tmaTelefonia || '-'} min</td>
                            <td>${m.tmaHuggy || '-'} min</td>
                            <td>${volTotal}</td>
                            <td>
                                <button onclick="showMetricDetails(${m.ligacoesRecebidas||0}, ${m.ligacoesRealizadas||0}, ${m.ligacoesPerdidas||0}, '${m.tmeTelefonia||0}')" 
                                style="padding:6px 10px; font-size:11px; background:var(--color-taupe); border:none; color:white; border-radius:4px; cursor:pointer;">
                                    + INFO
                                </button>
                            </td>
                        </tr>
                    `;
                    tbodyMetrics.innerHTML += row;
                });
            }
        }

        // --- OCORRÊNCIAS ---
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
        console.error("Erro histórico completo:", error);
        if (tbodyMetrics) tbodyMetrics.innerHTML = "<tr><td colspan='6' style='color:red'>Erro ao carregar.</td></tr>";
    }
};