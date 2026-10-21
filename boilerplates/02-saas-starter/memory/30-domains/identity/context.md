# Identity — contexto

**Organização** é o tenant: tudo que pertence a um cliente carrega o `tenantId` dela. Uma
**pessoa usuária** pertence a exatamente uma organização e tem papéis: `owner` (quem criou;
decide o plano), `admin` (gerencia membros e faturas), `member`.

## Regras

- Cadastro cria a organização e a dona na mesma transação. O slug deriva do nome; se já existe,
  ganha um sufixo aleatório.
- E-mail é único no sistema inteiro, comparado em minúsculas.
- Senha: mínimo 12 caracteres com minúscula, maiúscula e dígito; guardada com scrypt.
- Login errado e e-mail inexistente dão a mesma resposta, no mesmo tempo.
- Access token (15 min) e refresh token (7 dias) usam segredos distintos; um não vale como o outro.
  O refresh relê a pessoa usuária: desativada, não renova.

## Onde está

`src/identity/domain/` (modelo e porta) · `application/auth.service.ts` (casos de uso) ·
`src/platform/auth/` (tokens, guards, papéis).
