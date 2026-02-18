import { 
    getFirestore, collection, getDocs, query, where 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { auth, db } from "./config/firebase_config.js"; 

// Variáveis de Estado
let chartTmaTelInstance = null;
let chartTmaChatInstance = null;
let chartCompletedInstance = null; // Novo gráfico
let currentHistoryData = []; // Armazena o histórico para filtragem local

// ============================================================
// 1. ABRIR ANÁLISE (Função Global)
// ============================================================
window.openCollaboratorAnalytics = async (userId, userName) => {
    const modal = document.getElementById('modal-hub-analytics');
    const cardsContainer = document.getElementById('hub-analytics-cards');
    const title = document.getElementById('hub-analytics-title');
    const filterSelect = document.getElementById('analytics-week-filter');

    if (!modal) return alert("Erro: Modal de análise não encontrado.");

    modal.style.display = 'block';
    title.innerText = `Análise Detalhada: ${userName}`;
    if(cardsContainer) cardsContainer.innerHTML = "<p>Carregando dados completos...</p>";
    
    // Limpa filtro anterior
    if(filterSelect) filterSelect.innerHTML = '<option>Carregando...</option>';

    try {
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", userId));
        const snapshot = await getDocs(q);
        let history = [];
        snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));

        // Ordena por data (Antigo -> Novo) para os gráficos
        history.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));
        
        currentHistoryData = history; // Salva no estado global

        if (history.length === 0) {
            if(cardsContainer) cardsContainer.innerHTML = "<p>Sem dados registrados.</p>";
            if(filterSelect) filterSelect.innerHTML = '<option>Sem dados</option>';
            return;
        }

        // 1. Configura o Filtro de Datas e Renderiza Cards da última semana
        setupWeekFilter(history);

        // 2. Renderiza os 3 Gráficos de Evolução (Usa todo o histórico)
        renderEvolutionCharts(history);

    } catch (error) {
        console.error("Erro ao carregar análise:", error);
        alert("Erro ao carregar dados do colaborador.");
    }
};

// ============================================================
// 2. CONFIGURAÇÃO DO FILTRO DE SEMANA
// ============================================================
function setupWeekFilter(history) {
    const filterSelect = document.getElementById('analytics-week-filter');
    if (!filterSelect) return;

    filterSelect.innerHTML = '';

    // Cria as opções (Do mais recente para o mais antigo para facilitar a escolha)
    // Usamos [...history].reverse() para a lista do select, mas mantemos o index original ou ID
    const reversedHistory = [...history].reverse();

    reversedHistory.forEach((item, index) => {
        const dateLabel = item.weekStart.split('-').reverse().join('/');
        const option = document.createElement('option');
        option.value = item.weekStart; // Usamos a data como valor
        option.text = `Semana: ${dateLabel}`;
        filterSelect.appendChild(option);
    });

    // Seleciona o primeiro (o mais recente)
    filterSelect.selectedIndex = 0;
    
    // Renderiza os cards do item selecionado
    renderMetricCards(reversedHistory[0]);

    // Evento de mudança
    filterSelect.onchange = (e) => {
        const selectedDate = e.target.value;
        const selectedData = currentHistoryData.find(d => d.weekStart === selectedDate);
        if (selectedData) {
            renderMetricCards(selectedData);
        }
    };
}

// ============================================================
// 3. RENDERIZAÇÃO DE CARDS (ATUALIZA COM O FILTRO)
// ============================================================
function renderMetricCards(data) {
    const container = document.getElementById('hub-analytics-cards');
    if (!container) return;

    // Helper functions
    const val = (v) => (v !== undefined && v !== null && v !== "" ? v : '--');
    const time = (v) => (v ? v + ' min' : '--');
    const sec = (v) => (v ? v + ' seg' : '--');

    // Formatação da data para o cabeçalho do card
    const dateFormatted = data.weekStart ? data.weekStart.split('-').reverse().join('/') : 'Data desc.';

    container.innerHTML = `
        <div style="background: #f8f9fa; padding: 10px 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid var(--color-main-red); display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin: 0; color: #333;">📅 Visualizando dados de: ${dateFormatted}</h4>
        </div>

        <div class="analytics-grid" style="grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px;">
            
            <div class="mini-card highlight-card" style="border-top: 3px solid #28a745;">
                <div class="label">🏆 Nota Monitoria</div>
                <div class="value">${val(data.notaMonitoria)}</div>
            </div>
            <div class="mini-card" style="border-top: 3px solid #666;">
                <div class="label">📂 Abertos</div>
                <div class="value">${val(data.atendimentosAbertos)}</div>
            </div>
            <div class="mini-card" style="border-top: 3px solid #28a745;">
                <div class="label">✅ Finalizados</div>
                <div class="value" style="font-weight:bold; color:#28a745;">${val(data.atendimentosFinalizados)}</div>
            </div>

            <div class="mini-card">
                <div class="label">📞 Lig. Feitas</div>
                <div class="value">${val(data.ligacoesRealizadas)}</div>
            </div>
            <div class="mini-card">
                <div class="label">📞 Lig. Recebidas</div>
                <div class="value">${val(data.ligacoesRecebidas)}</div>
            </div>
            <div class="mini-card" style="border-top: 3px solid #dc3545;">
                <div class="label">🚫 Lig. Perdidas</div>
                <div class="value" style="color:#dc3545;">${val(data.ligacoesPerdidas)}</div>
            </div>
            <div class="mini-card" style="border-top: 3px solid #007bff;">
                <div class="label">⏱️ TMA Tel</div>
                <div class="value">${time(data.tmaTelefonia)}</div>
            </div>
            <div class="mini-card">
                <div class="label">⏳ TME</div>
                <div class="value">${sec(data.tmeTelefonia)}</div>
            </div>

            <div class="mini-card">
                <div class="label">💬 Vol. Huggy</div>
                <div class="value">${val(data.atendimentosHuggy)}</div>
            </div>
            <div class="mini-card" style="border-top: 3px solid #6610f2;">
                <div class="label">⏱️ TMA Huggy</div>
                <div class="value">${time(data.tmaHuggy)}</div>
            </div>
        </div>
    `;
}

// ============================================================
// 4. GRÁFICOS DE EVOLUÇÃO
// ============================================================
function renderEvolutionCharts(history) {
    const labels = history.map(d => d.weekStart.split('-').reverse().slice(0, 2).join('/')); // dd/mm
    
    const dataTmaTel = history.map(d => d.tmaTelefonia || 0);
    const dataTmaChat = history.map(d => d.tmaHuggy || 0);
    const dataCompleted = history.map(d => d.atendimentosFinalizados || 0);

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
            legend: { display: true, position: 'top' },
            tooltip: { mode: 'index', intersect: false }
        },
        scales: { y: { beginAtZero: true } }
    };

    // --- GRÁFICO 1: ATENDIMENTOS FINALIZADOS (NOVO) ---
    const ctxComp = document.getElementById('chartAnalyticsCompleted');
    if (ctxComp) {
        if (chartCompletedInstance) chartCompletedInstance.destroy();
        chartCompletedInstance = new Chart(ctxComp, {
            type: 'bar', // Barra fica melhor para volume
            data: {
                labels: labels,
                datasets: [{
                    label: 'Atendimentos Finalizados',
                    data: dataCompleted,
                    backgroundColor: 'rgba(40, 167, 69, 0.6)',
                    borderColor: '#28a745',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: commonOptions
        });
    }

    // --- GRÁFICO 2: TELEFONIA ---
    const ctxTel = document.getElementById('chartAnalyticsTel');
    if (ctxTel) {
        if (chartTmaTelInstance) chartTmaTelInstance.destroy();
        chartTmaTelInstance = new Chart(ctxTel, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'TMA Telefonia (min)',
                    data: dataTmaTel,
                    borderColor: '#007bff',
                    backgroundColor: 'rgba(0,123,255,0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: commonOptions
        });
    }

    // --- GRÁFICO 3: CHAT (HUGGY) ---
    const ctxChat = document.getElementById('chartAnalyticsChat');
    if (ctxChat) {
        if (chartTmaChatInstance) chartTmaChatInstance.destroy();
        chartTmaChatInstance = new Chart(ctxChat, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'TMA Huggy (min)',
                    data: dataTmaChat,
                    borderColor: '#6610f2',
                    backgroundColor: 'rgba(102,16,242,0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: commonOptions
        });
    }
}