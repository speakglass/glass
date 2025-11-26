# Glass Mobile App

React Native Expo application for Glass language learning platform.

## Setup

1. Install dependencies:
```bash
cd packages/mobile
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API URL
```

3. Start the development server:
```bash
npm start
```

## Development

- **iOS**: Press `i` in the terminal or scan QR code with Camera app
- **Android**: Press `a` in the terminal or scan QR code with Expo Go app
- **Web**: Press `w` in the terminal

## Project Structure

```
packages/mobile/
├── app/                 # Expo Router screens
│   ├── (auth)/         # Authentication screens
│   ├── (app)/          # Main app screens
│   │   └── (tabs)/     # Tab navigation
│   ├── _layout.tsx     # Root layout
│   └── index.tsx       # Entry point
├── contexts/           # React contexts
│   ├── auth-context.tsx
│   └── api-context.tsx
├── lib/                # Utilities
│   ├── storage.ts
│   └── api-config.ts
└── assets/            # Images, fonts, etc.
```

## Key Features

- **Authentication**: Email/password login and signup
- **Onboarding**: Language preference setup
- **Partners**: Browse conversation partners
- **History**: View past conversations
- **Memory**: View learned memories
- **Profile**: User settings and account info

## Shared Code

The app uses the `@glass/shared` package for:
- Type definitions
- API client
- Storage abstractions
- Utilities

## Navigation

The app uses Expo Router with:
- Stack navigation for auth flows
- Tab navigation for main app
- Modal screens for details

## State Management

- **Auth**: React Context + AsyncStorage
- **API Data**: TanStack Query (React Query)
- **Local State**: React hooks

## API Integration

All API calls go through the shared `GlassApiClient`:
- Automatic token management
- Request/response mapping
- Error handling

