import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  salt: string;
  hash: string;
  scopes: string[];
  createdAt: number;
  revoked: boolean;
}

/**
 * API key management (feature 12). Keys are stored hashed (SHA-256 with a
 * per-key salt), shown once on creation, prefixed `gk_` so server clients can
 * authenticate without leaking the full secret into logs.
 */
export class ApiKeyStore {
  private keys = new Map<string, ApiKeyRecord>();

  create(name: string, scopes: string[] = ["chat"]): { record: ApiKeyRecord; secret: string } {
    const secret = `gk_${randomBytes(24).toString("base64url")}`;
    const salt = randomBytes(8).toString("hex");
    const id = `key_${randomBytes(8).toString("hex")}`;
    const record: ApiKeyRecord = {
      id,
      name,
      prefix: secret.slice(0, 10),
      salt,
      hash: createHash("sha256").update(`${salt}:${secret}`).digest("hex"),
      scopes,
      createdAt: Date.now(),
      revoked: false,
    };
    this.keys.set(id, record);
    return { record, secret };
  }

  verify(secret: string): ApiKeyRecord | null {
    for (const record of this.keys.values()) {
      if (record.revoked) continue;
      const expected = createHash("sha256").update(`${record.salt}:${secret}`).digest("hex");
      if (timingSafeEqual(Buffer.from(record.hash), Buffer.from(expected))) return record;
    }
    return null;
  }

  revoke(id: string): boolean {
    const record = this.keys.get(id);
    if (!record) return false;
    record.revoked = true;
    return true;
  }

  list(): ApiKeyRecord[] {
    return [...this.keys.values()];
  }
}
