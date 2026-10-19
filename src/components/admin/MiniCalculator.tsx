import React, { useEffect, useRef, useState } from 'react';
import { X, Delete, Equal, Copy, Check } from 'lucide-react';

/**
 * The little calculator behind the calculator icon in the header and in POS.
 *
 * It is deliberately a plain four-function pad with percent and sign flip —
 * what a counter actually needs while ringing up a sale — and it takes keyboard
 * input too, so the operator can type a sum without reaching for the mouse.
 * The running tape shows the last few sums; "Copy" puts the result on the
 * clipboard so it can go straight into a price or discount field.
 */

type Op = '+' | '−' | '×' | '÷' | null;

interface MiniCalculatorProps {
  open: boolean;
  onClose: () => void;
  /** Where to anchor the panel; POS opens it centred, the header drops it below */
  variant?: 'popover' | 'centered';
  currency?: string;
}

const formatDisplay = (value: string): string => {
  if (value === 'Error') return value;
  const [whole, fraction] = value.split('.');
  const grouped = Number(whole || 0).toLocaleString('en-US');
  return fraction !== undefined ? `${grouped}.${fraction}` : grouped;
};

export const MiniCalculator: React.FC<MiniCalculatorProps> = ({
  open,
  onClose,
  variant = 'popover',
  currency = '৳',
}) => {
  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<number | null>(null);
  const [operation, setOperation] = useState<Op>(null);
  /** true right after an operator, so the next digit starts a fresh number */
  const [fresh, setFresh] = useState(true);
  const [tape, setTape] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const compute = (left: number, right: number, op: Op): number => {
    switch (op) {
      case '+':
        return left + right;
      case '−':
        return left - right;
      case '×':
        return left * right;
      case '÷':
        return right === 0 ? NaN : left / right;
      default:
        return right;
    }
  };

  const inputDigit = (digit: string) => {
    setDisplay((current) => {
      if (fresh || current === '0') return digit;
      if (current.replace(/[^0-9]/g, '').length >= 12) return current;
      return current + digit;
    });
    setFresh(false);
  };

  const inputDot = () => {
    setDisplay((current) => {
      if (fresh) return '0.';
      return current.includes('.') ? current : `${current}.`;
    });
    setFresh(false);
  };

  const chooseOp = (op: Exclude<Op, null>) => {
    const value = Number(display);
    if (stored !== null && operation && !fresh) {
      const result = compute(stored, value, operation);
      setStored(result);
      setDisplay(Number.isFinite(result) ? String(Number(result.toFixed(6))) : 'Error');
    } else {
      setStored(value);
    }
    setOperation(op);
    setFresh(true);
  };

  const equals = () => {
    if (stored === null || !operation) return;
    const right = Number(display);
    const result = compute(stored, right, operation);
    const line = `${stored} ${operation} ${right} = ${
      Number.isFinite(result) ? Number(result.toFixed(6)) : 'Error'
    }`;
    setTape((current) => [line, ...current].slice(0, 4));
    setDisplay(Number.isFinite(result) ? String(Number(result.toFixed(6))) : 'Error');
    setStored(null);
    setOperation(null);
    setFresh(true);
  };

  const clearAll = () => {
    setDisplay('0');
    setStored(null);
    setOperation(null);
    setFresh(true);
  };

  const backspace = () => {
    setDisplay((current) => {
      if (fresh || current.length <= 1 || current === 'Error') return '0';
      return current.slice(0, -1);
    });
  };

  const percent = () => {
    // 200 + 15% reads as "15% of 200", which is what a shop counter means
    const value = Number(display);
    if (stored !== null && (operation === '+' || operation === '−')) {
      setDisplay(String((stored * value) / 100));
    } else {
      setDisplay(String(value / 100));
    }
    setFresh(false);
  };

  const flipSign = () => setDisplay((current) => (current.startsWith('-') ? current.slice(1) : `-${current}`));

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — the number is on screen to read anyway */
    }
  };

  /* Keyboard: digits, operators, Enter, Backspace, Escape */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const { key } = event;
      if (/^[0-9]$/.test(key)) {
        inputDigit(key);
      } else if (key === '.') {
        inputDot();
      } else if (key === '+') {
        chooseOp('+');
      } else if (key === '-') {
        chooseOp('−');
      } else if (key === '*' || key.toLowerCase() === 'x') {
        chooseOp('×');
      } else if (key === '/') {
        event.preventDefault();
        chooseOp('÷');
      } else if (key === 'Enter' || key === '=') {
        event.preventDefault();
        equals();
      } else if (key === 'Backspace') {
        backspace();
      } else if (key === 'Escape') {
        onClose();
      } else if (key === '%') {
        percent();
      } else {
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* Click-away, for the header popover */
  useEffect(() => {
    if (!open || variant !== 'popover') return;
    const onDown = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose();
    };
    // next tick, so the click that opened it does not immediately close it
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, variant, onClose]);

  if (!open) return null;

  /** The pad. Colour marks what a key does: digits neutral, operators tinted,
      clear in red, equals in the brand colour. */
  const keys: Array<{
    label: React.ReactNode;
    onPress: () => void;
    tone: 'digit' | 'op' | 'clear' | 'equals' | 'util';
    span?: boolean;
  }> = [
    { label: 'AC', onPress: clearAll, tone: 'clear' },
    { label: '±', onPress: flipSign, tone: 'util' },
    { label: '%', onPress: percent, tone: 'util' },
    { label: '÷', onPress: () => chooseOp('÷'), tone: 'op' },

    { label: '7', onPress: () => inputDigit('7'), tone: 'digit' },
    { label: '8', onPress: () => inputDigit('8'), tone: 'digit' },
    { label: '9', onPress: () => inputDigit('9'), tone: 'digit' },
    { label: '×', onPress: () => chooseOp('×'), tone: 'op' },

    { label: '4', onPress: () => inputDigit('4'), tone: 'digit' },
    { label: '5', onPress: () => inputDigit('5'), tone: 'digit' },
    { label: '6', onPress: () => inputDigit('6'), tone: 'digit' },
    { label: '−', onPress: () => chooseOp('−'), tone: 'op' },

    { label: '1', onPress: () => inputDigit('1'), tone: 'digit' },
    { label: '2', onPress: () => inputDigit('2'), tone: 'digit' },
    { label: '3', onPress: () => inputDigit('3'), tone: 'digit' },
    { label: '+', onPress: () => chooseOp('+'), tone: 'op' },

    { label: '0', onPress: () => inputDigit('0'), tone: 'digit', span: true },
    { label: '.', onPress: inputDot, tone: 'digit' },
    { label: <Equal className="w-4 h-4" />, onPress: equals, tone: 'equals' },
  ];

  const toneStyle: Record<string, React.CSSProperties> = {
    digit: { background: 'var(--ds-surface)', color: 'var(--ds-text)', border: '1px solid var(--ds-border)' },
    op: {
      background: 'color-mix(in srgb, var(--ds-indigo) 12%, transparent)',
      color: 'var(--ds-indigo)',
      border: '1px solid color-mix(in srgb, var(--ds-indigo) 22%, transparent)',
    },
    util: {
      background: 'color-mix(in srgb, var(--ds-amber) 14%, transparent)',
      color: 'var(--ds-warning-text)',
      border: '1px solid color-mix(in srgb, var(--ds-amber) 26%, transparent)',
    },
    clear: {
      background: 'var(--ds-danger-soft)',
      color: 'var(--ds-danger-text)',
      border: '1px solid color-mix(in srgb, var(--ds-danger) 22%, transparent)',
    },
    equals: { background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary)' },
  };

  const body = (
    <div
      ref={panel}
      className="ds-scale-in overflow-hidden"
      style={{
        width: 268,
        background: 'var(--ds-surface)',
        borderRadius: 'var(--ds-r-xl)',
        border: '1px solid var(--ds-border)',
        boxShadow: 'var(--ds-shadow-xl)',
      }}
    >
      {/* Head */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: 'var(--ds-surface-2)', borderBottom: '1px solid var(--ds-border)' }}
      >
        <span className="font-bold" style={{ fontSize: 'var(--ds-fs-sm)', color: 'var(--ds-text-soft)' }}>
          Calculator
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={copyResult}
            title="Copy result"
            className="inline-flex items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-[var(--ds-surface-3)]"
            style={{ width: 26, height: 26, color: copied ? 'var(--ds-success)' : 'var(--ds-text-muted)' }}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            aria-label="Close calculator"
            className="inline-flex items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-[var(--ds-surface-3)]"
            style={{ width: 26, height: 26, color: 'var(--ds-text-muted)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Display */}
      <div className="px-3 pt-3 pb-2.5" style={{ background: 'var(--ds-gray-900)' }}>
        <div
          className="text-right truncate"
          style={{ fontSize: 'var(--ds-fs-2xs)', color: 'rgba(255,255,255,0.45)', minHeight: 14 }}
        >
          {stored !== null && operation ? `${formatDisplay(String(stored))} ${operation}` : tape[0] || ''}
        </div>
        <div
          className="text-right font-bold ds-num truncate"
          style={{ fontSize: 26, color: '#fff', lineHeight: 1.25 }}
        >
          {display === 'Error' ? 'Error' : formatDisplay(display)}
        </div>
      </div>

      {/* Pad */}
      <div className="grid grid-cols-4 gap-1.5 p-2.5" style={{ background: 'var(--ds-surface-2)' }}>
        {keys.map((key, index) => (
          <button
            key={index}
            onClick={key.onPress}
            className={`inline-flex items-center justify-center font-semibold cursor-pointer transition-all active:scale-95 ${
              key.span ? 'col-span-2' : ''
            }`}
            style={{
              height: 42,
              borderRadius: 'var(--ds-r-md)',
              fontSize: 'var(--ds-fs-lg)',
              ...toneStyle[key.tone],
            }}
          >
            {key.label}
          </button>
        ))}
      </div>

      {/* Backspace + currency hint */}
      <div
        className="flex items-center justify-between px-2.5 py-2"
        style={{ borderTop: '1px solid var(--ds-border)' }}
      >
        <span style={{ fontSize: 'var(--ds-fs-2xs)', color: 'var(--ds-text-faint)' }}>
          {currency} · Works with your keyboard
        </span>
        <button
          onClick={backspace}
          className="inline-flex items-center gap-1 px-2 py-1 font-semibold rounded-md cursor-pointer transition-colors hover:bg-[var(--ds-surface-3)]"
          style={{ fontSize: 'var(--ds-fs-xs)', color: 'var(--ds-text-soft)' }}
        >
          <Delete className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );

  if (variant === 'centered') {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 'var(--ds-z-modal)' as any }}
      >
        <div
          className="absolute inset-0 ds-fade-in"
          style={{ background: 'var(--ds-overlay)' }}
          onClick={onClose}
        />
        <div className="relative">{body}</div>
      </div>
    );
  }

  return (
    <div className="absolute right-0 top-full mt-2" style={{ zIndex: 'var(--ds-z-dropdown)' as any }}>
      {body}
    </div>
  );
};
