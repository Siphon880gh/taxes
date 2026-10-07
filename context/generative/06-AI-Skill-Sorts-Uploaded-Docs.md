Create the harness-first skill that sorts the files.

Use highest model for agentic coding (shell script, looking online, and coding) with highest context and max effort: Claude Fable 5.1 with Context 1M and Effort Max OR equivalent

Create .agents/skills/tax-document-classification

It will read the files at a folder pointed to by the user (default is sorter/stage/ if found). It will rename the files if they're generic or hashed, into a filename that is more easily recognizable, eg. Electric Bill - Property 200 - 2026-07-01.pdf

It will place into folders like but not exhaustively:  _Last year’s return, _Proof of identity, Deductions, Income - Investments, Income - Rental, Income - Self-employment, and Regulations - Health Insurance. Note: The underscore prefix is required for specific folder ordering.

Creating the SKILL.md that uses the logic, we have three sources to learn from:
You have three broad sources:
your knowledge
skills directory, eg https://www.skills.sh/ and npx skills directory for tax document classification like some variation of https://www.skills.sh/?q=tax+document+classification
Github repos

GitHub projects, and there are some solid options. The important distinction is that the most mature/reliable repos are general document-management systems that you configure for taxes, while the projects built specifically for tax-document sorting tend to be much newer.
As of October 4, 2026, this is the shortlist I'd take seriously:

| Repository | AI? | Automatic classification/sorting | Tax-specific? | GitHub adoption | My take |
|---|---|---|---|---:|---|
| **Paperless-ngx** | Optional AI + non-LLM ML + rules | ✅ Excellent | Configure it yourself | ~46.2k ⭐ | 🥇 Best overall |
| **TaxHacker** | ✅ LLM | ✅ Expense categorization/extraction | Accounting/tax oriented | ~6.7k ⭐ | 🥈 Best tax/accounting AI project |
| **paperless-gpt** | ✅ LLM/Vision | ✅ Titles, tags, doc types, OCR | Configure tax taxonomy | ~2.7k ⭐ | Excellent AI layer for Paperless |
| **Paperless-AI** | ✅ LLM | ✅ Classification/tagging | Configure tax taxonomy | ~6.0k ⭐ | Popular, but currently unmaintained |
| **Papermerge** | ❌ LLM | OCR + folders/types/tags | No | ~2.9k ⭐ | Good traditional DMS |
| **Docspell** | ML/NLP, not LLM | ✅ Learns tags/metadata | No | ~2.3k ⭐ | Mature alternative |
| **Teedy** | ❌ LLM | OCR + workflows/tags | No | ~2.6k ⭐ | Good no-AI document archive |
| **tax-doc-classifier** | Non-LLM decision model | ✅ Recognizes IRS forms | ✅ Very tax-specific | ~454 ⭐ | Very interesting classifier component |
| **ReceiptHero** | ✅ AI | ✅ Receipt fields/categories | Expense-focused | ~387 ⭐ | Useful component, not full tax organizer |
| **tax-organizer** | ✅ Claude Code | ✅ Creates tax folders/reports | ✅ Extremely tax-specific | ~20 ⭐ | Exactly your concept, but too new to call trusted |

You may need to create deterministic code to read PDF for text via OCR, docx, etc. You may need to invoke vision capabilities of the model (your SKILL.md) would mention to read any document where the text can't be OCR'd. Those deterministic code the SKILL.md could run.