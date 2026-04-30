import CryptoJS from 'crypto-js';

const FALLBACK_SECRET = 'vault-secret-key-2024';

export function encryptData(data: string, secretKey: string = FALLBACK_SECRET): string {
  return CryptoJS.AES.encrypt(data, secretKey).toString();
}

export function decryptData(encryptedData: string, secretKey: string = FALLBACK_SECRET): string | null {
  if (!encryptedData || typeof encryptedData !== 'string') return null;
  
  // Basic validation to check if it looks like CryptoJS AES output (Base64)
  // CryptoJS typically starts with U2FsdGVkX1 if it contains salt
  if (encryptedData.length < 16) return null;

  try {
    const decrypted = CryptoJS.AES.decrypt(encryptedData, secretKey);
    // toString can hang if the buffer is huge and garbage
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!result || result.length === 0) return null;
    return result;
  } catch (error) {
    console.error("Decryption parsing error:", error);
    return null;
  }
}

/**
 * Encrypts a File object by converting it to a base64 string
 * Note: For large files, this might be memory intensive.
 */
export async function encryptFile(file: File, secretKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const encrypted = CryptoJS.AES.encrypt(base64, secretKey).toString();
      resolve(encrypted);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function decryptFile(encryptedBase64Html: string, secretKey: string): string | null {
  return decryptData(encryptedBase64Html, secretKey);
}
