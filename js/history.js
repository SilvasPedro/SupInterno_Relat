/**
 * MÓDULO DE HISTÓRICO E VISUALIZAÇÃO (ADMIN)
 * Responsável por listar, detalhar e excluir registros.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Configuração (Mesma do admin.js)
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
            const color = data.type === 'positive' ? '#28a745' : '#dc3545';
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
window.viewMetricDetailAdmin = async (docId) => {
    const modal = document.getElementById('modal-metric-view-admin');
    const content = document.getElementById('admin-metric-view-content');
    
    // Mostra modal com loading
    modal.style.display = 'block';
    content.innerHTML = "<p>Buscando dados...</p>";

    try {
        const ref = doc(db, "weekly_metrics", docId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            content.innerHTML = "<p>Erro: Documento não encontrado.</p>";
            return;
        }

        const data = snap.data();
        const dataFmt = data.weekStart.split('-').reverse().join('/');

        content.innerHTML = `
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 5px solid #007bff;">
                <h4 style="color: #007bff; margin-bottom: 10px;">📞 Telefonia</h4>
                <p><strong>Recebidas:</strong> ${data.ligacoesRecebidas || 0}</p>
                <p><strong>Realizadas:</strong> ${data.ligacoesRealizadas || 0}</p>
                <p><strong>Perdidas:</strong> <span style="color:red; font-weight:bold;">${data.ligacoesPerdidas || 0}</span></p>
                <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                <p><strong>TMA:</strong> ${data.tmaTelefonia || 0} min</p>
                <p><strong>TME:</strong> ${data.tmeTelefonia || 0} min</p>
            </div>

            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 5px solid #28a745;">
                <h4 style="color: #28a745; margin-bottom: 10px;">💬 Chat & Qualidade</h4>
                <p><strong>Vol. Huggy:</strong> ${data.atendimentosHuggy || 0}</p>
                <p><strong>TMA Huggy:</strong> ${data.tmaHuggy || 0} min</p>
                <hr style="border:0; border-top:1px dashed #ccc; margin:10px 0;">
                <p style="font-size:1.2em;"><strong>Monitoria:</strong> <span style="background: #e8f5e9; padding: 2px 6px; border-radius: 4px; color: #1b5e20;">${data.notaMonitoria || 0}</span></p>
            </div>

            <div style="grid-column: span 2; margin-top: 10px; background: #332D27; color: #FAE1C0; padding: 15px; border-radius: 8px; text-align: center;">
                <h3 style="margin:0; font-size:16px;">
                    Semana de ${dataFmt} • Total Finalizado: ${(data.atendimentosFinalizados || 0) + (data.atendimentosHuggy || 0)}
                </h3>
                <small>Abertos: ${data.atendimentosAbertos || 0}</small>
            </div>
        `;

    } catch (e) {
        console.error(e);
        content.innerHTML = "<p>Erro ao carregar detalhes.</p>";
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