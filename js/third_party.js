
import {
    getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

import { auth, db } from "./config/firebase_config.js";

// Estado Local
let thirdPartyCache = [];
let chart3PStatusInstance = null;
let chart3PTimelineInstance = null;

// ============================================================
// 1. CARREGAMENTO E DASHBOARD
// ============================================================

window.loadThirdPartyDashboard = async () => {
    const tableBody = document.getElementById('table-3p-body');
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='5'>Carregando dados...</td></tr>";

    try {
        const q = await getDocs(collection(db, "third_party_evaluations"));
        thirdPartyCache = [];

        q.forEach(docSnap => {
            thirdPartyCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Ordena por data (mais recente primeiro)
        thirdPartyCache.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Renderiza Inicial
        renderThirdPartyTable();
        updateThirdPartyKPIsLogic();
        processAndRenderTimeline();

    } catch (error) {
        console.error("Erro dashboard 3P:", error);
        tableBody.innerHTML = "<tr><td colspan='5'>Erro ao carregar.</td></tr>";
    }
};

// ============================================================
// 2. TABELA E FILTROS (ATUALIZADO)
// ============================================================

window.renderThirdPartyTable = () => {
    const tableBody = document.getElementById('table-3p-body');

    // Captura valores dos filtros
    const searchProtocol = document.getElementById('search-3p-protocol').value.trim().toLowerCase();
    const searchAgent = document.getElementById('search-3p-agent').value.trim().toLowerCase();
    const searchStart = document.getElementById('search-3p-start').value;
    const searchEnd = document.getElementById('search-3p-end').value;

    tableBody.innerHTML = "";

    // Lógica de Filtragem Combinada
    const filteredData = thirdPartyCache.filter(item => {
        // 1. Filtro Protocolo
        const matchProtocol = (item.protocol || '').toLowerCase().includes(searchProtocol);

        // 2. Filtro Atendente
        const matchAgent = (item.agent || '').toLowerCase().includes(searchAgent);

        // 3. Filtro Data (Range)
        let matchDate = true;
        if (searchStart) matchDate = matchDate && (item.date >= searchStart);
        if (searchEnd) matchDate = matchDate && (item.date <= searchEnd);

        return matchProtocol && matchAgent && matchDate;
    });

    if (filteredData.length === 0) {
        tableBody.innerHTML = "<tr><td colspan='5' style='text-align:center; padding: 20px;'>Nenhum registro encontrado para os filtros selecionados.</td></tr>";
        return;
    }

    // Renderização das Linhas
    filteredData.forEach(item => {
        let badge = '';
        if (item.status === 'conformidade') badge = '<span style="color:#28a745; font-weight:bold; background:#e8f5e9; padding:2px 8px; border-radius:12px; font-size:12px;">Conforme</span>';
        else if (item.status === 'nc_leve') badge = '<span style="color:#856404; font-weight:bold; background:#fff3cd; padding:2px 8px; border-radius:12px; font-size:12px;">NC Leve</span>';
        else badge = '<span style="color:#721c24; font-weight:bold; background:#f8d7da; padding:2px 8px; border-radius:12px; font-size:12px;">NC Grave</span>';

        tableBody.innerHTML += `
            <tr>
                <td>${item.date.split('-').reverse().join('/')}</td>
                <td><strong>${item.protocol}</strong></td>
                <td>${item.agent}</td>
                <td>${badge}</td>
                <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 5px;">
                        <button onclick="viewThirdPartyDetail('${item.id}')" class="action-btn" style="background: var(--color-taupe); color: white;" title="Ver Detalhes">
                            <i class="material-icons" style="font-size: 16px;">visibility</i>
                        </button>
                        <button onclick="openEditThirdPartyModal('${item.id}')" class="action-btn" style="background: #ffc107; color: #333;" title="Editar">
                            <i class="material-icons" style="font-size: 16px;">edit</i>
                        </button>
                        <button onclick="deleteThirdPartyEvaluation('${item.id}')" class="action-btn" style="background: #dc3545; color: white;" title="Excluir">
                            <i class="material-icons" style="font-size: 16px;">delete</i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
};

// Função para limpar filtros rapidamente
window.clearThirdPartyFilters = () => {
    document.getElementById('search-3p-protocol').value = "";
    document.getElementById('search-3p-agent').value = "";
    document.getElementById('search-3p-start').value = "";
    document.getElementById('search-3p-end').value = "";
    renderThirdPartyTable();
};

// ============================================================
// 3. GRÁFICOS E KPIs
// ============================================================

function updateThirdPartyKPIsLogic() {
    let total = thirdPartyCache.length;
    let countConf = 0, countLeve = 0, countGrave = 0;

    thirdPartyCache.forEach(item => {
        if (item.status === 'conformidade') countConf++;
        else if (item.status === 'nc_leve') countLeve++;
        else if (item.status === 'nc_grave') countGrave++;
    });

    document.getElementById('kpi-3p-total').innerText = total;
    document.getElementById('kpi-3p-leve').innerText = countLeve;
    document.getElementById('kpi-3p-grave').innerText = countGrave;

    const perc = total > 0 ? ((countConf / total) * 100).toFixed(1) : 0;
    document.getElementById('kpi-3p-conformidade').innerText = perc + "%";

    renderThirdPartyChart(countConf, countLeve, countGrave);
}

function renderThirdPartyChart(conf, leve, grave) {
    const ctx = document.getElementById('chartThirdPartyStatus');
    if (!ctx) return;
    if (chart3PStatusInstance) chart3PStatusInstance.destroy();

    chart3PStatusInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Conformidade', 'NC Leve', 'NC Grave'],
            datasets: [{
                data: [conf, leve, grave],
                backgroundColor: ['#28a745', '#ffc107', '#dc3545'],
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

function processAndRenderTimeline() {
    const ctx = document.getElementById('chartThirdPartyTimeline');
    if (!ctx) return;

    const groups = {};
    thirdPartyCache.forEach(item => {
        const d = item.date;
        if (!groups[d]) groups[d] = { conf: 0, leve: 0, grave: 0 };

        if (item.status === 'conformidade') groups[d].conf++;
        else if (item.status === 'nc_leve') groups[d].leve++;
        else if (item.status === 'nc_grave') groups[d].grave++;
    });

    const sortedDates = Object.keys(groups).sort();
    const labels = sortedDates.map(date => date.split('-').reverse().slice(0, 2).join('/'));

    if (chart3PTimelineInstance) chart3PTimelineInstance.destroy();

    chart3PTimelineInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: 'Conformidade', data: sortedDates.map(d => groups[d].conf), borderColor: '#28a745', tension: 0.3 },
                { label: 'NC Leve', data: sortedDates.map(d => groups[d].leve), borderColor: '#ffc107', tension: 0.3 },
                { label: 'NC Grave', data: sortedDates.map(d => groups[d].grave), borderColor: '#dc3545', tension: 0.3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

// ============================================================
// 4. LÓGICA DE FORMULÁRIO (SALVAR)
// ============================================================

// Listener anexado ao carregar o módulo
setTimeout(() => {
    const formThirdParty = document.getElementById('form-third-party');
    if (formThirdParty) {
        // Remove listeners antigos clonando (opcional, mas seguro)
        const newForm = formThirdParty.cloneNode(true);
        formThirdParty.parentNode.replaceChild(newForm, formThirdParty);

        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const protocol = document.getElementById('tp-protocol').value;
            const company = document.getElementById('tp-company').value;
            const date = document.getElementById('tp-date').value;
            const agent = document.getElementById('tp-agent').value;
            const comment = document.getElementById('tp-comment').value;
            const statusEl = document.querySelector('input[name="tp-status"]:checked');

            if (!statusEl) return alert("Selecione um status.");

            try {
                const newDocRef = doc(collection(db, "third_party_evaluations"));
                await setDoc(newDocRef, {
                    protocol, company, date, agent, comment,
                    status: statusEl.value,
                    createdAt: new Date(),
                    auditor: document.getElementById('admin-name') ? document.getElementById('admin-name').innerText : 'Admin'
                });

                alert("Avaliação registrada com sucesso!");
                newForm.reset();
            } catch (error) {
                console.error(error);
                alert("Erro ao salvar: " + error.message);
            }
        });
    }
}, 500); // Pequeno delay para garantir DOM carregado

// ============================================================
// 5. DETALHES, EDIÇÃO E EXCLUSÃO
// ============================================================

window.viewThirdPartyDetail = (id) => {
    const item = thirdPartyCache.find(i => i.id === id);
    if (!item) return;

    const modalContent = document.getElementById('modal-3p-content');
    const statusColor = item.status === 'conformidade' ? '#28a745' : (item.status === 'nc_leve' ? '#ffc107' : '#dc3545');
    const statusText = item.status === 'conformidade' ? 'Conformidade' : (item.status === 'nc_leve' ? 'Não Conformidade Leve' : 'Não Conformidade Grave');

    modalContent.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div><label style="font-size:11px; color:#666; font-weight:bold;">PROTOCOLO</label><div style="font-size:16px; color:#333;">${item.protocol}</div></div>
            <div><label style="font-size:11px; color:#666; font-weight:bold;">EMPRESA</label><div style="font-size:16px; color:#333;">${item.company || 'N/A'}</div></div>
            <div><label style="font-size:11px; color:#666; font-weight:bold;">DATA</label><div style="font-size:16px; color:#333;">${item.date.split('-').reverse().join('/')}</div></div>
            <div><label style="font-size:11px; color:#666; font-weight:bold;">ATENDENTE</label><div style="font-size:16px; color:#333;">${item.agent}</div></div>
        </div>
        <div style="background: ${statusColor}20; padding: 15px; border-left: 5px solid ${statusColor}; margin-bottom: 20px;">
            <h4 style="margin: 0; color: ${statusColor};">${statusText}</h4>
        </div>
        <div><label style="font-size:12px; color:#666; font-weight:bold;">COMENTÁRIO</label><div style="background:#f8f9fa; padding:15px; border:1px solid #eee;">${item.comment}</div></div>
    `;
    document.getElementById('modal-3p-details').style.display = 'block';
};

window.deleteThirdPartyEvaluation = async (docId) => {
    if (!confirm("⚠️ Tem certeza que deseja excluir esta avaliação?")) return;
    try {
        await deleteDoc(doc(db, "third_party_evaluations", docId));
        alert("Excluído com sucesso.");
        loadThirdPartyDashboard();
    } catch (e) { alert("Erro: " + e.message); }
};

window.openEditThirdPartyModal = (docId) => {
    const item = thirdPartyCache.find(i => i.id === docId);
    if (!item) return;

    document.getElementById('edit-tp-id').value = docId;
    document.getElementById('edit-tp-protocol').value = item.protocol;
    document.getElementById('edit-tp-company').value = item.company || '';
    document.getElementById('edit-tp-date').value = item.date;
    document.getElementById('edit-tp-agent').value = item.agent;
    document.getElementById('edit-tp-comment').value = item.comment;

    const radios = document.getElementsByName('edit-tp-status');
    for (const r of radios) { if (r.value === item.status) r.checked = true; }

    document.getElementById('modal-edit-3p').style.display = 'block';
};

window.saveEditedThirdPartyEvaluation = async (event) => {
    event.preventDefault();
    const docId = document.getElementById('edit-tp-id').value;
    const statusEl = document.querySelector('input[name="edit-tp-status"]:checked');

    if (!docId) return;

    try {
        await updateDoc(doc(db, "third_party_evaluations", docId), {
            protocol: document.getElementById('edit-tp-protocol').value,
            company: document.getElementById('edit-tp-company').value,
            date: document.getElementById('edit-tp-date').value,
            agent: document.getElementById('edit-tp-agent').value,
            comment: document.getElementById('edit-tp-comment').value,
            status: statusEl ? statusEl.value : 'nc_leve'
        });

        alert("Atualizado com sucesso!");
        document.getElementById('modal-edit-3p').style.display = 'none';
        loadThirdPartyDashboard();
    } catch (e) { alert("Erro: " + e.message); }
};

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('report-modal');
    const btnOpen = document.getElementById('btn-open-report-modal');
    const btnClose = document.getElementById('close-report-modal');
    const form = document.getElementById('report-form');

    if (!btnOpen || !form) return; // Segurança para não dar erro em outras telas

    // 1. Controle do Modal
    btnOpen.addEventListener('click', () => modal.style.display = 'flex');
    btnClose.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
    });

    // 2. Busca no Firebase e Submissão
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const company = document.getElementById('report-company').value;
        const startDate = document.getElementById('report-start-date').value;
        const endDate = document.getElementById('report-end-date').value;
        const btnSubmit = e.target.querySelector('button[type="submit"]');

        // Feedback visual de carregamento
        const originalBtnText = btnSubmit.innerText;
        btnSubmit.innerText = "Buscando dados...";
        btnSubmit.disabled = true;

        try {
            // Busca apenas os documentos da empresa selecionada
            const q = query(
                collection(db, "third_party_evaluations"),
                where("company", "==", company)
            );

            const querySnapshot = await getDocs(q);
            let dadosFiltrados = [];

            // Filtra as datas e formata os dados
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();

                // Verifica se a data do registro está dentro do período (YYYY-MM-DD)
                if (data.date >= startDate && data.date <= endDate) {

                    // Transforma o status do sistema em texto legível
                    let statusAjustado = 'N/A';
                    if (data.status === 'conformidade') statusAjustado = 'Conforme';
                    else if (data.status === 'nc_leve') statusAjustado = 'NC Leve';
                    else if (data.status === 'nc_grave') statusAjustado = 'NC Grave';

                    dadosFiltrados.push({
                        dataRegistroIso: data.date, // usado para ordenação
                        dataRegistro: data.date.split('-').reverse().join('/'), // DD/MM/YYYY
                        protocolo: data.protocol,
                        colaborador: data.agent,
                        status: statusAjustado,
                        obs: data.comment || 'Sem observação'
                    });
                }
            });

            // Ordena os registros do mais antigo para o mais novo
            dadosFiltrados.sort((a, b) => new Date(a.dataRegistroIso) - new Date(b.dataRegistroIso));

            // Se não encontrar nada, avisa o usuário e cancela a geração do PDF
            if (dadosFiltrados.length === 0) {
                alert("Nenhum registro encontrado para esta empresa neste período.");
                btnSubmit.innerText = originalBtnText;
                btnSubmit.disabled = false;
                return;
            }

            // Chama a função que constrói o layout HTML e converte em PDF
            gerarPDFRelatorio(company, startDate, endDate, dadosFiltrados);
            modal.style.display = 'none'; // Fecha o modal

        } catch (error) {
            console.error("Erro ao resgatar dados:", error);
            alert("Erro ao buscar as informações no banco de dados.");
        } finally {
            // Restaura o botão
            btnSubmit.innerText = originalBtnText;
            btnSubmit.disabled = false;
        }
    });
});

// 3. Função para montar o layout e exportar via html2pdf (Aprimorada)
function gerarPDFRelatorio(company, startDate, endDate, dados) {
    const container = document.getElementById('pdf-content-container');
    
    // Início do HTML do relatório com CSS embutido para controle de impressão e quebra de texto
    let htmlContent = `
        <div style="padding: 20px; font-family: Arial, sans-serif; color: #333; width: 100%; box-sizing: border-box;">
            <style>
                /* Evita que a linha seja cortada no meio entre as páginas */
                tr { page-break-inside: avoid !important; }
                
                /* Força a quebra de texto na coluna de observação para não vazar a tela */
                .obs-column {
                    word-wrap: break-word;
                    white-space: pre-wrap;
                    max-width: 350px; /* Limite máximo para a observação */
                }
            </style>

            <div style="text-align: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #2c3e50;">Relatório de Qualidade - ${company}</h2>
                <p style="margin-top: 5px; color: #666;">
                    <strong>Período:</strong> ${startDate.split('-').reverse().join('/')} a ${endDate.split('-').reverse().join('/')}
                </p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed;">
                <thead>
                    <tr style="background-color: #f8f9fa;">
                        <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 10%;">Data</th>
                        <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 15%;">Protocolo</th>
                        <th style="border: 1px solid #dee2e6; padding: 8px; text-align: left; width: 20%;">Atendente</th>
                        <th style="border: 1px solid #dee2e6; padding: 8px; text-align: center; width: 15%;">Status</th>
                        <th style="border: 1px solid #dee2e6; padding: 8px; text-align: left; width: 40%;">Observação</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Preenche as linhas da tabela dinamicamente
    dados.forEach(item => {
        let corStatus = '#333';
        if (item.status === 'Conforme') corStatus = '#28a745';
        else if (item.status === 'NC Leve') corStatus = '#856404'; 
        else if (item.status === 'NC Grave') corStatus = '#dc3545';

        htmlContent += `
            <tr>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;">${item.dataRegistro}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center;"><strong>${item.protocolo}</strong></td>
                <td style="border: 1px solid #dee2e6; padding: 8px;">${item.colaborador}</td>
                <td style="border: 1px solid #dee2e6; padding: 8px; text-align: center; font-weight: bold; color: ${corStatus};">${item.status}</td>
                <td class="obs-column" style="border: 1px solid #dee2e6; padding: 8px;">${item.obs}</td>
            </tr>
        `;
    });

    htmlContent += `
                </tbody>
            </table>
            <div style="margin-top: 30px; text-align: right; font-size: 10px; color: #999;">
                Relatório gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
            </div>
        </div>
    `;

    container.innerHTML = htmlContent;

    // Configuração do PDF otimizada para evitar cortes
    const configPDF = {
        margin:       [10, 10, 15, 10], // Margens: topo, direita, baixo, esquerda
        filename:     `Relatorio_${company.replace(/\s+/g, '')}_${startDate}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true }, // Força uma largura de renderização
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'], avoid: 'tr' } // Instrução rigorosa para não cortar <tr>
    };

    container.style.display = 'block'; 
    html2pdf().set(configPDF).from(container).save().then(() => {
        container.style.display = 'none';
        container.innerHTML = ''; 
    });
}