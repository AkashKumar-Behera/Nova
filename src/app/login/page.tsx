"use client";

import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LogIn, Loader2 } from "lucide-react";
import { CryptoUtils } from "@/lib/crypto-utils";

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

  const handleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const token = await user.getIdToken();
      
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

      // Register user in backend
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ publicKey: publicKeyBase64 })
      });

      if (res.ok) {
        toast.success("Welcome back, " + user.displayName);
        router.push("/dashboard");
      } else {
        throw new Error("Failed to register user");
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Login failed: " + error.message);
    } finally {
      setLoading(false);
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
          <div className="mt-8 text-center text-xs text-slate-500">
            By signing in, you agree to our <span className="underline cursor-pointer">Terms of Service</span>.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
