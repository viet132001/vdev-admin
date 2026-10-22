import React, { useLayoutEffect, useRef } from 'react';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Raw digits, e.g. "14000000" ('' when empty) */
  value: string;
  onChange: (raw: string) => void;
}

const formatVnd = (raw: string) => (raw ? Number(raw).toLocaleString('vi-VN') : '');

// Text input that displays VND with thousand separators (14.000.000) but emits raw digits
export const MoneyInput: React.FC<MoneyInputProps> = ({ value, onChange, className, ...rest }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // Number of digits left of the caret, used to restore its position after reformatting
  const caretDigitsRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const input = inputRef.current;
    const digitsBefore = caretDigitsRef.current;
    if (!input || digitsBefore === null) return;
    caretDigitsRef.current = null;
    let pos = 0;
    let seen = 0;
    while (pos < input.value.length && seen < digitsBefore) {
      if (/\d/.test(input.value[pos])) seen++;
      pos++;
    }
    input.setSelectionRange(pos, pos);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value: text, selectionStart } = e.target;
    const raw = text.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    const digitsBeforeCaret = text.slice(0, selectionStart ?? text.length).replace(/\D/g, '').length;
    caretDigitsRef.current = Math.min(digitsBeforeCaret, raw.length);
    onChange(raw);
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        {...rest}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className={className || 'form-input'}
        style={{ paddingRight: '32px', ...rest.style }}
        value={formatVnd(value)}
        onChange={handleChange}
      />
      <span style={{
        position: 'absolute',
        right: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
        pointerEvents: 'none'
      }}>đ</span>
    </div>
  );
};
