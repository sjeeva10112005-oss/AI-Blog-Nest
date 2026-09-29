# AI BlogNest API (ContentGen)

A RESTful, AI-assisted blog CMS backend built with Node.js, Express, MongoDB/Mongoose, JWT, bcrypt and Google Gemini.

## Features

- JWT authentication with four roles: **admin**, **editor**, **author** and **reader**
- Blog lifecycle: `draft` → `pending` → `scheduled` → `published`, with automatic publishing of scheduled posts
- Slugs, excerpts, cover-image paths, tags, likes and view counts
- Categories, with post counts and safe deletion
- Comments with moderation (`pending` / `approved` / `spam`)
- Search, filtering and pagination
- Per-post and per-author analytics, plus admin platform stats
- AI features (Gemini): blog generation, summarization, quality audit, FAQ, WeatherWise and FitTrack
- Security: helmet, rate limiting, NoSQL-injection sanitization, XSS filtering and request validation
- Centralized error handling and a Jest + Supertest test suite

## Getting started

1. Copy `.env.example` to `.env` and fill in the values. If your MongoDB password contains `@`, `:`, `/`, `?`, `#` or `%`, URL-encode it (for example, `@` becomes `%40`).
2. Install dependencies and start the server:

```bash
npm install
npm run dev          # or: npm start
```

3. Create the first admin account (reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`):

```bash
npm run seed:admin
```

4. If you have data from the first version of the API, run the one-time migration. It is safe to re-run:

```bash
npm run migrate
```

## Scripts

| Script | Purpose |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with nodemon |
| `npm test` | Run tests against an in-memory MongoDB, with Gemini mocked |
| `npm run seed:admin` | Create or promote the admin user |
| `npm run migrate` | Upgrade v1 data (string categories, missing roles and statuses) |
| `npm run seed:demo` | Create one demo user per role and a Thunder Client env with their tokens (`-- --reset` removes them). See `demo/DEMO_SCRIPT.md` |

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `PORT` | no | Default `5000` |
| `MONGO_URI` | yes | MongoDB connection string |
| `JWT_SECRET` | yes | Secret used to sign tokens |
| `JWT_EXPIRES_IN` | no | Default `7d` |
| `GEMINI_API_KEY` | for AI | Google AI Studio key |
| `GEMINI_MODEL` | no | Default `gemini-flash-latest` |
| `GEMINI_FALLBACK_MODEL` | no | Used when the main model is overloaded. Default `gemini-flash-lite-latest` |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | for seeding | Used by `npm run seed:admin` |
| `DNS_SERVERS` | no | DNS servers for `mongodb+srv` lookups when the system resolver fails. Default `8.8.8.8,1.1.1.1` |

## Roles

| Role | Can do |
|---|---|
| reader | Read published posts, like posts, comment (comments wait for moderation), use the summarize, FAQ, WeatherWise and FitTrack AI tools |
| author | Everything a reader can, plus create, edit and delete own posts (draft or pending only), generate AI drafts, and view own stats |
| editor | Everything an author can, plus manage any post, publish or schedule posts, moderate comments, manage categories, and run AI quality audits |
| admin | Everything an editor can, plus manage users and roles and view platform stats |

Self-registration creates a **reader**, or an **author** when `"role": "author"` is sent. Editor and admin roles are granted by an admin.

## API endpoints

All protected routes need an `Authorization: Bearer <token>` header.

### Auth — `/api/auth`
| Method | Path | Access |
|---|---|---|
| POST | `/register` | public |
| POST | `/login` | public; returns `{ token, user }` |
| GET | `/profile` | logged in |
| PUT | `/profile` | logged in |

### Blogs — `/api/blogs`
| Method | Path | Access |
|---|---|---|
| GET | `/?search=&category=&tag=&author=&page=&limit=&sort=newest\|oldest\|popular\|views` | public (published posts only) |
| GET | `/:idOrSlug` | public if published; otherwise the owner or staff |
| GET | `/mine?status=` | author+ |
| GET | `/my-stats` | author+ |
| GET | `/review-queue` | editor, admin |
| POST | `/` | author+ |
| PUT | `/:id` | owner or staff |
| PATCH | `/:id/status` | editor, admin (`{ status, publishAt }`) |
| DELETE | `/:id` | owner or staff |
| POST | `/:id/like` | logged in (toggles the like) |
| GET | `/:id/stats` | owner or staff |

List responses are paginated: `{ data, page, limit, total, pages }`.

### Categories — `/api/categories`
| Method | Path | Access |
|---|---|---|
| GET | `/` | public |
| GET | `/:idOrSlug` | public |
| POST | `/` | editor, admin |
| PUT | `/:id` | editor, admin |
| DELETE | `/:id?reassignTo=<category>` | editor, admin |

### Comments
| Method | Path | Access |
|---|---|---|
| GET | `/api/blogs/:blogId/comments` | public (approved comments, plus your own pending ones) |
| POST | `/api/blogs/:blogId/comments` | logged in |
| GET | `/api/comments?status=pending` | editor, admin |
| PATCH | `/api/comments/:id/status` | editor, admin |
| DELETE | `/api/comments/:id` | comment owner or staff |

### Admin — `/api/admin` (admin only)
| Method | Path |
|---|---|
| GET | `/users?role=&search=&page=&limit=` |
| PATCH | `/users/:id/role` |
| DELETE | `/users/:id` |
| GET | `/stats` |

### AI — `/api/ai` (logged in)
| Method | Path | Body | Access |
|---|---|---|---|
| POST | `/generate-blog` | `{ topic, category?, tone?, length?: short\|medium\|long, status?: draft\|pending }` | author+ |
| POST | `/summarize` | `{ content }` or `{ blogId }` | any |
| POST | `/quality-audit` | `{ content }` or `{ blogId }` | editor, admin |
| POST | `/faq` | `{ topic }`, `{ content }` or `{ blogId }`, plus `count?` | any |
| POST | `/weatherwise` | `{ location, date?, activity?, conditions? }` | any |
| POST | `/fittrack` | `{ goal, fitnessLevel?, daysPerWeek?, minutesPerSession?, equipment? }` | any |

WeatherWise gives general, climate-based guidance and has no live forecast data.

## Testing with Thunder Client or Postman

Import `thunder-client-ai-blognest-api.postman_collection.json` and `thunder-client-env.json`. Log in as each role and paste the tokens into `token` (author), `readerToken`, `editorToken` and `adminToken`.
