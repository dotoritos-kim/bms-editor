/**
 * EditorContextMenu
 *
 * 차트 에디터 우클릭 컨텍스트 메뉴
 * 노트 편집 작업 (복사, 붙여넣기, 삭제, 타입 변경 등)
 *
 * Uses plain HTML/CSS instead of Radix UI context-menu for standalone usage.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Copy,
  Clipboard,
  Scissors,
  Trash2,
  MousePointer2,
  Eye,
  EyeOff,
  Bomb,
  Music,
} from 'lucide-react';
import type { NoteType } from '@rhythm-archive/bms-core';

interface EditorContextMenuProps {
  children: React.ReactNode;
  /** 선택된 노트 수 */
  selectedCount: number;
  /** 클립보드에 노트가 있는지 */
  hasClipboard: boolean;
  /** 콜백: 복사 */
  onCopy: () => void;
  /** 콜백: 잘라내기 */
  onCut: () => void;
  /** 콜백: 붙여넣기 */
  onPaste: () => void;
  /** 콜백: 삭제 */
  onDelete: () => void;
  /** 콜백: 전체 선택 */
  onSelectAll: () => void;
  /** 콜백: 선택 해제 */
  onClearSelection: () => void;
  /** 콜백: 노트 타입 변경 */
  onChangeType?: (newType: NoteType) => void;
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  fontSize: 13,
  cursor: 'pointer',
  border: 'none',
  background: 'none',
  width: '100%',
  textAlign: 'left',
  color: '#e5e7eb',
  borderRadius: 4,
};

const menuItemDisabledStyle: React.CSSProperties = {
  ...menuItemStyle,
  opacity: 0.4,
  cursor: 'not-allowed',
};

const shortcutStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  color: '#9ca3af',
};

const separatorStyle: React.CSSProperties = {
  height: 1,
  background: '#333',
  margin: '4px 0',
};

export const EditorContextMenu = React.memo(function EditorContextMenu({
  children,
  selectedCount,
  hasClipboard,
  onCopy,
  onCut,
  onPaste,
  onDelete,
  onSelectAll,
  onClearSelection,
  onChangeType,
}: EditorContextMenuProps) {
  const hasSelection = selectedCount > 0;
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showTypeSubmenu, setShowTypeSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowTypeSubmenu(false);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPos(null);
    setShowTypeSubmenu(false);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!menuPos) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuPos, closeMenu]);

  const handleAction = (action: () => void) => {
    action();
    closeMenu();
  };

  return (
    <div onContextMenu={handleContextMenu} style={{ display: 'contents' }}>
      {children}
      {menuPos && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            left: menuPos.x,
            top: menuPos.y,
            zIndex: 9999,
            minWidth: 220,
            background: '#1e1e2e',
            border: '1px solid #333',
            borderRadius: 6,
            padding: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {/* Selection */}
          <button
            style={menuItemStyle}
            onMouseEnter={(e) => { (e.currentTarget.style.background = '#2a2a3e'); }}
            onMouseLeave={(e) => { (e.currentTarget.style.background = 'none'); }}
            onClick={() => handleAction(onSelectAll)}
          >
            <MousePointer2 style={{ width: 16, height: 16 }} />
            Select All
            <span style={shortcutStyle}>Ctrl+A</span>
          </button>
          {hasSelection && (
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => { (e.currentTarget.style.background = '#2a2a3e'); }}
              onMouseLeave={(e) => { (e.currentTarget.style.background = 'none'); }}
              onClick={() => handleAction(onClearSelection)}
            >
              Deselect
              <span style={shortcutStyle}>Esc</span>
            </button>
          )}

          <div style={separatorStyle} />

          {/* Clipboard */}
          <button
            style={hasSelection ? menuItemStyle : menuItemDisabledStyle}
            onMouseEnter={(e) => { if (hasSelection) e.currentTarget.style.background = '#2a2a3e'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            onClick={() => hasSelection && handleAction(onCopy)}
          >
            <Copy style={{ width: 16, height: 16 }} />
            Copy
            <span style={shortcutStyle}>Ctrl+C</span>
          </button>
          <button
            style={hasSelection ? menuItemStyle : menuItemDisabledStyle}
            onMouseEnter={(e) => { if (hasSelection) e.currentTarget.style.background = '#2a2a3e'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            onClick={() => hasSelection && handleAction(onCut)}
          >
            <Scissors style={{ width: 16, height: 16 }} />
            Cut
            <span style={shortcutStyle}>Ctrl+X</span>
          </button>
          <button
            style={hasClipboard ? menuItemStyle : menuItemDisabledStyle}
            onMouseEnter={(e) => { if (hasClipboard) e.currentTarget.style.background = '#2a2a3e'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            onClick={() => hasClipboard && handleAction(onPaste)}
          >
            <Clipboard style={{ width: 16, height: 16 }} />
            Paste
            <span style={shortcutStyle}>Ctrl+V</span>
          </button>

          <div style={separatorStyle} />

          {/* Delete */}
          <button
            style={hasSelection ? { ...menuItemStyle, color: '#ef4444' } : menuItemDisabledStyle}
            onMouseEnter={(e) => { if (hasSelection) e.currentTarget.style.background = '#2a2a3e'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            onClick={() => hasSelection && handleAction(onDelete)}
          >
            <Trash2 style={{ width: 16, height: 16 }} />
            Delete ({selectedCount})
            <span style={shortcutStyle}>Del</span>
          </button>

          {/* Note type change */}
          {hasSelection && onChangeType && (
            <>
              <div style={separatorStyle} />
              <div style={{ position: 'relative' }}>
                <button
                  style={menuItemStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; setShowTypeSubmenu(true); }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  <Music style={{ width: 16, height: 16 }} />
                  Change Note Type
                  <span style={shortcutStyle}>&rsaquo;</span>
                </button>
                {showTypeSubmenu && (
                  <div
                    style={{
                      position: 'absolute',
                      left: '100%',
                      top: 0,
                      minWidth: 180,
                      background: '#1e1e2e',
                      border: '1px solid #333',
                      borderRadius: 6,
                      padding: 4,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                    onMouseEnter={() => setShowTypeSubmenu(true)}
                    onMouseLeave={() => setShowTypeSubmenu(false)}
                  >
                    <button
                      style={menuItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      onClick={() => { onChangeType('playable'); closeMenu(); }}
                    >
                      <Eye style={{ width: 16, height: 16 }} />
                      Playable
                    </button>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      onClick={() => { onChangeType('invisible'); closeMenu(); }}
                    >
                      <EyeOff style={{ width: 16, height: 16 }} />
                      Invisible
                    </button>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      onClick={() => { onChangeType('landmine'); closeMenu(); }}
                    >
                      <Bomb style={{ width: 16, height: 16 }} />
                      Landmine
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

export default EditorContextMenu;
