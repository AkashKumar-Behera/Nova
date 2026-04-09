/**
 * E2EE Crypto Utilities using Web Crypto API
 */

export class CryptoUtils {
  static ALGORITHM = "ECDH";
  static CURVE = "P-256";
  static AES_ALGO = "AES-GCM";

  /**
   * Generates a new ECDH key pair for the user
   */
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
      { name: this.ALGORITHM, namedCurve: this.CURVE },
      true, // extractable
      ["deriveKey"]
    );
  }

  /**
   * Exports the entire key pair to Base64/JWK for storage
   */
  static async exportKeyPair(pair: CryptoKeyPair): Promise<{ publicKey: string; privateKey: string }> {
    const pub = await window.crypto.subtle.exportKey("jwk", pair.publicKey);
    const priv = await window.crypto.subtle.exportKey("jwk", pair.privateKey);
    return {
      publicKey: btoa(JSON.stringify(pub)),
      privateKey: btoa(JSON.stringify(priv))
    };
  }

  /**
   * Imports a private key from Base64
   */
  static async importPrivateKey(base64: string): Promise<CryptoKey> {
    const jwk = JSON.parse(atob(base64));
    return await window.crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: this.ALGORITHM, namedCurve: this.CURVE },
      true,
      ["deriveKey"]
    );
  }

  /**
   * Imports a public key from Base64
   */
  static async importPublicKey(base64: string): Promise<CryptoKey> {
    const jwk = JSON.parse(atob(base64));
    return await window.crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: this.ALGORITHM, namedCurve: this.CURVE },
      true,
      []
    );
  }

  /**
   * Derives a symmetric AES key from local private key and remote public key
   */
  static async deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
    return await window.crypto.subtle.deriveKey(
      { name: this.ALGORITHM, public: publicKey },
      privateKey,
      { name: this.AES_ALGO, length: 256 },
      false, // not extractable
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts a message string using a shared AES key
   */
  static async encryptMessage(key: CryptoKey, text: string): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
    const encoded = new TextEncoder().encode(text);
    return this.encryptBinary(key, encoded);
  }

  /**
   * Decrypts an ArrayBuffer ciphertext back to string
   */
  static async decryptMessage(key: CryptoKey, ciphertext: ArrayBuffer, iv: Uint8Array): Promise<string> {
    const decrypted = await this.decryptBinary(key, ciphertext, iv);
    return new TextDecoder().decode(decrypted);
  }

  /**
   * Encrypts pure binary data (ArrayBuffer) for file uploads
   */
  static async encryptBinary(key: CryptoKey, buffer: ArrayBuffer): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: this.AES_ALGO, iv: iv as any },
      key,
      buffer
    );
    return { ciphertext, iv };
  }

  /**
   * Decrypts binary data downloaded from storage
   */
  static async decryptBinary(key: CryptoKey, ciphertext: ArrayBuffer, iv: Uint8Array): Promise<ArrayBuffer> {
    return await window.crypto.subtle.decrypt(
      { name: this.AES_ALGO, iv: iv as any },
      key,
      ciphertext
    );
  }

  // Helpers for base64 conversion
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer as ArrayBuffer;
  }
}
