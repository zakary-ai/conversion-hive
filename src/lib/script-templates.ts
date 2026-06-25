// Static script + SMS templates surfaced inside the lead drawer.
// Placeholder syntax: {name}, {firstName}, {company}, {setter} — anything else
// is left literal. Will be moved into the DB / admin editor later.

export type ScriptTemplate = { id: string; title: string; body: string };
export type ObjectionTemplate = { id: string; objection: string; response: string };
export type SmsTemplate = { id: string; label: string; body: string };

export const CALL_SCRIPTS: ScriptTemplate[] = [
  {
    id: "opener",
    title: "1. Opener",
    body:
      "I was just wondering how much it costs to get a full kitchen remodel?\n\n(they respond)",
  },
  {
    id: "pivot",
    title: "2. Pivot",
    body:
      "Ok sounds good, I actually have a few people looking to get their kitchen remodeled, are you looking to take on more work?\n\n(they respond)",
  },
  {
    id: "offer",
    title: "3. The offer",
    body:
      "Ok cool, and if I guaranteed you an additional 20 warm leads in the next 30 days do you feel that would benefit your business?\n\n(they respond)",
  },
  {
    id: "book",
    title: "4. Book the Zoom",
    body:
      "Ok awesome — to see if working together would be a good fit, I'd like to schedule you for a quick Zoom meeting. What time later today would work best for you?\n\n(they respond)\n\n(book them on the calendar, and wish them good luck)",
  },
];

// Mindset reminders shown above the objection list.
export const OBJECTION_PRINCIPLES: { title: string; body: string }[] = [
  {
    title: "1. Don't react, get curious",
    body:
      "Most objections aren't the real issue. Instead of responding immediately, find out why they're saying it. Think: \"What is making them say that?\"",
  },
  {
    title: "2. Slow down",
    body:
      "When an objection comes up, don't rush to answer it. Pause. Ask a question. Let them explain. The more they talk, the easier the objection becomes.",
  },
  {
    title: "3. Understand before responding",
    body:
      "Your goal is not to \"beat\" the objection — it's to understand it. A prospect who feels understood is far more likely to continue the conversation.",
  },
];

export const OBJECTIONS: ObjectionTemplate[] = [
  {
    id: "already-getting-leads",
    objection: "We're already getting leads.",
    response:
      "What it might mean:\n• They're happy with current results.\n• They're skeptical.\n• They don't see a need right now.\n\nWhat to find out:\n• Are they happy with the quality?\n• Are they happy with the consistency?\n• Do they want to grow further?",
  },
  {
    id: "send-info",
    objection: "Send me some information.",
    response:
      "What it might mean:\n• They want to end the conversation politely.\n• They don't see the value.\n\nWhat to find out:\n• What information are they actually looking for?\n• What would they want to learn from it?",
  },
  {
    id: "not-interested",
    objection: "Not interested.",
    response:
      "What it might mean:\n• Bad timing.\n• Skepticism.\n• Busy.\n• Had a bad experience before.\n\nWhat to find out:\n• Why aren't they interested?\n• What has their experience been with this before?",
  },
  {
    id: "too-busy",
    objection: "We're too busy.",
    response:
      "What it might mean:\n• They genuinely don't have time.\n• They're brushing you off.\n\nWhat to find out:\n• Are they busy because business is great?\n• Or because operations are overwhelming?",
  },
];

// Golden rule callout shown at the bottom of the objections list.
export const OBJECTION_GOLDEN_RULE =
  "Every objection should create a question in your head. Instead of thinking \"How do I answer this?\" think \"What do I need to understand about this?\"";

export const SMS_TEMPLATES: SmsTemplate[] = [
  {
    id: "no-answer",
    label: "No answer",
    body:
      "Hey {firstName}, {setter} here — just tried you. When's a better time to catch you for 5 min about {company}?",
  },
  {
    id: "voicemail-follow",
    label: "Voicemail follow-up",
    body:
      "Hey {firstName}, left you a voicemail — quick idea for {company} that's worth a 10-min look. Easier to text or call back?",
  },
  {
    id: "confirm-booking",
    label: "Confirm booking",
    body:
      "Hey {firstName}, confirming our call — looking forward to it. I'll send the Zoom link beforehand. Reply here if anything changes.",
  },
  {
    id: "reschedule",
    label: "Missed our call",
    body:
      "Hey {firstName}, didn't catch you for our call — totally happens. Want to grab another quick slot this week?",
  },
  {
    id: "warm-followup",
    label: "Warm follow-up",
    body:
      "Hey {firstName} — circling back on what we talked about for {company}. Got a few minutes today or tomorrow to lock in the next step?",
  },
];

export function fillTemplate(
  body: string,
  vars: { name?: string | null; company?: string | null; setter?: string | null },
): string {
  const first = (vars.name ?? "").trim().split(/\s+/)[0] || "there";
  const full = (vars.name ?? "").trim() || "there";
  const company = (vars.company ?? "").trim() || "your team";
  const setter = (vars.setter ?? "").trim() || "";
  return body
    .replace(/\{firstName\}/g, first)
    .replace(/\{name\}/g, full)
    .replace(/\{company\}/g, company)
    .replace(/\{setter\}/g, setter);
}
