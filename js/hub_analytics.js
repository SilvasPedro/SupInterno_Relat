/**
 * MÓDULO: ANÁLISE DETALHADA DO COLABORADOR (HUB)
 * Responsável por exibir o perfil completo, cards de todas as métricas e gráficos de evolução.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getFirestore, collection, getDocs, query, where 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Configuração Firebase (Mesma do admin.js)
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

// Variáveis de Gráfico (para destruir e recriar)
let chartTmaTelInstance = null;
let chartTmaChatInstance = null;

// ============================================================
// 1. ABRIR ANÁLISE (Chamar esta função ao clicar no Colaborador)
// ============================================================
window.openCollaboratorAnalytics = async (userId, userName) => {
    const modal = document.getElementById('modal-hub-analytics');
    const content = document.getElementById('hub-analytics-content');
    const title = document.getElementById('hub-analytics-title');

    if (!modal) return alert("Erro: Modal de análise não encontrado no HTML.");

    // Exibe Modal e Loading
    modal.style.display = 'block';
    title.innerText = `Análise Detalhada: ${userName}`;
    content.style.opacity = '0.5';

    try {
        // 1. Busca histórico completo do usuário
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", userId));
        const snapshot = await getDocs(q);
        let history = [];
        snapshot.forEach(doc => history.push(doc.data()));

        // Ordena por data (Antigo -> Novo para gráficos)
        history.sort((a, b) => new Date(a.weekStart) - new Date(b.weekStart));

        if (history.length === 0) {
            alert("Este colaborador ainda não possui métricas registradas.");
            modal.style.display = 'none';
            return;
        }

        // 2. Renderiza os Cards (com base na última semana registrada)
        const lastWeek = history[history.length - 1];
        renderMetricCards(lastWeek);

        // 3. Renderiza os Gráficos de Evolução
        renderEvolutionCharts(history);

    } catch (error) {
        console.error("Erro ao carregar análise:", error);
        alert("Erro ao carregar dados do colaborador.");
    } finally {
        content.style.opacity = '1';
    }
};

// ============================================================
// 2. RENDERIZAÇÃO DE CARDS (TODAS AS MÉTRICAS)
// ============================================================
function renderMetricCards(data) {
    const container = document.getElementById('hub-analytics-cards');
    if (!container) return;

    // Helper para formatar valores vazios
    const val = (v, suffix = '') => (v !== undefined && v !== null ? v + suffix : '--');
    const time = (v) => (v ? v + ' min' : '--');

    container.innerHTML = `
        <div class="card-group-label">Visão Geral</div>
        <div class="analytics-grid">
            <div class="mini-card">
                <div class="label">Monitoria (QA)</div>
                <div class="value highlight">${val(data.notaMonitoria)}</div>
            </div>
            <div class="mini-card">
                <div class="label">Atend. Finalizados</div>
                <div class="value">${val(data.atendimentosFinalizados)}</div>
            </div>
            <div class="mini-card">
                <div class="label">Atend. Abertos</div>
                <div class="value">${val(data.atendimentosAbertos)}</div>
            </div>
        </div>

        <div class="card-group-label" style="color: #007bff;">Telefonia</div>
        <div class="analytics-grid">
            <div class="mini-card">
                <div class="label">TMA (Médio)</div>
                <div class="value" style="color: #007bff;">${time(data.tmaTelefonia)}</div>
            </div>
            <div class="mini-card">
                <div class="label">TME (Espera)</div>
                <div class="value">${val(data.tmeTelefonia, 's')}</div>
            </div>
            <div class="mini-card">
                <div class="label">Lig. Realizadas</div>
                <div class="value">${val(data.ligacoesRealizadas)}</div>
            </div>
            <div class="mini-card">
                <div class="label">Lig. Recebidas</div>
                <div class="value">${val(data.ligacoesRecebidas)}</div>
            </div>
            <div class="mini-card">
                <div class="label">Lig. Perdidas</div>
                <div class="value" style="color: #dc3545;">${val(data.ligacoesPerdidas)}</div>
            </div>
        </div>

        <div class="card-group-label" style="color: #6610f2;">Chat / Huggy</div>
        <div class="analytics-grid">
            <div class="mini-card">
                <div class="label">TMA Chat</div>
                <div class="value" style="color: #6610f2;">${time(data.tmaHuggy)}</div>
            </div>
            <div class="mini-card">
                <div class="label">Atendimentos</div>
                <div class="value">${val(data.atendimentosHuggy)}</div>
            </div>
        </div>
        
        <div style="text-align: right; margin-top: 10px; font-size: 11px; color: #888;">
            Dados referentes à semana de: <strong>${data.weekStart.split('-').reverse().join('/')}</strong>
        </div>
    `;
}

// ============================================================
// 3. RENDERIZAÇÃO DE GRÁFICOS (EVOLUÇÃO)
// ============================================================
function renderEvolutionCharts(history) {
    // Prepara dados
    const labels = history.map(d => d.weekStart.split('-').reverse().slice(0, 2).join('/')); // dd/mm
    const dataTmaTel = history.map(d => d.tmaTelefonia || 0);
    const dataTmaChat = history.map(d => d.tmaHuggy || 0);

    // Configuração Comum
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
    };

    // --- GRÁFICO 1: TELEFONIA ---
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
                    tension: 0.3,
                    fill: true
                }]
            },
            options: commonOptions
        });
    }

    // --- GRÁFICO 2: CHAT ---
    const ctxChat = document.getElementById('chartAnalyticsChat');
    if (ctxChat) {
        if (chartTmaChatInstance) chartTmaChatInstance.destroy();
        chartTmaChatInstance = new Chart(ctxChat, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'TMA Chat (min)',
                    data: dataTmaChat,
                    borderColor: '#6610f2',
                    backgroundColor: 'rgba(102,16,242,0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: commonOptions
        });
    }
}