# StudyCare AI - Backend

Express.js + TypeScript backend API for StudyCare AI platform.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- OpenAI API key
- Supabase project

### Installation

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment variables**

Create `.env` file:
```env
OPENAI_API_KEY=sk-your-key-here
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key
SUPABASE_ANON_KEY=eyJ...your-anon-key
PORT=5000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=your-secret-key-change-in-production
```

3. **Set up Supabase**
   - Create a project at [supabase.com](https://supabase.com)
   - In SQL Editor, run `../supabase/migrations/001_initial_schema.sql`
   - Run `../supabase/migrations/002_caregiver_relationships.sql`
   - Create storage bucket `studycare-uploads` (Public)

4. **Start development server**
```bash
npm run dev
```

The API will run on `http://localhost:5000`

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration (database, OpenAI, env)
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic
│   ├── middleware/      # Auth, rate limiting, logging
│   ├── types/           # TypeScript types
│   └── utils/           # Cache, metrics
├── dist/                # Compiled JavaScript (generated)
└── package.json
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Run production build

## 📡 API Endpoints

**Base URL**: `http://localhost:5000/api`

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get profile
- `PUT /api/auth/profile` - Update profile

### Chat
- `POST /api/chat/session` - Create chat session
- `POST /api/chat/message` - Send message
- `GET /api/chat/session/:id` - Get session history
- `GET /api/chat/sessions` - List sessions

### Image Analysis
- `POST /api/image/upload` - Upload & analyze image
- `GET /api/image/:sessionId` - Get analysis

### Teacher Dashboard
- `POST /api/teacher/classes` - Create class
- `GET /api/teacher/classes` - List classes
- `GET /api/teacher/classes/:id/students` - Get students
- `GET /api/teacher/classes/:id/stats` - Get activity stats

### Student
- `POST /api/student/join-class` - Join class
- `GET /api/student/classes` - List classes

### Caregiver
- `POST /api/caregiver/link-child` - Link child account
- `GET /api/caregiver/children` - Get linked children
- `GET /api/caregiver/child/:id/activity` - Get child activity
- `DELETE /api/caregiver/unlink/:id` - Unlink child

### Other Features
- `POST /api/voice/transcribe` - Speech-to-text
- `POST /api/voice/synthesize` - Text-to-speech
- `POST /api/pods` - Create study pod
- `POST /api/notes` - Create note
- `POST /api/symptom/check` - Symptom guidance

### Health & Metrics
- `GET /health` - Health check
- `GET /metrics` - Performance metrics

## 🔒 Security Features

- JWT authentication
- Role-based access control (RBAC)
- Rate limiting (100 req/15min general, 5 req/15min auth)
- Security headers (Helmet.js)
- Input validation
- CORS protection

## 🚀 Deployment

### Railway
1. Connect GitHub repository
2. Set root directory to `backend`
3. Add environment variables
4. Deploy

### Render
1. Create new Web Service
2. Connect repository
3. Set root directory to `backend`
4. Build command: `npm install && npm run build`
5. Start command: `npm start`

## 📊 Monitoring

- Health check: `GET /health`
- Metrics: `GET /metrics`

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `PORT` | Server port | No (default: 5000) |
| `NODE_ENV` | Environment | No (default: development) |
| `CORS_ORIGIN` | Allowed CORS origin | Yes (production) |
| `JWT_SECRET` | JWT signing secret | Yes |

## 🐛 Troubleshooting

**"OPENAI_API_KEY not set"**
- Check `.env` file exists
- Verify key is valid


