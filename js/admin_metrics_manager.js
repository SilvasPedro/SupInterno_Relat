import { getFirestore, collection, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { auth, db } from "./config/firebase_config.js"; 

// Estado Local
let allMetrics = [];
let usersMap = {}; // Mapa ID -> Nome

// ============================================================
// 1. INICIALIZAÇÃO E CARREGAMENTO
// ============================================================

window.initMetricsManager = async () => {
    const grid = document.getElementById('metrics-manager-grid');
    const filterSelect = document.getElementById('filter-metrics-user');

    grid.innerHTML = '<div class="loader">Carregando dados...</div>';

    try {
        // 1. Carregar Usuários (para mapear ID -> Nome)
        if (Object.keys(usersMap).length === 0) {
            const usersSnap = await getDocs(collection(db, "users"));
            filterSelect.innerHTML = '<option value="">Todos os Colaboradores</option>';

            let usersList = [];
            usersSnap.forEach(u => {
                const data = u.data();
                usersMap[u.id] = data.nome;
                usersList.push({ id: u.id, nome: data.nome });
            });

            // Ordena e preenche o select
            usersList.sort((a, b) => a.nome.localeCompare(b.nome));
            usersList.forEach(u => {
                filterSelect.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
            });
        }

        // 2. Carregar Métricas
        const metricsSnap = await getDocs(collection(db, "weekly_metrics"));
        allMetrics = [];
        metricsSnap.forEach(d => {
            allMetrics.push({
                id: d.id,
                ...d.data(),
                userName: usersMap[d.data().userId] || 'Usuário Removido'
            });
        });

        // Ordenar por data (mais recente primeiro)
        allMetrics.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));

        window.filterMetricsManager();

    } catch (error) {
        console.error("Erro ao carregar:", error);
        grid.innerHTML = '<p class="error-text">Erro ao carregar avaliações.</p>';
    }
};

// ============================================================
// 2. FILTRO E RENDERIZAÇÃO
// ============================================================

window.filterMetricsManager = () => {
    const userId = document.getElementById('filter-metrics-user').value;
    const dateVal = document.getElementById('filter-metrics-date').value;
    const grid = document.getElementById('metrics-manager-grid');

    let filtered = allMetrics.filter(item => {
        let matchUser = true;
        let matchDate = true;

        if (userId) matchUser = item.userId === userId;
        if (dateVal) matchDate = item.weekStart === dateVal;

        return matchUser && matchDate;
    });

    renderCards(filtered);
};

function renderCards(list) {
    const grid = document.getElementById('metrics-manager-grid');
    grid.innerHTML = "";

    if (list.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhuma avaliação encontrada com estes filtros.</div>';
        return;
    }

    list.forEach(item => {
        const dateFmt = item.weekStart.split('-').reverse().join('/');
        const notaColor = item.notaMonitoria >= 90 ? '#28a745' : (item.notaMonitoria >= 70 ? '#ffc107' : '#dc3545');

        grid.innerHTML += `
            <div class="history-card metric">
                <div class="h-card-header">
                    <span class="h-date"><i class="material-icons">event</i> ${dateFmt}</span>
                    <button onclick="deleteMetric('${item.id}')" title="Excluir Avaliação" style="background:none; border:none; cursor:pointer; color:#dc3545;">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
                <div class="h-card-body" style="text-align:center;">
                    <h4 style="margin:0 0 10px 0; color:var(--color-dark-brown); font-size:16px;">${item.userName}</h4>
                    
                    <div style="background:${notaColor}20; display:inline-block; padding:5px 15px; border-radius:20px; margin-bottom:15px;">
                        <span style="font-size:12px; color:#666; font-weight:bold;">MONITORIA</span><br>
                        <strong style="font-size:24px; color:${notaColor};">${item.notaMonitoria || 0}</strong>
                    </div>

                    <div style="display:flex; justify-content:space-around; font-size:12px; color:#666;">
                         <div>TMA Tel<br><strong>${item.tmaTelefonia || 0}</strong></div>
                         <div>Finalizados<br><strong>${(Number(item.atendimentosFinalizados) || 0)}</strong></div>
                    </div>
                </div>
                <div class="h-card-footer">
                    <button onclick="openEditMetricModal('${item.id}')" class="btn-details">
                        <i class="material-icons">edit</i> Ver Detalhes / Editar
                    </button>
                </div>
            </div>
        `;
    });
}

// ============================================================
// 3. EDIÇÃO E EXCLUSÃO
// ============================================================

window.deleteMetric = async (id) => {
    if (!confirm("⚠️ ATENÇÃO: Tem certeza que deseja EXCLUIR permanentemente esta avaliação?")) return;

    try {
        await deleteDoc(doc(db, "weekly_metrics", id));
        alert("Avaliação excluída com sucesso.");
        // Remove localmente e re-renderiza para não precisar recarregar tudo
        allMetrics = allMetrics.filter(m => m.id !== id);
        window.filterMetricsManager();
    } catch (e) {
        alert("Erro ao excluir: " + e.message);
    }
};

window.openEditMetricModal = (id) => {
    const metric = allMetrics.find(m => m.id === id);
    if (!metric) return;

    document.getElementById('edit-metric-id').value = id;
    document.getElementById('edit-metric-name').value = metric.userName;
    document.getElementById('edit-week-start').value = metric.weekStart;
    document.getElementById('edit-nota').value = metric.notaMonitoria;

    document.getElementById('edit-tma-tel').value = metric.tmaTelefonia || 0;
    document.getElementById('edit-tme-tel').value = metric.tmeTelefonia || 0;
    document.getElementById('edit-lig-rec').value = metric.ligacoesRecebidas || 0;
    document.getElementById('edit-lig-per').value = metric.ligacoesPerdidas || 0;

    document.getElementById('edit-tma-chat').value = metric.tmaHuggy || 0;
    document.getElementById('edit-vol-chat').value = metric.atendimentosHuggy || 0;
    document.getElementById('edit-vol-total').value = metric.atendimentosFinalizados || 0;

    document.getElementById('modal-edit-metric').style.display = 'flex';
};

// SALVAR EDIÇÃO
document.getElementById('form-edit-metric').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-metric-id').value;

    const updateData = {
        weekStart: document.getElementById('edit-week-start').value,
        notaMonitoria: parseFloat(document.getElementById('edit-nota').value),
        tmaTelefonia: parseFloat(document.getElementById('edit-tma-tel').value),
        tmeTelefonia: parseFloat(document.getElementById('edit-tme-tel').value),
        ligacoesRecebidas: parseInt(document.getElementById('edit-lig-rec').value),
        ligacoesPerdidas: parseInt(document.getElementById('edit-lig-per').value),
        tmaHuggy: parseFloat(document.getElementById('edit-tma-chat').value),
        atendimentosHuggy: parseInt(document.getElementById('edit-vol-chat').value),
        atendimentosFinalizados: parseInt(document.getElementById('edit-vol-total').value),
    };

    try {
        await updateDoc(doc(db, "weekly_metrics", id), updateData);
        alert("Avaliação atualizada com sucesso!");
        document.getElementById('modal-edit-metric').style.display = 'none';
        window.initMetricsManager(); // Recarrega para garantir dados frescos
    } catch (e) {
        alert("Erro ao salvar: " + e.message);
    }
});