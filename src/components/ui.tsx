import type { ReactNode } from 'react';

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="bb-icon-btn" aria-label="뒤로가기">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function BrandMark({ size = 36, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-semibold tracking-tight ${
        tone === 'light' ? 'bg-white text-navy' : 'bg-navy text-white'
      }`}
      style={{ width: size, height: size, fontSize: size * 0.26, letterSpacing: '-0.04em' }}
    >
      RIM
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted">
      <span className="mb-3 h-8 w-8 rounded-full border-2 border-line border-t-navy animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bb-card p-8 text-center space-y-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="text-xs text-muted leading-relaxed">{description}</p>}
      {children}
    </div>
  );
}

export function IconHome({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClub({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <path d="M12 3c2.5 3 3.5 6 3.5 9s-1 6-3.5 9M12 3c-2.5 3-3.5 6-3.5 9s1 6 3.5 9M3.5 12h17" strokeLinecap="round" />
    </svg>
  );
}

export function IconUser({ active }: { active?: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <path d="M5 19.5c1.2-3.2 3.7-5 7-5s5.8 1.8 7 5" strokeLinecap="round" />
    </svg>
  );
}
