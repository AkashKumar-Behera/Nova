"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LogIn, Loader2, ShieldCheck, Lock, AlertTriangle, Eye, EyeOff, KeyRound } from "lucide-react";
import { CryptoUtils } from "@/lib/crypto-utils";
import { Input } from "@/components/ui/input";

type Step = "login" | "setup_vault" | "restore_vault" | "lost_key_warning";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>("login");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [pendingToken, setPendingToken] = useState("");
  const [vaultData, setVaultData] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Only redirect if they actually have a local key set up
        const hasLocalKey = !!localStorage.getItem(`nova_private_key_${user.uid}`);
        if (hasLocalKey) {
          router.push("/dashboard");
        } else {
          // If already logged in but local key wiped, run the check flow automatically
          processAuthFlow(user);
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  const processAuthFlow = async (user: any) => {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      setPendingUser(user);
      setPendingToken(token);

      // Clear legacy un-scoped keys to avoid cross-account contamination
      localStorage.removeItem("nova_public_key");
      localStorage.removeItem("nova_private_key");

      const hasLocalKey = !!localStorage.getItem(`nova_private_key_${user.uid}`);

      // Check if user has a remote public key (returning user)
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const regData = await regRes.json();
      const hasRemoteKey = !!regData.user?.publicKey;

      if (hasRemoteKey && hasLocalKey) {
        // Perfect - keys are already in sync, go to dashboard
        await registerAndRedirect(user, token, localStorage.getItem(`nova_public_key_${user.uid}`)!);
        return;
      }

      if (hasRemoteKey && !hasLocalKey) {
        // Returning user on a new device - must restore from vault
        const vaultRes = await fetch("/api/vault", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const vaultJson = await vaultRes.json();
        if (vaultJson.exists) {
          setVaultData(vaultJson.vault);
          setStep("restore_vault");
        } else {
          // Has remote key but no vault backup - warn user
          setStep("lost_key_warning");
        }
        setLoading(false);
        return;
      }

      // New user - generate fresh keys and force vault setup
      const keys = await CryptoUtils.generateKeyPair();
      const exported = await CryptoUtils.exportKeyPair(keys);
      localStorage.setItem(`nova_public_key_${user.uid}`, exported.publicKey);
      localStorage.setItem(`nova_private_key_${user.uid}`, exported.privateKey);
      setStep("setup_vault");
      setLoading(false);
    } catch (err: any) {
      toast.error("Auth flow failed: " + err.message);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await processAuthFlow(result.user);
    } catch (err: any) {
      toast.error("Login failed: " + err.message);
      setLoading(false);
    }
  };

  const handleSetupVault = async () => {
    if (!password || password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const privKey = localStorage.getItem(`nova_private_key_${pendingUser.uid}`);
      if (!privKey) throw new Error("Private key missing from local storage");

      const encrypted = await CryptoUtils.encryptWithPassword(privKey, password);
      const token = await pendingUser.getIdToken();

      const saveRes = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(encrypted),
      });
      if (!saveRes.ok) throw new Error("Failed to save vault");

      const pubKey = localStorage.getItem(`nova_public_key_${pendingUser.uid}`)!;
      await registerAndRedirect(pendingUser, token, pubKey);
    } catch (err: any) {
      toast.error(err.message || "Vault setup failed");
      setLoading(false);
    }
  };

  const handleRestoreVault = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const privKey = await CryptoUtils.decryptWithPassword(vaultData, password);
      localStorage.setItem(`nova_private_key_${pendingUser.uid}`, privKey);

      // Re-register to ensure the public key is still on the server
      const token = await pendingUser.getIdToken();
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const regData = await regRes.json();
      if (regData.user?.publicKey) {
        localStorage.setItem(`nova_public_key_${pendingUser.uid}`, regData.user.publicKey);
      }

      toast.success("🔓 Keys restored! Welcome back.");
      router.push("/dashboard");
    } catch (err: any) {
      toast.error("Incorrect password. Please try again.");
      setLoading(false);
    }
  };

  const handleStartFresh = async () => {
    setLoading(true);
    try {
      const keys = await CryptoUtils.generateKeyPair();
      const exported = await CryptoUtils.exportKeyPair(keys);
      localStorage.setItem(`nova_public_key_${pendingUser.uid}`, exported.publicKey);
      localStorage.setItem(`nova_private_key_${pendingUser.uid}`, exported.privateKey);
      setPassword("");
      setConfirmPassword("");
      setStep("setup_vault");
      setLoading(false);
    } catch (err: any) {
      toast.error("Failed to generate new keys");
      setLoading(false);
    }
  };

  const registerAndRedirect = async (user: any, token: string, publicKey: string) => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ publicKey }),
    });
    if (!res.ok) throw new Error("Failed to register public key");
    toast.success("Welcome, " + user.displayName + "!");
    router.push("/dashboard");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-indigo-950 via-slate-900 to-black">
      <Card className="w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4 rotate-3 hover:rotate-0 transition-transform duration-300">
            {step === "login" ? (
              <LogIn className="w-8 h-8 text-white" />
            ) : step === "setup_vault" ? (
              <ShieldCheck className="w-8 h-8 text-white" />
            ) : (
              <KeyRound className="w-8 h-8 text-white" />
            )}
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight text-white">
            {step === "login" ? "Nova" : step === "setup_vault" ? "Secure Your Chats" : step === "restore_vault" ? "Welcome Back" : "Lost Access?"}
          </CardTitle>
          <CardDescription className="text-slate-400">
            {step === "login"
              ? "Your private world. End-to-end encrypted."
              : step === "setup_vault"
              ? "Create a vault password to protect your encryption key. You'll need this to access chats on any new device."
              : step === "restore_vault"
              ? "Enter your vault password to restore your encryption key on this device."
              : "Your keys weren't backed up. Starting fresh will clear access to old chats."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* --- Step 1: Login --- */}
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

          {/* --- Step 2: Mandatory Vault Setup (New User) --- */}
          {step === "setup_vault" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[11px] text-indigo-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>This password encrypts your private key. <strong>It cannot be recovered</strong> if you forget it.</span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Create Vault Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 bg-black/40 border-slate-700 focus:border-indigo-500"
                />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm Vault Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSetupVault()}
                  className="pl-10 bg-black/40 border-slate-700 focus:border-indigo-500"
                />
              </div>
              <Button
                onClick={handleSetupVault}
                disabled={loading || !password || !confirmPassword}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Create Vault & Continue"}
              </Button>
            </div>
          )}

          {/* --- Step 3: Vault Restore (Returning User on New Device) --- */}
          {step === "restore_vault" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                <span>A secure vault was found for your account. Enter your password to unlock your chats.</span>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Your Vault Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRestoreVault()}
                  className="pl-10 pr-10 bg-black/40 border-slate-700 focus:border-indigo-500"
                />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                onClick={handleRestoreVault}
                disabled={loading || !password}
                className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "🔓 Unlock My Chats"}
              </Button>
              <button
                onClick={() => setStep("lost_key_warning")}
                className="text-xs text-slate-500 hover:text-amber-400 underline w-full text-center block"
              >
                I forgot my vault password
              </button>
            </div>
          )}

          {/* --- Step 4: Lost Key Warning --- */}
          {step === "lost_key_warning" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-300 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0 text-amber-400" />
                <span>
                  <strong className="block mb-0.5">Warning: Previous chats will be lost</strong>
                  Starting fresh generates a new encryption key. Old messages encrypted with your previous key will
                  become permanently unreadable.
                </span>
              </div>
              <Button
                onClick={handleStartFresh}
                disabled={loading}
                className="w-full h-12 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl"
              >
                {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Start Fresh (Lose Old Chats)"}
              </Button>
              {vaultData && (
                <button
                  onClick={() => { setStep("restore_vault"); setPassword(""); }}
                  className="text-xs text-slate-500 hover:text-indigo-400 underline w-full text-center block"
                >
                  ← Try vault password again
                </button>
              )}
            </div>
          )}

          <div className="mt-6 text-center text-xs text-slate-600">
            End-to-end encrypted · Your keys never leave your device unencrypted
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
