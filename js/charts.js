/**
 * MÓDULO DE GRÁFICOS (Chart.js) - VERSÃO AVANÇADA
 * Contém Rankings e Séries Temporais (Evolução).
 */

// Variáveis de instância (para destruir antes de recriar)
let chartRankQa = null;
let chartRankChat = null;
let chartEvoTma = null;
let chartEvoVol = null;

/**
 * Renderiza todos os gráficos da Dashboard
 * @param {Array} usersData - Dados agregados (Médias por usuário) -> Para Rankings
 * @param {Array} rawHistory - Dados brutos (Histórico completo) -> Para Evolução Temporal
 */
export function renderDashboardCharts(usersData, rawHistory) {
    if (typeof Chart === 'undefined') return console.error("Chart.js não carregado.");

    // --- 1. GRÁFICO: RANKING NOTA MONITORIA (BARRAS) ---
    renderRankingMonitoria(usersData);

    // --- 2. GRÁFICO: RANKING TMA CHAT (BARRAS) ---
    renderRankingChat(usersData);

    // --- PROCESSAMENTO PARA SÉRIES TEMPORAIS ---
    // Agrupa os dados brutos por data (Semana)
    const timelineData = processTimelineData(rawHistory);

    // --- 3. GRÁFICO: EVOLUÇÃO TMA MÉDIO (LINHA) ---
    renderEvolucaoTma(timelineData);

    // --- 4. GRÁFICO: EVOLUÇÃO MÉDIA DE FINALIZADOS (LINHA) ---
    renderEvolucaoVolume(timelineData);
}

// =======================================================
// FUNÇÕES DE RENDERIZAÇÃO INDIVIDUAL
// =======================================================

function renderRankingMonitoria(data) {
    const ctx = document.getElementById('chartRankingMonitoria');
    if (!ctx) return;

    // Ordena: Maior nota primeiro
    const sorted = [...data].sort((a, b) => b.avgMonitoria - a.avgMonitoria);
    
    // CORREÇÃO AQUI: Removemos o .split(' ')[0] para mostrar o nome inteiro
    const labels = sorted.map(u => u.name); 
    
    const values = sorted.map(u => u.avgMonitoria);

    if (chartRankQa) chartRankQa.destroy();

    chartRankQa = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nota Média',
                data: values,
                backgroundColor: values.map(v => v >= 90 ? '#28a745' : '#ffc107'),
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // DICA: Se os nomes forem muito longos, mude para 'y' para barras horizontais!
            scales: { x: { beginAtZero: true, max: 100 } }, // Ajuste para x se usar indexAxis: 'y'
            plugins: { legend: { display: false } }
        }
    });
}

function renderRankingChat(data) {
    const ctx = document.getElementById('chartRankingChat');
    if (!ctx) return;

    // Ordena: Menor tempo primeiro
    const sorted = [...data]
        .filter(u => u.avgTmaChat > 0)
        .sort((a, b) => a.avgTmaChat - b.avgTmaChat);
    
    // CORREÇÃO AQUI: Removemos o .split(' ')[0]
    const labels = sorted.map(u => u.name);
    
    const values = sorted.map(u => u.avgTmaChat);

    if (chartRankChat) chartRankChat.destroy();

    chartRankChat = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'TMA Chat (min)',
                data: values,
                backgroundColor: '#17a2b8',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } },
            plugins: { legend: { display: false } }
        }
    });
}

function renderEvolucaoTma(timeline) {
    const ctx = document.getElementById('chartEvolucaoTma');
    if (!ctx) return;

    if (chartEvoTma) chartEvoTma.destroy();

    chartEvoTma = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeline.labelsFormatted, // Datas (dd/mm)
            datasets: [
                {
                    label: 'TMA Telefonia',
                    data: timeline.avgTmaTel,
                    borderColor: '#007bff',
                    backgroundColor: '#007bff',
                    tension: 0.3
                },
                {
                    label: 'TMA Chat',
                    data: timeline.avgTmaChat,
                    borderColor: '#17a2b8',
                    backgroundColor: '#17a2b8',
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderEvolucaoVolume(timeline) {
    const ctx = document.getElementById('chartEvolucaoVol');
    if (!ctx) return;

    if (chartEvoVol) chartEvoVol.destroy();

    chartEvoVol = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeline.labelsFormatted,
            datasets: [{
                label: 'Média de Finalizados por Agente',
                data: timeline.avgVolPerAgent,
                borderColor: '#6f42c1', // Roxo
                backgroundColor: 'rgba(111, 66, 193, 0.1)',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// =======================================================
// HELPER: PROCESSAMENTO DE LINHA DO TEMPO
// =======================================================
function processTimelineData(rawHistory) {
    // 1. Agrupa dados por Semana (Data)
    const groups = {};
    
    rawHistory.forEach(d => {
        if (!groups[d.weekStart]) {
            groups[d.weekStart] = {
                date: d.weekStart,
                countAgents: 0,
                sumTmaTel: 0,
                sumTmaChat: 0,
                sumFinalizados: 0
            };
        }
        groups[d.weekStart].countAgents += 1;
        groups[d.weekStart].sumTmaTel += (d.tmaTelefonia || 0);
        groups[d.weekStart].sumTmaChat += (d.tmaHuggy || 0);
        groups[d.weekStart].sumFinalizados += (d.atendimentosFinalizados || 0);
    });

    // 2. Ordena cronologicamente e calcula médias da semana
    const sortedWeeks = Object.values(groups).sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
        labelsFormatted: sortedWeeks.map(w => w.date.split('-').reverse().slice(0,2).join('/')), // dd/mm
        avgTmaTel: sortedWeeks.map(w => (w.sumTmaTel / w.countAgents).toFixed(2)),
        avgTmaChat: sortedWeeks.map(w => (w.sumTmaChat / w.countAgents).toFixed(2)),
        avgVolPerAgent: sortedWeeks.map(w => (w.sumFinalizados / w.countAgents).toFixed(0))
    };
}