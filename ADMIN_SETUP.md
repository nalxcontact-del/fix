# Administrador do PersonaChat

O PersonaChat suporta dois métodos para definir administradores:

- `PERSONACHAT_ADMIN_USER_IDS`: IDs de usuários administradores, separados por vírgula.
- `PERSONACHAT_ADMIN_EMAILS`: e-mails administradores, separados por vírgula.

Para o proprietário, prefira o e-mail exclusivo do PersonaChat. O e-mail precisa
ser o mesmo da conta usada para entrar no app.

Exemplo:

`PERSONACHAT_ADMIN_EMAILS=seu-email-do-personachat@exemplo.com`

Depois de alterar o `.env.local`, reinicie `npm run dev`.

Para conferir, abra `/api/admin/whoami`. O campo `isAdmin` deve aparecer como `true`.

Não coloque senhas ou chaves de API nessa variável.
