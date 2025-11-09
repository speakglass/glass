# Release & Changelog System

This repository uses automated release management with **Release Please** by Google.

## How It Works

### 1. **Commit Convention**

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**

- `feat:` - New feature (bumps MINOR version)
- `fix:` - Bug fix (bumps PATCH version)
- `feat!:` or `BREAKING CHANGE:` - Breaking change (bumps MAJOR version)
- `docs:`, `style:`, `refactor:`, `perf:`, `test:`, `build:`, `ci:`, `chore:`

**Examples:**

```bash
git commit -m "feat(asr): add Whisper integration"
git commit -m "fix(websocket): prevent connection timeout"
git commit -m "feat!: redesign API authentication"
```

### 2. **Automatic Release Process**

1. **Develop**: Make changes and commit using conventional commits
2. **Merge to main**: Push or merge PR to `main` branch
3. **Release Please PR**: A bot automatically creates/updates a release PR with:
   - Version bump (based on commit types)
   - Updated `CHANGELOG.md`
   - Updated version in `pyproject.toml` and `web/package.json`
4. **Review & Merge**: Review the release PR and merge it
5. **GitHub Release**: A new GitHub release is automatically published
6. **Website Update**: The website can fetch the latest changelog via GitHub API

### 3. **Manual Release** (if needed)

To trigger a release manually:

```bash
# Create a tag
git tag v1.0.0
git push origin v1.0.0
```

## Using Changelog on Your Website

The changelog data can be consumed by any website/landing page via GitHub API or the generated `CHANGELOG.md` file.

### Option 1: Fetch from GitHub Releases API (Recommended)

Fetch releases directly from GitHub's public API:

```bash
# Get all releases
curl https://api.github.com/repos/{owner}/{repo}/releases

# Get latest release
curl https://api.github.com/repos/{owner}/{repo}/releases/latest

# With authentication for higher rate limits
curl -H "Authorization: token YOUR_TOKEN" \
  https://api.github.com/repos/{owner}/{repo}/releases
```

**Response format:**

```json
[
  {
    "tag_name": "v1.0.0",
    "name": "v1.0.0",
    "body": "## Features\n* feat: add new feature\n\n## Bug Fixes\n* fix: resolve issue",
    "published_at": "2025-01-01T00:00:00Z",
    "html_url": "https://github.com/owner/repo/releases/tag/v1.0.0",
    "author": {
      "login": "username",
      "avatar_url": "https://...",
      "html_url": "https://github.com/username"
    }
  }
]
```

**JavaScript/TypeScript Example:**

```typescript
async function fetchChangelog() {
  const response = await fetch('https://api.github.com/repos/OWNER/REPO/releases?per_page=10');
  const releases = await response.json();
  return releases;
}
```

### Option 2: Use CHANGELOG.md File

After releases are created, a `CHANGELOG.md` file is automatically generated in the repository root. You can:

- Fetch it via raw GitHub URL: `https://raw.githubusercontent.com/{owner}/{repo}/main/CHANGELOG.md`
- Parse the markdown format
- Display on your website

### Option 3: Create a Backend API Endpoint

If you want caching and more control, create an API endpoint:

```python
# Example Flask/FastAPI endpoint
@app.get("/api/changelog")
async def get_changelog():
    response = requests.get(
        "https://api.github.com/repos/OWNER/REPO/releases",
        headers={"Accept": "application/vnd.github.v3+json"}
    )
    # Cache for 1 hour, transform data, etc.
    return response.json()
```

## Configuration

### Release Please Config

Edit `.github/release-please-config.json` to customize:

- Which commit types appear in changelog
- Version bumping behavior
- Additional files to update versions

### GitHub Token (Optional)

For higher API rate limits (5000 req/hour vs 60 req/hour):

- Create a GitHub Personal Access Token
- Add it as a repository secret: `GITHUB_TOKEN`
- Use in API calls: `Authorization: token YOUR_TOKEN`

## Testing

Test your commit messages:

```bash
# Good
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug"

# Bad (will be rejected by PR validation)
git commit -m "added stuff"
git commit -m "Fixed the thing"
```

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Release Please Documentation](https://github.com/googleapis/release-please)
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Detailed contribution guidelines
