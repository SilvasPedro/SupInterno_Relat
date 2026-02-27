import { 
    collection, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./config/firebase_config.js";

let atipicosCache = [];
let isAdminMode = false; // Define se o usuário atual é admin

// Inicializa a seção detectando a role pela página (ou você pode injetar essa var pelo auth)
setTimeout(() => {
    isAdminMode = window.location.pathname.includes('admin_dashboard');
    window.loadLocaisProblema();
}, 500);

// ==========================================
// 1. GESTÃO DOS LOCAIS DE IDENTIFICAÇÃO (Lista Dinâmica)
// ==========================================
window.loadLocaisProblema = async () => {
    const select = document.getElementById('atipico-local');
    if (!select) return;

    try {
        const q = query(collection(db, "atipicos_locais"));
        const snap = await getDocs(q);
        
        select.innerHTML = '<option value="">Selecione o local...</option>';
        let locais = [];
        snap.forEach(d => locais.push({ id: d.id, nome: d.data().nome }));
        
        locais.sort((a,b) => a.nome.localeCompare(b.nome)).forEach(l => {
            select.innerHTML += `<option value="${l.nome}">${l.nome}</option>`;
        });
    } catch(e) { console.error("Erro ao carregar locais", e); }
};

window.promptNovoLocal = async () => {
    const novo = prompt("Digite o novo local/sistema onde o problema foi identificado:");
    if (!novo || novo.trim() === '') return;

    try {
        await addDoc(collection(db, "atipicos_locais"), { nome: novo.trim() });
        alert("Local adicionado!");
        window.loadLocaisProblema();
    } catch(e) { alert("Erro ao adicionar local."); }
};

// ==========================================
// 2. LISTAGEM E RENDERIZAÇÃO
// ==========================================
window.loadAtendimentosAtipicos = async () => {
    const grid = document.getElementById('atipicos-grid');
    if (!grid) return;

    grid.innerHTML = "<p>Carregando registros...</p>";

    try {
        const q = query(collection(db, "atendimentos_atipicos"));
        const snap = await getDocs(q);
        
        atipicosCache = [];
        snap.forEach(d => atipicosCache.push({ id: d.id, ...d.data() }));
        
        // Ordena por data do ocorrido (mais recente primeiro)
        atipicosCache.sort((a, b) => new Date(b.data) - new Date(a.data));
        
        window.applyAtipicoFilters();
    } catch(e) { grid.innerHTML = "<p>Erro ao carregar.</p>"; }
};

window.applyAtipicoFilters = () => {
    const busca = document.getElementById('filter-atipico-busca').value.toLowerCase();
    const status = document.getElementById('filter-atipico-status').value;

    const filtered = atipicosCache.filter(item => {
        const matchBusca = item.cliente.toLowerCase().includes(busca) || item.protocolo.toLowerCase().includes(busca);
        const matchStatus = status === 'all' || item.status === status;
        return matchBusca && matchStatus;
    });

    renderAtipicosGrid(filtered);
};

window.clearAtipicoFilters = () => {
    document.getElementById('filter-atipico-busca').value = '';
    document.getElementById('filter-atipico-status').value = 'all';
    window.applyAtipicoFilters();
};

function renderAtipicosGrid(data) {
    const grid = document.getElementById('atipicos-grid');
    grid.innerHTML = "";

    if (data.length === 0) {
        grid.innerHTML = '<div class="empty-state">Nenhum registro atípico encontrado.</div>';
        return;
    }

    const currentUserEmail = auth.currentUser ? auth.currentUser.email : '';

    data.forEach(item => {
        const dateFmt = item.data.split('-').reverse().join('/');
        
        // Cores de Status
        let color = '#ffc107'; let bg = '#fff3cd'; // Pendente
        if (item.status === 'Resolvido') { color = '#28a745'; bg = '#d4edda'; }
        if (item.status === 'Em Avaliação do TI') { color = '#17a2b8'; bg = '#d1ecf1'; }

        // Validação de Permissão: Pode editar se for Admin OU se for o autor
        const canEdit = isAdminMode || item.registradoPor === currentUserEmail;

        const actionsHtml = canEdit ? `
            <div style="display: flex; width: 80%; gap: 10px;">
                <button onclick="editAtipico('${item.id}')" style="flex: 1; display: flex; justify-content: center; align-items: center; background: #ffc107; color: #333; border: none; padding: 8px; border-radius: 6px; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Editar">
                    <i class="material-icons" style="font-size: 18px;">edit</i>
                </button>
                <button onclick="deleteAtipico('${item.id}')" style="flex: 1; display: flex; justify-content: center; align-items: center; background: #dc3545; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" title="Excluir">
                    <i class="material-icons" style="font-size: 18px;">delete</i>
                </button>
            </div>
        ` : '';

        grid.innerHTML += `
            <div class="history-card" style="border-left: 5px solid ${color}; display: flex; flex-direction: column; justify-content: space-between; padding: 10px;">
                <div>
                    <div class="h-card-header" style="flex-direction: column; align-items: flex-start; gap: 5px;">
                        <div style="display:flex; justify-content:space-between; width: 100%;">
                            <span class="h-date"><i class="material-icons">event</i> ${dateFmt}</span>
                            <span style="background:${bg}; color:${color}; padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold;">${item.status}</span>
                        </div>
                        <strong style="font-size: 16px; color: var(--color-dark-brown);">${item.cliente}</strong>
                    </div>
                    <div class="h-card-body" style="display: block; text-align: left;">
                        <p style="margin:0 0 5px 0; font-size: 13px;"><strong>Prot:</strong> ${item.protocolo}</p>
                        <p style="margin:0 0 5px 0; font-size: 13px;"><strong>Meio:</strong> ${item.meio}</p>
                        <p style="margin:0 0 5px 0; font-size: 13px;"><strong>Plataforma:</strong> ${item.local}</p>
                    </div>
                </div>
                
                <div style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                    <button onclick="openDetalhesModal('${item.id}')" style="width: 80%; background: #f4f4f4; color: #333; border: 1px solid #ccc; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: bold; display: flex; justify-content: center; align-items: center; gap: 5px; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <i class="material-icons" style="font-size: 18px;">visibility</i> Ver Detalhes
                    </button>
                    ${actionsHtml}
                </div>
            </div>
        `;
    });
}
// ==========================================
// 3. AÇÕES (MODAL, SALVAR, EDITAR, EXCLUIR)
// ==========================================
window.openModalAtipico = () => {
    document.getElementById('form-atipico').reset();
    document.getElementById('atipico-id').value = '';
    document.getElementById('modal-atipico-title').innerText = "Novo Registro Atípico";
    document.getElementById('modal-atipico').style.display = 'flex';
};

window.closeModalAtipico = () => {
    document.getElementById('modal-atipico').style.display = 'none';
};

window.saveAtipico = async (e) => {
    e.preventDefault();
    const id = document.getElementById('atipico-id').value;
    const statusVal = document.querySelector('input[name="atipico-status"]:checked').value;
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    
    // Bloqueia o botão para evitar duplos cliques
    btnSubmit.disabled = true;
    btnSubmit.innerText = "Salvando...";

    try {
        const payload = {
            cliente: document.getElementById('atipico-cliente').value,
            data: document.getElementById('atipico-data').value,
            protocolo: document.getElementById('atipico-protocolo').value,
            meio: document.getElementById('atipico-meio').value,
            local: document.getElementById('atipico-local').value,
            detalhes: document.getElementById('atipico-detalhes').value,
            status: statusVal,
            registradoPor: auth.currentUser ? auth.currentUser.email : 'Desconhecido',
            atualizadoEm: new Date().toISOString()
        };

        if (id) {
            delete payload.registradoPor; 
            await updateDoc(doc(db, "atendimentos_atipicos", id), payload);
            alert("Registro atualizado com sucesso!");
        } else {
            payload.criadoEm = new Date().toISOString();
            await addDoc(collection(db, "atendimentos_atipicos"), payload);
            alert("Registro salvo com sucesso!");
        }
        
        window.closeModalAtipico();
        window.loadAtendimentosAtipicos();
    } catch(err) { 
        alert("Erro ao salvar: " + err.message); 
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "Salvar Registro";
    }
};

window.editAtipico = (id) => {
    const item = atipicosCache.find(i => i.id === id);
    if(!item) return;

    document.getElementById('atipico-id').value = id;
    document.getElementById('atipico-cliente').value = item.cliente;
    document.getElementById('atipico-data').value = item.data;
    document.getElementById('atipico-protocolo').value = item.protocolo;
    document.getElementById('atipico-meio').value = item.meio;
    document.getElementById('atipico-local').value = item.local;
    document.getElementById('atipico-detalhes').value = item.detalhes || '';
    
    const radios = document.getElementsByName('atipico-status');
    for (const r of radios) { if(r.value === item.status) r.checked = true; }

    document.getElementById('modal-atipico-title').innerText = "Editar Registro Atípico";
    document.getElementById('modal-atipico').style.display = 'flex';
};

window.deleteAtipico = async (id) => {
    if (!confirm("⚠️ Tem certeza que deseja excluir este registro?")) return;
    try {
        await deleteDoc(doc(db, "atendimentos_atipicos", id));
        alert("Excluído com sucesso.");
        window.loadAtendimentosAtipicos();
    } catch(e) { alert("Erro ao excluir."); }
};

window.openDetalhesModal = (id) => {
    const item = atipicosCache.find(i => i.id === id);
    if (!item) return;

    const dateFmt = item.data.split('-').reverse().join('/');
    const detalhesTexto = item.detalhes && item.detalhes.trim() !== '' 
        ? item.detalhes 
        : 'Nenhuma informação adicional registrada.';

    const contentDiv = document.getElementById('atipico-detalhes-content');
    contentDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
            <div><strong>Cliente:</strong><br> ${item.cliente}</div>
            <div><strong>Data do Ocorrido:</strong><br> ${dateFmt}</div>
            <div><strong>Protocolo:</strong><br> ${item.protocolo}</div>
            <div><strong>Meio de Entrada:</strong><br> ${item.meio}</div>
            <div><strong>Status:</strong><br> ${item.status}</div>
            <div><strong>Registrado por:</strong><br> <span style="font-size: 12px; word-break: break-all;">${item.registradoPor}</span></div>
        </div>
        <div style="margin-bottom: 15px;">
            <strong>Onde o problema foi identificado:</strong><br> ${item.local}
        </div>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;">
        <div>
            <strong>Mais Informações:</strong>
            <div style="background: #f9f9f9; padding: 12px; border-radius: 6px; border: 1px solid #ddd; white-space: pre-wrap; margin-top: 8px; min-height: 60px;">${detalhesTexto}</div>
        </div>
    `;

    document.getElementById('modal-atipico-detalhes').style.display = 'flex';
};

window.closeDetalhesModal = () => {
    document.getElementById('modal-atipico-detalhes').style.display = 'none';
};