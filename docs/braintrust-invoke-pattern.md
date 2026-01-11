# Braintrust Invoke Pattern (Working Example)

This document records the working pattern for calling Braintrust prompts via the SDK.

## Working Code Example

```typescript
import dotenv from 'dotenv';
import { login, invoke, wrapTraced, initLogger } from 'braintrust';

dotenv.config();

const generateSmoothieLabel = wrapTraced(async function generateSmoothieLabel(input) {
  return await invoke({
    projectName: process.env.BRAINTRUST_PROJECT_NAME,
    slug: process.env.BRAINTRUST_POST_SUMMARY_SLUG,
    input: {
      allergens_answer: input.allergens_answer || '',
      boost_answer: input.boost_answer || '',
      company: input.company || '',
      crisis_answer: input.crisis_answer || '',
      customer_name: input.customer_name || '',
      feeling_answer: input.feeling_answer || '',
      ghosted_answer: input.ghosted_answer || '',
      milk_answer: input.milk_answer || '',
      roi_answer: input.roi_answer || '',
      smoothie_vibe_answer: input.smoothie_vibe_answer || '',
      title: input.title || '',
      track_ugc_answer: input.track_ugc_answer || '',
    },
  });
});

(async () => {
  try {
    initLogger({ projectName: process.env.BRAINTRUST_PROJECT_NAME });
    await login({ apiKey: process.env.BRAINTRUST_API_KEY });

    const exampleData = {
      allergens_answer: '',
      boost_answer: 'Power through the afternoon slump',
      company: 'Glossier',
      crisis_answer: 'My boss texts "Did you see this??"',
      customer_name: 'Sarah Chen',
      feeling_answer: 'Need serious energy',
      ghosted_answer: 'Lost count after five',
      milk_answer: '',
      roi_answer: 'Let me pull last quarters report...',
      smoothie_vibe_answer: 'the peanut butter espresso one',
      title: 'Director of Brand Marketing',
      track_ugc_answer: 'My screenshot thumb is always ready',
    };

    const result = await generateSmoothieLabel(exampleData);
    console.log('Generated Smoothie Label:', result);
  } catch (err) {
    console.error('Error:', err);
  }
})();
```

## Environment Variables

```bash
BRAINTRUST_API_KEY=sk-Scjbj7z1huYOSEVXsQL6Xk0euZbnafF4Q6yGlcvV6aBwzx0r
BRAINTRUST_PROJECT_NAME=2025_04 Archive Lead Activation  # Human-readable project name
BRAINTRUST_POST_SUMMARY_SLUG=smoothie-generate-label-b832
```

## Key Requirements

1. **Project Name vs Project ID**:
   - REST API uses `project_id` (UUID like `183dc023-466f-4dd9-8a33-ccfdf798a0e5`)
   - SDK `invoke()` and `initLogger()` use `projectName` (string like `"2026_01 Email Flow"`)

2. **initLogger First**:
   - Must call `initLogger({ projectName })` before any invoke calls
   - This sets up trace logging in Braintrust

3. **login Before invoke**:
   - Must call `await login({ apiKey })` before invoke
   - Authenticates with Braintrust

4. **wrapTraced Pattern**:
   - Wrap your function with `wrapTraced()` for automatic trace logging
   - Function name becomes the trace name in Braintrust

5. **Input Mapping**:
   - Pass all prompt variables in the `input` object
   - Use `|| ''` pattern for optional variables

## API References

- **Braintrust SDK**: https://www.npmjs.com/package/braintrust
- **Braintrust Docs**: https://www.braintrust.dev/docs
- **Dashboard**: https://www.braintrust.dev/app

## Historical Context

During development (2026-01-11), we built a full CLI utility for managing prompts via REST API. The CLI code is preserved in git history but was ultimately not needed - the user prefers to manage prompts directly in the Braintrust UI and just invoke them from code.

Key learnings:
- Braintrust has two APIs: REST (for prompt management) and SDK (for invoking)
- They use different identifiers (project_id vs projectName)
- Prompts must have models assigned either in the prompt or at project level
- AI providers must be configured at the project level before invoke works
