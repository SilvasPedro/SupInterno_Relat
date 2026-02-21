import { collection, query, where, getDocs, doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./config/firebase_config.js";

// ============================================================
// 1. ABRIR HISTÓRICO (LISTAGEM)
// ============================================================
window.openHistory = async (uid, nome) => {
    const modal = document.getElementById('modal-user-history');
    if (modal) modal.style.display = 'block';

    document.getElementById('history-user-name').innerText = "Histórico: " + nome;

    // Carrega as duas listas em paralelo
    loadMetricsList(uid);
    loadOccurrencesList(uid);
};

window.closeHistoryModal = () => {
    document.getElementById('modal-user-history').style.display = 'none';
};

// --- LISTA DE MÉTRICAS ---
async function loadMetricsList(uid) {
    const div = document.getElementById('history-metrics-list');
    div.innerHTML = "Carregando...";

    try {
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const snap = await getDocs(q);

        // Ordena por data (mais recente primeiro)
        let docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));

        if (docs.length === 0) {
            div.innerHTML = "<p style='color:#999; padding:10px;'>Nenhuma métrica lançada.</p>";
            return;
        }

        div.innerHTML = "";
        docs.forEach(data => {
            // Formata data
            const dateFmt = data.weekStart.split('-').reverse().slice(0, 2).join('/');

            div.innerHTML += `
<div class="history-item" style="border-left: 4px solid #007bff; display:flex; justify-content:space-between; align-items:center; padding:15px; margin-bottom:10px; background:white; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        
        <div class="history-info">
            <strong style="font-size: 14px; color: #333;">Semana ${dateFmt}</strong>
            <div style="font-size:12px; color:#666; margin-top: 4px;">
                <span style="background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; font-weight:bold;">${data.notaMonitoria}</span> 
                <span style="margin: 0 5px;">|</span> 
                TMA: ${data.tmaTelefonia} min
            </div>
        </div>

        <div class="history-actions">
            <button onclick="viewMetricDetailAdmin('${data.id}')" class="action-btn btn-view" title="Ver Detalhes">
                <i class="material-icons">visibility</i>
            </button>
            
            <button onclick="prepareEditMetric('${data.id}')" class="action-btn btn-edit" title="Editar">
                <i class="material-icons">edit</i>
            </button>

            <button onclick="deleteItem('weekly_metrics', '${data.id}', '${uid}')" class="action-btn btn-delete" title="Excluir">
                <i class="material-icons">delete</i>
            </button>
        </div>
    </div>`;
        });

    } catch (e) {
        console.error(e);
        div.innerHTML = "Erro ao carregar.";
    }
}

// --- LISTA DE OCORRÊNCIAS ---
async function loadOccurrencesList(uid) {
    const div = document.getElementById('history-occurrences-list');
    div.innerHTML = "Carregando...";

    try {
        const q = query(collection(db, "occurrences"), where("userId", "==", uid));
        const snap = await getDocs(q);

        let docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (docs.length === 0) {
            div.innerHTML = "<p style='color:#999; padding:10px;'>Nenhum feedback.</p>";
            return;
        }

        div.innerHTML = "";
        docs.forEach(data => {
            // --- ATUALIZAÇÃO AQUI (COR PARA NEUTRO) ---
            let color;
            if (data.type === 'positive') color = '#28a745';
            else if (data.type === 'neutral') color = '#6c757d'; // Cinza
            else color = '#dc3545';
            // ------------------------------------------

            const dateFmt = data.date.split('-').reverse().slice(0, 2).join('/');

            div.innerHTML += `
                <div class="history-item" style="border-left: 4px solid ${color}; display:flex; justify-content:space-between; align-items:center; padding:10px; margin-bottom:10px; background:white; border-radius:4px; box-shadow:0 1px 2px rgba(0,0,0,0.1);">
                    <div class="history-info">
                        <strong>${data.title}</strong>
                        <div style="font-size:11px; color:#666;">${dateFmt} - ${data.read ? 'Lido ✅' : 'Pendente'}</div>
                    </div>
                    <div class="history-actions">
                        <button onclick="deleteItem('occurrences', '${data.id}', '${uid}')"class="action-btn btn-delete" title="Excluir" style="background:#dc3545; border:none; color:white; border-radius:4px; width:30px; height:30px; cursor:pointer;">
                            <i class="material-icons" style="font-size:16px;">delete</i>
                        </button>
                    </div>
                </div>`;
        });

    } catch (e) {
        console.error(e);
        div.innerHTML = "Erro ao carregar.";
    }
}

// ============================================================
// 2. FUNÇÃO DE VISUALIZAÇÃO DETALHADA (NOVA)
// ============================================================
// Substitua a função viewMetricDetailAdmin existente por esta versão melhorada

// js/admin.js (e js/history.js)

window.viewMetricDetailAdmin = async (docId) => {
    const modal = document.getElementById('modal-metric-view-admin');
    const content = document.getElementById('admin-metric-view-content');

    modal.style.display = 'block';
    content.innerHTML = "<div style='padding:20px; text-align:center; color:#666;'><i class='material-icons spinning'>sync</i> Buscando dados...</div>";

    try {
        const ref = doc(db, "weekly_metrics", docId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            content.innerHTML = "<p style='color:red; text-align:center;'>Erro: Documento não encontrado.</p>";
            return;
        }

        const data = snap.data();
        const dataFmt = data.weekStart ? data.weekStart.split('-').reverse().join('/') : 'Data Inválida';

        // --- DADOS DIRETOS DO BANCO ---
        const ligRecebidas = data.ligacoesRecebidas || 0;
        const ligRealizadas = data.ligacoesRealizadas || 0;
        const ligPerdidas = data.ligacoesPerdidas || 0;
        const volChat = data.atendimentosHuggy || 0;
        const abertos = data.atendimentosAbertos || 0;

        // CORREÇÃO: Pegando o valor direto do banco, sem somar manualmente
        const totalFinalizados = data.atendimentosFinalizados || 0;

        // --- LAYOUT ---
        content.innerHTML = `
            <div style="grid-column: span 2; margin-bottom: 10px; text-align: center;">
                <h3 style="color: var(--color-dark-brown); margin: 0;">Resumo da Semana ${dataFmt}</h3>
            </div>

            <div style="grid-column: span 2; display: flex; gap: 15px; margin-bottom: 20px;">
                
                <div style="flex: 1; background: #e3f2fd; border: 1px solid #bbdefb; border-radius: 8px; padding: 15px; text-align: center;">
                    <h4 style="color: #0d47a1; margin-bottom: 5px; font-size: 14px; text-transform: uppercase;">📂 Atendimentos Abertos</h4>
                    <span style="font-size: 28px; font-weight: bold; color: #0d47a1;">${abertos}</span>
                    <p style="font-size: 12px; color: #5472d3; margin-top: 5px;">Novos chamados iniciados</p>
                </div>

                <div style="flex: 1; background: #e8f5e9; border: 1px solid #c8e6c9; border-radius: 8px; padding: 15px; text-align: center;">
                    <h4 style="color: #1b5e20; margin-bottom: 5px; font-size: 14px; text-transform: uppercase;">✅ Total Finalizados</h4>
                    <span style="font-size: 28px; font-weight: bold; color: #1b5e20;">${totalFinalizados}</span>
                    <p style="font-size: 12px; color: #2e7d32; margin-top: 5px;">Total Geral Registrado</p>
                </div>
            </div>

            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee; border-left: 5px solid #007bff; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;">
                    <h4 style="color: #007bff; margin:0; display:flex; align-items:center; gap:5px;">
                        <i class="material-icons" style="font-size:20px;">phone</i> Telefonia
                    </h4>
                    <span style="font-size:12px; background:#e3f2fd; color:#007bff; padding:2px 8px; border-radius:10px;">Total: ${ligRecebidas + ligRealizadas}</span>
                </div>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:14px; color:#555;">
                    <div>Recebidas: <b style="color:#333;">${ligRecebidas}</b></div>
                    <div>Realizadas: <b style="color:#333;">${ligRealizadas}</b></div>
                </div>
                
                <div style="margin-top:10px; font-size:14px; color:#555;">
                    Perdidas: <span style="color:${ligPerdidas > 0 ? '#dc3545' : '#ccc'}; font-weight:bold;">${ligPerdidas}</span>
                </div>

                <hr style="border:0; border-top:1px dashed #ddd; margin:15px 0;">
                
                <div style="display:flex; justify-content:space-between; text-align:center;">
                    <div>
                        <small style="color:#999;">TMA</small><br>
                        <strong style="color:#333; font-size:16px;">${data.tmaTelefonia || 0}</strong> <small>min</small>
                    </div>
                    <div>
                        <small style="color:#999;">TME</small><br>
                        <strong style="color:#333; font-size:16px;">${data.tmeTelefonia || 0}</strong> <small>seg</small>
                    </div>
                </div>
            </div>

            <div style="background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee; border-left: 5px solid #28a745; box-shadow: 0 2px 5px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid #f0f0f0; padding-bottom:10px;">
                    <h4 style="color: #28a745; margin:0; display:flex; align-items:center; gap:5px;">
                        <i class="material-icons" style="font-size:20px;">chat</i> Chat
                    </h4>
                    <span style="font-size:12px; background:#e8f5e9; color:#28a745; padding:2px 8px; border-radius:10px;">Total: ${volChat}</span>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span style="color:#555;">Vol. Huggy:</span>
                    <strong style="font-size:18px; color:#333;">${volChat}</strong>
                </div>

                 <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span style="color:#555;">TMA Chat:</span>
                    <strong>${data.tmaHuggy || 0} <small style="font-weight:normal;">min</small></strong>
                </div>

                <hr style="border:0; border-top:1px dashed #ddd; margin:15px 0;">

                <div style="background: #f9f9f9; padding:10px; border-radius:6px; text-align:center;">
                    <small style="color:#666; text-transform:uppercase;">Nota de Monitoria</small><br>
                    <span style="font-size: 24px; font-weight: bold; color: ${data.notaMonitoria >= 90 ? '#28a745' : (data.notaMonitoria >= 70 ? '#ffc107' : '#dc3545')}">
                        ${data.notaMonitoria || 0}
                    </span>
                </div>
            </div>
        `;

    } catch (e) {
        console.error(e);
        content.innerHTML = "<p>Erro ao carregar detalhes: " + e.message + "</p>";
    }
};

// ============================================================
// 3. FUNÇÃO DE EXCLUIR
// ============================================================
window.deleteItem = async (colName, docId, uid) => {
    if (!confirm("⚠️ Tem certeza que deseja excluir permanentemente?")) return;

    try {
        await deleteDoc(doc(db, colName, docId));
        alert("Registro excluído!");

        // Recarrega as listas do modal
        if (colName === 'weekly_metrics') loadMetricsList(uid);
        else loadOccurrencesList(uid);

    } catch (error) {
        alert("Erro ao excluir: " + error.message);
    }
};