export const reportService = {
  exportToExcel(data, fileName = 'relatorio.xlsx') {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');
    XLSX.writeFile(workbook, fileName);
  },

  exportToPDF(title, headers, rows, fileName = 'relatorio.pdf') {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

    doc.autoTable({
      startY: 28,
      head: [headers],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] }
    });

    doc.save(fileName);
  }
};