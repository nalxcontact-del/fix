export type CharacterType = "real_person" | "existing_character" | "original";

export type Character = {
  id: string;
  type: CharacterType;
  name: string;
  image: string;
  description: string;
  /** Short scene hook shown on discovery/home cards; does not replace the character profile. */
  sceneDescription?: string;
  greeting: string;
  personality: string;
  scenario: string;
  speechStyle?: string;
  lore?: string;
  relationshipDynamics?: string;
  visibility?: "public" | "private";
  exampleMessages: string[];
  creator: string;
  creatorId?: string;
  createdAt?: number;
  updatedAt?: number;
  likes?: number;
  tags: string[];
  qualityScore?: number;
  qualityReady?: boolean;
  qualityHints?: string[];
};

export type Message = {
  id: string;
  sender: "user" | "character";
  text: string;
  createdAt: number;
  edited?: boolean;
  feedback?: "like" | "dislike";
  feedbackTags?: string[];
  feedbackNote?: string;
};

export type Conversation = {
  id: string;
  characterId: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  summary?: string;
  summaryUpdatedAt?: number;
};

export type RelationshipState = {
  familiarity: number;
  trust: number;
  warmth: number;
  respect: number;
  tension: number;
  interactions: number;
  updatedAt: number;
  mood: "calm" | "happy" | "sad" | "irritated" | "guarded" | "excited" | "tired";
  moodIntensity: number;
  chemistry: number;
  approachStage: "stranger" | "familiar" | "warming" | "chemistry";
  /** Relationship is scoped to one roleplay/conversation. */
  conversationId?: string;
};

export type MemoryCategory = "fact" | "preference" | "event" | "person" | "shared_experience" | "promise" | "relationship";

export type Memory = {
  id: string;
  characterId: string;
  conversationId?: string;
  text: string;
  source: "automatic" | "manual";
  category?: MemoryCategory;
  importance?: 1 | 2 | 3 | 4 | 5;
  status?: "active" | "superseded";
  supersedesId?: string;
  messageId?: string;
  createdAt: number;
  updatedAt?: number;
};
