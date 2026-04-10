"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db, rtdb, storage } from "@/lib/firebase-client";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { 
  collection, 
  addDoc, 
  query, 
  where,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
  deleteDoc
} from "firebase/firestore";
import { ref as dbRef, onValue, set, onDisconnect, serverTimestamp as rtdbServerTimestamp } from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Search, 
  UserPlus, 
  MessageSquare, 
  Video, 
  Tv, 
  LogOut, 
  Settings,
  MoreVertical,
  Send,
  Paperclip,
  Phone,
  Loader2,
  Trash2,
  Edit2,
  ZoomIn,
  ZoomOut,
  Download,
  X,
  Check,
  CheckCheck,
  ArchiveRestore,
  ShieldCheck,
  Lock
} from "lucide-react";
import { toast } from "sonner";
import { CryptoUtils } from "@/lib/crypto-utils";
import { LocalDB } from "@/lib/indexed-db";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Encrypted child component that decrypts and shows files safely per-message
const EncryptedMedia = ({ msg, sharedKey, onOpenLightbox }: { msg: any, sharedKey: CryptoKey, onOpenLightbox?: (url: string, name: string) => void }) => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  
  useEffect(() => {
    let objectUrl = '';
    const loadAndDecrypt = async () => {
      try {
        const proxyUrl = `/api/proxy-media?url=${encodeURIComponent(msg.parsedContent?.url || "")}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error("Failed to download encrypted file block");
        
        const encryptedBuffer = await res.arrayBuffer();
        const ivBuffer = CryptoUtils.base64ToArrayBuffer(msg.parsedContent?.binaryIv || "");
        
        const decryptedBuffer = await CryptoUtils.decryptBinary(sharedKey, encryptedBuffer, new Uint8Array(ivBuffer));
        const blob = new Blob([decryptedBuffer], { type: msg.parsedContent?.mimeType });
        objectUrl = URL.createObjectURL(blob);
        setMediaUrl(objectUrl);
      } catch (err) {
        console.error("Local decryption failed:", err);
        setError(true);
      }
    };
    loadAndDecrypt();
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [msg, sharedKey]);

  if (error) return <div className="text-red-400 text-[10px] text-center border border-red-500/20 bg-red-500/10 p-2 rounded-xl">⚠️ Decryption Blocked</div>;
  if (!mediaUrl) return <div className="h-32 w-32 md:h-48 md:w-48 flex items-center justify-center animate-pulse bg-[#0a0a0c] rounded-xl border border-slate-800/50"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>;

  if (msg.parsedContent?.type === 'image') {
    return (
      <img 
        onClick={() => onOpenLightbox?.(mediaUrl, msg.parsedContent?.fileName || "image")} 
        src={mediaUrl} 
        alt="Encrypted image" 
        className="max-w-full max-h-[300px] rounded-2xl object-contain cursor-zoom-in shadow-2xl hover:opacity-90 transition-opacity" 
      />
    );
  }
  
  return (
    <a href={mediaUrl} download={msg.parsedContent?.fileName} className="flex items-center gap-2 p-3 bg-black/40 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors">
       <Paperclip className="w-5 h-5 text-indigo-400" />
       <div className="flex flex-col overflow-hidden">
         <span className="text-xs truncate max-w-[150px] font-medium">{msg.parsedContent?.fileName}</span>
         <span className="text-[10px] text-slate-500">Secure File</span>
       </div>
    </a>
  );
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const router = useRouter();

  const [friends, setFriends] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  
  // Chat States
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Advanced Features State
  const [friendIsTyping, setFriendIsTyping] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Interactive UI State
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, fileName: string, scale: number} | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendPresence, setFriendPresence] = useState<{state: string, last_changed: number} | null>(null);
  const [friendActiveChat, setFriendActiveChat] = useState<string | null>(null);
  
  // Security Vault States
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultSaving, setVaultSaving] = useState(false);
  
  // Global Decryption & Presence Caches
  const sharedKeysCache = useRef<Record<string, CryptoKey>>({});
  const [sidebarPreviews, setSidebarPreviews] = useState<Record<string, { last: any, unread: number }>>({});
  const [friendsPresence, setFriendsPresence] = useState<Record<string, any>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  const chatId = user && selectedFriend ? [user.uid, selectedFriend.uid].sort().join('-') : null;

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        if (!selectedFriend) setSidebarOpen(true);
      } else {
        setSidebarOpen(true);
      }
    };
    
    // Initial check
    handleResize();
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedFriend]);

  useEffect(() => {
    if (window.innerWidth < 768 && selectedFriend) {
      setSidebarOpen(false);
    }
  }, [selectedFriend]);

  // Handle RTDB Typing Indication sync
  useEffect(() => {
    if (!chatId || !selectedFriend) {
      setFriendIsTyping(false);
      return;
    }
    const friendTypingRef = dbRef(rtdb, `typing/${chatId}/${selectedFriend.uid}`);
    const unsubscribe = onValue(friendTypingRef, (snapshot) => {
      setFriendIsTyping(!!snapshot.val());
    });
    return () => unsubscribe();
  }, [chatId, selectedFriend]);

  // Friend Presence & Active Chat Monitoring
  useEffect(() => {
    if (!selectedFriend) return;
    
    const statusRef = dbRef(rtdb, `status/${selectedFriend.uid}`);
    const activeChatRef = dbRef(rtdb, `activeChat/${selectedFriend.uid}`);

    const unsubStatus = onValue(statusRef, snap => setFriendPresence(snap.val()));
    const unsubActive = onValue(activeChatRef, snap => setFriendActiveChat(snap.val()));

    return () => {
      unsubStatus();
      unsubActive();
    };
  }, [selectedFriend]);

  // Self Presence Setup (Online, Offline, Active Chat)
  useEffect(() => {
    if (!user) return;
    
    // Set Active Chat
    const activeChatRef = dbRef(rtdb, `activeChat/${user.uid}`);
    if (selectedFriend) {
      set(activeChatRef, selectedFriend.uid);
    } else {
      set(activeChatRef, null);
    }

    // Set Online Status
    const userStatusRef = dbRef(rtdb, `status/${user.uid}`);
    const isOfflineForDatabase = { state: 'offline', last_changed: rtdbServerTimestamp() };
    const isOnlineForDatabase = { state: 'online', last_changed: rtdbServerTimestamp() };

    const connectedRef = dbRef(rtdb, '.info/connected');
    const unsub = onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        onDisconnect(userStatusRef).set(isOfflineForDatabase);
        onDisconnect(activeChatRef).set(null);
        set(userStatusRef, isOnlineForDatabase);
      }
    });

    return () => unsub();
  }, [user, selectedFriend]);

  // Global Friends Presence
  useEffect(() => {
    if (friends.length === 0) return;
    const unsubscribers = friends.map(f => {
       const ref = dbRef(rtdb, `status/${f.uid}`);
       return onValue(ref, snap => {
          setFriendsPresence(prev => ({ ...prev, [f.uid]: snap.val() }));
       });
    });
    return () => unsubscribers.forEach(u => u());
  }, [friends]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        loadSocialData(u);
      } else {
        router.push("/login");
      }
    });
    return () => unsubscribe();
  }, [router]);

  // Check if Vault exists
  useEffect(() => {
    if (!user) return;
    const checkVault = async () => {
       try {
         const token = await user.getIdToken();
         const res = await fetch("/api/vault", { headers: { "Authorization": `Bearer ${token}` }});
         const data = await res.json();
         setVaultExists(!!data.exists);
       } catch(e) { console.error("Vault check failed"); }
    };
    checkVault();
  }, [user]);

  useEffect(() => {
    if (!chatId) return;
    let isMounted = true;
    
    const fetchChat = async () => {
      const chats = await LocalDB.getChat(chatId);
      if (isMounted) {
         setMessages([...chats]);
         setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };
    fetchChat();

    const handleUpdate = (e: any) => {
       if (e.detail === chatId) fetchChat();
    };
    window.addEventListener('localdb_updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('localdb_updated', handleUpdate);
    };
  }, [chatId]);

  useEffect(() => {
     if (!selectedFriend || messages.length === 0 || !user) return;
     const unread = messages.filter(m => m.from !== user.uid && m.status !== 'read');
     unread.forEach(m => {
        updateDoc(doc(db, "messages", m.id), { status: 'read' }).catch(()=>null);
     });
  }, [selectedFriend, messages, user]);

  // Real-time Global Message Listener
  useEffect(() => {
    if (!user || friends.length === 0) {
      setSidebarPreviews({});
      return;
    }
    
    const loadPreviews = async () => {
      const previews: Record<string, { last: any, unread: number }> = {};
      for (const f of friends) {
         const cid = [user.uid, f.uid].sort().join('-');
         const chats = await LocalDB.getChat(cid);
         if (chats.length > 0) {
            const unread = chats.filter(m => m.from === f.uid && m.status !== 'read').length;
            previews[f.uid] = { last: chats[chats.length - 1], unread };
         }
      }
      setSidebarPreviews(previews);
    };
    loadPreviews();

    const q = query(collection(db, "messages"), where("participants", "array-contains", user.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      let activeChatUpdatedId: string | null = null;
      let uiUpdatedPreviews = false;

      // Server Cost Cleanup
      const docsByChat: Record<string, any[]> = {};
      snapshot.docs.forEach(d => {
         const part = d.data().participants;
         if (!part) return;
         const fid = part.find((p: string) => p !== user.uid);
         if (!fid) return;
         const cID = [user.uid, fid].sort().join("-");
         if (!docsByChat[cID]) docsByChat[cID] = [];
         docsByChat[cID].push({ id: d.id, ...d.data() });
      });

      Object.values(docsByChat).forEach(chatDocs => {
         if (chatDocs.length > 90) {
            const sortedOldest = chatDocs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            const toDeleteCount = chatDocs.length - 90;
            for (let i = 0; i < toDeleteCount; i++) {
               if (sortedOldest[i].from === user.uid) deleteDoc(doc(db, "messages", sortedOldest[i].id)).catch(()=>null);
            }
         }
      });

      for (const change of snapshot.docChanges()) {
        const mBase = { id: change.doc.id, ...change.doc.data() } as any;
        const friendUid = mBase.participants?.find((p: string) => p !== user.uid);
        if (!friendUid) continue;
        
        const cid = [user.uid, friendUid].sort().join("-");

        if (change.type === 'removed') {
          await LocalDB.deleteMessageLocal(cid, mBase.id);
          activeChatUpdatedId = cid;
          continue;
        }

        try {
          let key = sharedKeysCache.current[friendUid];
          if (!key) {
             const f = friends.find(fr => fr.uid === friendUid);
             if (f) {
                const pkStr = localStorage.getItem("nova_private_key");
                if (pkStr) {
                  const privKeyObj = await CryptoUtils.importPrivateKey(pkStr);
                  const pubKeyObj = await CryptoUtils.importPublicKey(f.publicKey);
                  key = await CryptoUtils.deriveSharedKey(privKeyObj, pubKeyObj);
                  sharedKeysCache.current[friendUid] = key;
                }
             }
          }
          if (!key) continue;

          const encryptedBuffer = CryptoUtils.base64ToArrayBuffer(mBase.ciphertext);
          const ivBuffer = CryptoUtils.base64ToArrayBuffer(mBase.iv);
          const decryptedStr = await CryptoUtils.decryptMessage(key, encryptedBuffer, new Uint8Array(ivBuffer));
          mBase.parsedContent = JSON.parse(decryptedStr);
          
          await LocalDB.saveMessage(cid, mBase);
          activeChatUpdatedId = cid;
          uiUpdatedPreviews = true;
        } catch (err: any) {
          // console.error("BG Decrypt Failed", err);
          mBase.parsedContent = { type: 'text', text: `[Decryption Error] ${err.message || err.toString()}` };
          await LocalDB.saveMessage(cid, mBase);
          activeChatUpdatedId = cid;
          uiUpdatedPreviews = true;
        }
      }

      if (uiUpdatedPreviews) {
          // Re-evaluate previews safely outside the strict mapping
          setSidebarPreviews(prev => {
             const copy = { ...prev };
             // Defer evaluation to a parallel loader (avoids race conditions)
             setTimeout(async () => {
                for (const f of friends) {
                   const cx = [user.uid, f.uid].sort().join('-');
                   const chats = await LocalDB.getChat(cx);
                   if (chats.length > 0) {
                      const unR = chats.filter(x => x.from === f.uid && x.status !== 'read').length;
                      setSidebarPreviews(p => ({ ...p, [f.uid]: { last: chats[chats.length - 1], unread: unR }}));
                   }
                }
             }, 50);
             return copy;
          });
      }

      if (activeChatUpdatedId) {
         window.dispatchEvent(new CustomEvent('localdb_updated', { detail: activeChatUpdatedId }));
      }
    });

    return () => unsubscribe();
  }, [user, friends]);

  const loadSocialData = async (u: any) => {
    try {
      const idToken = await u.getIdToken();
      const reqRes = await fetch("/api/friends/list?type=incoming", {
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      const reqData = await reqRes.json();
      setIncomingRequests(reqData.requests || []);

      const friendRes = await fetch("/api/friends/list?type=friends", {
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      const friendData = await friendRes.json();
      setFriends(friendData.friends || []);
    } catch (err) {
      console.error("Data load error", err);
    }
  };

  const handleSearch = async (val: string) => {
    setSearchQuery(val);
    if (val.length < 3) {
      setSearchResults([]);
      return;
    }
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(val)}`, {
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      const data = await res.json();
      setSearchResults(data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFriend = async (targetUid: string) => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}` 
        },
        body: JSON.stringify({ targetUid })
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Request sent!");
        setSearchQuery("");
        setSearchResults([]);
      }
    } catch (err) {
      toast.error("Failed to send request");
    }
  };

  const handleRespondent = async (requestId: string, action: "accept" | "decline") => {
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/friends/respond", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}` 
        },
        body: JSON.stringify({ requestId, action })
      });
      const data = await res.json();
      if (data.success) {
        toast.success(action === "accept" ? "Friend added!" : "Declined");
        loadSocialData(user);
      }
    } catch (err) {
      toast.error("Action failed");
    }
  };

  const handleSelectFriend = async (friend: any) => {
    if (!friend.publicKey) {
      toast.error("Friend lacks E2EE keys.");
      return;
    }
    try {
      const myPrivKeyBase64 = localStorage.getItem("nova_private_key");
      if (!myPrivKeyBase64) throw new Error("Key missing");
      const myPrivKey = await CryptoUtils.importPrivateKey(myPrivKeyBase64);
      const theirPubKey = await CryptoUtils.importPublicKey(friend.publicKey);
      const derived = await CryptoUtils.deriveSharedKey(myPrivKey, theirPubKey);
      setSharedKey(derived);
      setSelectedFriend(friend);
    } catch (err) {
      toast.error("Secure connection failed");
    }
  };

  const sendMessage = async () => {
    if ((!messageInput.trim() && !uploading) || !selectedFriend || !sharedKey || !user || uploading) return;
    const text = messageInput;
    setMessageInput("");
    
    if (chatId) set(dbRef(rtdb, `typing/${chatId}/${user.uid}`), false);

    try {
      const payload = JSON.stringify({ type: 'text', text });
      const { ciphertext, iv } = await CryptoUtils.encryptMessage(sharedKey, payload);
      
      if (editingMessageId) {
        // Editing an existing message
        const docRef = doc(db, "messages", editingMessageId);
        await updateDoc(docRef, {
          ciphertext: CryptoUtils.arrayBufferToBase64(ciphertext),
          iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
          edited: true,
          editedAt: serverTimestamp(),
        });
        setEditingMessageId(null);
        toast.success("Message edited securely");
      } else {
        // Sending a new message
        await addDoc(collection(db, "messages"), {
          from: user.uid,
          to: selectedFriend.uid,
          participants: [user.uid, selectedFriend.uid],
          ciphertext: CryptoUtils.arrayBufferToBase64(ciphertext),
          iv: CryptoUtils.arrayBufferToBase64(iv.buffer as ArrayBuffer),
          timestamp: serverTimestamp(),
          status: 'sent',
        });
      }
    } catch (err: any) {
      console.error("Modify error: ", err);
      toast.error(err.message || "Action failed");
      setEditingMessageId(null);
    }
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Delete this message for everyone?")) return;
    try {
      await updateDoc(doc(db, "messages", msgId), {
        deleted: true,
        deletedAt: serverTimestamp()
      });
      toast.success("Deleted");
    } catch (err: any) {
      console.error("Delete error: ", err);
      toast.error(err.message || "Failed to delete");
    }
  };

  const startEdit = (msg: any) => {
    if (msg.parsedContent?.type !== 'text') return;
    setMessageInput(msg.parsedContent.text);
    setEditingMessageId(msg.id);
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessageInput(e.target.value);
    if (!chatId || !user) return;
    
    // Set true
    if (!isTyping) {
        setIsTyping(true);
        set(dbRef(rtdb, `typing/${chatId}/${user.uid}`), true);
    }
    
    // Debounce false
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        set(dbRef(rtdb, `typing/${chatId}/${user.uid}`), false);
    }, 1500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !selectedFriend || !sharedKey || !chatId) return;
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    setUploading(true);
    toast.info("1/4: Reading file...");
    try {
      const buffer = await file.arrayBuffer();
      
      toast.info("2/4: Encrypting file locally...");
      const { ciphertext, iv: binaryIv } = await CryptoUtils.encryptBinary(sharedKey, buffer);
      const encryptedBlob = new Blob([ciphertext]);
      const fileId = Date.now().toString() + '-' + Math.round(Math.random() * 1000);
      const sRef = storageRef(storage, `media/${fileId}`);
      
      toast.info("3/4: Uploading secure blob to Cloud...");
      await uploadBytes(sRef, encryptedBlob);
      
      toast.info("Getting download URL...");
      const url = await getDownloadURL(sRef);
      
      toast.info("4/4: Syncing message database...");
      const payload = JSON.stringify({
        type: file.type.startsWith('image/') ? 'image' : 'file',
        url,
        fileName: file.name,
        mimeType: file.type,
        binaryIv: CryptoUtils.arrayBufferToBase64(binaryIv.buffer as ArrayBuffer)
      });
      
      const { ciphertext: msgCiphertext, iv: msgIv } = await CryptoUtils.encryptMessage(sharedKey, payload);
      await addDoc(collection(db, "messages"), {
        from: user.uid,
        to: selectedFriend.uid,
        participants: [user.uid, selectedFriend.uid],
        ciphertext: CryptoUtils.arrayBufferToBase64(msgCiphertext),
        iv: CryptoUtils.arrayBufferToBase64(msgIv.buffer as ArrayBuffer),
        timestamp: serverTimestamp(),
        status: 'sent'
      });
      toast.success("Securely added!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Upload securely failed");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-slate-200 overflow-hidden font-sans relative w-full">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Responsive */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-[85%] max-w-[320px] md:w-80 border-r border-slate-800/50 bg-[#0f0f12] flex flex-col z-30 transition-transform duration-300 md:relative md:translate-x-0 shadow-2xl md:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 flex items-center justify-between border-b border-slate-800/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center rotate-6 shadow-lg shadow-indigo-500/20">
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Nova</h1>
          </div>
          <div className="flex items-center gap-1 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
              <LogOut className="w-5 h-5 rotate-180" />
            </Button>
          </div>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
          {/* Notifications / Requests */}
          {incomingRequests.length > 0 && (
            <div className="space-y-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
              <p className="text-[10px] uppercase tracking-widest text-indigo-400 font-bold px-2">Requests</p>
              {incomingRequests.map((req) => (
                 <div key={req.id} className="flex items-center justify-between gap-2 p-1">
                    <div className="flex items-center gap-2 overflow-hidden">
                       <Avatar className="w-8 h-8 border border-indigo-500/30">
                         <AvatarImage src={req.photoURL} />
                         <AvatarFallback>{req.name[0]}</AvatarFallback>
                       </Avatar>
                       <span className="text-xs font-medium truncate">{req.name}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                       <Button size="icon" variant="ghost" className="h-7 w-7 text-green-500 hover:bg-green-500/20" onClick={() => handleRespondent(req.id, "accept")}>
                         <UserPlus className="w-3.5 h-3.5" />
                       </Button>
                       <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-500/20" onClick={() => handleRespondent(req.id, "decline")}>
                         <LogOut className="w-3.5 h-3.5 rotate-180" />
                       </Button>
                    </div>
                 </div>
              ))}
            </div>
          )}

          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <Input 
              placeholder="Search people..." 
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-10 bg-black/40 border-slate-800 focus:border-indigo-500/50 rounded-xl"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2">Global</p>
              {searchResults.map((u) => (
                <div key={u.uid} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Avatar className="w-9 h-9 border border-slate-800"><AvatarImage src={u.photoURL} /><AvatarFallback>{u.displayName[0]}</AvatarFallback></Avatar>
                    <div className="flex flex-col"><span className="text-xs font-medium">{u.displayName}</span></div>
                  </div>
                  <Button size="icon" variant="ghost" className="text-indigo-400" onClick={() => handleAddFriend(u.uid)}><UserPlus className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2 space-y-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2 mb-2">Messages</p>
            {friends.length > 0 ? (
                friends.map((f) => {
                  const previewData = sidebarPreviews[f.uid];
                  const lastMsg = previewData?.last;
                  const unreadCount = previewData?.unread || 0;
                  const presence = friendsPresence[f.uid];
                  const isOnline = presence?.state === 'online';

                  return (
                  <div 
                    key={f.uid} 
                    onClick={() => handleSelectFriend(f)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border border-transparent",
                      selectedFriend?.uid === f.uid ? "bg-indigo-500/10 border-indigo-500/30" : "hover:bg-slate-800/40"
                    )}
                  >
                    <div className="relative">
                      <Avatar className="w-11 h-11 border border-slate-800">
                        <AvatarImage src={f.photoURL} />
                        <AvatarFallback>{f.displayName[0]}</AvatarFallback>
                      </Avatar>
                      <div className={cn("absolute bottom-0 right-0 w-3 h-3 border-2 border-[#0f0f12] rounded-full", isOnline ? "bg-green-500" : "bg-slate-500")}></div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="flex justify-between items-center mb-0.5">
                         <span className="text-xs font-bold truncate">{f.displayName}</span>
                         <span className={cn("text-[9px]", unreadCount > 0 ? "text-emerald-500 font-bold" : "text-slate-500")}>
                           {lastMsg?.timestamp ? new Date(lastMsg.timestamp.seconds ? lastMsg.timestamp.seconds * 1000 : lastMsg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
                         </span>
                      </div>
                      <div className="flex justify-between items-center gap-2">
                        <p className={cn("text-[11px] truncate flex-1", unreadCount > 0 ? "text-white font-bold" : "text-slate-500")}>
                          {lastMsg ? (lastMsg.parsedContent?.type === 'image' ? '📷 Photo' : lastMsg.parsedContent?.text) : "Start chatting"}
                        </p>
                        {unreadCount > 0 && (
                          <div className="min-w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center px-1 text-[9px] font-bold text-black shadow-[0_0_8px_rgba(16,185,129,0.4)]">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  );
                })
            ) : (
              <div className="text-center py-10 opacity-30 italic text-xs">Search to add friends</div>
            )}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/50 flex justify-between items-center bg-[#0a0a0c]">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10 border border-slate-700">
              <AvatarImage src={user?.photoURL} />
              <AvatarFallback className="bg-indigo-600 font-bold">{user?.displayName?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-semibold truncate max-w-[120px]">{user?.displayName}</span>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> {friends.length} Secure Contacts</span>
            </div>
          </div>
          
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-400" onClick={() => auth.signOut()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col bg-[#050507] relative">
        {selectedFriend ? (
          <>
            {/* Chat Header */}
            <header className="h-16 border-b border-slate-800/50 bg-[#0f0f12]/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 z-10">
              <div className="flex items-center gap-2 md:gap-4">
                <Button variant="ghost" size="icon" className="md:hidden text-slate-400" onClick={() => setSidebarOpen(true)}>
                  <MoreVertical className="w-5 h-5 rotate-90" />
                </Button>
                <Avatar className="w-8 h-8 md:w-9 md:h-9 border border-indigo-500/20">
                  <AvatarImage src={selectedFriend.photoURL} />
                  <AvatarFallback>{selectedFriend.displayName[0]}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <h2 className="text-xs md:text-sm font-bold truncate max-w-[120px] md:max-w-none">{selectedFriend.displayName}</h2>
                  <div className="flex items-center gap-1.5 min-h-[14px]">
                    {friendIsTyping ? (
                      <span className="text-[10px] text-emerald-400 font-bold animate-pulse">typing...</span>
                    ) : friendActiveChat === user?.uid ? (
                      <span className="text-[10px] text-indigo-400 font-medium">in chat now</span>
                    ) : friendPresence?.state === 'online' ? (
                      <span className="text-[10px] text-emerald-400 font-medium">online</span>
                    ) : friendPresence?.last_changed ? (
                      <span className="text-[10px] text-slate-400">last seen at {new Date(friendPresence.last_changed).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    ) : (
                      <span className="text-[10px] text-slate-500">offline</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 md:gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><Phone className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 md:flex hidden"><Video className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => setSelectedFriend(null)}>
                  <LogOut className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
              <div className="flex flex-col items-center justify-center py-8">
                <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] text-indigo-400 font-medium">
                  Messages are end-to-end encrypted
                </div>
              </div>

              {messages.map((msg) => {
                const isImage = msg.parsedContent?.type === 'image';
                const isDeleted = msg.deleted;
                const isMine = msg.from === user.uid;

                return (
                  <div 
                    key={msg.id}
                    className={cn(
                      "flex w-full mb-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
                      isMine ? "justify-end" : "justify-start"
                    )}
                  >
                    {isDeleted ? (
                      <div className="bg-[#16161c] border border-slate-800 border-dashed rounded-2xl p-3 md:px-4 md:py-2 text-xs text-slate-500 italic flex items-center gap-2">
                        🚫 This message was deleted
                      </div>
                    ) : (
                      <div className="relative group flex items-center">
                        {/* Action Menu (Left side for sender) */}
                        {isMine && !isDeleted && (
                          <div className="absolute right-full mr-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 backdrop-blur-md rounded-full shadow-lg border border-slate-700/50 px-2 py-1 flex items-center gap-1 z-10">
                            {msg.parsedContent?.type === 'text' && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-indigo-400" onClick={() => startEdit(msg)}>
                                <Edit2 className="w-3 h-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-400" onClick={() => deleteMessage(msg.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}

                        <div 
                          className={cn(
                            "max-w-[100%] w-fit rounded-2xl text-[13px] md:text-sm shadow-xl break-words whitespace-pre-wrap flex flex-col gap-1 relative",
                            isImage ? "bg-transparent p-0 shadow-none" : "p-3 md:px-4 md:py-3",
                            !isImage && isMine ? (
                              msg.status === 'read' ? "bg-indigo-600 text-white rounded-br-none transition-colors duration-500 ease-in-out" : "bg-emerald-600 text-white rounded-br-none transition-colors duration-500 ease-in-out"
                            ) : "",
                            !isImage && !isMine ? "bg-[#16161c] text-slate-200 border border-slate-800/50 rounded-bl-none" : ""
                          )}
                        >
                          {msg.parsedContent?.type === 'text' ? (
                            <p className="leading-relaxed">{msg.parsedContent.text}</p>
                          ) : (
                            sharedKey && <EncryptedMedia msg={msg} sharedKey={sharedKey} onOpenLightbox={(url, name) => setLightboxMedia({ url, fileName: name, scale: 1 })} />
                          )}
                          <div className={cn(
                            "flex items-center gap-1 mt-1 font-medium", 
                            isMine ? "justify-end" : "justify-start",
                            isImage && isMine ? "absolute -bottom-5 right-2 text-white/70 drop-shadow-md text-[10px]" : "text-[10px] opacity-70",
                            isImage && !isMine ? "absolute -bottom-5 left-2 text-white/70 drop-shadow-md text-[10px]" : ""
                          )}>
                            {msg.edited && <span className="italic mr-1">(edited)</span>}
                            <span>
                              {msg.timestamp 
                                ? (msg.timestamp.seconds ? new Date(msg.timestamp.seconds * 1000) : new Date(msg.timestamp)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                                : "Sending..."}
                            </span>
                            
                            {/* WhatsApp Style Ticks */}
                            {isMine && (
                              <span className="ml-1">
                                {msg.status === 'read' ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-blue-400 inline" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck className="w-3.5 h-3.5 inline text-slate-300" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 inline text-slate-300" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {friendIsTyping && (
                <div className="flex w-full mb-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-[#16161c] border border-slate-800/50 p-4 rounded-2xl rounded-bl-none shadow-xl flex items-center gap-1.5 w-fit">
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-[#0f0f12]/80 backdrop-blur-md border-t border-slate-800/50">
               <div className="max-w-4xl mx-auto flex items-center gap-3">
                 {/* Hidden File Input */}
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   onChange={handleFileUpload} 
                   className="hidden" 
                   accept="image/*,application/pdf,.doc,.docx"
                 />
                 
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="text-slate-500 hover:text-indigo-400"
                   onClick={() => fileInputRef.current?.click()}
                   disabled={uploading}
                 >
                   {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                 </Button>
                 
                 <div className="flex-1 relative">
                    <Input 
                      value={messageInput}
                      onChange={handleTyping}
                      onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                      placeholder={
                        editingMessageId 
                          ? "Editing message..." 
                          : uploading 
                            ? "Locking & Uploading file..." 
                            : `Message ${selectedFriend.displayName}...`
                      }
                      disabled={uploading}
                      className="bg-black/50 border-slate-800 focus:border-indigo-500/50 rounded-2xl h-11 pr-12 text-sm"
                    />
                    {editingMessageId && (
                      <Button
                        variant="ghost" 
                        size="icon"
                        onClick={() => { setEditingMessageId(null); setMessageInput(""); }}
                        className="absolute right-10 top-1 h-9 w-9 text-slate-400 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                    <Button 
                      size="icon" 
                      onClick={sendMessage}
                      disabled={!messageInput.trim() || uploading}
                      className="absolute right-1 top-1 h-9 w-9 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                 </div>
               </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-6">
            <Button variant="outline" className="md:hidden absolute top-4 left-4 border-slate-800 text-slate-400" onClick={() => setSidebarOpen(true)}>
              Show Friends
            </Button>
            <div className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-2xl md:rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 rotate-12 animate-pulse">
               <Video className="w-10 h-10 md:w-12 md:h-12 text-white" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-bold tracking-tight">Select a Chat</h3>
              <p className="text-slate-500 max-w-xs mt-2 text-xs md:text-sm leading-relaxed">
                Connect with friends securely. Conversations are end-to-end encrypted.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
               <div className="p-2 md:p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center gap-1 md:gap-2">
                  <MessageSquare className="w-3 h-3 md:w-4 md:h-4 text-indigo-400" />
                  <span className="text-[8px] md:text-[10px] text-slate-500 uppercase font-bold">Chat</span>
               </div>
               <div className="p-2 md:p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center gap-1 md:gap-2">
                  <Video className="w-3 h-3 md:w-4 md:h-4 text-indigo-400" />
                  <span className="text-[8px] md:text-[10px] text-slate-500 uppercase font-bold">Call</span>
               </div>
               <div className="p-2 md:p-3 bg-slate-900 border border-slate-800 rounded-xl flex flex-col items-center gap-1 md:gap-2">
                  <Tv className="w-3 h-3 md:w-4 md:h-4 text-indigo-400" />
                  <span className="text-[8px] md:text-[10px] text-slate-500 uppercase font-bold">Watch</span>
               </div>
            </div>
          </div>
        )}
      </main>

      {/* Lightbox Overlay */}
      {lightboxMedia && (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-200">
          {/* Top Actions */}
          <div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
            <span className="text-sm font-medium text-slate-300 truncate max-w-[200px] md:max-w-md">
              {lightboxMedia.fileName}
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setLightboxMedia(prev => prev ? {...prev, scale: prev.scale + 0.25} : null)}>
                <ZoomIn className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setLightboxMedia(prev => prev ? {...prev, scale: Math.max(0.5, prev.scale - 0.25)} : null)}>
                <ZoomOut className="w-5 h-5" />
              </Button>
              <a href={lightboxMedia.url} download={lightboxMedia.fileName}>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
                  <Download className="w-5 h-5" />
                </Button>
              </a>
              <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-400/10 ml-4" onClick={() => setLightboxMedia(null)}>
                <X className="w-6 h-6" />
              </Button>
            </div>
          </div>
          
          {/* Main Image */}
          <div className="flex-1 w-full flex items-center justify-center overflow-auto p-4 custom-scrollbar">
            <img 
              src={lightboxMedia.url} 
              alt="Expanded media" 
              className="max-w-none transition-transform duration-200 ease-out shadow-2xl" 
              style={{ transform: `scale(${lightboxMedia.scale})` }}
              onDoubleClick={() => setLightboxMedia(prev => prev ? {...prev, scale: prev.scale === 1 ? 2 : 1} : null)}
            />
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f0f13] border border-slate-700 w-full max-w-sm p-6 rounded-3xl relative shadow-2xl">
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-slate-400 hover:text-white" onClick={() => setSettingsOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-400"/> Settings</h2>
            
            <div className="space-y-4">
              <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-indigo-400"/> 
                   Cloud Security Vault
                </h3>
                <p className="text-[10px] text-slate-400 mb-3">
                   Sync your encryption keys across devices. This allows you to read your chats on other browsers/domain.
                </p>
                
                <div className="space-y-2">
                   <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
                      <Input 
                        type="password"
                        placeholder="Create Vault Password"
                        className="h-9 pl-9 text-xs bg-black/40 border-slate-800"
                        value={vaultPassword}
                        onChange={(e) => setVaultPassword(e.target.value)}
                      />
                   </div>
                   <Button 
                     className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-9 text-xs font-bold"
                     disabled={!vaultPassword || vaultSaving}
                     onClick={async () => {
                        setVaultSaving(true);
                        try {
                           const privKey = localStorage.getItem("nova_private_key");
                           if (!privKey) throw new Error("Local key missing");
                           
                           const encrypted = await CryptoUtils.encryptWithPassword(privKey, vaultPassword);
                           const token = await user.getIdToken();
                           
                           const res = await fetch("/api/vault", {
                              method: "POST",
                              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                              body: JSON.stringify(encrypted)
                           });
                           
                           if (res.ok) {
                              toast.success("Security Vault Synced!");
                              setVaultExists(true);
                              setVaultPassword("");
                           } else { throw new Error("Sync failed"); }
                        } catch(err: any) {
                           toast.error(err.message || "Failed to sync vault");
                        } finally {
                           setVaultSaving(false);
                        }
                     }}
                   >
                      {vaultSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (vaultExists ? "Update Security Vault" : "Setup Security Vault")}
                   </Button>
                   
                   {vaultExists && (
                     <div className="pt-2 border-t border-slate-800/50 mt-2 space-y-2">
                        <p className="text-[9px] text-center text-emerald-400 font-medium">Backup exists in Cloud</p>
                        <Button 
                          variant="ghost" 
                          className="w-full h-8 text-[10px] text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg"
                          disabled={!vaultPassword || vaultSaving}
                          onClick={async () => {
                             setVaultSaving(true);
                             try {
                                const token = await user.getIdToken();
                                const res = await fetch("/api/vault", { headers: { "Authorization": `Bearer ${token}` }});
                                const data = await res.json();
                                if (!data.exists) throw new Error("Vault not found");
                                
                                const privKeyJwk = await CryptoUtils.decryptWithPassword(data.vault, vaultPassword);
                                localStorage.setItem("nova_private_key", privKeyJwk);
                                
                                toast.success("Key Restored! Refreshing chats...");
                                setVaultPassword("");
                                setTimeout(() => window.location.reload(), 1000);
                             } catch(err) {
                                toast.error("Incorrect password or error");
                             } finally {
                                setVaultSaving(false);
                             }
                          }}
                        >
                           Overwrite Local Key with Vault
                        </Button>
                     </div>
                   )}

                </div>
              </div>

              <div className="p-4 bg-black/50 border border-slate-700 rounded-2xl opacity-60">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2"><ArchiveRestore className="w-4 h-4 text-emerald-400"/> Local Sync Backup</h3>
                <p className="text-xs text-slate-400 mb-4">Manual JSON sync (Legacy).</p>
                <div className="flex gap-2">
                   <Button 
                     size="sm"
                     variant="outline"
                     className="flex-1 border-slate-800 h-9"
                     onClick={async () => {
                       const data = await LocalDB.exportFullBackup();
                       const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                       const url = URL.createObjectURL(blob);
                       const a = document.createElement('a'); a.href = url; a.download = `nova_${Date.now()}.json`; a.click();
                       toast.success("Downloaded");
                     }}
                   >
                     <Download className="w-3 h-3 mr-2" /> Export
                   </Button>
                </div>
              </div>


              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
                <h3 className="text-sm font-semibold mb-1 text-red-400">Danger Zone</h3>
                <p className="text-xs text-slate-400 mb-4">Completely wipe local device history. This cannot be undone.</p>
                <Button 
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl h-10"
                  onClick={async () => {
                    if (confirm("Are you sure? This deletes ALL offline chats!")) {
                      await import("localforage").then(lf => (lf.default || lf).clear());
                      toast.success("Local DB Cleared! Restarting...");
                      setTimeout(() => window.location.reload(), 1000);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-2" /> Wipe Local DB
                </Button>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
