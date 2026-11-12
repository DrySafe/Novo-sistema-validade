# Leitor de códigos de barras

`zxing-0.21.3.min.js` é o bundle UMD de `@zxing/library` 0.21.3, distribuído sob Apache-2.0; licença em `ZXING-LICENSE`.

Fonte: https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js

Carregado sob demanda pelo scanner quando o navegador não oferece leitura nativa de EAN-8 e EAN-13. A cópia local dispensa um novo acesso ao CDN para abrir a câmera. Não envia imagens da câmera a serviços externos.

## Recursos locais de segurança

Os scripts do SDK Supabase 2.119.0, jsPDF 4.2.1, AutoTable 5.0.9 e XLSX 0.18.5 são cópias locais dos bundles oficiais publicados em cdn.jsdelivr.net/npm, com licenças ao lado. O frontend não executa JavaScript remoto; a CSP permite scripts somente da própria origem. Versões e hashes estão em `integrity.json`.

XLSX 0.18.5 é usado somente para gerar arquivos, nunca importar planilhas. Há avisos conhecidos para caminhos de leitura de versões antigas. A atualização para a distribuição oficial 0.20.3 ficou pendente porque cdn.sheetjs.com está bloqueado na política do ambiente. Não habilitar importação de arquivos com essa versão; obter e validar a distribuição oficial antes de adicionar esse recurso. A ausência de alertas em npm audit não cobre bibliotecas vendorizadas.
