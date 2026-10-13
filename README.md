# Painel Studio

Editor visual 2D para dimensionar painéis de automação e distribuir componentes usando as medidas da biblioteca.

## Como abrir

Baixe ou clone o repositório inteiro, preservando as pastas. Abra `index.html` em um navegador moderno. O catálogo e o editor precisam permanecer com a estrutura de diretórios original.

## Estrutura

- `index.html`: tela principal.
- `painel-studio.js`: interações e renderização.
- `components/catalog.js`: biblioteca padrão e dimensões dos componentes.
- `assets/components/`: imagens dos componentes enviadas pelo editor.

Na primeira vez que enviar uma imagem, clique no upload e autorize a pasta raiz do projeto. Clique novamente para selecionar o arquivo. O editor criará `assets/components/`, salvará a imagem e a associará ao componente. O acesso à pasta fica salvo no navegador para os próximos envios.

Este protótipo é visual. Regras de dimensionamento e validações elétricas podem ser adicionadas em etapas futuras.

