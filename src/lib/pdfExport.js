import { formatMXN, todayStr } from './finance';

export async function exportStatementPdf({ range, days, accounts, email }) {
  if (!range.start || !range.end) return 'Selecciona una fecha inicial y una final';
  if (range.start > range.end) return 'La fecha inicial debe ser anterior a la final';

  const [startYear, startMonth, startDay] = range.start.split('-').map(Number);
  const [endYear, endMonth, endDay] = range.end.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const endDate = new Date(endYear, endMonth - 1, endDay);
  const rows = [];
  let totalIngresos = 0;
  let totalGastos = 0;

  while (cursor <= endDate) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const record = days.find(day => day.fecha === date);
    if (!record || record.sinCambios || record.movimientos.length === 0) {
      rows.push([date, record?.sinCambios ? 'Sin cambios' : 'Sin registro', '-', '-', record?.nota || '']);
    } else {
      record.movimientos.forEach((movement, index) => {
        const account = accounts.find(item => item.id === movement.cuentaId);
        rows.push([
          index === 0 ? date : '',
          `${movement.descripcion || (movement.tipo === 'gasto' ? 'Gasto' : 'Ingreso')} (${account ? account.name : 'Cuenta eliminada'})`,
          movement.tipo === 'ingreso' ? formatMXN(movement.monto) : '-',
          movement.tipo === 'gasto' ? formatMXN(movement.monto) : '-',
          index === 0 ? record.nota || '' : '',
        ]);
        if (movement.tipo === 'ingreso') totalIngresos += movement.monto;
        else totalGastos += movement.monto;
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  try {
    const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Estado de cuenta: ${range.start} al ${range.end}`, 14, 15);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generado el ${todayStr()} — ${email}`, 14, 21);
    doc.setTextColor(0);
    autoTableModule.default(doc, { startY: 27, head: [['Fecha', 'Concepto', 'Ingreso', 'Gasto', 'Nota del día']], body: rows, theme: 'grid', headStyles: { fillColor: [110, 86, 207] }, styles: { fontSize: 8, cellPadding: 3 }, columnStyles: { 4: { cellWidth: 45 } } });
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 30;
    doc.setFontSize(11);
    doc.text(`Total ingresos: ${formatMXN(totalIngresos)}`, 14, finalY + 10);
    doc.text(`Total gastos: ${formatMXN(totalGastos)}`, 14, finalY + 17);
    doc.text(`Balance del periodo: ${formatMXN(totalIngresos - totalGastos)}`, 14, finalY + 24);
    doc.save(`Estado_Cuenta_${range.start}_al_${range.end}.pdf`);
    return '';
  } catch {
    return 'No se pudo generar el PDF. Inténtalo de nuevo.';
  }
}
