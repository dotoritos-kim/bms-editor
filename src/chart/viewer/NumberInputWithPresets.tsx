/**
 * NumberInputWithPresets.tsx
 * Numeric input with preset buttons, extracted from NoteChartViewer (Stage G).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '../../utils';
import { useI18n } from '../../i18n';

export interface NumberInputWithPresetsProps {
  value: number;
  onChange: (value: number) => void;
  presets: readonly number[];
  min: number;
  max: number;
  step?: number;
  label?: string;
  suffix?: string;
  prefix?: string;
  activeColor?: string;
  allowDecimal?: boolean;
  inputWidth?: string;
}

export const NumberInputWithPresets = React.memo(function NumberInputWithPresets({
  value,
  onChange,
  presets,
  min,
  max,
  step = 0.01,
  suffix = '',
  prefix = '',
  activeColor = 'bg-cyan-500/20 text-cyan-400',
  allowDecimal = true,
  inputWidth = 'w-16',
}: NumberInputWithPresetsProps) {
  const { t } = useI18n();
  const [inputValue, setInputValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Sync when external value changes and input is not focused
  useEffect(() => {
    if (!isFocused) setInputValue(String(value));
  }, [value, isFocused]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (allowDecimal) {
      if (/^-?\d*\.?\d*$/.test(newValue)) setInputValue(newValue);
    } else {
      if (/^-?\d*$/.test(newValue)) setInputValue(newValue);
    }
  }, [allowDecimal]);

  const handleInputBlur = useCallback(() => {
    setIsFocused(false);
    let parsed = parseFloat(inputValue);
    if (isNaN(parsed)) parsed = value;
    const clamped = Math.max(min, Math.min(max, parsed));
    const stepped = Math.round(clamped / step) * step;
    const final = allowDecimal ? parseFloat(stepped.toFixed(10)) : Math.round(stepped);
    setInputValue(String(final));
    if (final !== value) onChange(final);
  }, [inputValue, value, min, max, step, allowDecimal, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setInputValue(String(value));
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newVal = Math.min(max, value + step);
      onChange(allowDecimal ? parseFloat(newVal.toFixed(10)) : Math.round(newVal));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newVal = Math.max(min, value - step);
      onChange(allowDecimal ? parseFloat(newVal.toFixed(10)) : Math.round(newVal));
    }
  }, [value, min, max, step, allowDecimal, onChange]);

  const isPresetValue = presets.includes(value as typeof presets[number]);

  return (
    <div className="flex items-center gap-1">
      {presets.map(preset => (
        <button
          key={preset}
          onClick={() => onChange(preset)}
          className={cn(
            "px-2 py-1 rounded text-xs transition-colors",
            value === preset ? activeColor : "bg-muted/50 text-muted-foreground hover:bg-muted",
          )}
        >
          {prefix}{preset}{suffix}
        </button>
      ))}
      <input
        type="text"
        value={isFocused ? inputValue : `${value}`}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          inputWidth,
          "px-2 py-1 rounded text-xs text-center transition-colors border",
          !isPresetValue && !isFocused
            ? activeColor + " border-current"
            : "bg-muted/50 text-muted-foreground border-transparent hover:border-muted-foreground/30",
          isFocused && "border-cyan-500 bg-background",
        )}
        title={t('viewer.numberInput.manualEntryTitle', { min, max })}
      />
    </div>
  );
});
