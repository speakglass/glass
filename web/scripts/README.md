# Translation Scripts

## Auto-translate PO files

This script automatically translates `.po` files using OpenAI's GPT-4o model.

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env` file in the project root with your OpenAI API key:
```bash
cp .env.example .env
```

3. Add your OpenAI API key to `.env`:
```
OPENAI_API_KEY=sk-your-api-key-here
```

### Usage

#### Step 1: Extract messages from code

```bash
pnpm run lingui:extract
```

This will scan your code for `t` macro calls and extract them into `.po` files.

#### Step 2: Translate missing messages

```bash
pnpm run translate
```

The script will:
1. Show available languages (ko, ja)
2. Ask which languages to translate
3. Ask if you want to translate specific message IDs or all missing ones
4. Automatically translate using OpenAI GPT-4o
5. Save the translations back to the `.po` files

**Interactive prompts:**
- `Which language to translate?`: Enter language code (e.g., `ko`), comma-separated codes (e.g., `ko,ja`), or `all`
- `Translate specific message IDs?`: Leave empty to translate all missing, or enter comma-separated msgids to force re-translate specific ones
- `Batch size for API calls?`: Number of concurrent translations (default: 5)

#### Step 3: Compile translations

```bash
pnpm run lingui:compile
```

This compiles `.po` files into JavaScript for use in the app.

### Example Workflow

```bash
# 1. Extract new messages
pnpm run lingui:extract

# 2. Translate to all languages
pnpm run translate
# > Which language to translate? all
# > Translate specific message IDs? [leave empty]
# > Batch size for API calls? 5

# 3. Compile translations
pnpm run lingui:compile

# 4. Test in development
pnpm run dev
```

### Re-translating Specific Messages

If you want to improve a specific translation:

```bash
pnpm run translate
# > Which language to translate? ko
# > Translate specific message IDs? Ready to get started?
# > Batch size for API calls? 1
```

This will force re-translate only the specified message ID.

### Features

- ✅ **Smart Translation**: Uses GPT-4o with custom prompts for natural, idiomatic translations
- ✅ **Preserves Formatting**: Keeps placeholders (`{0}`, `{name}`) and HTML tags intact
- ✅ **Sync with Source**: Automatically adds new entries and removes obsolete ones
- ✅ **Batch Processing**: Processes multiple translations with rate limiting
- ✅ **Selective Translation**: Only translates missing entries (unless specific IDs are provided)
- ✅ **Language Info**: Reads from `src/lib/supported-languages.ts` for language names

### Cost Estimation

GPT-4o pricing (as of 2024):
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens

For typical UI strings (~50 words each):
- ~30 messages ≈ $0.05-0.10 USD

### Troubleshooting

**Error: No OpenAI API key found**
- Make sure you have a `.env` file with `OPENAI_API_KEY`

**Error: Model not found**
- Check your OpenAI account has access to GPT-4o
- You can change the model in `translate-po.mjs` (line 92)

**Rate limit errors**
- Increase the wait time between batches (line 156)
- Reduce batch size when prompted


