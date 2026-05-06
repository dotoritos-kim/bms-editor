/**
 * useBgmAudio — BGM HTMLAudioElement 로딩 + 진행률 추적 훅
 *
 * NoteChartViewer.tsx 에서 추출된 BGM 오디오 로딩 로직.
 * 반환된 audioRef 는 재생 제어(play/pause/seek)에 사용되며,
 * cleanup 시 blob URL 을 자동으로 해제합니다.
 */
import { useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../../../utils';

export interface BgmAudioState {
  audioLoaded: boolean;
  audioLoading: boolean;
  audioError: string | null;
  audioProgress: { loaded: number; total: number };
  keysoundOnlyMode: boolean;
}

export interface UseBgmAudioReturn extends BgmAudioState {
  audioRef: React.MutableRefObject<HTMLAudioElement | null>;
}

export function useBgmAudio(
  audioUrl: string | undefined,
  maxBeat: number,
  onEnded: () => void,
): UseBgmAudioReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioLoaded, setAudioLoaded] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 });
  const [keysoundOnlyMode, setKeysoundOnlyMode] = useState(false);

  // Keep a stable ref to onEnded so the effect doesn't re-run when the callback changes
  const onEndedRef = useRef(onEnded);
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);

  useEffect(() => {
    if (!audioUrl) {
      setAudioLoaded(false);
      setAudioLoading(false);
      setAudioError(null);
      return;
    }

    setAudioLoading(true);
    setAudioLoaded(false);
    setAudioError(null);
    setAudioProgress({ loaded: 0, total: 0 });
    setKeysoundOnlyMode(false);

    let cancelled = false;
    let blobUrl: string | null = null;
    let audio: HTMLAudioElement | null = null;

    const loadAudio = async () => {
      try {
        const response = await fetch(audioUrl, { credentials: 'include' });
        if (cancelled) return;

        if (!response.ok) {
          let errorMsg = `Server error: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.message) errorMsg = errorData.message;
          } catch {
            // JSON 파싱 실패 시 기본 메시지 사용
          }
          setAudioLoading(false);
          if (errorMsg.includes('too many notes') || errorMsg.includes('too many keysounds')) {
            setKeysoundOnlyMode(true);
            setAudioError(null);
          } else {
            setAudioError(errorMsg);
          }
          return;
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('audio/')) {
          setAudioLoading(false);
          setAudioError('Invalid audio response from server');
          return;
        }

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let blob: Blob;

        if (total > 0 && response.body) {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (cancelled) { reader.cancel(); return; }
            chunks.push(value);
            loaded += value.length;
            setAudioProgress({ loaded, total });
          }
          // Note: TS lib types `Uint8Array<ArrayBufferLike>` cannot be directly
          // assigned to `BlobPart` because `ArrayBufferLike` includes
          // `SharedArrayBuffer`. fetch reader always yields non-shared buffers,
          // so a single narrowing cast (instead of the previous `as unknown as`
          // double-cast) is sufficient and preserves byteOffset/byteLength.
          blob = new Blob(chunks as BlobPart[], { type: contentType || 'audio/wav' });
        } else {
          blob = await response.blob();
        }
        if (cancelled) return;

        blobUrl = URL.createObjectURL(blob);
        audio = new Audio(blobUrl);
        audioRef.current = audio;

        const handleCanPlay = () => {
          setAudioLoading(false);
          setAudioLoaded(true);
          setAudioError(null);
        };
        const handleError = () => {
          setAudioLoading(false);
          setAudioLoaded(false);
          setAudioError('Failed to decode audio');
        };
        const handleEnded = () => {
          onEndedRef.current();
        };

        audio.addEventListener('canplaythrough', handleCanPlay);
        audio.addEventListener('error', handleError);
        audio.addEventListener('ended', handleEnded);
        audio.load();
      } catch (error: unknown) {
        if (cancelled) return;
        const errorMsg = getErrorMessage(error, 'Network error');
        setAudioLoading(false);
        setAudioError(errorMsg);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
      if (audio) {
        audio.pause();
        audio.src = '';
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      audioRef.current = null;
    };
  }, [audioUrl, maxBeat]);

  return {
    audioRef,
    audioLoaded,
    audioLoading,
    audioError,
    audioProgress,
    keysoundOnlyMode,
  };
}
