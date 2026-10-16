import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  direction?: 'ltr' | 'rtl';
}

export function Input({ label, error, className = '', direction = 'rtl', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <input
        dir={direction}
        className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-all duration-150 bg-surface text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 border-border shadow-[inset_0_1px_2px_rgba(58,45,125,0.04)] ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  );
}

interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'label'> {
  label?: string;
  error?: string;
  showStrength?: boolean;
}

export function PasswordInput({ label, error, showStrength, className = '', ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={props.id} className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          dir="rtl"
          className={`w-full rounded-lg border px-4 py-2.5 text-sm transition-all duration-150 bg-surface text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:ring-2 focus:ring-brand-700/20 focus:border-brand-700 border-border shadow-[inset_0_1px_2px_rgba(58,45,125,0.04)] pr-10 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20' : ''} ${className}`}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showStrength && props.value && typeof props.value === 'string' && props.value.length > 0 && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              props.value.length < 6
                ? 'w-1/4 bg-rose-400'
                : props.value.length < 8
                  ? 'w-2/4 bg-amber-400'
                  : 'w-full bg-emerald-500'
            }`}
          />
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-rose-600 font-medium">{error}</p>}
    </div>
  );
}
