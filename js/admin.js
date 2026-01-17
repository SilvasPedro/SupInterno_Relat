/**
 * ============================================================================
 * ERP GESTÃO DE COLABORADORES - MÓDULO ADMINISTRATIVO (BACKEND FRONT-END)
 * Data: Janeiro/2026
 * Stack: Firebase Modular SDK (v9+)
 * ============================================================================
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
    getFirestore,
    collection,
    getDocs,
    doc,
    setDoc,
    getDoc,
    addDoc,
    deleteDoc,
    updateDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ============================================================
// 1. CONFIGURAÇÃO E INICIALIZAÇÃO
// ============================================================
const firebaseConfig = {
    apiKey: "AIzaSyCWve8E4PIwEeBf5nATJnFnlJkSe9YkbPE",
    authDomain: "suporte-interno-ece8c.firebaseapp.com",
    projectId: "suporte-interno-ece8c",
    storageBucket: "suporte-interno-ece8c.firebasestorage.app",
    messagingSenderId: "154422890108",
    appId: "1:154422890108:web:efe6f03bc4c55dc11483f9"
};

// App Principal (Sessão do Admin Logado)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// App Secundária (Utilizada APENAS para criar novos usuários sem deslogar o admin)
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

// --- ESTADO GLOBAL ---
let usersCache = {};        // Cache para evitar leituras repetidas de nomes de usuários
let isEditingMetric = false; // Flag para saber se o form está em modo de edição
let editingMetricId = null;  // ID do documento que está sendo editado

// ============================================================
// 2. MIDDLEWARE DE SEGURANÇA (GUARD)
// ============================================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            // Verifica se documento existe e se o cargo é admin
            if (docSnap.exists() && docSnap.data().cargo === 'admin') {
                document.getElementById('admin-name').innerText = "Gestor: " + (docSnap.data().nome || "Admin");
                loadDashboardData(); // <--- IMPORTANTE
                loadCollaborators();

                // Inicializa os módulos do dashboard
                console.log("Admin autenticado. Carregando módulos...");
                loadCollaborators();
                loadUserSelectOptions();   // Select do Form de Métricas
                loadOccurrenceUserSelect(); // Select do Form de Ocorrências

            } else {
                alert("ACESSO NEGADO: Área restrita a gestores.");
                await signOut(auth);
                window.location.href = "index.html";
            }
        } catch (error) {
            console.error("Erro crítico de autenticação:", error);
            alert("Erro de conexão com o servidor.");
        }
    } else {
        window.location.href = "index.html";
    }
});

// ============================================================
// 3. NAVEGAÇÃO E UTILITÁRIOS DE INTERFACE
// ============================================================
window.showSection = (sectionId) => {
    // 1. Esconde todas as seções
    document.querySelectorAll('.section').forEach(el => el.style.display = 'none');

    // 2. Remove estado ativo do menu
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));

    // 3. Mostra a seção alvo
    const target = document.getElementById('section-' + sectionId);
    if (target) target.style.display = 'block';

    // 4. Se sair da tela de lançamentos, reseta o form de edição por segurança
    if (sectionId !== 'lancamentos' && isEditingMetric) {
        resetMetricFormState();
    }
};

window.openModal = () => document.getElementById('modal-new-user').style.display = 'block';
window.closeModal = () => document.getElementById('modal-new-user').style.display = 'none';

// Helper para formatar data (YYYY-MM-DD -> DD/MM/YYYY)
const formatDateBr = (dateString) => {
    if (!dateString) return "-";
    return dateString.split('-').reverse().join('/');
};

window.logout = () => {
    if (confirm("Deseja realmente sair do sistema?")) {
        signOut(auth).then(() => window.location.href = "index.html");
    }
};

// ============================================================
// 4. MÓDULO: GESTÃO DE COLABORADORES
// ============================================================

// A. Carregar Lista na Tabela
async function loadCollaborators() {
    const listBody = document.getElementById('colaboradores-list');
    listBody.innerHTML = "<tr><td colspan='5'>Carregando dados...</td></tr>";

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        listBody.innerHTML = ""; // Limpa

        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            // Guarda no cache para uso global
            usersCache[docSnap.id] = user.nome;

            if (user.cargo !== 'admin') {
                const row = `
                    <tr>
                        <td>${user.nome}</td>
                        <td>${user.cargo}</td>
                        <td>${user.departamento || '-'}</td>
                        <td><span style="color: green; font-weight:bold;">Ativo</span></td>
                        <td>
                            <button onclick="openHistory('${docSnap.id}', '${user.nome}')" 
                                style="cursor:pointer; background:#17a2b8; color:white; border:none; padding:5px 10px; border-radius:4px;">
                                📂 Histórico
                            </button>
                        </td>
                    </tr>
                `;
                listBody.innerHTML += row;
            }
        });
    } catch (error) {
        console.error(error);
        listBody.innerHTML = "<tr><td colspan='5' style='color:red'>Erro ao carregar lista.</td></tr>";
    }
}

// B. Cadastrar Novo Colaborador
const formAddUser = document.getElementById('form-add-user');
if (formAddUser) {
    formAddUser.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nome = document.getElementById('new-name').value;
        const email = document.getElementById('new-email').value;
        const cargo = document.getElementById('new-cargo').value;
        const dept = document.getElementById('new-dept').value;
        const defaultPass = "mudar123";

        try {
            // Cria no Auth Secundário
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, defaultPass);
            const newUid = userCred.user.uid;

            // Cria no Firestore Principal
            await setDoc(doc(db, "users", newUid), {
                nome: nome,
                email: email,
                cargo: cargo,
                departamento: dept,
                primeiroAcesso: true,
                dataCadastro: new Date()
            });

            alert(`Colaborador ${nome} cadastrado com sucesso!`);
            closeModal();
            document.getElementById('form-add-user').reset();

            // Atualiza interfaces
            loadCollaborators();
            loadUserSelectOptions();
            loadOccurrenceUserSelect();

            signOut(secondaryAuth); // Limpa sessão secundária

        } catch (error) {
            console.error(error);
            if (error.code === 'auth/email-already-in-use') {
                alert("Erro: Este e-mail já está em uso.");
            } else {
                alert("Erro no cadastro: " + error.message);
            }
        }
    });
}

// ============================================================
// 5. MÓDULO: LANÇAMENTO DE MÉTRICAS (CRUD COMPLETO)
// ============================================================

// A. Preencher Select
async function loadUserSelectOptions() {
    const select = document.getElementById('metric-user-select');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';

    // Reutiliza cache se possível, senão busca
    if (Object.keys(usersCache).length > 0) {
        for (const [uid, nome] of Object.entries(usersCache)) {
            const option = document.createElement('option');
            option.value = uid;
            option.innerText = nome;
            select.appendChild(option);
        }
    } else {
        const q = await getDocs(collection(db, "users"));
        q.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.cargo !== 'admin') {
                usersCache[docSnap.id] = data.nome;
                const option = document.createElement('option');
                option.value = docSnap.id;
                option.innerText = data.nome;
                select.appendChild(option);
            }
        });
    }
}

// B. Submit do Formulário (Criação ou Edição)
const formMetrics = document.getElementById('form-metrics');
if (formMetrics) {
    formMetrics.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userId = document.getElementById('metric-user-select').value;
        const dateInput = document.getElementById('metric-date').value;

        if (!userId || !dateInput) {
            alert("Erro: Usuário e Data são obrigatórios.");
            return;
        }

        // Objeto de Dados
        const metricsData = {
            userId: userId,
            userName: usersCache[userId] || "Colaborador",
            weekStart: dateInput,
            createdAt: new Date(), // Em edição, isso poderia ser mantido original, mas atualizar é aceitável

            // Parsing numérico seguro
            atendimentosAbertos: Number(document.getElementById('at-abertos').value) || 0,
            atendimentosFinalizados: Number(document.getElementById('at-finalizados').value) || 0,
            ligacoesRealizadas: Number(document.getElementById('lig-realizadas').value) || 0,
            ligacoesRecebidas: Number(document.getElementById('lig-recebidas').value) || 0,
            ligacoesPerdidas: Number(document.getElementById('lig-perdidas').value) || 0,
            tmeTelefonia: Number(document.getElementById('tme-tel').value) || 0,
            tmaTelefonia: Number(document.getElementById('tma-tel').value) || 0,
            atendimentosHuggy: Number(document.getElementById('at-huggy').value) || 0,
            tmaHuggy: Number(document.getElementById('tma-huggy').value) || 0,
            notaMonitoria: Number(document.getElementById('nota-monitoria').value) || 0
        };

        try {
            if (isEditingMetric) {
                // --- MODO EDIÇÃO ---
                if (!editingMetricId) throw new Error("ID do documento perdido.");

                const docRef = doc(db, "weekly_metrics", editingMetricId);
                await updateDoc(docRef, metricsData);

                alert("Métricas atualizadas com sucesso!");
                resetMetricFormState(); // Volta ao estado normal

            } else {
                // --- MODO CRIAÇÃO ---
                // ID Composto: UID_Data (Evita duplicidade na mesma semana)
                const docId = `${userId}_${dateInput}`;
                await setDoc(doc(db, "weekly_metrics", docId), metricsData);

                alert("Métricas salvas com sucesso!");
                formMetrics.reset();
            }

        } catch (error) {
            console.error("Erro ao salvar métricas:", error);
            alert("Falha ao salvar: " + error.message);
        }
    });
}

// Helper: Resetar formulário após edição
function resetMetricFormState() {
    isEditingMetric = false;
    editingMetricId = null;

    // Reseta visual do botão
    const btn = document.querySelector('#form-metrics button[type="submit"]');
    btn.innerText = "Salvar Métricas da Semana";
    btn.style.backgroundColor = "#007bff";
    btn.style.color = "white";

    // Libera campos bloqueados
    document.getElementById('metric-user-select').disabled = false;
    document.getElementById('metric-date').disabled = false;

    document.getElementById('form-metrics').reset();
}

// ============================================================
// 6. MÓDULO: REGISTRO DE OCORRÊNCIAS
// ============================================================

async function loadOccurrenceUserSelect() {
    const select = document.getElementById('occur-user-select');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione...</option>';

    // Reutiliza cache
    for (const [uid, nome] of Object.entries(usersCache)) {
        const option = document.createElement('option');
        option.value = uid;
        option.innerText = nome;
        select.appendChild(option);
    }
}

const formOccur = document.getElementById('form-ocorrencias');
if (formOccur) {
    formOccur.addEventListener('submit', async (e) => {
        e.preventDefault();

        const uid = document.getElementById('occur-user-select').value;
        const date = document.getElementById('occur-date').value;
        const title = document.getElementById('occur-title').value;
        const desc = document.getElementById('occur-desc').value;

        // Check radio button
        const typeEl = document.querySelector('input[name="occur-type"]:checked');
        if (!typeEl) { alert("Selecione o tipo (Positiva/Negativa)"); return; }

        try {
            // Referência para novo documento com ID automático
            const newDocRef = doc(collection(db, "occurrences"));

            await setDoc(newDocRef, {
                userId: uid,
                userName: usersCache[uid] || "Colaborador",
                date: date,
                type: typeEl.value,
                title: title,
                description: desc,
                read: false,
                readAt: null,
                createdAt: new Date()
            });

            alert("Feedback registrado com sucesso!");
            formOccur.reset();

        } catch (error) {
            console.error("Erro ocorrência:", error);
            alert("Erro: " + error.message);
        }
    });
}

// ============================================================
// 7. MÓDULO: HISTÓRICO GERENCIAL (EDITAR E EXCLUIR)
// ============================================================

// A. Abrir Modal e Carregar Dados
window.openHistory = async (uid, nome) => {
    const modal = document.getElementById('modal-user-history');
    if (modal) modal.style.display = 'block';

    document.getElementById('history-user-name').innerText = "Histórico: " + nome;

    loadHistoryMetrics(uid);
    loadHistoryOccurrences(uid);
};

window.closeHistoryModal = () => {
    document.getElementById('modal-user-history').style.display = 'none';
};

// B. Renderizar Lista de Métricas
async function loadHistoryMetrics(uid) {
    const div = document.getElementById('history-metrics-list');
    div.innerHTML = "<p>Carregando...</p>";

    try {
        const q = query(collection(db, "weekly_metrics"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);

        let html = "";

        // Converter para array para ordenar (opcional, se não tiver index)
        let docs = [];
        querySnapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a, b) => new Date(b.weekStart) - new Date(a.weekStart));

        if (docs.length === 0) {
            div.innerHTML = "<p>Nenhuma métrica lançada.</p>";
            return;
        }

        docs.forEach((data) => {
            html += `
                <div class="history-item" style="border-left-color: #007bff;">
                    <div class="history-info">
                        <strong>Semana ${formatDateBr(data.weekStart)}</strong>
                        <small>Monitoria: ${data.notaMonitoria} | TMA: ${data.tmaTelefonia}</small>
                    </div>
                    <div class="history-actions">
                        <button class="btn-icon btn-edit" title="Editar" onclick="prepareEditMetric('${data.id}')">✏️</button>
                        <button class="btn-icon btn-delete" title="Excluir" onclick="deleteItem('weekly_metrics', '${data.id}', '${uid}')">🗑️</button>
                    </div>
                </div>`;
        });
        div.innerHTML = html;

    } catch (e) {
        console.error(e);
        div.innerHTML = "Erro ao carregar.";
    }
}

// C. Renderizar Lista de Ocorrências
async function loadHistoryOccurrences(uid) {
    const div = document.getElementById('history-occurrences-list');
    div.innerHTML = "<p>Carregando...</p>";

    try {
        const q = query(collection(db, "occurrences"), where("userId", "==", uid));
        const querySnapshot = await getDocs(q);

        let docs = [];
        querySnapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (docs.length === 0) {
            div.innerHTML = "<p>Nenhum feedback registrado.</p>";
            return;
        }

        let html = "";
        docs.forEach((data) => {
            const color = data.type === 'positive' ? '#28a745' : '#dc3545';
            html += `
                <div class="history-item" style="border-left-color: ${color};">
                    <div class="history-info">
                        <strong>${data.title}</strong>
                        <small>${formatDateBr(data.date)} - ${data.read ? 'Lido ✅' : 'Não lido'}</small>
                    </div>
                    <div class="history-actions">
                        <button class="btn-icon btn-delete" title="Excluir" onclick="deleteItem('occurrences', '${data.id}', '${uid}')">🗑️</button>
                    </div>
                </div>`;
        });
        div.innerHTML = html;

    } catch (e) {
        console.error(e);
        div.innerHTML = "Erro ao carregar.";
    }
}

// D. Função Genérica de Excluir
window.deleteItem = async (colName, docId, uid) => {
    if (!confirm("⚠️ ATENÇÃO: Deseja excluir este registro permanentemente?\nEssa ação não pode ser desfeita.")) return;

    try {
        await deleteDoc(doc(db, colName, docId));
        alert("Registro excluído com sucesso!");

        // Recarrega a lista correta
        if (colName === 'weekly_metrics') loadHistoryMetrics(uid);
        else loadHistoryOccurrences(uid);

    } catch (error) {
        console.error(error);
        alert("Erro ao excluir: " + error.message);
    }
};

// E. Preparar Edição de Métrica
window.prepareEditMetric = async (docId) => {
    try {
        // 1. Busca os dados atuais
        const docRef = doc(db, "weekly_metrics", docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            alert("Erro: Registro não encontrado no banco de dados.");
            return;
        }
        const data = docSnap.data();

        // 2. Fecha modal e navega para aba de lançamentos
        closeHistoryModal();
        showSection('lancamentos');

        // 3. Preenche o formulário
        document.getElementById('metric-user-select').value = data.userId;
        document.getElementById('metric-date').value = data.weekStart;

        document.getElementById('at-abertos').value = data.atendimentosAbertos;
        document.getElementById('at-finalizados').value = data.atendimentosFinalizados;
        document.getElementById('lig-realizadas').value = data.ligacoesRealizadas;
        document.getElementById('lig-recebidas').value = data.ligacoesRecebidas;
        document.getElementById('lig-perdidas').value = data.ligacoesPerdidas;
        document.getElementById('tme-tel').value = data.tmeTelefonia;
        document.getElementById('tma-tel').value = data.tmaTelefonia;
        document.getElementById('at-huggy').value = data.atendimentosHuggy;
        document.getElementById('tma-huggy').value = data.tmaHuggy;
        document.getElementById('nota-monitoria').value = data.notaMonitoria;

        // 4. Bloqueia campos-chave (Usuário e Data) para evitar inconsistências
        document.getElementById('metric-user-select').disabled = true;
        document.getElementById('metric-date').disabled = true;

        // 5. Altera visual do botão de salvar
        const btn = document.querySelector('#form-metrics button[type="submit"]');
        btn.innerText = "🔄 Atualizar Dados";
        btn.style.backgroundColor = "#ffc107"; // Amarelo
        btn.style.color = "#333";

        // 6. Atualiza Estado Global
        isEditingMetric = true;
        editingMetricId = docId;

        alert("✏️ Modo de Edição Ativado.\nFaça as alterações e clique em 'Atualizar Dados'.");

    } catch (error) {
        console.error(error);
        alert("Erro ao carregar dados para edição.");
    }
};

// ============================================================
// 8. DASHBOARD PRINCIPAL (KPIS E GRÁFICOS)
// ============================================================

// Variável para guardar dados brutos e não consultar banco toda hora ao trocar semana
let allMetricsCache = [];
let adminChart1 = null;
let adminChart2 = null;

// Função principal chamada ao logar (adicione a chamada no onAuthStateChanged!)
async function loadDashboardData() {
    console.log("Carregando Dashboard...");

    // 1. Busca TUDO se o cache estiver vazio
    if (allMetricsCache.length === 0) {
        try {
            const q = await getDocs(collection(db, "weekly_metrics"));
            q.forEach(doc => allMetricsCache.push(doc.data()));
        } catch (e) {
            console.error("Erro dashboard:", e);
            return;
        }
    }

    if (allMetricsCache.length === 0) {
        document.getElementById('kpi-volume').innerText = "Sem dados";
        return;
    }

    // 2. Popula o Select de Semanas (apenas datas únicas)
    const weekSelect = document.getElementById('dash-week-select');
    const uniqueWeeks = [...new Set(allMetricsCache.map(item => item.weekStart))];

    // Ordena datas (mais recente primeiro)
    uniqueWeeks.sort((a, b) => new Date(b) - new Date(a));

    // Se o select estiver vazio, preenche. Se já tiver, mantém (para não resetar seleção do usuário)
    if (weekSelect.options.length <= 1) {
        weekSelect.innerHTML = "";
        uniqueWeeks.forEach(date => {
            const opt = document.createElement('option');
            opt.value = date;
            opt.innerText = "Semana: " + date.split('-').reverse().join('/');
            weekSelect.appendChild(opt);
        });
    }

    // 3. Define qual semana processar (Selecionada ou a mais recente)
    const selectedWeek = weekSelect.value || uniqueWeeks[0];

    // 4. Filtra dados da semana
    const weekData = allMetricsCache.filter(d => d.weekStart === selectedWeek);

    processKPIs(weekData);
    renderAdminCharts(weekData);
}

function processKPIs(data) {
    if (data.length === 0) return;

    // --- KPI 1: TMA MÉDIO (Equipe) ---
    // Soma todos os TMAs ponderados ou média simples? Vamos de média simples dos TMAs lançados
    const totalTma = data.reduce((acc, curr) => acc + (curr.tmaTelefonia || 0), 0);
    const avgTma = (totalTma / data.length).toFixed(2);
    document.getElementById('kpi-tma-avg').innerText = avgTma + " min";

    // --- KPI 2: MELHOR MONITORIA ---
    // Ordena por nota descrescente
    const sortedByGrade = [...data].sort((a, b) => b.notaMonitoria - a.notaMonitoria);
    const best = sortedByGrade[0];
    document.getElementById('kpi-best-qa').innerText = best.notaMonitoria;
    document.getElementById('kpi-best-qa-name').innerText = best.userName;

    // --- KPI 3: MAIOR TMA (Pior caso) ---
    const sortedByTma = [...data].sort((a, b) => b.tmaTelefonia - a.tmaTelefonia);
    const worst = sortedByTma[0];
    document.getElementById('kpi-worst-tma').innerText = worst.tmaTelefonia + " min";
    document.getElementById('kpi-worst-tma-name').innerText = worst.userName;

    // --- KPI 4: VOLUME TOTAL ---
    const totalVol = data.reduce((acc, curr) => {
        return acc + (curr.atendimentosFinalizados || 0) + (curr.atendimentosHuggy || 0);
    }, 0);
    document.getElementById('kpi-volume').innerText = totalVol;
}

function renderAdminCharts(data) {
    const ctx1 = document.getElementById('adminChartMonitoria');
    const ctx2 = document.getElementById('adminChartVolume');

    // Prepara Arrays
    const labels = data.map(d => d.userName.split(' ')[0]); // Apenas primeiro nome
    const grades = data.map(d => d.notaMonitoria);

    // Gráfico 1: Barras de Qualidade
    if (adminChart1) adminChart1.destroy();
    adminChart1 = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nota Monitoria',
                data: grades,
                backgroundColor: '#28a745'
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } } }
    });

    // Gráfico 2: Pizza de Volume (Total Tel vs Total Huggy)
    const totalTel = data.reduce((acc, c) => acc + (c.atendimentosFinalizados || 0), 0);
    const totalHuggy = data.reduce((acc, c) => acc + (c.atendimentosHuggy || 0), 0);

    if (adminChart2) adminChart2.destroy();
    adminChart2 = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Telefonia', 'Huggy (Chat)'],
            datasets: [{
                data: [totalTel, totalHuggy],
                backgroundColor: ['#007bff', '#17a2b8']
            }]
        }
    });
}

// ============================================================
// 9. MODAL DE DETALHES (DRILL-DOWN)
// ============================================================
window.openDetailModal = (type) => {
    const modal = document.getElementById('modal-kpi-details');
    const title = document.getElementById('modal-kpi-title');
    const tbody = document.getElementById('modal-kpi-body');
    const headerVal = document.getElementById('modal-kpi-col-value');

    // Pega a semana selecionada no select
    const weekSelect = document.getElementById('dash-week-select');
    if (!weekSelect.value) return;

    const data = allMetricsCache.filter(d => d.weekStart === weekSelect.value);

    modal.style.display = 'block';
    tbody.innerHTML = "";

    let sortedData = [];

    if (type === 'monitoria') {
        title.innerText = "Ranking de Qualidade";
        headerVal.innerText = "Nota";
        sortedData = data.sort((a, b) => b.notaMonitoria - a.notaMonitoria);

        sortedData.forEach((d, index) => {
            tbody.innerHTML += `
                <tr>
                    <td>${index + 1}º ${d.userName}</td>
                    <td><strong>${d.notaMonitoria}</strong></td>
                </tr>`;
        });

    } else if (type === 'worst-tma' || type === 'tma') {
        title.innerText = "Detalhamento de TMA";
        headerVal.innerText = "Tempo (min)";
        sortedData = data.sort((a, b) => b.tmaTelefonia - a.tmaTelefonia); // Do maior para menor

        sortedData.forEach(d => {
            // Se for o pior, pinta de vermelho
            const style = (d === sortedData[0]) ? "color:red; font-weight:bold;" : "";
            tbody.innerHTML += `
                <tr>
                    <td>${d.userName}</td>
                    <td style="${style}">${d.tmaTelefonia}</td>
                </tr>`;
        });

    } else if (type === 'volume') {
        title.innerText = "Volume Individual";
        headerVal.innerText = "Total (Tel + Chat)";

        // Calcula total por pessoa e ordena
        sortedData = data.map(d => ({
            name: d.userName,
            vol: (d.atendimentosFinalizados || 0) + (d.atendimentosHuggy || 0)
        })).sort((a, b) => b.vol - a.vol);

        sortedData.forEach(d => {
            tbody.innerHTML += `
                <tr>
                    <td>${d.name}</td>
                    <td>${d.vol}</td>
                </tr>`;
        });
    }
};