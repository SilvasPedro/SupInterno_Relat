import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { 
    getFirestore, collection, getDocs, doc, setDoc, updateDoc, query, where 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { 
    getAuth, createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

import { auth, db } from "./config/firebase_config.js"; 

// Cache global para evitar erros de aspas no HTML
window.usersCache = {};

// ============================================================
// 1. CARREGAR GRID DE COLABORADORES
// ============================================================
export async function loadCollaboratorsHub() {
    const grid = document.getElementById('colaboradores-grid');
    if (!grid) return;

    grid.innerHTML = "<p style='padding:20px; color:#666;'>Carregando colaboradores...</p>";

    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        let usersList = [];
        window.usersCache = {}; // Limpa cache

        querySnapshot.forEach((docSnap) => {
            const user = docSnap.data();
            window.usersCache[docSnap.id] = { id: docSnap.id, ...user };

            if (user.cargo !== 'admin' && user.email !== 'admin@hubdesk.com') {
                usersList.push(window.usersCache[docSnap.id]);
            }
        });

        usersList.sort((a, b) => a.nome.localeCompare(b.nome));

        grid.innerHTML = "";
        
        if (usersList.length === 0) {
            grid.innerHTML = "<p>Nenhum colaborador cadastrado.</p>";
            return;
        }

        usersList.forEach((user) => {
            const initials = user.nome ? user.nome.charAt(0).toUpperCase() : '?';
            const avatarHtml = user.photoUrl 
                ? `<img src="${user.photoUrl}" style="width:70px; height:70px; border-radius:50%; object-fit:cover; border:3px solid var(--color-cream); margin: 0 auto 10px; display:block;">`
                : `<div class="collab-avatar">${initials}</div>`;

            grid.innerHTML += `
                <div class="collab-card">
                    <button class="btn-edit-card" onclick="window.openEditCollaborator('${user.id}')" title="Editar ${user.nome}">
                        <i class="material-icons" style="font-size: 16px;">edit</i>
                    </button>

                    <div class="collab-header">
                        ${avatarHtml}
                        <div class="collab-name">${user.nome}</div>
                        <div class="collab-role">${user.cargo || 'Sem Cargo'}</div>
                    </div>
                    <div class="collab-body">
                        <span class="collab-dept">${user.departamento || 'Geral'}</span> | 
                        <span style="font-size:11px; color:#666;">${user.turno || 'Turno N/A'}</span>
                        <div class="collab-status">
                            <i class="material-icons" style="font-size:14px;">check_circle</i> Ativo
                        </div>
                    </div>
                    
                    <div class="collab-footer" style="display: flex; flex-direction: column; gap: 8px;">
                        <button class="btn-view-analysis" onclick="window.openCollaboratorAnalytics('${user.id}', '${user.nome}')">
                            VER ANÁLISE COMPLETA
                        </button>
                        <button class="btn-view-analysis" style="background: var(--color-taupe); color: white; border-color: var(--color-taupe);" onclick="window.openExtractReportModal('${user.id}', '${user.nome}')">
                            <i class="material-icons" style="font-size: 14px; vertical-align: middle;">picture_as_pdf</i> EXTRAIR RELATÓRIO
                        </button>
                    </div>
                </div>
            `;
        });

    } catch (e) {
        console.error("Erro ao carregar Hub:", e);
        grid.innerHTML = "<p>Erro ao carregar lista.</p>";
    }
}

// ============================================================
// 2. CONTROLE DO MODAL DE COLABORADOR (ABRIR/FECHAR)
// ============================================================

window.openNewCollaboratorModal = () => {
    const modal = document.getElementById('modal-novo-colaborador');
    if(!modal) return alert("Erro: Modal não encontrado no HTML");
    
    modal.style.display = 'block';
    document.getElementById('form-colaborador').reset();
    document.getElementById('edit-user-id').value = ""; 
    document.getElementById('modal-colaborador-title').innerText = "Novo Colaborador";
    
    document.getElementById('group-colab-password').style.display = 'block';
    document.getElementById('colab-senha').required = true;
    document.getElementById('colab-email').disabled = false;
};

window.openEditCollaborator = (userId) => {
    const user = window.usersCache[userId];
    if (!user) return alert("Erro: Usuário não encontrado no cache.");

    const modal = document.getElementById('modal-novo-colaborador');
    if(!modal) return alert("Erro: Modal não encontrado");

    modal.style.display = 'block';
    document.getElementById('modal-colaborador-title').innerText = "Editar Colaborador";
    document.getElementById('edit-user-id').value = user.id;

    document.getElementById('colab-nome').value = user.nome || "";
    document.getElementById('colab-email').value = user.email || "";
    document.getElementById('colab-cargo').value = user.cargo || "";
    document.getElementById('colab-depto').value = user.departamento || "";
    document.getElementById('colab-turno').value = user.turno || "";

    document.getElementById('group-colab-password').style.display = 'none';
    document.getElementById('colab-senha').required = false;
    document.getElementById('colab-email').disabled = true;
};

window.closeCollabModal = () => {
    document.getElementById('modal-novo-colaborador').style.display = 'none';
};

window.handleSaveCollaborator = async () => {
    const btn = document.getElementById('btn-save-colab');
    const originalText = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    const id = document.getElementById('edit-user-id').value;
    const nome = document.getElementById('colab-nome').value;
    const email = document.getElementById('colab-email').value;
    const cargo = document.getElementById('colab-cargo').value;
    const departamento = document.getElementById('colab-depto').value;
    const turno = document.getElementById('colab-turno').value;
    const senha = document.getElementById('colab-senha').value;

    try {
        if (id) {
            const userRef = doc(db, "users", id);
            await updateDoc(userRef, { nome, cargo, departamento, turno });
            alert("Dados atualizados com sucesso!");
        } else {
            if (senha.length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres.");
            
            const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
            const newUserId = userCredential.user.uid;

            await setDoc(doc(db, "users", newUserId), {
                nome, email, cargo, departamento, turno,
                createdAt: new Date().toISOString(), photoUrl: ""
            });
            alert("Colaborador cadastrado com sucesso!");
        }

        window.closeCollabModal();
        loadCollaboratorsHub();

    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro: " + error.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// ============================================================
// 3. EXTRAÇÃO DE RELATÓRIO
// ============================================================

window.openExtractReportModal = (userId, userName) => {
    document.getElementById('report-user-id').value = userId;
    document.getElementById('report-user-name').value = userName;
    
    // Sugere do dia 1 do mês atual até a data de hoje
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
    const today = date.toISOString().split('T')[0];
    
    document.getElementById('report-date-start').value = firstDay;
    document.getElementById('report-date-end').value = today;
    
    document.getElementById('modal-extract-report').style.display = 'block';
};

window.generateCollaboratorReport = async (e) => {
    e.preventDefault();
    
    const btn = document.querySelector('#form-extract-report button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = "Gerando Aguarde...";
    btn.disabled = true;

    const userId = document.getElementById('report-user-id').value;
    const userName = document.getElementById('report-user-name').value;
    const startDate = document.getElementById('report-date-start').value;
    const endDate = document.getElementById('report-date-end').value;

    try {
        // 1. Buscar Métricas do Usuário
        const qMetrics = query(collection(db, "weekly_metrics"), where("userId", "==", userId));
        const snapMetrics = await getDocs(qMetrics);
        const metrics = [];
        snapMetrics.forEach(d => {
            const data = d.data();
            if(data.weekStart >= startDate && data.weekStart <= endDate) {
                metrics.push(data);
            }
        });

        // 2. Buscar Ocorrências do Usuário
        const qOccur = query(collection(db, "occurrences"), where("userId", "==", userId));
        const snapOccur = await getDocs(qOccur);
        const occurrences = [];
        snapOccur.forEach(d => {
            const data = d.data();
            if(data.date >= startDate && data.date <= endDate) {
                occurrences.push(data);
            }
        });

        // 3. Montar a Janela de Impressão
        const printWindow = window.open('', '_blank');
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Relatório de Feedback - ${userName}</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
                    .header { text-align: center; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; margin-bottom: 30px; }
                    .header h1 { margin: 0; color: #1a1a1a; }
                    .header p { margin: 5px 0; color: #666; font-size: 14px; }
                    h3 { color: #444; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 40px; }
                    
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background-color: #f8f9fa; font-weight: bold; font-size: 13px; text-transform: uppercase; }
                    td { font-size: 14px; }
                    
                    .occur-box { border-left: 5px solid #ccc; padding: 15px; margin-bottom: 15px; background: #fdfdfd; border-radius: 4px; border: 1px solid #eee; border-left-width: 5px;}
                    .positive { border-left-color: #28a745; }
                    .negative { border-left-color: #dc3545; }
                    .neutral { border-left-color: #ffc107; }
                    
                    .footer-signatures { display: flex; justify-content: space-around; margin-top: 80px; text-align: center; }
                    .sign-line { border-top: 1px solid #000; width: 300px; padding-top: 10px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Documento de Avaliação de Desempenho</h1>
                    <p><strong>Colaborador(a):</strong> ${userName}</p>
                    <p><strong>Período Analisado:</strong> ${startDate.split('-').reverse().join('/')} até ${endDate.split('-').reverse().join('/')}</p>
                    <p><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                </div>
                
                <h3>1. Métricas de Desempenho Consolidadas</h3>
                ${metrics.length === 0 ? '<p style="color: #666; font-style: italic;">Nenhuma métrica registrada neste período.</p>' : `
                <table>
                    <thead>
                        <tr>
                            <th>Semana de Ref.</th>
                            <th>Nota Monitoria (QA)</th>
                            <th>TMA Telefonia (Min)</th>
                            <th>TMA Chat (Min)</th>
                            <th>Atendimentos Resolvidos</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${metrics.sort((a,b) => a.weekStart.localeCompare(b.weekStart)).map(m => `
                            <tr>
                                <td>${m.weekStart.split('-').reverse().join('/')}</td>
                                <td><strong>${m.notaMonitoria || '-'}</strong></td>
                                <td>${m.tmaTelefonia || '-'}</td>
                                <td>${m.tmaHuggy || '-'}</td>
                                <td>${m.atendimentosFinalizados || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}

                <h3>2. Registros de Fatos, Ocorrências e Observações</h3>
                ${occurrences.length === 0 ? '<p style="color: #666; font-style: italic;">Nenhum registro de feedback lançado neste período.</p>' : 
                    occurrences.sort((a,b) => a.date.localeCompare(b.date)).map(o => `
                        <div class="occur-box ${o.type}">
                            <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
                                <strong>Data:</strong> ${o.date.split('-').reverse().join('/')} &nbsp;|&nbsp; 
                                <strong>Origem:</strong> ${o.origin || 'Sistema'} &nbsp;|&nbsp; 
                                <strong>Protocolo:</strong> ${o.protocol || 'N/A'}
                            </div>
                            <h4 style="margin: 0 0 10px 0; color: #333;">${o.title}</h4>
                            <p style="margin: 0; white-space: pre-line; color: #555;">${o.description}</p>
                        </div>
                    `).join('')
                }

                <div class="footer-signatures">
                    <div>
                        <div class="sign-line">Assinatura do Colaborador</div>
                    </div>
                    <div>
                        <div class="sign-line">Assinatura da Liderança</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
        
        // Timeout garante que o HTML será desenhado antes de engatilhar a janela de impressão
        setTimeout(() => {
            printWindow.print();
        }, 800);

        document.getElementById('modal-extract-report').style.display = 'none';

    } catch (error) {
        console.error(error);
        alert("Erro ao extrair relatório: " + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};