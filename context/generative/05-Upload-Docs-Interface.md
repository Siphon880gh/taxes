Create the interface that uploads files then guides user to return to harness to use AI to sort the files:

Build the Document Sorter panel into the existing Checklist/Tax Pro Costs interface. The design must follow a Minimalist aesthetic, utilizing clean, functional card layouts and responsive containers for a developer-focused experience.  1. File Upload Zone: Create a drag-and-drop area that routes files to sorter/stage/. 2. Status Refresh: Implement a button that triggers a status check for the staging directory. 3. Backend Integration: Ensure all file handling logic communicates with sorter/api.php. 4. User Guidance: Display a clear instruction block prompting the user to execute the document classification skill via Cursor.  The system must support sorting files into the following tax categories: _Last year’s return, _Proof of identity, Deductions, Income - Investments, Income - Rental, Income - Self-employment, and Regulations - Health Insurance. Note: The underscore prefix is required for specific folder ordering.  After file upload, display a persistent reminder to open the codebase in Cursor and invoke the skill tax-document-classification. DO NOT use npx skills command to run the skill.

The file upload tax docs, mention can upload zip or tar too and its folder structure or category structure will be retained. When that's uploaded. the api.php should handle unzipping/untarring the files into stage and retain any folder structures uncompressed

While we keep the app Next, for the upload process we use PHP. We can make sure the PHP can run by having .env.sample for SERVER_URL_UPLOAD_API_PHP. In our case .env set to http://localhost:8888/weng/app/taxes/sorter/api.php. Add CORS headers to api.php so we can cross connect across NextJS port to a PHP port - but do not assume the port numbers. We do not change package.json to add a PHP server runner.


---

NEXT:
Update the upload docs interface so that there's a short note that can be clicked to expanded to a long note:

Weng provides this service for free, so he can’t cover the cost of AI tokens. That’s why this feature guides you to use your own harness and tokens. Other options would be a prompt builder you could copy into ChatGPT or Claude, or an AI integration using your own API key. The API key option would require you to trust that the app doesn’t store or copy your key—something that’s easier to verify in a local app or Chrome extension.

For now, the harness is the most practical choice. If the service becomes commercial and token costs are covered, AI can be integrated directly into the app.