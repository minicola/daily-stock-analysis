import type { ReactNode } from "react";

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="w-96 bg-slate-900 p-4 overflow-y-auto">
        <header className="flex justify-between mb-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400">关闭</button>
        </header>
        {children}
      </aside>
    </div>
  );
}
