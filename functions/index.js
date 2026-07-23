const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Automação 1: Quando um novo Feedback for criado
exports.notifyNewFeedback = functions.firestore
    .document('feedbacks/{docId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        const colabId = data.colabId || data.collaboratorId;

        if (!colabId) return null;

        // Puxa os dados do colaborador para pegar o Token dele
        const colabDoc = await admin.firestore().collection('collaborators').doc(colabId).get();
        if (!colabDoc.exists) return null;

        const colabData = colabDoc.data();
        if (!colabData.fcmToken) {
            console.log(`Sem token de notificação para o colaborador: ${colabId}`);
            return null;
        }

        const message = {
            notification: {
                title: 'Você tem um Novo Feedback! 💬',
                body: `Foi registrado um feedback do tipo: ${data.type}. Abra o Hubdesk para ler.`
            },
            token: colabData.fcmToken
        };

        // Dispara a notificação
        return admin.messaging().send(message);
    });


// Automação 2: Quando uma nova Auditoria for criada
exports.notifyNewAudit = functions.firestore
    .document('qa_audits/{docId}')
    .onCreate(async (snap, context) => {
        const data = snap.data();
        const colabId = data.colabId;

        if (!colabId) return null;

        // Puxa os dados do colaborador
        const colabDoc = await admin.firestore().collection('collaborators').doc(colabId).get();
        if (!colabDoc.exists) return null;

        const colabData = colabDoc.data();
        if (!colabData.fcmToken) {
            console.log(`Sem token de notificação para o colaborador: ${colabId}`);
            return null;
        }

        const message = {
            notification: {
                title: 'Nova Auditoria de Qualidade (QA) 🛡️',
                body: `Uma avaliação do protocolo ${data.protocol || ''} foi lançada com status: ${data.status}.`
            },
            token: colabData.fcmToken
        };

        // Dispara a notificação
        return admin.messaging().send(message);
    });