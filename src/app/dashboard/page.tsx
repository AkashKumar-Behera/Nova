"use client";

import { Suspense, useState, useEffect, useRef } from "react";
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
  Lock,
  RefreshCw,
  Mic,
  Trash,
  RotateCcw,
  ArrowDown
} from "lucide-react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
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

  if (msg.parsedContent?.type === 'voice') {
    return (
        <div className="flex items-center gap-3 p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20 min-w-[200px]">
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center animate-pulse">
                <Mic className="w-4 h-4 text-white" />
            </div>
            <audio controls src={mediaUrl} className="h-8 w-40 filter invert hue-rotate-180 opacity-70" />
            <span className="text-[10px] text-indigo-400 font-bold whitespace-nowrap">Voice</span>
        </div>
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

function LightboxViewer({ media, onClose }: { media: {url: string, fileName: string}, onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    startX: number, startY: number, 
    originX: number, originY: number, 
    initialDistance: number, 
    initialScale: number
  } | null>(null);
  const pointersRef = useRef<Map<number, {x: number, y: number}>>(new Map());

  const getDistance = (p1: {x:number, y:number}, p2: {x:number, y:number}) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute top-0 w-full p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent z-10">
        <span className="text-sm font-medium text-slate-300 truncate max-w-[200px] md:max-w-md">
          {media.fileName}
        </span>
        <div className="flex gap-1 items-center">
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8"
            onClick={() => { setScale(Math.min(5, scale + 0.5)); setPosition({x:0, y:0}); }}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <span className="text-xs text-slate-400 w-10 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8"
            onClick={() => { setScale(Math.max(0.5, scale - 0.5)); setPosition({x:0, y:0}); }}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <a href={media.url} download={media.fileName}>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 h-8 w-8">
              <Download className="w-4 h-4" />
            </Button>
          </a>
          <Button variant="ghost" size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-400/10 h-8 w-8 ml-2"
            onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div
        className="flex-1 w-full flex items-center justify-center overflow-hidden touch-none"
        style={{ cursor: scale > 1 ? 'grab' : 'default', touchAction: 'none' }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          
          const pts = Array.from(pointersRef.current.values());
          if (pts.length === 1) {
            dragRef.current = {
              startX: pts[0].x, startY: pts[0].y,
              originX: position.x, originY: position.y,
              initialDistance: 0,
              initialScale: scale
            };
          } else if (pts.length === 2) {
            dragRef.current = {
              startX: (pts[0].x + pts[1].x) / 2, 
              startY: (pts[0].y + pts[1].y) / 2,
              originX: position.x, originY: position.y,
              initialDistance: getDistance(pts[0], pts[1]),
              initialScale: scale
            };
          }
        }}
        onPointerMove={(e) => {
          if (!pointersRef.current.has(e.pointerId)) return;
          pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          
          if (!dragRef.current) return;
          const pts = Array.from(pointersRef.current.values());

          if (pts.length === 1 && scale > 1) {
            const dx = pts[0].x - dragRef.current.startX;
            const dy = pts[0].y - dragRef.current.startY;
            setPosition({
              x: dragRef.current.originX + dx,
              y: dragRef.current.originY + dy
            });
          } else if (pts.length === 2) {
            const dist = getDistance(pts[0], pts[1]);
            const cx = (pts[0].x + pts[1].x) / 2;
            const cy = (pts[0].y + pts[1].y) / 2;
            
            const newScale = Math.max(0.5, Math.min(5, dragRef.current.initialScale * (dist / dragRef.current.initialDistance)));
            setScale(newScale);
            
            if (newScale > 1) {
                const dx = cx - dragRef.current.startX;
                const dy = cy - dragRef.current.startY;
                setPosition({
                   x: dragRef.current.originX + dx,
                   y: dragRef.current.originY + dy
                });
            } else {
                setPosition({ x: 0, y: 0 });
            }
          }
        }}
        onPointerUp={(e) => {
          pointersRef.current.delete(e.pointerId);
          const pts = Array.from(pointersRef.current.values());
          if (pts.length === 1 && dragRef.current) {
             dragRef.current = {
               startX: pts[0].x, startY: pts[0].y,
               originX: position.x, originY: position.y,
               initialDistance: 0,
               initialScale: scale
             };
          } else if (pts.length === 0) {
             dragRef.current = null;
          }
        }}
        onPointerCancel={(e) => {
          pointersRef.current.delete(e.pointerId);
          dragRef.current = null;
        }}
        onDoubleClick={() => {
          if (scale !== 1) { setScale(1); setPosition({x:0, y:0}); }
          else { setScale(2); setPosition({x:0, y:0}); }
        }}
        onWheel={(e) => {
          const zoomFactor = e.deltaY < 0 ? 0.15 : -0.15;
          setScale(prev => Math.max(0.5, Math.min(5, prev + zoomFactor)));
        }}
      >
        <img
          src={media.url}
          alt="Expanded media"
          draggable={false}
          className="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl rounded-lg select-none pointer-events-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            willChange: 'transform',
          }}
        />
      </div>

      <div className="absolute bottom-4 w-full text-center text-[10px] text-slate-600">
        Double-tap to reset · Drag to pan · Pinch/scroll to zoom
      </div>
    </div>
  );
}

function DashboardContent() {
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
  const [lightboxMedia, setLightboxMedia] = useState<{url: string, fileName: string} | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [friendPresence, setFriendPresence] = useState<{state: string, last_changed: number} | null>(null);

  // Background state tracker for notifications
  const activeChatIdRef = useRef<string | null>(null);
  useEffect(() => { activeChatIdRef.current = selectedFriend?.uid || null; }, [selectedFriend]);
  const [friendActiveChat, setFriendActiveChat] = useState<string | null>(null);
  
  // Security Vault States
  const [vaultExists, setVaultExists] = useState(false);
  const [vaultPassword, setVaultPassword] = useState("");
  const [vaultSaving, setVaultSaving] = useState(false);
  
  // Voice Recording States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<any>(null);
  
  // Interaction states
  const [messageContextMenu, setMessageContextMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const longPressTimer = useRef<any>(null);
  
  // Global Decryption & Presence Caches
  const sharedKeysCache = useRef<Record<string, CryptoKey>>({});
  const [sidebarPreviews, setSidebarPreviews] = useState<Record<string, { last: any, unread: number }>>({});
  const [friendsPresence, setFriendsPresence] = useState<Record<string, any>>({});
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const chatId = user && selectedFriend ? [user.uid, selectedFriend.uid].sort().join('-') : null;

  const searchParams = useSearchParams();

  // Sync URL ?chat=uid with selectedFriend
  useEffect(() => {
    const chatUid = searchParams.get('chat');
    if (chatUid) {
      const friend = friends.find(f => f.uid === chatUid);
      if (friend) {
        handleSelectFriend(friend);
        if (window.innerWidth < 768) setSidebarOpen(false);
      }
    } else {
      setSelectedFriend(null);
      setSharedKey(null);
      if (window.innerWidth < 768) setSidebarOpen(true);
    }
  }, [searchParams, friends]);

  // Handle hardware/browser back button
  useEffect(() => {
    const handlePopState = () => {
      if (selectedFriend) {
        // Navigation back simply triggers the popstate, 
        // our searchParams useEffect will handle cleaning state.
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedFriend]);

  const handleSelectFriendWithURL = (friend: any) => {
    router.push(`/dashboard?chat=${friend.uid}`);
  };

  const handleLogout = () => {
    if (confirm("Are you sure you want to log out? Your encryption keys are stored safely in the vault.")) {
      auth.signOut();
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        if (!selectedFriend) {
          setSidebarOpen(true);
        } else {
          setSidebarOpen(false);
        }
      } else {
        setSidebarOpen(true);
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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
    
    // PWA Notification Permission Initial Check
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone === true);
    if (isStandalone && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

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
        // Enforce E2EE key existence before allowing dashboard access
        const hasLocalKey = !!localStorage.getItem(`nova_private_key_${u.uid}`);
        if (!hasLocalKey) {
          console.warn("User authenticated but missing local E2EE keys. Redirecting to login/setup flow.");
          router.push("/login");
          return;
        }
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
         // Identify if the last message is ours or if we're already at the bottom
         const atBottom = chatContainerRef.current ? (chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop - chatContainerRef.current.clientHeight < 150) : true;
         const lastMsgMine = chats.length > 0 && chats[chats.length - 1].from === user?.uid;
         
         setMessages([...chats]);

         setTimeout(() => {
             if (!chatContainerRef.current) return;
             // If we just opened the chat, or we're at bottom, or we sent a message: scroll to bottom
             if (chats.length !== messages.length && (atBottom || lastMsgMine)) {
                 chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' });
             } else if (messages.length === 0) { // first load
                 chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
             }
         }, 50);
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
                const pkStr = localStorage.getItem(`nova_private_key_${user.uid}`);
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

          // Native Notify
          if (change.type === 'added' && mBase.from !== user.uid) {
             const now = Date.now() / 1000;
             const msgTime = mBase.timestamp?.seconds || now;
             if ((now - msgTime) < 10) { 
                 const isActiveChatAndFocused = (mBase.from === activeChatIdRef.current) && !document.hidden;
                 if (!isActiveChatAndFocused) {
                     try {
                         const audio = new Audio("https://actions.google.com/sounds/v1/water/water_drop.ogg");
                         audio.play().catch(() => null);
                     } catch(e) {}
                     
                     const isStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as any).standalone === true);
                     if (isStandalone && "Notification" in window && Notification.permission === 'granted') {
                         const fData = friends.find(fr => fr.uid === mBase.from);
                         let bodyText = "New message";
                         if (mBase.parsedContent?.type === 'text') bodyText = mBase.parsedContent.text;
                         else if (mBase.parsedContent?.type === 'image') bodyText = "📷 Photo";
                         else if (mBase.parsedContent?.type === 'voice') bodyText = "🎤 Voice Message";
                         else if (mBase.parsedContent?.type === 'file') bodyText = "📎 Document";
                         
                         const n = new Notification(fData?.displayName || "Nova Chat", {
                             body: bodyText,
                             icon: fData?.photoURL || '/icon-192x192.png',
                             tag: `chat-${mBase.from}`
                         });
                         n.onclick = () => {
                             window.focus();
                             n.close();
                         };
                     }
                 }
             }
          }
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
      const myPrivKeyBase64 = localStorage.getItem(`nova_private_key_${user.uid}`);
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
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
                // Manually trigger upload
                const fileEvent = { target: { files: [blob] } } as any;
                handleFileUpload(fileEvent);
            }
        }
    }
  };

  const onMessageAction = (action: string, msg: any) => {
    setMessageContextMenu(null);
    if (action === 'copy') {
        if (msg.parsedContent?.type === 'text') {
            navigator.clipboard.writeText(msg.parsedContent.text);
            toast.success("Copied to clipboard");
        }
    } else if (action === 'delete') {
        deleteMessage(msg.id);
    } else if (action === 'edit') {
        startEdit(msg);
    } else if (action === 'forward' || action === 'star' || action === 'pin' || action === 'info' || action === 'reply') {
        toast.info(`${action.charAt(0).toUpperCase() + action.slice(1)} feature coming soon!`);
    }
  };

  const handleLongPressStart = (e: React.PointerEvent, msgId: string) => {
    const x = e.clientX;
    const y = e.clientY;
    longPressTimer.current = setTimeout(() => {
        setMessageContextMenu({ id: msgId, x, y });
        if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // Voice Recording Handlers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        // Handle upload (similar to file upload but type is audio)
        if (audioBlob.size > 0 && selectedFriend && sharedKey) {
            handleVoiceUpload(audioBlob);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access denied:", err);
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const handleVoiceUpload = async (blob: Blob) => {
    if (!user || !selectedFriend || !sharedKey || !chatId) return;
    setUploading(true);
    toast.info("Encrypting voice message...");
    try {
      const buffer = await blob.arrayBuffer();
      const { ciphertext, iv: binaryIv } = await CryptoUtils.encryptBinary(sharedKey, buffer);
      
      const fileId = `voice-${Date.now()}`;
      const sRef = storageRef(storage, `media/${fileId}`);
      await uploadBytes(sRef, new Blob([ciphertext]));
      const url = await getDownloadURL(sRef);
      
      const payload = JSON.stringify({
        type: 'voice',
        url,
        duration: recordingTime,
        mimeType: 'audio/webm',
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
      toast.success("Voice message sent!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to send voice note");
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-slate-200 overflow-hidden font-sans relative w-full">
      {/* Mobile Sidebar Overlay Removed for Swipe/Native Navigation feel */}

      {/* Sidebar - Responsive */}
      <aside className={cn(
        "fixed inset-0 md:relative md:inset-auto md:w-80 border-r border-slate-800/50 bg-[#0f0f12] flex flex-col z-30 transition-transform duration-500 ease-in-out shadow-2xl md:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
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
                    onClick={() => handleSelectFriendWithURL(f)}
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
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-indigo-400" onClick={() => window.location.reload()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white" onClick={() => setSettingsOpen(true)}>
              <Settings className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-red-400" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className={cn(
        "flex-1 flex flex-col bg-[#050507] relative transition-all duration-500 ease-in-out",
        !sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
      )}>
        {selectedFriend ? (
          <>
            {/* Chat Header */}
            <header className="h-16 border-b border-slate-800/50 bg-[#0f0f12]/80 backdrop-blur-xl flex items-center justify-between px-4 md:px-6 z-10">
              <div className="flex items-center gap-2 md:gap-4">
                <Button variant="ghost" size="icon" className="md:hidden text-slate-400" onClick={() => router.push('/dashboard')}>
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
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400" onClick={() => router.push('/dashboard')}>
                  <LogOut className="w-4 h-4 text-red-400" />
                </Button>
              </div>
            </header>

            {/* Messages Area */}
            <div 
              ref={chatContainerRef}
              onScroll={(e) => {
                 const target = e.currentTarget;
                 const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 150;
                 setShowScrollDown(!isAtBottom);
              }}
              className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] select-text"
            >
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
                    onContextMenu={(e) => {
                        e.preventDefault();
                        setMessageContextMenu({ id: msg.id, x: e.clientX, y: e.clientY });
                    }}
                    onPointerDown={(e) => handleLongPressStart(e, msg.id)}
                    onPointerUp={handleLongPressEnd}
                    onPointerMove={handleLongPressEnd}
                    onPointerLeave={handleLongPressEnd}
                  >
                    {isDeleted ? (
                      <div className="bg-[#16161c] border border-slate-800 border-dashed rounded-2xl p-3 md:px-4 md:py-2 text-xs text-slate-500 italic flex items-center gap-2">
                        🚫 This message was deleted
                      </div>
                    ) : (
                      <div className="relative group flex items-center">
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
                            sharedKey && <EncryptedMedia msg={msg} sharedKey={sharedKey} onOpenLightbox={(url, name) => setLightboxMedia({ url, fileName: name })} />
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

            {/* Scroll to Bottom Button */}
            {showScrollDown && (
               <Button 
                 onClick={() => chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' })}
                 className="absolute bottom-20 right-4 rounded-full w-10 h-10 shadow-2xl bg-[#16161c]/80 backdrop-blur-md text-indigo-400 border border-slate-700/50 hover:bg-[#1f1f26] z-50 animate-in fade-in zoom-in"
                 variant="ghost"
                 size="icon"
               >
                 <ArrowDown className="w-5 h-5" />
               </Button>
            )}

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
                   disabled={uploading || isRecording}
                 >
                   {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                 </Button>
                 
                 <div className="flex-1 relative">
                    {isRecording ? (
                        <div className="flex-1 h-11 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center px-4 gap-3 animate-pulse">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-ping"></div>
                            <span className="text-xs font-mono text-indigo-400">Recording {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                            <div className="flex-1 text-center text-[10px] text-slate-500 italic">Speak now...</div>
                        </div>
                    ) : (
                        <Input 
                            value={messageInput}
                            onChange={handleTyping}
                            onPaste={handlePaste}
                            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                            placeholder={
                                editingMessageId 
                                ? "Editing message..." 
                                : uploading 
                                    ? "Locking & Uploading file..." 
                                    : `Message ${selectedFriend?.displayName}...`
                            }
                            disabled={uploading}
                            className="bg-black/50 border-slate-800 focus:border-indigo-500/50 rounded-2xl h-11 pr-12 text-sm"
                        />
                    )}
                    {editingMessageId && !isRecording && (
                        <Button
                            variant="ghost" 
                            size="icon"
                            onClick={() => { setEditingMessageId(null); setMessageInput(""); }}
                            className="absolute right-10 top-1 h-9 w-9 text-slate-400 hover:text-red-400"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                 </div>

                 <Button 
                   variant="ghost" 
                   size="icon"
                   className={cn(
                       "h-11 w-11 rounded-2xl transition-all shadow-lg shrink-0",
                       isRecording ? "bg-red-500 text-white hover:bg-red-600" : "bg-indigo-600 text-white hover:bg-indigo-700"
                   )}
                   onClick={() => {
                       if (isRecording) stopRecording();
                       else if (messageInput.trim() || editingMessageId) sendMessage();
                       else startRecording();
                   }}
                 >
                   {isRecording ? <div className="w-3 h-3 bg-white rounded-sm" /> : (messageInput.trim() || editingMessageId ? <Send className="w-5 h-5" /> : <Mic className="w-5 h-5" />)}
                 </Button>
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

      {/* Lightbox Overlay - WhatsApp Style with Pan & Zoom */}
      {lightboxMedia && <LightboxViewer media={lightboxMedia} onClose={() => setLightboxMedia(null)} />}

      {/* Message Context Menu */}
      {messageContextMenu && (
        <div 
          className="fixed inset-0 z-[200]" 
          onClick={() => setMessageContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setMessageContextMenu(null); }}
        >
          <div 
            className="absolute bg-[#16161c]/90 backdrop-blur-2xl border border-slate-700/50 rounded-2xl shadow-2xl p-2 flex flex-col min-w-[160px] animate-in zoom-in-95 duration-200 origin-top-left"
            style={{ 
                left: Math.min(messageContextMenu.x, window.innerWidth - 180), 
                top: Math.min(messageContextMenu.y, window.innerHeight - 300) 
            }}
          >
            {[
                { label: 'Reply', action: 'reply', icon: RotateCcw },
                { label: 'Forward', action: 'forward', icon: Send },
                { label: 'Copy', action: 'copy', icon: Download },
                { label: 'Edit', action: 'edit', icon: Edit2, condition: (m: any) => m.from === user.uid && m.parsedContent?.type === 'text' },
                { label: 'Star', action: 'star', icon: Settings },
                { label: 'Info', action: 'info', icon: MessageSquare },
                { label: 'Pin', action: 'pin', icon: Lock },
                { label: 'Delete', action: 'delete', icon: Trash, danger: true, condition: (m: any) => m.from === user.uid }
            ].map(item => {
                const msg = messages.find(m => m.id === messageContextMenu.id);
                if (item.condition && !item.condition(msg)) return null;
                return (
                    <button
                        key={item.label}
                        onClick={(e) => { e.stopPropagation(); onMessageAction(item.action, msg); }}
                        className={cn(
                            "flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-xs font-medium transition-colors",
                            item.danger ? "text-red-400 hover:bg-red-500/10" : "text-slate-200 hover:bg-white/5"
                        )}
                    >
                        <item.icon className="w-3.5 h-3.5" />
                        {item.label}
                    </button>
                );
            })}
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
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-400"/> Settings</h2>
            
            <div className="mb-4 p-2 bg-black/40 border border-slate-800 rounded-lg text-center flex justify-center">
               <code className="text-[10px] text-slate-500 font-mono">
                  Key Signature: {typeof window !== 'undefined' ? (localStorage.getItem(`nova_private_key_${user?.uid}`)?.substring(10, 25) || "Missing") : ""}
               </code>
            </div>

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
                           const privKey = localStorage.getItem(`nova_private_key_${user?.uid}`);
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
                                localStorage.setItem(`nova_private_key_${user?.uid}`, privKeyJwk);
                                
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

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-[#0a0a0c]"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
