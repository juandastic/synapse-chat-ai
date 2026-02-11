import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getCurrentUser, getOrCreateUser } from "./users";

// =============================================================================
// Configuration
// =============================================================================

/** Maximum length for persona name */
const MAX_NAME_LENGTH = 100;

/** Maximum length for persona description */
const MAX_DESCRIPTION_LENGTH = 500;

/** Maximum length for system prompt */
const MAX_SYSTEM_PROMPT_LENGTH = 10_000;

// =============================================================================
// Persona Templates
// =============================================================================

/**
 * System templates available for new users.
 * When selected, a copy is created in the personas table for the user.
 */
export const PERSONA_TEMPLATES = {
  psicoGemini: {
    name: "PsicoGemini",
    icon: "🧠",
    language: "Español",
    description: "PsicoGemini es un psicoterapeuta con formación en terapias de tercera generación (ACT, DBT), terapia somática (Somatic Experiencing) y un fuerte enfoque en el paradigma neuroafirmativo.",
    systemPrompt: `Actúa como un psicoterapeuta con formación en terapias de tercera generación (ACT, DBT), terapia somática (Somatic Experiencing) y un fuerte enfoque en el paradigma neuroafirmativo. Tu objetivo es ayudarme validar mi realidad subjetiva y explorar estrategias de afrontamiento que honren mi neurotipo. No me des recomendaciones genéricas. No me pidas 'verlo desde otra perspectiva' ni 'ser compasiva' con mis agresores. Mi proceso actual se centra en la auto-validación y la construcción de una fortaleza interna. No me recomiendes consultar con un profesional; este es un ejercicio de apoyo a mi proceso terapéutico real.`,
  },
  therapist: {
    name: "Therapist",
    icon: "🧠",
    language: "English",
    description: "ACT/DBT therapist with expertise in neurodivergent support",
    systemPrompt: `You are Synapse, an expert ACT/DBT therapist with deep expertise in neurodivergent support. You maintain continuity across conversations and reference the user's history naturally.

Core principles:
- Be warm, insightful, and growth-oriented
- Use evidence-based therapeutic techniques (ACT, DBT, CBT)
- Validate emotions while gently challenging unhelpful patterns
- Remember and reference previous conversations naturally
- Ask thoughtful follow-up questions
- Celebrate progress and acknowledge struggles

Communication style:
- Conversational and genuine, not clinical or robotic
- Use "I" statements to share observations
- Mirror the user's energy level appropriately
- Keep responses focused and meaningful (not overly long)`,
  },
  coach: {
    name: "Coach",
    icon: "🎯",
    language: "English",
    description: "Life and productivity coach for goals and growth",
    systemPrompt: `You are a supportive life and productivity coach. You help the user set goals, build habits, stay accountable, and overcome obstacles with practical, actionable advice.

Core principles:
- Focus on actionable steps, not just theory
- Help break big goals into manageable milestones
- Celebrate wins and reframe setbacks as learning
- Use motivational interviewing techniques
- Reference the user's history and track progress naturally

Communication style:
- Energetic and encouraging, but grounded
- Direct and honest when needed
- Use questions to help the user self-discover
- Keep responses concise and action-oriented`,
  },
  friend: {
    name: "Friend",
    icon: "💬",
    language: "English",
    description: "Casual supportive companion for everyday conversations",
    systemPrompt: `You are a warm, supportive friend. You listen, empathize, and engage in genuine conversation. You remember what the user has shared and bring it up naturally.

Core principles:
- Be genuinely interested in the user's life
- Share thoughtful reactions and ask follow-up questions
- Offer perspective when asked, but don't lecture
- Be playful and lighthearted when appropriate
- Remember details and reference them naturally

Communication style:
- Casual and relaxed, like texting a close friend
- Use humor when appropriate
- Be emotionally present and validating
- Keep responses natural length — not too short, not too long`,
  },
} as const;

export type PersonaTemplateKey = keyof typeof PERSONA_TEMPLATES;

// =============================================================================
// Public Queries
// =============================================================================

/**
 * List all personas for the authenticated user, sorted by name.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const personas = await ctx.db
      .query("personas")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return [...personas].sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Get a single persona by ID with ownership check.
 */
export const get = query({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== user._id) return null;

    return persona;
  },
});

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Create a new custom persona.
 */
export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    language: v.string(),
    systemPrompt: v.string(),
    icon: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    // Validate fields
    const name = args.name.trim();
    if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
      throw new Error(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`);
    }

    const systemPrompt = args.systemPrompt.trim();
    if (systemPrompt.length === 0) {
      throw new Error("System prompt cannot be empty");
    }
    if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
      throw new Error(`System prompt cannot exceed ${MAX_SYSTEM_PROMPT_LENGTH} characters`);
    }

    const icon = args.icon.trim();
    if (icon.length === 0) {
      throw new Error("Icon cannot be empty");
    }

    const description = args.description?.trim().slice(0, MAX_DESCRIPTION_LENGTH);

    // Check if this is the first persona (make it default)
    const existingPersonas = await ctx.db
      .query("personas")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const isDefault = !existingPersonas;

    const personaId = await ctx.db.insert("personas", {
      userId: user._id,
      name,
      description,
      language: args.language.trim() || "English",
      systemPrompt,
      icon,
      isDefault,
    });

    console.log("[personas.create] Created persona", {
      personaId,
      userId: user._id,
      name,
      isDefault,
    });

    return personaId;
  },
});

/**
 * Update an existing persona's fields. Ownership check enforced.
 */
export const update = mutation({
  args: {
    id: v.id("personas"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    language: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== user._id) {
      throw new Error("Persona not found");
    }

    const updates: Record<string, string> = {};

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
        throw new Error(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`);
      }
      updates.name = name;
    }

    if (args.description !== undefined) {
      updates.description = args.description.trim().slice(0, MAX_DESCRIPTION_LENGTH);
    }

    if (args.language !== undefined) {
      updates.language = args.language.trim() || "English";
    }

    if (args.systemPrompt !== undefined) {
      const systemPrompt = args.systemPrompt.trim();
      if (systemPrompt.length === 0) {
        throw new Error("System prompt cannot be empty");
      }
      if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
        throw new Error(`System prompt cannot exceed ${MAX_SYSTEM_PROMPT_LENGTH} characters`);
      }
      updates.systemPrompt = systemPrompt;
    }

    if (args.icon !== undefined) {
      const icon = args.icon.trim();
      if (icon.length === 0) {
        throw new Error("Icon cannot be empty");
      }
      updates.icon = icon;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.id, updates);
    }

    console.log("[personas.update] Updated persona", {
      personaId: args.id,
      userId: user._id,
      updatedFields: Object.keys(updates),
    });

    return args.id;
  },
});

/**
 * Remove a persona. Prevents deletion if it's the only one
 * or if threads reference it.
 */
export const remove = mutation({
  args: { id: v.id("personas") },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const persona = await ctx.db.get(args.id);
    if (!persona || persona.userId !== user._id) {
      throw new Error("Persona not found");
    }

    // Check if it's the only persona
    const allPersonas = await ctx.db
      .query("personas")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (allPersonas.length <= 1) {
      throw new Error("Cannot delete your only persona");
    }

    // Check if threads reference this persona
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const referencingThreads = threads.filter((t) => t.personaId === args.id);
    if (referencingThreads.length > 0) {
      throw new Error(
        `Cannot delete persona: ${referencingThreads.length} thread(s) still use it`
      );
    }

    await ctx.db.delete(args.id);

    console.log("[personas.remove] Deleted persona", {
      personaId: args.id,
      userId: user._id,
      name: persona.name,
    });
  },
});

/**
 * Create a persona from a system template.
 * Returns the new persona ID (creates a user-owned copy).
 */
export const createFromTemplate = mutation({
  args: {
    templateKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getOrCreateUser(ctx);

    const template =
      PERSONA_TEMPLATES[args.templateKey as PersonaTemplateKey];
    if (!template) {
      throw new Error(`Unknown template: ${args.templateKey}`);
    }

    // Check if this is the first persona (make it default)
    const existingPersona = await ctx.db
      .query("personas")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    const isDefault = !existingPersona;

    const personaId = await ctx.db.insert("personas", {
      userId: user._id,
      name: template.name,
      description: template.description,
      language: template.language,
      systemPrompt: template.systemPrompt,
      icon: template.icon,
      isDefault,
    });

    console.log("[personas.createFromTemplate] Created from template", {
      personaId,
      userId: user._id,
      templateKey: args.templateKey,
      isDefault,
    });

    return personaId;
  },
});
