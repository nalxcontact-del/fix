# Desenvolvimento pela rede local

O `next.config.ts` permite explicitamente os hosts de desenvolvimento
`192.168.1.5`, `192.168.1.6`, `192.168.1.9`, `localhost` e `127.0.0.1`.

Se o IP do computador que executa o Next mudar, atualize `allowedDevOrigins`
para o novo host e reinicie `npm run dev`.

Não use `*` aqui: esta lista é deliberadamente restrita ao ambiente local.
A configuração só é relevante para `next dev`.
