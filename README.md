# Painel Studio

Editor visual 2D para dimensionar painéis de automação e distribuir componentes usando as medidas da biblioteca.

## Como executar e publicar

O projeto usa React 18, Material UI 5 e Vite na tela de acesso; o editor 2D existente continua em JavaScript. Requer Node.js 18, 20 ou 22+.

1. Execute `npm install` na pasta do projeto.
2. Use `npm run dev` para abrir o ambiente local.
3. Use `npm run build` para gerar o site na pasta `dist/`.
4. Publique o conteúdo de `dist/` na raiz do domínio. Não publique apenas o arquivo `index.html`.

O editor e os arquivos da biblioteca são copiados para a versão final pelo build. Para contas, configure `assets/supabase-config.js` antes de publicar.

## Estrutura

- `index.html`: tela de acesso e criação de conta.
- `editor.html`: editor, aberto após autenticação.
- `painel-studio.js`: interações e renderização.
- `components/catalog.js`: biblioteca padrão e dimensões dos componentes.
- `assets/components/`: imagens dos componentes enviadas pelo editor.

As imagens enviadas no editor são incorporadas ao projeto e sincronizadas junto com os demais dados da conta. Imagens fixas da biblioteca continuam em `assets/components/`.

Este protótipo é visual. Regras de dimensionamento e validações elétricas podem ser adicionadas em etapas futuras.

## Contas e projetos online

O acesso por perfil usa Supabase Auth e cada projeto fica associado ao identificador da conta autenticada. Os projetos são sincronizados entre computadores; o banco aplica isolamento por usuário com Row Level Security (RLS).

### Configuração

1. Crie um projeto no Supabase e ative o provedor de e-mail e senha em **Authentication → Sign In / Providers**.
2. Em **Project Settings → API**, copie a Project URL e a chave pública (`publishable` ou `anon`) para `assets/supabase-config.js`. Nunca use a chave `service_role` no navegador.
3. Execute `supabase/migrations/20261016_profiles_and_projects.sql` e depois `supabase/migrations/20261016_roles_and_admin_access.sql` no SQL Editor do projeto.
4. Promova pelo menos uma conta a admin no SQL Editor, substituindo o e-mail pelo da conta que deve administrar o sistema:
   ```sql
   update public.profiles
   set role = 'admin'
   where lower(email) = lower('admin@admin.com');
   ```
   Cadastros novos recebem `user`. Apenas admins podem alterar cargos pela interface; usuários comuns acessam apenas os próprios projetos, enquanto admins podem consultar e gerenciar projetos de todas as contas.
5. Em **Authentication → URL Configuration**, defina a URL publicada do Painel Studio como Site URL e inclua as URLs de desenvolvimento permitidas em Redirect URLs.
6. Sirva o editor por uma origem HTTP ou HTTPS. O fluxo de confirmação de e-mail e redefinição de senha não funciona corretamente ao abrir diretamente por `file://`.

O cadastro pode exigir confirmação por e-mail, conforme a configuração do Supabase. O botão **Salvar** grava o projeto na conta; alterações em um projeto já salvo também entram na fila de sincronização automática. Cada sessão mantém um cache local separado por usuário.

O menu da conta inclui **Gerenciar usuários** para admins. A lista mostra a role e a quantidade de projetos salvos por perfil; ao selecionar uma conta, o admin pode abrir um de seus projetos. Também é possível alterar cargos entre `user` e `admin`. A role é mantida na tabela `public.profiles`, não nos metadados que o próprio usuário pode alterar. Os controles de inclusão e remoção de componentes da biblioteca também ficam disponíveis apenas para admins; a biblioteca customizada atual continua sendo salva dentro dos dados do projeto.

Imagens novas são incorporadas aos dados do projeto para acompanhá-lo entre computadores. Isso aumenta o tamanho dos dados enviados; imagens fixas já incluídas em `assets/components/` continuam sendo carregadas do repositório.

Projetos salvos na versão anterior, antes das contas, continuam no armazenamento local antigo e não são associados automaticamente a uma conta. Eles precisarão ser importados explicitamente para evitar atribuir dados locais ao perfil errado.

