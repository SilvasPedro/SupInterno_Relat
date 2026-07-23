import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, setDoc, updateDoc, collection, addDoc } from "firebase/firestore"
import { db, auth, firebaseConfig } from "./firebase";

// Instância para criar a conta sem deslogar o Admin
const adminApp = initializeApp(firebaseConfig, "AdminWorker");
const adminAuth = getAuth(adminApp);

export const registerCollaborator = async (name, email, password, role, shift) => {
  try {
    // 1. Cria a conta no Auth usando a instância Worker
    const userCredential = await createUserWithEmailAndPassword(adminAuth, email, password);
    const newUser = userCredential.user;

    // 2. Desloga IMEDIATAMENTE a instância Worker 
    // Isso garante que ela não interfira em nada
    await signOut(adminAuth);

    // 3. Grava no Firestore usando a instância 'db' PRINCIPAL (onde você é o Admin)
    // Como você está logado na app principal, você tem permissão de Admin
    await setDoc(doc(db, "collaborators", newUser.uid), {
      uid: newUser.uid,
      name,
      email,
      role,
      shift,
      status: "Ativo",
      createdAt: new Date().toISOString()
    });

    return { success: true, uid: newUser.uid };
  } catch (error) {
    // Tratamento de erro amigável
    if (error.code === 'auth/email-already-in-use') {
      throw new Error("Este e-mail já está cadastrado no sistema.");
    }
    throw error;
  }
};

// Função para atualizar os dados de perfil de um colaborador existente
export const updateCollaboratorProfile = async (uid, updatedData) => {
  const colabRef = doc(db, "collaborators", uid);
  await updateDoc(colabRef, updatedData);
};

// --- FUNÇÃO DE REGISTRAR FEEDBACK ---
export const registerFeedback = async (collaboratorId, feedbackData) => {
  // Pega o e-mail do Admin que está logado no momento
  const adminEmail = auth.currentUser?.email || "Admin Desconhecido";

  // Prepara o pacote de dados
  const payload = {
    collaboratorId,
    type: feedbackData.type,
    method: feedbackData.method,
    protocol: feedbackData.protocol || "N/A", // Se vazio, salva como N/A
    comment: feedbackData.comment,
    createdBy: adminEmail, // A mágica da auditoria acontece aqui!
    createdAt: new Date().toISOString()
  };

  // Salva em uma coleção separada chamada 'feedbacks'
  await addDoc(collection(db, "feedbacks"), payload);
};