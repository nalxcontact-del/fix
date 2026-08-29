import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const page=fs.readFileSync(path.join(root,'app/page.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'app/globals.css'),'utf8');
const checks=[
  ['feedback uses compact mobile overlay', page.includes('response-feedback-overlay') && page.includes('feedback-overlay')],
  ['feedback has sticky action area', page.includes('feedback-modal-actions') && css.includes('.feedback-modal-actions')],
  ['response feedback is 2-column on mobile', css.includes('.response-feedback-options{grid-template-columns:repeat(2')],
  ['response feedback has 3-column desktop layout', css.includes('.response-feedback-options{grid-template-columns:repeat(3')],
  ['feedback modal is viewport-bounded', css.includes('calc(100dvh - 24px)')],
  ['profile has no conversations tab', !page.includes('profile-conversations-tab') && !page.includes('profileTab==="conversations"')],
  ['profile labels use language system', page.includes('t("likedBots")') && page.includes('t("createdBots")') && page.includes('t("memberSince")')],
  ['chat language fallback is English', page.includes('body: JSON.stringify({ characterId: character.id, character, userMessage, history, memories, regenerate, language,')],
  ['bot type labels are not Portuguese', page.includes('Real person') && !page.includes('Pessoa real')],
  ['no legacy Portuguese feedback JSX', !page.includes('<p>Ajude a melhorar o PersonaChat') && !page.includes('<p>No precisamos da sua conversa')],
  ['body horizontal overflow is blocked', css.includes('html,body{overflow-x:hidden}')],
];
let ok=0;
for(const [name,pass] of checks){console.log(`${pass?'PASS':'FAIL'} ${name}`);if(pass)ok++;}
if(ok!==checks.length) process.exit(1);
console.log(`Phase 51 UI checks: ${ok}/${checks.length} OK`);
