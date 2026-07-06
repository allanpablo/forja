import { useEffect } from 'react';

export default function Drawer({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex">
      <button
        type="button"
        aria-label="Fechar"
        className="flex-1 bg-black/60"
        onClick={onClose}
      />
      <aside className="w-[60%] max-w-3xl bg-surface border-l border-border h-full overflow-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" className="btn" onClick={onClose}>Fechar (Esc)</button>
        </div>
        {children}
      </aside>
    </div>
  );
}
