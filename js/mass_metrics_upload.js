import { collection, getDocs, addDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./config/firebase_config.js";

// Armazena a lista de usuários para fazer a correspondência pelo nome
let userDictionary = [];
// Armazena os dados processados do CSV temporariamente
let parsedCSVData = [];

// Alternar entre aba individual e em massa
window.toggleLaunchMode = (mode) => {
    const tabInd = document.getElementById('tab-individual');
    const tabMass = document.getElementById('tab-massa');
    const contInd = document.getElementById('container-lancamento-individual');
    const contMass = document.getElementById('container-lancamento-massa');

    if (mode === 'individual') {
        tabInd.style.background = 'white';
        tabInd.style.color = 'var(--color-dark-brown)';
        tabInd.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
        tabMass.style.background = 'transparent';
        tabMass.style.color = '#888';
        tabMass.style.boxShadow = 'none';

        contInd.style.display = 'block';
        contMass.style.display = 'none';
    } else {
        tabMass.style.background = 'white';
        tabMass.style.color = 'var(--color-dark-brown)';
        tabMass.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
        tabInd.style.background = 'transparent';
        tabInd.style.color = '#888';
        tabInd.style.boxShadow = 'none';

        contInd.style.display = 'none';
        contMass.style.display = 'block';
        
        // Carrega o dicionário de usuários ao abrir a aba pela primeira vez
        if (userDictionary.length === 0) loadUserDictionary();
    }
};

// Busca todos os usuários no Firestore para fazer o pareamento
async function loadUserDictionary() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        userDictionary = [];
        usersSnap.forEach(u => {
            const data = u.data();
            userDictionary.push({ id: u.id, nome: data.nome.trim() });
        });
    } catch (e) {
        console.error("Erro ao carregar dicionário de usuários:", e);
        window.showNotification("Erro ao carregar lista de usuários.", "error");
    }
}

// Lógica de Leitura e Parse do CSV
window.processCSV = () => {
    const fileInput = document.getElementById('csv-file-input');
    const file = fileInput.files[0];

    if (!file) {
        window.showNotification("Por favor, selecione um arquivo CSV.", "warning");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        parseCSVText(text);
    };
    reader.readAsText(file);
};

// Helper para converter tempo "HH:MM:SS" ou "MM:SS" para decimal (minutos ou segundos)
function timeToDecimal(timeStr, convertTo = 'minutes') {
    if (!timeStr) return 0;
    // Se já for um número (caso alguém digite 8.5 direto no CSV), retorna ele mesmo
    if (!timeStr.includes(':')) return parseFloat(timeStr) || 0;
    
    const parts = timeStr.split(':').map(Number);
    let seconds = 0;
    
    if (parts.length === 3) { // Formato HH:MM:SS
        seconds = (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    } else if (parts.length === 2) { // Formato MM:SS
        seconds = (parts[0] * 60) + parts[1];
    }
    
    // Retorna minutos em decimal (ex: 8.5) ou os segundos totais
    return convertTo === 'minutes' ? +(seconds / 60).toFixed(2) : seconds;
}

function parseCSVText(csvText) {
    // Divide por quebra de linha (Windows ou Linux)
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== "");
    
    if (lines.length <= 1) {
        window.showNotification("O CSV parece estar vazio ou só tem cabeçalho.", "warning");
        return;
    }

    parsedCSVData = [];
    
    for (let i = 1; i < lines.length; i++) {
        // Separa por vírgula e remove aspas extras se o Excel tiver colocado
        const cols = lines[i].split(',').map(col => col.replace(/['"]+/g, '').trim());
        
        // Estrutura do SEU arquivo: 
        // 0:Nome, 1:Semana, 2:Turno, 3:LigRec, 4:LigPerd, 5:TmaTel, 6:TmeTel, 7:AtendHuggy, 8:TmaHuggy, 9:AtendFin, 10:NotaMon
        if (cols.length >= 10) {
            const nomeCSV = cols[0];
            const matchedUser = userDictionary.find(u => u.nome.toLowerCase() === nomeCSV.toLowerCase());
            
            parsedCSVData.push({
                rowId: i,
                userId: matchedUser ? matchedUser.id : null,
                userName: nomeCSV,
                userFound: !!matchedUser,
                weekStart: cols[1],
                // Ignoramos o cols[2] que é o Turno
                ligRecebidas: cols[3],
                ligPerdidas: cols[4],
                tmaTelefonia: timeToDecimal(cols[5], 'minutes'), // Converte "00:08:11" para decimal
                tmeTelefonia: timeToDecimal(cols[6], 'seconds'), // TME costuma ser lido em segundos totais
                atendimentosHuggy: cols[7],
                tmaHuggy: timeToDecimal(cols[8], 'minutes'),
                atendimentosFinalizados: cols[9],
                notaMonitoria: cols[10] || 0 // Se vier em branco (como na 1ª linha do seu print), salva como 0
            });
        }
    }

    renderCSVPreview();
}
// Renderiza a tabela para edição/correção
function renderCSVPreview() {
    const tbody = document.getElementById('csv-preview-body');
    tbody.innerHTML = '';

    parsedCSVData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Status do usuário (encontrado ou não)
        let userStatusHtml = row.userFound 
            ? `<strong>${row.userName}</strong><br><span style="color:#28a745; font-size:11px;">✅ ID Vinculado</span>` 
            : `<strong>${row.userName}</strong><br><span class="user-match-error">❌ Usuário não localizado</span>`;

        tr.innerHTML = `
            <td style="line-height: 1.2;">${userStatusHtml}</td>
            <td><input type="date" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'weekStart', this.value)" value="${row.weekStart}"></td>
            <td><input type="number" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'ligRecebidas', this.value)" value="${row.ligRecebidas}"></td>
            <td><input type="number" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'ligPerdidas', this.value)" value="${row.ligPerdidas}"></td>
            <td><input type="number" step="0.01" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'tmaTelefonia', this.value)" value="${row.tmaTelefonia}"></td>
            <td><input type="number" step="0.01" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'tmeTelefonia', this.value)" value="${row.tmeTelefonia}"></td>
            <td><input type="number" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'atendimentosHuggy', this.value)" value="${row.atendimentosHuggy}"></td>
            <td><input type="number" step="0.01" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'tmaHuggy', this.value)" value="${row.tmaHuggy}"></td>
            <td><input type="number" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'atendimentosFinalizados', this.value)" value="${row.atendimentosFinalizados}" style="font-weight:bold;"></td>
            <td><input type="number" step="0.1" class="csv-input-cell" onchange="updateRowData(${row.rowId}, 'notaMonitoria', this.value)" value="${row.notaMonitoria}" style="color:#28a745; font-weight:bold;"></td>
            <td style="text-align: center;">
                <button onclick="window.removeCSVRow(${row.rowId})" title="Remover Linha" style="background: none; border: none; color: #dc3545; cursor: pointer;">
                    <i class="material-icons">delete</i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('csv-row-count').innerText = `${parsedCSVData.length} registros`;
    document.getElementById('csv-preview-section').style.display = 'block';
}

// Atualiza o array de dados se o usuário alterar algo nos inputs da tabela
window.updateRowData = (rowId, field, value) => {
    const row = parsedCSVData.find(r => r.rowId === rowId);
    if (row) {
        row[field] = value;
    }
};

window.removeCSVRow = (rowId) => {
    parsedCSVData = parsedCSVData.filter(r => r.rowId !== rowId);
    renderCSVPreview();
};

// Envia tudo para o Firebase
window.saveMassMetrics = async () => {
    if (parsedCSVData.length === 0) {
        window.showNotification("Não há dados para salvar.", "warning");
        return;
    }

    // Validação: Verificar se há usuários não encontrados
    const unmappedUsers = parsedCSVData.filter(r => !r.userFound);
    if (unmappedUsers.length > 0) {
        if(!confirm(`Existem ${unmappedUsers.length} registros com nomes que não foram encontrados no sistema (marcados com ❌). Eles não serão salvos. Deseja continuar e salvar os corretos?`)) {
            return;
        }
    }

    // Filtrar apenas os que têm um ID de usuário válido
    const validRows = parsedCSVData.filter(r => r.userFound);
    
    if (validRows.length === 0) {
        window.showNotification("Nenhum registro válido para salvar.", "error");
        return;
    }

    const btn = document.querySelector('#csv-preview-section .btn-primary');
    btn.innerHTML = '⏳ Salvando...';
    btn.disabled = true;

    try {
        let savedCount = 0;
        // Loop salvando um a um (Pode ser otimizado com batched writes do firebase, mas um loop simples resolve para pequenas equipes)
        for (const row of validRows) {
            const dataToSave = {
                userId: row.userId,
                weekStart: row.weekStart,
                ligacoesRecebidas: parseInt(row.ligRecebidas) || 0,
                ligacoesPerdidas: parseInt(row.ligPerdidas) || 0,
                tmaTelefonia: parseFloat(row.tmaTelefonia) || 0,
                tmeTelefonia: parseFloat(row.tmeTelefonia) || 0,
                atendimentosHuggy: parseInt(row.atendimentosHuggy) || 0,
                tmaHuggy: parseFloat(row.tmaHuggy) || 0,
                atendimentosFinalizados: parseInt(row.atendimentosFinalizados) || 0,
                notaMonitoria: parseFloat(row.notaMonitoria) || 0,
                createdAt: new Date().toISOString()
            };

            await addDoc(collection(db, "weekly_metrics"), dataToSave);
            savedCount++;
        }

        window.showNotification(`${savedCount} registros lançados com sucesso!`, "success");
        
        // Limpar a interface após sucesso
        document.getElementById('csv-file-input').value = '';
        document.getElementById('csv-preview-section').style.display = 'none';
        parsedCSVData = [];
        
    } catch (error) {
        console.error("Erro no envio em massa: ", error);
        window.showNotification("Ocorreu um erro ao salvar alguns dados.", "error");
    } finally {
        btn.innerHTML = '🚀 Lançar Métricas em Massa';
        btn.disabled = false;
    }
};