import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// 1. Configuração
import { auth, db } from "./config/firebase_config.js"; 
// Cache local
let historyCacheMetrics = null;
let historyCacheOccurrences = null;

// ============================================================
// CARREGAR HISTÓRICO (LISTAGEM)
// ============================================================
window.loadFullHistory = async () => {
    const user = auth.currentUser;
    if (!user) return console.warn("Usuário não autenticado.");

    const gridMetrics = document.getElementById('history-metrics-grid');
    const gridOccur = document.getElementById('history-occurrences-grid');

    // --- A. MÉTRICAS ---
    if (gridMetrics) {
        if (!historyCacheMetrics) {
            gridMetrics.innerHTML = '<p style="color:#666;">Buscando métricas...</p>';
            try {
                const q = query(collection(db, "weekly_metrics"), where("userId", "==", user.uid));
                const snap = await getDocs(q);
                let data = [];
                snap.forEach(d => data.push({ id: d.id, ...d.data() }));
                data.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));
                historyCacheMetrics = data;
            } catch (e) {
                console.error(e);
                gridMetrics.innerHTML = `<p style="color:red;">Erro ao carregar métricas.</p>`;
            }
        }

        if (historyCacheMetrics && historyCacheMetrics.length === 0) {
            gridMetrics.innerHTML = `<div class="empty-state">Nenhum registro encontrado.</div>`;
        } else if (historyCacheMetrics) {
            gridMetrics.innerHTML = "";
            historyCacheMetrics.forEach(m => {
                const dateFmt = m.weekStart.split('-').reverse().join('/');
                const notaColor = m.notaMonitoria >= 90 ? '#28a745' : (m.notaMonitoria >= 70 ? '#ffc107' : '#dc3545');
                const totalVol = (Number(m.atendimentosFinalizados)||0);

                gridMetrics.innerHTML += `
                    <div class="history-card metric">
                        <div class="h-card-header">
                            <span class="h-date"><i class="material-icons">event</i> ${dateFmt}</span>
                            <span class="h-badge" style="background:${notaColor}; color:white;">Nota: ${m.notaMonitoria || 0}</span>
                        </div>
                        <div class="h-card-body">
                            <div class="h-stat">
                                <label>TMA Tel</label>
                                <strong>${m.tmaTelefonia || 0} <small>min</small></strong>
                            </div>
                            <div class="h-stat">
                                <label>TMA Chat</label>
                                <strong>${m.tmaHuggy || 0} <small>min</small></strong>
                            </div>
                            <div class="h-stat">
                                <label>Total Finaliz.</label>
                                <strong>${totalVol}</strong>
                            </div>
                        </div>
                        <div class="h-card-footer">
                            <button onclick="window.openMetricDetailHistory('${m.id}')" class="btn-details">
                                <i class="material-icons" style="font-size:16px;">visibility</i> Ver Detalhes
                            </button>
                        </div>
                    </div>
                `;
            });
        }
    }

    // --- B. OCORRÊNCIAS ---
    if (gridOccur) {
        if (!historyCacheOccurrences) {
            gridOccur.innerHTML = '<p style="color:#666;">Buscando feedbacks...</p>';
            try {
                const q = query(collection(db, "occurrences"), where("userId", "==", user.uid));
                const snap = await getDocs(q);
                let data = [];
                snap.forEach(d => data.push({ id: d.id, ...d.data() }));
                data.sort((a, b) => new Date(b.date) - new Date(a.date));
                historyCacheOccurrences = data;
            } catch (e) {
                gridOccur.innerHTML = `<p style="color:red;">Erro ao carregar feedbacks.</p>`;
            }
        }

        if (historyCacheOccurrences && historyCacheOccurrences.length === 0) {
            gridOccur.innerHTML = `<div class="empty-state">Nenhum feedback registrado.</div>`;
        } else if (historyCacheOccurrences) {
            gridOccur.innerHTML = "";
            historyCacheOccurrences.forEach(item => {
                const dateFmt = item.date ? item.date.split('-').reverse().join('/') : '-';
                let icon = 'info', color = '#17a2b8', label = 'Orientação';
                if (item.type === 'positive') { icon = 'thumb_up'; color = '#28a745'; label = 'Elogio'; }
                else if (item.type === 'negative') { icon = 'warning'; color = '#dc3545'; label = 'Atenção'; }

                const readHtml = item.read 
                    ? `<span style="color:#28a745; font-size:12px; display:flex; align-items:center; gap:5px;"><i class="material-icons" style="font-size:14px;">done_all</i> Lido</span>`
                    : `<button onclick="window.confirmReadHistory('${item.id}')" class="btn-ack">Marcar Ciente</button>`;

                gridOccur.innerHTML += `
                    <div class="history-card feedback" style="border-left: 5px solid ${color}">
                        <div class="h-card-header">
                            <div style="color:${color}; font-weight:bold; display:flex; align-items:center; gap:5px;">
                                <i class="material-icons">${icon}</i> ${label}
                            </div>
                            <span class="h-date">${dateFmt}</span>
                        </div>
                        <div class="h-card-body" style="grid-template-columns: 1fr; text-align:left;">
                            <h4 style="margin:0 0 5px 0; font-size:15px; color:#333;">${item.title}</h4>
                            <p style="font-size:13px; color:#666; line-height:1.4;">${item.description}</p>
                            ${item.protocol ? `<div style="margin-top:8px; font-size:11px; background:#f0f0f0; padding:4px; display:inline-block; border-radius:4px; color:#555;">Prot: ${item.protocol}</div>` : ''}
                        </div>
                        <div class="h-card-footer" style="justify-content: flex-end;">
                            ${readHtml}
                        </div>
                    </div>
                `;
            });
        }
    }
};

// ============================================================
// AÇÃO: VER DETALHES COMPLETOS (MODAL)
// ============================================================
window.openMetricDetailHistory = (id) => {
    // 1. Busca os dados no cache
    if (!historyCacheMetrics) return console.warn("Cache vazio");
    const data = historyCacheMetrics.find(m => m.id === id);
    
    if (!data) return alert("Erro: Dados não encontrados.");

    // 2. Busca elementos do Modal
    const modal = document.getElementById('modal-metric-details');
    const content = document.getElementById('metric-modal-content');

    if (modal && content) {
        // Formatações
        const dateFmt = data.weekStart.split('-').reverse().join('/');
        const notaColor = data.notaMonitoria >= 90 ? '#28a745' : (data.notaMonitoria >= 70 ? '#ffc107' : '#dc3545');

        // Valores com fallback para 0
        const finalizados = data.atendimentosFinalizados || 0;
        const ligRecebidas = data.ligacoesRecebidas || 0;
        const ligPerdidas = data.ligacoesPerdidas || 0;
        const tmaTel = data.tmaTelefonia || 0;
        const tmeTel = data.tmeTelefonia || 0;
        const volChat = data.atendimentosHuggy || 0;
        const tmaChat = data.tmaHuggy || 0;

        // 3. Monta o HTML Rico
        content.innerHTML = `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; margin-bottom: 20px; border: 1px solid #eee;">
                <h3 style="margin: 0; color: #333;">Semana de ${dateFmt}</h3>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                    <div style="font-size: 11px; text-transform: uppercase; color: #666; font-weight: bold;">Monitoria</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${notaColor}; margin-top: 5px;">${data.notaMonitoria}</div>
                </div>
                <div style="background: white; border: 1px solid #eee; border-radius: 8px; padding: 15px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.03);">
                    <div style="font-size: 11px; text-transform: uppercase; color: #666; font-weight: bold;">Total Finalizados</div>
                    <div style="font-size: 28px; font-weight: bold; color: #007bff; margin-top: 5px;">${finalizados}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                
                <div style="border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                    <div style="background: #e3f2fd; padding: 8px 15px; font-size: 13px; font-weight: bold; color: #0d47a1; display:flex; align-items:center; gap:5px;">
                        <i class="material-icons" style="font-size:16px;">phone</i> Telefonia
                    </div>
                    <div style="padding: 15px; font-size: 13px; display: grid; gap: 8px;">
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#666;">Recebidas:</span> <strong>${ligRecebidas}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#666;">Perdidas:</span> <strong style="color:${ligPerdidas > 0 ? '#dc3545' : '#333'}">${ligPerdidas}</strong>
                        </div>
                        <div style="border-top:1px dashed #eee; margin: 5px 0;"></div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#666;">TMA:</span> <strong style="color:#007bff;">${tmaTel} min</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#666;">TME:</span> <strong style="color:#17a2b8;">${tmeTel} seg</strong>
                        </div>
                    </div>
                </div>

                <div style="border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                    <div style="background: #f3e5f5; padding: 8px 15px; font-size: 13px; font-weight: bold; color: #4a148c; display:flex; align-items:center; gap:5px;">
                        <i class="material-icons" style="font-size:16px;">chat</i> Chat / Huggy
                    </div>
                    <div style="padding: 15px; font-size: 13px; display: grid; gap: 8px;">
                         <div style="display:flex; justify-content:space-between;">
                            <span style="color:#666;">Vol. Chat:</span> <strong>${volChat}</strong>
                        </div>
                        <div style="border-top:1px dashed #eee; margin: 5px 0;"></div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:#666;">TMA:</span> <strong style="color:#6610f2;">${tmaChat} min</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'block';
    } else {
        // Fallback caso o modal não exista no HTML (Segurança)
        alert(`Semana: ${data.weekStart}\nNota: ${data.notaMonitoria}\nFinalizados: ${data.atendimentosFinalizados}`);
    }
};

window.confirmReadHistory = async (docId) => {
    if (!confirm("Marcar como lido?")) return;
    try {
        await updateDoc(doc(db, "occurrences", docId), { read: true, readAt: new Date() });
        historyCacheOccurrences = null; // Limpa cache para forçar recarga visual
        loadFullHistory();
    } catch (e) { alert("Erro: " + e.message); }
};

window.closeMetricModal = () => {
    const modal = document.getElementById('modal-metric-details');
    if (modal) {
        modal.style.display = 'none';
    }
}