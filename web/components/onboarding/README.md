# Glass Onboarding Components

## Overview

The onboarding system provides a guided tour for first-time users, introducing key features through an interactive walkthrough.

## Components

### `GlassOnboardingCard`
Custom card component for onboarding steps with Glass AI branding.

## How It Works

1. **Onboarding Trigger**: Automatically starts when a user visits for the first time (before WebSocket connection)
2. **Demo UI**: Shows example suggestions and feedback using mock components
3. **Feature Highlighting**: Uses `nextstepjs` to spotlight specific UI elements
4. **Completion**: On finish, stores completion flag in localStorage and shows the actual StartCall screen

## Tour Steps

Defined in `web/lib/onboarding-tours.tsx`:

1. **Welcome**: Introduction to Glass AI
2. **Suggestions**: Shows how AI suggests responses with pronunciation
3. **Feedback**: Demonstrates contextual feedback
4. **Translation**: Explains quick translation feature
5. **Manual Suggestions**: How to request suggestions on-demand
6. **Ready**: Final recap before starting

## Files

- `GlassOnboardingCard.tsx` - Custom card component
- `../../lib/onboarding-tours.tsx` - Tour step definitions
- `../../components/Chat.tsx` - Main component with demo UI rendering

