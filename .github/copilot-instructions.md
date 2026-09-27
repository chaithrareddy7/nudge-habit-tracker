# Nudge project guidance

- Use React, TypeScript, Vite, Tailwind CSS, and the existing design tokens/components.
- Keep interactions calm, accessible, mobile-first, and supportive; avoid shame-based copy.
- Use Supabase only through the public anon key and enforce user-scoped RLS. Never add service-role credentials to frontend code.
- Preserve local-first behavior when Supabase environment variables are unavailable.
- Run `npm run build` after application changes.
