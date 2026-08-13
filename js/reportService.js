export const reportService = {
  // 1. EXPORTAR PARA EXCEL (.XLSX)
  exportToExcel(data, sector, profile) {
    if (!data || data.length === 0) {
      alert("Não há dados disponíveis para exportar neste setor.");
      return;
    }

    const dataImpressao = new Date().toLocaleString('pt-BR');
    
    // Cabeçalho Corporativo
    const headerData = [
      ["RELATÓRIO GERENCIAL - VALIDASUPER"],
      [`LOJA: ${profile.lojas?.nome || 'N/A'}`],
      [`CNPJ: ${profile.lojas?.cnpj || 'N/A'}`],
      [`EMITIDO POR: ${profile.nome}`],
      [`DATA DE EMISSÃO: ${dataImpressao}`],
      [`SETOR/MÓDULO: ${sector.toUpperCase()}`],
      [] // Linha em branco
    ];

    // Mapeia colunas da tabela conforme o setor
    const tableRows = data.map(item => ({
      "EAN / Código": item.produtos?.ean || item.ean || 'N/I',
      "Produto": item.produto_nome || item.produtos?.nome || 'N/I',
      "Lote": item.lote || 'N/A',
      "Quantidade": item.quantidade,
      "Vencimento / Data": item.data_vencimento ? new Date(item.data_vencimento).toLocaleDateString('pt-BR') : 'N/A',
      "Local / Motivo": item.localizacao || item.motivo || 'N/A',
      "Status": item.status_regua || 'Vencido/Registrado'
    }));

    const ws = XLSX.utils.aoa_to_sheet(headerData);
    XLSX.utils.sheet_add_json(ws, tableRows, { origin: "A8" });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatório");

    XLSX.writeFile(wb, `Relatorio_${sector}_${Date.now()}.xlsx`);
  },

  // 2. EXPORTAR PARA PDF IMPRESSO
  exportToPDF(data, sector, profile) {
    if (!data || data.length === 0) {
      alert("Não há dados disponíveis para gerar o PDF.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dataImpressao = new Date().toLocaleString('pt-BR');

    // Cabeçalho no PDF
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138); // Cor Primary
    doc.text("VALIDASUPER - RELATÓRIO DE AUDITORIA", 14, 15);

    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    doc.text(`Loja: ${profile.lojas?.nome || 'N/A'} | CNPJ: ${profile.lojas?.cnpj || 'N/A'}`, 14, 23);
    doc.text(`Usuário Responsável: ${profile.nome}`, 14, 29);
    doc.text(`Data de Emissão: ${dataImpressao} | Setor: ${sector.toUpperCase()}`, 14, 35);
    doc.line(14, 39, 196, 39);

    // Mapeamento de Colunas do PDF
    const columns = ["EAN", "Produto", "Lote", "Qtd", "Vencimento", "Local/Motivo"];
    const rows = data.map(item => [
      item.produtos?.ean || item.ean || 'N/I',
      item.produto_nome || item.produtos?.nome || 'N/I',
      item.lote || 'N/A',
      `${item.quantidade} un`,
      item.data_vencimento ? new Date(item.data_vencimento).toLocaleDateString('pt-BR') : 'N/A',
      item.localizacao || item.motivo || 'N/A'
    ]);

    doc.autoTable({
      startY: 43,
      head: [columns],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138], textColor: [255, 255, 255] },
      styles: { fontSize: 8 }
    });

    doc.save(`Relatorio_${sector}_${Date.now()}.pdf`);
  }
};