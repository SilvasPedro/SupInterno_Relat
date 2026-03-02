import {
    getFirestore, collection, getDocs, doc, setDoc, deleteDoc, query, where, addDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./config/firebase_config.js";

// Estado Local
let currentCriteriaList = []; // Para o formulário de criação
let templatesCache = []; // Cache dos modelos
let currentAuditChecklist = []; // Estado atual da auditoria sendo feita
let auditHistoryCache = []; // NOVO: Armazena o histórico para uso no filtro

let qaDataCache = [];
let chartQaStatusInstance = null;
let chartQaProcessInstance = null;

// ============================================================
// 1. NAVEGAÇÃO E INICIALIZAÇÃO
// ============================================================

window.toggleAuditMode = (mode) => {
    const execDiv = document.getElementById('audit-perform-container');
    const configDiv = document.getElementById('audit-config-container');

    if (mode === 'audit') {
        execDiv.style.display = 'block';
        configDiv.style.display = 'none';
        loadAuditHistory(); // Carrega histórico ao abrir
    } else {
        execDiv.style.display = 'none';
        configDiv.style.display = 'block';
        loadTemplatesList(); // Carrega modelos ao abrir
    }
};

// Carrega lista de usuários para o select de Auditoria
window.loadAuditUserSelect = async () => {
    const select = document.getElementById('audit-user-select');
    if (!select) return;

    // Tenta pegar do cache global do hub.js ou busca novo
    select.innerHTML = '<option value="">Selecione...</option>';
    try {
        const q = await getDocs(collection(db, "users"));
        let users = [];
        q.forEach(d => {
            if (d.data().cargo !== 'admin') users.push({ id: d.id, nome: d.data().nome });
        });
        users.sort((a, b) => a.nome.localeCompare(b.nome));
        users.forEach(u => select.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
    } catch (e) { console.error(e); }
};

// Inicializador chamado pelo HTML (onclick do menu)
window.loadAuditTemplatesOptions = async () => {
    // 1. Carrega usuários
    loadAuditUserSelect();

    // 2. Carrega Processos no Select
    const select = document.getElementById('audit-process-select');
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const q = await getDocs(collection(db, "audit_templates"));
        templatesCache = [];
        q.forEach(doc => templatesCache.push({ id: doc.id, ...doc.data() }));

        select.innerHTML = '<option value="">Selecione um processo...</option>';
        templatesCache.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${t.name}</option>`;
        });

    } catch (e) {
        console.error("Erro ao carregar templates", e);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
};

// ============================================================
// 2. LÓGICA DE AUDITORIA (EXECUÇÃO)
// ============================================================

window.renderAuditChecklist = () => {
    const processId = document.getElementById('audit-process-select').value;
    const container = document.getElementById('checklist-container');
    const itemsArea = document.getElementById('checklist-items-area');
    const statusDisplay = document.getElementById('audit-status-display');
    const finalStatusInput = document.getElementById('audit-final-status');

    if (!processId) {
        container.style.display = 'none';
        return;
    }

    const template = templatesCache.find(t => t.id === processId);
    if (!template || !template.criteria) return;

    itemsArea.innerHTML = "";
    container.style.display = 'block';

    // Renderiza Checkboxes
    template.criteria.forEach((item, index) => {
        itemsArea.innerHTML += `
                <label class="audit-check-item">
                    <input type="checkbox" class="audit-checkbox" onchange="calculateAuditStatus()" value="${item}">
                    <span>${item}</span>
                </label>
            `;
    });

    // Reset Status
    statusDisplay.innerText = "Pendente";
    statusDisplay.style.background = "#eee";
    statusDisplay.style.color = "#333";
    finalStatusInput.value = "";

    calculateAuditStatus(); // Calcular inicial
};

window.calculateAuditStatus = () => {
    const checkboxes = document.querySelectorAll('.audit-checkbox');
    const statusDisplay = document.getElementById('audit-status-display');
    const finalStatusInput = document.getElementById('audit-final-status');

    let allChecked = true;

    checkboxes.forEach(cb => {
        if (!cb.checked) allChecked = false;
    });

    if (checkboxes.length === 0) {
        statusDisplay.innerText = "Sem critérios";
        return;
    }

    if (allChecked) {
        statusDisplay.innerText = "✅ CONFORME";
        statusDisplay.style.background = "#d4edda";
        statusDisplay.style.color = "#155724";
        finalStatusInput.value = "Conforme";
    } else {
        statusDisplay.innerText = "🚫 NÃO CONFORME";
        statusDisplay.style.background = "#f8d7da";
        statusDisplay.style.color = "#721c24";
        finalStatusInput.value = "Não Conforme";
    }
};

// SALVAR AUDITORIA
document.getElementById('form-audit-execution').addEventListener('submit', async (e) => {
    e.preventDefault();

    const auditDate = document.getElementById('audit-date').value;
    const userSelect = document.getElementById('audit-user-select');
    const protocol = document.getElementById('audit-protocol').value;
    const occurDate = document.getElementById('audit-occurrence-date').value;
    const processSelect = document.getElementById('audit-process-select');
    const obs = document.getElementById('audit-obs').value;
    const status = document.getElementById('audit-final-status').value;

    if (!status) return alert("Selecione um processo e verifique o checklist.");

    const checklistData = [];
    document.querySelectorAll('.audit-checkbox').forEach(cb => {
        checklistData.push({
            criteria: cb.value,
            checked: cb.checked
        });
    });

    const auditPayload = {
        auditDate,
        collaboratorId: userSelect.value,
        collaboratorName: userSelect.options[userSelect.selectedIndex].text,
        protocol,
        occurrenceDate: occurDate,
        processName: processSelect.options[processSelect.selectedIndex].text,
        processId: processSelect.value,
        checklist: checklistData,
        status,
        observations: obs,
        createdAt: new Date(),
        auditor: document.getElementById('admin-name') ? document.getElementById('admin-name').innerText : 'Admin'
    };

    try {
        await addDoc(collection(db, "audits"), auditPayload);
        alert("Auditoria salva com sucesso!");
        document.getElementById('form-audit-execution').reset();
        document.getElementById('checklist-container').style.display = 'none';
        document.getElementById('audit-status-display').innerText = "Aguardando";
        document.getElementById('audit-status-display').style.background = "#eee";
        loadAuditHistory();
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar: " + e.message);
    }
});

window.loadAuditHistory = async () => {
    const tbody = document.getElementById('audit-history-body');
    if (!tbody) return;
    tbody.innerHTML = "<tr><td colspan='5'>Carregando...</td></tr>";

    try {
        const q = await getDocs(collection(db, "audits"));
        auditHistoryCache = [];
        q.forEach(d => auditHistoryCache.push({ id: d.id, ...d.data() }));

        // Mais recente primeiro
        auditHistoryCache.sort((a, b) => new Date(b.auditDate) - new Date(a.auditDate));

        applyAuditFilters(); // Chama a renderização através do filtro inicial

    } catch (e) { console.error(e); }
};

window.viewAuditAdmin = (id) => {
    const audit = auditHistoryCache.find(a => a.id === id);
    if (!audit) return;

    // Preencher informações do Modal
    document.getElementById('modal-admin-process-title').innerText = audit.processName;
    document.getElementById('modal-admin-date').innerText = audit.auditDate ? audit.auditDate.split('-').reverse().join('/') : '-';
    document.getElementById('modal-admin-auditor').innerText = audit.auditor || 'Admin';
    document.getElementById('modal-admin-protocol').innerText = audit.protocol || 'N/A';
    document.getElementById('modal-admin-occurrence').innerText = audit.occurrenceDate ? audit.occurrenceDate.split('-').reverse().join('/') : '-';
    document.getElementById('modal-admin-collab').innerText = audit.collaboratorName;
    document.getElementById('modal-admin-obs').innerText = audit.observations || 'Nenhuma observação registrada.';

    // Gerenciar as cores e preenchimento da badge de Status
    const badge = document.getElementById('modal-admin-status-badge');
    if (audit.status === 'Conforme') {
        badge.innerText = "✅ CONFORME";
        badge.style.background = "#d4edda";
        badge.style.color = "#155724";
    } else {
        badge.innerText = "🚫 NÃO CONFORME";
        badge.style.background = "#f8d7da";
        badge.style.color = "#721c24";
    }

    // Criar os itens de Checklist preenchidos na hora da avaliação
    const ul = document.getElementById('modal-admin-checklist');
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

    // Exibir o Modal na tela
    document.getElementById('modal-audit-view-admin').style.display = 'flex';
};

window.closeAuditAdminModal = () => {
    document.getElementById('modal-audit-view-admin').style.display = 'none';
};

window.renderAuditTable = (docs) => {
    const tbody = document.getElementById('audit-history-body');
    tbody.innerHTML = "";
    
    if(docs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='5' style='text-align:center;'>Nenhuma auditoria encontrada.</td></tr>";
        return;
    }

    docs.forEach(d => {
        const dateFmt = d.auditDate ? d.auditDate.split('-').reverse().join('/') : '-';
        const color = d.status === 'Conforme' ? '#28a745' : '#dc3545';
        
        tbody.innerHTML += `
            <tr>
                <td>${dateFmt}</td>
                <td>${d.collaboratorName}</td>
                <td>${d.processName}<br><small style="color:#666;">Prot: ${d.protocol}</small></td>
                <td><span style="color: ${color}; font-weight: bold;">${d.status}</span></td>
                <td>
                    <div style="display: flex; gap: 5px;">
                        <button onclick="viewAuditAdmin('${d.id}')" class="action-btn" style="background: var(--color-taupe); color: white;" title="Ver Detalhes">
                            <i class="material-icons" style="font-size: 18px;">visibility</i>
                        </button>
                        <button onclick="openEditAuditModal('${d.id}')" class="action-btn btn-edit" title="Editar Data do Ocorrido">
                            <i class="material-icons" style="font-size: 18px;">edit</i>
                        </button>
                        <button onclick="deleteAudit('${d.id}')" class="action-btn btn-delete" title="Excluir"><i class="material-icons">delete</i></button>
                    </div>
                </td>
            </tr>
        `;
    });
};

// Função para abrir o modal de edição e preencher a data
window.openEditAuditModal = (id) => {
    const audit = auditHistoryCache.find(a => a.id === id);
    if (!audit) return;

    document.getElementById('edit-audit-id').value = audit.id;
    document.getElementById('edit-audit-occurrence-date').value = audit.occurrenceDate || '';
    
    document.getElementById('modal-edit-audit').style.display = 'flex';
};

// Função para salvar a alteração da data no Firebase
window.saveEditedAudit = async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('edit-audit-id').value;
    const newDate = document.getElementById('edit-audit-occurrence-date').value;

    if (!id || !newDate) return;

    try {
        // Usamos setDoc com { merge: true } para atualizar apenas o campo desejado
        await setDoc(doc(db, "audits", id), {
            occurrenceDate: newDate
        }, { merge: true });
        
        if (typeof window.showNotification === 'function') {
            window.showNotification("Data do ocorrido atualizada com sucesso!", "success");
        } else {
            alert("Data do ocorrido atualizada com sucesso!");
        }
        
        document.getElementById('modal-edit-audit').style.display = 'none';
        loadAuditHistory(); // Recarrega a tabela para refletir a mudança
    } catch (error) {
        console.error("Erro ao atualizar data da auditoria:", error);
        if (typeof window.showNotification === 'function') {
            window.showNotification("Erro ao atualizar: " + error.message, "error");
        } else {
            alert("Erro ao atualizar: " + error.message);
        }
    }
};

window.applyAuditFilters = () => {
    const dateFilter = document.getElementById('filter-audit-date').value;
    const collabFilter = document.getElementById('filter-audit-collab').value.toLowerCase();
    const processFilter = document.getElementById('filter-audit-process').value.toLowerCase();
    const statusFilter = document.getElementById('filter-audit-status').value;

    const filteredData = auditHistoryCache.filter(item => {
        let matchDate = dateFilter ? item.auditDate === dateFilter : true;
        let matchCollab = collabFilter ? (item.collaboratorName || '').toLowerCase().includes(collabFilter) : true;

        let processName = (item.processName || '').toLowerCase();
        let protocol = (item.protocol || '').toLowerCase();
        let matchProcess = processFilter ? (processName.includes(processFilter) || protocol.includes(processFilter)) : true;

        let matchStatus = statusFilter !== 'all' ? item.status === statusFilter : true;

        return matchDate && matchCollab && matchProcess && matchStatus;
    });

    renderAuditTable(filteredData);
};

window.clearAuditFilters = () => {
    document.getElementById('filter-audit-date').value = '';
    document.getElementById('filter-audit-collab').value = '';
    document.getElementById('filter-audit-process').value = '';
    document.getElementById('filter-audit-status').value = 'all';
    applyAuditFilters();
};

window.deleteAudit = async (id) => {
    if (!confirm("Excluir este registro de auditoria?")) return;
    try {
        await deleteDoc(doc(db, "audits", id));
        loadAuditHistory();
    } catch (e) { alert("Erro ao excluir"); }
};


// ============================================================
// 3. GERENCIADOR DE MODELOS (CONFIG)
// ============================================================

// Adicionar critério à lista temporária
window.addCriteriaToList = () => {
    const input = document.getElementById('new-criteria-input');
    const val = input.value.trim();
    if (!val) return;

    currentCriteriaList.push(val);
    renderCriteriaList();
    input.value = "";
    input.focus();
};

// Renderiza a lista visualmente
function renderCriteriaList() {
    const ul = document.getElementById('temp-criteria-list');
    ul.innerHTML = "";

    if (currentCriteriaList.length === 0) {
        ul.innerHTML = '<li style="color: #999; font-style: italic; padding: 10px;">Nenhum critério adicionado.</li>';
        return;
    }

    currentCriteriaList.forEach((crit, index) => {
        ul.innerHTML += `
                <li>
                    <span>${crit}</span>
                    <button type="button" class="btn-remove-item" onclick="removeCriteria(${index})">×</button>
                </li>
            `;
    });
}

window.removeCriteria = (index) => {
    currentCriteriaList.splice(index, 1);
    renderCriteriaList();
};

// Salvar Template no Firebase
document.getElementById('form-audit-template').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('template-name').value;
    const id = document.getElementById('template-id').value;

    if (currentCriteriaList.length === 0) return alert("Adicione pelo menos um critério ao checklist.");

    const data = {
        name: name,
        criteria: currentCriteriaList,
        updatedAt: new Date()
    };

    try {
        if (id) {
            await setDoc(doc(db, "audit_templates", id), data);
            alert("Modelo atualizado!");
        } else {
            await addDoc(collection(db, "audit_templates"), data);
            alert("Modelo criado!");
        }
        resetTemplateForm();
        loadTemplatesList();
        loadAuditTemplatesOptions(); // Atualiza o select da outra tela
    } catch (error) {
        alert("Erro ao salvar modelo: " + error.message);
    }
});

window.resetTemplateForm = () => {
    document.getElementById('form-audit-template').reset();
    document.getElementById('template-id').value = "";
    currentCriteriaList = [];
    renderCriteriaList();
};

// Listar Templates Existentes
window.loadTemplatesList = async () => {
    const div = document.getElementById('templates-list-container');
    div.innerHTML = "Carregando...";

    try {
        const q = await getDocs(collection(db, "audit_templates"));
        div.innerHTML = "";

        if (q.empty) {
            div.innerHTML = "<p>Nenhum modelo cadastrado.</p>";
            return;
        }

        q.forEach(docSnap => {
            const t = docSnap.data();
            div.innerHTML += `
                    <div class="template-card-mini">
                        <div>
                            <strong>${t.name}</strong><br>
                            <small>${t.criteria ? t.criteria.length : 0} critérios</small>
                        </div>
                        <div style="display:flex; gap:5px;">
                            <button onclick="editTemplate('${docSnap.id}')" class="action-btn btn-edit"><i class="material-icons">edit</i></button>
                            <button onclick="deleteTemplate('${docSnap.id}')" class="action-btn btn-delete"><i class="material-icons">delete</i></button>
                        </div>
                    </div>
                `;
        });
    } catch (e) { console.error(e); }
};

window.editTemplate = async (id) => {
    const docRef = doc(db, "audit_templates", id);
    const snap = await getDocs(query(collection(db, "audit_templates"), where("__name__", "==", id))); // Hack rápido ou usar getDoc
    // Nota: usando getDoc direto:
    /*
    const snap = await getDoc(doc(db, "audit_templates", id));
    if (snap.exists()) { ... }
    */
    // Para simplificar, vou recarregar a lista se necessário, mas vou usar o templatesCache se estiver preenchido via loadAuditTemplatesOptions

    // Melhor abordagem direta:
    resetTemplateForm();
    // Procura no DOM ou busca de novo
    // Vou buscar direto para garantir dados frescos
    try {
        // Como não importei getDoc no topo deste bloco de exemplo, vou usar a lista carregada
        // Se você usou o loadAuditTemplatesOptions antes, templatesCache está populado
        let template = templatesCache.find(t => t.id === id);

        // Se não tiver no cache, busca no banco (Safety fallback)
        /* Implementação ideal requer getDoc importado */

        if (template) {
            document.getElementById('template-id').value = id;
            document.getElementById('template-name').value = template.name;
            currentCriteriaList = template.criteria || [];
            renderCriteriaList();
        }
    } catch (e) { console.error(e); }
};

window.deleteTemplate = async (id) => {
    if (!confirm("Excluir este modelo de processo?")) return;
    try {
        await deleteDoc(doc(db, "audit_templates", id));
        loadTemplatesList();
        loadAuditTemplatesOptions();
    } catch (e) { alert("Erro ao excluir."); }
};

// DASHBOARD QA

window.loadDashQA = async () => {
    try {
        // Busca todas as auditorias no banco
        const q = await getDocs(collection(db, "audits"));
        qaDataCache = [];
        q.forEach(d => qaDataCache.push(d.data()));

        let total = qaDataCache.length;
        let conformes = 0;
        let nc = 0;
        let processNcCount = {}; // Para contar falhas por processo

        qaDataCache.forEach(audit => {
            if (audit.status === 'Conforme') {
                conformes++;
            } else {
                nc++;
                // Registra o processo que gerou a NC
                let pName = audit.processName || 'Sem Categoria';
                processNcCount[pName] = (processNcCount[pName] || 0) + 1;
            }
        });

        // Atualiza os Cards (KPIs)
        document.getElementById('kpi-qa-total').innerText = total;
        document.getElementById('kpi-qa-conforme').innerText = conformes;
        document.getElementById('kpi-qa-nc').innerText = nc;

        // Renderiza Gráficos
        renderQaCharts(conformes, nc, processNcCount);

    } catch (e) {
        console.error("Erro ao carregar a Dashboard de QA:", e);
    }
};

// Função para montar os Gráficos
window.renderQaCharts = (conformes, nc, processNcCount) => {
    const ctxStatus = document.getElementById('chartQaStatus');
    const ctxProcess = document.getElementById('chartQaProcess');

    if (chartQaStatusInstance) chartQaStatusInstance.destroy();
    if (chartQaProcessInstance) chartQaProcessInstance.destroy();

    // Gráfico de Rosca (Status)
    if (ctxStatus) {
        chartQaStatusInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Conformes', 'Não Conformes'],
                datasets: [{
                    data: [conformes, nc],
                    backgroundColor: ['#28a745', '#dc3545'],
                    borderWidth: 0
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    // Gráfico de Barras (Top Processos com Falhas)
    if (ctxProcess) {
        // Ordena para pegar os 5 piores processos
        const sortedProcess = Object.keys(processNcCount)
            .sort((a, b) => processNcCount[b] - processNcCount[a])
            .slice(0, 5); 
        
        const processData = sortedProcess.map(p => processNcCount[p]);

        chartQaProcessInstance = new Chart(ctxProcess, {
            type: 'bar',
            data: {
                labels: sortedProcess,
                datasets: [{
                    label: 'Quantidade de NCs',
                    data: processData,
                    backgroundColor: '#ffc107',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                plugins: { legend: { display: false } }
            }
        });
    }
};

// Função que abre o modal e constrói a tabela do Ranking
window.openQaNcModal = () => {
    const tbody = document.getElementById('table-qa-nc-body');
    tbody.innerHTML = '';

    let collabStats = {};

    // Agrupa dados por colaborador
    qaDataCache.forEach(audit => {
        let name = audit.collaboratorName || 'Desconhecido';
        if (!collabStats[name]) {
            collabStats[name] = { total: 0, nc: 0 };
        }
        collabStats[name].total++;
        if (audit.status !== 'Conforme') {
            collabStats[name].nc++;
        }
    });

    // Transforma em array e calcula a %
    let ranking = Object.keys(collabStats).map(name => {
        let total = collabStats[name].total;
        let nc = collabStats[name].nc;
        let taxa = total > 0 ? ((nc / total) * 100).toFixed(1) : 0;
        return { name, total, nc, taxa: parseFloat(taxa) };
    });

    // Filtra quem tem NC e ordena pela maior taxa (%)
    ranking = ranking.filter(r => r.nc > 0).sort((a, b) => b.taxa - a.taxa);

    if (ranking.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum ofensor encontrado no momento. 🎉</td></tr>';
    } else {
        ranking.forEach(r => {
            // Estilizar quem tem 100% de erro
            let colorTaxa = r.taxa >= 50 ? '#dc3545' : '#ffc107'; 
            
            tbody.innerHTML += `
                <tr>
                    <td style="font-weight: 600; color: var(--color-dark-brown);">${r.name}</td>
                    <td style="text-align: center;">${r.total}</td>
                    <td style="text-align: center;"><span style="background: #ffebee; color: #dc3545; padding: 4px 10px; border-radius: 20px; font-weight: bold;">${r.nc}</span></td>
                    <td style="text-align: center; color: ${colorTaxa}; font-weight: bold;">${r.taxa}%</td>
                </tr>
            `;
        });
    }

    document.getElementById('modal-qa-nc').style.display = 'flex';
};

