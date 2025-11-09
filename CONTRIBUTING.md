# Contributing to Glass

Thank you for your interest in contributing to Glass! This document provides guidelines and instructions for contributing.

## Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This helps us automatically generate changelogs and version numbers.

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature (triggers MINOR version bump)
- **fix**: A bug fix (triggers PATCH version bump)
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (white-space, formatting, etc)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files

### Breaking Changes

To indicate a breaking change (triggers MAJOR version bump), add `!` after the type:

```
feat!: remove support for Python 3.8

BREAKING CHANGE: Python 3.8 is no longer supported
```

Or add `BREAKING CHANGE:` in the footer:

```
feat: update API endpoint structure

BREAKING CHANGE: The /api/v1/chat endpoint has been restructured
```

### Examples

#### New Feature

```
feat(asr): add support for Whisper ASR provider

Added integration with OpenAI's Whisper for speech recognition.
Includes configuration options and fallback handling.
```

#### Bug Fix

```
fix(websocket): prevent connection drops during long sessions

Fixed an issue where WebSocket connections would timeout after
5 minutes of inactivity. Now implements proper keep-alive pings.

Closes #123
```

#### Breaking Change

```
feat!(api): redesign authentication flow

BREAKING CHANGE: The authentication endpoint has moved from
/api/auth to /api/v2/auth and now requires OAuth2 tokens
instead of API keys.
```

#### Documentation

```
docs: update installation instructions for macOS
```

#### Performance Improvement

```
perf(llm): optimize prompt caching for repeated queries
```

## Pull Request Process

1. **Fork and Clone**: Fork the repository and clone your fork locally
2. **Create a Branch**: Create a new branch for your feature/fix
   ```bash
   git checkout -b feat/my-new-feature
   ```
3. **Make Changes**: Make your changes following our code style
4. **Commit**: Use conventional commit messages
   ```bash
   git commit -m "feat(component): add new feature"
   ```
5. **Push**: Push to your fork
   ```bash
   git push origin feat/my-new-feature
   ```
6. **Pull Request**: Open a PR against the `main` branch
   - Fill out the PR template
   - Link any related issues
   - Ensure all checks pass

## Development Setup

### Backend (Python)

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Run the server
python -m glass.app
```

### Frontend (Next.js)

```bash
cd web
npm install
npm run dev
```

## Code Style

### Python

- Follow PEP 8
- Use type hints
- Write docstrings for public functions/classes

### TypeScript/React

- Use TypeScript for all new code
- Follow ESLint rules
- Use functional components with hooks

## Testing

- Write tests for new features
- Ensure existing tests pass
- Aim for good code coverage

## Release Process

Our release process is automated:

1. **Commits**: Use conventional commit messages
2. **PR Creation**: Release Please automatically creates a release PR
3. **Review**: Review the generated changelog and version bump
4. **Merge**: Merge the release PR to trigger a new release
5. **Publish**: GitHub Release is automatically created with changelog

## Getting Help

- Open an issue for bugs or feature requests
- Join our community discussions
- Check existing issues and PRs before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.
