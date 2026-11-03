import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './Icon.js';

interface OverflowMenuProps {
  aiConfigured: boolean;
  aiRunning: boolean;
  onRunAi: () => void;
  /** Only when the server requires a token. */
  onChangeToken?: () => void;
}

export function OverflowMenu({ aiConfigured, aiRunning, onRunAi, onChangeToken }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && root.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="menu" ref={root}>
      <button
        type="button"
        className="icon-btn"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div className="menu-panel" role="menu" id={id}>
          {aiConfigured ? (
            <button type="button" role="menuitem" className="menu-item" onClick={pick(onRunAi)}>
              <Icon name="sparkle" />
              <span>
                {aiRunning ? 'AI filter running…' : 'Run AI filter'}
                <small>Classify new jobs as remote-friendly</small>
              </span>
            </button>
          ) : (
            <div className="menu-item is-disabled" role="menuitem" aria-disabled="true">
              <Icon name="sparkle" />
              <span>
                AI filter unavailable
                <small>Set DEEPSEEK_API_KEY on the server to enable it</small>
              </span>
            </div>
          )}
          {onChangeToken && (
            <button type="button" role="menuitem" className="menu-item" onClick={pick(onChangeToken)}>
              <Icon name="key" />
              <span>Change access token</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
