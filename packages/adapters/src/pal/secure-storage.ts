// Secure storage abstraction — spec §5.2
// Client-only. Keys are never sent to our backend; only to provider endpoints.
// Web: AES-GCM with passphrase (opt-in) else plain with warning. Electron/Tauri: OS keychain note.

export interface SecureStore {
  setKey(providerId: string, key: string): Promise<void>;
  getKey(providerId: string): Promise<string | null>;
  hasKey(providerId: string): Promise<boolean>;
  deleteKey(providerId: string): Promise<void>;
  clearAll(): Promise<void>;
  isEncrypted(): boolean;
}

const LS_PREFIX = "greeneek.keys.";
const META_ENCRYPTED = "greeneek.keys._encrypted";

// Plain localStorage impl (web default, unencrypted with warning)
export class LocalSecureStore implements SecureStore {
  async setKey(providerId: string, key: string): Promise<void> {
    localStorage.setItem(LS_PREFIX + providerId, key);
  }
  async getKey(providerId: string): Promise<string | null> {
    return localStorage.getItem(LS_PREFIX + providerId);
  }
  async hasKey(providerId: string): Promise<boolean> {
    return localStorage.getItem(LS_PREFIX + providerId) !== null;
  }
  async deleteKey(providerId: string): Promise<void> {
    localStorage.removeItem(LS_PREFIX + providerId);
  }
  async clearAll(): Promise<void> {
    const toDel: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LS_PREFIX)) toDel.push(k);
    }
    toDel.forEach((k) => localStorage.removeItem(k));
  }
  isEncrypted(): boolean {
    return localStorage.getItem(META_ENCRYPTED) === "1";
  }
}

// AES-GCM helpers (passphrase → key via PBKDF2)
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<any> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export class EncryptedSecureStore implements SecureStore {
  constructor(private passphrase: string) {}
  private salt(): Uint8Array {
    const raw = localStorage.getItem("greeneek.keys._salt");
    if (raw) return Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const s = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem("greeneek.keys._salt", btoa(String.fromCharCode(...s)));
    return s;
  }
  async setKey(providerId: string, key: string): Promise<void> {
    const enc = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cryptoKey = await deriveKey(this.passphrase, this.salt());
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(key));
    const packed = JSON.stringify({ iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) });
    localStorage.setItem(LS_PREFIX + providerId, packed);
    localStorage.setItem(META_ENCRYPTED, "1");
  }
  async getKey(providerId: string): Promise<string | null> {
    const raw = localStorage.getItem(LS_PREFIX + providerId);
    if (!raw) return null;
    try {
      const { iv, data } = JSON.parse(raw) as { iv: string; data: string };
      const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
      const dataBytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const cryptoKey = await deriveKey(this.passphrase, this.salt());
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, cryptoKey, dataBytes);
      return new TextDecoder().decode(plain);
    } catch {
      // Fallback: treat as plain (migration)
      return raw;
    }
  }
  async hasKey(providerId: string): Promise<boolean> {
    return (await this.getKey(providerId)) !== null;
  }
  async deleteKey(providerId: string): Promise<void> {
    localStorage.removeItem(LS_PREFIX + providerId);
  }
  async clearAll(): Promise<void> {
    const s = new LocalSecureStore();
    await s.clearAll();
    localStorage.removeItem(META_ENCRYPTED);
    localStorage.removeItem("greeneek.keys._salt");
  }
  isEncrypted(): boolean {
    return true;
  }
}
