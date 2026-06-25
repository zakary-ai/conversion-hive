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

export const OBJECTIONS: ObjectionTemplate[] = [
  {
    id: "busy",
    objection: "I'm busy right now",
    response:
      "Totally get it — I'll be 60 seconds, and if it's not relevant I'll get off the phone. Fair?",
  },
  {
    id: "happy",
    objection: "We're already working with someone",
    response:
      "That's great to hear — most of our best clients had someone before us too. We don't replace them, we just fill the gap they're missing. Worth 10 minutes to see if there's overlap?",
  },
  {
    id: "send-info",
    objection: "Just send me some info",
    response:
      "Happy to — what's the best email? And honestly, the info only makes sense once I know what {company} is actually trying to fix. Quick 2 questions and I'll send exactly what's relevant?",
  },
  {
    id: "not-interested",
    objection: "Not interested",
    response:
      "Fair enough — can I ask, is it the timing, or the type of service? I don't want to keep bugging you if it's truly not a fit.",
  },
  {
    id: "price",
    objection: "How much does it cost?",
    response:
      "Good question — it depends on the size of the property and how aggressive you want to go. That's exactly what the 15-min call covers, so I can quote you accurately instead of guessing.",
  },
  {
    id: "decision",
    objection: "I need to talk to my partner / boss",
    response:
      "Makes sense — let's get them on the call too. Worst case they say no, best case you've got a second opinion. When's good for both of you this week?",
  },
];

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
