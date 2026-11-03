import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  hint: string;
  action?: ReactNode;
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="empty" role="status">
      <p className="empty-title">{title}</p>
      <p className="empty-hint">{hint}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
