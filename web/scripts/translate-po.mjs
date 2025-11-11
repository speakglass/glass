import fs from 'fs';
import path from 'path';
import { OpenAI } from 'openai';
import readline from 'readline';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import gettext from 'gettext-parser';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Check API key (support both OPENAI_API_KEY and OPENAI_KEY)
const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('Error: No OpenAI API key found in environment variables');
  console.log(
    'Please set either OPENAI_KEY or OPENAI_API_KEY in your .env file:'
  );
  console.log('OPENAI_KEY=your-api-key');
  process.exit(1);
}

// Initialize OpenAI client
const openai = new OpenAI({ apiKey });

// Path to locales directory (top-level, outside src)
const LOCALES_DIR = path.resolve(__dirname, '../locales');
const EN_FILE_PATH = path.join(LOCALES_DIR, 'en.po');

// Get language information from supported-languages.ts file
const getLanguageInfo = () => {
  try {
    const content = fs.readFileSync(
      path.join(__dirname, '../lib/supported-languages.ts'),
      'utf8'
    );
    const match = content.match(
      /export const SUPPORTED_LANGUAGES = (\{[\s\S]*?}) as const;/
    );
    if (!match) {
      console.warn(
        '⚠️ Could not parse supported-languages.ts. Using language codes as names.'
      );
      return {};
    }
    const langObjectStr = match[1];
    const languages = {};
    const langRegex =
      /(\w+):\s*\{\s*name:\s*'([^']*)',\s*native_name:\s*'([^']*)'[^}]*}/g;
    let entry;
    while ((entry = langRegex.exec(langObjectStr)) !== null) {
      const [, code, name, nativeName] = entry;
      languages[code] = { name, nativeName };
    }
    return languages;
  } catch (error) {
    console.warn('⚠️ Error reading supported-languages.ts:', error.message);
    return {};
  }
};

// Get language codes from files in the locales directory
const getAvailableLanguageCodes = () => {
  return fs
    .readdirSync(LOCALES_DIR)
    .filter(
      (file) => file.endsWith('.po') && !['en.po', 'pseudo.po'].includes(file)
    )
    .map((file) => file.replace('.po', ''));
};

// Parse .po file into a structured format
const readPoFile = (filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return gettext.po.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.warn(
        `⚠️ File not found: ${filePath}. A new file will be created.`
      );
      return null;
    }
    throw error;
  }
};

// Save parsed entries back to a .po file
const writePoFile = (filePath, data) => {
  const content = gettext.po.compile(data);
  fs.writeFileSync(filePath, content);
};

// Translate text using OpenAI
async function translateText(text, targetLang, langName) {
  if (!text || text.trim() === '') return '';

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a professional copywriter and localization expert for web applications. Your task is to adapt English UI text for a ${langName}-speaking audience. The goal is maximum naturalness and fluency. It must sound like it was originally written by a native ${langName} speaker, completely avoiding any stiff or literal "translation-ese".

**Key Instructions:**

1.  **Embrace Idiomatic Translation:** This is your top priority. Do not translate word-for-word. Instead, provide a liberal translation that captures the original meaning and intent. Feel free to rephrase and restructure sentences to make them sound natural and fluent to a native ${langName} speaker.

2.  **Preserve Technical Elements:** Placeholders (e.g., \`{name}\`, \`{0}\`) and HTML tags (e.g., \`<strong>\`, \`<0>\`, \`</0>\`) MUST be preserved *exactly* as they appear in the source text.

3.  **Keep Proper Nouns:** Proper nouns like "Glass" must not be translated.

4.  **Output Format:** Provide ONLY the translated text. Do not add explanations or wrap the output in quotes.`,
        },
        {
          role: 'user',
          content: `Translate the following text to ${langName}:\n\n${text}`,
        },
      ],
    });

    let translatedText = response.choices[0]?.message?.content?.trim() || '';
    // Defensive cleanup: remove surrounding quotes if the model adds them anyway
    if (translatedText.startsWith('"') && translatedText.endsWith('"')) {
      translatedText = translatedText.substring(1, translatedText.length - 1);
    }
    return translatedText;
  } catch (error) {
    console.error(`  ❌ API Error during translation: ${error.message}`);
    return text; // Return original text on error to avoid data loss
  }
}

// Process a batch of translations to avoid rate limits
async function processBatch(entries, langCode, langName, batchSize = 5) {
  const translatedEntries = {};
  const batches = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    batches.push(entries.slice(i, i + batchSize));
  }

  for (let i = 0; i < batches.length; i++) {
    console.log(
      `  📦 Processing batch ${i + 1}/${batches.length} for ${langName}...`
    );
    const batch = batches[i];
    const promises = batch.map(async ({ msgid, enMsgstr }) => {
      const translatedMsg = await translateText(enMsgstr, langCode, langName);
      return { msgid, translatedMsg };
    });

    const results = await Promise.all(promises);
    for (const { msgid, translatedMsg } of results) {
      if (translatedMsg) {
        translatedEntries[msgid] = translatedMsg;
      }
    }

    if (i < batches.length - 1) {
      console.log('  ⏳ Waiting to avoid rate limits...');
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  return translatedEntries;
}

// --- MAIN LOGIC ---

function getEntriesToTranslate(enData, targetData, targetMessageIds) {
  const enTranslations = enData.translations[''];
  const targetTranslations = targetData ? targetData.translations[''] : {};
  const entries = [];

  // CASE 1: Specific message IDs are provided. Force re-translation for them.
  if (targetMessageIds && targetMessageIds.length > 0) {
    for (const msgid of targetMessageIds) {
      if (enTranslations[msgid]) {
        const enMsgstr = enTranslations[msgid].msgstr[0] || msgid;
        entries.push({ msgid, enMsgstr });
      } else {
        console.warn(
          `⚠️ Warning: The specified msgid "${msgid}" was not found in the source en.po file.`
        );
      }
    }
    return entries;
  }

  // CASE 2: No specific ID. Find all entries that are missing a translation.
  for (const msgid in enTranslations) {
    if (msgid === '') continue;
    const targetEntry = targetTranslations[msgid];
    // An entry needs translation if it's not in the target file,
    // or if it is but its msgstr is empty.
    const needsTranslation =
      !targetEntry || !targetEntry.msgstr || !targetEntry.msgstr[0];
    if (needsTranslation) {
      const enMsgstr = enTranslations[msgid].msgstr[0] || msgid;
      entries.push({ msgid, enMsgstr });
    }
  }

  return entries;
}

function logResults(entriesToTranslate, translatedEntries, langName) {
  console.log(`\n🔍 Translation Results for ${langName}:`);
  const translatedCount = Object.keys(translatedEntries).length;
  if (translatedCount === 0) {
    console.log('  No new translations were made in this run.');
    return;
  }

  entriesToTranslate.forEach(({ msgid, enMsgstr }) => {
    const newTranslation = translatedEntries[msgid];
    if (newTranslation) {
      console.log(`  - msgid: "${msgid}"`);
      console.log(`    - English:  "${enMsgstr}"`);
      console.log(`    - Translated: "${newTranslation}"`);
    }
  });
}

async function main() {
  console.log('--- Lingui PO File Translator ---');

  const languageInfo = getLanguageInfo();
  const enData = readPoFile(EN_FILE_PATH);
  if (!enData) {
    console.error(
      `❌ Critical Error: Could not read source file: ${EN_FILE_PATH}`
    );
    return;
  }
  console.log('✓ Source file (en.po) loaded.');

  const langCodes = getAvailableLanguageCodes();
  console.log(
    `\nAvailable languages: ${
      langCodes.length > 0 ? langCodes.join(', ') : 'None found'
    }`
  );
  if (langCodes.length === 0) return;

  langCodes.forEach((code) => {
    const name = languageInfo[code]?.name || code;
    const nativeName = languageInfo[code]?.nativeName || name;
    console.log(`- ${code}: ${name} (${nativeName})`);
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const question = (query) =>
    new Promise((resolve) => rl.question(query, resolve));

  const langAnswer = await question(
    '\nWhich language to translate? (code, comma-separated, or "all"): '
  );
  let langsToProcess = [];
  if (langAnswer.toLowerCase() === 'all') {
    langsToProcess = langCodes;
  } else {
    langsToProcess = langAnswer.split(',').map((c) => c.trim().toLowerCase());
    const invalid = langsToProcess.filter((c) => !langCodes.includes(c));
    if (invalid.length > 0) {
      console.error(
        `❌ Invalid language codes: ${invalid.join(', ')}. Aborting.`
      );
      rl.close();
      return;
    }
  }

  const messageIdsAnswer = (
    await question(
      'Translate specific message IDs? (comma-separated, leave empty for all missing): '
    )
  ).trim();
  const targetMessageIds = messageIdsAnswer
    ? messageIdsAnswer
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  const batchSize =
    parseInt(await question('Batch size for API calls? (default: 5): ')) || 5;

  rl.close();

  console.log(`\n🚀 Starting translation for: ${langsToProcess.join(', ')}`);

  for (const langCode of langsToProcess) {
    const langName = languageInfo[langCode]?.name || langCode;
    console.log(`\n--- Processing ${langName} (${langCode}) ---`);

    const targetFilePath = path.join(LOCALES_DIR, `${langCode}.po`);
    let targetData = readPoFile(targetFilePath);

    // 1. If target file doesn't exist, create it from the English template.
    if (!targetData) {
      console.log(
        `- File ${langCode}.po not found. Creating a new one from template.`
      );
      targetData = JSON.parse(JSON.stringify(enData));
      targetData.headers.language = langCode;
      // Clear all msgstr values for the new file
      for (const msgid in targetData.translations['']) {
        if (msgid === '') continue;
        targetData.translations[''][msgid].msgstr = [''];
      }
    }

    // 2. Sync target file with en.po: add new entries, remove obsolete ones.
    const enTranslations = enData.translations[''];
    const targetTranslations = targetData.translations[''];

    // Add new entries from en.po that are not in target.po
    for (const msgid in enTranslations) {
      if (!targetTranslations[msgid]) {
        console.log(`- Sync: Adding new msgid to ${langCode}.po: "${msgid}"`);
        targetTranslations[msgid] = JSON.parse(
          JSON.stringify(enTranslations[msgid])
        );
        targetTranslations[msgid].msgstr = ['']; // New entries are untranslated
      }
    }

    // Remove obsolete entries from target.po that are not in en.po
    for (const msgid in targetTranslations) {
      if (msgid !== '' && !enTranslations[msgid]) {
        console.log(
          `- Sync: Removing obsolete msgid from ${langCode}.po: "${msgid}"`
        );
        delete targetTranslations[msgid];
      }
    }

    // 3. Find entries that need translation
    const entriesToTranslate = getEntriesToTranslate(
      enData,
      targetData,
      targetMessageIds
    );

    if (entriesToTranslate.length === 0) {
      console.log('✅ All entries are already translated. Nothing to do.');
      continue;
    }

    console.log(
      `- Found ${entriesToTranslate.length} entries to translate for ${langName}.`
    );

    // 4. Process translations in batches
    const translatedEntries = await processBatch(
      entriesToTranslate,
      langCode,
      langName,
      batchSize
    );

    logResults(entriesToTranslate, translatedEntries, langName);

    // 5. Apply the new translations directly to the targetData object
    for (const msgid in translatedEntries) {
      if (targetTranslations[msgid]) {
        targetTranslations[msgid].msgstr = [translatedEntries[msgid]];
      }
    }

    // Update headers
    targetData.headers['language'] = langCode;

    // 6. Save the updated file
    writePoFile(targetFilePath, targetData);
    console.log(`💾 Successfully saved translations to ${targetFilePath}`);
  }

  console.log('\n\n🎉 All translation tasks completed.');
}

main().catch((err) => {
  console.error('\n❌ An unexpected error occurred:', err);
  process.exit(1);
});
