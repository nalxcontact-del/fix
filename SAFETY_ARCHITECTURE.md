# Arquitetura de Segurança — PersonaChat

```text
OSINT / fontes externas
        ↓
normalização
        ↓
classificação + confiança
        ↓
retenção / expiração
        ↓
seleção contextual
        ↓
┌─────────────────────────────┐
│ estado do roleplay           │
│ personalidade + continuidade │
└──────────────┬──────────────┘
               ↓
         prompt do personagem
               ↓
              chat
```

O sistema deve falhar de forma conservadora: se uma informação não puder ser classificada como apropriada, ela não é enviada ao modelo.
