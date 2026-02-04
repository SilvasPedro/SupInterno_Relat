/**
 * ============================================================
 * MÓDULO: HUB DE COLABORADORES (hub.js)
 * Responsável pela visualização em Cards e Análise Detalhada
 * ============================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Configuração (Mesma do admin.js para garantir acesso)
const firebaseConfig = {
    apiKey: "AIzaSyCWve8E4PIwEeBf5nATJnFnlJkSe9YkbPE",
    authDomain: "suporte-interno-ece8c.firebaseapp.com",
    projectId: "suporte-interno-ece8c",
    storageBucket: "suporte-interno-ece8c.firebasestorage.app",
    messagingSenderId: "154422890108",
    appId: "1:154422890108:web:efe6f03bc4c55dc11483f9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Estado local do Hub
let currentAnalysisUserId = null;
let chartAnalysisQa = null;
let chartAnalysisVol = null;

/**
 * 1. CARREGA A GRID DE CARDS (Substitui a antiga tabela)
 */
export async function loadCollaboratorsHub() {
    const grid = document.getElementById('colaboradores-grid');
    if (!grid) return;

    grid.innerHTML = "<p style='padding:20px; color:#666;'>Carregando colaboradores...</p>";

    try {
        const q = await getDocs(collection(db, "users"));
        let usersList = [];

        q.forEach((docSnap) => {
            const user = docSnap.data();
            // Ignora admins na listagem de colaboradores
            if (user.cargo !== 'admin') {
                usersList.push({ id: docSnap.id, ...user });
            }
        });

        // Ordena alfabeticamente
        usersList.sort((a, b) => a.nome.localeCompare(b.nome));

        grid.innerHTML = "";

        if (usersList.length === 0) {
            grid.innerHTML = "<p>Nenhum colaborador encontrado.</p>";
            return;
        }

        usersList.forEach((user) => {
            const initials = user.nome.charAt(0).toUpperCase();
            
            // Tratamento para caso tenha foto (se implementou) ou usa inicial
            const avatarHtml = user.photoUrl 
                ? `<img src="${user.photoUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:3px solid var(--color-cream); margin: 0 auto 10px; display:block;">`
                : `<div class="collab-avatar">${initials}</div>`;

            grid.innerHTML += `
                <div class="collab-card" onclick="window.openCollaboratorAnalysis('${user.id}', '${user.nome}', '${user.cargo || 'Colaborador'}', '${user.departamento || 'Geral'}')">
                    <div class="collab-header">
                        ${avatarHtml}
                        <div class="collab-name">${user.nome}</div>
                        <div class="collab-role">${user.cargo}</div>
                    </div>
                    <div class="collab-body">
                        <span class="collab-dept">${user.departamento || 'Sem setor'}</span>
                        <div class="collab-status">
                            <i class="material-icons" style="font-size:14px;">check_circle</i> Ativo
                        </div>
                    </div>
                    <div class="collab-footer">
                        <button class="btn-view-analysis">Ver Análise Completa</button>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error("Erro ao carregar Hub:", e);
        grid.innerHTML = "<p>Erro ao carregar lista de colaboradores.</p>";
    }
}

/**
 * 2. ABRE O MODAL DE ANÁLISE (DRILL-DOWN)
 * Tornamos global (window) para funcionar no onclick do HTML gerado acima
 */
window.openCollaboratorAnalysis = (uid, name, role, dept) => {
    currentAnalysisUserId = uid;
    
    // Preenche cabeçalho
    document.getElementById('analysis-name').innerText = name;
    document.getElementById('analysis-role').innerText = `${role} - ${dept}`;
    
    // Define datas padrão (Mês atual)
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1); 
    
    // Ajusta formato para input date (YYYY-MM-DD)
    document.getElementById('analysis-start-date').valueAsDate = firstDay;
    document.getElementById('analysis-end-date').valueAsDate = today;

    // Exibe Modal
    document.getElementById('modal-collaborator-analysis').style.display = 'block';

    // Carrega dados
    loadCollaboratorMetrics();
}

/**
 * 3. BUSCA E CALCULA AS MÉTRICAS DO COLABORADOR
 */
window.loadCollaboratorMetrics = async () => {
    if (!currentAnalysisUserId) return;

    // Elementos de KPI no Modal
    const kpiTotal = document.getElementById('an-total-vol');
    const kpiQa = document.getElementById('an-avg-qa');
    const kpiTel = document.getElementById('an-avg-tma-tel');
    const kpiChat = document.getElementById('an-avg-tma-chat');

    // Estado de carregamento
    kpiTotal.innerText = "...";
    
    const startDateStr = document.getElementById('analysis-start-date').value;
    const endDateStr = document.getElementById('analysis-end-date').value;

    try {
        // Busca métricas apenas deste usuário
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", currentAnalysisUserId));
        const snap = await getDocs(q);

        let filteredDocs = [];
        
        snap.forEach(d => {
            const data = d.data();
            // Filtro de Data em memória (simples e funcional para datas YYYY-MM-DD)
            if (data.weekStart >= startDateStr && data.weekStart <= endDateStr) {
                filteredDocs.push(data);
            }
        });

        // Ordena Cronologicamente
        filteredDocs.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        // Cálculos de Média e Totais
        let sumVol = 0, sumQa = 0, sumTmaTel = 0, sumTmaChat = 0;
        let count = 0;
        let countTel = 0, countChat = 0; // Para médias mais precisas se houver 0

        // Arrays para os Gráficos
        let labels = [];
        let dataQa = [];
        let dataVol = [];

        filteredDocs.forEach(d => {
            const vol = (d.atendimentosFinalizados || 0);
            sumVol += vol;
            
            // Só soma na média se houver valor lançado
            if(d.notaMonitoria > 0) sumQa += Number(d.notaMonitoria);
            if(d.tmaTelefonia > 0) { sumTmaTel += Number(d.tmaTelefonia); countTel++; }
            if(d.tmaHuggy > 0) { sumTmaChat += Number(d.tmaHuggy); countChat++; }
            
            count++;

            // Labels e Dados Chart.js
            const dateLabel = d.weekStart.split('-').reverse().slice(0, 2).join('/'); // DD/MM
            labels.push(dateLabel);
            dataQa.push(d.notaMonitoria || 0);
            dataVol.push(vol);
        });

        // Atualiza Interface
        kpiTotal.innerText = sumVol;
        kpiQa.innerText = count > 0 ? (sumQa / count).toFixed(1) : "-";
        kpiTel.innerText = countTel > 0 ? (sumTmaTel / countTel).toFixed(2) : "-";
        kpiChat.innerText = countChat > 0 ? (sumTmaChat / countChat).toFixed(2) : "-";

        // Renderiza Gráficos
        renderAnalysisCharts(labels, dataQa, dataVol);

    } catch (e) {
        console.error("Erro na análise:", e);
        alert("Erro ao carregar dados detalhados.");
    }
}

/**
 * 4. RENDERIZA OS GRÁFICOS DO MODAL
 */
function renderAnalysisCharts(labels, dataQa, dataVol) {
    const ctxQa = document.getElementById('chartAnalysisQa');
    const ctxVol = document.getElementById('chartAnalysisVol');

    // Destroi gráficos antigos para não sobrepor
    if (chartAnalysisQa) chartAnalysisQa.destroy();
    if (chartAnalysisVol) chartAnalysisVol.destroy();

    // 1. Gráfico de Qualidade (Linha Suave)
    chartAnalysisQa = new Chart(ctxQa, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nota Monitoria',
                data: dataQa,
                borderColor: '#28a745',
                backgroundColor: 'rgba(40, 167, 69, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, max: 100 } }
        }
    });

    // 2. Gráfico de Volume (Barras)
    chartAnalysisVol = new Chart(ctxVol, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Atendimentos Finalizados',
                data: dataVol,
                backgroundColor: '#6f42c1',
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}