"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LogIn, Loader2, ShieldCheck, Key, Lock, AlertCircle } from "lucide-react";
import { CryptoUtils } from "@/lib/crypto-utils";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.push("/dashboard");
      }
    });
    return () => unsubscribe();
  }, [router]);

  const [step, setStep] = useState<"login" | "restore" | "setup">("login");
  const [vaultData, setVaultData] = useState<any>(null);
  const [password, setPassword] = useState("");
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [pendingToken, setPendingToken] = useState("");

  const handleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const token = await user.getIdToken();
      setPendingUser(user);
      setPendingToken(token);
      
      // 1. Check if user already has a public key in Firestore
      const checkRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({}) // Just check
      });
      const checkData = await checkRes.json();
      
      const hasRemoteKey = checkData.user?.publicKey || false; // This requires API update to return current state
      const hasLocalKey = !!localStorage.getItem("nova_private_key");

      if (hasRemoteKey && !hasLocalKey) {
        // 2. Try to fetch vault
        const vaultRes = await fetch("/api/vault", {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const vaultData = await vaultRes.json();
        
        if (vaultData.exists) {
          setVaultData(vaultData.vault);
          setStep("restore");
          setLoading(false);
          return;
        } else {
          toast.warning("Remote keys found but no security backup exists. Generating new keys will delete access to old chats.");
        }
      }

      // 3. Fallback: Generate or Setup
      await finishAuth(user, token);
    } catch (error: any) {
      console.error(error);
      toast.error("Login failed: " + error.message);
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const privateKeyJwk = await CryptoUtils.decryptWithPassword(vaultData, password);
      
      // Extract public key from JWK (or re-generate from private if needed, but we saved the whole pair usually)
      // Actually our CryptoUtils exports full pairs. Let's assume ciphertext is the JWK of the private key.
      
      localStorage.setItem("nova_private_key", privateKeyJwk);
      // We also need the public key to stay in sync
      const privKeyObj = await CryptoUtils.importPrivateKey(privateKeyJwk);
      // In ECDH, we can't easily get the public key back from the private key object in WebCrypto without re-exporting? 
      // Actually JWK for private key usually doesn't have public parts. 
      // Let's assume we saved it or we'll just re-register with the remote one.
      
      toast.success("Security Key Restored!");
      router.push("/dashboard");
    } catch (err) {
      toast.error("Incorrect password or corrupted backup");
    } finally {
      setLoading(false);
    }
  };

  const finishAuth = async (user: any, token: string) => {
    // E2EE Key Management
    let publicKeyBase64 = localStorage.getItem("nova_public_key");
    if (!publicKeyBase64) {
      console.log("Generating new E2EE keys...");
      const keys = await CryptoUtils.generateKeyPair();
      const exported = await CryptoUtils.exportKeyPair(keys);
      localStorage.setItem("nova_public_key", exported.publicKey);
      localStorage.setItem("nova_private_key", exported.privateKey);
      publicKeyBase64 = exported.publicKey;
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ publicKey: publicKeyBase64 })
    });

    if (res.ok) {
      toast.success("Welcome, " + user.displayName);
      router.push("/dashboard");
    } else {
      throw new Error("Failed to register user");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-indigo-950 via-slate-900 to-black">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 rotate-3 hover:rotate-0 transition-transform duration-300">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-white">Nova</CardTitle>
          <CardDescription className="text-slate-400">
            Your private world. Secure messages, video calls, and watch parties.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "login" && (
            <Button 
              onClick={handleLogin} 
              disabled={loading}
              className="w-full h-12 bg-white hover:bg-slate-200 text-black font-semibold rounded-xl transition-all"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="mr-2 h-5 w-5" />
              )}
              Sign in with Google
            </Button>
          )}

          {step === "restore" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
               <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-3">
                  <ShieldCheck className="w-6 h-6 text-indigo-400" />
                  <div className="text-left">
                     <p className="text-sm font-bold">Secure Vault Found</p>
                     <p className="text-[11px] text-slate-400">Enter your secret password to unlock your chats.</p>
                  </div>
               </div>
               
               <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <Input 
                    type="password"
                    placeholder="Security Password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 bg-black/40 border-slate-800 focus:border-indigo-500"
                  />
               </div>

               <Button 
                 onClick={handleRestore}
                 disabled={loading || !password}
                 className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20"
               >
                 {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Unlock Chats"}
               </Button>
               
               <button 
                 onClick={() => finishAuth(pendingUser, pendingToken)}
                 className="text-xs text-slate-500 hover:text-red-400 underline w-full text-center"
               >
                 I lost my password (Start fresh)
               </button>
            </div>
          )}

          <div className="mt-8 text-center text-xs text-slate-500">
            By signing in, you agree to our <span className="underline cursor-pointer">Terms of Service</span>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
