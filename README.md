# Chatbot RBAC

API de backend do chatbot da Rede Brasileira de Aprendizagem Criativa no WhatsApp. O sistema recebe mensagens via webhook, valida o usuário, conduz o fluxo conversacional e grava as respostas no Google Sheets. As mídias recebidas são enviadas para o Google Drive.

## Pré-requisitos

- Node.js 22+
- Conta de desenvolvedor na [Meta for Developers](https://developers.facebook.com)
- Conta Google com acesso à planilha e à pasta de destino no Drive
- `cloudflared` para expor o servidor localmente durante o desenvolvimento

## Configuração

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Variáveis importantes:

| Variável | Descrição |
|---|---|
| `VERIFY_TOKEN` | Token de verificação do webhook da Meta |
| `APP_SECRET` | Segredo do app Meta, usado para validar a assinatura do webhook |
| `ADMIN_TOKEN` | Token administrativo para as rotas protegidas |
| `PHONE_NUMBER_ID` | ID do número cadastrado |
| `ACCESS_TOKEN` | Token da Meta para envio de mensagens |
| `PORT` | Porta da API |
| `NODE_ENV` | Define `secure` no cookie admin quando igual a `production` |
| `DB_PROVIDER` | Provedor de persistência: `sqlserver` (default) ou `sqlite` |
| `DB_SERVER` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | Conexão com o Azure SQL Database (quando `DB_PROVIDER=sqlserver`) |
| `SQLITE_FILE_PATH` | Caminho do arquivo SQLite (obrigatório quando `DB_PROVIDER=sqlite`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID OAuth do Google |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret OAuth do Google |
| `GOOGLE_OAUTH_REDIRECT_URI` | URI de callback do OAuth |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ID da planilha de destino |
| `GOOGLE_DRIVE_FOLDER_ID` | Pasta base no Drive para os arquivos enviados |

O `refresh_token` do Google não fica em variável de ambiente. Ele é salvo na tabela `google_oauth_token`.

### Matriz de execução do banco

- `DB_PROVIDER` ausente: usa `sqlserver` por padrão.
- `DB_PROVIDER=sqlserver`: usa Azure SQL com `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `DB_PROVIDER=sqlite`: usa `node:sqlite` com `SQLITE_FILE_PATH` e cria schema automaticamente em arquivo novo.

### 3. Inicie o servidor

```bash
npm run dev
```

### 4. Exponha o servidor localmente

Em outro terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

### 5. Configure o webhook na Meta

1. Acesse o app em [Meta for Developers](https://developers.facebook.com)
2. Vá em **WhatsApp → Configuração**
3. Em **Webhooks**, clique em **Editar**
4. Informe:
   - **URL de callback**: `<url pública>/webhook`
   - **Token de verificação**: o valor de `VERIFY_TOKEN`
5. Salve a configuração

## Autorização Google

O fluxo Google usa OAuth de usuário com `refresh_token` persistido no banco. A autorização precisa ser feita uma vez por conta Google.

1. Acesse `GET /api/auth/google`
2. Faça login com a conta que possui acesso à planilha e à pasta do Drive
3. O callback `GET /api/google/callback` grava os tokens em `google_oauth_token`
4. O status da conexão pode ser consultado em `GET /api/auth/google/status`
   Essa rota informa apenas se a integração Google da aplicação já possui token OAuth salvo.

Depois disso, o backend renova o `access_token` automaticamente quando necessário.

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Status da API |
| `GET` | `/api/auth/google` | Inicia a autorização OAuth do Google |
| `GET` | `/api/google/callback` | Callback OAuth do Google |
| `GET` | `/api/auth/google/status` | Indica se a integração Google da aplicação possui token OAuth salvo |
| `GET` | `/api/admin/articulators` | Lista os articuladores ativos |
| `POST` | `/api/admin/articulators` | Sincroniza os articuladores |
| `GET` | `/api/admin/questions` | Lista a configuração atual de questões |
| `POST` | `/api/admin/questions` | Atualiza as questões e sincroniza a aba ativa no Google Sheets |
| `GET` | `/webhook` | Verificação do webhook pela Meta |
| `POST` | `/webhook` | Recebimento de mensagens do WhatsApp |

## Observações

- O fluxo produtivo não depende mais de token fixo em variável de ambiente nem de service account.
- O upload de mídia usa a pasta definida em `GOOGLE_DRIVE_FOLDER_ID`.
