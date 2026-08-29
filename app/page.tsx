/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BarChart3, Bot, Camera, Check, ChevronDown, ChevronLeft, ChevronRight, Compass, Copy, Flag, FileText, Heart, LogOut, MessageCircle,
  Plus, Pencil, Pin, RefreshCw, RotateCcw, Search, Send, Settings, Share2, Shield, ShieldAlert, Sparkles, ThumbsDown,
  ThumbsUp, Trash2, UserPlus, Users, X, MoreHorizontal
} from "lucide-react";
import { characters as baseCharacters } from "@/characters";
import type { Character, CharacterType, Conversation, Memory, Message, RelationshipState } from "@/lib/types";
import { createConversation, loadAppData, saveAppData, syncAppData, isSavePending } from "@/lib/storage";
import { getSession, login, loginWithGoogle, logout, register, type UserProfile } from "@/lib/auth";
import { extractMemories, supersedeConflicts } from "@/lib/memory";
import { initialRelationship, updateRelationship } from "@/lib/relationship";

type CommunityBot = Character;
type ExploreBot = Character & { likes: number; interactions?: number; creatorId: string; createdAt: number };
type CreatorSearchResult = { id: string; name: string; username: string; avatar: string | null; bots: { id: string; name: string }[]; botCount: number; interactions: number };
type ExploreData = { trending: ExploreBot[]; popular: ExploreBot[]; newest: ExploreBot[]; featured: ExploreBot[]; all: ExploreBot[]; categories?: { real_person: ExploreBot[]; existing_character: ExploreBot[]; original: ExploreBot[]; action?: ExploreBot[]; romance?: ExploreBot[]; anime?: ExploreBot[] } };
type UsageClientState = { plan: "free" | "premium"; limits: { dailyTokens: number; monthlyTokens: number; globalDailyTokens: number }; used: { dailyTokens: number; monthlyTokens: number; dailyCostUsd: number; regenerationsHour: number; regenerationsDay: number }; regeneration: { hourLimit: number; dayLimit: number; hourUsed: number; dayUsed: number; hourRemaining: number; dayRemaining: number }; dailyResetAt?: number | null };

type AppLanguage = "pt" | "en" | "es" | "it" | "fr";
type ThemeMode = "dark" | "light" | "system";
function makeClientId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `pc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
const CHARACTER_LIMITS = {
  name: 80, description: 1200, greeting: 3000, personality: 6000, speechStyle: 3000, scenario: 5000, lore: 10000, tags: 320, image: 2000, examplesTotal: 9600, exampleEach: 1200, exampleCount: 8,
};


const RESPONSE_FEEDBACK_OPTIONS = {
  like: [
    ["natural", "Natural"], ["personality", "Strong personality"], ["faithful", "In character"], ["creative", "Creative"],
    ["emotional", "Emotional"], ["funny", "Funny"], ["detailed", "Detailed"], ["dialogue", "Good dialogue"],
    ["action", "Good action/narration"], ["surprising", "Surprising"], ["coherent", "Coherent"], ["good_pacing", "Good pacing"], ["concise", "Well balanced"], ["other", "Other reason"],
  ],
  dislike: [
    ["repetitive", "Repetitive"], ["generic", "Generic"], ["out_of_character", "Out of character"], ["too_long", "Too long"],
    ["too_short", "Too short"], ["emotionless", "Emotionless"], ["too_much_action", "Too much action/narration"], ["artificial_dialogue", "Artificial dialogue"],
    ["did_not_advance", "Did not advance the scene"], ["ignored_context", "Ignored context"], ["inconsistent", "Inconsistent"], ["controlled_user", "Controlled the user"], ["other", "Other reason"],
  ],
} as const;

function CharacterCount({ value, max }: { value: string; max: number }) {
  return <span className={`field-counter ${value.length > max ? "over" : ""}`}>{value.length.toLocaleString("en-US")}/{max.toLocaleString("en-US")}</span>;
}

function TypingIndicator() {
  return <span className="typing-indicator" aria-label="Generating response" role="status"><i/><i/><i/></span>;
}

const translations: Record<AppLanguage, Record<string,string>> = {
  pt:{realBotNotice:"Bot de pessoa real — simulação. Nada do que for dito deve ser tomado como verdade.",settings:"Configurações",appearance:"Aparência",theme:"Tema",dark:"Escuro",light:"Claro",system:"Sistema",language:"Idioma",notifications:"Notificações",notificationsDesc:"Receber avisos importantes do aplicativo.",enterSend:"Enter envia mensagem",enterSendDesc:"Enter envia; Shift + Enter cria uma nova linha.",save:"Save",close:"Fechar",create:"Criar personagem",discover:"Descobrir",profile:"Meu perfil",yourChats:"Seus chats",community:"COMMUNITY DE PERSONAGENS",heroTitle:"Converse. Crie. Compartilhe.",heroText:"Descubra personagens criados pela comunidade, converse com eles e construa sua própria coleção.",explore:"Explorar a comunidade",featured:"Personagens em destaque",startConversation:"Comece uma nova conversa.",searchCharacters:"Pesquisar personagens...",searchYourChats:"Pesquisar seus chats...",noConversationFound:"Nenhuma conversa encontrada.",logout:"Sair da conta",viewProfile:"Ver meu perfil",portuguese:"Português",english:"English",spanish:"Español",italian:"Italiano",french:"Français"},
  en:{realBotNotice:"Real-person bot — simulation. Nothing said here should be taken as fact.",settings:"Settings",appearance:"Appearance",theme:"Theme",dark:"Dark",light:"Light",system:"System",language:"Language",notifications:"Notifications",notificationsDesc:"Receive important app notices.",enterSend:"Enter sends message",enterSendDesc:"Enter sends; Shift + Enter creates a new line.",save:"Save",close:"Close",create:"Create character",discover:"Discover",profile:"My profile",yourChats:"Your chats",community:"CHARACTER COMMUNITY",heroTitle:"Chat. Create. Share.",heroText:"Discover community characters, chat with them and build your own collection.",explore:"Explore community",featured:"Featured characters",startConversation:"Start a new conversation.",searchCharacters:"Search characters...",searchYourChats:"Search your chats...",noConversationFound:"No conversations found.",logout:"Log out",viewProfile:"View my profile",portuguese:"Português",english:"English",spanish:"Español",italian:"Italiano",french:"Français",account:"Account",privacySupport:"Privacy & support",terms:"Terms of Use",privacy:"Privacy",sendFeedback:"Send feedback",administration:"Administration",openModeration:"Open moderation",productReport:"Product report",deleteAccount:"Delete account",deleteAccountDesc:"This action is permanent and removes your account data.",deleteMyAccount:"Delete my account",deleteMyAccountAction:"Delete my account",chooseLanguage:"Choose the interface language.",chooseTheme:"Choose how PersonaChat appears to you.",conversations:"Conversations",noConversations:"No conversations yet.",send:"Send message",continueScene:"Continue scene",tryAgain:"Try again",closeError:"Close error",usageToday:"Usage today",chatWith:"Chat with",newConversation:"New conversation",searchBots:"Search bots, creators or tags...",exploreCharacters:"Explore characters",exploreCommunityDesc:"Discover community-created bots and find your next conversation."},
  es:{realBotNotice:"Bot de persona real — simulación. Nada de lo dicho aquí debe tomarse como verdad.",settings:"Configuración",appearance:"Apariencia",theme:"Tema",dark:"Oscuro",light:"Claro",system:"Sistema",language:"Idioma",notifications:"Notificaciones",notificationsDesc:"Recibe avisos importantes de la aplicación.",enterSend:"Enter envía mensajes",enterSendDesc:"Enter envía; Shift + Enter crea una línea nueva.",save:"Guardar",close:"Cerrar",create:"Crear personaje",discover:"Descubrir",profile:"Mi perfil",yourChats:"Tus chats",community:"COMUNIDAD DE PERSONAJES",heroTitle:"Habla. Crea. Comparte.",heroText:"Descubre personajes creados por la comunidad, habla con ellos y crea tu propia colección.",explore:"Explorar comunidad",featured:"Personajes destacados",startConversation:"Comienza una nueva conversación.",searchCharacters:"Buscar personajes...",searchYourChats:"Buscar tus chats...",noConversationFound:"No se encontraron conversaciones.",logout:"Cerrar sesión",viewProfile:"Ver mi perfil",portuguese:"Português",english:"English",spanish:"Español",italian:"Italiano",french:"Français"},
  it:{realBotNotice:"Bot di persona reale — simulazione. Nulla di ciò che viene detto deve essere preso come verità.",settings:"Impostazioni",appearance:"Aspetto",theme:"Tema",dark:"Scuro",light:"Chiaro",system:"Sistema",language:"Lingua",notifications:"Notifiche",notificationsDesc:"Ricevi avvisi importanti dall'app.",enterSend:"Invio con Enter",enterSendDesc:"Enter invia; Shift + Enter crea una nuova riga.",save:"Salva",close:"Chiudi",create:"Crea personaggio",discover:"Scopri",profile:"Il mio profilo",yourChats:"Le tue chat",community:"COMMUNITY DEI PERSONAGGI",heroTitle:"Parla. Crea. Condividi.",heroText:"Scopri personaggi creati dalla community, parla con loro e crea la tua collezione.",explore:"Esplora la community",featured:"Personaggi in evidenza",startConversation:"Inizia una nuova conversazione.",searchCharacters:"Cerca personaggi...",searchYourChats:"Cerca nelle tue chat...",noConversationFound:"Nessuna conversazione trovata.",logout:"Esci dall'account",viewProfile:"Vedi il mio profilo",portuguese:"Português",english:"English",spanish:"Español",italian:"Italiano",french:"Français"},
  fr:{realBotNotice:"Bot de personne réelle — simulation. Rien de ce qui est dit ici ne doit être considéré comme un fait.",settings:"Paramètres",appearance:"Apparence",theme:"Thème",dark:"Sombre",light:"Clair",system:"Système",language:"Langue",notifications:"Notifications",notificationsDesc:"Recevoir les notifications importantes de l'application.",enterSend:"Entrée envoie le message",enterSendDesc:"Entrée envoie; Maj + Entrée crée une nouvelle ligne.",save:"Enregistrer",close:"Fermer",create:"Créer un personnage",discover:"Découvrir",profile:"Mon profil",yourChats:"Vos chats",community:"COMMUNAUTÉ DE PERSONNAGES",heroTitle:"Discutez. Créez. Partagez.",heroText:"Découvrez des personnages créés par la communauté et construisez votre collection.",explore:"Explorer la communauté",featured:"Personnages à la une",startConversation:"Commencez une nouvelle conversation.",searchCharacters:"Rechercher des personnages...",searchYourChats:"Rechercher dans vos chats...",noConversationFound:"Aucune conversation trouvée.",logout:"Se déconnecter",viewProfile:"Voir mon profil",portuguese:"Português",english:"English",spanish:"Español",italian:"Italiano",french:"Français"}
};

// Phase 51 — shared UI copy used by profile, feedback, chat controls and account surfaces.
// Keeping this separate makes hard-coded legacy strings fall back through the same language system.
const commonTranslations: Record<AppLanguage, Record<string,string>> = {
  en:{memberSince:"Member since",editProfile:"Edit profile",share:"Share",follow:"Follow",following:"Following",report:"Report",followers:"Followers",followingCount:"Following",likedBots:"Liked bots",createdBots:"Created bots",createBot:"Create bot",emptyCreatedTitle:"You haven't created any bots yet",emptyCreatedText:"Create a character and publish it to the community.",emptyLikedTitle:"You haven't liked any bots yet",emptyLikedText:"Explore characters and like the ones you want to keep.",changePhoto:"Change photo",todayUsage:"Today's usage",deleteAllConversations:"Delete all conversations",feedbackDescription:"Help us improve PersonaChat. We don't need your conversation to do this.",feedbackSent:"Feedback sent",copyProfile:"Profile link copied.",cannotCopy:"Unable to copy the link.",deleteAccount:"Delete account",deleteAccountDesc:"This action is permanent and removes your account data.",deleteAccountEmail:"Email",deleteAccountPassword:"Password",saveChanges:"Save changes",signOut:"Log out",createFirstBot:"Create your first bot",dailyLimitTitle:"The daily test limit has ended.",dailyLimitBody:"Messaging is paused until the limit resets.",dailyLimitCountdown:"You can send messages again in",dailyLimitNow:"You can send messages again now.",messageCreatedBy:"was created by",memoriesChat:"View and edit memories for this chat",categoryPopular:"Most popular",categoryNewest:"Newest",categoryAction:"Action",categoryRomance:"Romance",categoryAnime:"Anime",categoryRealPeople:"Real people",categoryExistingCharacters:"Existing characters",categoryOriginalCharacters:"Original characters",leaveChat:"Leave chat",copyAction:"Copy",newChatFromHere:"New chat from here",rewindToHere:"Rewind to here",editAction:"Edit",pinAction:"Pin",unpinAction:"Unpin",removeAction:"Remove",closeAction:"Close",cancelAction:"Cancel",startNewChatAction:"Start new chat",rewindAction:"Rewind",removeActionConfirm:"Remove",startNewChatTitle:"Start a new chat from here?",startNewChatText:"A separate conversation will be created using this message and everything before it. Your current chat will stay unchanged.",rewindTitle:"Rewind to this message?",rewindText:"Everything after this message will be removed, including later memories. This cannot be undone.",removeTitle:"Remove this message and everything after it?",removeText:"This message, all later messages, and memories linked to that part of the conversation will be removed. This cannot be undone.",messageActions:"Message actions",categoryLabel:"Category",feedbackLabel:"Feedback",feedbackPlaceholder:"What would you like to improve?"},
  pt:{memberSince:"Membro desde",editProfile:"Editar perfil",share:"Compartilhar",follow:"Seguir",following:"Seguindo",report:"Denunciar",followers:"Seguidores",followingCount:"Seguindo",likedBots:"Bots curtidos",createdBots:"Bots criados",createBot:"Criar bot",emptyCreatedTitle:"Você ainda não criou nenhum bot",emptyCreatedText:"Crie um personagem e publique-o na comunidade.",emptyLikedTitle:"Você ainda não curtiu nenhum bot",emptyLikedText:"Explore os personagens e curta os que quiser guardar.",changePhoto:"Trocar foto",todayUsage:"Uso hoje",deleteAllConversations:"Excluir todas as conversas",feedbackDescription:"Ajude a melhorar o PersonaChat. Não precisamos da sua conversa para isso.",feedbackSent:"Feedback enviado",copyProfile:"Link do perfil copiado.",cannotCopy:"Não foi possível copiar o link.",deleteAccount:"Excluir conta",deleteAccountDesc:"Esta ação é permanente e remove os dados da sua conta.",deleteAccountEmail:"E-mail",deleteAccountPassword:"Senha",saveChanges:"Salvar alterações",signOut:"Sair",createFirstBot:"Crie seu primeiro bot",dailyLimitTitle:"O limite diário de testes terminou.",dailyLimitBody:"As mensagens estão pausadas até o limite ser redefinido.",dailyLimitCountdown:"Você poderá enviar mensagens novamente em",dailyLimitNow:"Você já pode enviar mensagens novamente.",messageCreatedBy:"foi criado por",memoriesChat:"Ver e editar as memórias deste chat",categoryPopular:"Mais populares",categoryNewest:"Mais recentes",categoryAction:"Ação",categoryRomance:"Romance",categoryAnime:"Anime",categoryRealPeople:"Pessoas reais",categoryExistingCharacters:"Personagens existentes",categoryOriginalCharacters:"Personagens originais",leaveChat:"Sair do chat",copyAction:"Copiar",newChatFromHere:"Novo bate-papo aqui",rewindToHere:"Retroceder até aqui",editAction:"Editar",pinAction:"Fixar",unpinAction:"Desafixar",removeAction:"Remover",closeAction:"Fechar",cancelAction:"Cancelar",startNewChatAction:"Iniciar novo bate-papo",rewindAction:"Retroceder",removeActionConfirm:"Remover",startNewChatTitle:"Iniciar um novo bate-papo a partir daqui?",startNewChatText:"Uma conversa separada será criada usando esta mensagem e tudo o que veio antes dela. O chat atual permanecerá intacto.",rewindTitle:"Retroceder até esta mensagem?",rewindText:"Tudo depois desta mensagem será removido, incluindo memórias posteriores. Isso não pode ser desfeito.",removeTitle:"Remover esta mensagem e tudo depois dela?",removeText:"Esta mensagem, todas as posteriores e as memórias ligadas a essa parte da conversa serão removidas. Isso não pode ser desfeito.",messageActions:"Ações da mensagem",categoryLabel:"Categoria",feedbackLabel:"Feedback",feedbackPlaceholder:"O que você gostaria de melhorar?"},
  es:{memberSince:"Miembro desde",editProfile:"Editar perfil",share:"Compartir",follow:"Seguir",following:"Siguiendo",report:"Denunciar",followers:"Seguidores",followingCount:"Siguiendo",likedBots:"Bots que te gustan",createdBots:"Bots creados",createBot:"Crear bot",emptyCreatedTitle:"Aún no has creado ningún bot",emptyCreatedText:"Crea un personaje y publícalo en la comunidad.",emptyLikedTitle:"Aún no te gusta ningún bot",emptyLikedText:"Explora personajes y marca los que quieras guardar.",changePhoto:"Cambiar foto",todayUsage:"Uso de hoy",deleteAllConversations:"Eliminar todas las conversaciones",feedbackDescription:"Ayúdanos a mejorar PersonaChat. No necesitamos tu conversación para hacerlo.",feedbackSent:"Comentarios enviados",copyProfile:"Enlace del perfil copiado.",cannotCopy:"No se pudo copiar el enlace.",deleteAccount:"Eliminar cuenta",deleteAccountDesc:"Esta acción es permanente y elimina los datos de tu cuenta.",deleteAccountEmail:"Correo",deleteAccountPassword:"Contraseña",saveChanges:"Guardar cambios",signOut:"Cerrar sesión",createFirstBot:"Crea tu primer bot",dailyLimitTitle:"El límite diario de pruebas ha terminado.",dailyLimitBody:"Los mensajes están pausados hasta que se restablezca el límite.",dailyLimitCountdown:"Podrás enviar mensajes de nuevo en",dailyLimitNow:"Ya puedes enviar mensajes de nuevo.",messageCreatedBy:"fue creado por",memoriesChat:"Ver y editar las memorias de este chat",categoryPopular:"Más populares",categoryNewest:"Más recientes",categoryAction:"Acción",categoryRomance:"Romance",categoryAnime:"Anime",categoryRealPeople:"Personas reales",categoryExistingCharacters:"Personajes existentes",categoryOriginalCharacters:"Personajes originales",leaveChat:"Salir del chat",copyAction:"Copiar",newChatFromHere:"Nuevo chat desde aquí",rewindToHere:"Retroceder hasta aquí",editAction:"Editar",pinAction:"Fijar",unpinAction:"Desfijar",removeAction:"Eliminar",closeAction:"Cerrar",cancelAction:"Cancelar",startNewChatAction:"Iniciar nuevo chat",rewindAction:"Retroceder",removeActionConfirm:"Eliminar",startNewChatTitle:"¿Iniciar un nuevo chat desde aquí?",startNewChatText:"Se creará una conversación separada usando este mensaje y todo lo anterior. Tu chat actual permanecerá sin cambios.",rewindTitle:"¿Retroceder hasta este mensaje?",rewindText:"Todo lo posterior a este mensaje se eliminará, incluidas las memorias posteriores. No se puede deshacer.",removeTitle:"¿Eliminar este mensaje y todo lo posterior?",removeText:"Este mensaje, todos los posteriores y las memorias vinculadas a esa parte de la conversación se eliminarán. No se puede deshacer.",messageActions:"Acciones del mensaje",categoryLabel:"Categoría",feedbackLabel:"Comentarios",feedbackPlaceholder:"¿Qué te gustaría mejorar?"},
  it:{memberSince:"Membro dal",editProfile:"Modifica profilo",share:"Condividi",follow:"Segui",following:"Seguito",report:"Segnala",followers:"Follower",followingCount:"Seguiti",likedBots:"Bot che ti piacciono",createdBots:"Bot creati",createBot:"Crea bot",emptyCreatedTitle:"Non hai ancora creato bot",emptyCreatedText:"Crea un personaggio e pubblicalo nella community.",emptyLikedTitle:"Non hai ancora messo mi piace a nessun bot",emptyLikedText:"Esplora i personaggi e metti mi piace a quelli che vuoi conservare.",changePhoto:"Cambia foto",todayUsage:"Utilizzo di oggi",deleteAllConversations:"Elimina tutte le conversazioni",feedbackDescription:"Aiutaci a migliorare PersonaChat. Non ci serve la tua conversazione per farlo.",feedbackSent:"Feedback inviato",copyProfile:"Link del profilo copiato.",cannotCopy:"Impossibile copiare il link.",deleteAccount:"Elimina account",deleteAccountDesc:"Questa azione è permanente e rimuove i dati del tuo account.",deleteAccountEmail:"Email",deleteAccountPassword:"Password",saveChanges:"Salva modifiche",signOut:"Esci",createFirstBot:"Crea il tuo primo bot",dailyLimitTitle:"Il limite giornaliero di prova è terminato.",dailyLimitBody:"I messaggi sono in pausa fino al ripristino del limite.",dailyLimitCountdown:"Potrai inviare di nuovo messaggi tra",dailyLimitNow:"Puoi inviare di nuovo messaggi.",messageCreatedBy:"è stato creato da",memoriesChat:"Visualizza e modifica le memorie di questa chat",categoryPopular:"Più popolari",categoryNewest:"Più recenti",categoryAction:"Azione",categoryRomance:"Romance",categoryAnime:"Anime",categoryRealPeople:"Persone reali",categoryExistingCharacters:"Personaggi esistenti",categoryOriginalCharacters:"Personaggi originali",leaveChat:"Esci dalla chat",copyAction:"Copia",newChatFromHere:"Nuova chat da qui",rewindToHere:"Torna indietro fino a qui",editAction:"Modifica",pinAction:"Fissa",unpinAction:"Sblocca",removeAction:"Rimuovi",closeAction:"Chiudi",cancelAction:"Annulla",startNewChatAction:"Avvia nuova chat",rewindAction:"Torna indietro",removeActionConfirm:"Rimuovi",startNewChatTitle:"Avvia una nuova chat da qui?",startNewChatText:"Verrà creata una conversazione separata usando questo messaggio e tutto ciò che lo precede. La chat attuale resterà invariata.",rewindTitle:"Tornare indietro a questo messaggio?",rewindText:"Tutto ciò che segue questo messaggio verrà rimosso, comprese le memorie successive. Non può essere annullato.",removeTitle:"Rimuovere questo messaggio e tutto ciò che segue?",removeText:"Questo messaggio, tutti i successivi e le memorie collegate a quella parte della conversazione verranno rimossi. Non può essere annullato.",messageActions:"Azioni del messaggio",categoryLabel:"Categoria",feedbackLabel:"Feedback",feedbackPlaceholder:"Cosa vorresti migliorare?"},
  fr:{memberSince:"Membre depuis",editProfile:"Modifier le profil",share:"Partager",follow:"Suivre",following:"Suivi",report:"Signaler",followers:"Abonnés",followingCount:"Abonnements",likedBots:"Bots aimés",createdBots:"Bots créés",createBot:"Créer un bot",emptyCreatedTitle:"Vous n'avez encore créé aucun bot",emptyCreatedText:"Créez un personnage et publiez-le dans la communauté.",emptyLikedTitle:"Vous n'avez encore aimé aucun bot",emptyLikedText:"Explorez les personnages et aimez ceux que vous souhaitez garder.",changePhoto:"Changer la photo",todayUsage:"Utilisation du jour",deleteAllConversations:"Supprimer toutes les conversations",feedbackDescription:"Aidez-nous à améliorer PersonaChat. Nous n'avons pas besoin de votre conversation pour cela.",feedbackSent:"Feedback envoyé",copyProfile:"Lien du profil copié.",cannotCopy:"Impossible de copier le lien.",deleteAccount:"Supprimer le compte",deleteAccountDesc:"Cette action est définitive et supprime les données de votre compte.",deleteAccountEmail:"E-mail",deleteAccountPassword:"Mot de passe",saveChanges:"Enregistrer les modifications",signOut:"Se déconnecter",createFirstBot:"Créez votre premier bot",dailyLimitTitle:"La limite quotidienne de test est atteinte.",dailyLimitBody:"Les messages sont en pause jusqu’à la réinitialisation de la limite.",dailyLimitCountdown:"Vous pourrez envoyer des messages dans",dailyLimitNow:"Vous pouvez à nouveau envoyer des messages.",messageCreatedBy:"a été créé par",memoriesChat:"Voir et modifier les mémoires de ce chat",categoryPopular:"Les plus populaires",categoryNewest:"Les plus récents",categoryAction:"Action",categoryRomance:"Romance",categoryAnime:"Anime",categoryRealPeople:"Personnes réelles",categoryExistingCharacters:"Personnages existants",categoryOriginalCharacters:"Personnages originaux",leaveChat:"Quitter le chat",copyAction:"Copier",newChatFromHere:"Nouvelle discussion à partir d’ici",rewindToHere:"Revenir jusqu’ici",editAction:"Modifier",pinAction:"Épingler",unpinAction:"Désépingler",removeAction:"Supprimer",closeAction:"Fermer",cancelAction:"Annuler",startNewChatAction:"Démarrer une nouvelle discussion",rewindAction:"Revenir",removeActionConfirm:"Supprimer",startNewChatTitle:"Démarrer une nouvelle discussion à partir d’ici ?",startNewChatText:"Une conversation séparée sera créée avec ce message et tout ce qui le précède. Votre discussion actuelle restera inchangée.",rewindTitle:"Revenir à ce message ?",rewindText:"Tout ce qui suit ce message sera supprimé, y compris les mémoires ultérieures. Cette action est irréversible.",removeTitle:"Supprimer ce message et tout ce qui suit ?",removeText:"Ce message, tous les suivants et les mémoires liés à cette partie de la conversation seront supprimés. Cette action est irréversible.",messageActions:"Actions du message",categoryLabel:"Catégorie",feedbackLabel:"Commentaires",feedbackPlaceholder:"Que souhaitez-vous améliorer ?"}
};
function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

function characterSearchScore(character: Character, query: string) {
  const q = normalizeSearchText(query);
  if (!q) return 0;
  const name = normalizeSearchText(character.name);
  const creator = normalizeSearchText(character.creator || "");
  const tags = character.tags.map(normalizeSearchText);
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (creator.includes(q)) return 3;
  if (tags.some(tag => tag.includes(q))) return 4;
  if (normalizeSearchText(character.description).includes(q)) return 5;
  return 6;
}

type ProfileData = {
  id: string; name: string; username: string; avatar: string | null; gender: "female" | "male" | null; createdAt: number;
  bots: CommunityBot[]; createdBotCount?: number; likedBotIds: string[]; likedBots: CommunityBot[]; followingUsers: {id:string;name:string;username:string;avatar:string|null}[]; followersUsers: {id:string;name:string;username:string;avatar:string|null}[]; followers: number; following: number;
  viewerFollowing: boolean;
};

function UserAvatar({ user, size = 40 }: { user: { name: string; avatar?: string | null }; size?: number }) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
  return user.avatar
    ? <img src={user.avatar} alt={user.name} className="avatar user-avatar" style={{ width:size, height:size }} />
    : <div className="avatar user-avatar user-avatar-initial" style={{ width:size, height:size }}>{initial}</div>;
}

function Avatar({ character, size = 52 }: { character: Character; size?: number }) {
  return <img src={character.image} alt={character.name} width={size} height={size} className="avatar" style={{ width: size, height: size }} />;
}

async function profileRequest(path = "/api/profile", options?: RequestInit) {
  const res = await fetch(path, { ...options, credentials: "include", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Unable to load the profile.");
  return data;
}

function toCharacter(bot: CommunityBot): Character { return bot; }

async function generateAIResponse(character: Character, userMessage: string, history: Message[], memories: Memory[], regenerate = false, mode?: "chat" | "greeting" | "continuation" | "summary", conversationSummary?: string, responseFeedback?: { value: "like" | "dislike"; tags: string[]; note?: string; previousResponse?: string }, conversationId?: string, language: AppLanguage = "en") {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ characterId: character.id, character, userMessage, history, memories, regenerate, language, mode: mode || (userMessage ? "chat" : "continuation"), variation: Math.random(), conversationSummary, responseFeedback, conversationId, provider: "gemini" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "Unable to generate the response.") as Error & { usage?: UsageClientState; usageLimit?: boolean; usageLimitReason?: string; retryAfterSeconds?: number; dailyResetAt?: number | null };
    if (data.usage) error.usage = data.usage as UsageClientState;
    error.usageLimit = data.usageLimit === true;
    error.usageLimitReason = data.usageLimitReason;
    error.retryAfterSeconds = Number.isFinite(Number(data.retryAfterSeconds)) ? Number(data.retryAfterSeconds) : undefined;
    error.dailyResetAt = typeof data.dailyResetAt === "number" ? data.dailyResetAt : null;
    throw error;
  }
  return { text: String(data.text || ""), relationship: data.relationship as RelationshipState | undefined, model: data.model as string | undefined, usage: data.usage as UsageClientState | undefined, requestId: data.requestId as string | undefined, alternatives: Array.isArray(data.alternatives) ? data.alternatives.map((x: any) => ({ label: String(x.label), text: String(x.text) })) : [], selectedAlternativeLabel: typeof data.selectedAlternativeLabel === "string" ? data.selectedAlternativeLabel : null };
}


function botTypeLabel(type: CharacterType) {
  if (type === "real_person") return "Real person";
  if (type === "existing_character") return "Existing character";
  return "Original character";
}

function BotTypeBadge({ type }: { type: CharacterType }) {
  return <span className={`bot-type-badge bot-type-${type}`}>{botTypeLabel(type)}</span>;
}

function RichText({ text }: { text: string }) {
  const normalizedText = String(text ?? "").replace(/\\n/g, "\n");
  const parts = normalizedText.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g);
  return <>
    {parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={index}>{part.slice(1, -1)}</em>;
      }
      return <span key={index}>{part}</span>;
    })}
  </>;
}

const authTranslations: Record<AppLanguage, Record<string,string>> = {
  pt:{eyebrow:"ROLEPLAY • PERSONAGENS • HISTÓRIAS",loginTitle:"Volte para a sua história",registerTitle:"Entre no PersonaChat",loginDesc:"Suas conversas, personagens e memórias esperam por você.",registerDesc:"Crie sua conta e comece a construir suas próprias histórias.",name:"Nome",namePlaceholder:"Como você quer ser chamado?",email:"E-mail",password:"Senha",passwordPlaceholder:"Sua senha",passwordMinimum:"Mínimo de 8 caracteres",hidePassword:"Ocultar",showPassword:"Mostrar",login:"Entrar",register:"Criar conta",loadingLogin:"Entrando...",loadingRegister:"Criando sua conta...",switchRegister:"Ainda não tem uma conta?",switchLogin:"Já tem uma conta?",continueGoogle:"Continuar com o Google",or:"ou",note:"Sessão protegida por cookie HttpOnly. Seus chats e memórias ficam associados à sua conta."},
  en:{eyebrow:"ROLEPLAY • CHARACTERS • STORIES",loginTitle:"Welcome back to your story",registerTitle:"Join PersonaChat",loginDesc:"Your conversations, characters, and memories are waiting for you.",registerDesc:"Create your account and start building your own stories.",name:"Name",namePlaceholder:"What should we call you?",email:"Email",password:"Password",passwordPlaceholder:"Your password",passwordMinimum:"At least 8 characters",hidePassword:"Hide",showPassword:"Show",login:"Log in",register:"Create account",loadingLogin:"Signing in...",loadingRegister:"Creating your account...",switchRegister:"Don't have an account yet?",switchLogin:"Already have an account?",continueGoogle:"Continue with Google",or:"or",note:"Your session is protected by an HttpOnly cookie. Your chats and memories are tied to your account."},
  es:{eyebrow:"ROLEPLAY • PERSONAJES • HISTORIAS",loginTitle:"Vuelve a tu historia",registerTitle:"Únete a PersonaChat",loginDesc:"Tus conversaciones, personajes y memorias te esperan.",registerDesc:"Crea tu cuenta y empieza a construir tus propias historias.",name:"Nombre",namePlaceholder:"¿Cómo quieres que te llamemos?",email:"Correo",password:"Contraseña",passwordPlaceholder:"Tu contraseña",passwordMinimum:"Mínimo 8 caracteres",hidePassword:"Ocultar",showPassword:"Mostrar",login:"Entrar",register:"Crear cuenta",loadingLogin:"Entrando...",loadingRegister:"Creando tu cuenta...",switchRegister:"¿Aún no tienes una cuenta?",switchLogin:"¿Ya tienes una cuenta?",continueGoogle:"Continuar con Google",or:"o",note:"Tu sesión está protegida por una cookie HttpOnly. Tus chats y memorias están asociados a tu cuenta."},
  it:{eyebrow:"ROLEPLAY • PERSONAGGI • STORIE",loginTitle:"Torna alla tua storia",registerTitle:"Entra in PersonaChat",loginDesc:"Le tue conversazioni, i personaggi e le memorie ti aspettano.",registerDesc:"Crea il tuo account e inizia a costruire le tue storie.",name:"Nome",namePlaceholder:"Come vuoi essere chiamato?",email:"Email",password:"Password",passwordPlaceholder:"La tua password",passwordMinimum:"Almeno 8 caratteri",hidePassword:"Nascondi",showPassword:"Mostra",login:"Accedi",register:"Crea account",loadingLogin:"Accesso...",loadingRegister:"Creazione account...",switchRegister:"Non hai ancora un account?",switchLogin:"Hai già un account?",continueGoogle:"Continua con Google",or:"o",note:"La sessione è protetta da un cookie HttpOnly. Chat e memorie sono associate al tuo account."},
  fr:{eyebrow:"ROLEPLAY • PERSONNAGES • HISTOIRES",loginTitle:"Retrouvez votre histoire",registerTitle:"Rejoignez PersonaChat",loginDesc:"Vos conversations, personnages et mémoires vous attendent.",registerDesc:"Créez votre compte et commencez à construire vos propres histoires.",name:"Nom",namePlaceholder:"Comment souhaitez-vous être appelé ?",email:"E-mail",password:"Mot de passe",passwordPlaceholder:"Votre mot de passe",passwordMinimum:"8 caractères minimum",hidePassword:"Masquer",showPassword:"Afficher",login:"Se connecter",register:"Créer un compte",loadingLogin:"Connexion...",loadingRegister:"Création du compte...",switchRegister:"Vous n'avez pas encore de compte ?",switchLogin:"Vous avez déjà un compte ?",continueGoogle:"Continuer avec Google",or:"ou",note:"Votre session est protégée par un cookie HttpOnly. Vos chats et mémoires sont associés à votre compte."}
};

function PasswordField({ mode, password, setPassword, loading, onSubmit, language }: { mode: "login" | "register"; password: string; setPassword: (v:string)=>void; loading:boolean; onSubmit:()=>void; language: AppLanguage }) {
  const [show, setShow] = useState(false); const a=authTranslations[language];
  return <label>{a.password}<div className="password-field"><input value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode === "login" ? a.passwordPlaceholder : a.passwordMinimum} type={show ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} onKeyDown={e=>{if(e.key==="Enter"&&!loading)onSubmit();}}/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?a.hidePassword:a.showPassword}>{show?<span>{a.hidePassword}</span>:<span>{a.showPassword}</span>}</button></div></label>
}

function AuthScreen({ mode, setMode, name, setName, email, setEmail, password, setPassword, error, onSubmit, loading, language }: {
  mode: "login" | "register"; setMode: (mode: "login" | "register") => void; name: string; setName: (v: string) => void; email: string; setEmail: (v: string) => void; password: string; setPassword: (v: string) => void; error: string; onSubmit: () => void; loading: boolean; language: AppLanguage
}) {
  const a=authTranslations[language];
  return <main className="auth-page"><div className="auth-card"><div className="auth-brand">Persona<span>Chat</span></div><div className="auth-copy"><div className="auth-eyebrow">{a.eyebrow}</div><h1>{mode === "login" ? a.loginTitle : a.registerTitle}</h1><p>{mode === "login" ? a.loginDesc : a.registerDesc}</p></div>{mode === "register" && <label>{a.name}<input value={name} maxLength={30} onChange={e => setName(e.target.value)} placeholder={a.namePlaceholder} autoComplete="name" /></label>}<label>{a.email}<input value={email} maxLength={254} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" type="email" autoComplete="email" /></label><PasswordField mode={mode} password={password} setPassword={setPassword} loading={loading} onSubmit={onSubmit} language={language} />{error && <div className="auth-error" role="alert">{error}</div>}<button className="auth-submit" onClick={onSubmit} disabled={loading}>{loading ? <><span className="auth-spinner" />{mode === "login" ? a.loadingLogin : a.loadingRegister}</> : mode === "login" ? a.login : a.register}</button><div className="auth-divider"><span>{a.or}</span></div><button type="button" className="google-auth-button" onClick={loginWithGoogle}><span className="google-glyph" aria-hidden="true">G</span>{a.continueGoogle}</button><div className="auth-switch">{mode === "login" ? a.switchRegister : a.switchLogin} <button disabled={loading} onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? a.register : a.login}</button></div><small className="auth-note">{a.note}</small></div></main>;
}

async function summarizeConversation(character: Character, conversation: Conversation, memories: Memory[], language: AppLanguage = "en") {
  if (conversation.messages.length < 20 || conversation.messages.length % 10 !== 0) return conversation.summary;
  const transcript = conversation.messages.slice(-60).map(m => `${m.sender === "user" ? "User" : character.name}: ${m.text}`).join("\n");
  const result = await generateAIResponse(character, "", conversation.messages.slice(-60), memories, false, "summary", transcript, undefined, conversation.id, language);
  return result.text.trim();
}


type CapacityClientState = {
  access: "granted" | "waiting";
  premiumBypass: boolean;
  capacity: number;
  activeCount: number;
  waitingCount: number;
  queuePosition: number;
  estimatedWaitSeconds: number;
  leaseExpiresAt: number | null;
};

function CapacityQueueScreen({ state }: { state: CapacityClientState }) {
  const minutes = Math.max(1, Math.ceil(state.estimatedWaitSeconds / 60));
  return <main className="capacity-page">
    <div className="capacity-card">
      <div className="capacity-icon"><Users size={25}/></div>
      <span className="capacity-eyebrow">PERSONACHAT CAPACITY</span>
      <h1>We are getting a lot of traffic right now.</h1>
      <p>To keep conversations stable, free access enters a queue when concurrent capacity is reached.</p>
      <div className="capacity-position"><strong>#{state.queuePosition}</strong><span>your position in the queue</span></div>
      <div className="capacity-estimate"><span>Estimated wait</span><strong>up to {minutes} min</strong></div>
      <div className="capacity-stats"><span>{state.activeCount}/{state.capacity} active sessions</span><span>{state.waitingCount} waiting</span></div>
      <div className="capacity-note"><Sparkles size={15}/><span>PersonaChat + gets priority and will not need to wait in the queue.</span></div>
      <small>Your position updates automatically. The estimate may change as people join or leave.</small>
    </div>
  </main>;
}

function PremiumModal({ open, onClose, plan, isAdmin = false }: { open: boolean; onClose: () => void; plan?: string; isAdmin?: boolean }) {
  const isPremium = plan === "premium";
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingInfo, setBillingInfo] = useState<{ monthlyUsd:number; yearlyUsd:number; annualSavingsPercent:number; billingAvailable:boolean; providers?:{stripe:boolean}; subscription?:{status:string;billing:string;provider?:string;providerCustomerId?:string|null;raw_json?:string|null}|null }>({ monthlyUsd:14.99, yearlyUsd:119.99, annualSavingsPercent:33, billingAvailable:false });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/premium", { credentials:"include", cache:"no-store" })
      .then(async r => { const d = await r.json(); if (!cancelled && r.ok) setBillingInfo(d); })
      .catch(() => { /* the modal keeps the local pricing fallback */ });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  async function subscribe() {
    if (isPremium || isAdmin) return;
    setCheckoutLoading(true); setBillingError("");
    try {
      const res = await fetch("/api/premium", { method:"POST", headers:{"Content-Type":"application/json"}, credentials:"include", body:JSON.stringify({ action:"checkout", billing }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível iniciar o pagamento.");
      if (!data.checkoutUrl) throw new Error("O Stripe não retornou um checkout.");
      window.location.assign(data.checkoutUrl);
    } catch (e) { setBillingError(e instanceof Error ? e.message : "Não foi possível iniciar o pagamento."); }
    finally { setCheckoutLoading(false); }
  }


  return <div className="premium-overlay" onClick={onClose}>
    <div className="premium-page" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="premium-title">
      <button className="premium-close" onClick={onClose} aria-label="Close"><X size={20}/></button>
      <section className="premium-hero">
        <div className="premium-hero-glow premium-hero-glow-one" />
        <div className="premium-hero-glow premium-hero-glow-two" />
        <div className="premium-hero-art" aria-hidden="true"><Sparkles size={54}/></div>
        <div className="premium-badge"><Sparkles size={17}/> PersonaChat +</div>
        <h2 id="premium-title">An even more complete experience.</h2>
        <p>More memory, deeper context, and public research when it actually makes a conversation better.</p>
      </section>
      <div className="premium-content">
        <section className="premium-comparison" aria-label="Plan comparison">
          <div className="premium-comparison-head"><div>Features</div><div>Free</div><div className="premium-column">+</div></div>
          {[
            { label:"Conversations with standard limits", detail:"The essentials to start chatting.", free:true, premium:true },
            { label:"Expanded memory", detail:"More room to retain important character and conversation details.", free:false, premium:true },
            { label:"More context for long conversations", detail:"Less context loss as the story grows.", free:false, premium:true },
            { label:"Priority regenerations", detail:"More freedom to try a different response when the scene is not what you wanted.", free:false, premium:true },
            { label:"Advanced character controls", detail:"More tools to fine-tune how the character behaves.", free:false, premium:true },
            { label:"Queue priority", detail:"Get in faster when free capacity is full.", free:false, premium:true },
            { label:"Live public context for real-person characters", detail:"Premium can research relevant public information when the conversation needs it, so real-person characters can keep up with current work and public facts — without replacing your roleplay context.", free:false, premium:true, featured:true },
            { label:"New PersonaChat+ features", detail:"Access to premium features added to the product.", free:false, premium:true },
          ].map(item => <div className={`premium-comparison-row ${item.featured ? "premium-comparison-row-featured" : ""}`} key={item.label}>
            <span><strong>{item.label}</strong><small>{item.detail}</small></span><b>{item.free ? <Check size={16}/> : "—"}</b><b className="premium-check">{item.premium ? <Check size={16}/> : "—"}</b>
          </div>)}
          <div className="premium-osint-note"><div className="premium-osint-icon"><Sparkles size={16}/></div><div><strong>Why does public context matter?</strong><p>A static character profile gets stale. PersonaChat+ can selectively research trustworthy public sources when a question benefits from fresh context, then use only approved facts inside the roleplay.</p></div></div>
          <p className="premium-disclaimer">Premium does not remove safety rules, expose private information, or turn public research into instructions inside your roleplay.</p>
        </section>
        <section className="premium-plans" aria-label="Subscription options">
          <div className="premium-plan-title"><span>Choose how you want to use PersonaChat+</span><small>{isAdmin ? "Admin access: PersonaChat+ is included." : isPremium ? "Your current plan is PersonaChat +." : billingInfo.billingAvailable ? "Secure checkout with a payment provider selected for your region." : "Payment checkout is not configured yet."}</small></div>
          <button type="button" className={`premium-plan-card ${billing === "monthly" ? "featured" : ""}`} onClick={()=>setBilling("monthly")} disabled={isPremium || isAdmin} aria-pressed={billing === "monthly"}>
            <div><span className="premium-plan-label">Monthly</span><strong>US$ {billingInfo.monthlyUsd.toFixed(2)}</strong><small>Billed every month.</small></div><span className={`premium-radio ${billing === "monthly" ? "selected" : ""}`} aria-hidden="true" />
          </button>
          <button type="button" className={`premium-plan-card featured ${billing === "yearly" ? "selected-plan" : ""}`} onClick={()=>setBilling("yearly")} disabled={isPremium || isAdmin} aria-pressed={billing === "yearly"}>
            <span className="premium-save">BEST VALUE · SAVE {billingInfo.annualSavingsPercent}%</span>
            <div><span className="premium-plan-label">Yearly</span><strong>US$ {billingInfo.yearlyUsd.toFixed(2)}</strong><small>One annual payment.</small></div><span className={`premium-radio ${billing === "yearly" ? "selected" : ""}`} aria-hidden="true" />
          </button>
          {billingError && <div className="auth-error" role="alert">{billingError}</div>}
          <p className="premium-renewal">Secure checkout. You can manage or cancel your subscription from your billing provider.</p>
          <button type="button" className="premium-main-btn" onClick={() => void subscribe()} disabled={checkoutLoading || isPremium || isAdmin || !billingInfo.billingAvailable}>
            {checkoutLoading ? "Opening checkout..." : isPremium || isAdmin ? "PersonaChat+ active" : billingInfo.billingAvailable ? `Continue with ${billing === "monthly" ? "monthly" : "yearly"} plan` : "Checkout unavailable"}
          </button>
          <button type="button" className="premium-dismiss" onClick={onClose}>Not now</button>
        </section>
      </div>
    </div>
  </div>;
}

function ExploreSection({
  title,
  subtitle,
  bots,
  likedBotIds,
  onOpenCharacter,
  onLikeBot,
}: {
  title: string;
  subtitle: string;
  bots: ExploreBot[];
  likedBotIds: string[];
  onOpenCharacter: (character: Character) => void;
  onLikeBot: (botId: string) => Promise<void> | void;
}) {
  return <section className="explore-section"><div className="section-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="character-grid">{bots.length ? bots.map(c=><div key={c.id} className="character-card-wrap"><button type="button" className="character-card" onClick={(event)=>{event.preventDefault(); event.stopPropagation(); onOpenCharacter(c)}}><div className="card-image">{c.image?<img src={c.image} alt={c.name} loading="lazy" decoding="async"/>:<div className="bot-placeholder"><Bot size={42}/></div>}</div><div className="card-body"><h3>{c.name}</h3><BotTypeBadge type={c.type}/><p>{c.sceneDescription || c.description}</p><div className="card-creator">by {c.creator}</div><div className="tags">{c.tags.map(t=><span key={t}>{t}</span>)}</div><div className="card-stats"><span><MessageCircle size={14}/> {Number(c.interactions ?? 0).toLocaleString("en-US")}</span><span><Heart size={14}/> {c.likes}</span></div></div></button><button type="button" className={`card-like ${likedBotIds.includes(c.id)?"liked":""}`} onClick={(e)=>{e.preventDefault();e.stopPropagation();void onLikeBot(c.id)}} title={likedBotIds.includes(c.id)?"Unlike":"Like"}><Heart size={16} fill={likedBotIds.includes(c.id)?"currentColor":"none"}/></button></div>) : <div className="explore-empty">No bots found.</div>}</div></section>;
}

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const isAdminUser = user?.isAdmin === true;
  const [capacity, setCapacity] = useState<CapacityClientState | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState(""); const [authEmail, setAuthEmail] = useState(""); const [authPassword, setAuthPassword] = useState(""); const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [profileView, setProfileView] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileTab, setProfileTab] = useState<"followers" | "following" | "created" | "liked">("created");
  const [profileGender, setProfileGender] = useState<"female" | "male" | "">("");
  const [profileEdit, setProfileEdit] = useState(false);
  const [profileName, setProfileName] = useState(""); const [profileUsername, setProfileUsername] = useState(""); const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const currentUserId = user?.id;
  useEffect(() => {
    if (!currentUserId) return;
    try { const raw = window.localStorage.getItem(`personachat_hidden_chats_${currentUserId}`); setHiddenChatIds(raw ? JSON.parse(raw) : []); } catch { setHiddenChatIds([]); }
  }, [currentUserId]);
  function hideChatCharacter(characterId: string) {
    const next = [...new Set([...hiddenChatIds, characterId])];
    setHiddenChatIds(next);
    if (user) window.localStorage.setItem(`personachat_hidden_chats_${user.id}`, JSON.stringify(next));
    setChatContextMenu(null);
  }
  function startChatPress(characterId: string) {
    if (typeof window === "undefined") return;
    if (chatPressTimer.current) window.clearTimeout(chatPressTimer.current);
    chatPressTimer.current = window.setTimeout(() => setChatContextMenu(characterId), 550);
  }
  function cancelChatPress() { if (chatPressTimer.current) window.clearTimeout(chatPressTimer.current); chatPressTimer.current = null; }


  useEffect(() => {
    function closeProfileMenu(event: MouseEvent) {
      if (profileWrapRef.current && !profileWrapRef.current.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", closeProfileMenu);
    return () => document.removeEventListener("mousedown", closeProfileMenu);
  }, []);

  useEffect(() => {
    if (!profileEdit) { setUsernameAvailable(null); return; }
    const clean = profileUsername.replace(/^@+/, "").toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) { setUsernameAvailable(null); return; }
    const timer = window.setTimeout(async () => {
      try { const res = await fetch(`/api/profile?username=${encodeURIComponent(clean)}`, { credentials: "include", cache: "no-store" }); const data = await res.json(); setUsernameAvailable(data.available === true); }
      catch { setUsernameAvailable(null); }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [profileEdit, profileUsername]);

  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [createBotOpen, setCreateBotOpen] = useState(false); const [createBotOrigin, setCreateBotOrigin] = useState<"home"|"profile"|null>(null);
  // Discovery preview: browsing should never silently create a chat. The preview lets the user
  // understand the character, then choose whether to resume or start a separate conversation.
  const [characterPreview, setCharacterPreview] = useState<Character | null>(null);
  const mobileCreateScrollRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 700px)").matches) return;
    if (createBotOpen) {
      const y = window.scrollY;
      mobileCreateScrollRef.current = y;
      const body = document.body;
      body.dataset.pcCreateLock = "1";
      body.style.position = "fixed";
      body.style.top = `-${y}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
      document.documentElement.style.overscrollBehavior = "none";
    } else if (document.body.dataset.pcCreateLock) {
      const body = document.body;
      const y = mobileCreateScrollRef.current ?? 0;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      delete body.dataset.pcCreateLock;
      document.documentElement.style.overscrollBehavior = "";
      window.scrollTo(0, y);
      mobileCreateScrollRef.current = null;
    }
    return () => {
      if (!document.body.dataset.pcCreateLock) return;
      const body = document.body;
      const y = mobileCreateScrollRef.current ?? 0;
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      body.style.overflow = "";
      delete body.dataset.pcCreateLock;
      document.documentElement.style.overscrollBehavior = "";
      window.scrollTo(0, y);
      mobileCreateScrollRef.current = null;
    };
  }, [createBotOpen]);
  const [profileMessage, setProfileMessage] = useState("");
  useEffect(() => {
    if (!profileView && createBotOpen && createBotOrigin === "profile") {
      setCreateBotOpen(false);
      setPreviewBotOpen(false);
      setEditingBotId(null);
      setCreateBotOrigin(null);
    }
  }, [profileView, createBotOpen, createBotOrigin]);
  const [previewBotOpen, setPreviewBotOpen] = useState(false);
  const [publishingBot, setPublishingBot] = useState(false);
  const openingCharacterRef = useRef<string | null>(null);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const emptyBotForm = { name:"", botType:"original" as CharacterType, description:"", greeting:"", personality:"", scenario:"", speechStyle:"", lore:"", tags:"", image:"", visibility:"public" as "public" | "private", realPersonSafety:false, exampleMessages:"" };
  const [botForm, setBotForm] = useState(emptyBotForm);
  const [communityBots, setCommunityBots] = useState<CommunityBot[]>([]);
  const [exploreData, setExploreData] = useState<ExploreData>({ trending: [], popular: [], newest: [], featured: [], all: [], categories: { real_person: [], existing_character: [], original: [] } });
  const [exploreOpen, setExploreOpen] = useState(false);
  const [exploreSearch, setExploreSearch] = useState("");
  const [likedBotIds, setLikedBotIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [relationships, setRelationships] = useState<Record<string, RelationshipState>>({});
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [search, setSearch] = useState(""); const [homeSearchFocused, setHomeSearchFocused] = useState(false); const [searchMode, setSearchMode] = useState<"characters" | "creators">("characters"); const [homeSearchSubmitted, setHomeSearchSubmitted] = useState(false); const [creatorSearchResults, setCreatorSearchResults] = useState<CreatorSearchResult[]>([]); const [chatSearch, setChatSearch] = useState(""); const [message, setMessage] = useState(""); const [chatError, setChatError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false); const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false); const [deleteAccountOpen, setDeleteAccountOpen] = useState(false); const [deleteAccountEmail, setDeleteAccountEmail] = useState(""); const [deleteAccountPassword, setDeleteAccountPassword] = useState(""); const [deleteAccountError, setDeleteAccountError] = useState(""); const [language,setLanguage]=useState<AppLanguage>("en"); const [theme,setTheme]=useState<ThemeMode>("dark");
  const [notifications,setNotifications]=useState(true); const [enterSends,setEnterSends]=useState(true);
  const t=useCallback((k:string)=>commonTranslations[language]?.[k]||translations[language][k]||translations.en[k]||translations.pt[k]||k,[language]);
  useEffect(() => { document.documentElement.lang = language === "pt" ? "pt-BR" : language === "es" ? "es" : language === "it" ? "it" : language === "fr" ? "fr" : "en"; }, [language]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ targetType: "message" | "bot" | "user"; targetId: string; messageId?: string; label: string } | null>(null);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminReports, setAdminReports] = useState<any[]>([]);
  const [adminInsightsOpen, setAdminInsightsOpen] = useState(false);
  const [adminInsights, setAdminInsights] = useState<any | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("feature");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState("");
  const [betaWelcomeOpen, setBetaWelcomeOpen] = useState(false);
  const [responseFeedbackOpen, setResponseFeedbackOpen] = useState(false);
  const [responseFeedbackMessageId, setResponseFeedbackMessageId] = useState<string | null>(null); const [feedbackPromptedIds, setFeedbackPromptedIds] = useState<string[]>([]);
  const [responseFeedbackValue, setResponseFeedbackValue] = useState<"like" | "dislike">("like");
  const [responseFeedbackTags, setResponseFeedbackTags] = useState<string[]>([]);
  const [responseFeedbackNote, setResponseFeedbackNote] = useState("");
  const [responseFeedbackStatus, setResponseFeedbackStatus] = useState("");
  const [usageStatus, setUsageStatus] = useState<UsageClientState | null>(null);
  const [conversationPanelOpen, setConversationPanelOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<"home" | "chats" | "profile">("home");
  const [mobileChatSearch, setMobileChatSearch] = useState("");
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>([]);
  const [chatContextMenu, setChatContextMenu] = useState<string | null>(null);
  const chatPressTimer = useRef<number | null>(null);
  const [characterProfileOpen, setCharacterProfileOpen] = useState(false);
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [messageConfirm, setMessageConfirm] = useState<{ action: "branch" | "rewind" | "remove"; messageId: string } | null>(null);
  const [generatingMessage, setGeneratingMessage] = useState(false); const [generatingConversationId, setGeneratingConversationId] = useState<string | null>(null); const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null); const [liveResponse, setLiveResponse] = useState<{ messageId: string; text: string } | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const MAX_RESPONSE_GENERATIONS = 8;
  const [responseAlternatives, setResponseAlternatives] = useState<Record<string, Array<{ label: string; text: string }>>>({});
  const [selectedAlternativeIndex, setSelectedAlternativeIndex] = useState<Record<string, number>>({}); const [editing, setEditing] = useState<string | null>(null); const [editText, setEditText] = useState(""); const [renamingConversation, setRenamingConversation] = useState<string | null>(null); const [renameText, setRenameText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const composerShellRef = useRef<HTMLDivElement | null>(null);
  const composerMetaRef = useRef<HTMLDivElement | null>(null);
  const generationInFlightRef = useRef(false);
  const revealConversationRef = useRef<string | null>(null);

  const allCharacters = useMemo(() => { const map = new Map<string, Character>(); [...baseCharacters, ...exploreData.all, ...communityBots].forEach(c => map.set(c.id, c)); return [...map.values()]; }, [communityBots, exploreData.all]);
  const visibleCharacters = useMemo(() => {
    const map = new Map<string, Character>();
    [...baseCharacters, ...exploreData.featured, ...communityBots].forEach(c => map.set(c.id, c));
    return [...map.values()].slice(0, 18);
  }, [exploreData.featured, communityBots]);
  const homeSearchSuggestions = useMemo(() => {
    if (homeSearchSubmitted) return [] as ExploreBot[];
    const query = normalizeSearchText(search);
    const seen = new Set<string>();
    const pool = exploreData.all
      .filter(c => c.visibility !== "private")
      .slice();
    const ranked = query
      ? pool
          .filter(c => characterSearchScore(c, query) < 6)
          .sort((a, b) => {
            const scoreA = characterSearchScore(a, query);
            const scoreB = characterSearchScore(b, query);
            return scoreA - scoreB || Number(b.interactions ?? 0) - Number(a.interactions ?? 0) || Number(b.likes ?? 0) - Number(a.likes ?? 0) || a.name.localeCompare(b.name, "pt-BR");
          })
      : pool.sort((a, b) => Number(b.interactions ?? 0) - Number(a.interactions ?? 0) || Number(b.likes ?? 0) - Number(a.likes ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
    return ranked.filter(c => {
      const key = c.name.trim().toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);
  }, [exploreData.all, homeSearchSubmitted, search]);

  const homeCharacterResults = useMemo(() => {
    const query = normalizeSearchText(search);
    if (!query || !homeSearchSubmitted || searchMode !== "characters") return [] as ExploreBot[];
    const localInteractions = new Map<string, number>();
    conversations.forEach(c => localInteractions.set(c.characterId, (localInteractions.get(c.characterId) || 0) + c.messages.filter(m => m.sender === "user").length));
    return allCharacters
      .filter(c => c.visibility !== "private")
      .filter(c => normalizeSearchText(c.name).includes(query))
      .map(c => ({ ...c, interactions: (exploreData.all.find(x => x.id === c.id)?.interactions ?? localInteractions.get(c.id) ?? 0) }))
      .sort((a,b) => characterSearchScore(a, query) - characterSearchScore(b, query) || a.name.localeCompare(b.name, "pt-BR"));
  }, [allCharacters, conversations, exploreData.all, homeSearchSubmitted, search, searchMode]);

  const sidebarConversations = useMemo(() => {
    const query = normalizeSearchText(chatSearch);
    const latestByCharacter = new Map<string, Conversation>();
    conversations
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach(conversation => {
        if (!latestByCharacter.has(conversation.characterId)) latestByCharacter.set(conversation.characterId, conversation);
      });

    return [...latestByCharacter.values()]
      .map(conversation => ({ conversation, character: allCharacters.find(character => character.id === conversation.characterId) }))
      .filter((entry): entry is { conversation: Conversation; character: Character } => Boolean(entry.character))
      .filter(({ character }) => !hiddenChatIds.includes(character.id))
      .filter(({ character }) => !query || characterSearchScore(character, query) < 6)
      .sort((a, b) => {
        if (!query) return b.conversation.updatedAt - a.conversation.updatedAt;
        return characterSearchScore(a.character, query) - characterSearchScore(b.character, query) || b.conversation.updatedAt - a.conversation.updatedAt;
      });
  }, [allCharacters, conversations, chatSearch, hiddenChatIds]);

  const filteredExplore = useMemo(() => {
    const query = normalizeSearchText(exploreSearch);
    if (!query) return exploreData.all;
    return exploreData.all
      .filter(c => characterSearchScore(c, query) < 6)
      .sort((a, b) => characterSearchScore(a, query) - characterSearchScore(b, query) || a.name.localeCompare(b.name, "pt-BR"));
  }, [exploreData.all, exploreSearch]);

  const homeCategorySections = useMemo(() => {
    const map = new Map<string, Character>();
    [...baseCharacters, ...exploreData.all, ...communityBots].forEach(c => { if (c.visibility !== "private") map.set(c.id, c); });
    const pool = [...map.values()];
    const metrics = (c: Character) => {
      const found = exploreData.all.find(x => x.id === c.id);
      return { likes: Number(found?.likes ?? c.likes ?? 0), interactions: Number(found?.interactions ?? 0), createdAt: Number(found?.createdAt ?? c.createdAt ?? 0) };
    };
    const tagged = (c: Character, words: string[]) => {
      const hay = [c.name, c.description, ...(c.tags ?? [])].map(normalizeSearchText).join(" ");
      return words.some(w => hay.includes(normalizeSearchText(w)));
    };
    const popular = [...pool].sort((a,b) => { const ma=metrics(a), mb=metrics(b); return (mb.likes*3+mb.interactions)-(ma.likes*3+ma.interactions) || metrics(b).createdAt-metrics(a).createdAt; }).slice(0,10);
    const newest = [...pool].sort((a,b) => metrics(b).createdAt-metrics(a).createdAt).slice(0,10);
    return [
      { key:"popular", title:t("categoryPopular"), items:popular },
      { key:"newest", title:t("categoryNewest"), items:newest },
      { key:"action", title:t("categoryAction"), items:pool.filter(c=>tagged(c,["ação","acao","action"])).slice(0,10) },
      { key:"romance", title:"Romance", items:pool.filter(c=>tagged(c,["romance","romântico","romantico"])).slice(0,10) },
      { key:"real", title:"Real people", items:pool.filter(c=>c.type==="real_person").slice(0,10) },
      { key:"anime", title:t("categoryAnime"), items:pool.filter(c=>tagged(c,["anime","manga","mangá"])).slice(0,10) },
    ].filter(section => section.items.length);
  }, [communityBots, exploreData.all, t]);

  async function loadProfile(id?: string) {
    try {
      const data = await profileRequest(id ? `/api/profile?id=${encodeURIComponent(id)}` : "/api/profile");
      setProfileData(data.profile);
      if (!id || id === user?.id) {
        setLikedBotIds(data.profile.likedBotIds);
        setCommunityBots(data.profile.bots);
        setProfileName(data.profile.name); setProfileUsername(data.profile.username);
        setProfileAvatar(data.profile.avatar);
      }
      return data.profile as ProfileData;
    } catch (e) { console.error(e); return null; }
  }

  function openReport(targetType: "message" | "bot" | "user", targetId: string, label: string, messageId?: string) {
    setReportTarget({ targetType, targetId, label, messageId });
    setReportReason("harassment"); setReportDetails(""); setReportStatus(""); setReportOpen(true);
  }

  async function submitReport() {
    if (!reportTarget) return;
    setReportStatus("Sending...");
    try {
      const res = await fetch("/api/reports", { method:"POST", credentials:"include", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ...reportTarget, reason:reportReason, details:reportDetails }) });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data.error || "Unable to submit the report.");
      setReportStatus("Report submitted. The team will review it.");
      window.setTimeout(()=>setReportOpen(false), 1200);
    } catch (e:any) { setReportStatus(e?.message || "Unable to submit the report."); }
  }

  async function loadAdminReports() {
    try { const res=await fetch("/api/reports",{credentials:"include",cache:"no-store"}); const data=await res.json(); if(!res.ok) throw new Error(data.error||"Acesso negado."); setAdminReports(data.reports||[]); setAdminOpen(true); } catch(e:any) { setProfileMessage(e?.message||"Unable to load moderation."); }
  }

  async function loadAdminInsights() {
    try { const res=await fetch("/api/insights",{credentials:"include",cache:"no-store"}); const data=await res.json(); if(!res.ok) throw new Error(data.error||"Acesso negado."); setAdminInsights(data); setAdminInsightsOpen(true); } catch(e:any) { setProfileMessage(e?.message||"Unable to load insights."); }
  }

  const [dailyLimitCountdown, setDailyLimitCountdown] = useState(0);
  useEffect(() => {
    const update = () => {
      const target = Number(usageStatus?.dailyResetAt ?? 0);
      setDailyLimitCountdown(target > Date.now() ? Math.ceil((target - Date.now()) / 1000) : 0);
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [usageStatus?.dailyResetAt]);

  function formatCountdown(totalSeconds: number) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${seconds}s`;
  }

  function resizeComposer(textarea: HTMLTextAreaElement | null) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 140)}px`;
  }

  function handleComposerChange(value: string) {
    setMessage(value);
    resizeComposer(composerRef.current);
    const end = messagesEndRef.current;
    const scroller = end?.parentElement;
    if (scroller) {
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      if (distanceFromBottom <= 140) requestAnimationFrame(() => end?.scrollIntoView({ behavior: "auto", block: "end" }));
    }
  }

  useEffect(() => {
    const shell = composerShellRef.current;
    const meta = composerMetaRef.current;
    const chat = shell?.closest<HTMLElement>(".chat-main");
    if (!shell || !chat || typeof ResizeObserver === "undefined") return;

    const syncComposerMetrics = () => {
      chat.style.setProperty("--pc-composer-height", `${Math.ceil(shell.getBoundingClientRect().height)}px`);
      chat.style.setProperty("--pc-composer-meta-height", `${Math.ceil(meta?.getBoundingClientRect().height ?? 0)}px`);
      const end = messagesEndRef.current;
      const scroller = end?.parentElement;
      if (scroller) {
        const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
        if (distanceFromBottom <= 140) requestAnimationFrame(() => end?.scrollIntoView({ behavior: "auto", block: "end" }));
      }
    };
    syncComposerMetrics();
    const observer = new ResizeObserver(syncComposerMetrics);
    observer.observe(shell);
    if (meta) observer.observe(meta);
    window.addEventListener("resize", syncComposerMetrics);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncComposerMetrics);
      chat.style.removeProperty("--pc-composer-height");
      chat.style.removeProperty("--pc-composer-meta-height");
    };
  }, [activeConversation, selected]);

  async function loadUsageStatus() {
    try { const res=await fetch("/api/usage",{credentials:"include",cache:"no-store"}); const data=await res.json(); if(res.ok && data.usage) setUsageStatus(data.usage as UsageClientState); } catch { /* usage is informative; chat remains server-protected */ }
  }

  async function submitProductFeedback() {
    const text=feedbackText.trim();
    if(text.length<3) { setFeedbackStatus("Write at least a few words."); return; }
    setFeedbackStatus("Sending...");
    try { const res=await fetch("/api/feedback",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:feedbackCategory,text})}); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||"Unable to send feedback."); setFeedbackStatus("Obrigado. Seu feedback foi enviado."); setFeedbackText(""); window.setTimeout(()=>{setFeedbackOpen(false);setFeedbackStatus("")},900); } catch(e:any) { setFeedbackStatus(e?.message||"Unable to send feedback."); }
  }

  async function updateReport(id:string,status:string,priority?:string) {
    try { const res=await fetch("/api/reports",{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,status,priority,resolutionNote:status==="resolved"?"Moderation action completed.":status==="dismissed"?"Report reviewed and dismissed.":""})}); const data=await res.json(); if(!res.ok) throw new Error(data.error||"Unable to update."); await loadAdminReports(); } catch(e:any) { setProfileMessage(e?.message||"Unable to update the report."); }
  }

  async function loadExplore(query = "") {
    try {
      const data = await profileRequest(`/api/community${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setExploreData(data);
      return data as ExploreData;
    } catch (e) { console.error(e); return null; }
  }

  useEffect(() => {
    const updateViewport = () => {
      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const offset = Math.max(0, window.innerHeight - height - (vv?.offsetTop ?? 0));
      document.documentElement.style.setProperty("--pc-keyboard-offset", `${offset}px`);
      document.documentElement.style.setProperty("--pc-viewport-height", `${height}px`);
    };
    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, []);

  useEffect(()=>{try{const raw=localStorage.getItem("personachat-settings");const s=JSON.parse(raw||"{}");if(!localStorage.getItem("personachat-language-v2")){localStorage.setItem("personachat-language-v2","1");setLanguage("en");}else if(["pt","en","es","it","fr"].includes(s.language))setLanguage(s.language);if(s.theme)setTheme(s.theme);if(typeof s.notifications==="boolean")setNotifications(s.notifications);if(typeof s.enterSends==="boolean")setEnterSends(s.enterSends);}catch{}},[])
  const hasAuthenticatedUser = Boolean(user?.id);
  useEffect(() => {
    if (!hasAuthenticatedUser) return;
    try {
      const seen = localStorage.getItem("personachat-beta-welcome-v1");
      if (!seen) setBetaWelcomeOpen(true);
    } catch { /* storage may be unavailable */ }
  }, [hasAuthenticatedUser]);

  function dismissBetaWelcome() {
    setBetaWelcomeOpen(false);
    try { localStorage.setItem("personachat-beta-welcome-v1", "1"); } catch { /* non-critical */ }
  }
;
  useEffect(()=>{const root=document.documentElement;root.dataset.theme=theme==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):theme;root.lang=language;localStorage.setItem("personachat-settings",JSON.stringify({language,theme,notifications,enterSends}));},[language,theme,notifications,enterSends]);
  useEffect(()=>{if(theme!=="system")return;const m=window.matchMedia("(prefers-color-scheme: light)");const f=()=>{document.documentElement.dataset.theme=m.matches?"light":"dark"};m.addEventListener("change",f);return()=>m.removeEventListener("change",f)},[theme]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "google_error") {
      const reason = params.get("reason");
      const messages: Record<string, string> = { not_configured: "Google sign-in is not configured yet.", cancelled: "Google sign-in was cancelled.", invalid_state: "Google sign-in could not be verified. Please try again.", token_exchange: "Google sign-in could not be completed. Please try again.", profile_lookup: "Google account information could not be retrieved.", unverified_account: "Google could not verify this account.", account_conflict: "This Google account is linked to another PersonaChat account.", rate_limited: "Too many sign-in attempts. Please try again shortly.", server_error: "Google sign-in failed. Please try again." };
      setAuthError(messages[reason || ""] || "Google sign-in failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    getSession().then(async session => {
      setUser(session);
      if (session) {
        try {
          const data = await loadAppData(); setConversations(data.conversations); setMemories(data.memories); setRelationships(data.relationships);
          const profile = await profileRequest();
          setProfileData(profile.profile); setLikedBotIds(profile.profile.likedBotIds); setCommunityBots(profile.profile.bots);
          setProfileName(profile.profile.name); setProfileUsername(profile.profile.username); setProfileAvatar(profile.profile.avatar); setProfileGender(profile.profile.gender ?? "");
          await loadExplore();
          await loadUsageStatus();
          const sharedId = new URLSearchParams(window.location.search).get("profile");
          if (sharedId && sharedId !== session.id) {
            const shared = await profileRequest(`/api/profile?id=${encodeURIComponent(sharedId)}`);
            setProfileData(shared.profile); setProfileView(true);
          }
        } catch (e) { console.error(e); }
      }
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!authReady || !hasAuthenticatedUser) return;
    const timer = window.setInterval(() => { void loadUsageStatus(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [authReady, hasAuthenticatedUser]);

  const capacityRef = useRef<CapacityClientState | null>(null);
  useEffect(() => { capacityRef.current = capacity; }, [capacity]);

  useEffect(() => {
    if (!authReady || !hasAuthenticatedUser) {
      setCapacity(null);
      capacityRef.current = null;
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const requestCapacity = async (action?: "join" | "heartbeat") => {
      try {
        const res = action
          ? await fetch("/api/capacity", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })
          : await fetch("/api/capacity", { credentials: "include", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.capacity || cancelled) return;
        const next = data.capacity as CapacityClientState;
        capacityRef.current = next;
        setCapacity(next);
      } catch {
        // Keep the current state during transient network failures.
      }
    };

    void requestCapacity("join");
    const tick = () => {
      void requestCapacity(capacityRef.current?.access === "granted" ? "heartbeat" : undefined);
      timer = window.setTimeout(tick, capacityRef.current?.access === "granted" ? 30_000 : 5_000);
    };
    timer = window.setTimeout(tick, 5_000);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      void fetch("/api/capacity", { method: "DELETE", credentials: "include", keepalive: true }).catch(() => {});
    };
  }, [authReady, user?.id, hasAuthenticatedUser]);

  useEffect(() => {
    if (!authReady || !hasAuthenticatedUser) return;
    let timer: number | null = null;
    let cancelled = false;
    const sync = async () => {
      // Never replace live chat state with a server snapshot while a generation is in flight.
      // The server may still contain the pre-send conversation for a few seconds, which used
      // to make the optimistic user message disappear and then reappear after the reply arrived.
      if (cancelled || isSavePending() || generationInFlightRef.current || document.visibilityState !== "visible") return;
      try {
        const data = await syncAppData();
        if (!data || cancelled) return;
        setConversations(data.conversations);
        setMemories(data.memories);
        setRelationships(data.relationships);
        if (activeConversation && !data.conversations.some(c => c.id === activeConversation)) setActiveConversation(null);
      } catch {
        // Cross-device sync is best-effort; the local state remains usable.
      }
    };
    const schedule = () => { if (timer !== null) window.clearTimeout(timer); timer = window.setTimeout(async () => { await sync(); schedule(); }, 15000); };
    const onFocus = () => { void sync(); schedule(); };
    const onVisibility = () => { if (document.visibilityState === "visible") { void sync(); schedule(); } };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisibility); };
  }, [authReady, user?.id, hasAuthenticatedUser, activeConversation]);

  useEffect(() => {
    if (!authReady || !hasAuthenticatedUser) return;
    const characterId = new URLSearchParams(window.location.search).get("character");
    if (!characterId || selected?.id === characterId) return;
    const target = allCharacters.find(c => c.id === characterId);
    if (target) {
      window.history.replaceState({}, "", window.location.pathname);
      openCharacter(target);
    }
  // openCharacter is a function declaration recreated on render; adding it here would make the deep-link effect rerun on every render.
  // The effect is guarded by the URL character id and only runs when auth/character data changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, hasAuthenticatedUser, allCharacters, selected?.id]);

  async function submitHomeSearch(mode: "characters" | "creators" = searchMode, value = search) {
    const query = value.trim();
    if (!query) return;
    setSearch(query); setSearchMode(mode); setHomeSearchSubmitted(true);
    if (mode === "creators") {
      try {
        const res = await fetch(`/api/community?mode=creators&q=${encodeURIComponent(query)}`, { credentials:"include", cache:"no-store" });
        const data = await res.json();
        setCreatorSearchResults(Array.isArray(data.creators) ? data.creators : []);
      } catch { setCreatorSearchResults([]); }
    } else {
      setCreatorSearchResults([]);
    }
  }
  function clearHomeSearch() { setSearch(""); setHomeSearchSubmitted(false); setCreatorSearchResults([]); }

  async function submitAuth() {
    if (authLoading) return;
    setAuthError("");
    setAuthLoading(true);
    try {
      const result = authMode === "login" ? await login(authEmail, authPassword) : await register(authName, authEmail, authPassword);
      if (result.error) { setAuthError(result.error); return; }
      if (result.user) {
        setUser(result.user);
        try { const data = await loadAppData(); setConversations(data.conversations); setMemories(data.memories); setRelationships(data.relationships); const p = await profileRequest(); setProfileData(p.profile); setLikedBotIds(p.profile.likedBotIds); setCommunityBots(p.profile.bots); setProfileName(p.profile.name); setProfileUsername(p.profile.username); setProfileAvatar(p.profile.avatar); await loadExplore(); } catch (e) { console.error(e); }
      }
      setAuthPassword("");
    } catch {
      setAuthError("Unable to complete this right now. Please try again.");
    } finally {
      setAuthLoading(false);
    }
  }

  function signOut() { void fetch("/api/capacity", { method: "DELETE", credentials: "include", keepalive: true }).catch(() => {}); logout(); setCapacity(null); setUser(null); setProfileOpen(false); setProfileView(false); setSelected(null); setActiveConversation(null); }

  async function openProfile(id?: string) { setProfileOpen(false); const p = await loadProfile(id); if (p) { setProfileView(true); setProfileTab("created"); setMobileTab("profile"); } }

  async function updateProfile() {
    try {
      const res = await profileRequest("/api/profile", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:profileName,username:profileUsername,avatar:profileAvatar,gender:profileGender || null}) });
      setProfileData(res.profile); setProfileAvatar(res.profile.avatar); setProfileGender(res.profile.gender ?? ""); setProfileEdit(false); setProfileMessage("Profile updated.");
      if (user) setUser({...user, name:res.profile.name, username:res.profile.username, avatar:res.profile.avatar, gender:res.profile.gender ?? null});
    } catch (e:any) { setProfileMessage(e.message); }
  }

  function chooseAvatar(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setProfileMessage("Choose an image."); return; }
    if (file.size > 1_500_000) { setProfileMessage("Use an image up to 1.5 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setProfileAvatar(String(reader.result)); reader.readAsDataURL(file);
  }

  async function communityAction(action:string, targetId:string) {
    try {
      const res = await profileRequest("/api/profile", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({action,targetId}) });
      if (action === "like-bot") { setLikedBotIds(ids => res.liked ? [...new Set([...ids,targetId])] : ids.filter(id=>id!==targetId)); await loadExplore(exploreSearch); }
      if (action === "follow") await loadProfile(profileData?.id);
      if (action === "follow" && profileData) setProfileData({...profileData, followers: profileData.followers + (res.following ? 1 : -1), viewerFollowing:res.following});
    } catch(e:any) { setProfileMessage(e.message); }
  }

  async function saveBot() {
    if (publishingBot) return;
    setPublishingBot(true);
    setProfileMessage("");
    try {
      const tags = botForm.tags.split(",").map(s=>s.trim()).filter(Boolean);
      const action = editingBotId ? "update-bot" : "create-bot";
      const previousBot = editingBotId ? communityBots.find(x => x.id === editingBotId) : undefined;
      const previousGreeting = previousBot?.greeting ?? "";
      const res = await profileRequest("/api/profile", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,botId:editingBotId,...botForm,tags})
      });
      const bot = res.bot as CommunityBot;
      if (!bot?.id) throw new Error("The server did not confirm the character publication.");

      if (editingBotId) {
        setCommunityBots(b => b.map(x => x.id === editingBotId ? bot : x));

        // Keep an already-open character in sync immediately. The greeting is
        // normally the first persisted message of a conversation, so an editor
        // change should be visible right away when that message has not itself
        // been customized. Never overwrite a regenerated/edited first message.
        if (selected?.id === editingBotId) {
          setSelected(current => current ? { ...current, ...bot } : current);
        }
        if (active && active.characterId === editingBotId && previousGreeting && bot.greeting !== previousGreeting) {
          const firstMessage = active.messages[0];
          if (firstMessage?.sender === "character" && firstMessage.text === previousGreeting) {
            const updatedActive = {
              ...active,
              messages: active.messages.map((message, index) => index === 0 ? { ...message, text: bot.greeting } : message),
              updatedAt: Date.now(),
            };
            const nextConversations = conversations.map(c => c.id === active.id ? updatedActive : c);
            setConversations(nextConversations);
            await saveAppData(nextConversations, memories, relationships);
          }
        }
      } else {
        setCommunityBots(b => [bot, ...b]);
      }
      const wasEditing = Boolean(editingBotId);
      setCreateBotOpen(false);
      setEditingBotId(null);
      setBotForm({...emptyBotForm});
      await loadProfile();
      await loadExplore();
      setProfileMessage(wasEditing ? "Bot updated successfully." : "Bot published successfully.");
    } catch(e:any) {
      setProfileMessage(e?.message || "Unable to publish the bot. Please try again.");
    } finally {
      setPublishingBot(false);
    }
  }


  function startEditBot(bot: CommunityBot) {
    setEditingBotId(bot.id);
    setBotForm({
      name: bot.name, botType: bot.type, description: bot.description, greeting: bot.greeting,
      personality: bot.personality, scenario: bot.scenario ?? "", speechStyle: bot.speechStyle ?? "",
      lore: bot.lore ?? "", tags: (bot.tags ?? []).join(", "), image: bot.image ?? "",
      visibility: bot.visibility === "private" ? "private" : "public", realPersonSafety: bot.type === "real_person",
      exampleMessages: (bot.exampleMessages ?? []).join("\n"),
    });
    setPreviewBotOpen(false);
    setCreateBotOpen(true);
  }

  async function deleteBot(bot: CommunityBot) {
    if (!window.confirm(`Delete "${bot.name}"? This action cannot be undone.`)) return;
    try {
      await profileRequest("/api/profile", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"delete-bot",targetId:bot.id})});
      setCommunityBots(b => b.filter(x => x.id !== bot.id));
      await loadProfile(); await loadExplore();
      setProfileMessage("Bot deleted.");
    } catch(e:any) { setProfileMessage(e.message); }
  }

  async function deleteAccount() {
    if (!user || !deleteAccountEmail.trim() || !deleteAccountPassword) {
      setDeleteAccountError("Confirm your email and password.");
      return;
    }
    setDeleteAccountError("");
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: deleteAccountEmail.trim(), password: deleteAccountPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to delete the account.");
      setDeleteAccountOpen(false);
      setDeleteAccountEmail("");
      setDeleteAccountPassword("");
      await logout();
      setUser(null);
      setSelected(null);
      setActiveConversation(null);
    } catch (e: any) {
      setDeleteAccountError(e?.message || "Unable to delete the account.");
    }
  }

  async function refreshCurrentChat() {
    try {
      const data = await loadAppData();
      setConversations(data.conversations);
      setMemories(data.memories);
      setRelationships(data.relationships);
      if (activeConversation && !data.conversations.some(c => c.id === activeConversation)) {
        setActiveConversation(null);
      }
      setProfileMessage("Chat updated.");
    } catch (e: any) {
      setProfileMessage(e?.message || "Unable to refresh the chat.");
    }
  }

  async function shareCharacter() {
    if (!selected) return;
    const url = `${window.location.origin}/?character=${encodeURIComponent(selected.id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setProfileMessage("Character link copied.");
    } catch {
      try {
        const input = document.createElement("input");
        input.value = url;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("copy failed");
        setProfileMessage("Character link copied.");
      } catch {
        setProfileMessage("Unable to copy the character link.");
      }
    }
  }

  async function openCharacterCreatorProfile() {
    if (!selected?.creatorId) {
      setProfileMessage("This character does not have an associated creator profile.");
      return;
    }
    const profile = await loadProfile(selected.creatorId);
    if (profile) {
      setConversationPanelOpen(false);
      setProfileView(true);
      setProfileTab("created");
    } else {
      setProfileMessage("Unable to load the creator profile.");
    }
  }


  async function createDynamicConversation(character: Character) {
    // Opening a character can involve an async persistence step. Guard the
    // transition so a fast double-tap on mobile cannot create two empty chats.
    if (openingCharacterRef.current === character.id) return;
    openingCharacterRef.current = character.id;
    const created = createConversation(character.id, "");
    const next = [created, ...conversations];
    // A new roleplay is intentionally isolated: no user memories, relationship
    // state, emotional state, or previous scene context are carried into it.
    // Older conversations remain stored so the user can return to them later.
    const nextRelationships = { ...relationships };
    delete nextRelationships[created.id];
    setConversations(next);
    setRelationships(nextRelationships);
    setMemories(memories);
    setActiveConversation(created.id);

    const firstMessage: Message = { id: makeClientId(), sender: "character", text: character.greeting, createdAt: Date.now() };
    const updated = { ...created, messages: [firstMessage], updatedAt: Date.now() };
    const saved = next.map(c => c.id === created.id ? updated : c);
    setConversations(saved);
    try {
      await saveAppData(saved, memories, nextRelationships);
    } finally {
      if (openingCharacterRef.current === character.id) openingCharacterRef.current = null;
    }
  }

  function openCharacter(character: Character) {
    enterCharacterChat(character, false);
  }

  function enterCharacterChat(character: Character, startNew = false) {
    setExploreOpen(false);
    setCharacterPreview(null);
    setProfileView(false);
    setMobileTab("home");
    setSelected(character);
    const existing = conversations.filter(c => c.characterId === character.id).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if (!startNew && existing) setActiveConversation(existing.id);
    else void createDynamicConversation(character);
  }

  function newConversation() {
    if (!selected) return;
    void createDynamicConversation(selected);
  }

  async function revealResponse(messageId: string, text: string, conversationId: string) {
    const clean = String(text ?? "").trim();
    if (!clean) return;

    // The provider currently returns one payload, so the UI owns the presentation
    // stream. Keep the typing indicator in the same bubble, then reveal the response
    // progressively without making long replies feel artificially slow. The conversation
    // guard below prevents a completed response from a chat we already left from writing
    // into the currently visible chat state.
    revealConversationRef.current = conversationId;
    setLiveResponse({ messageId, text: "" });
    const total = clean.length;
    const targetDuration = Math.min(4200, Math.max(700, total * 7));
    const tickMs = 12;
    const ticks = Math.max(1, Math.ceil(targetDuration / tickMs));
    const charsPerTick = Math.max(1, Math.ceil(total / ticks));

    for (let index = 0; index < total; index += charsPerTick) {
      if (revealConversationRef.current !== conversationId) return;
      const visible = clean.slice(0, Math.min(total, index + charsPerTick));
      setLiveResponse({ messageId, text: visible });
      await new Promise<void>(resolve => window.setTimeout(resolve, tickMs));
    }

    if (revealConversationRef.current === conversationId) setLiveResponse({ messageId, text: clean });
  }

  function getStarterPrompts(character: Character) {
    if (character.type === "real_person") {
      return [
        "What have you been working on lately?",
        "What are you like when the cameras are off?",
        "Tell me something people usually get wrong about you."
      ];
    }
    if (character.type === "existing_character") {
      return [
        "So... what are we getting into?",
        "Tell me what's going on here.",
        "What should I know before we start?"
      ];
    }
    return [
      "So, tell me about yourself.",
      "What happens next?",
      "Let's see where this goes."
    ];
  }

  function getLatestResponseFeedback(messages: Message[]) {
    const latest = [...messages].reverse().find(m => m.sender === "character" && (m.feedback === "like" || m.feedback === "dislike"));
    if (!latest?.feedback) return undefined;
    return {
      value: latest.feedback as "like" | "dislike",
      tags: latest.feedbackTags ?? [],
      note: latest.feedbackNote,
      previousResponse: latest.text,
    };
  }

  async function sendMessage() {
    // Only one generation may own the UI at a time. A user can switch chats while
    // a response is finishing, but starting a second generation concurrently would
    // race the global composer/streaming state and could leak one chat's error or typing state into another.
    if (!active || !selected || generationInFlightRef.current || regeneratingMessageId) return;
    if (!isAdminUser && usageStatus && usageStatus.used.dailyTokens >= usageStatus.limits.dailyTokens) {
      setChatError("The daily test limit has ended. Messaging is paused until the limit resets.");
      return;
    }
    setChatError("");
    const text = message.trim();

    if (!text) {
      try {
        generationInFlightRef.current = true;
        setGeneratingMessage(true);
        setGeneratingConversationId(active.id);
        const botId = makeClientId();
        setLiveResponse({ messageId: botId, text: "" });
        const result = await generateAIResponse(selected, "", active.messages, memories.filter(m => m.conversationId === active.id), false, "continuation", active.summary, getLatestResponseFeedback(active.messages), active.id, language);
        if (result.usage) setUsageStatus(result.usage);
        await revealResponse(botId, result.text, active.id);
        const bot: Message = { id: botId, sender: "character", text: result.text, createdAt: Date.now() };
        const updated = { ...active, messages: [...active.messages, bot], updatedAt: Date.now() };
        const next = conversations.map(c => c.id === active.id ? updated : c);
        const nextRelationships = result.relationship ? { ...relationships, [active.id]: result.relationship } : relationships;
        setConversations(next); setRelationships(nextRelationships);
        setLiveResponse(null);
        setResponseAlternatives(prev => ({ ...prev, [botId]: [{ label: "G1", text: result.text }] }));
        setSelectedAlternativeIndex(prev => ({ ...prev, [botId]: 0 }));
        await saveAppData(next, memories, nextRelationships);
        await fetch("/api/response-alternatives", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, messageId: botId, alternatives: [{ label: "G1", text: result.text }], selectedLabel: "G1", append: false }) }).catch(() => {});
      } catch (e: any) {
        if (e?.usage) setUsageStatus(e.usage as UsageClientState);
        if (activeConversation === active.id) setChatError(e?.message || "Unable to continue the scene.");
      } finally {
        generationInFlightRef.current = false;
        setGeneratingMessage(false);
        setGeneratingConversationId(prev => prev === active.id ? null : prev);
      }
      return;
    }

    const baseConversation = active;
    const userMsg: Message = { id: makeClientId(), sender: "user", text, createdAt: Date.now() };
    const optimistic = { ...baseConversation, messages: [...baseConversation.messages, userMsg], updatedAt: Date.now() };
    const nextOptimistic = conversations.map(c => c.id === baseConversation.id ? optimistic : c);
    setConversations(nextOptimistic);
    setMessage("");

    try {
      generationInFlightRef.current = true;
      setGeneratingMessage(true);
      setGeneratingConversationId(active.id);
      // Persist the optimistic user message immediately. This prevents the periodic
      // cross-device sync from restoring the old conversation while the model is thinking.
      void saveAppData(nextOptimistic, memories, relationships);
      const botId = makeClientId();
      setLiveResponse({ messageId: botId, text: "" });
      const replyResult = await generateAIResponse(selected, text, active.messages, memories.filter(m => m.conversationId === active.id), false, "chat", active.summary, getLatestResponseFeedback(active.messages), active.id, language);
      if (replyResult.usage) setUsageStatus(replyResult.usage);
      await revealResponse(botId, replyResult.text, active.id);
      const bot: Message = { id: botId, sender: "character", text: replyResult.text, createdAt: Date.now() };
      const updated = { ...optimistic, messages: [...optimistic.messages, bot], title: active.messages.length <= 1 ? text.slice(0, 32) : active.title, updatedAt: Date.now() };
      const next = conversations.map(c => c.id === active.id ? updated : c);
      const nextRelationships = replyResult.relationship ? { ...relationships, [active.id]: replyResult.relationship } : relationships;
      setConversations(next); setRelationships(nextRelationships);
      setLiveResponse(null);
      setResponseAlternatives(prev => ({ ...prev, [botId]: [{ label: "G1", text: replyResult.text }] }));
      setSelectedAlternativeIndex(prev => ({ ...prev, [botId]: 0 }));
      await saveAppData(next, memories, nextRelationships);
      await fetch("/api/response-alternatives", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, messageId: botId, alternatives: [{ label: "G1", text: replyResult.text }], selectedLabel: "G1", append: false }) }).catch(() => {});

      const extracted = extractMemories(selected.id, text, userMsg.id, memories.filter(m => m.conversationId === active.id)).map(m => ({...m, conversationId: active.id}));
      let memNext = memories;
      if (extracted.length) {
        memNext = supersedeConflicts([...extracted, ...memories], extracted);
        setMemories(memNext);
      }
      const savedConversation = next.find(c => c.id === active.id);
      if (savedConversation && savedConversation.messages.length >= 20 && savedConversation.messages.length % 10 === 0) {
        try {
          const summary = await summarizeConversation(selected, savedConversation, memNext, language);
          if (summary) {
            const withSummary = next.map(c => c.id === active.id ? { ...c, summary, summaryUpdatedAt: Date.now() } : c);
            setConversations(withSummary);
            await saveAppData(withSummary, memNext, nextRelationships);
          } else {
            await saveAppData(next, memNext, nextRelationships);
          }
        } catch {
          await saveAppData(next, memNext, nextRelationships);
        }
      } else {
        await saveAppData(next, memNext, nextRelationships);
      }
    } catch (e: any) {
      if (e?.usage) setUsageStatus(e.usage as UsageClientState);
      const restored = conversations.map(c => c.id === baseConversation.id ? baseConversation : c);
      setConversations(restored);
      // A rejected generation must never eat the user's draft. Keep it in the composer
      // only if the user is still viewing the same conversation; otherwise the active
      // chat's composer remains untouched.
      setLiveResponse(null);
      void saveAppData(restored, memories, relationships);
      const limitMessage = e?.usageLimit ? "You’ve reached your current message limit. Your draft is still in the composer." : (e?.message || "Unable to generate a response right now.");
      if (activeConversation === baseConversation.id) {
        setMessage(text);
        setChatError(limitMessage);
      }
    } finally {
      generationInFlightRef.current = false;
      setLiveResponse(null);
      revealConversationRef.current = null;
      setGeneratingMessage(false);
      setGeneratingConversationId(prev => prev === active.id ? null : prev);
    }
  }

  async function copyMessage(messageId: string) {
    const target = active?.messages.find(m => m.id === messageId);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.text);
      setProfileMessage("Message copied.");
    } catch {
      setProfileMessage("Unable to copy the message.");
    }
    setMessageMenuId(null);
  }

  function isMessagePinned(messageId: string) {
    return memories.some(memory => memory.conversationId === active?.id && memory.messageId === messageId && memory.source === "manual" && memory.status !== "superseded");
  }

  async function toggleMessagePin(messageId: string) {
    if (!active || !selected) return;
    const target = active.messages.find(m => m.id === messageId);
    if (!target) return;
    const pinned = isMessagePinned(messageId);
    let nextMemories: Memory[];
    if (pinned) {
      nextMemories = memories.filter(memory => !(memory.conversationId === active.id && memory.messageId === messageId && memory.source === "manual"));
    } else {
      const existing = memories.find(memory => memory.conversationId === active.id && memory.messageId === messageId);
      if (existing) {
        nextMemories = memories.map(memory => memory.id === existing.id ? { ...memory, text: `Pinned message from ${target.sender === "user" ? "the user" : selected.name}: ${target.text}`, source: "manual" as const, importance: 5 as const, status: "active" as const, updatedAt: Date.now() } : memory);
      } else {
        nextMemories = [{
          id: makeClientId(), characterId: selected.id, conversationId: active.id,
          text: `Pinned message from ${target.sender === "user" ? "the user" : selected.name}: ${target.text}`,
          source: "manual", category: "shared_experience", importance: 5, status: "active", messageId,
          createdAt: Date.now(), updatedAt: Date.now(),
        }, ...memories];
      }
    }
    setMemories(nextMemories);
    await saveAppData(conversations, nextMemories, relationships);
    setMessageMenuId(null);
  }

  async function branchConversationFromMessage(messageId: string) {
    if (!active || !selected) return;
    const targetIndex = active.messages.findIndex(message => message.id === messageId);
    if (targetIndex < 0) return;
    const prefix = active.messages.slice(0, targetIndex + 1);
    const target = prefix[prefix.length - 1];
    const messageIdMap = new Map<string, string>();
    const branchMessages = prefix.map(message => {
      const id = makeClientId();
      messageIdMap.set(message.id, id);
      return { ...message, id };
    });
    const now = Date.now();
    const branchId = makeClientId();
    const branch: Conversation = {
      id: branchId,
      characterId: selected.id,
      title: active.title ? `${active.title} · branch` : "New conversation",
      messages: branchMessages,
      createdAt: now,
      updatedAt: now,
    };
    const prefixIds = new Set(prefix.map(message => message.id));
    const branchMemories = memories
      .filter(memory => memory.conversationId === active.id && (memory.messageId ? prefixIds.has(memory.messageId) : memory.createdAt <= target.createdAt))
      .map(memory => ({ ...memory, id: makeClientId(), conversationId: branchId, messageId: memory.messageId ? messageIdMap.get(memory.messageId) : undefined, createdAt: Math.min(memory.createdAt, now), updatedAt: now }));
    let relationship = initialRelationship();
    for (const message of prefix) {
      if (message.sender === "user") relationship = updateRelationship(selected, relationship, message.text);
    }
    relationship.conversationId = branchId;
    const nextRelationships = { ...relationships, [branchId]: relationship };
    const next = [branch, ...conversations];
    setConversations(next);
    setMemories([...branchMemories, ...memories]);
    setRelationships(nextRelationships);
    setActiveConversation(branchId);
    setMessageMenuId(null);
    setMessageConfirm(null);
    await saveAppData(next, [...branchMemories, ...memories], nextRelationships);
  }

  function prepareMessageAction(action: "branch" | "rewind" | "remove", messageId: string) {
    setMessageMenuId(null);
    setMessageConfirm({ action, messageId });
  }

  async function executeMessageAction() {
    if (!active || !messageConfirm) return;
    const { action, messageId } = messageConfirm;
    if (action === "branch") {
      await branchConversationFromMessage(messageId);
      return;
    }
    const targetIndex = active.messages.findIndex(message => message.id === messageId);
    if (targetIndex < 0) { setMessageConfirm(null); return; }
    const cutoff = active.messages[targetIndex].createdAt;
    const removedIds = new Set(active.messages.slice(action === "remove" ? targetIndex : targetIndex + 1).map(message => message.id));
    const nextMessages = active.messages.filter((_, index) => action === "remove" ? index < targetIndex : index <= targetIndex);
    const updated: Conversation = { ...active, messages: nextMessages, updatedAt: Date.now(), ...(nextMessages.length < active.messages.length ? { summary: undefined, summaryUpdatedAt: undefined } : {}) };
    const next = conversations.map(conversation => conversation.id === active.id ? updated : conversation);
    const nextMemories = memories.filter(memory => {
      if (memory.conversationId !== active.id) return true;
      if (memory.messageId && removedIds.has(memory.messageId)) return false;
      if (!memory.messageId && memory.createdAt >= cutoff) return false;
      return true;
    });
    let nextRelationships = relationships;
    const rebuilt = initialRelationship();
    let rebuiltRelationship = rebuilt;
    for (const message of nextMessages) if (message.sender === "user") rebuiltRelationship = updateRelationship(selected!, rebuiltRelationship, message.text);
    rebuiltRelationship.conversationId = active.id;
    nextRelationships = { ...relationships, [active.id]: rebuiltRelationship };
    setConversations(next);
    setMemories(nextMemories);
    setRelationships(nextRelationships);
    setEditing(null);
    setEditText("");
    setMessageConfirm(null);
    await saveAppData(next, nextMemories, nextRelationships);
  }

  async function editMessage(id:string){
    if(!active||!selected||!editText.trim())return;
    const text = editText.trim();
    const target = active.messages.find(m=>m.id===id);
    const updated={...active,messages:active.messages.map(m=>m.id===id?{...m,text,edited:true}:m),updatedAt:Date.now()};
    const next=conversations.map(c=>c.id===active.id?updated:c);
    let nextMemories = memories.filter(m => m.messageId !== id);
    if(target?.sender === "character") {
      nextMemories = [{
        id: makeClientId(),
        characterId: selected.id,
        conversationId: active.id,
        text: `In this conversation, ${selected.name} said: ${text}`,
        source: "manual",
        category: "shared_experience",
        importance: 4,
        status: "active",
        messageId: id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, ...nextMemories];
    } else if(target?.sender === "user") {
      const extracted = extractMemories(selected.id, text, id, nextMemories.filter(m => m.conversationId === active.id)).map(m => ({...m, conversationId: active.id}));
      nextMemories = supersedeConflicts([...extracted, ...nextMemories], extracted);
    }
    setConversations(next);
    setMemories(nextMemories);
    await saveAppData(next,nextMemories,relationships);
    setEditing(null);
    setEditText("");
  }

  function deleteConversation(id:string){
    const next=conversations.filter(c=>c.id!==id);
    const nextMemories=memories.filter(m=>m.conversationId!==id);
    const nextRelationships={...relationships};
    delete nextRelationships[id];
    setConversations(next);
    setMemories(nextMemories);
    setRelationships(nextRelationships);
    void saveAppData(next,nextMemories,nextRelationships);
    if(activeConversation===id){
      const replacement=next.filter(c=>c.characterId===selected?.id).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
      if(replacement) setActiveConversation(replacement.id);
      else { setActiveConversation(null); setSelected(null); }
    }
    if(renamingConversation===id){setRenamingConversation(null);setRenameText("");}
  }
  function deleteCharacterConversations(characterId:string){
    const ids = new Set(conversations.filter(c=>c.characterId===characterId).map(c=>c.id));
    if(!ids.size) return;
    if(!window.confirm("Delete all conversations with this character? This cannot be undone.")) return;
    const next = conversations.filter(c=>c.characterId!==characterId);
    const nextMemories = memories.filter(m=>!m.conversationId || !ids.has(m.conversationId));
    const nextRelationships = Object.fromEntries(Object.entries(relationships).filter(([id]) => !ids.has(id)));
    setConversations(next);
    setMemories(nextMemories);
    setRelationships(nextRelationships);
    if(activeConversation && ids.has(activeConversation)) setActiveConversation(null);
    setRenamingConversation(null); setRenameText("");
    void saveAppData(next,nextMemories,nextRelationships);
  }
  function renameConversation(id:string){
    const title=renameText.trim().slice(0,60);
    if(!title) return;
    const next=conversations.map(c=>c.id===id?{...c,title,updatedAt:Date.now()}:c);
    setConversations(next);
    void saveAppData(next,memories,relationships);
    setRenamingConversation(null);
    setRenameText("");
  }
  function deleteMemory(id:string){const next=memories.filter(m=>m.id!==id);setMemories(next);void saveAppData(conversations,next,relationships);}
  function deleteConversationMemories(conversationId:string){
    const count=memories.filter(m=>m.conversationId===conversationId).length;
    if(!count) return;
    if(!window.confirm(`Delete the ${count} memories from this conversation? The chat history will not be deleted.`)) return;
    const next=memories.filter(m=>m.conversationId!==conversationId);
    setMemories(next);
    void saveAppData(conversations,next,relationships);
  }
  async function editMemory(id:string){
    const current=memories.find(m=>m.id===id);
    if(!current) return;
    const text=window.prompt("Edit memory:", current.text)?.trim();
    if(!text) return;
    const next=memories.map(m=>m.id===id?{...m,text,source:"manual" as const,updatedAt:Date.now(),status:"active" as const}:m);
    setMemories(next);
    await saveAppData(conversations,next,relationships);
  }

  async function feedback(messageId:string,value:"like"|"dislike") {
    if (!active) return;
    const current = active.messages.find(m => m.id === messageId);
    if (!current) return;
    const removing = current.feedback === value;
    const nextValue = removing ? undefined : value;
    const updated={...active,messages:active.messages.map(m=>m.id===messageId?{...m,feedback:nextValue, ...(removing ? {feedbackTags:undefined,feedbackNote:undefined} : {})}:m),updatedAt:Date.now()};
    const next = conversations.map(c=>c.id===active.id?updated:c);
    setConversations(next);
    void saveAppData(next,memories);
    if (!removing) setFeedbackPromptedIds(ids => ids.includes(messageId) ? ids : [...ids, messageId]);
    else setFeedbackPromptedIds(ids => ids.filter(id => id !== messageId));
    if (removing) {
      await profileRequest("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"feedback",targetId:messageId,value})}).catch(()=>{});
      return;
    }
    await profileRequest("/api/profile",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"feedback",targetId:messageId,value})}).catch(()=>{});
    setResponseFeedbackMessageId(messageId);
    setResponseFeedbackValue(value);
    setResponseFeedbackTags([]);
    setResponseFeedbackNote("");
    setResponseFeedbackStatus("");
  }

  async function submitResponseFeedback() {
    if (!responseFeedbackMessageId) return;
    if (responseFeedbackTags.length === 0) { setResponseFeedbackStatus("Choose at least one characteristic."); return; }
    if (responseFeedbackTags.includes("other") && responseFeedbackNote.trim().length < 3) { setResponseFeedbackStatus("Briefly explain the other reason."); return; }
    setResponseFeedbackStatus("Saving...");
    try {
      const res = await profileRequest("/api/profile", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ action:"feedback", targetId:responseFeedbackMessageId, value:responseFeedbackValue, tags:responseFeedbackTags, note:responseFeedbackNote.trim() }) });
      if (!res) throw new Error("Unable to save feedback.");
      if (active) {
        const updated={...active,messages:active.messages.map(m=>m.id===responseFeedbackMessageId?{...m,feedback:responseFeedbackValue,feedbackTags:responseFeedbackTags,feedbackNote:responseFeedbackNote.trim()}:m),updatedAt:Date.now()};
        const next=conversations.map(c=>c.id===active.id?updated:c);
        setConversations(next);
        void saveAppData(next,memories);
      }
      setResponseFeedbackStatus("Thank you. This helps the character respond better.");
      window.setTimeout(()=>{setResponseFeedbackOpen(false);setResponseFeedbackStatus("")},700);
    } catch (e:any) { setResponseFeedbackStatus(e?.message || "Unable to save feedback."); }
  }

  async function loadResponseAlternatives(conversationId: string, messageId: string) {
    try {
      const res = await fetch(`/api/response-alternatives?conversationId=${encodeURIComponent(conversationId)}&messageId=${encodeURIComponent(messageId)}`, { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.alternatives)) return;
      const alternatives = data.alternatives.slice(0, MAX_RESPONSE_GENERATIONS).map((x: any) => ({ label: String(x.label), text: String(x.text) }));
      if (!alternatives.length) return;
      setResponseAlternatives(prev => ({ ...prev, [messageId]: alternatives }));
      const selected = data.alternatives.findIndex((x: any) => x.selected === true);
      setSelectedAlternativeIndex(prev => ({ ...prev, [messageId]: selected >= 0 ? selected : 0 }));
    } catch {
      // Alternatives are an enhancement; the current message remains authoritative.
    }
  }

  async function chooseResponseAlternative(messageId: string, index: number) {
    if (!active || !selected || isGeneratingActiveConversation || regeneratingMessageId) return;
    const alternatives = responseAlternatives[messageId] ?? [];
    const candidate = alternatives[index];
    if (!candidate) return;
    try {
      const res = await fetch("/api/response-alternatives", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, messageId, label: candidate.label }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Unable to select this response.");
      const updated = { ...active, messages: active.messages.map(m => m.id === messageId ? { ...m, text: candidate.text, feedback: undefined, edited: false } : m), updatedAt: Date.now() };
      const next = conversations.map(c => c.id === active.id ? updated : c);
      setConversations(next);
      setSelectedAlternativeIndex(prev => ({ ...prev, [messageId]: index }));
      setFeedbackPromptedIds(ids => ids.filter(id => id !== messageId));
      await saveAppData(next, memories, relationships);
    } catch (e: any) {
      setProfileMessage(e?.message || "Unable to select this response.");
    }
  }

  async function regenerate(messageId: string) {
    if (!active || !selected || isGeneratingActiveConversation || regeneratingMessageId || generationInFlightRef.current) return;
    const index = active.messages.findIndex(m => m.id === messageId);
    const current = active.messages[index];
    const existingGenerations = responseAlternatives[messageId] ?? [{ label: "G1", text: current?.text ?? "" }];
    if (existingGenerations.length >= MAX_RESPONSE_GENERATIONS) return;
    const lastMessage = active.messages.at(-1);
    if (index < 0 || current?.sender !== "character" || lastMessage?.id !== messageId) return;

    const isFixedGreeting = index === 0;
    const previousIndex = active.messages.slice(0, index).map((m, i) => ({ m, i })).reverse().find(({ m }) => m.sender === "user")?.i;
    const previous = previousIndex === undefined ? undefined : active.messages[previousIndex];
    if (!isFixedGreeting && !previous) return;

    try {
      generationInFlightRef.current = true;
      setRegeneratingMessageId(messageId);
      setGeneratingMessage(true);
      setGeneratingConversationId(active.id);
      setFeedbackPromptedIds(ids => ids.filter(id => id !== messageId));
      // Keep the existing message slot in place and turn it into the typing state.
      // This avoids the old response flashing away while the replacement is generated.
      setLiveResponse({ messageId, text: "" });
      const historyBeforeLatestUser = previousIndex === undefined ? [] : active.messages.slice(0, previousIndex);
      const candidateResult = isFixedGreeting
        ? await generateAIResponse(selected, "", [], memories.filter(m => m.conversationId === active.id), true, "greeting", active.summary, current?.feedback ? { value: current.feedback, tags: current.feedbackTags ?? [], note: current.feedbackNote, previousResponse: current.text } : undefined, active.id, language)
        : await generateAIResponse(selected, previous!.text, historyBeforeLatestUser, memories.filter(m => m.conversationId === active.id), true, "chat", active.summary, current?.feedback ? { value: current.feedback, tags: current.feedbackTags ?? [], note: current.feedbackNote, previousResponse: current.text } : undefined, active.id, language);
      if (candidateResult.usage) setUsageStatus(candidateResult.usage);
      const candidate = candidateResult.text;
      const generationNumber = existingGenerations.length + 1;
      const generation = { label: `G${generationNumber}`, text: candidate };
      const generations = [...existingGenerations, generation].slice(-MAX_RESPONSE_GENERATIONS);
      const selectedIndex = generations.length - 1;
      await revealResponse(messageId, candidate, active.id);
      const updated = { ...active, messages: active.messages.map(m => m.id === messageId ? { ...m, text: candidate, feedback: undefined, edited: false } : m), updatedAt: Date.now() };
      const next = conversations.map(c => c.id === active.id ? updated : c);
      const nextMemories = memories.filter(m => m.messageId !== messageId);
      setConversations(next);
      setMemories(nextMemories);
      setResponseAlternatives(prev => ({ ...prev, [messageId]: generations }));
      setSelectedAlternativeIndex(prev => ({ ...prev, [messageId]: selectedIndex }));
      setFeedbackPromptedIds(ids => ids.filter(id => id !== messageId));
      if (responseFeedbackMessageId === messageId) {
        setResponseFeedbackMessageId(null);
        setResponseFeedbackOpen(false);
        setResponseFeedbackTags([]);
        setResponseFeedbackNote("");
      }
      setLiveResponse(null);
      await saveAppData(next, nextMemories, relationships);
      await fetch("/api/response-alternatives", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: active.id, messageId, alternatives: [generation], selectedLabel: generation.label, append: true }) }).catch(() => {});
    } catch (e: any) {
      if (e?.usage) setUsageStatus(e.usage as UsageClientState);
      setLiveResponse(null);
      if (activeConversation === active.id) {
        setProfileMessage(e?.usageLimit ? "You’ve reached your current message limit. Your existing response is unchanged." : (e?.message || "Unable to generate another response."));
      }
    } finally {
      generationInFlightRef.current = false;
      setLiveResponse(null);
      revealConversationRef.current = null;
      setRegeneratingMessageId(null);
      setGeneratingMessage(false);
      setGeneratingConversationId(prev => prev === active.id ? null : prev);
    }
  }

  const active = conversations.find(c => c.id === activeConversation) || null;
  const isGeneratingActiveConversation = Boolean(active && generatingMessage && generatingConversationId === active.id);

  useEffect(() => {
    setMessage("");
    setChatError("");
    setLiveResponse(null);
    revealConversationRef.current = null;
    const textarea = composerRef.current;
    if (textarea) textarea.style.height = "52px";
  }, [activeConversation, selected?.id]);

  useEffect(() => {
    if (!active || !selected) return;
    const latestCharacterMessage = [...active.messages].reverse().find(m => m.sender === "character");
    if (latestCharacterMessage) {
      if (!responseAlternatives[latestCharacterMessage.id]?.length) {
        setResponseAlternatives(prev => ({ ...prev, [latestCharacterMessage.id]: [{ label: "G1", text: latestCharacterMessage.text }] }));
        setSelectedAlternativeIndex(prev => ({ ...prev, [latestCharacterMessage.id]: 0 }));
      }
      void loadResponseAlternatives(active.id, latestCharacterMessage.id);
    }
  // The latest message id is the relevant cache key; avoid re-fetching on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation, active?.messages.at(-1)?.id]);

  const dailyLimitReached = !isAdminUser && ((usageStatus?.used.dailyTokens ?? 0) >= (usageStatus?.limits.dailyTokens ?? Number.MAX_SAFE_INTEGER));

  const activeExists = Boolean(active);
  const selectedCharacterId = selected?.id;

  useEffect(() => {
    if (!selectedCharacterId || !activeExists) return;
    const frame = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeConversation, selectedCharacterId, active?.messages.length, activeExists]);

  // Follow the simulated response reveal while the user is still near the bottom.
  // If they scroll up to reread an earlier message, do not yank the viewport back
  // down on every reveal tick. This is especially important on mobile, where the
  // keyboard and small viewport make unexpected scrolling feel much more disruptive.
  useEffect(() => {
    if (!selected || !active || !isGeneratingActiveConversation || !liveResponse) return;
    const end = messagesEndRef.current;
    const scroller = end?.parentElement;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (distanceFromBottom > 140) return;
    const frame = requestAnimationFrame(() => {
      end?.scrollIntoView({ behavior: "auto", block: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, isGeneratingActiveConversation, liveResponse, selected]);

  useEffect(() => {
    const end = messagesEndRef.current;
    const scroller = end?.parentElement;
    if (!scroller) {
      setShowScrollToBottom(false);
      return;
    }
    const update = () => {
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      setShowScrollToBottom(distanceFromBottom > 220);
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    return () => scroller.removeEventListener("scroll", update);
  }, [activeConversation, selected, active?.messages.length]);

  function scrollToLatestMessage() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setShowScrollToBottom(false);
  }

  const exploreCategories = useMemo(() => {
    const categories = exploreData.categories;
    if (!categories) return [];
    return [
      [t("categoryPopular"), exploreData.popular ?? []],
      [t("categoryNewest"), exploreData.newest ?? []],
      [t("categoryRealPeople"), categories.real_person ?? []],
      [t("categoryExistingCharacters"), categories.existing_character ?? []],
      [t("categoryOriginalCharacters"), categories.original ?? []],
      [t("categoryAction"), categories.action ?? []],
      [t("categoryRomance"), categories.romance ?? []],
      [t("categoryAnime"), categories.anime ?? []],
    ].filter(([, bots]) => bots.length) as [string, ExploreBot[]][];
  }, [exploreData.categories, exploreData.popular, exploreData.newest, t]);
  if (!authReady) return <div className="auth-loading"><div className="auth-loading-brand">Persona<span>Chat</span></div></div>;
  if (!user) return <AuthScreen language={language} mode={authMode} setMode={m=>{setAuthMode(m);setAuthError("")}} name={authName} setName={setAuthName} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} error={authError} onSubmit={submitAuth} loading={authLoading}/>;
  if (!capacity) return <div className="capacity-loading">Checking availability...</div>;
  if (capacity.access === "waiting") return <CapacityQueueScreen state={capacity}/>;

  if (mobileSettingsOpen) return <div className="mobile-settings-page">
    <header className="mobile-settings-header"><button className="icon-button" onClick={()=>setMobileSettingsOpen(false)} aria-label="Back"><ArrowLeft size={20}/></button><div><strong>{t("settings")}</strong><span>Customize your PersonaChat experience.</span></div></header>
    <main className="mobile-settings-content">
      <section className="mobile-settings-group"><h2>{t("appearance")}</h2><div className="mobile-settings-row"><div><strong>{t("theme")}</strong><small>{t("chooseTheme")}</small></div><div className="settings-choice-row">{(["dark","light","system"] as ThemeMode[]).map(v=><button key={v} className={`settings-choice ${theme===v?"selected":""}`} onClick={()=>setTheme(v)}>{t(v)}</button>)}</div></div></section>
      <section className="mobile-settings-group"><h2>{t("language")}</h2><div className="mobile-settings-row"><div><strong>{t("language")}</strong><small>{t("chooseLanguage")}</small></div><select className="settings-select" value={language} onChange={e=>setLanguage(e.target.value as AppLanguage)}><option value="pt">{t("portuguese")}</option><option value="en">{t("english")}</option><option value="es">{t("spanish")}</option><option value="it">{t("italian")}</option><option value="fr">{t("french")}</option></select></div></section>
      <section className="mobile-settings-group"><h2>{t("notifications")}</h2><div className="mobile-settings-row"><div><strong>{t("notifications")}</strong><small>{t("notificationsDesc")}</small></div><button className={`toggle ${notifications?"on":""}`} onClick={()=>setNotifications(v=>!v)}><span/></button></div></section>
      <section className="mobile-settings-group"><h2>{t("account")}</h2><div className="mobile-settings-links"><button onClick={signOut}><LogOut size={16}/> {t("logout")}</button><button className="danger-text" onClick={()=>setDeleteAccountOpen(true)}><Trash2 size={16}/> Delete account</button></div></section>
      <section className="mobile-settings-group"><h2>{t("privacySupport")}</h2><div className="mobile-settings-links"><a href="/policies#terms" target="_blank" rel="noreferrer"><FileText size={16}/> {t("terms")}</a><a href="/policies#privacy" target="_blank" rel="noreferrer"><ShieldAlert size={16}/> {t("privacy")}</a><button onClick={()=>{setMobileSettingsOpen(false);setFeedbackOpen(true)}}><MessageCircle size={16}/> {t("sendFeedback")}</button></div></section>
      {isAdminUser&&<section className="mobile-settings-group"><h2>{t("administration")}</h2><div className="mobile-settings-links"><button onClick={()=>{setMobileSettingsOpen(false);void loadAdminReports()}}><Flag size={16}/> {t("openModeration")}</button><button onClick={()=>{setMobileSettingsOpen(false);void loadAdminInsights()}}><BarChart3 size={16}/> {t("productReport")}</button></div></section>}
    </main>
    {deleteAccountOpen&&<div className="overlay" onClick={()=>setDeleteAccountOpen(false)}><div className="settings-modal account-delete-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>{t("deleteAccount")}</h2><p>{t("deleteAccountDesc")}</p></div><button onClick={()=>setDeleteAccountOpen(false)}><X/></button></div><label className="form-label"><span>{t("deleteAccountEmail")}</span><input type="email" value={deleteAccountEmail} onChange={e=>setDeleteAccountEmail(e.target.value)} autoComplete="email"/></label><label className="form-label"><span>{t("deleteAccountPassword")}</span><input type="password" value={deleteAccountPassword} onChange={e=>setDeleteAccountPassword(e.target.value)} autoComplete="current-password"/></label>{deleteAccountError&&<p className="form-error">{deleteAccountError}</p>}<button className="auth-submit danger-account-btn" onClick={()=>void deleteAccount()}>{t("deleteAccount")}</button></div></div>}
  </div>;

  const profileCards = profileData?.id === user.id ? communityBots : (profileData?.bots ?? []);
  const likedCards = (profileData?.likedBotIds ?? []).map(id => profileData?.likedBots?.find(c=>c.id===id) ?? allCharacters.find(c=>c.id===id)).filter(Boolean) as Character[];

  if (exploreOpen) return <div className="community-page"><header className="community-topbar"><button className="icon-button" onClick={()=>setExploreOpen(false)} aria-label="Back"><ArrowLeft/></button><div className="brand">Persona<span>Chat</span></div><div className="topbar-spacer"/><div className="profile-wrap"><button className="profile" onClick={()=>setProfileOpen(!profileOpen)} aria-label="Open profile"><UserAvatar user={user} size={34}/></button>{profileOpen&&<div className="profile-menu"><strong>{user.name}</strong><span>{user.email}</span><button onClick={()=>openProfile()}>{t("viewProfile")}</button><button onClick={signOut}>{t("logout")}</button></div>}</div></header><main className="explore-page"><section className="explore-hero"><div className="eyebrow">COMMUNITY</div><h1>Explore characters</h1><p>Discover community-created bots and find your next conversation.</p><div className="explore-search"><Search size={19}/><input value={exploreSearch} onChange={async e=>{const value=e.target.value;setExploreSearch(value);if(value.length===0||value.length>=2) await loadExplore(value)}} placeholder="Search bots, creators, or tags..." aria-label="Search bots, creators, or tags"/></div></section>{exploreSearch.trim()?<ExploreSection title="Results" subtitle={`${filteredExplore.length} character(s) found.`} bots={filteredExplore} likedBotIds={likedBotIds} onOpenCharacter={openCharacter} onLikeBot={(id)=>communityAction("like-bot",id)}/>:exploreCategories.length?exploreCategories.map(([category,bots])=><div key={category}><ExploreSection title={category} subtitle="PersonaChat primary category." bots={bots.slice(0,6)} likedBotIds={likedBotIds} onOpenCharacter={openCharacter} onLikeBot={(id)=>communityAction("like-bot",id)}/></div>):<><ExploreSection title="Characters" subtitle="Public bots will appear here as the community starts publishing." bots={exploreData.all.slice(0,6)} likedBotIds={likedBotIds} onOpenCharacter={openCharacter} onLikeBot={(id)=>communityAction("like-bot",id)}/><div className="explore-empty"><Bot size={26}/><p>There are not enough public characters to build categories yet.</p></div></>}</main></div>;

  if (profileView && profileData) return <>
    {reportOpen&&reportTarget&&<div className="overlay" onClick={()=>setReportOpen(false)}><div className="report-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Report content</h2><p>{reportTarget.label}</p></div><button onClick={()=>setReportOpen(false)}><X/></button></div><label className="form-label"><span>Reason</span><select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="harassment">Harassment or abuse</option><option value="sexual">Inappropriate sexual content</option><option value="violence">Violence</option><option value="hate">Hate or discrimination</option><option value="impersonation">Impersonation</option><option value="spam">Spam</option><option value="privacy">Privacy</option><option value="copyright">Copyright</option><option value="misinformation">Misinformation</option><option value="other">Other</option></select></label><label className="form-label"><span>Details (optional)</span><textarea maxLength={2000} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Briefly explain the issue. Do not include unnecessary personal data."/><small>{reportDetails.length}/2000</small></label>{reportStatus&&<div className="report-status">{reportStatus}</div>}<button className="auth-submit" onClick={submitReport} disabled={reportStatus==="Sending..."}>Submit report</button></div></div>}
    <div className="community-page">
    <header className="community-topbar"><button className="icon-button" onClick={()=>setProfileView(false)}><ArrowLeft/></button><div className="brand">Persona<span>Chat</span></div><div className="topbar-spacer"/></header>
    <main className="profile-page">
      <section className="profile-hero">
        <div className="profile-cover"/>
        <div className="profile-main">
          <UserAvatar user={profileData} size={104}/>
          <div className="profile-identity"><h1>{profileData.name}</h1><span>@{profileData.username}</span><p>{t("memberSince")} {new Date(profileData.createdAt).toLocaleDateString(language === "pt" ? "pt-BR" : language === "es" ? "es-ES" : language === "it" ? "it-IT" : language === "fr" ? "fr-FR" : "en-US")}</p></div>
          <div className="profile-actions">
            {profileData.id===user.id ? <>
              <button className="primary-btn" onClick={()=>{setProfileEdit(true);setProfileMessage("")}}>{t("editProfile")}</button>
              <button className="outline-btn mobile-only-profile-settings" onClick={()=>setMobileSettingsOpen(true)} aria-label="Settings"><Settings size={16}/>Settings</button>
            </> :
            <><button className={`outline-btn ${profileData.viewerFollowing?"active":""}`} onClick={()=>communityAction("follow",profileData.id)}><UserPlus size={16}/>{profileData.viewerFollowing?t("following"):t("follow")}</button></>}
            <button className="outline-btn" onClick={async()=>{try{await navigator.clipboard.writeText(`${window.location.origin}/?profile=${profileData.id}`);setProfileMessage(t("copyProfile"));}catch{setProfileMessage(t("cannotCopy"))}}}><Share2 size={16}/>{t("share")}</button>{profileData.id!==user.id&&<button className="outline-btn danger-outline" onClick={()=>openReport("user",profileData.id,`User @${profileData.username}`)}><Flag size={16}/>{t("report")}</button>}
          </div>
        </div>
        <div className="profile-stats">
          <button type="button" onClick={()=>setProfileTab("followers")}><strong>{profileData.followers}</strong><span>{t("followers")}</span></button>
          <button type="button" onClick={()=>setProfileTab("following")}><strong>{profileData.following}</strong><span>{t("followingCount")}</span></button>
          <button type="button" onClick={()=>setProfileTab("created")}><strong>{Number(profileData.createdBotCount ?? profileCards.length)}</strong><span>{t("createdBots")}</span></button>
        </div>
      </section>
      {profileMessage && <div className="profile-notice">{profileMessage}</div>}
      <section className="profile-content">
        <div className="profile-tabs">
          <button className={profileTab==="liked"?"active":""} onClick={()=>setProfileTab("liked")}><Heart size={17}/> {t("likedBots")}</button>
          <button className={profileTab==="created"?"active":""} onClick={()=>setProfileTab("created")}><Bot size={17}/> {t("createdBots")}</button>
          {profileData.id===user.id&&<button className="create-bot-tab triangular-create" onClick={()=>{setEditingBotId(null);setBotForm({...emptyBotForm});setPreviewBotOpen(false);setCreateBotOrigin("profile");setCreateBotOpen(true)}}><Plus size={17}/> {t("createBot")}</button>}
        </div>
        {profileTab==="followers" ? <>{profileData.id!==user.id ? <div className="profile-private-list"><div className="profile-private-icon"><Users size={26}/></div><h3>Private followers</h3><p>This profile&apos;s follower list can only be viewed by the account owner.</p></div> : profileData.followersUsers.length===0 ? <div className="profile-empty"><Users size={34}/><h3>You do not have any followers yet</h3><p>When someone follows you, they will appear here.</p></div> : <div className="following-list">{profileData.followersUsers.map(person=><button className="following-person" key={person.id} onClick={()=>openProfile(person.id)}><UserAvatar user={person} size={50}/><span><strong>{person.name}</strong><small>@{person.username}</small></span><ChevronRight size={17}/></button>)}</div>}</> : profileTab==="following" ? <>{profileData.followingUsers.length===0 ? <div className="profile-empty"><Users size={34}/><h3>{profileData.id===user.id?"You are not following anyone yet":"This user is not following anyone yet"}</h3><p>Profiles you follow will appear here.</p></div> : <div className="following-list">{profileData.followingUsers.map(person=><button className="following-person" key={person.id} onClick={()=>openProfile(person.id)}><UserAvatar user={person} size={50}/><span><strong>{person.name}</strong><small>@{person.username}</small></span><ChevronRight size={17}/></button>)}</div>}</> : (profileTab==="created" ? profileCards : likedCards).length===0 ? <div className="profile-empty"><Bot size={34}/><h3>{profileTab==="created"?t("emptyCreatedTitle"):t("emptyLikedTitle")}</h3><p>{profileTab==="created"?t("emptyCreatedText"):t("emptyLikedText")}</p></div> :
          <div className="character-grid profile-grid">{(profileTab==="created"?profileCards:likedCards).map(c=><div key={c.id} className="profile-bot-card"><button className="character-card" onClick={()=>openCharacter(toCharacter(c))}><div className="card-image">{c.image?<img src={c.image} alt="" loading="lazy" decoding="async"/>:<div className="bot-placeholder"><Bot size={40}/></div>}</div><div className="card-body"><h3>{c.name}</h3><BotTypeBadge type={c.type}/><p>{c.sceneDescription || c.description}</p><div className="tags">{c.tags.map(t=><span key={t}>{t}</span>)}</div></div></button>{profileData.id===user.id&&profileTab==="created"&&<div className="profile-bot-actions"><button type="button" className="outline-btn" onClick={()=>startEditBot(c)}>Edit</button><button type="button" className="outline-btn danger-outline" onClick={()=>deleteBot(c)}>Delete</button></div>}</div>)}</div>}
      </section>
    </main>
    <nav className="mobile-bottom-nav profile-mobile-bottom-nav" aria-label="Main navigation">
      <button className="" onClick={()=>{setMobileTab("chats");setProfileView(false)}} aria-label="Seus chats"><MessageCircle size={21}/></button>
      <button onClick={()=>{setMobileTab("home");setProfileView(false)}} aria-label="Home"><span className="mobile-home-icon">⌂</span></button>
      <button className="active" onClick={()=>setMobileTab("profile")} aria-label="My profile"><Users size={21}/></button>
    </nav>
    {profileEdit&&<div className="overlay" onClick={()=>setProfileEdit(false)}><div className="profile-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Edit profile</h2><p>Choose how the community sees you.</p></div><button onClick={()=>setProfileEdit(false)}><X/></button></div><div className="avatar-editor"><UserAvatar user={{name:profileName,avatar:profileAvatar}} size={96}/><label className="upload-btn"><Camera size={17}/> {t("changePhoto")}<input type="file" accept="image/*" onChange={e=>chooseAvatar(e.target.files?.[0])}/></label></div><label className="form-label">Name<input value={profileName} onChange={e=>setProfileName(e.target.value)} maxLength={30}/></label><label className="form-label">@User<input value={profileUsername} onChange={e=>setProfileUsername(e.target.value.replace(/^@+/, "").toLowerCase())} maxLength={20} placeholder="user_exemplo"/><p className={`form-help username-status ${usernameAvailable===true?"available":usernameAvailable===false?"taken":""}`}>{usernameAvailable===true?"Available":usernameAvailable===false?"Already in use":"Use letters, numbers, and _."}</p></label><div className="form-label"><span>Gender</span><p className="form-help">This helps characters use feminine or masculine references when needed.</p><div className="gender-options"><button type="button" className={profileGender==="female"?"selected":""} onClick={()=>setProfileGender("female")}>Female</button><button type="button" className={profileGender==="male"?"selected":""} onClick={()=>setProfileGender("male")}>Male</button><button type="button" className={profileGender===""?"selected":""} onClick={()=>setProfileGender("")}>Prefer not to say</button></div></div><button className="auth-submit" onClick={updateProfile}>Save changes</button></div></div>}
    {characterPreview&&<div className="overlay character-preview-overlay" onClick={()=>setCharacterPreview(null)}>
      <section className="character-preview-modal" role="dialog" aria-modal="true" aria-labelledby="character-preview-title" onClick={e=>e.stopPropagation()}>
        <button className="character-preview-close" type="button" onClick={()=>setCharacterPreview(null)} aria-label={t("closeAction")}><X size={20}/></button>
        <div className="character-preview-cover">
          {characterPreview.image
            ? <img src={characterPreview.image} alt={characterPreview.name} />
            : <div className="bot-placeholder"><Bot size={54}/></div>}
          <div className="character-preview-gradient" />
        </div>
        <div className="character-preview-content">
          <div className="character-preview-heading">
            <div>
              <div className="character-preview-kicker">
                <BotTypeBadge type={characterPreview.type}/>
                {characterPreview.type === "real_person" && <span className="character-preview-research-badge"><Sparkles size={12}/> OSINT on PersonaChat+</span>}
              </div>
              <h2 id="character-preview-title">{characterPreview.name}</h2>
              {characterPreview.creator && <p className="character-preview-creator">by {characterPreview.creator}</p>}
            </div>
            <button className={`character-preview-like ${likedBotIds.includes(characterPreview.id) ? "liked" : ""}`} type="button" onClick={()=>void communityAction("like-bot", characterPreview.id)} aria-label={likedBotIds.includes(characterPreview.id) ? "Unlike character" : "Like character"}>
              <Heart size={18} fill={likedBotIds.includes(characterPreview.id) ? "currentColor" : "none"}/>
            </button>
          </div>

          <p className="character-preview-description">{characterPreview.sceneDescription || characterPreview.description || "A character ready for a new conversation."}</p>

          {characterPreview.greeting && <div className="character-preview-greeting">
            <span className="character-preview-label">FIRST MESSAGE</span>
            <p>“{characterPreview.greeting}”</p>
          </div>}

          {(characterPreview.tags ?? []).length > 0 && <div className="character-preview-tags">
            {(characterPreview.tags ?? []).slice(0, 6).map(tag=><span key={tag}>{tag}</span>)}
          </div>}

          {characterPreview.type === "real_person" && <div className="character-preview-research-note">
            <Sparkles size={16}/>
            <div><strong>Current-context research with PersonaChat+</strong><p>Premium can research public, current information when a conversation actually needs it. It never turns private data into a chat fact.</p></div>
          </div>}

          <div className="character-preview-actions">
            {conversations.some(c=>c.characterId===characterPreview.id) && <button type="button" className="character-preview-secondary" onClick={()=>enterCharacterChat(characterPreview, false)}>Continue chat</button>}
            <button type="button" className="character-preview-primary" onClick={()=>enterCharacterChat(characterPreview, !conversations.some(c=>c.characterId===characterPreview.id))}>
              <MessageCircle size={18}/>{conversations.some(c=>c.characterId===characterPreview.id) ? "Start new chat" : "Start chatting"}
            </button>
          </div>
          <p className="character-preview-hint">You can always start another separate conversation later.</p>
        </div>
      </section>
    </div>}
    {createBotOpen&&<div className="overlay create-bot-overlay" onClick={()=>{setCreateBotOpen(false);setPreviewBotOpen(false);setCreateBotOrigin(null)}}><div className="profile-modal create-bot-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>{editingBotId ? "Edit bot" : "Create bot"}</h2><p>{editingBotId ? "Update the character sheet and save your changes." : "Build the character sheet before publishing."}</p></div><button onClick={()=>{setCreateBotOpen(false);setPreviewBotOpen(false);setCreateBotOrigin(null)}}><X/></button></div>
      <label className="form-label form-label-count"><span>Name</span><div className="field-wrap"><input value={botForm.name} maxLength={CHARACTER_LIMITS.name} onChange={e=>setBotForm({...botForm,name:e.target.value})} placeholder="e.g. Captain Orion" /><CharacterCount value={botForm.name} max={CHARACTER_LIMITS.name}/></div></label>
      <label className="form-label form-label-count"><span>Scene description</span><div className="field-wrap"><input value={botForm.description} maxLength={CHARACTER_LIMITS.description} onChange={e=>setBotForm({...botForm,description:e.target.value})} placeholder="e.g. You meet this character on a rainy night in Gotham." /><CharacterCount value={botForm.description} max={CHARACTER_LIMITS.description}/></div></label>
      {!editingBotId&&<div className="form-label bot-type-field"><span>Character type</span><p className="form-help">Choose an option. This is saved with the bot and helps determine when public research/OSINT may be used.</p><div className="bot-type-options">
        <label className={`bot-type-option ${botForm.botType==="real_person"?"selected":""}`}><input type="radio" name="botType" value="real_person" checked={botForm.botType==="real_person"} onChange={()=>setBotForm({...botForm,botType:"real_person"})}/><span className="bot-type-icon">👤</span><strong>Real person</strong><small>Represents someone who exists in real life.</small></label>
        <label className={`bot-type-option ${botForm.botType==="existing_character"?"selected":""}`}><input type="radio" name="botType" value="existing_character" checked={botForm.botType==="existing_character"} onChange={()=>setBotForm({...botForm,botType:"existing_character"})}/><span className="bot-type-icon">🎭</span><strong>Existing character</strong><small>A character from a known work, franchise, or universe.</small></label>
        <label className={`bot-type-option ${botForm.botType==="original"?"selected":""}`}><input type="radio" name="botType" value="original" checked={botForm.botType==="original"} onChange={()=>setBotForm({...botForm,botType:"original"})}/><span className="bot-type-icon">✨</span><strong>Original character</strong><small>Created by the user.</small></label>
      </div></div>}
      {botForm.botType==="real_person"&&<div className="real-person-safety"><strong>Real-person bot protection</strong><p>Use only appropriate public information. Do not include addresses, phone numbers, documents, real-time location, medical data, passwords, or other private information. The bot must clearly state that it is a simulation and not the real person.</p><label className="safety-check"><input type="checkbox" checked={botForm.realPersonSafety} onChange={e=>setBotForm({...botForm,realPersonSafety:e.target.checked})}/><span>I confirm that I will use only public information and will not present the bot as the real person.</span></label></div>}
      <label className="form-label form-label-count"><span>Greeting</span><div className="field-wrap"><textarea value={botForm.greeting} maxLength={CHARACTER_LIMITS.greeting} onChange={e=>setBotForm({...botForm,greeting:e.target.value})} placeholder="The first thing the character will say"/><CharacterCount value={botForm.greeting} max={CHARACTER_LIMITS.greeting}/></div></label>
      <label className="form-label form-label-count"><span>Personality</span><div className="field-wrap"><textarea value={botForm.personality} maxLength={CHARACTER_LIMITS.personality} onChange={e=>setBotForm({...botForm,personality:e.target.value})} placeholder="How this character thinks, reacts, and behaves"/><CharacterCount value={botForm.personality} max={CHARACTER_LIMITS.personality}/></div></label>
      <label className="form-label form-label-count"><span>Speech style</span><div className="field-wrap"><textarea value={botForm.speechStyle} maxLength={CHARACTER_LIMITS.speechStyle} onChange={e=>setBotForm({...botForm,speechStyle:e.target.value})} placeholder="e.g. sarcastic, concise, uses slang, formal..."/><CharacterCount value={botForm.speechStyle} max={CHARACTER_LIMITS.speechStyle}/></div></label>
      <label className="form-label form-label-count"><span>Example dialogue</span><div className="field-wrap"><textarea value={botForm.exampleMessages} maxLength={CHARACTER_LIMITS.examplesTotal} onChange={e=>setBotForm({...botForm,exampleMessages:e.target.value})} placeholder="One line per example. Maximum 8 examples, up to 1,200 characters each."/><CharacterCount value={botForm.exampleMessages} max={CHARACTER_LIMITS.examplesTotal}/></div><p className="form-help">Up to {CHARACTER_LIMITS.exampleCount} examples · {CHARACTER_LIMITS.exampleEach} characters per example · {CHARACTER_LIMITS.examplesTotal} total.</p></label>
      <label className="form-label form-label-count"><span>Scenario</span><div className="field-wrap"><textarea value={botForm.scenario} maxLength={CHARACTER_LIMITS.scenario} onChange={e=>setBotForm({...botForm,scenario:e.target.value})} placeholder="Where the conversation takes place and what the starting situation is"/><CharacterCount value={botForm.scenario} max={CHARACTER_LIMITS.scenario}/></div></label>
      <label className="form-label form-label-count"><span>Lore / important information</span><div className="field-wrap"><textarea value={botForm.lore} maxLength={CHARACTER_LIMITS.lore} onChange={e=>setBotForm({...botForm,lore:e.target.value})} placeholder="History, relationships, facts, and details the character should know"/><CharacterCount value={botForm.lore} max={CHARACTER_LIMITS.lore}/></div></label>
      <label className="form-label form-label-count"><span>Tags</span><div className="field-wrap"><input value={botForm.tags} maxLength={CHARACTER_LIMITS.tags} onChange={e=>setBotForm({...botForm,tags:e.target.value})} placeholder="Anime, Adventure, Romance" /><CharacterCount value={botForm.tags} max={CHARACTER_LIMITS.tags}/></div></label>
      <label className="form-label form-label-count"><span>Image (optional URL)</span><div className="field-wrap"><input value={botForm.image} maxLength={CHARACTER_LIMITS.image} onChange={e=>setBotForm({...botForm,image:e.target.value})} placeholder="https://..." /><CharacterCount value={botForm.image} max={CHARACTER_LIMITS.image}/></div></label>
      <div className="form-label visibility-field"><span>Visibility</span><div className="visibility-options">
        <label className={`visibility-option ${botForm.visibility==="public"?"selected":""}`}><input type="radio" name="visibility" checked={botForm.visibility==="public"} onChange={()=>setBotForm({...botForm,visibility:"public"})}/><strong>Public</strong><small>Appears in Explore and can be used by the community.</small></label>
        <label className={`visibility-option ${botForm.visibility==="private"?"selected":""}`}><input type="radio" name="visibility" checked={botForm.visibility==="private"} onChange={()=>setBotForm({...botForm,visibility:"private"})}/><strong>Private</strong><small>Only visible on your profile.</small></label>
      </div></div>
      {profileMessage && <div className="profile-notice create-bot-notice" role="status">{profileMessage}</div>}
      <div className="create-bot-actions">
        <button type="button" className="secondary-action" onClick={()=>setPreviewBotOpen(true)} disabled={publishingBot}>Preview bot</button>
        <button type="button" className="auth-submit" onClick={saveBot} disabled={publishingBot}>{publishingBot ? (editingBotId ? "Saving..." : "Publishing...") : (editingBotId ? "Save changes" : "Publish bot")}</button>
      </div>
      </div></div>}
      {previewBotOpen&&<div className="overlay preview-overlay" onClick={()=>setPreviewBotOpen(false)}><div className="profile-modal bot-preview-modal" onClick={e=>e.stopPropagation()}>
        <div className="panel-head"><div><h2>Preview</h2><p>This is how the character will appear before you publish it.</p></div><button type="button" onClick={()=>setPreviewBotOpen(false)}><X/></button></div>
        <div className="bot-preview-card">
          <div className="bot-preview-cover">{botForm.image ? <img src={botForm.image} alt="" /> : <div className="bot-placeholder"><Bot size={42}/></div>}</div>
          <div className="bot-preview-body">
            <div className="bot-preview-title"><h3>{botForm.name.trim() || "Character name"}</h3><span>{botForm.visibility==="public" ? "Public" : "Private"}</span></div>
            <p className="bot-preview-description">{botForm.description.trim() || "The character description will appear here."}</p>
            {botForm.tags.trim()&&<div className="tags">{botForm.tags.split(",").map(s=>s.trim()).filter(Boolean).slice(0,8).map(t=><span key={t}>{t}</span>)}</div>}
            <div className="bot-preview-section"><strong>Personality</strong><p>{botForm.personality.trim() || "No personality defined yet."}</p></div>
            <div className="bot-preview-section"><strong>Scenario</strong><p>{botForm.scenario.trim() || "No scenario defined yet."}</p></div>
            <div className="bot-preview-section"><strong>First message</strong><p>{botForm.greeting.trim() || "No greeting defined yet."}</p></div>
          </div>
        </div>
        <div className="create-bot-actions"><button type="button" className="secondary-action" onClick={()=>setPreviewBotOpen(false)}>Back to editing</button><button type="button" className="auth-submit" onClick={()=>{setPreviewBotOpen(false);saveBot();}} disabled={publishingBot}>{editingBotId ? "Save changes" : "Publish bot"}</button></div>
      </div></div>}
  </div></>;

  if (selected && active) return <>
  {reportOpen&&reportTarget&&<div className="overlay" onClick={()=>setReportOpen(false)}><div className="report-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Report content</h2><p>{reportTarget.label}</p></div><button onClick={()=>setReportOpen(false)}><X/></button></div><label className="form-label"><span>Reason</span><select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="harassment">Harassment or abuse</option><option value="sexual">Inappropriate sexual content</option><option value="violence">Violence</option><option value="hate">Hate or discrimination</option><option value="impersonation">Impersonation</option><option value="spam">Spam</option><option value="privacy">Privacy</option><option value="copyright">Copyright</option><option value="misinformation">Misinformation</option><option value="other">Other</option></select></label><label className="form-label"><span>Details (optional)</span><textarea maxLength={2000} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Briefly explain the issue. Do not include unnecessary personal data."/><small>{reportDetails.length}/2000</small></label>{reportStatus&&<div className="report-status">{reportStatus}</div>}<button className="auth-submit" onClick={submitReport} disabled={reportStatus==="Sending..."}>Submit report</button></div></div>}
  {responseFeedbackOpen&&<div className="overlay response-feedback-overlay" onClick={()=>setResponseFeedbackOpen(false)}><div className="response-feedback-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>{responseFeedbackValue==="like"?"What did you like?":"What did not work?"}</h2><p>Choose the characteristics that best describe this response. This helps guide future responses.</p></div><button onClick={()=>setResponseFeedbackOpen(false)}><X/></button></div><div className="response-feedback-options">{RESPONSE_FEEDBACK_OPTIONS[responseFeedbackValue].map(([key,label])=><button type="button" key={key} className={responseFeedbackTags.includes(key)?"selected":""} onClick={()=>setResponseFeedbackTags(tags=>tags.includes(key)?tags.filter(t=>t!==key):[...tags,key])}>{label}</button>)}</div>{responseFeedbackTags.includes("other")&&<label className="form-label"><span>Tell us more</span><textarea maxLength={600} value={responseFeedbackNote} onChange={e=>setResponseFeedbackNote(e.target.value)} placeholder="Briefly explain why..."/><small>{responseFeedbackNote.length}/600</small></label>}{responseFeedbackStatus&&<div className="report-status">{responseFeedbackStatus}</div>}<div className="feedback-modal-actions"><button className="auth-submit" onClick={submitResponseFeedback} disabled={responseFeedbackStatus==="Saving..."}>Save feedback</button></div></div></div>}
  {messageMenuId && active && (() => { const target = active.messages.find(m => m.id === messageMenuId); if (!target) return null; const pinned = isMessagePinned(target.id); return <div className="overlay message-menu-overlay" onClick={()=>setMessageMenuId(null)}><div className="message-menu-sheet" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("messageActions")}><div className="message-menu-grab" aria-hidden="true"/><div className="message-menu-list"><button onClick={()=>void copyMessage(target.id)}><Copy size={20}/><span>{t("copyAction")}</span></button><button onClick={()=>prepareMessageAction("branch",target.id)}><Share2 size={20}/><span>{t("newChatFromHere")}</span></button><button onClick={()=>prepareMessageAction("rewind",target.id)}><RotateCcw size={20}/><span>{t("rewindToHere")}</span></button><button onClick={()=>{setEditing(target.id);setEditText(target.text);setMessageMenuId(null)}}><Pencil size={20}/><span>{t("editAction")}</span></button><button onClick={()=>void toggleMessagePin(target.id)}><Pin size={20}/><span>{pinned?t("unpinAction"):t("pinAction")}</span></button><button className="message-menu-danger" onClick={()=>prepareMessageAction("remove",target.id)}><Trash2 size={20}/><span>{t("removeAction")}</span></button></div><button className="message-menu-close" onClick={()=>setMessageMenuId(null)}>{t("closeAction")}</button></div></div> })()}
  {messageConfirm && active && (() => { const target = active.messages.find(m => m.id === messageConfirm.messageId); if (!target) return null; const copy = messageConfirm.action === "branch" ? {title:t("startNewChatTitle"),text:t("startNewChatText"),action:t("startNewChatAction")} : messageConfirm.action === "rewind" ? {title:t("rewindTitle"),text:t("rewindText"),action:t("rewindAction")} : {title:t("removeTitle"),text:t("removeText"),action:t("removeActionConfirm")}; return <div className="overlay message-confirm-overlay" onClick={()=>setMessageConfirm(null)}><div className="message-confirm-modal" onClick={e=>e.stopPropagation()} role="dialog" aria-modal="true"><div className="panel-head"><div><h2>{copy.title}</h2><p>{copy.text}</p></div><button onClick={()=>setMessageConfirm(null)} aria-label={t("closeAction")}><X/></button></div><div className="message-confirm-actions"><button className="secondary-action" onClick={()=>setMessageConfirm(null)}>{t("cancelAction")}</button><button className={messageConfirm.action==="remove"?"danger-action":"auth-submit"} onClick={()=>void executeMessageAction()}>{copy.action}</button></div></div></div> })()}
  {feedbackOpen&&<div className="overlay feedback-overlay" onClick={()=>setFeedbackOpen(false)}><div className="feedback-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>{t("sendFeedback")}</h2><p>{t("feedbackDescription")}</p></div><button onClick={()=>setFeedbackOpen(false)}><X/></button></div><label className="form-label"><span>{t("categoryLabel")}</span><select value={feedbackCategory} onChange={e=>setFeedbackCategory(e.target.value)}><option value="feature">Feature suggestion</option><option value="bug">Bug or problem</option><option value="quality">AI quality</option><option value="character">Character behavior</option><option value="interface">Interface</option><option value="other">Other</option></select></label><label className="form-label"><span>{t("feedbackLabel")}</span><textarea maxLength={1500} value={feedbackText} onChange={e=>setFeedbackText(e.target.value)} placeholder={t("feedbackPlaceholder")}/><small>{feedbackText.length}/1500</small></label>{feedbackStatus&&<div className="report-status">{feedbackStatus}</div>}<div className="feedback-modal-actions"><button className="auth-submit" onClick={submitProductFeedback} disabled={feedbackStatus==="Sending..."}>{t("sendFeedback")}</button></div></div></div>}
  {adminInsightsOpen&&adminInsights&&<div className="overlay" onClick={()=>setAdminInsightsOpen(false)}><div className="admin-modal insights-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Product report</h2><p>Aggregated data from the last 7 and 30 days.</p></div><button onClick={()=>setAdminInsightsOpen(false)}><X/></button></div><div className="insights-grid"><div className="insight-card"><small>Today · test usage</small><strong>{Number(adminInsights.period?.days1?.tokens||0).toLocaleString("en-US")}</strong><span>tokens · beta ceiling {Number(adminInsights.betaDailyLimit||50000).toLocaleString("en-US")}/tester</span></div><div className="insight-card"><small>Today · generations</small><strong>{Number(adminInsights.period?.days1?.generations||0).toLocaleString("en-US")}</strong><span>current beta traffic</span></div><div className="insight-card"><small>30 days · estimated cost</small><strong>US$ {Number(adminInsights.period?.days30?.cost||0).toFixed(2)}</strong><span>based on configured provider rates</span></div><div className="insight-card"><small>30 days · tokens</small><strong>{Number(adminInsights.period?.days30?.tokens||0).toLocaleString("en-US")}</strong><span>total generation tokens</span></div></div><div className="insight-section"><h3>Beta tester usage today</h3>{(adminInsights.testers||[]).length?(<div className="tester-usage-list">{(adminInsights.testers||[]).map((x:any)=><div className="tester-usage-row" key={x.id}><div><strong>{x.username}</strong><small>{x.email}</small></div><div><strong>{Number(x.dailyTokens||0).toLocaleString("en-US")}</strong><small>{Number(adminInsights.betaDailyLimit||50000).toLocaleString("en-US")} daily limit</small></div></div>)}</div>):<p className="empty">No users yet.</p>}</div><div className="insight-section"><h3>Quality issues</h3>{(adminInsights.topProblems||[]).length?(adminInsights.topProblems.map((x:any)=><div className="insight-row" key={x.type}><span>{x.type}</span><strong>{x.count}</strong></div>)):<p className="empty">No issues recorded.</p>}</div><div className="insight-section"><h3>Explicit feedback</h3>{(adminInsights.recentFeedback||[]).length?(adminInsights.recentFeedback.slice(0,12).map((x:any,i:number)=><div className="feedback-item" key={i}><div><strong>{x.category}</strong><small>{x.username} · {new Date(x.createdAt).toLocaleString("en-US")}</small></div><p>{x.text}</p></div>)):<p className="empty">No feedback submitted yet.</p>}</div><small className="insight-privacy">{adminInsights.privacy}</small></div></div>}
  {adminOpen&&<div className="overlay" onClick={()=>setAdminOpen(false)}><div className="admin-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Moderação</h2><p>Denúncias pendentes e histórico recente.</p></div><button onClick={()=>setAdminOpen(false)}><X/></button></div><div className="admin-report-list">{adminReports.length===0?<div className="empty">Nenhuma denúncia encontrada.</div>:adminReports.map((r:any)=><div className="admin-report-card" key={r.id}><div className="admin-report-top"><strong>{r.target_type} · {r.reason}</strong><span className={`report-status-pill ${r.status}`}>{r.status}</span></div><p>{r.details||"Sem detalhes adicionais."}</p>{r.evidence?.text&&<blockquote>{String(r.evidence.text).slice(0,700)}</blockquote>}<small>por @{r.reporter_username||"usuário"} · {new Date(r.created_at).toLocaleString("en-US")}</small><div className="admin-report-actions"><button onClick={()=>updateReport(r.id,"reviewing","normal")}>Em análise</button><button onClick={()=>updateReport(r.id,"resolved","high")}>Resolver</button><button onClick={()=>updateReport(r.id,"dismissed","low")}>Descartar</button></div></div>)}</div></div></div>}
  {betaWelcomeOpen&&<div className="overlay beta-welcome-overlay" onClick={dismissBetaWelcome}><div className="beta-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="beta-welcome-title" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><span className="beta-pill">BETA</span><h2 id="beta-welcome-title">Welcome to the PersonaChat Beta</h2><p>You are among the first testers. The goal is to chat, explore, and help us find what needs improvement.</p></div><button onClick={dismissBetaWelcome} aria-label={t("closeAction")}><X/></button></div><div className="beta-welcome-list"><div><strong>1.</strong><span>Chat with a character and continue the conversation later.</span></div><div><strong>2.</strong><span>Explore the community and try different characters.</span></div><div><strong>3.</strong><span>Found something strange? Use <b>Send feedback</b>.</span></div></div><button className="auth-submit" onClick={dismissBetaWelcome}>Start exploring</button></div></div>}
   <PremiumModal open={premiumOpen} onClose={()=>setPremiumOpen(false)} plan={user?.plan} isAdmin={isAdminUser}/><div className="app-shell">
    <aside className="sidebar chat-sidebar">
      <button className="new-chat" onClick={newConversation}><Plus size={18}/> New conversation</button>
      <button className="nav-item" onClick={()=>{setSelected(null);setActiveConversation(null)}}><Compass size={18}/> {t("discover")}</button>
      <div className="side-title"><span>{t("yourChats")}</span></div>
      <button className="mobile-plus-button chat-sidebar-premium-btn" type="button" onClick={()=>setPremiumOpen(true)} aria-label="Meet PersonaChat+"><span className="mobile-plus-icon"><Sparkles size={16}/></span><span className="mobile-plus-copy"><strong>PersonaChat +</strong><small>More memory and features</small></span><ChevronRight size={16}/></button>
      <div className="chat-sidebar-search">
        <Search size={15} aria-hidden="true"/>
        <input value={chatSearch} onChange={e=>setChatSearch(e.target.value)} placeholder={t("searchYourChats")} aria-label={t("searchYourChats")}/>
        {chatSearch&&<button type="button" onClick={()=>setChatSearch("")} aria-label="Clear search"><X size={14}/></button>}
      </div>
      <div className="chat-sidebar-list">
        {sidebarConversations.length ? sidebarConversations.map(({ conversation:c, character:ch })=><div key={ch.id} className="conversation-row"><button className={`conversation-item ${selected?.id===ch.id?"active":""}`} onClick={()=>{setSelected(ch);setActiveConversation(c.id)}}><Avatar character={ch} size={36}/><span>{ch.name}</span></button></div>) : <div className="chat-sidebar-empty">{chatSearch.trim()?t("noConversationFound"):"Your conversations will appear here."}</div>}
      </div>
    </aside>
    <main className="chat-main"><header className="chat-header"><button className="icon-button chat-back-button" onClick={()=>{setSelected(null);setActiveConversation(null)}} aria-label="Leave chat"><ArrowLeft size={20}/></button><Avatar character={selected} size={40}/><button className="chat-character-title" onClick={()=>setConversationPanelOpen(true)} title="Open character information"><strong>{selected.name}</strong><span>{selected.description}</span></button><button className="info-button" onClick={()=>setMemoryOpen(true)}><Sparkles size={18}/> Memories</button><button className="icon-button danger" onClick={()=>{if(window.confirm("Delete this conversation?"))deleteConversation(active.id)}} title="Delete conversation"><Trash2 size={18}/></button></header>
      <section className="messages"><div className="character-intro character-intro-minimal"><strong>{selected.name}</strong> {t("messageCreatedBy")} <button type="button" className="chat-creator-link" onClick={()=>void openCharacterCreatorProfile()}>{selected.creator || "@person"}</button>.</div>
        {active.messages.map(m=><div key={m.id} className={`message-row ${m.sender}`}><div className="message-content">{m.sender==="character"&&<div className="character-message-author"><Avatar character={selected} size={48}/><strong>{selected.name}</strong></div>}{m.sender==="user"&&<div className="user-message-author"><UserAvatar user={user} size={42}/><strong>{user.name}</strong></div>}{m.sender==="user"&&<div className="message-meta">{m.edited&&"Edited"}</div>}{editing===m.id?<div className="edit-box"><textarea value={editText} onChange={e=>setEditText(e.target.value)}/><button onClick={()=>editMessage(m.id)}>Save</button><button onClick={()=>setEditing(null)}>Cancel</button></div>:<div className="message-action-line"><div className={`bubble ${regeneratingMessageId === m.id ? "bubble-generating" : ""}`}>{regeneratingMessageId === m.id && liveResponse?.messageId === m.id ? (liveResponse.text ? <span className="streaming-text">{liveResponse.text}</span> : <TypingIndicator />) : <RichText text={m.text}/>}</div><button type="button" className="message-more-button" onClick={()=>setMessageMenuId(m.id)} aria-label={`${t("messageActions")} — ${m.sender==="user"?user.name:selected.name}`} title={t("messageActions")}><MoreHorizontal size={17} aria-hidden="true" /></button></div>}
          {m.sender==="character"&&!editing&&regeneratingMessageId!==m.id&&<div className="bot-actions"><button className="report-message-action" onClick={()=>openReport("message", selected.id, `Message from ${selected.name}`, m.id)} title="Report message" aria-label="Report message"><Flag size={15}/></button><button className={m.feedback==="like"?"selected":""} onClick={()=>feedback(m.id,"like")} title="I liked it" aria-label="I liked this response"><ThumbsUp size={15}/></button><button className={m.feedback==="dislike"?"selected":""} onClick={()=>feedback(m.id,"dislike")} title="I did not like it" aria-label="I did not like this response"><ThumbsDown size={15}/></button>{active.messages.at(-1)?.id===m.id&&(active.messages.findIndex(x=>x.id===m.id)===0||active.messages.slice(0, active.messages.findIndex(x=>x.id===m.id)).some(x=>x.sender==="user"))&&<>{(responseAlternatives[m.id]?.length ?? 0) > 0 && <div className="response-swipe-controls" role="group" aria-label="Response generations"><button type="button" onClick={()=>void chooseResponseAlternative(m.id, Math.max(0, (selectedAlternativeIndex[m.id] ?? 0) - 1))} disabled={isGeneratingActiveConversation||regeneratingMessageId!==null||(selectedAlternativeIndex[m.id] ?? 0)<=0} aria-label="Previous generation"><ChevronLeft size={15}/></button><span>{`${(selectedAlternativeIndex[m.id] ?? 0) + 1}/${MAX_RESPONSE_GENERATIONS}`}</span><button type="button" onClick={()=>{const currentIndex=selectedAlternativeIndex[m.id] ?? 0; const generations=responseAlternatives[m.id] ?? []; if (currentIndex < generations.length - 1) void chooseResponseAlternative(m.id,currentIndex+1); else if (generations.length < MAX_RESPONSE_GENERATIONS) void regenerate(m.id);}} disabled={isGeneratingActiveConversation||regeneratingMessageId!==null||((selectedAlternativeIndex[m.id] ?? 0)>=MAX_RESPONSE_GENERATIONS-1)} aria-label="Next generation"><ChevronRight size={15}/></button></div>}</>}{m.feedback&&feedbackPromptedIds.includes(m.id)&&<button className="response-feedback-more" onClick={()=>{setResponseFeedbackMessageId(m.id);setResponseFeedbackValue(m.feedback!);setResponseFeedbackTags(m.feedbackTags??[]);setResponseFeedbackNote(m.feedbackNote??"");setResponseFeedbackStatus("");setResponseFeedbackOpen(true)}}>Tell us more</button>}</div>}
          </div></div>)}
        {isGeneratingActiveConversation&&liveResponse&&!active.messages.some(m => m.id === liveResponse.messageId)&&<div className="message-row character typing-row"><div className="message-content"><div className="character-message-author"><Avatar character={selected} size={48}/><strong>{selected.name}</strong></div><div className="bubble typing-bubble">{liveResponse.text ? <span className="streaming-text">{liveResponse.text}</span> : <TypingIndicator />}</div></div></div>}<div ref={messagesEndRef} aria-hidden="true" />
      </section>{showScrollToBottom&&<button type="button" className="scroll-to-bottom" onClick={scrollToLatestMessage} aria-label="Jump to latest message" title="Jump to latest message"><ChevronDown size={18}/></button>}
      <>{selected.type==="real_person"&&<div className="real-person-chat-notice">{t("realBotNotice")}</div>}{dailyLimitReached && <div className="daily-test-limit" role="alert"><strong>{t("dailyLimitTitle")}</strong><span>{t("dailyLimitBody")}</span><small>{dailyLimitCountdown > 0 ? `${t("dailyLimitCountdown")} ${formatCountdown(dailyLimitCountdown)}.` : t("dailyLimitNow")}</small></div>}{chatError&&<div className="chat-error-banner" role="alert"><span>{chatError}</span><div><button type="button" onClick={()=>void sendMessage()} disabled={dailyLimitReached}>{t("tryAgain")}</button><button type="button" onClick={()=>setChatError("")} aria-label={t("closeError")}><X size={15}/></button></div></div>}{active.messages.length===1&&!isGeneratingActiveConversation&&!message.trim()&&<div className="chat-starter-prompts" aria-label="Conversation starters">{getStarterPrompts(selected).map(prompt=><button key={prompt} type="button" onClick={()=>{setMessage(prompt);window.requestAnimationFrame(()=>composerRef.current?.focus())}}>{prompt}</button>)}</div>}<div className="composer-meta composer-feedback-only" ref={composerMetaRef}><button type="button" onClick={()=>setFeedbackOpen(true)}>{t("sendFeedback")}</button></div><div className="composer" ref={composerShellRef}><textarea ref={composerRef} value={message} onChange={e=>handleComposerChange(e.target.value)} onInput={e=>resizeComposer(e.currentTarget)} onKeyDown={e=>{const touchPrimary=window.matchMedia("(pointer: coarse) and (not (any-pointer: fine))").matches;if(e.key==="Enter"&&!e.shiftKey&&enterSends&&!touchPrimary){e.preventDefault();void sendMessage()}}} placeholder={`${t("chatWith")} ${selected.name}...`} aria-label={`${t("chatWith")} ${selected.name}`} disabled={dailyLimitReached}/><button className="send-button" onClick={()=>void sendMessage()} disabled={isGeneratingActiveConversation || dailyLimitReached} aria-label={message.trim()?t("send"):t("continueScene")} title={message.trim()?t("send"):t("continueScene")}><Send size={19}/></button></div></>
    </main>
    {conversationPanelOpen&&<div className="overlay character-panel-overlay" onClick={()=>setConversationPanelOpen(false)}><div className="character-panel" onClick={e=>e.stopPropagation()}>
      <div className="character-panel-grab" aria-hidden="true"/>
      <div className="character-panel-head"><button className="panel-close-circle" onClick={()=>setConversationPanelOpen(false)} aria-label={t("closeAction")}><X/></button></div>
      <div className="character-panel-hero">
        <img src={selected.image} alt={selected.name} className="character-panel-image"/>
        <h2>{selected.name}</h2>
        <p>{selected.description}</p>
        <div className="character-panel-stats"><span><MessageCircle size={15}/>{selected.likes ?? conversations.filter(c=>c.characterId===selected.id).reduce((n,c)=>n+c.messages.filter(m=>m.sender==="user").length,0).toLocaleString("en-US")}</span><span><Heart size={15} fill={likedBotIds.includes(selected.id)?"currentColor":"none"}/>{likedBotIds.includes(selected.id)?"Liked":"Like"}</span></div>
        {(selected.tags ?? []).length>0&&<div className="character-panel-tags" aria-label="Tags do character">{(selected.tags ?? []).map(tag=><span key={tag}>{tag}</span>)}</div>}
        <div className="character-panel-dates"><span>Created {selected.createdAt ? `${Math.max(0, Math.floor((Date.now()-selected.createdAt)/86400000))} days ago` : "on PersonaChat"}</span><span>{selected.updatedAt ? `Updated ${new Date(selected.updatedAt).toLocaleDateString("en-US")}` : ""}</span></div>
        <div className="character-panel-primary-actions">
          <button className="character-panel-new-conversation" onClick={()=>{setConversationPanelOpen(false);newConversation()}}><Plus size={17}/> New conversation</button>
          <button className={`round-action ${likedBotIds.includes(selected.id)?"selected":""}`} onClick={()=>void communityAction("like-bot",selected.id)} title={likedBotIds.includes(selected.id)?"Desfavoritar":"Like"}><Heart size={20} fill={likedBotIds.includes(selected.id)?"currentColor":"none"}/></button>
          <button className="round-action" onClick={()=>void shareCharacter()} title="Share"><Share2 size={20}/></button>
        </div>
      </div>
      <div className="character-panel-actions-list">
        <button className="character-panel-action" onClick={()=>void openCharacterCreatorProfile()} disabled={!selected.creatorId}><Users size={20}/><span>Ver perfil do criador</span><ChevronRight size={17}/></button>
        <button className="character-panel-action" onClick={()=>void refreshCurrentChat()}><RefreshCw size={20}/><span>Atualizar este bate-papo</span><ChevronRight size={17}/></button>
        <button className="character-panel-action" onClick={()=>{setConversationPanelOpen(false);setMemoryOpen(true)}}><Sparkles size={20}/><span>{t("memoriesChat")}</span><ChevronRight size={17}/></button>
        <button className="character-panel-action danger-text" onClick={()=>openReport("bot",selected.id,`Character ${selected.name}`)}><Flag size={20}/><span>Report character</span><ChevronRight size={17}/></button>
      </div>
      <div className="character-panel-conversations">
        <div className="character-panel-section-title"><strong>{t("conversations")}</strong></div>
        {conversations.filter(c=>c.characterId===selected.id).sort((a,b)=>b.updatedAt-a.updatedAt).map(c=><div className="conversation-manage-row" key={c.id}>{renamingConversation===c.id?<div className="conversation-rename full"><input autoFocus value={renameText} onChange={e=>setRenameText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameConversation(c.id);if(e.key==="Escape"){setRenamingConversation(null);setRenameText("")}}}/><button onClick={()=>renameConversation(c.id)}><Check size={16}/></button></div>:<><button className="conversation-manage-main" onClick={()=>{setActiveConversation(c.id);setConversationPanelOpen(false)}}><MessageCircle size={17}/><span><strong>{c.title}</strong><small>{new Date(c.updatedAt).toLocaleString("en-US")}</small></span></button><div className="conversation-manage-actions"><button onClick={()=>{setRenamingConversation(c.id);setRenameText(c.title)}} title="Renomear"><RefreshCw size={15}/></button><button className="danger" onClick={()=>{if(window.confirm("Delete this conversation?"))deleteConversation(c.id)}} title="Apagar"><Trash2 size={15}/></button></div></>}</div>)}
        {!conversations.some(c=>c.characterId===selected.id)&&<div className="empty">{t("noConversations")}</div>}
        {conversations.some(c=>c.characterId===selected.id)&&<button className="danger-panel-action" onClick={()=>deleteCharacterConversations(selected.id)}><Trash2 size={16}/> {t("deleteAllConversations")}</button>}
      </div>
    </div></div>}
    {characterProfileOpen&&<div className="overlay character-profile-overlay" onClick={()=>setCharacterProfileOpen(false)}><div className="character-profile-modal" onClick={e=>e.stopPropagation()}>
      <div className="character-profile-cover"><img src={selected.image} alt={selected.name}/><button className="panel-close-circle character-profile-close" onClick={()=>setCharacterProfileOpen(false)}><X/></button></div>
      <div className="character-profile-body"><BotTypeBadge type={selected.type}/><h2>{selected.name}</h2><p className="character-profile-description">{selected.description}</p><div className="tags character-profile-tags">{selected.tags.map(t=><span key={t}>{t}</span>)}</div><div className="character-profile-meta"><div><strong>Created by</strong><span>{selected.creator || "@person"}</span></div><div><strong>{t("conversations")}</strong><span>{conversations.filter(c=>c.characterId===selected.id).length}</span></div><div><strong>Favorites</strong><span>{likedBotIds.includes(selected.id)?"Yes":"No"}</span></div></div><div className="character-profile-actions"><button className="primary-btn" onClick={()=>{setCharacterProfileOpen(false);setConversationPanelOpen(false);newConversation()}}><Plus size={16}/> New conversation</button><button className="outline-btn" onClick={()=>void shareCharacter()}><Share2 size={16}/> {t("share")}</button><button className="outline-btn danger-outline" onClick={()=>openReport("bot",selected.id,`Character ${selected.name}`)}><Flag size={16}/> {t("report")}</button><button className="outline-btn" onClick={()=>{setCharacterProfileOpen(false);setConversationPanelOpen(false)}}>Back to chat</button></div></div>
    </div></div>}
    {memoryOpen&&<div className="overlay" onClick={()=>setMemoryOpen(false)}><div className="memory-panel" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Memories</h2><p>Memories exclusive to this conversation.</p></div><button onClick={()=>setMemoryOpen(false)}><X/></button></div><div className="memory-panel-toolbar"><span>{memories.filter(m=>m.conversationId===active?.id).length} memories</span><button className="memory-clear-button" onClick={()=>deleteConversationMemories(active.id)} disabled={!memories.some(m=>m.conversationId===active?.id)}><Trash2 size={15}/> Delete all</button></div>{memories.filter(m=>m.conversationId===active?.id).length===0?<div className="empty">No memories yet. Share something about yourself during the conversation.</div>:memories.filter(m=>m.conversationId===active?.id).map(m=><div className="memory-card" key={m.id}><span><strong>{m.text}</strong><small>{m.category || "fact"} · importance {m.importance ?? 3}/5{m.status === "superseded" ? " · superseded" : ""}</small></span><div className="memory-card-actions"><button onClick={()=>void editMemory(m.id)} title="Edit memory"><Pencil size={15}/></button><button onClick={()=>deleteMemory(m.id)} title="Delete memory"><Trash2 size={16}/></button></div></div>)}</div></div>}
  </div></>;

  return <>
  {reportOpen&&reportTarget&&<div className="overlay" onClick={()=>setReportOpen(false)}><div className="report-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Report content</h2><p>{reportTarget.label}</p></div><button onClick={()=>setReportOpen(false)}><X/></button></div><label className="form-label"><span>Reason</span><select value={reportReason} onChange={e=>setReportReason(e.target.value)}><option value="harassment">Harassment or abuse</option><option value="sexual">Inappropriate sexual content</option><option value="violence">Violence</option><option value="hate">Hate or discrimination</option><option value="impersonation">Impersonation</option><option value="spam">Spam</option><option value="privacy">Privacy</option><option value="copyright">Copyright</option><option value="misinformation">Misinformation</option><option value="other">Other</option></select></label><label className="form-label"><span>Details (optional)</span><textarea maxLength={2000} value={reportDetails} onChange={e=>setReportDetails(e.target.value)} placeholder="Briefly explain the issue. Do not include unnecessary personal data."/><small>{reportDetails.length}/2000</small></label>{reportStatus&&<div className="report-status">{reportStatus}</div>}<button className="auth-submit" onClick={submitReport} disabled={reportStatus==="Sending..."}>Submit report</button></div></div>}
  {feedbackOpen&&<div className="overlay feedback-overlay" onClick={()=>setFeedbackOpen(false)}><div className="feedback-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>{t("sendFeedback")}</h2><p>{t("feedbackDescription")}</p></div><button onClick={()=>setFeedbackOpen(false)}><X/></button></div><label className="form-label"><span>{t("categoryLabel")}</span><select value={feedbackCategory} onChange={e=>setFeedbackCategory(e.target.value)}><option value="feature">Feature suggestion</option><option value="bug">Bug or problem</option><option value="quality">AI quality</option><option value="character">Character behavior</option><option value="interface">Interface</option><option value="other">Other</option></select></label><label className="form-label"><span>{t("feedbackLabel")}</span><textarea maxLength={1500} value={feedbackText} onChange={e=>setFeedbackText(e.target.value)} placeholder={t("feedbackPlaceholder")}/><small>{feedbackText.length}/1500</small></label>{feedbackStatus&&<div className="report-status">{feedbackStatus}</div>}<div className="feedback-modal-actions"><button className="auth-submit" onClick={submitProductFeedback} disabled={feedbackStatus==="Sending..."}>{t("sendFeedback")}</button></div></div></div>}
  {adminInsightsOpen&&adminInsights&&<div className="overlay" onClick={()=>setAdminInsightsOpen(false)}><div className="admin-modal insights-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Product report</h2><p>Aggregated data from the last 7 and 30 days.</p></div><button onClick={()=>setAdminInsightsOpen(false)}><X/></button></div><div className="insights-grid"><div className="insight-card"><small>Today · test usage</small><strong>{Number(adminInsights.period?.days1?.tokens||0).toLocaleString("en-US")}</strong><span>tokens · beta ceiling {Number(adminInsights.betaDailyLimit||50000).toLocaleString("en-US")}/tester</span></div><div className="insight-card"><small>Today · generations</small><strong>{Number(adminInsights.period?.days1?.generations||0).toLocaleString("en-US")}</strong><span>current beta traffic</span></div><div className="insight-card"><small>30 days · estimated cost</small><strong>US$ {Number(adminInsights.period?.days30?.cost||0).toFixed(2)}</strong><span>based on configured provider rates</span></div><div className="insight-card"><small>30 days · tokens</small><strong>{Number(adminInsights.period?.days30?.tokens||0).toLocaleString("en-US")}</strong><span>total generation tokens</span></div></div><div className="insight-section"><h3>Beta tester usage today</h3>{(adminInsights.testers||[]).length?(<div className="tester-usage-list">{(adminInsights.testers||[]).map((x:any)=><div className="tester-usage-row" key={x.id}><div><strong>{x.username}</strong><small>{x.email}</small></div><div><strong>{Number(x.dailyTokens||0).toLocaleString("en-US")}</strong><small>{Number(adminInsights.betaDailyLimit||50000).toLocaleString("en-US")} daily limit</small></div></div>)}</div>):<p className="empty">No users yet.</p>}</div><div className="insight-section"><h3>Quality issues</h3>{(adminInsights.topProblems||[]).length?(adminInsights.topProblems.map((x:any)=><div className="insight-row" key={x.type}><span>{x.type}</span><strong>{x.count}</strong></div>)):<p className="empty">No issues recorded.</p>}</div><div className="insight-section"><h3>Explicit feedback</h3>{(adminInsights.recentFeedback||[]).length?(adminInsights.recentFeedback.slice(0,12).map((x:any,i:number)=><div className="feedback-item" key={i}><div><strong>{x.category}</strong><small>{x.username} · {new Date(x.createdAt).toLocaleString("en-US")}</small></div><p>{x.text}</p></div>)):<p className="empty">No feedback submitted yet.</p>}</div><small className="insight-privacy">{adminInsights.privacy}</small></div></div>}
  {adminOpen&&<div className="overlay" onClick={()=>setAdminOpen(false)}><div className="admin-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>Moderação</h2><p>Denúncias pendentes e histórico recente.</p></div><button onClick={()=>setAdminOpen(false)}><X/></button></div><div className="admin-report-list">{adminReports.length===0?<div className="empty">Nenhuma denúncia encontrada.</div>:adminReports.map((r:any)=><div className="admin-report-card" key={r.id}><div className="admin-report-top"><strong>{r.target_type} · {r.reason}</strong><span className={`report-status-pill ${r.status}`}>{r.status}</span></div><p>{r.details||"Sem detalhes adicionais."}</p>{r.evidence?.text&&<blockquote>{String(r.evidence.text).slice(0,700)}</blockquote>}<small>por @{r.reporter_username||"usuário"} · {new Date(r.created_at).toLocaleString("en-US")}</small><div className="admin-report-actions"><button onClick={()=>updateReport(r.id,"reviewing","normal")}>Em análise</button><button onClick={()=>updateReport(r.id,"resolved","high")}>Resolver</button><button onClick={()=>updateReport(r.id,"dismissed","low")}>Descartar</button></div></div>)}</div></div></div>}
  <PremiumModal open={premiumOpen} onClose={()=>setPremiumOpen(false)} plan={user?.plan} isAdmin={isAdminUser}/><div className="app-shell"><aside className={`sidebar ${activeConversation ? "sidebar-chat-mode" : "sidebar-home-mode"}`}><div className="brand">Persona<span>Chat</span></div><button className="new-chat" onClick={async()=>{const p=await loadProfile();if(p){setProfileView(true);setProfileTab("created");setEditingBotId(null);setBotForm({...emptyBotForm});setPreviewBotOpen(false);setCreateBotOrigin("profile");setCreateBotOpen(true)}}}><Plus size={18}/> {t("create")}</button><div className="sidebar-chat-search"><Search size={15} aria-hidden="true"/><input value={chatSearch} onChange={e=>setChatSearch(e.target.value)} placeholder={t("searchYourChats")} aria-label={t("searchYourChats")}/>{chatSearch&&<button type="button" onClick={()=>setChatSearch("")} aria-label="Clear search"><X size={14}/></button>}</div><button className="nav-item active" onClick={()=>{setExploreOpen(true);void loadExplore();}}><Compass size={18}/> {t("discover")}</button><button className="nav-item" onClick={()=>openProfile()}><Users size={18}/> {t("profile")}</button><button className="nav-item" onClick={()=>setSettingsOpen(true)}><Settings size={18}/> {t("settings")}</button><button className="premium-sidebar-btn" type="button" onClick={()=>setPremiumOpen(true)} aria-label="Meet PersonaChat+"><span className="premium-sidebar-icon"><Sparkles size={16}/></span><span className="premium-sidebar-copy"><strong>PersonaChat +</strong><small>More memory and features</small></span><ChevronRight size={15} className="premium-sidebar-arrow"/></button><div className="side-title chat-list-heading"><span>{t("yourChats")}</span></div><div className="sidebar-chat-list">{sidebarConversations.length ? sidebarConversations.map(({conversation:c,character:ch})=><div key={ch.id} className="conversation-row"><button className={`conversation-item ${selected?.id===ch.id?"active":""}`} onClick={()=>{setSelected(ch);setActiveConversation(c.id)}}><Avatar character={ch} size={36}/><span>{ch.name}</span></button></div>) : <div className="sidebar-chat-empty">{chatSearch.trim()?t("noConversationFound"):t("yourChats")}</div>}</div></aside>
    <main className="discover"><header className="topbar"><div className="home-search-wrap"><div className="search"><Search size={18}/><input value={search} onChange={e=>{setSearch(e.target.value);setHomeSearchSubmitted(false)}} onFocus={()=>setHomeSearchFocused(true)} onBlur={()=>window.setTimeout(()=>setHomeSearchFocused(false),140)} onKeyDown={e=>{if(e.key==="Enter") void submitHomeSearch()}} placeholder={t("searchCharacters")} aria-label={t("searchCharacters")}/>{search&&<button type="button" className="home-search-clear" onMouseDown={e=>e.preventDefault()} onClick={clearHomeSearch} aria-label="Clear search"><X size={15}/></button>}</div>{homeSearchFocused&&homeSearchSuggestions.length>0&&<div className="home-search-suggestions" role="listbox">{homeSearchSuggestions.map(c=><button key={c.id} type="button" role="option" aria-selected="false" onMouseDown={e=>e.preventDefault()} onClick={()=>{setHomeSearchFocused(false);void submitHomeSearch("characters",c.name)}}><span><strong>{c.name}</strong></span></button>)}</div>}</div><div className="profile-wrap" ref={profileWrapRef}><button className="profile" onClick={()=>setProfileOpen(!profileOpen)}><UserAvatar user={user} size={38}/></button>{profileOpen&&<div className="profile-menu"><strong>{user.name}</strong><span>{user.email}</span><button onClick={()=>openProfile()}>{t("viewProfile")}</button><button onClick={signOut}>{t("logout")}</button></div>}</div></header>
      {mobileTab === "chats" ? <section className="mobile-chats-page">
        <div className="mobile-chats-brandbar"><div className="brand mobile-chats-brand">Persona<span>Chat</span></div><button className="mobile-plus-button" type="button" onClick={()=>setPremiumOpen(true)} aria-label="PersonaChat +"><span className="mobile-plus-icon"><Sparkles size={16}/></span><span className="mobile-plus-copy"><strong>PersonaChat +</strong><small>More memory and features</small></span><ChevronRight size={16}/></button></div>
        <div className="mobile-chats-title">Your chats</div>
        <div className="mobile-chats-search"><Search size={17}/><input value={mobileChatSearch} onChange={e=>setMobileChatSearch(e.target.value)} placeholder="Search your chats..."/></div>
        <div className="mobile-chat-list">{sidebarConversations.filter(({character})=>!mobileChatSearch.trim() || characterSearchScore(character, normalizeSearchText(mobileChatSearch)) < 6).map(({conversation:c,character:ch})=><div className="mobile-chat-row-wrap" key={ch.id} onPointerDown={()=>startChatPress(ch.id)} onPointerUp={cancelChatPress} onPointerCancel={cancelChatPress} onPointerLeave={cancelChatPress} onContextMenu={e=>{e.preventDefault();setChatContextMenu(ch.id)}}><button className="mobile-chat-list-row" onClick={()=>{setSelected(ch);setActiveConversation(c.id);setMobileTab("home");setChatContextMenu(null)}}><Avatar character={ch} size={46}/><span><strong>{ch.name}</strong></span></button>{chatContextMenu===ch.id&&<div className="mobile-chat-context"><button onClick={()=>hideChatCharacter(ch.id)}>Hide bot</button></div>}</div>)}{sidebarConversations.length===0&&<div className="empty">You have not chatted with any character yet.</div>}</div>
      </section> : homeSearchSubmitted ? <section className="search-results-page"><div className="search-results-toolbar"><div><div className="eyebrow">SEARCH</div><h1>Results for “{search}”</h1></div><div className="search-mode-switch"><button className={searchMode==="characters"?"active":""} onClick={()=>void submitHomeSearch("characters")}>Characters</button><button className={searchMode==="creators"?"active":""} onClick={()=>void submitHomeSearch("creators")}>Creators</button></div></div>{searchMode==="characters"?<div className="search-result-list">{homeCharacterResults.length?homeCharacterResults.map(c=><button className="search-result-card" key={c.id} onClick={()=>openCharacter(c)}><div className="search-result-avatar">{c.image?<img src={c.image} alt={c.name} loading="lazy" decoding="async"/>:<div className="bot-placeholder"><Bot size={32}/></div>}</div><div className="search-result-info"><h3>{c.name}</h3><p>{c.sceneDescription || c.description}</p><div className="search-result-meta"><span><MessageCircle size={14}/>{Number(c.interactions??0).toLocaleString("en-US")}</span><span>@{String(c.creator||"@person").replace(/^@/,'')}</span></div></div><ChevronRight size={18}/></button>):<div className="search-results-empty"><Search size={30}/><h3>No characters found</h3><p>Try another name, tag, or search term.</p></div>}</div>:<div className="creator-result-list">{creatorSearchResults.length?creatorSearchResults.map(c=><button className="creator-result-card" key={c.id} onClick={()=>openProfile(c.id)}><UserAvatar user={{name:c.name,avatar:c.avatar}} size={62}/><div className="creator-result-info"><h3>{c.name}</h3><span>@{c.username}</span><p><strong>Character(s):</strong> {c.bots.map(b=>b.name).join(", ")}</p><div className="search-result-meta"><span><MessageCircle size={14}/>{Number(c.interactions).toLocaleString("en-US")}</span><span>{c.botCount} bot{c.botCount===1?"":"s"} public{c.botCount===1?"":"s"}</span></div></div><ChevronRight size={18}/></button>):<div className="search-results-empty"><Users size={30}/><h3>No creators found</h3><p>Search by the name or @handle of someone who published characters.</p></div>}</div>}</section> : <><section className="hero"><div><div className="home-brand-lockup"><span className="persona-logo-mark" aria-hidden="true"></span><strong>Persona<span className="brand-chat-purple">Chat</span></strong><span className="beta-pill">BETA</span></div><h1 className="hero-phrase-purple">{t("heroTitle")}</h1><p>{t("heroText")}</p><div className="hero-mobile-actions"><button className="hero-btn" onClick={()=>{setExploreOpen(true);void loadExplore();}}><Compass size={17}/> {t("explore")}</button><button className="hero-btn hero-create-character-btn" onClick={()=>{setEditingBotId(null);setBotForm({...emptyBotForm});setPreviewBotOpen(false);setProfileMessage("");setCreateBotOrigin("home");setCreateBotOpen(true)}}><Plus size={17}/> Create character</button></div></div></section><section className="content"><div className="section-heading desktop-home-heading"><div><h2>Find your next conversation</h2><p>Pick up where you left off or discover a different character.</p></div></div><div className="desktop-home-recommendations">{(()=>{
  const recent = conversations.slice().sort((a,b)=>b.updatedAt-a.updatedAt).map(c=>allCharacters.find(x=>x.id===c.characterId)).filter(Boolean) as Character[];
  const likedSet = new Set(likedBotIds);
  const likedTags = new Set<string>();
  allCharacters.forEach(c=>{if(likedSet.has(c.id)) (c.tags||[]).forEach(tag=>likedTags.add(tag.toLowerCase()));});
  const forYou = allCharacters.filter(c=>c.visibility!=="private" && !recent.some(r=>r.id===c.id) && ((c.tags||[]).some(tag=>likedTags.has(tag.toLowerCase())) || likedSet.has(c.id))).slice(0,6);
  const varied = allCharacters.filter(c=>c.visibility!=="private" && !recent.some(r=>r.id===c.id) && !forYou.some(r=>r.id===c.id)).slice(0,6);
  const sections = [
    {key:"continue", title:"Continue your conversations", subtitle:"Jump back into characters you already know.", items:recent.slice(0,6)},
    {key:"for-you", title:"Made for your taste", subtitle:"Characters that match the kinds of bots you interact with.", items:forYou},
    {key:"discover", title:"Something different", subtitle:"A few good options outside your usual rotation.", items:varied},
  ];
  return sections.map(section=><div className="desktop-home-recommendation" key={section.key}><div className="desktop-home-category-head"><div><h3>{section.title}</h3><p>{section.subtitle}</p></div></div><div className="desktop-home-rail">{(section.items.length?section.items:visibleCharacters.slice(0,6)).filter((c,i,arr)=>arr.findIndex(x=>x.id===c.id)===i).map(c=><div key={`${section.key}-${c.id}`} className="desktop-home-card-wrap"><button type="button" className="desktop-home-card" onClick={()=>openCharacter(c)}><div className="desktop-home-card-image">{c.image?<img src={c.image} alt={c.name} loading="lazy" decoding="async"/>:<div className="bot-placeholder"><Bot size={30}/></div>}</div><div className="desktop-home-card-body"><h4>{c.name}</h4><BotTypeBadge type={c.type}/><p>{c.sceneDescription || c.description}</p><span>Chat now <ChevronRight size={14}/></span></div></button><button type="button" className={`desktop-home-like ${likedBotIds.includes(c.id)?"liked":""}`} onClick={(e)=>{e.preventDefault();e.stopPropagation();void communityAction("like-bot",c.id)}} aria-label={likedBotIds.includes(c.id)?"Unlike":"Like"}><Heart size={15} fill={likedBotIds.includes(c.id)?"currentColor":"none"}/></button></div>)}</div></div>);
})()}</div><div className="mobile-home-categories">{homeCategorySections.map(section=><div className="mobile-home-category" key={section.key}><div className="mobile-home-category-head"><h3>{section.title}</h3><ChevronRight size={17}/></div><div className="mobile-home-category-row">{section.items.map(c=><div className="mobile-home-card-wrap" key={`${section.key}-${c.id}`}><button className="mobile-home-card" onClick={()=>openCharacter(c)}><div className="mobile-home-card-image">{c.image?<img src={c.image} alt={c.name} loading="lazy" decoding="async"/>:<div className="bot-placeholder"><Bot size={26}/></div>}</div><strong>{c.name}</strong><p>{c.sceneDescription || c.description || "A character to chat with."}</p><span className="mobile-card-chat-count"><MessageCircle size={11}/>{Number(exploreData.all.find(x=>x.id===c.id)?.interactions ?? conversations.filter(x=>x.characterId===c.id).length).toLocaleString("en-US")}</span></button><button className={`mobile-home-like ${likedBotIds.includes(c.id)?"liked":""}`} onClick={()=>void communityAction("like-bot",c.id)} aria-label={likedBotIds.includes(c.id)?"Unlike":"Like"}><Heart size={14} fill={likedBotIds.includes(c.id)?"currentColor":"none"}/></button></div>)}</div></div>)}</div></section></>}
    </main>
    {createBotOpen&&<div className="overlay create-bot-overlay" onClick={()=>{setCreateBotOpen(false);setPreviewBotOpen(false);setCreateBotOrigin(null)}}><div className="profile-modal create-bot-modal" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h2>{editingBotId ? "Edit bot" : "Create bot"}</h2><p>{editingBotId ? "Update the character sheet and save your changes." : "Build the character sheet before publishing."}</p></div><button onClick={()=>{setCreateBotOpen(false);setPreviewBotOpen(false);setCreateBotOrigin(null)}}><X/></button></div>
      <label className="form-label form-label-count"><span>Name</span><div className="field-wrap"><input value={botForm.name} maxLength={CHARACTER_LIMITS.name} onChange={e=>setBotForm({...botForm,name:e.target.value})} placeholder="e.g. Captain Orion" /><CharacterCount value={botForm.name} max={CHARACTER_LIMITS.name}/></div></label>
      <label className="form-label form-label-count"><span>Scene description</span><div className="field-wrap"><input value={botForm.description} maxLength={CHARACTER_LIMITS.description} onChange={e=>setBotForm({...botForm,description:e.target.value})} placeholder="e.g. You meet this character on a rainy night in Gotham." /><CharacterCount value={botForm.description} max={CHARACTER_LIMITS.description}/></div></label>
      {!editingBotId&&<div className="form-label bot-type-field"><span>Character type</span><p className="form-help">Choose an option. This is saved with the bot and helps determine when public research/OSINT may be used.</p><div className="bot-type-options">
        <label className={`bot-type-option ${botForm.botType==="real_person"?"selected":""}`}><input type="radio" name="botType" value="real_person" checked={botForm.botType==="real_person"} onChange={()=>setBotForm({...botForm,botType:"real_person"})}/><span className="bot-type-icon">👤</span><strong>Real person</strong><small>Represents someone who exists in real life.</small></label>
        <label className={`bot-type-option ${botForm.botType==="existing_character"?"selected":""}`}><input type="radio" name="botType" value="existing_character" checked={botForm.botType==="existing_character"} onChange={()=>setBotForm({...botForm,botType:"existing_character"})}/><span className="bot-type-icon">🎭</span><strong>Existing character</strong><small>A character from a known work, franchise, or universe.</small></label>
        <label className={`bot-type-option ${botForm.botType==="original"?"selected":""}`}><input type="radio" name="botType" value="original" checked={botForm.botType==="original"} onChange={()=>setBotForm({...botForm,botType:"original"})}/><span className="bot-type-icon">✨</span><strong>Original character</strong><small>Created by the user.</small></label>
      </div></div>}
      {botForm.botType==="real_person"&&<div className="real-person-safety"><strong>Real-person bot protection</strong><p>Use only appropriate public information. Do not include addresses, phone numbers, documents, real-time location, medical data, passwords, or other private information. The bot must clearly state that it is a simulation and not the real person.</p><label className="safety-check"><input type="checkbox" checked={botForm.realPersonSafety} onChange={e=>setBotForm({...botForm,realPersonSafety:e.target.checked})}/><span>I confirm that I will use only public information and will not present the bot as the real person.</span></label></div>}
      <label className="form-label form-label-count"><span>Greeting</span><div className="field-wrap"><textarea value={botForm.greeting} maxLength={CHARACTER_LIMITS.greeting} onChange={e=>setBotForm({...botForm,greeting:e.target.value})} placeholder="The first thing the character will say"/><CharacterCount value={botForm.greeting} max={CHARACTER_LIMITS.greeting}/></div></label>
      <label className="form-label form-label-count"><span>Personality</span><div className="field-wrap"><textarea value={botForm.personality} maxLength={CHARACTER_LIMITS.personality} onChange={e=>setBotForm({...botForm,personality:e.target.value})} placeholder="How this character thinks, reacts, and behaves"/><CharacterCount value={botForm.personality} max={CHARACTER_LIMITS.personality}/></div></label>
      <label className="form-label form-label-count"><span>Speech style</span><div className="field-wrap"><textarea value={botForm.speechStyle} maxLength={CHARACTER_LIMITS.speechStyle} onChange={e=>setBotForm({...botForm,speechStyle:e.target.value})} placeholder="e.g. sarcastic, concise, uses slang, formal..."/><CharacterCount value={botForm.speechStyle} max={CHARACTER_LIMITS.speechStyle}/></div></label>
      <label className="form-label form-label-count"><span>Example dialogue</span><div className="field-wrap"><textarea value={botForm.exampleMessages} maxLength={CHARACTER_LIMITS.examplesTotal} onChange={e=>setBotForm({...botForm,exampleMessages:e.target.value})} placeholder="One line per example. Maximum 8 examples, up to 1,200 characters each."/><CharacterCount value={botForm.exampleMessages} max={CHARACTER_LIMITS.examplesTotal}/></div><p className="form-help">Up to {CHARACTER_LIMITS.exampleCount} examples · {CHARACTER_LIMITS.exampleEach} characters per example · {CHARACTER_LIMITS.examplesTotal} total.</p></label>
      <label className="form-label form-label-count"><span>Scenario</span><div className="field-wrap"><textarea value={botForm.scenario} maxLength={CHARACTER_LIMITS.scenario} onChange={e=>setBotForm({...botForm,scenario:e.target.value})} placeholder="Where the conversation takes place and what the starting situation is"/><CharacterCount value={botForm.scenario} max={CHARACTER_LIMITS.scenario}/></div></label>
      <label className="form-label form-label-count"><span>Lore / important information</span><div className="field-wrap"><textarea value={botForm.lore} maxLength={CHARACTER_LIMITS.lore} onChange={e=>setBotForm({...botForm,lore:e.target.value})} placeholder="History, relationships, facts, and details the character should know"/><CharacterCount value={botForm.lore} max={CHARACTER_LIMITS.lore}/></div></label>
      <label className="form-label form-label-count"><span>Tags</span><div className="field-wrap"><input value={botForm.tags} maxLength={CHARACTER_LIMITS.tags} onChange={e=>setBotForm({...botForm,tags:e.target.value})} placeholder="Anime, Adventure, Romance" /><CharacterCount value={botForm.tags} max={CHARACTER_LIMITS.tags}/></div></label>
      <label className="form-label form-label-count"><span>Image (optional URL)</span><div className="field-wrap"><input value={botForm.image} maxLength={CHARACTER_LIMITS.image} onChange={e=>setBotForm({...botForm,image:e.target.value})} placeholder="https://..." /><CharacterCount value={botForm.image} max={CHARACTER_LIMITS.image}/></div></label>
      <div className="form-label visibility-field"><span>Visibility</span><div className="visibility-options">
        <label className={`visibility-option ${botForm.visibility==="public"?"selected":""}`}><input type="radio" name="visibility" checked={botForm.visibility==="public"} onChange={()=>setBotForm({...botForm,visibility:"public"})}/><strong>Public</strong><small>Appears in Explore and can be used by the community.</small></label>
        <label className={`visibility-option ${botForm.visibility==="private"?"selected":""}`}><input type="radio" name="visibility" checked={botForm.visibility==="private"} onChange={()=>setBotForm({...botForm,visibility:"private"})}/><strong>Private</strong><small>Only visible on your profile.</small></label>
      </div></div>
      {profileMessage && <div className="profile-notice create-bot-notice" role="status">{profileMessage}</div>}
      <div className="create-bot-actions">
        <button type="button" className="secondary-action" onClick={()=>setPreviewBotOpen(true)} disabled={publishingBot}>Preview bot</button>
        <button type="button" className="auth-submit" onClick={saveBot} disabled={publishingBot}>{publishingBot ? (editingBotId ? "Saving..." : "Publishing...") : (editingBotId ? "Save changes" : "Publish bot")}</button>
      </div>
      </div></div>}
      {previewBotOpen&&<div className="overlay preview-overlay" onClick={()=>setPreviewBotOpen(false)}><div className="profile-modal bot-preview-modal" onClick={e=>e.stopPropagation()}>
        <div className="panel-head"><div><h2>Preview</h2><p>This is how the character will appear before you publish it.</p></div><button type="button" onClick={()=>setPreviewBotOpen(false)}><X/></button></div>
        <div className="bot-preview-card">
          <div className="bot-preview-cover">{botForm.image ? <img src={botForm.image} alt="" /> : <div className="bot-placeholder"><Bot size={42}/></div>}</div>
          <div className="bot-preview-body">
            <div className="bot-preview-title"><h3>{botForm.name.trim() || "Character name"}</h3><span>{botForm.visibility==="public" ? "Public" : "Private"}</span></div>
            <p className="bot-preview-description">{botForm.description.trim() || "The character description will appear here."}</p>
            {botForm.tags.trim()&&<div className="tags">{botForm.tags.split(",").map(s=>s.trim()).filter(Boolean).slice(0,8).map(t=><span key={t}>{t}</span>)}</div>}
            <div className="bot-preview-section"><strong>Personality</strong><p>{botForm.personality.trim() || "No personality defined yet."}</p></div>
            <div className="bot-preview-section"><strong>Scenario</strong><p>{botForm.scenario.trim() || "No scenario defined yet."}</p></div>
            <div className="bot-preview-section"><strong>First message</strong><p>{botForm.greeting.trim() || "No greeting defined yet."}</p></div>
          </div>
        </div>
        <div className="create-bot-actions"><button type="button" className="secondary-action" onClick={()=>setPreviewBotOpen(false)}>Back to editing</button><button type="button" className="auth-submit" onClick={()=>{setPreviewBotOpen(false);saveBot();}} disabled={publishingBot}>{editingBotId ? "Save changes" : "Publish bot"}</button></div>
      </div></div>}
    <nav className="mobile-bottom-nav" aria-label="Main navigation">
      <button className={mobileTab==="chats"?"active":""} onClick={()=>{setMobileTab("chats");setProfileView(false)}} aria-label="Seus chats"><MessageCircle size={21}/></button>
      <button className={mobileTab==="home"?"active":""} onClick={()=>{setMobileTab("home");setProfileView(false)}} aria-label="Home"><span className="mobile-home-icon">⌂</span></button>
      <button className={mobileTab==="profile"?"active":""} onClick={()=>void openProfile()} aria-label="My profile"><Users size={21}/></button>
    </nav>
  {settingsOpen&&<div className="overlay" onClick={()=>setSettingsOpen(false)}><div className="settings-modal" onClick={e=>e.stopPropagation()}>
    <div className="panel-head"><div><h2>{t("settings")}</h2><p>Customize your PersonaChat experience.</p></div><button onClick={()=>setSettingsOpen(false)}><X/></button></div>
    <div className="settings-section"><div><h3>{t("appearance")}</h3><p>{t("theme")}</p></div><div className="settings-choice-row">{(["dark","light","system"] as ThemeMode[]).map(v=><button key={v} className={`settings-choice ${theme===v?"selected":""}`} onClick={()=>setTheme(v)}>{t(v)}</button>)}</div></div>
    <div className="settings-section"><div><h3>{t("language")}</h3><p>Choose the interface language.</p></div><select className="settings-select" value={language} onChange={e=>setLanguage(e.target.value as AppLanguage)}><option value="pt">{t("portuguese")}</option><option value="en">{t("english")}</option><option value="es">{t("spanish")}</option><option value="it">{t("italian")}</option><option value="fr">{t("french")}</option></select></div>
    <div className="settings-section"><div><h3>{t("notifications")}</h3><p>{t("notificationsDesc")}</p></div><button className={`toggle ${notifications?"on":""}`} onClick={()=>setNotifications(v=>!v)}><span/></button></div>
    <div className="settings-section"><div><h3>{t("enterSend")}</h3><p>{t("enterSendDesc")}</p></div><button className={`toggle ${enterSends?"on":""}`} onClick={()=>setEnterSends(v=>!v)}><span/></button></div>
    <div className="policy-links"><a href="/policies#terms" target="_blank" rel="noreferrer"><FileText size={15}/> {t("terms")}</a><a href="/policies#privacy" target="_blank" rel="noreferrer"><ShieldAlert size={15}/> {t("privacy")}</a></div>
    <button className="admin-mod-button" onClick={()=>{setSettingsOpen(false);setFeedbackOpen(true)}}>💬 Send feedback</button>
    {isAdminUser&&<><button className="admin-mod-button" onClick={()=>{setSettingsOpen(false);void loadAdminReports()}}><Flag size={16}/> {t("openModeration")}</button><button className="admin-mod-button" onClick={()=>{setSettingsOpen(false);void loadAdminInsights()}}><BarChart3 size={16}/> {t("productReport")}</button></>}
    <button className="auth-submit" onClick={()=>setSettingsOpen(false)}>{t("save")}</button>
  </div></div>}
  </div></>;
}
