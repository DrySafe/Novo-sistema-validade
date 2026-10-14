export function permissionsFor(profile = {}) {
  if (profile.permissoes) return profile.permissoes;
  const role = String(profile.funcao || '').toLowerCase();
  const management = ['administrador', 'admin', 'gestor', 'gerente'].includes(role);
  const audit = management || role === 'adm';
  return {
    entrada: management || role === 'operador',
    movimentacao: management || role === 'operador',
    revisao: management || role === 'precificacao',
    correcao: audit,
    equipe: audit,
    editarLoja: audit,
    criarLoja: ['administrador', 'admin'].includes(role)
  };
}
