import localforage from 'localforage';

localforage.config({
  name: 'NovaLocalDB',
  storeName: 'messages'
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
      // Handle firebase timestamp objects or local timestamps
      // If timestamp is null (Pending server write), assume current time
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
