import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { 
    getFirestore, collection, getDocs, query, where, doc, getDoc 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Configuração Firebase (Mesma do projeto)
import { auth, db } from "./config/firebase_config.js"; 

let currentUserData = null;
let auditCache = []; // Cache para abrir detalhes sem nova requisição

// Monitorar Auth
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserData = user;
        // Se a seção já estiver aberta, carrega
        if(document.getElementById('section-minhas-auditorias').style.display === 'block'){
            loadMyAudits();
        }
    }
});

window.loadMyAudits = async () => {
    if (!currentUserData) return; // Aguarda auth

    const tbody = document.getElementById('my-audits-list');
    tbody.innerHTML = "<tr><td colspan='5'>Carregando suas auditorias...</td></tr>";

    try {
        // Busca auditorias onde collaboratorId == UID do usuário logado
        // Importante: No arquivo audit.js (admin), salvamos collaboratorId como userSelect.value. 
        // Certifique-se que o value lá é o UID do firebase.
        
        const q = query(collection(db, "audits"), where("collaboratorId", "==", currentUserData.uid));
        const snapshot = await getDocs(q);
        
        auditCache = [];
        let conformeCount = 0;
        let naoConformeCount = 0;

        snapshot.forEach(doc => {
            const data = doc.data();
            auditCache.push({ id: doc.id, ...data });
            if(data.status === 'Conforme') conformeCount++;
            else naoConformeCount++;
        });

        // Atualizar contadores
        document.getElementById('count-conforme').innerText = conformeCount;
        document.getElementById('count-nao-conforme').innerText = naoConformeCount;

        // Renderizar Tabela
        tbody.innerHTML = "";
        if (auditCache.length === 0) {
            tbody.innerHTML = "<tr><td colspan='5'>Nenhuma auditoria encontrada.</td></tr>";
            return;
        }

        // Ordenar por data (mais recente primeiro)
        auditCache.sort((a, b) => new Date(b.auditDate) - new Date(a.auditDate));

        auditCache.forEach(audit => {
            const dateFmt = audit.auditDate ? audit.auditDate.split('-').reverse().join('/') : '-';
            const statusColor = audit.status === 'Conforme' ? '#28a745' : '#dc3545';
            const statusBg = audit.status === 'Conforme' ? '#d4edda' : '#f8d7da';

            tbody.innerHTML += `
                <tr>
                    <td>${dateFmt}</td>
                    <td>${audit.protocol || 'N/A'}</td>
                    <td>${audit.processName}</td>
                    <td>
                        <span style="background: ${statusBg}; color: ${statusColor}; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">
                            ${audit.status}
                        </span>
                    </td>
                    <td>
                        <button onclick="viewAuditDetails('${audit.id}')" class="btn-primary" style="padding: 5px 10px; font-size: 12px;">
                            <i class="material-icons" style="font-size: 14px; vertical-align: middle;">visibility</i> Ver Detalhes
                        </button>
                    </td>
                </tr>
            `;
        });

    } catch (e) {
        console.error("Erro ao carregar auditorias:", e);
        tbody.innerHTML = `<tr><td colspan='5'>Erro ao carregar dados. Tente novamente.</td></tr>`;
    }
};

window.viewAuditDetails = (id) => {
    const audit = auditCache.find(a => a.id === id);
    if (!audit) return;

    // Preencher Modal
    document.getElementById('modal-process-title').innerText = audit.processName;
    document.getElementById('modal-date').innerText = audit.auditDate.split('-').reverse().join('/');
    document.getElementById('modal-auditor').innerText = audit.auditor || 'Admin';
    document.getElementById('modal-protocol').innerText = audit.protocol;
    document.getElementById('modal-occurrence').innerText = audit.occurrenceDate ? audit.occurrenceDate.split('-').reverse().join('/') : '-';
    document.getElementById('modal-obs').innerText = audit.observations || 'Nenhuma observação registrada.';

    // Badge de Status no Modal
    const badge = document.getElementById('modal-status-badge');
    if (audit.status === 'Conforme') {
        badge.innerText = "✅ CONFORME";
        badge.style.background = "#d4edda";
        badge.style.color = "#155724";
    } else {
        badge.innerText = "🚫 NÃO CONFORME";
        badge.style.background = "#f8d7da";
        badge.style.color = "#721c24";
    }

    // Renderizar Checklist
    const ul = document.getElementById('modal-checklist');
    ul.innerHTML = "";
    
    if (audit.checklist && audit.checklist.length > 0) {
        audit.checklist.forEach(item => {
            const icon = item.checked ? '✅' : '❌';
            const style = item.checked ? 'color: #333;' : 'color: #dc3545; font-weight: bold;';
            
            ul.innerHTML += `
                <li style="padding: 8px 0; border-bottom: 1px dashed #eee; display: flex; align-items: flex-start; gap: 10px; ${style}">
                    <span>${icon}</span>
                    <span>${item.criteria}</span>
                </li>
            `;
        });
    } else {
        ul.innerHTML = "<li>Nenhum item de verificação registrado.</li>";
    }

    // Mostrar Modal
    document.getElementById('audit-details-modal').style.display = 'flex';
};

window.closeAuditModal = () => {
    document.getElementById('audit-details-modal').style.display = 'none';
};