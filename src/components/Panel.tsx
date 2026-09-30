import { ReactNode } from "react";

export const PanelTitle = ({ children }: { children: ReactNode }) => (
  <div className="px-3 pb-2 pt-3 text-[11px] font-semibold tracking-widest text-neutral-500">
    {children}
  </div>
);

export const ToolButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={`flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors ${
      active ? "bg-accent/20 text-accent" : "hover:bg-panel-2"
    }`}
  >
    {label}
  </button>
);

export const Divider = () => <div className="my-2 border-t border-border" />;