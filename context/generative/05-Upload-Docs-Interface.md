Create the interface that uploads files then guides user to return to harness to use AI to sort the files:

Build the Document Sorter panel into the existing Checklist/Tax Pro Costs interface. The design must follow a Minimalist aesthetic, utilizing clean, functional card layouts and responsive containers for a developer-focused experience.  1. File Upload Zone: Create a drag-and-drop area that routes files to sorter/stage/. 2. Status Refresh: Implement a button that triggers a status check for the staging directory. 3. Backend Integration: Ensure all file handling logic communicates with sorter/api.php. 4. User Guidance: Display a clear instruction block prompting the user to execute the document classification skill via Cursor.  The system must support sorting files into the following tax categories: _Last year’s return, _Proof of identity, Deductions, Income - Investments, Income - Rental, Income - Self-employment, and Regulations - Health Insurance. Note: The underscore prefix is required for specific folder ordering.  After file upload, display a persistent reminder to open the codebase in Cursor and invoke the skill tax-document-classification. DO NOT use npx skills command to run the skill.

The file upload tax docs, mention can upload zip or tar too and its folder structure or category structure will be retained. When that's uploaded. the api.php should handle unzipping/untarring the files into stage and retain any folder structures uncompressed

While we keep the app Next, for the upload process we use PHP. We can make sure the PHP can run by having .env.sample for SERVER_URL_UPLOAD_API_PHP. In our case .env set to http://localhost:8888/weng/app/taxes/sorter/api.php. Add CORS headers to api.php so we can cross connect across NextJS port to a PHP port - but do not assume the port numbers. We do not change package.json to add a PHP server runner.


---

NEXT:
Update the upload docs interface so that there's a short note that can be clicked to expanded to a long note:

Weng provides this service for free and cannot cover the ongoing cost of AI tokens. That's why this Prompt Builder is designed to let users supply their own AI processing resources rather than having the app pay for them. This is also why AI processing isn't integrated directly into the app for a more seamless experience.

There are several ways to accomplish this:

1. **Copy the generated prompt into ChatGPT or Claude:** Users can use their existing AI subscriptions to process the prompt.
2. **Copy the generated prompt into an AI harness like Cursor or Claude Code:** Users can leverage their own AI coding environments and available token allowances.
3. **Provide their own API key:** The app could process prompts directly using the user's API key, with usage billed to the user. However, this requires trusting that the app does not store, log, or copy the key. This is generally easier to verify with a locally running application or a Chrome extension, although neither is inherently secure without reviewing how it handles credentials.

**For now, letting you use your own AI tools is the most practical approach.** It keeps the service free while allowing you to use AI resources you already have access to. This app uses the method best suited to its particular workflow.

If the service eventually becomes commercial and can sustain the cost of AI tokens, AI processing could be integrated directly into the app for a more seamless experience.