/**
 * KeysoundUploadDialog
 *
 * 키음 파일(WAV/OGG/MP3)을 편집 브랜치에 업로드하는 다이얼로그
 * 파일 선택, WAV ID 자동 할당, 업로드 + #WAV 정의 등록
 */

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Upload, X, Music, Loader2, AlertCircle } from 'lucide-react';
import { cn, getErrorMessage } from '../../utils';

const ALLOWED_EXTENSIONS = ['.wav', '.ogg', '.mp3'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

interface PendingFile {
  file: File;
  wavId: string;
  error?: string;
}

interface KeysoundUploadDialogProps {
  /** 다이얼로그 열림 상태 */
  open: boolean;
  /** 다이얼로그 닫기 콜백 */
  onClose: () => void;
  /** 업로드 완료 콜백 (WAV ID → 파일명 매핑) */
  onUploadComplete: (wavDefinitions: Array<{ id: string; filename: string }>) => void;
  /** 기존 WAV 정의 맵 (ID → 파일명) */
  existingWavDefinitions: Record<string, string>;
  /** 업로드 실행 함수 */
  onUpload: (files: Array<{ path: string; contentBase64: string }>, commitMessage: string) => Promise<void>;
  /** 업로드 중 상태 */
  isUploading?: boolean;
}

/**
 * 다음 사용 가능한 WAV ID 계산 (base-36: 01-ZZ)
 */
function getNextAvailableWavIds(existing: Record<string, string>, count: number): string[] {
  const usedIds = new Set(Object.keys(existing).map((k) => k.toUpperCase()));
  const ids: string[] = [];

  // 01부터 ZZ까지 순회 (base-36 2자리: 1-1295)
  for (let i = 1; i <= 1295 && ids.length < count; i++) {
    const id = i.toString(36).toUpperCase().padStart(2, '0');
    if (!usedIds.has(id)) {
      ids.push(id);
      usedIds.add(id);
    }
  }

  return ids;
}

/**
 * 파일을 base64로 변환
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // data:audio/wav;base64,... → base64 부분만 추출
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const KeysoundUploadDialog = React.memo(function KeysoundUploadDialog({
  open,
  onClose,
  onUploadComplete,
  existingWavDefinitions,
  onUpload,
  isUploading = false,
}: KeysoundUploadDialogProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 추가
  const handleFilesSelected = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setError(null);

      const newFiles: File[] = [];
      let totalSize = pendingFiles.reduce((sum, pf) => sum + pf.file.size, 0);

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          setError(`지원하지 않는 형식: ${file.name} (WAV/OGG/MP3만 가능)`);
          continue;
        }

        if (file.size > MAX_FILE_SIZE) {
          setError(`파일 크기 초과: ${file.name} (최대 10MB)`);
          continue;
        }

        totalSize += file.size;
        if (totalSize > MAX_TOTAL_SIZE) {
          setError('총 업로드 크기가 50MB를 초과합니다');
          break;
        }

        newFiles.push(file);
      }

      if (newFiles.length > 0) {
        const wavIds = getNextAvailableWavIds(
          {
            ...existingWavDefinitions,
            ...Object.fromEntries(pendingFiles.map((pf) => [pf.wavId, pf.file.name])),
          },
          newFiles.length
        );

        const newPending = newFiles.map((file, i) => ({
          file,
          wavId: wavIds[i] || '??',
        }));

        setPendingFiles((prev) => [...prev, ...newPending]);
      }
    },
    [pendingFiles, existingWavDefinitions]
  );

  // 파일 삭제
  const handleRemoveFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // WAV ID 변경
  const handleWavIdChange = useCallback((index: number, newId: string) => {
    setPendingFiles((prev) =>
      prev.map((pf, i) => (i === index ? { ...pf, wavId: newId.toUpperCase() } : pf))
    );
  }, []);

  // 드래그 앤 드롭
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFilesSelected(e.dataTransfer.files);
    },
    [handleFilesSelected]
  );

  // 업로드 실행
  const handleUpload = useCallback(async () => {
    if (pendingFiles.length === 0) return;
    setError(null);

    // WAV ID 중복 체크
    const idSet = new Set<string>();
    for (const pf of pendingFiles) {
      if (idSet.has(pf.wavId) || existingWavDefinitions[pf.wavId]) {
        setError(`WAV ID 중복: ${pf.wavId}`);
        return;
      }
      idSet.add(pf.wavId);
    }

    try {
      // 파일들을 base64로 변환
      const fileData = await Promise.all(
        pendingFiles.map(async (pf) => ({
          path: pf.file.name,
          contentBase64: await fileToBase64(pf.file),
        }))
      );

      await onUpload(fileData, `키음 파일 업로드 (${pendingFiles.length}개)`);

      // 성공: WAV 정의 콜백
      const wavDefs = pendingFiles.map((pf) => ({
        id: pf.wavId,
        filename: pf.file.name,
      }));
      onUploadComplete(wavDefs);

      // 초기화
      setPendingFiles([]);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, '업로드 실패'));
    }
  }, [pendingFiles, existingWavDefinitions, onUpload, onUploadComplete, onClose]);

  // 총 크기 계산
  const totalSize = useMemo(() => {
    return pendingFiles.reduce((sum, pf) => sum + pf.file.size, 0);
  }, [pendingFiles]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-lg w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Upload className="h-4 w-4" />
            키음 파일 업로드
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 드롭 영역 */}
        <div className="p-4">
          <div
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            <Music className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              파일을 드래그하거나 클릭하여 선택
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              WAV, OGG, MP3 (개별 최대 10MB, 총 50MB)
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.ogg,.mp3"
            multiple
            className="hidden"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
        </div>

        {/* 에러 표시 */}
        {error && (
          <div className="mx-4 mb-2 p-2 rounded bg-destructive/10 text-destructive text-xs flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* 파일 목록 */}
        {pendingFiles.length > 0 && (
          <div className="flex-1 overflow-y-auto px-4 min-h-0">
            <div className="space-y-1">
              {pendingFiles.map((pf, i) => (
                <div key={i} className="flex items-center gap-2 py-1 text-xs">
                  <input
                    type="text"
                    value={pf.wavId}
                    onChange={(e) => handleWavIdChange(i, e.target.value)}
                    className="w-10 px-1 py-0.5 font-mono text-center bg-muted rounded border-0 focus:ring-1 focus:ring-primary"
                    maxLength={2}
                  />
                  <span className="truncate flex-1 text-muted-foreground" title={pf.file.name}>
                    {pf.file.name}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {formatSize(pf.file.size)}
                  </span>
                  <button
                    onClick={() => handleRemoveFile(i)}
                    className="p-0.5 hover:text-destructive shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-xs text-muted-foreground">
            {pendingFiles.length}개 파일 ({formatSize(totalSize)})
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded border hover:bg-muted"
            >
              취소
            </button>
            <button
              onClick={handleUpload}
              disabled={pendingFiles.length === 0 || isUploading}
              className={cn(
                'px-3 py-1.5 text-xs rounded flex items-center gap-1',
                pendingFiles.length > 0 && !isUploading
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              )}
            >
              {isUploading && <Loader2 className="h-3 w-3 animate-spin" />}
              업로드
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default KeysoundUploadDialog;
