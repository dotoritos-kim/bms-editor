/**
 * EditorContextMenu
 *
 * Right-click context menu for the chart editor.
 * Note editing actions (copy, paste, delete, type change, etc.)
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
  ArrowUpToLine,
  Minus,
} from 'lucide-react';
import type { NoteType } from '@rhythm-archive/bms-core';
import { useI18n } from '../i18n';

interface EditorContextMenuProps {
  children: React.ReactNode;
  /** Number of selected notes */
  selectedCount: number;
  /** Whether the clipboard has notes */
  hasClipboard: boolean;
  /** Callback: copy */
  onCopy: () => void;
  /** Callback: cut */
  onCut: () => void;
  /** Callback: paste */
  onPaste: () => void;
  /** Callback: delete */
  onDelete: () => void;
  /** Callback: select all */
  onSelectAll: () => void;
  /** Callback: clear selection */
  onClearSelection: () => void;
  /** Callback: change note type */
  onChangeType?: (newType: NoteType) => void;
  /** Callback: turn the selected short notes into long notes */
  onConvertToLongNote?: () => void;
  /** Callback: turn the selected long notes back into short notes */
  onConvertToShortNote?: () => void;
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
  onConvertToLongNote,
  onConvertToShortNote,
}: EditorContextMenuProps) {
  const { t } = useI18n();
  const hasSelection = selectedCount > 0;
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [showTypeSubmenu, setShowTypeSubmenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // Keep the menu inside the viewport near the right/bottom edges.
    const MENU_W = 240, MENU_H = 320;
    const x = Math.max(0, Math.min(e.clientX, window.innerWidth - MENU_W));
    const y = Math.max(0, Math.min(e.clientY, window.innerHeight - MENU_H));
    setMenuPos({ x, y });
    setShowTypeSubmenu(false);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuPos(null);
    setShowTypeSubmenu(false);
  }, []);

  // Escape closes the menu
  useEffect(() => {
    if (!menuPos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [menuPos, closeMenu]);

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
            {t('contextMenu.selectAll')}
            <span style={shortcutStyle}>Ctrl+A</span>
          </button>
          {hasSelection && (
            <button
              style={menuItemStyle}
              onMouseEnter={(e) => { (e.currentTarget.style.background = '#2a2a3e'); }}
              onMouseLeave={(e) => { (e.currentTarget.style.background = 'none'); }}
              onClick={() => handleAction(onClearSelection)}
            >
              {t('contextMenu.deselect')}
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
            {t('contextMenu.copy')}
            <span style={shortcutStyle}>Ctrl+C</span>
          </button>
          <button
            style={hasSelection ? menuItemStyle : menuItemDisabledStyle}
            onMouseEnter={(e) => { if (hasSelection) e.currentTarget.style.background = '#2a2a3e'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            onClick={() => hasSelection && handleAction(onCut)}
          >
            <Scissors style={{ width: 16, height: 16 }} />
            {t('contextMenu.cut')}
            <span style={shortcutStyle}>Ctrl+X</span>
          </button>
          <button
            style={hasClipboard ? menuItemStyle : menuItemDisabledStyle}
            onMouseEnter={(e) => { if (hasClipboard) e.currentTarget.style.background = '#2a2a3e'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
            onClick={() => hasClipboard && handleAction(onPaste)}
          >
            <Clipboard style={{ width: 16, height: 16 }} />
            {t('contextMenu.paste')}
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
            {t('contextMenu.deleteCount', { count: selectedCount })}
            <span style={shortcutStyle}>Del</span>
          </button>

          {/* Long note conversion */}
          {hasSelection && (onConvertToLongNote || onConvertToShortNote) && (
            <>
              <div style={separatorStyle} />
              {onConvertToLongNote && (
                <button
                  style={menuItemStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  onClick={() => handleAction(onConvertToLongNote)}
                >
                  <ArrowUpToLine style={{ width: 16, height: 16 }} />
                  {t('contextMenu.toLongNote')}
                  <span style={shortcutStyle}>L</span>
                </button>
              )}
              {onConvertToShortNote && (
                <button
                  style={menuItemStyle}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  onClick={() => handleAction(onConvertToShortNote)}
                >
                  <Minus style={{ width: 16, height: 16 }} />
                  {t('contextMenu.toShortNote')}
                </button>
              )}
            </>
          )}

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
                  {t('contextMenu.changeNoteType')}
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
                      {t('contextMenu.types.playable')}
                    </button>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      onClick={() => { onChangeType('invisible'); closeMenu(); }}
                    >
                      <EyeOff style={{ width: 16, height: 16 }} />
                      {t('contextMenu.types.invisible')}
                    </button>
                    <button
                      style={menuItemStyle}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a3e'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      onClick={() => { onChangeType('landmine'); closeMenu(); }}
                    >
                      <Bomb style={{ width: 16, height: 16 }} />
                      {t('contextMenu.types.landmine')}
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
