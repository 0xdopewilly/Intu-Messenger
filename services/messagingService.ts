import { Message, Conversation, User } from '../types';
import { intuitionService } from './intuitionService';

const isLocal = window.location.hostname === 'localhost';
const BASE_URL = isLocal ? 'http://localhost:3001' : '';
const API_URL = `${BASE_URL}/api`;

let socket: any = null;

// Encryption Helpers
const encryptMessage = (text: string): string => `ENC[${btoa(text)}]`;
const decryptMessage = (encrypted: string): string => {
  if (encrypted && encrypted.startsWith('ENC[')) {
    try { return atob(encrypted.slice(4, -1)); } 
    catch { return 'Error decrypting'; }
  }
  return encrypted || '';
};

// --- LOCAL STORAGE HELPERS ---
const getLocalConversations = (): Conversation[] => {
  try {
    return JSON.parse(localStorage.getItem('intu_demo_conversations') || '[]');
  } catch { return []; }
};

const saveLocalConversations = (convos: Conversation[]) => {
  localStorage.setItem('intu_demo_conversations', JSON.stringify(convos));
};

const getLocalMessages = (convoId: string): Message[] => {
  try {
    return JSON.parse(localStorage.getItem(`intu_demo_msgs_${convoId}`) || '[]');
  } catch { return []; }
};

const saveLocalMessage = (convoId: string, msg: Message) => {
  const msgs = getLocalMessages(convoId);
  msgs.push(msg);
  localStorage.setItem(`intu_demo_msgs_${convoId}`, JSON.stringify(msgs));
  
  const convos = getLocalConversations();
  const c = convos.find(x => x.id === convoId);
  if (c) {
    c.lastMessage = msg;
    // Increment unread count if it's an incoming message
    if (msg.senderId !== 'me') {
        c.unreadCount = (c.unreadCount || 0) + 1;
    }
    saveLocalConversations(convos);
  }
};

export const messagingService = {
  connect: (userId: string) => {
    if (socket?.connected) return;
    try {
      const socketUrl = isLocal ? 'http://localhost:3001' : undefined;
      if ((window as any).io && localStorage.getItem('intu_jwt') !== 'demo-token') {
        socket = (window as any).io(socketUrl, {
          auth: { token: localStorage.getItem('intu_jwt') },
          query: { userId },
          reconnectionAttempts: 2 
        });
      }
    } catch (e) {
      console.warn("Socket connection skipped (Offline Mode)");
    }
  },

  disconnect: () => {
    if (socket) socket.disconnect();
  },

  getConversations: async (): Promise<Conversation[]> => {
    try {
      if (localStorage.getItem('intu_jwt') === 'demo-token') throw new Error("Offline");

      const res = await fetch(`${API_URL}/conversations`, { 
        headers: { 'Authorization': `Bearer ${localStorage.getItem('intu_jwt')}` } 
      });
      if (!res.ok) throw new Error('Failed to fetch chats');
      return await res.json();
    } catch (e) {
      let local = getLocalConversations();
      if (local.length === 0) {
        local = [
          {
            id: 'demo-convo-1',
            participants: ['me', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
            unreadCount: 1,
            isGroup: false,
            status: 'active',
            collateralLocked: 0,
            lastMessage: {
              id: 'm_init',
              senderId: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
              receiverId: 'me',
              content: encryptMessage('Welcome to the Intuition Trust Graph!'),
              timestamp: Date.now() - 100000,
              read: false,
              type: 'text'
            }
          }
        ];
        saveLocalConversations(local);
        saveLocalMessage('demo-convo-1', local[0].lastMessage!);
      }
      return local;
    }
  },

  // START CONVERSATION with TRUST GATING
  startConversation: async (recipientId: string): Promise<Conversation | null> => {
     try {
       // 1. Check existing
       let convos = getLocalConversations();
       let existing = convos.find(c => c.participants.includes(recipientId));
       if (existing) return existing;

       // 2. Perform Trust Check
       const gate = await intuitionService.checkGate('me', recipientId);
       
       // 3. Create Conversation object
       const newConvo: Conversation = {
          id: `c_local_${Date.now()}`,
          participants: ['me', recipientId],
          unreadCount: 0,
          isGroup: false,
          status: gate.allowed ? 'active' : 'request_pending',
          collateralLocked: gate.requiresCollateral ? gate.collateralAmount : 0,
          lastMessage: undefined
       };

       convos.push(newConvo);
       saveLocalConversations(convos);
       return newConvo;

    } catch (e) {
      console.error(e);
      return null;
    }
  },

  joinCommunity: async (community: User): Promise<Conversation | null> => {
     try {
         let convos = getLocalConversations();
         let existing = convos.find(c => c.participants.includes(community.id));
         if (existing) return existing;

         const newConvo: Conversation = {
            id: `c_group_${community.id}`,
            participants: ['me', community.id],
            unreadCount: 1, // Set to 1 so user sees the welcome message
            isGroup: true,
            status: 'active',
            collateralLocked: 0,
            lastMessage: {
                id: `msg_welcome_${Date.now()}`,
                senderId: community.id,
                receiverId: 'me',
                content: encryptMessage(`Welcome to the ${community.name} community channel.`),
                timestamp: Date.now(),
                read: false,
                type: 'text'
            }
         };
         convos.push(newConvo);
         saveLocalConversations(convos);
         
         // Save Welcome Message
         saveLocalMessage(newConvo.id, newConvo.lastMessage!);
         return newConvo;
     } catch(e) {
         console.error("Failed to join community", e);
         return null;
     }
  },

  leaveConversation: async (conversationId: string): Promise<boolean> => {
    try {
        let convos = getLocalConversations();
        const updated = convos.filter(c => c.id !== conversationId);
        saveLocalConversations(updated);
        // Optional: Clean up messages array from local storage to save space, 
        // but keeping it allows re-joining with history.
        return true;
    } catch (e) {
        return false;
    }
  },

  markAsRead: async (conversationId: string) => {
      let convos = getLocalConversations();
      const c = convos.find(x => x.id === conversationId);
      if (c && c.unreadCount > 0) {
          c.unreadCount = 0;
          saveLocalConversations(convos);
          return true;
      }
      return false;
  },

  getMessages: async (conversationId: string): Promise<Message[]> => {
      return getLocalMessages(conversationId);
  },

  sendMessage: async (toUserId: string, content: string): Promise<void> => {
    const encrypted = encryptMessage(content);
    
    // Find conversation ID
    const convos = getLocalConversations();
    const convo = convos.find(c => c.participants.includes(toUserId));
    const convoId = convo ? convo.id : `c_local_${Date.now()}`;

    const msg: Message = {
        id: `local_${Date.now()}`,
        senderId: 'me',
        receiverId: toUserId,
        content: encrypted,
        timestamp: Date.now(),
        read: false,
        type: 'text'
    };

    saveLocalMessage(convoId, msg);

    // Notify UI
    const listeners = (window as any).__msg_listeners || [];
    listeners.forEach((l: any) => l(msg));
  },

  // Actions for Requests
  acceptRequest: async (conversationId: string) => {
      const convos = getLocalConversations();
      const c = convos.find(x => x.id === conversationId);
      if (c) {
          c.status = 'active'; // Collateral released
          c.collateralLocked = 0;
          saveLocalConversations(convos);
          return c;
      }
      return null;
  },

  rejectRequest: async (conversationId: string) => {
      const convos = getLocalConversations();
      const c = convos.find(x => x.id === conversationId);
      if (c) {
          c.status = 'rejected'; // Collateral burned
          saveLocalConversations(convos);
          return c;
      }
      return null;
  },

  // --- DEBUG / SIMULATION HELPERS ---
  simulateIncomingMessage: (fromUserId: string, text: string) => {
     // Ensure conversation exists or create one
     const convos = getLocalConversations();
     let convo = convos.find(c => c.participants.includes(fromUserId));
     
     if (!convo) {
         // Create a request pending or active based on gate logic? 
         // For simulation, let's force a request to test that flow
         convo = {
            id: `c_sim_${Date.now()}`,
            participants: ['me', fromUserId],
            unreadCount: 0,
            isGroup: false,
            status: 'request_pending',
            collateralLocked: 50,
            lastMessage: undefined
         };
         convos.push(convo);
         saveLocalConversations(convos);
     }

     const msg: Message = {
         id: `sim_${Date.now()}`,
         senderId: fromUserId,
         receiverId: 'me',
         content: encryptMessage(text),
         timestamp: Date.now(),
         read: false,
         type: 'text'
     };
     
     saveLocalMessage(convo.id, msg);
     
     // Notify UI
     const listeners = (window as any).__msg_listeners || [];
     listeners.forEach((l: any) => l(msg));
     
     return convo;
  },

  onMessage: (callback: (msg: Message) => void) => {
    if (!(window as any).__msg_listeners) (window as any).__msg_listeners = [];
    (window as any).__msg_listeners.push(callback);
    return () => {
        const idx = (window as any).__msg_listeners.indexOf(callback);
        if (idx > -1) (window as any).__msg_listeners.splice(idx, 1);
    };
  },

  decrypt: decryptMessage,
  encrypt: encryptMessage
};