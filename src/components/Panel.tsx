import { ReactNode } from "react";

export const PanelTitle = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold tracking-widest text-neutral-500">
    {children}
  </div>
);

export const ToolButton = ({
  label,
  active,
  onClick,
  icon,
  hint,
  compact,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  hint?: string;
  compact?: boolean;
}) => (
  <button
    onClick={onClick}
    title={hint}
    className={`flex items-center rounded-md text-sm transition-colors ${
      compact
        ? `justify-center px-2 ${icon ? "flex-col gap-0.5 py-2 text-[11px]" : "gap-1.5 py-1.5 text-xs"}`
        : "w-full gap-2 px-3 py-1.5 text-left"
    } ${
      active
        ? "bg-accent/20 text-accent ring-1 ring-accent/40"
        : "text-neutral-300 hover:bg-panel-2 hover:text-white"
    }`}
  >
    {icon && <span className="text-base leading-none">{icon}</span>}
    {label}
  </button>
);

export const Divider = () => <div className="my-2 border-t border-border" />;