import localforage from 'localforage';

localforage.config({
  name: 'NovaLocalDB',
  storeName: 'messages'
});

const keysStore = localforage.createInstance({
  name: 'NovaKeysDB',
  storeName: 'keys'
});

export const LocalDB = {
  getChat: async (chatId: string) => {
    const data = await localforage.getItem(`chat_${chatId}`);
    return (data as any[]) || [];
  },
  
  saveMessage: async (chatId: string, message: any) => {
    const chats = await LocalDB.getChat(chatId);
    const index = chats.findIndex((m) => m.id === message.id);
    if (index > -1) {
      chats[index] = { ...chats[index], ...message }; 
    } else {
      chats.push(message); 
    }
    chats.sort((a, b) => {
      const tA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp || Date.now());
      const tB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp || Date.now());
      return tA - tB;
    });
    await localforage.setItem(`chat_${chatId}`, chats);
  },
  
  replaceChat: async (chatId: string, messages: any[]) => {
    messages.sort((a, b) => {
      const tA = a.timestamp?.seconds ? a.timestamp.seconds * 1000 : (a.timestamp || Date.now());
      const tB = b.timestamp?.seconds ? b.timestamp.seconds * 1000 : (b.timestamp || Date.now());
      return tA - tB;
    });
    await localforage.setItem(`chat_${chatId}`, messages);
  },

  deleteMessageLocal: async (chatId: string, messageId: string) => {
    const chats = await LocalDB.getChat(chatId);
    const updated = chats.filter((m) => m.id !== messageId);
    await localforage.setItem(`chat_${chatId}`, updated);
  },
  
  // Security Keys Storage
  savePrivateKey: async (uid: string, key: string) => {
    await keysStore.setItem(`priv_key_${uid}`, key);
  },
  getPrivateKey: async (uid: string) => {
    return await keysStore.getItem(`priv_key_${uid}`) as string | null;
  },
  
  exportFullBackup: async () => {
    const keys = await localforage.keys();
    const backupData: any = {};
    for (const key of keys) {
      if (key.startsWith('chat_')) {
        backupData[key] = await localforage.getItem(key);
      }
    }
    return backupData;
  },

  importFullBackup: async (backupData: any) => {
    for (const key of Object.keys(backupData)) {
      if (key.startsWith('chat_')) {
         await localforage.setItem(key, backupData[key]);
      }
    }
  }
};
