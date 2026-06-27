# Friendly Book Summary URLs Design

## Goal

Replace public UUID-based book-summary URLs with admin-curated book slugs and provide a friendly, session-aware editor URL after the slug has been assigned.

## URL model

- Public collection: `/books/{bookSlug}/summaries`.
- Author editor after moderation assigned a slug: `/books/{bookSlug}/my-summary/edit`.
- Before the first review, when the book has no slug yet, the author continues to use `/summaries/{summaryId}/edit`.
- Once a slug exists, the legacy public UUID URL and legacy editor UUID URL permanently redirect to their canonical friendly URLs.
- Database IDs remain unchanged and continue to be used by APIs, foreign keys, audit records, and article anchors.

The editor route is intentionally contextual: the authenticated user and the book identify the unique summary through the existing `book_id + author_user_id` constraint. Different authors can therefore use the same friendly editor URL and receive their own summary.

## Data model

Add nullable `books.slug` with a unique database index. It stays nullable because books without reviewed summaries do not need a public summary URL yet.

Valid slugs:

- contain lowercase Latin letters, digits, and single hyphens;
- begin and end with a letter or digit;
- contain at most 100 characters;
- are globally unique across books.

The slug is manually entered by an administrator. It is not generated from the title. Editing it changes the canonical URL; the previous slug is not retained as an alias in this iteration.

## Moderation workflow

The expanded summary review row displays:

- a required `Красивый URL` field containing the book slug;
- a preview of the resulting public path;
- the immutable canonical summary UUID labelled `ID саммари`;
- for a revision, its separate immutable `ID ревизии` as additional diagnostic information.

The book slug is included in both initial-summary and revision moderation DTOs. Saving either form can update the book slug. Publishing or rejecting a submitted summary requires a valid non-empty slug, ensuring that the friendly editor URL exists after the first moderation decision. Later moderation sessions may edit the same required field.

Slug validation failures and uniqueness conflicts are returned as visible admin-form errors. A failed save prevents the subsequent publish or reject request.

## Routing and compatibility

Book lookup gains a slug-based query alongside ID lookup.

- The public dynamic book-summary route resolves a slug first. If the parameter is an existing book UUID with a slug, it issues a permanent redirect to the slug route.
- The friendly `my-summary/edit` route requires authentication, resolves the book by slug, then loads the current user's summary for that book.
- The legacy UUID editor remains functional for books without a slug. When a slug is present, it permanently redirects to the friendly editor.
- All catalog, matching, and profile links use the slug when it exists. Draft creation may still return the UUID editor before first review.

Public pages expose a canonical URL based on the slug. APIs continue accepting IDs and do not change their resource identity.

## Audit and migration

`books` is already an audited mutable table, so updating `books.slug` must occur inside the existing admin audit context. The migration only adds a non-sensitive column and unique index; no new audit trigger or masking rule is required.

The currently published book with a summary has no slug in existing data. The migration leaves it nullable, and the administrator assigns its slug through the moderation interface before a later moderation action. Until then, its old UUID public URL remains available rather than redirecting.

## Tests

- Migration test for the nullable column and unique index.
- Unit tests for slug normalization/validation, duplicate handling, admin save, and publication/rejection requirements.
- Route tests for slug lookup, friendly current-user editing, and legacy redirects.
- Component tests for the required slug field, summary/revision IDs, error display, and stopping publish/reject when slug persistence fails.
- Existing link tests updated to expect slugs where available and UUID fallback where absent.
- Playwright layout coverage in `e2e/ui-states.spec.ts` because the admin moderation UI gains new visible fields.

## Documentation

Update the technical feature documentation, owner-facing Wiki, and OpenAPI schemas/endpoints affected by the new `bookSlug` moderation field and friendly routes.
