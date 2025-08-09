# Project Change Log

## Fix: Incorrect OpenAI Choice Index (Commit d4b9e33)

**Commit:**  `d4b9e33` – Fix: get the correct response choice from open ai

**File:**  `supabase/functions/send-confirmation/index.ts`

**Severity:**  High (Degraded personalization of onboarding email)

**Problem:** Personalized welcome emails intermittently rendered empty or fallback content, reducing user engagement and polish.

**Root Cause:** Used `data?.choices[1]` while only one choice (index 0) was returned, yielding `undefined` content.

**Fix:** Switched accessor to `data?.choices[0]?.message?.content`.

**Impact:**

- ✅ Consistent personalized email body
- ✅ Eliminated unnecessary fallback
- ✅ Better first-touch experience
- ✅ Reduced log noise

---

## Fix: Lead Not Persisted (Commit b81d917)

**Commit:**  `b81d917` – Fix: call the correct function to save the lead

**File:**  `src/components/LeadCaptureForm.tsx`

**Severity:**  High (Leads were not being stored; data + metrics loss)

**Problem:** Lead submissions did not insert into `leads`; an email function call appeared where the DB insert should have been, and a second email send followed—causing two email attempts and zero persistence.

**Root Cause:** Copy/paste logic error: misplaced email invocation instead of `supabase.from('leads').insert(...)`.

**Fix:** Restored correct insert call and removed the stray early email invocation:

```ts
const { error: insertError } = await supabase.from('leads').insert([
	{
		name: formData.name,
		email: formData.email,
		industry: formData.industry,
	},
]);
```

**Impact:**

- ✅ Leads now stored
- ✅ Duplicate email attempts removed
- ✅ Session ordering (#) meaningful
- ✅ Reduced unnecessary provider usage

---

## Refactor: Improved Loading State UX (Commit a1f1ecc)

**Commit:**  `a1f1ecc` – Refactor: improve the loading state view

**File:**  `src/components/LeadCaptureForm.tsx`

**Severity:**  Moderate (Risk of accidental double submissions and poor feedback)

**Problem:** Users could resubmit while async operations were in progress; lack of clear visual & accessible feedback created uncertainty.

**Root Cause:** No dedicated submission state or blocking UI during async save + email operations.

**Fix:** Added `isSubmitting` state, blocking overlay with spinner + status text, disabled inputs & button, live region for screen readers, and dynamic button content:

```tsx
{isSubmitting && (
	<div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-md z-10">
		<Loader2 className="mr-2 h-5 w-5 animate-spin" />
		<span>Submitting...</span>
	</div>
)}
```

**Impact:**

- ✅ Prevents double submissions
- ✅ Clear real-time feedback
- ✅ Better accessibility (ARIA live region)
- ✅ Consistent pattern for future forms

---

## Refactor: Personalized Success Message (Commit 08d45b5)

**Commit:**  `08d45b5` – Refactor: add more personalization to the success message

**File:**  `src/components/LeadCaptureForm.tsx`

**Severity:**  Low → UX polish (improves delight & clarity)

**Problem:** Post‑submission confirmation was generic, missing an opportunity to reinforce user action and provide contextual feedback (position in session, name acknowledgement, next‑steps guidance).

**Root Cause:** Initial success state focused on functional confirmation only; lacked dynamic personalization fields and structured guidance block.

**Fix:** Enhanced the success view to inject the latest lead's name into the hero heading.

```tsx
<h2 className="text-3xl font-bold text-foreground mb-3">
	Welcome aboard {leads[leads.length - 1].name}! 🎉
</h2>
```

**Impact:**

- ✅ Higher perceived responsiveness & friendliness
- ✅ Establishes pattern for future progressive personalization

---

## Fix: Proper Error Handling on Email Failure (Commit 8683643)

**Commit:**  `8683643` – Fix: return proper error on email failure

**File:**  `supabase/functions/send-confirmation/index.ts`

**Severity:**  Medium (Previously could log success while hiding provider failure)

**Problem:** The email send path always logged a success message even when the underlying provider (`resend`) returned an error object. Downstream clients would optimistically assume the confirmation email was delivered, reducing observability and preventing retry logic from triggering.

**Root Cause:** Missing explicit check of `emailResponse.error`. The code only performed a `console.log` of the whole response. Additionally, the catch block typed the error as `any` and returned `error.message` directly, risking undefined messages and weaker type safety.

**Fix:**

- Added guard: throw if `emailResponse.error` is present.
- Narrowed catch clause to `unknown` and safely derived a `message` string.
- Standardized JSON error payload to `{ error: message }`.

**Key Changes:**

```ts
if (emailResponse.error) throw new Error(emailResponse.error.error);
else console.log("Personalized email sent successfully:", emailResponse);

// ...
} catch (error: unknown) {
	const message = error instanceof Error ? error.message : 'Unknown error';
	console.error("Error in send-confirmation function:", message);
	return new Response(
		JSON.stringify({ error: message }),
		{ status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
	);
}
```

**Impact:**

- ✅ Eliminates false positive "success" logs
- ✅ Allows caller to distinguish success vs failure reliably
- ✅ Safer error typing (`unknown` → explicit refinement)
- ✅ Cleaner, consistent error JSON shape
- ✅ Foundation for client-side retry / telemetry

---

## Refactor: Robust Dual-Step Error Handling (Commit c0e464c)

**Commit:**  `c0e464c` – Refactor: add better error handling on both steps (save and email)

**File:**  `src/components/LeadCaptureForm.tsx`

**Severity:**  High (Improves reliability, diagnosability, and UX resilience)

**Problem:** A single monolithic submit flow blended two asynchronous operations (lead persistence + confirmation email). Failures were logged but not crisply surfaced to the user; the email failure path was indistinguishable from full success. Users received no actionable feedback or retry affordance.

**Root Cause:** Lack of separation between critical (DB insert) and non‑critical (email send) concerns. No structured result objects; errors short‑circuited or were swallowed in nested try/catch blocks. No resend capability for transient email issues.

**Fix:**

- Introduced helper functions `saveLead()` and `sendConfirmationEmail()` returning `{ success, error? }`.
- Added `leadError` (critical) and `emailError` (non‑critical) state channels.
- Implemented `resendEmail()` with guarded state (`isResendingEmail`).
- Added user‑visible `<Alert>` blocks for both failure types with contextual messaging and retry button for email.
- Centralized error normalization via `getErrorMessage()` utility.

**Key Snippet (Result Handling Pattern):**

```ts
// 1. Critical save
const saveResult = await saveLead(formData);
if (!saveResult.success) {
	setLeadError(saveResult.error || 'Failed to save your information.');
	return;
}

// 2. Non-critical email
const emailResult = await sendConfirmationEmail(formData);
if (!emailResult.success) {
	setEmailError(emailResult.error || 'We could not send a confirmation email right now.');
}
```

**Impact:**

- ✅ Clear distinction between blocking vs non‑blocking failures
- ✅ Users see precise cause + retry for email issues
- ✅ Simplified, testable helper units
- ✅ Foundation for analytics on failure modes
- ✅ Better accessibility with explicit status surfacing

---

## Fix: Use Verifiable Sender Domain (Commit e1979c3)

**Commit:**  `e1979c3` – Fix: connect a verifiable email

**File:**  `supabase/functions/send-confirmation/index.ts`

**Severity:**  Low (Deliverability / infrastructure correctness)

**Problem:** Outbound confirmation emails were sent using a domain not under current ownership/verification (`lovable.dev`), risking suppression, SPF/DKIM failures, or sandbox restrictions by the provider (Resend), leading to silent non‑delivery.

**Root Cause:** Placeholder sender domain persisted beyond initial scaffolding; no DNS verification alignment with active account.

**Fix:** Swapped the sender address domain to a controllable, verifiable domain.

**Key Change:**

```diff
- from: "Innovation Community <testing-email@lovable.dev>"
+ from: "Innovation Community <testing-email@desolint.com>"
```

**Impact:**

- ✅ Aligns sender with verified DNS → higher deliverability
