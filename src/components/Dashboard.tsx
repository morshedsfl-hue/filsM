import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useDrive } from '../lib/DriveContext';
import { db, storage, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from 'firebase/storage';
import { motion, AnimatePresence } from 'motion/react';
import { 
  File, 
  Plus, 
  Search, 
  LogOut, 
  HardDrive, 
  Shield, 
  Trash2, 
  Download, 
  Eye, 
  Layers,
  Activity,
  X,
  Lock,
  Unlock,
  Cloud,
  FileText,
  Settings,
  Image as ImageIcon,
  CheckCircle2,
  Clock,
  RotateCw as RefreshCw,
  AlertCircle
} from 'lucide-react';
import { encryptFile, decryptFile } from '../lib/crypto';

export default function Dashboard() {
  const { user, profile, logout, updateUserProfile } = useAuth();
  const { accessToken, requestToken, logoutDrive, driveUser, error: driveError } = useDrive();
  const [files, setFiles] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isDecryptModalOpen, setIsDecryptModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [fileToDecrypt, setFileToDecrypt] = useState<any>(null);
  const [previewData, setPreviewData] = useState<{ url: string; name: string; type: string } | null>(null);
  // SECURITY: master key is kept in memory only (sessionStorage) so it
  // does not persist on disk after the browser tab is closed.
  const [encryptionKey, setEncryptionKey] = useState(sessionStorage.getItem('vault_master_key') || '');
  const [decryptionKey, setDecryptionKey] = useState('');
  const [oldKeyInput, setOldKeyInput] = useState('');
  const [newKeyInput, setNewKeyInput] = useState('');
  const [confirmKeyInput, setConfirmKeyInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [encryptBeforeUpload, setEncryptBeforeUpload] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [isDriveApiDisabled, setIsDriveApiDisabled] = useState(false);
  const [isVerifyingApi, setIsVerifyingApi] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [driveQuota, setDriveQuota] = useState<{ limit: string; usage: string } | null>(null);
  const [driveApiEnableUrl, setDriveApiEnableUrl] = useState('https://console.cloud.google.com/apis/library/drive.googleapis.com');

  const retestDriveApi = async () => {
    setIsVerifyingApi(true);
    try {
      await syncWithDrive();
      setIsDriveApiDisabled(false);
    } catch (e) {
      console.error("Still disabled");
    } finally {
      setIsVerifyingApi(false);
    }
  };

  // Files Subscription
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'files'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setFiles(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'files'));
    return unsubscribe;
  }, [user]);

  // Auto-Sync and Folder Creation when Drive is connected
  useEffect(() => {
    if (accessToken && user) {
      syncWithDrive();
    }
  }, [accessToken, user]);

  // Logs Subscription
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'logs'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'logs'));
    return unsubscribe;
  }, [user]);

  // Replaced local handleFirestoreError with shared one from firebase.ts

  const getOrCreateVaultFolder = async () => {
    if (!accessToken) return null;
    const folderName = 'FilesM-Assets';
    try {
      // Search for existing folder
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!searchRes.ok) {
        if (searchRes.status === 401) {
          logoutDrive();
          throw new Error('Google Drive session expired. Please connect again.');
        }
        const errData = await searchRes.json();
        const errMsg = errData.error?.message || searchRes.statusText;
        const isApiError = errMsg.toLowerCase().includes('google drive api has not been used') || 
                           errMsg.toLowerCase().includes('disabled') ||
                           (errData.error?.status === 'PERMISSION_DENIED');

        if (isApiError) {
          setIsDriveApiDisabled(true);
          const urlMatch = errMsg.match(/https?:\/\/[^\s]+/);
          if (urlMatch) {
            const cleanUrl = urlMatch[0].split(/[ "']/)[0].replace(/[.\)]+$/, '');
            setDriveApiEnableUrl(cleanUrl);
          }
        }
        throw new Error(`Drive search failed: ${errMsg}`);
      }
      
      setIsDriveApiDisabled(false);
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }

      // Create folder if not found
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      
      if (!createRes.ok) {
        if (createRes.status === 401) {
          logoutDrive();
          throw new Error('Google Drive session expired. Please connect again.');
        }
        const errData = await createRes.json();
        throw new Error(`Drive folder creation failed: ${errData.error?.message || createRes.statusText}`);
      }
      
      const createData = await createRes.json();
      return createData.id;
    } catch (err: any) {
      console.error("Folder logic error:", err);
      throw err;
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !user) return;
    if (encryptBeforeUpload && !encryptionKey) {
      alert('Please provide an encryption key.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      if (!accessToken) {
        alert('Please connect Google Drive (Sync Drive) first.');
        setUploading(false);
        return;
      }

      // Step 1: Ensure Vault Folder exists
      const vaultFolderId = await getOrCreateVaultFolder();
      if (!vaultFolderId) {
        setUploading(false);
        return;
      }

    const isAlreadyEncrypted = selectedFile.name.toLowerCase().endsWith('.enc');
    let fileToUpload: any = selectedFile;
    
    // If we are encrypting now, OR if it's already encrypted, we mark it as encrypted in DB
    const resultEncrypted = encryptBeforeUpload || isAlreadyEncrypted;

    if (encryptBeforeUpload && !isAlreadyEncrypted) {
      try {
        const encryptedBase64 = await encryptFile(selectedFile, encryptionKey);
        fileToUpload = new Blob([encryptedBase64], { type: 'text/plain' });
      } catch (e) {
        console.error("Encryption failed:", e);
        throw new Error('Encryption failed. File might be too large.');
      }
    } else if (isAlreadyEncrypted) {
      // If it's already an .enc file, ensure it's treated as text/plain so Drive doesn't mess it up
      try {
        const text = await selectedFile.text();
        fileToUpload = new Blob([text], { type: 'text/plain' });
      } catch (e) {
        console.error("Reading .enc file failed:", e);
      }
    }

      // Upload ONLY to Google Drive with progress
      const driveId = await new Promise<string>((resolve, reject) => {
        const metadata = {
          name: selectedFile.name + (encryptBeforeUpload && !isAlreadyEncrypted ? '.enc' : ''),
          parents: [vaultFolderId],
        };
        
        const boundary = '-------enc_boundary_314159';
        
        const reader = new FileReader();
        reader.readAsArrayBuffer(fileToUpload);
        reader.onload = () => {
          const contentType = fileToUpload.type || 'application/octet-stream';
          const metadataStr = JSON.stringify(metadata);

          const multipartRequestBody = new Blob([
            `--${boundary}\r\n`,
            'Content-Type: application/json; charset=UTF-8\r\n\r\n',
            metadataStr,
            `\r\n--${boundary}\r\n`,
            `Content-Type: ${contentType}\r\n\r\n`,
            reader.result as ArrayBuffer,
            `\r\n--${boundary}--`
          ], { type: 'multipart/related; boundary=' + boundary });

          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
          xhr.setRequestHeader('Content-Type', 'multipart/related; boundary=' + boundary);
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const progress = (event.loaded / event.total) * 100;
              setUploadProgress(Math.round(progress));
            }
          };

          xhr.onload = () => {
            if (xhr.status === 401) {
              logoutDrive();
              reject(new Error('Google Drive session expired. Please connect again.'));
              return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              const response = JSON.parse(xhr.responseText);
              resolve(response.id);
            } else {
              console.error("DRIVE ERROR:", xhr.status, xhr.responseText);
              try {
                const resp = JSON.parse(xhr.responseText);
                reject(new Error(resp.error?.message || `Drive upload failed: ${xhr.status}`));
              } catch (e) {
                reject(new Error(`Drive upload failed: ${xhr.status} ${xhr.statusText}`));
              }
            }
          };

          xhr.onerror = () => reject(new Error('Network error during Drive upload'));
          xhr.send(multipartRequestBody);
        };
        reader.onerror = () => reject(new Error('Failed to read file for upload'));
      });

      const fileData = {
        ownerId: user.uid,
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type,
        storagePath: '', // No longer using Firebase Storage
        driveId: driveId,
        isEncrypted: resultEncrypted,
        createdAt: serverTimestamp()
      };

      try {
        await addDoc(collection(db, 'files'), fileData);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'files');
      }

      // Non-blocking log
      addDoc(collection(db, 'logs'), {
        userId: user.uid,
        action: 'UPLOAD',
        details: `Uploaded file to Google Drive: ${selectedFile.name}`,
        createdAt: serverTimestamp()
      }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'logs'));

      setIsUploadOpen(false);
      setSelectedFile(null);
      setEncryptionKey('');
      fetchDriveQuota();
    } catch (error: any) {
      console.error(error);
      let message = 'Google Drive upload failed. Please check drive access.';
      
      const errorStr = error.message?.toLowerCase() || '';
      if (errorStr.includes('google drive api has not been used')) {
        // Detailed error instructions already shown via alert in getOrCreateVaultFolder
        return;
      } else if (errorStr.includes('unauthorized') || errorStr.includes('invalid authentication credentials')) {
        message = 'Google Drive session expired. Please connect again.';
        logoutDrive();
      } else if (errorStr.includes('permission-denied') || errorStr.includes('insufficient permissions')) {
        message = 'Drive permissions not granted. Please check drive.file scope.';
      }
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const handleRefresh = async () => {
    if (!accessToken) {
      alert('Please connect Google Drive to refresh.');
      return;
    }
    
    setIsRefreshing(true);
    try {
      await syncWithDrive();
      // Add a small delay for visual feedback if it finishes too fast
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const fetchDriveQuota = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=storageQuota', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDriveQuota(data.storageQuota);
      } else if (res.status === 401) {
        logoutDrive();
      }
    } catch (err) {
      console.error("Failed to fetch drive quota:", err);
    }
  };

  const syncWithDrive = async () => {
    if (!accessToken || !user) return;
    
    // Fetch quota info first
    fetchDriveQuota();
    
    try {
      // 1. Get or Create Vault Folder
      const vaultFolderId = await getOrCreateVaultFolder();
      if (!vaultFolderId) return;

      // 2. List all files in that folder from Drive
      let driveFileIds: string[] = [];
      let nextPageToken = '';
      
      do {
        const listRes = await fetch(`https://www.googleapis.com/drive/v3/files?q='${vaultFolderId}' in parents and trashed=false&fields=nextPageToken,files(id)&pageSize=1000${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!listRes.ok) {
          if (listRes.status === 401) {
            logoutDrive();
          }
          break;
        }
        const listData = await listRes.json();
        if (listData.files) {
          driveFileIds = [...driveFileIds, ...listData.files.map((f: any) => f.id)];
        }
        nextPageToken = listData.nextPageToken || '';
      } while (nextPageToken);

      // 3. Compare with Firestore files
      // Note: we use the 'files' state which is already filtered for the current user
      const filesToRemove = files.filter(f => f.driveId && !driveFileIds.includes(f.driveId));

      if (filesToRemove.length > 0) {
        console.log(`Sync: Removing ${filesToRemove.length} orphaned records from Firestore`);
        const batchPromises = filesToRemove.map(f => deleteDoc(doc(db, 'files', f.id)).catch(err => handleFirestoreError(err, OperationType.DELETE, `files/${f.id}`)));
        await Promise.all(batchPromises);
        
        // Log the cleanup
        await addDoc(collection(db, 'logs'), {
          userId: user.uid,
          action: 'SYNC_CLEANUP',
          details: `Automatically removed ${filesToRemove.length} orphaned file records (deleted from Drive)`,
          createdAt: serverTimestamp()
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, 'logs'));
      }
    } catch (error) {
      console.error("Sync With Drive failed:", error);
    }
  };

  const handleDriveAction = async () => {
    if (!accessToken) {
      try {
        await requestToken();
      } catch (err) {
        console.error(err);
      }
    } else {
      if (window.confirm('Do you want to disconnect from Google Drive?')) {
        logoutDrive();
      }
    }
  };

  const handleDownload = async (file: any) => {
    if (!accessToken) {
      alert('Download is not possible without Google Drive connection.');
      return;
    }

    if (file.isEncrypted && !decryptionKey) {
      // Use encryptionKey as default if set
      if (encryptionKey) {
        setDecryptionKey(encryptionKey);
        (file as any)._pendingDownload = true; // Flag to download after state update
        return;
      }
      setFileToDecrypt(file);
      setIsDecryptModalOpen(true);
      return;
    }
    
    setDownloading(file.id);
    try {
      // Download from Google Drive
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.driveId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!driveRes.ok) {
        if (driveRes.status === 401) {
          logoutDrive();
          throw new Error('Google Drive session expired. Please connect again.');
        }
        throw new Error('Drive download failed');
      }
      
      let dataUrl: string;
      let downloadName = file.name;

      if (file.isEncrypted) {
        setProcessingStatus('Downloading file...');
        const encryptedText = await driveRes.text();
        
        setProcessingStatus('Decrypting...');
        // Artificial delay to allow UI to render "Decrypting..."
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const decrypted = decryptFile(encryptedText, decryptionKey);
        
        setProcessingStatus(null);
        if (!decrypted) {
          alert('Decryption failed. Please use the correct master key.');
          setDownloading(null);
          setDecryptionKey('');
          return;
        }

        if (decrypted.startsWith('data:')) {
          dataUrl = decrypted;
        } else {
          // If it's not a data URL, treat as raw content
          const blob = new Blob([decrypted], { type: file.type || 'application/octet-stream' });
          dataUrl = URL.createObjectURL(blob);
        }
        
        // Remove .enc if present for the downloaded file
        if (downloadName.toLowerCase().endsWith('.enc')) {
          downloadName = downloadName.slice(0, -4);
        }
      } else {
        const blob = await driveRes.blob();
        dataUrl = URL.createObjectURL(blob);
      }

      const downloadLink = document.createElement('a');
      downloadLink.href = dataUrl;
      downloadLink.download = downloadName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      
      if (dataUrl.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(dataUrl), 1000);
      }
      
      // Reset decryption state
      setDecryptionKey('');
      setIsDecryptModalOpen(false);
      setFileToDecrypt(null);
    } catch (error) {
      console.error(error);
      alert('Download failed. Please check drive access.');
    } finally {
      setDownloading(null);
      setProcessingStatus(null);
    }
  };
 
  const handlePreview = async (file: any) => {
    if (!accessToken) {
      alert('Please connect Google Drive.');
      return;
    }

    if (file.isEncrypted && !decryptionKey) {
      // Use encryptionKey as default if set
      if (encryptionKey) {
        setDecryptionKey(encryptionKey);
        (file as any)._pendingPreview = true;
        return;
      }
      setFileToDecrypt(file);
      setIsDecryptModalOpen(true);
      // We'll mark that we want to preview after decryption
      (file as any)._intent = 'preview';
      return;
    }

    setDownloading(file.id);
    try {
      const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.driveId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });

      if (!driveRes.ok) {
        if (driveRes.status === 401) {
          logoutDrive();
          throw new Error('Google Drive session expired. Please connect again.');
        }
        throw new Error('Drive download failed');
      }

      let dataUrl: string;
      let displayName = file.name;

      if (file.isEncrypted) {
        setProcessingStatus('Downloading and Decrypting...');
        const encryptedText = await driveRes.text();
        
        // Give UI chance to show status
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const decrypted = decryptFile(encryptedText, decryptionKey);
        setProcessingStatus(null);
        
        if (!decrypted) {
          alert('Incorrect Master Key!');
          setDownloading(null);
          return;
        }
        
        if (decrypted.startsWith('data:')) {
          dataUrl = decrypted;
        } else {
          // If it's not a data URL, treat as raw content
          const blob = new Blob([decrypted], { type: file.type || 'application/octet-stream' });
          dataUrl = URL.createObjectURL(blob);
        }

        if (displayName.toLowerCase().endsWith('.enc')) {
          displayName = displayName.slice(0, -4);
        }
      } else {
        const blob = await driveRes.blob();
        dataUrl = URL.createObjectURL(blob);
      }

      // If it's a text file, load the text content
      if (file.type.includes('text') || file.type.includes('json') || displayName.endsWith('.txt')) {
        try {
          const textRes = await fetch(dataUrl);
          const text = await textRes.text();
          setPreviewText(text);
        } catch (e) {
          console.error("Text load failed:", e);
          setPreviewText("Failed to load text content.");
        }
      } else {
        setPreviewText(null);
      }

      setPreviewData({ url: dataUrl, name: displayName, type: file.type });
      setIsPreviewOpen(true);
      
      // Clean up intent and key
      setDecryptionKey('');
      setIsDecryptModalOpen(false);
      setFileToDecrypt(null);
    } catch (error) {
      console.error(error);
      alert('Failed to load preview.');
    } finally {
      setDownloading(null);
      setProcessingStatus(null);
    }
  };
 
  useEffect(() => {
    if (decryptionKey && fileToDecrypt) {
      if ((fileToDecrypt as any)._pendingDownload) {
        handleDownload(fileToDecrypt);
        (fileToDecrypt as any)._pendingDownload = false;
      } else if ((fileToDecrypt as any)._pendingPreview) {
        handlePreview(fileToDecrypt);
        (fileToDecrypt as any)._pendingPreview = false;
      }
    }
  }, [decryptionKey]);

  const handleUpdateMasterKey = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If a key is already set, verify old key
    if (profile?.hasMasterKey && oldKeyInput !== encryptionKey) {
      alert('Incorrect old master key!');
      return;
    }

    if (!newKeyInput) {
      alert('Please provide a new master key!');
      return;
    }

    if (newKeyInput !== confirmKeyInput) {
      alert('New key and confirmation key do not match!');
      return;
    }

    setEncryptionKey(newKeyInput);
    sessionStorage.setItem('vault_master_key', newKeyInput);
    await updateUserProfile({ hasMasterKey: true });
    setIsSettingsOpen(false);
    setOldKeyInput('');
    setNewKeyInput('');
    setConfirmKeyInput('');
    alert('Master key updated successfully.');
  };

  const handleDecryptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decryptionKey) return;
    
    if ((fileToDecrypt as any)._intent === 'preview') {
      handlePreview(fileToDecrypt);
    } else {
      handleDownload(fileToDecrypt);
    }
  };

  const handleDelete = async (file: any) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;
    try {
      // 1. Delete from Firestore first (this removes it from UI immediately due to onSnapshot)
      try {
        await deleteDoc(doc(db, 'files', file.id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `files/${file.id}`);
      }
      
      // 2. Attempt to delete from Google Drive if we have access
      if (accessToken && file.driveId) {
        try {
          const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files/${file.driveId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          if (driveRes.status === 401) {
            logoutDrive();
          }
        } catch (driveErr) {
          console.error("Drive deletion failed:", driveErr);
          // We don't throw here because the reference is already gone from Firestore
        }
      }

      // 3. Log the action
      try {
        await addDoc(collection(db, 'logs'), {
          userId: user!.uid,
          action: 'DELETE',
          details: `Removed file from Vault: ${file.name}`,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'logs');
      }
      fetchDriveQuota();
    } catch (error: any) {
      console.error(error);
      alert('Failed to delete file.');
    }
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

  const EmptyState = () => (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl p-12 border border-dashed border-gray-200 flex flex-col items-center text-center shadow-sm"
    >
      <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
        <Cloud className="w-10 h-10 text-gray-300" />
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome, your Vault is empty!</h3>
      <p className="text-gray-500 max-w-md mb-8 leading-relaxed">
        Follow these steps to store your important files encrypted in your Google Drive.
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-3xl">
        <div className="flex flex-col items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 font-bold ${accessToken ? 'bg-green-500 text-white' : 'bg-black text-white'}`}>1</div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">STEP 1</p>
          <p className="text-[13px] font-semibold text-gray-700">Connect Google Drive</p>
          {!accessToken && (
            <button 
              onClick={handleDriveAction}
              className="mt-3 text-xs font-bold text-blue-600 hover:underline"
            >
              Do it now →
            </button>
          )}
          {accessToken && <CheckCircle2 className="mt-3 w-5 h-5 text-green-500" />}
        </div>
        
        <div className="flex flex-col items-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 font-bold ${profile?.hasMasterKey ? 'bg-green-500 text-white' : 'bg-black text-white'}`}>2</div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">STEP 2</p>
          <p className="text-[13px] font-semibold text-gray-700">Set Master Key</p>
          {!profile?.hasMasterKey && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="mt-3 text-xs font-bold text-blue-600 hover:underline"
            >
              Go to Settings →
            </button>
          )}
          {profile?.hasMasterKey && <CheckCircle2 className="mt-3 w-5 h-5 text-green-500" />}
        </div>

        <div className="flex flex-col items-center">
          <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center mb-3 font-bold">3</div>
          <p className="text-xs font-bold text-gray-400 uppercase mb-2">STEP 3</p>
          <p className="text-[13px] font-semibold text-gray-700">Start Uploading</p>
          <button 
            onClick={() => setIsUploadOpen(true)}
            disabled={!accessToken || !profile?.hasMasterKey}
            className="mt-3 bg-gray-900 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-black transition-all disabled:opacity-30"
          >
            Upload Now
          </button>
        </div>
      </div>
    </motion.div>
  );

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-blue-500" />;
    if (type === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
    return <File className="w-5 h-5 text-gray-500" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (isNaN(bytes)) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const sizeIndex = Math.min(i, sizes.length - 1);
    return parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(2)) + ' ' + sizes[sizeIndex];
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Processing Status Overlay */}
      <AnimatePresence>
        {processingStatus && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 text-center"
          >
            <div className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-2xl flex flex-col items-center">
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{processingStatus}</h3>
              <p className="text-xs text-gray-500 leading-relaxed font-medium">
                Large files might take some time for decryption. Please do not close this page.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-8 py-3 sm:py-4 flex flex-col sm:flex-row items-center gap-4 sm:justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <div className="bg-black p-2 rounded-xl">
              <Shield className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">Files.M</span>
          </div>
          
          {/* Mobile logout and drive shortcut can go here in the future if needed */}
          <div className="flex sm:hidden items-center gap-2">
            <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 bg-gray-100 rounded-lg"
              >
                <Settings className="w-4 h-4 text-gray-500" />
            </button>
            <button onClick={logout} className="p-2 bg-red-50 text-red-500 rounded-lg">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="w-full sm:flex-1 sm:max-w-xl sm:mx-8 order-3 sm:order-2">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search secure metadata..."
              className="w-full bg-gray-50 pl-11 pr-4 py-2.5 rounded-xl outline-none focus:ring-2 focus:ring-black/5 transition-all text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 order-2 sm:order-3">
          <div className="flex items-center gap-2">
            <button 
              onClick={handleDriveAction}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${accessToken ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <div className="flex flex-col items-start leading-tight">
                <span>{accessToken ? 'CONNECTED' : 'CONNECT DRIVE'}</span>
                {driveUser && <span className="text-[9px] font-medium opacity-70 hidden lg:inline">{driveUser.email}</span>}
              </div>
            </button>
            {accessToken && (
              <button 
                onClick={() => requestToken({ prompt: 'select_account' })}
                className="p-2 bg-gray-100 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors"
                title="Switch Account"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 bg-gray-100 rounded-lg hover:bg-black hover:text-white transition-all group"
              title="Master Key Settings"
            >
              <Settings className="w-4 h-4 text-gray-500 group-hover:text-white" />
          </button>
          <div className="h-6 w-px bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-900">{profile?.name || user?.displayName}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Node 01</p>
            </div>
            <button onClick={logout} className="p-2 bg-gray-100 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile drive status bar */}
        <button 
          onClick={handleDriveAction}
          className={`w-full sm:hidden flex items-center justify-center gap-3 py-2.5 rounded-xl text-[10px] font-bold order-4 transition-all active:scale-[0.98] ${
            accessToken ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
          }`}
        >
          <Cloud className={`w-3.5 h-3.5 ${accessToken ? 'animate-pulse' : ''}`} />
          <div className="flex flex-col items-center leading-tight">
            <span>{accessToken ? 'CONNECTED (Cloud Sync ON)' : 'CONNECT DRIVE (Offline)'}</span>
            {accessToken && driveUser && (
              <span className="text-[8px] font-medium opacity-80 mt-0.5">{driveUser.email}</span>
            )}
          </div>
        </button>
      </nav>

      <AnimatePresence>
        {driveError && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500 text-white overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-8 py-3 flex items-center justify-between text-xs sm:text-sm font-bold">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{driveError}</span>
              </div>
              <button 
                onClick={logoutDrive}
                className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors border border-white/20"
              >
                Disconnect
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isDriveApiDisabled && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl text-center border border-gray-100"
          >
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Cloud className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">One Important Step Remaining!</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Follow these steps to store your files in Google Drive:
            </p>
            
            <div className="text-left space-y-4 mb-8">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">1</div>
                <p className="text-sm text-gray-700">Click the <b>"Enable API"</b> button below to open a new page.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">2</div>
                <p className="text-sm text-gray-700">Press the blue <b>"ENABLE"</b> button on that page.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-black text-white text-xs flex items-center justify-center flex-shrink-0 font-bold">3</div>
                <p className="text-sm text-gray-700">Return to this page after 1 minute and click <b>"Refresh"</b>.</p>
              </div>
            </div>
            
            <div className="flex flex-col gap-4">
              <a 
                href={driveApiEnableUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
              >
                Enable Google Drive API
                <RefreshCw className="w-4 h-4" />
              </a>

              <button 
                onClick={retestDriveApi}
                disabled={isVerifyingApi}
                className="mt-2 py-3 border-2 border-gray-100 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
              >
                {isVerifyingApi ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  "Refresh Now"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <main className="p-4 sm:p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-10">
          {[
            { label: 'Total Files', value: files.length, icon: Layers, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Free Storage', value: driveQuota ? (driveQuota.limit ? `${formatSize(Math.max(0, parseInt(driveQuota.limit) - parseInt(driveQuota.usage)))} Free` : 'Unlimited') : formatSize(files.reduce((acc, f) => acc + f.size, 0)), icon: HardDrive, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'Security', value: files.filter(f => f.isEncrypted).length > 0 ? 'AES-256' : 'Standard', icon: Lock, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Audit', value: logs.length, icon: Activity, color: 'text-orange-600', bg: 'bg-orange-50', onClick: () => setIsLogsOpen(true) },
          ].map((stat, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -2 }}
              onClick={stat.onClick}
              className={`bg-white p-4 sm:p-6 rounded-2xl border border-gray-100 cursor-pointer shadow-sm transition-all ${stat.onClick ? 'hover:border-orange-200' : ''}`}
            >
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-4">
                <div className={`${stat.bg} ${stat.color} p-1.5 sm:p-2 rounded-lg`}>
                  <stat.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest truncate">{stat.label}</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-gray-900 truncate">{stat.value}</p>
            </motion.div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900">Vault Assets</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex-1 sm:flex-none p-2.5 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 transition-all active:scale-95 text-gray-500 disabled:opacity-50 shadow-sm flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button 
              onClick={() => setIsUploadOpen(true)}
              className="flex-3 sm:flex-none flex items-center justify-center gap-2 bg-black text-white px-4 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-gray-800 transition-all active:scale-95 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Upload File
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <AnimatePresence>
            {files.length === 0 ? (
              <div className="col-span-full">
                <EmptyState />
              </div>
            ) : filteredFiles.map((file) => (
              <motion.div
                key={file.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white border border-gray-100 hover:border-black/5 rounded-2xl p-5 hover:shadow-lg transition-all group relative overflow-hidden"
              >
                {file.isEncrypted && (
                  <div className="absolute top-0 right-0 p-2">
                    <div className="bg-amber-50 text-amber-600 p-1 rounded-md">
                      <Lock className="w-3 h-3" />
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between mb-4">
                  <div className="bg-gray-50 p-3 rounded-xl group-hover:bg-black group-hover:text-white transition-colors">
                    {getFileIcon(file.type)}
                  </div>
                  <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handlePreview(file)}
                      className="flex items-center gap-1 p-2 bg-gray-50 sm:bg-transparent hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                      title="Preview"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="text-[10px] font-bold sm:hidden">View</span>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(file);
                      }} 
                      className="p-2 bg-red-50/50 sm:bg-transparent hover:bg-red-50 rounded-lg text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <h3 className="font-bold text-sm text-gray-900 mb-1 truncate">{file.name}</h3>
                <div className="flex items-center gap-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <span>{formatSize(file.size)}</span>
                  <span>•</span>
                  <span className={`flex items-center gap-1 ${file.isEncrypted ? 'text-amber-600' : 'text-gray-400'}`}>
                    {file.isEncrypted ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                    {file.isEncrypted ? 'Encrypted' : 'Standard'}
                  </span>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-300">
                    {file.createdAt?.toDate ? file.createdAt.toDate().toLocaleDateString() : new Date(file.createdAt || Date.now()).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleDownload(file)}
                      disabled={downloading === file.id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50 ${file.isEncrypted ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-gray-50 text-gray-600 hover:bg-black hover:text-white'}`}
                    >
                      {downloading === file.id ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          {file.isEncrypted ? 'Decrypt & Download' : 'Download'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredFiles.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
              <Layers className="w-12 h-12 text-gray-200 mb-4" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Vault is currently empty</p>
            </div>
          )}
        </div>
      </main>

      {/* Preview Modal */}
      <AnimatePresence>
        {isPreviewOpen && previewData && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsPreviewOpen(false);
                if (!fileToDecrypt?.isEncrypted) URL.revokeObjectURL(previewData.url);
                setPreviewData(null);
                setPreviewText(null);
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-5xl h-[85vh] sm:h-[90vh] bg-white rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-3 sm:p-4 border-b border-gray-100 flex items-center justify-between bg-white z-10">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="bg-black text-white p-1.5 sm:p-2 rounded-lg">
                    <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-xs sm:text-sm truncate max-w-[150px] sm:max-w-xs">{previewData.name}</h3>
                    <p className="text-[8px] sm:text-[10px] text-gray-400 font-bold uppercase tracking-wider">Decrypted View</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewData.url;
                      link.download = previewData.name;
                      link.click();
                    }}
                    className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => {
                      setIsPreviewOpen(false);
                      setPreviewData(null);
                    }} 
                    className="p-1.5 sm:p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-gray-50 flex items-center justify-center p-4 sm:p-8 overflow-hidden">
                {previewData.type.startsWith('image/') ? (
                  <div className="w-full h-full flex items-center justify-center p-4">
                    <img 
                      src={previewData.url} 
                      alt="Preview" 
                      className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    />
                  </div>
                ) : previewData.type === 'application/pdf' ? (
                  <iframe 
                    src={previewData.url} 
                    className="w-full h-full rounded-xl shadow-lg border border-gray-200"
                    title="PDF Preview"
                  />
                ) : previewText !== null ? (
                  <div className="w-full h-full bg-white rounded-2xl p-8 shadow-inner border border-gray-100 overflow-auto">
                    <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {previewText}
                    </pre>
                  </div>
                ) : (
                  <div className="w-full h-full bg-white rounded-2xl flex flex-col items-center justify-center text-center p-10 border border-gray-100">
                    <div className="bg-gray-100 p-6 rounded-3xl mb-4">
                      <FileText className="w-16 h-16 text-gray-400" />
                    </div>
                    <h4 className="text-lg font-bold text-gray-900 mb-2">Preview Not Available</h4>
                    <p className="text-sm text-gray-500 max-w-xs mx-auto">
                      Direct preview is not possible for this file type. Please download the file to view it.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Decrypt Modal */}
      <AnimatePresence>
        {isDecryptModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsDecryptModalOpen(false);
                setFileToDecrypt(null);
                setDecryptionKey('');
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-amber-100"
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="bg-amber-50 text-amber-600 p-3 sm:p-4 rounded-2xl mb-4">
                  <Lock className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Decrypt File</h2>
                <p className="text-[10px] sm:text-xs text-gray-400 font-medium mt-1 truncate w-full px-4">
                  {fileToDecrypt?.name}
                </p>
              </div>

              <form onSubmit={handleDecryptionSubmit} className="space-y-4">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-gray-400 group-focus-within:text-black transition-colors" />
                  </div>
                  <input
                    type="password"
                    autoFocus
                    value={decryptionKey}
                    onChange={(e) => setDecryptionKey(e.target.value)}
                    placeholder="Enter Master Encryption Key"
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none transition-all placeholder:text-gray-300"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDecryptModalOpen(false);
                      setFileToDecrypt(null);
                      setDecryptionKey('');
                    }}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!decryptionKey || downloading === fileToDecrypt?.id}
                    className="flex-[2] bg-amber-500 text-white py-3 rounded-xl text-sm font-bold hover:bg-amber-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    {downloading === fileToDecrypt?.id ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" />
                        Decrypt Now
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Activities Log Modal */}
      <AnimatePresence>
        {isLogsOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="relative w-full max-w-lg h-[80vh] bg-white rounded-3xl p-8 shadow-2xl flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-50 text-orange-600 p-2 rounded-lg">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h2 className="text-xl font-bold">Activity Audit</h2>
                </div>
                <button onClick={() => setIsLogsOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {logs.map((log) => (
                  <div key={log.id} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest ${log.action === 'DELETE' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        {log.action}
                      </span>
                      <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleTimeString() : new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-700">{log.details}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUploadOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl"
            >
              <h2 className="text-2xl font-bold mb-2">Secure Upload</h2>
              <p className="text-sm text-gray-500 mb-8 font-medium">Files are encrypted on your device before they are uploaded.</p>

              <form onSubmit={handleUpload} className="space-y-6">
                <div className="relative group divide-y divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden bg-gray-50">
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <div className="p-8 flex flex-col items-center justify-center text-center">
                    <Plus className="w-8 h-8 text-gray-300 group-hover:text-black mb-3 transition-colors" />
                    <p className="text-sm font-bold text-gray-900 truncate max-w-full">
                      {selectedFile ? selectedFile.name : 'Select File'}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                      {selectedFile ? formatSize(selectedFile.size) : 'Ready for protection'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedFile?.name.toLowerCase().endsWith('.enc') && (
                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-900">Encrypted file detected!</p>
                        <p className="text-[10px] text-amber-700 font-medium">This is already an encrypted (.enc) file. It will be stored in your vault and will require a password to open.</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-gray-400 group-focus-within:text-black transition-colors" />
                    </div>
                    <input
                      type="password"
                      value={encryptionKey}
                      onChange={(e) => setEncryptionKey(e.target.value)}
                      placeholder="Secret Encryption Key (Master Key)"
                      className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 outline-none transition-all"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    {selectedFile?.name.toLowerCase().endsWith('.enc') ? 'Remember the correct key for this file' : 'File will be encrypted before upload'}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="w-full bg-black text-white py-4 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-30 flex items-center justify-center gap-3"
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="text-[10px] font-mono">{uploadProgress}%</span>
                    </div>
                  ) : <Shield className="w-5 h-5" />}
                  {uploading ? 'Uploading...' : 'Upload Now'}
                </button>
              </form>
              {uploading && (
                <div className="mt-4 h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-black"
                  />
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-gray-100"
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="bg-gray-50 text-black p-4 rounded-2xl mb-4">
                  <Settings className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Security Settings</h2>
                <p className="text-xs text-gray-400 font-medium mt-1">
                  Set your master encryption key
                </p>
              </div>

              <form onSubmit={handleUpdateMasterKey} className="space-y-4">
                {profile?.hasMasterKey && (
                  <div className="space-y-1">
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Unlock className={`h-4 w-4 transition-colors ${
                          oldKeyInput === encryptionKey ? 'text-green-500' : 
                          oldKeyInput ? 'text-red-500' : 'text-gray-400'
                        }`} />
                      </div>
                      <input
                        type="password"
                        required
                        value={oldKeyInput}
                        onChange={(e) => setOldKeyInput(e.target.value)}
                        placeholder="Old Master Key"
                        className={`block w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl text-sm outline-none transition-all placeholder:text-gray-300 ${
                          oldKeyInput === encryptionKey 
                            ? 'border-green-500 ring-2 ring-green-500/10' 
                            : oldKeyInput 
                              ? 'border-red-500 ring-2 ring-red-500/10' 
                              : 'border-gray-200 focus:ring-2 focus:ring-black/5'
                        }`}
                      />
                    </div>
                    {oldKeyInput && oldKeyInput !== encryptionKey && (
                      <p className="text-[10px] text-red-500 font-bold px-1">Old key is incorrect!</p>
                    )}
                    {oldKeyInput === encryptionKey && (
                      <p className="text-[10px] text-green-600 font-bold px-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Old key verified
                      </p>
                    )}
                  </div>
                )}
                
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value)}
                    placeholder="New Master Key"
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 outline-none transition-all placeholder:text-gray-300"
                  />
                </div>

                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <CheckCircle2 className="h-4 w-4 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmKeyInput}
                    onChange={(e) => setConfirmKeyInput(e.target.value)}
                    placeholder="Confirm New Key"
                    className="block w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-black/5 outline-none transition-all placeholder:text-gray-300"
                  />
                </div>
                
                <p className="text-[10px] text-gray-400 bg-gray-50 p-3 rounded-lg flex gap-2">
                  <Shield className="w-4 h-4 shrink-0" />
                  Changing your master key means you'll need the original key to download files encrypted with it.
                </p>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSettingsOpen(false);
                      setOldKeyInput('');
                      setNewKeyInput('');
                      setConfirmKeyInput('');
                    }}
                    className="flex-1 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all font-mono uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-black text-white py-3 rounded-xl text-sm font-bold hover:bg-gray-800 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Update Key
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
