# Vistro - Website Translation Platform

A lightweight translation platform that makes any website multilingual with a simple embed snippet. Auto-detects browser language, caches translations, and serves content instantly.

## Features

- 🌍 **Auto-detection**: Detects visitor browser language automatically
- ⚡ **Smart caching**: Translation memory prevents redundant API calls
- 🔒 **GDPR-friendly**: Privacy-first architecture with transparent data handling
- 🎯 **Simple embed**: Single `<script>` tag integration
- 📊 **Dashboard**: Manage sites, locales, and translation jobs
- 🔐 **Magic link auth**: Passwordless authentication via email
- 💾 **Translation memory**: Reuses cached translations across pages

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, shadcn/ui components
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Routing**: React Router v6
- **Translation**: DeepL API (mock implementation included)
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase CLI (`npm install -g supabase`)
- Supabase account (or use Lovable Cloud)

### Installation

1. **Clone and install dependencies**

```bash
git clone <YOUR_GIT_URL>
cd <PROJECT_NAME>
npm install
```

2. **Configure environment variables**

```bash
cp .env.example .env
```

Fill in your Supabase credentials in `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. **Initialize the database**

Using Supabase CLI:

```bash
# Link to your project
supabase link --project-ref your-project-ref

# Apply schema
supabase db push

# Seed demo data (optional)
supabase db reset --db-url "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

Or manually via psql:

```bash
# Apply schema
psql -h db.your-project.supabase.co -U postgres -d postgres -f supabase/schema.sql

# Seed demo data (optional)
psql -h db.your-project.supabase.co -U postgres -d postgres -f supabase/seed.sql
```

4. **Start development server**

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to view the app.

## Database Schema

### Tables

- **profiles**: User profiles linked to auth.users
- **sites**: Website configurations (domain, owner)
- **site_locales**: Target languages per site
- **translation_jobs**: Translation batch jobs with status tracking
- **translation_segments**: Individual text segment translations
- **translation_memory**: Cached translations (deduplicated by hash)
- **bookings**: Appointment bookings (optional feature)

### Row-Level Security (RLS)

All tables have RLS enabled:

- **profiles**: Users can view/update their own profile
- **sites**: Owners have full CRUD access to their sites
- **site_locales**: Site owners manage their locales
- **translation_jobs/segments/memory**: Site owners can read; writes via service role only (API)
- **bookings**: Users can create bookings; view their own or bookings for their sites

⚠️ **Important**: Translation tables use service role for inserts (server-side only) to prevent client-side abuse.

## How Translation Works

### API Flow (`/api/translate` - to be implemented)

1. **Request**: Client sends `{ siteId, url, html, targetLocales }`
2. **Content extraction**: Fetch HTML or use provided HTML
3. **Segmentation**: Parse HTML into translatable segments
4. **Hashing**: Generate SHA-256 hash for each segment
5. **Cache lookup**: Check `translation_memory` for existing translations
6. **DeepL calls**: Translate cache misses via DeepL API
7. **Cache storage**: Store new translations in `translation_memory`
8. **HTML reconstruction**: Replace original text with translations
9. **Job tracking**: Create `translation_job` and `translation_segments` records

### Mock Implementation

Current codebase includes mock implementations:

- `src/lib/mockTranslate.ts`: Simulates translation API with localStorage caching
- `src/lib/mockDeepL.ts`: Mocks DeepL API responses (adds locale prefix)
- `src/lib/hash.ts`: SHA-256 hashing for segment deduplication

## Deployment

### Vercel Deployment

1. **Connect repository** to Vercel
2. **Configure build settings**:
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`

3. **Set environment variables**:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

4. **Deploy** 🚀

### Supabase Edge Functions

Deploy edge functions for server-side operations:

```bash
supabase functions deploy translate
supabase functions deploy booking
```

Set required secrets:

```bash
supabase secrets set DEEPL_API_KEY=your-deepl-key
```

## Development

### Running Tests

```bash
npm run test
```

### Project Structure

```
src/
├── components/        # React components (UI, layout)
├── hooks/            # Custom React hooks
├── lib/              # Utilities, mock APIs, helpers
├── pages/            # Route pages (Index, Dashboard, etc.)
└── main.tsx          # App entry point

supabase/
├── schema.sql        # Database schema + RLS policies
├── seed.sql          # Demo data
└── functions/        # Edge functions (serverless)
```

## Roadmap / TODOs

- [ ] Implement real DeepL API integration (replace mocks)
- [ ] Add Supabase edge function for `/api/translate`
- [ ] Build embed widget (`/embed/v1.js`) with language switcher
- [ ] Add webhook support for async translation jobs
- [ ] Implement billing (Stripe integration)
- [ ] Add translation quality scores and human review
- [ ] Support file uploads (PDF, DOCX translation)
- [ ] Add team collaboration features
- [ ] SEO optimization (hreflang tags)
- [ ] Advanced caching strategies (CDN integration)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (public) | Yes |
| `DEEPL_API_KEY` | DeepL API key (edge functions only) | No (mock available) |

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT

## Support

For questions or support, contact: support@vistro.com (placeholder)

---

Built with ❤️ using Lovable
