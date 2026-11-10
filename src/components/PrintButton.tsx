'use client';

export default function PrintButton() {
  return (
    <button type="button" className="btn small outline no-print" onClick={() => window.print()}>
      Exportar PDF
    </button>
  );
}
